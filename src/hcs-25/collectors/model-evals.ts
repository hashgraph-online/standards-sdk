import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { isJsonObject, readString, readSubjectAdditional } from '../signals';
import {
  Hcs25CollectorHttpError,
  isTimeoutError,
  requestJson,
  requestText,
  stripTrailingSlashes,
} from './http';
import type {
  Hcs25CollectContext,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
} from './types';

const HF_API_BASE = 'https://huggingface.co/api';
const HF_DATASETS_BASE = 'https://huggingface.co/datasets';
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_FRONTEND_BASE = 'https://openrouter.ai/api/frontend';
const OPENLM_ARENA_URL = 'https://openlm.ai/chatbot-arena/';
const OPENLLM_DATASET_ID = 'open-llm-leaderboard/results';
const OPENLLM_DATASET_BRANCH = 'main';

const DEFAULT_MODEL_REGISTRIES: readonly string[] = ['openrouter', 'near-ai'];
const OPENROUTER_CATEGORY_SOURCE = 'openrouter:category-rankings';
const HUGGINGFACE_MODEL_INDEX_SOURCE = 'huggingface:model-index';
const HUGGINGFACE_POPULARITY_SOURCE = 'huggingface:popularity';
const CHATBOT_ARENA_SOURCE = 'chatbot-arena:leaderboard';
const OPENLLM_EVAL_SOURCES = ['openllm-leaderboard'];

const MODEL_ID_KEYS = [
  'openrouterModelId',
  'huggingFaceModelId',
  'openrouterHuggingFaceId',
  'modelId',
  'model',
  'name',
] as const;

/**
 * Resolves the subject's model identifier from `metadata.additional` keys
 * (in order) or falls back to `subject.id`.
 */
export function resolveModelId(subject: Hcs25Subject): string | null {
  const additional = readSubjectAdditional(subject);
  for (const key of MODEL_ID_KEYS) {
    const value = readString(additional, key);
    if (value) {
      return value;
    }
  }
  const metadata = subject.metadata ?? {};
  for (const key of MODEL_ID_KEYS) {
    const value = readString(metadata, key);
    if (value) {
      return value;
    }
  }
  return subject.id || null;
}

/**
 * True when two model identifiers refer to the same model: exact match,
 * or one is the `org/` prefixed form of the other.
 */
export function modelIdMatches(candidate: string, wanted: string): boolean {
  const a = candidate.trim().toLowerCase();
  const b = wanted.trim().toLowerCase();
  if (a === b) {
    return true;
  }
  const stripOrg = (id: string): string =>
    id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
  return stripOrg(a) === stripOrg(b);
}

function statusFromError(error: unknown): 'timeout' | 'error' {
  return isTimeoutError(error) ? 'timeout' : 'error';
}

function asRecord(value: unknown): Record<string, Hcs25JsonValue> | undefined {
  return isJsonObject(value as Hcs25JsonValue)
    ? (value as Record<string, Hcs25JsonValue>)
    : undefined;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const encodeModelIdForPath = (modelId: string): string =>
  modelId
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');

// ---------------------------------------------------------------------------
// Shared metric helpers (ported from registry-broker production adapters)
// ---------------------------------------------------------------------------

const METRIC_EXCLUDE_TOKENS = [
  'loss',
  'perplexity',
  'ppl',
  'error',
  'rmse',
  'mae',
  'wer',
  'cer',
  'bits',
];

const METRIC_INCLUDE_TOKENS = [
  'accuracy',
  'acc',
  'exact',
  'em',
  'f1',
  'precision',
  'recall',
  'score',
  'pass',
  'win',
  'bleu',
  'rouge',
  'mmlu',
  'gsm',
  'arc',
  'hellaswag',
  'truthfulqa',
  'gpqa',
  'humaneval',
  'mbpp',
  'swe',
  'math',
  'bbh',
  'ceval',
];

const hasToken = (input: string, tokens: readonly string[]): boolean =>
  tokens.some(token => input.includes(token));

/**
 * Filters metric names like the production adapters: drops error-rate style
 * metrics and keeps the known capability-metric families.
 */
export function shouldIncludeMetric(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (hasToken(normalized, METRIC_EXCLUDE_TOKENS)) {
    return false;
  }
  return hasToken(normalized, METRIC_INCLUDE_TOKENS);
}

/**
 * Normalizes a raw upstream metric to `[0,100]`: values ≤1 are treated as
 * ratios (×100), ≤100 clamp as percentages, anything larger is dropped
 * (returns null).
 */
export function normalizeMetricValue(raw: number): number | null {
  if (!Number.isFinite(raw)) {
    return null;
  }
  if (raw <= 1) {
    return Math.min(100, Math.max(0, raw * 100));
  }
  if (raw <= 100) {
    return Math.min(100, Math.max(0, raw));
  }
  return null;
}

/**
 * Log-scale popularity normalization: `log10(v+1)/log10(max+1)*100`.
 */
export function normalizeLogScore(value: number, max: number): number | null {
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    !Number.isFinite(max) ||
    max <= 0
  ) {
    return null;
  }
  const numerator = Math.log10(value + 1);
  const denominator = Math.log10(max + 1);
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return null;
  }
  return Math.min(100, Math.max(0, (numerator / denominator) * 100));
}

/**
 * Production popularity proxy: log-scaled downloads (cap 10M) and likes
 * (cap 100K), mixed 0.7/0.3.
 */
export function computePopularityScore(
  downloads: number | null,
  likes: number | null,
  downloadsCap = 10_000_000,
  likesCap = 100_000,
): number | null {
  const downloadsScore =
    downloads !== null ? normalizeLogScore(downloads, downloadsCap) : null;
  const likesScore = likes !== null ? normalizeLogScore(likes, likesCap) : null;
  if (downloadsScore === null) {
    return likesScore;
  }
  if (likesScore === null) {
    return downloadsScore;
  }
  return downloadsScore * 0.7 + likesScore * 0.3;
}

interface HuggingFaceModelResponse {
  id?: string;
  downloads?: number;
  likes?: number;
  'model-index'?: unknown;
  model_index?: unknown;
  modelIndex?: unknown;
  cardData?: { 'model-index'?: unknown };
}

/**
 * Extracts normalized model-index metrics from a HF `/api/models/{id}`
 * payload, reading the top-level `model-index` (plus `model_index` /
 * `modelIndex` / `cardData.model-index` fallbacks). Metrics arrive either
 * as an array of `{name|metric|type, value}` or a `Record<name, value>`
 * map; names are filtered by {@link shouldIncludeMetric} and values by
 * {@link normalizeMetricValue}.
 */
export function extractModelIndexMetrics(
  payload: HuggingFaceModelResponse | undefined,
  maxMetrics = 60,
): Array<{ name: string; value: number }> {
  const modelIndex =
    payload?.['model-index'] ??
    payload?.model_index ??
    payload?.modelIndex ??
    payload?.cardData?.['model-index'];
  if (!Array.isArray(modelIndex)) {
    return [];
  }
  const metrics: Array<{ name: string; value: number }> = [];
  for (const entry of modelIndex) {
    const results = asRecord(entry)?.results;
    if (!Array.isArray(results)) {
      continue;
    }
    for (const result of results) {
      const block = asRecord(result)?.metrics;
      const push = (name: unknown, rawValue: unknown): void => {
        const rawName =
          typeof name === 'string' && name.trim() ? name.trim() : null;
        const parsed = parseNumber(rawValue);
        if (!rawName || parsed === null || !shouldIncludeMetric(rawName)) {
          return;
        }
        const normalized = normalizeMetricValue(parsed);
        if (normalized === null) {
          return;
        }
        metrics.push({ name: rawName, value: normalized });
      };
      if (Array.isArray(block)) {
        for (const metric of block) {
          const record = asRecord(metric);
          if (!record) {
            continue;
          }
          const name = record.name ?? record.metric ?? record.type ?? null;
          push(name, record.value);
          if (metrics.length >= maxMetrics) {
            return metrics;
          }
        }
      } else if (block && typeof block === 'object') {
        for (const [name, value] of Object.entries(
          block as Record<string, unknown>,
        )) {
          push(name, value);
          if (metrics.length >= maxMetrics) {
            return metrics;
          }
        }
      }
    }
  }
  return metrics;
}

/**
 * Resolves the canonical Hugging Face model id for a subject: stored
 * `huggingFaceModelId`/`openrouterHuggingFaceId` first, then the
 * OpenRouter `/api/v1/models` `hugging_face_id` link, then a HF search
 * fallback matching the normalized id.
 */
export async function resolveHuggingFaceModelId(
  modelId: string,
  context: Hcs25CollectContext,
  options: {
    huggingFaceApiBase?: string;
    openrouterApiBase?: string;
    token?: string;
  } = {},
): Promise<string | null> {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  // OpenRouter model catalog carries an explicit `hugging_face_id` link.
  try {
    const payload = await requestJson<{
      data?: Array<{ id?: unknown; hugging_face_id?: unknown }>;
    }>(`${options.openrouterApiBase ?? OPENROUTER_API_BASE}/models`, {
      fetch: context.fetch,
      timeoutMs: context.timeoutMs,
      signal: context.signal,
    });
    if (Array.isArray(payload.data)) {
      const match = payload.data.find(entry => {
        const id = typeof entry.id === 'string' ? entry.id.trim() : '';
        return id.toLowerCase() === normalized;
      });
      const hfId =
        match && typeof match.hugging_face_id === 'string'
          ? match.hugging_face_id.trim()
          : '';
      if (hfId) {
        return hfId;
      }
    }
  } catch {
    // fall through to HF search
  }

  // Fallback: HF search over the normalized id.
  try {
    const headers: Record<string, string> = options.token
      ? { authorization: `Bearer ${options.token}` }
      : {};
    const payload = await requestJson<unknown>(
      `${options.huggingFaceApiBase ?? HF_API_BASE}/models?search=${encodeURIComponent(normalized)}`,
      {
        fetch: context.fetch,
        headers,
        timeoutMs: context.timeoutMs,
        signal: context.signal,
      },
    );
    if (Array.isArray(payload)) {
      const match = payload.find(entry => {
        const id = asRecord(entry)?.id;
        return typeof id === 'string' && modelIdMatches(id, normalized);
      });
      const id = asRecord(match)?.id;
      if (typeof id === 'string' && id.trim()) {
        return id.trim();
      }
    }
  } catch {
    // unresolved
  }
  return null;
}

// ---------------------------------------------------------------------------
// OpenRouter category benchmarks
// ---------------------------------------------------------------------------

/**
 * A single category ranking/benchmark entry for one model.
 */
export interface Hcs25OpenRouterEvalRow {
  /** Model identifier or alias. */
  model: string;
  /** Benchmark category (e.g. "coding", "reasoning"). */
  category?: string;
  /** Rank position (1-based) when the source is a ranking. */
  rank?: number;
  /** Total entries ranked in this category (enables percentile). */
  outOf?: number;
  /** Direct score in `[0,100]` when the source provides one. */
  score?: number;
  /** Optional per-row weight (e.g. category volume). Default 1. */
  weight?: number;
}

export interface Hcs25OpenRouterEvalsData {
  rows: readonly Hcs25OpenRouterEvalRow[];
  /**
   * Raw coverage proxy (e.g. summed entry volume). When provided,
   * `low-coverage` is emitted when the summed row weight falls below
   * `lowCoverageThreshold`.
   */
  coverageWeight?: number;
  /** Source identifiers stored in `openrouterEvalSources`. */
  sources?: readonly string[];
  /** Resolved Hugging Face id, persisted as `openrouterHuggingFaceId`. */
  huggingFaceId?: string;
  /** Total categories the source covers (ratio fallback for coverage). */
  totalCategories?: number;
}

/**
 * Fetches OpenRouter-style category benchmark data for a subject. Return
 * null when the source has no data for the model.
 */
export type Hcs25OpenRouterEvalsSource = (
  subject: Hcs25Subject,
  context: Hcs25CollectContext,
) => Promise<Hcs25OpenRouterEvalsData | null>;

/**
 * Options for the `openrouter-evals` signal adapter.
 */
export interface Hcs25OpenRouterEvalsSignalAdapterOptions {
  /** Data source. Default: {@link createOpenRouterBenchmarksSource} (the
   * production OpenRouter endpoint). */
  source?: Hcs25OpenRouterEvalsSource;
  /**
   * Minimum summed row weight before coverage is considered adequate.
   * Default 5 (matching production `minCoverageWeight`).
   */
  lowCoverageThreshold?: number;
  /**
   * Minimum number of covered categories before coverage is considered
   * adequate. Default 1.
   */
  minCategoryCount?: number;
  timeoutMs?: number;
  includeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

/**
 * Creates an OpenRouter evals source that fetches a JSON document shaped
 * `{rows: Hcs25OpenRouterEvalRow[], ...}` from a configured endpoint. For
 * sources with a different shape, wrap `requestJson` in a custom
 * `Hcs25OpenRouterEvalsSource`.
 */
export function createOpenRouterEvalsHttpSource(options: {
  url: string | ((subject: Hcs25Subject) => string | null);
}): Hcs25OpenRouterEvalsSource {
  return async (subject, context) => {
    const url =
      typeof options.url === 'function' ? options.url(subject) : options.url;
    if (!url) {
      return null;
    }
    const data = await requestJson<Hcs25OpenRouterEvalsData>(url, {
      fetch: context.fetch,
      timeoutMs: context.timeoutMs,
      signal: context.signal,
    });
    if (!data || !Array.isArray(data.rows)) {
      return null;
    }
    return data;
  };
}

interface OpenRouterBenchmarkEntry {
  model?: string;
  category?: string;
  rank?: number;
  volume?: number;
  count?: number;
}

const stripDateSuffix = (value: string): string | null => {
  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^(.*?)-(\d{8}|\d{4}-\d{2}-\d{2}|\d{2}-\d{4})$/);
  return match?.[1]?.trim() || null;
};

const buildBenchmarkCandidates = (normalizedId: string): string[] => {
  const candidates = new Set([normalizedId, `${normalizedId}:free`]);
  if (normalizedId.endsWith(':free')) {
    candidates.add(normalizedId.slice(0, -':free'.length));
  }
  return [...candidates];
};

/**
 * Production-shaped OpenRouter benchmarks source: fetches
 * `{frontendBase}/models/find?q=benchmarks`, indexes the per-model
 * `category`/`rank`/`volume` entries with `:free` and date-suffix aliases,
 * and emits rank-percentile rows for the subject's model. When
 * `preferHuggingFace` is set (default true) the subject's
 * `hugging_face_id` (resolved via the OpenRouter `/models` catalog) yields
 * a direct HF model-index score first, matching production precedence.
 */
export function createOpenRouterBenchmarksSource(
  options: {
    openrouterFrontendBaseUrl?: string;
    openrouterApiBaseUrl?: string;
    huggingFaceApiBase?: string;
    /** Benchmarks snapshot cache TTL in ms. Default 24h. */
    cacheTtlMs?: number;
    /** Try the HF model-index score first when an HF id resolves. */
    preferHuggingFace?: boolean;
  } = {},
): Hcs25OpenRouterEvalsSource {
  const frontendBase = stripTrailingSlashes(
    options.openrouterFrontendBaseUrl ?? OPENROUTER_FRONTEND_BASE,
  );
  const apiBase = stripTrailingSlashes(
    options.openrouterApiBaseUrl ?? OPENROUTER_API_BASE,
  );
  const hfBase = stripTrailingSlashes(
    options.huggingFaceApiBase ?? HF_API_BASE,
  );
  const cacheTtlMs = options.cacheTtlMs ?? 24 * 60 * 60 * 1000;
  const preferHuggingFace = options.preferHuggingFace ?? true;
  let cache: {
    fetchedAt: number;
    byModel: Map<string, OpenRouterBenchmarkEntry[]>;
    categoryMaxRank: Map<string, number>;
  } | null = null;

  const loadBenchmarks = async (
    context: Hcs25CollectContext,
  ): Promise<{
    byModel: Map<string, OpenRouterBenchmarkEntry[]>;
    categoryMaxRank: Map<string, number>;
  } | null> => {
    if (cache && Date.now() - cache.fetchedAt < cacheTtlMs) {
      return cache;
    }
    const payload = await requestJson<{
      data?: { categories?: Record<string, OpenRouterBenchmarkEntry[]> };
    }>(`${frontendBase}/models/find?q=benchmarks`, {
      fetch: context.fetch,
      timeoutMs: context.timeoutMs,
      signal: context.signal,
    });
    const categories = payload.data?.categories;
    if (!categories || typeof categories !== 'object') {
      return null;
    }
    const byModel = new Map<string, OpenRouterBenchmarkEntry[]>();
    const categoryMaxRank = new Map<string, number>();
    for (const [model, entries] of Object.entries(categories)) {
      if (!Array.isArray(entries) || entries.length === 0) {
        continue;
      }
      const normalizedModel = model.trim().toLowerCase();
      if (!normalizedModel) {
        continue;
      }
      const registerAlias = (alias: string | null): void => {
        const candidate = alias?.trim().toLowerCase() ?? '';
        if (candidate && !byModel.has(candidate)) {
          byModel.set(candidate, entries);
        }
      };
      byModel.set(normalizedModel, entries);
      const noFree = normalizedModel.endsWith(':free')
        ? normalizedModel.slice(0, -':free'.length)
        : null;
      registerAlias(noFree);
      registerAlias(stripDateSuffix(normalizedModel));
      registerAlias(noFree ? stripDateSuffix(noFree) : null);
      for (const entry of entries) {
        const category =
          typeof entry.category === 'string'
            ? entry.category.trim().toLowerCase()
            : null;
        const rank = parseNumber(entry.rank);
        if (!category || rank === null) {
          continue;
        }
        const currentMax = categoryMaxRank.get(category) ?? 0;
        if (rank > currentMax) {
          categoryMaxRank.set(category, rank);
        }
      }
    }
    cache = { fetchedAt: Date.now(), byModel, categoryMaxRank };
    return cache;
  };

  return async (subject, context) => {
    const modelId = resolveModelId(subject);
    if (!modelId) {
      return null;
    }
    const normalizedId = modelId.trim().toLowerCase();

    // HF-first path (production precedence): resolve hugging_face_id via
    // the OpenRouter catalog, then reuse the HF model-index score.
    let huggingFaceId: string | null = null;
    if (preferHuggingFace) {
      huggingFaceId = await resolveHuggingFaceModelId(modelId, context, {
        openrouterApiBase: apiBase,
        huggingFaceApiBase: hfBase,
      }).catch((): null => null);
      if (huggingFaceId) {
        try {
          const payload = await requestJson<HuggingFaceModelResponse>(
            `${hfBase}/models/${encodeModelIdForPath(huggingFaceId)}`,
            {
              fetch: context.fetch,
              timeoutMs: context.timeoutMs,
              signal: context.signal,
            },
          );
          const metrics = extractModelIndexMetrics(payload);
          if (metrics.length > 0) {
            const score =
              metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
            return {
              rows: [
                {
                  model: modelId,
                  score,
                  weight: metrics.length,
                },
              ],
              coverageWeight: metrics.length,
              sources: [HUGGINGFACE_MODEL_INDEX_SOURCE],
              huggingFaceId,
            };
          }
        } catch {
          // fall through to benchmark rankings
        }
      }
    }

    const snapshot = await loadBenchmarks(context);
    if (!snapshot) {
      return null;
    }
    let entries: OpenRouterBenchmarkEntry[] | undefined;
    for (const candidate of buildBenchmarkCandidates(normalizedId)) {
      entries = snapshot.byModel.get(candidate);
      if (entries?.length) {
        break;
      }
    }
    if (!entries?.length) {
      return null;
    }
    const rows: Hcs25OpenRouterEvalRow[] = [];
    for (const entry of entries) {
      const category =
        typeof entry.category === 'string'
          ? entry.category.trim().toLowerCase()
          : undefined;
      const rank = parseNumber(entry.rank);
      if (!category || rank === null) {
        continue;
      }
      const maxRank = snapshot.categoryMaxRank.get(category);
      if (!maxRank || maxRank <= 0) {
        continue;
      }
      const volume = parseNumber(entry.volume);
      const count = parseNumber(entry.count);
      rows.push({
        model: modelId,
        category,
        rank,
        outOf: maxRank,
        score: ((maxRank - rank + 1) / maxRank) * 100,
        weight: volume && volume > 0 ? volume : count && count > 0 ? count : 1,
      });
    }
    if (rows.length === 0) {
      return null;
    }
    return {
      rows,
      coverageWeight: rows.reduce((sum, row) => sum + (row.weight ?? 1), 0),
      sources: [OPENROUTER_CATEGORY_SOURCE],
      huggingFaceId: huggingFaceId ?? undefined,
    };
  };
}

/**
 * Creates the `openrouter-evals` signal adapter: collects per-category
 * benchmark rows for the subject's model, computes a coverage-weighted
 * score, and stores the `openrouterEval*` fields under
 * `metadata.additional`. `openrouterEvalStatus` is `low-coverage` when the
 * summed row weight or category count falls under the configured floors.
 */
export function createOpenRouterEvalsSignalAdapter(
  options: Hcs25OpenRouterEvalsSignalAdapterOptions = {},
): Hcs25SignalAdapter {
  const lowCoverageThreshold = options.lowCoverageThreshold ?? 5;
  const minCategoryCount = options.minCategoryCount ?? 1;
  const source = options.source ?? createOpenRouterBenchmarksSource();

  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const modelId = resolveModelId(subject);

    let data: Hcs25OpenRouterEvalsData | null = null;
    try {
      data = await source(subject, context);
    } catch (error) {
      if (error instanceof Hcs25CollectorHttpError && error.status === 404) {
        data = null;
      } else {
        return [
          {
            signalId: 'openrouter.evals',
            status: statusFromError(error),
            fields: [
              {
                scope: 'additional',
                values: {
                  openrouterEvalStatus: 'error',
                  openrouterEvalUpdatedAt: now,
                },
              },
            ],
          },
        ];
      }
    }

    const rows =
      data && modelId
        ? data.rows.filter(row => modelIdMatches(row.model, modelId))
        : [];

    if (!data || rows.length === 0) {
      return [
        {
          signalId: 'openrouter.evals',
          status: 'missing',
          fields: [
            {
              scope: 'additional',
              values: {
                openrouterEvalStatus: 'missing',
                openrouterEvalUpdatedAt: now,
                openrouterEvalMetricsCount: 0,
              },
            },
          ],
        },
      ];
    }

    let weightedSum = 0;
    let totalWeight = 0;
    const categoryStats = new Map<
      string,
      { scoreSum: number; weightSum: number }
    >();
    for (const row of rows) {
      const score =
        typeof row.score === 'number'
          ? row.score
          : typeof row.rank === 'number' &&
              typeof row.outOf === 'number' &&
              row.outOf > 0
            ? ((row.outOf - row.rank + 1) / row.outOf) * 100
            : null;
      if (score === null) {
        continue;
      }
      const weight = row.weight ?? 1;
      weightedSum += score * weight;
      totalWeight += weight;
      if (row.category) {
        const existing = categoryStats.get(row.category) ?? {
          scoreSum: 0,
          weightSum: 0,
        };
        existing.scoreSum += score * weight;
        existing.weightSum += weight;
        categoryStats.set(row.category, existing);
      }
    }

    if (totalWeight <= 0) {
      return [
        {
          signalId: 'openrouter.evals',
          status: 'missing',
          fields: [
            {
              scope: 'additional',
              values: {
                openrouterEvalStatus: 'missing',
                openrouterEvalUpdatedAt: now,
              },
            },
          ],
        },
      ];
    }

    const score = Math.min(100, Math.max(0, weightedSum / totalWeight));
    // Coverage proxy: prefer the source's raw weight (e.g. summed volume);
    // otherwise derive a category-coverage ratio.
    const coverageWeight =
      data.coverageWeight ??
      (data.totalCategories && data.totalCategories > 0
        ? categoryStats.size / data.totalCategories
        : totalWeight);
    const status =
      categoryStats.size < minCategoryCount ||
      coverageWeight < lowCoverageThreshold
        ? 'low-coverage'
        : 'ok';
    const topCategories = [...categoryStats.entries()]
      .map(([category, stats]) => ({
        category,
        score:
          (stats.weightSum > 0
            ? Math.min(100, Math.max(0, stats.scoreSum / stats.weightSum))
            : 0) *
          Math.min(1, Math.max(0, stats.weightSum / lowCoverageThreshold)),
        weight: stats.weightSum,
      }))
      .sort((a, b) => b.score - a.score || b.weight - a.weight)
      .slice(0, 5)
      .map(entry => entry.category);

    return [
      {
        signalId: 'openrouter.evals',
        status: 'ok',
        value: score,
        fields: [
          {
            scope: 'additional',
            values: {
              openrouterEvalScore: Math.round(score * 100) / 100,
              openrouterEvalStatus: status,
              openrouterEvalUpdatedAt: now,
              openrouterEvalSources:
                data.sources && data.sources.length > 0
                  ? [...data.sources]
                  : [OPENROUTER_CATEGORY_SOURCE],
              openrouterEvalMetricsCount: rows.length,
              openrouterEvalCategoryCount: categoryStats.size,
              openrouterEvalCoverageWeight:
                Math.round(coverageWeight * 1000) / 1000,
              ...(topCategories.length > 0
                ? { openrouterEvalCategories: topCategories }
                : {}),
              ...(data.huggingFaceId
                ? { openrouterHuggingFaceId: data.huggingFaceId }
                : {}),
            },
          },
        ],
        provenance: {
          source: 'openrouter',
          subjectId: modelId,
          fetchedAt: now,
        },
      },
    ];
  };

  return {
    id: 'openrouter-evals',
    produces: ['openrouter.evals'],
    timeoutMs: options.timeoutMs,
    includeRegistries: options.includeRegistries ?? DEFAULT_MODEL_REGISTRIES,
    appliesTo: options.appliesTo,
    collect,
  };
}

// ---------------------------------------------------------------------------
// Chatbot Arena (preference leaderboard)
// ---------------------------------------------------------------------------

/**
 * One leaderboard entry.
 */
export interface Hcs25LeaderboardEntry {
  /** Model identifier or display name. */
  model: string;
  /** Elo-like rating or score. */
  score: number;
  /** Vote/sample count when available. */
  votes?: number;
  /** Organization/provider label when the source carries it. */
  organization?: string;
}

/**
 * Fetches a leaderboard snapshot for min/max normalization.
 */
export type Hcs25LeaderboardSource = (
  subject: Hcs25Subject,
  context: Hcs25CollectContext,
) => Promise<readonly Hcs25LeaderboardEntry[] | null>;

/**
 * Options for the `chatbot-arena` signal adapter.
 */
export interface Hcs25ChatbotArenaSignalAdapterOptions {
  /** Leaderboard source. Default: {@link createOpenLmArenaSource}. */
  source?: Hcs25LeaderboardSource;
  /** Extra aliases for the subject's model on the leaderboard. */
  aliases?: readonly string[];
  timeoutMs?: number;
  includeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

/**
 * Creates a leaderboard source from a JSON endpoint returning an array (or
 * `{entries|rows|leaderboard: []}`) of objects with configurable key names.
 */
export function createJsonLeaderboardSource(options: {
  url: string;
  modelKey?: string;
  scoreKey?: string;
  votesKey?: string;
}): Hcs25LeaderboardSource {
  const modelKey = options.modelKey ?? 'model';
  const scoreKey = options.scoreKey ?? 'score';
  const votesKey = options.votesKey ?? 'votes';

  return async (_subject, context) => {
    const data = await requestJson<unknown>(options.url, {
      fetch: context.fetch,
      timeoutMs: context.timeoutMs,
      signal: context.signal,
    });
    const record = asRecord(data);
    const rows = Array.isArray(data)
      ? data
      : (record?.entries ?? record?.rows ?? record?.leaderboard);
    if (!Array.isArray(rows)) {
      return null;
    }
    const entries: Hcs25LeaderboardEntry[] = [];
    for (const row of rows) {
      const rowRecord = asRecord(row);
      if (!rowRecord) {
        continue;
      }
      const model = readString(rowRecord, modelKey);
      const score = rowRecord[scoreKey];
      const votes = rowRecord[votesKey];
      if (!model || typeof score !== 'number' || !Number.isFinite(score)) {
        continue;
      }
      entries.push({
        model,
        score,
        votes: typeof votes === 'number' ? votes : undefined,
      });
    }
    return entries;
  };
}

const stripHtmlTags = (html: string): string => {
  // Loop until stable: a single pass over `<<script>` leaves a residual
  // tag fragment behind.
  let current = html;
  for (;;) {
    const next = current.replace(/<[^<>]*>/g, '');
    if (next === current) {
      return next;
    }
    current = next;
  }
};

const decodeHtmlEntities = (html: string): string =>
  html
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, codepoint) => {
      const parsed = Number(codepoint);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return '';
      }
      try {
        return String.fromCodePoint(parsed);
      } catch {
        return '';
      }
    })
    // `&amp;` decodes last so double-escaped sequences (`&amp;lt;`) resolve
    // to the literal text `&lt;`, not `<`.
    .replace(/&amp;/gi, '&');

const normalizeArenaLabel = (value: string): string => {
  const trimmed = value.trim();
  // `Name (suffix)` — take the final parenthesized group without a
  // backtracking-prone `.*` scan.
  const open = trimmed.lastIndexOf('(');
  const base =
    open > 0 && trimmed.endsWith(')') ? trimmed.slice(0, open).trim() : trimmed;
  const suffix =
    open > 0 && trimmed.endsWith(')')
      ? trimmed.slice(open + 1, -1).trim()
      : null;
  const compactSuffix = suffix?.split(/\s+/).join('') ?? '';
  const isDate =
    suffix !== null &&
    (/^20\d{2}-\d{2}-\d{2}$/.test(suffix) ||
      /^20\d{2}\d{2}\d{2}$/.test(compactSuffix));
  const combined = !isDate && suffix ? `${base} ${suffix}` : base;
  const slugged = combined.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  let start = 0;
  let end = slugged.length;
  while (start < end && slugged.charCodeAt(start) === 45) {
    start += 1;
  }
  while (end > start && slugged.charCodeAt(end - 1) === 45) {
    end -= 1;
  }
  return slugged.slice(start, end);
};

const normalizeAlphaNum = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const stripTrailingDateSuffix = (value: string): string | null => {
  const match =
    value
      .trim()
      .toLowerCase()
      .match(/^(.*?)-(20\d{2}-\d{2}-\d{2})$/) ??
    value
      .trim()
      .toLowerCase()
      .match(/^(.*?)-(20\d{2}\d{2})$/);
  return match?.[1]?.trim() || null;
};

/**
 * Production-style arena match keys for a leaderboard label: normalized
 * label, alphanumerics, provider-prefixed forms, chatgpt/gpt aliases,
 * date-suffix and `-latest` expansions.
 */
export function buildArenaMatchKeys(
  label: string,
  organization?: string | null,
): string[] {
  const normalized = normalizeArenaLabel(label);
  const keys = new Set<string>();
  if (!normalized) {
    return [];
  }
  const pushKey = (value: string | null | undefined): void => {
    const candidate = value?.trim() ?? '';
    if (!candidate) {
      return;
    }
    keys.add(candidate);
    keys.add(normalizeAlphaNum(candidate));
  };
  const expandChatGptAliases = (value: string): void => {
    if (value.startsWith('chatgpt-')) {
      pushKey(`gpt-${value.slice('chatgpt-'.length)}`);
    }
    if (value.startsWith('gpt-')) {
      const rest = value.slice('gpt-'.length);
      pushKey(`chatgpt-${rest}`);
      pushKey(`chatgpt-${rest}-latest`);
    }
  };
  const expandDateAliases = (value: string): void => {
    const stripped = stripTrailingDateSuffix(value);
    if (stripped) {
      pushKey(stripped);
      expandChatGptAliases(stripped);
    }
  };

  pushKey(normalized);
  const org = normalizeArenaLabel(organization ?? '');
  if (org) {
    pushKey(`${org}-${normalized}`);
    pushKey(`${org}/${normalized}`);
  }
  expandChatGptAliases(normalized);
  expandDateAliases(normalized);
  if (normalized.endsWith('-latest')) {
    const without = normalized.slice(0, -'-latest'.length);
    pushKey(without);
    expandChatGptAliases(without);
    expandDateAliases(without);
  }
  return [...keys].filter(Boolean);
}

const arenaCandidateKeys = (modelId: string): string[] => {
  const base = modelId
    .trim()
    .toLowerCase()
    .replace(/:free$/i, '');
  const candidates = new Set<string>();
  const add = (value: string): void => {
    const trimmed = value.trim();
    if (trimmed) {
      candidates.add(normalizeArenaLabel(trimmed));
      candidates.add(normalizeAlphaNum(trimmed));
    }
  };
  add(base);
  add(base.replace(/\//g, '-'));
  const withoutFast = base.replace(/-fast$/i, '');
  if (withoutFast !== base) {
    add(withoutFast);
  }
  const stripped = stripTrailingDateSuffix(base);
  if (stripped) {
    add(stripped);
  }
  if (base.startsWith('gpt-')) {
    add(`chatgpt-${base.slice(4)}`);
  }
  if (base.startsWith('chatgpt-')) {
    add(`gpt-${base.slice(8)}`);
  }
  if (base.endsWith('-latest')) {
    add(base.slice(0, -'-latest'.length));
  }
  const orgPrefix = base.includes('/') ? base.split('/')[0] : null;
  if (orgPrefix) {
    const model = base.slice(orgPrefix.length + 1);
    add(`${orgPrefix}-${model}`);
    add(`${orgPrefix}/${model}`);
  }
  return [...candidates].filter(Boolean);
};

/**
 * Scrapes the production OpenLM Chatbot Arena HTML leaderboard
 * (`https://openlm.ai/chatbot-arena/` by default): parses the `sortable`
 * table's `tbody` rows — medal, model label, arena elo, …, organization —
 * and emits `Hcs25LeaderboardEntry` records keyed via
 * {@link buildArenaMatchKeys} label normalization.
 */
export function createOpenLmArenaSource(
  options: {
    url?: string;
    /** Snapshot cache TTL in ms. Default 24h. */
    cacheTtlMs?: number;
  } = {},
): Hcs25LeaderboardSource {
  const url = options.url ?? OPENLM_ARENA_URL;
  const cacheTtlMs = options.cacheTtlMs ?? 24 * 60 * 60 * 1000;
  let cache: { fetchedAt: number; entries: Hcs25LeaderboardEntry[] } | null =
    null;

  return async (_subject, context) => {
    if (cache && Date.now() - cache.fetchedAt < cacheTtlMs) {
      return cache.entries;
    }
    const html = await requestText(url, {
      fetch: context.fetch,
      timeoutMs: context.timeoutMs,
      signal: context.signal,
      headers: { accept: 'text/html' },
    });
    const tableMatch = html.match(
      /<table[^>]*class=sortable[^>]*>.*?<\/table>/is,
    );
    if (!tableMatch) {
      return null;
    }
    const tbodyMatch = tableMatch[0].match(/<tbody[^>]*>(.*?)<\/tbody>/is);
    const tbody = tbodyMatch?.[1];
    if (!tbody) {
      return null;
    }
    const entries: Hcs25LeaderboardEntry[] = [];
    for (const rowMatch of tbody.matchAll(/<tr[^>]*>(.*?)<\/tr>/gis)) {
      const rowHtml = rowMatch[1] ?? '';
      if (!rowHtml) {
        continue;
      }
      const cells = Array.from(rowHtml.matchAll(/<td[^>]*>(.*?)<\/td>/gis)).map(
        match => match[1] ?? '',
      );
      const rawLabelCell = cells[1];
      const rawScoreCell = cells[2];
      const rawOrgCell = cells[8];
      const modelLabel = decodeHtmlEntities(
        stripHtmlTags(rawLabelCell ?? ''),
      ).trim();
      if (!modelLabel) {
        continue;
      }
      const score = parseNumber(
        decodeHtmlEntities(stripHtmlTags(rawScoreCell ?? '')).trim(),
      );
      if (score === null) {
        continue;
      }
      const organization =
        decodeHtmlEntities(stripHtmlTags(rawOrgCell ?? '')).trim() || undefined;
      entries.push({ model: modelLabel, score, organization });
    }
    if (entries.length === 0) {
      return null;
    }
    cache = { fetchedAt: Date.now(), entries };
    return entries;
  };
}

/**
 * Creates the `chatbot-arena` signal adapter: looks up the subject's model
 * on a preference leaderboard (production OpenLM HTML table by default),
 * normalizes its raw Elo-like score against the snapshot min/max, and
 * stores the `chatbotArenaEval*` fields.
 */
export function createChatbotArenaSignalAdapter(
  options: Hcs25ChatbotArenaSignalAdapterOptions = {},
): Hcs25SignalAdapter {
  const source = options.source ?? createOpenLmArenaSource();
  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const modelId = resolveModelId(subject);
    const wanted = new Set<string>();
    for (const id of [modelId, ...(options.aliases ?? [])]) {
      if (!id) {
        continue;
      }
      for (const key of arenaCandidateKeys(id)) {
        wanted.add(key);
      }
      wanted.add(id.trim().toLowerCase());
    }

    let entries: readonly Hcs25LeaderboardEntry[] | null = null;
    try {
      entries = await source(subject, context);
    } catch (error) {
      return [
        {
          signalId: 'chatbot-arena.eval',
          status: statusFromError(error),
        },
      ];
    }

    const entry =
      entries?.find(candidate => {
        if (
          wanted.has(candidate.model.trim().toLowerCase()) ||
          [...wanted].some(id => modelIdMatches(candidate.model, id))
        ) {
          return true;
        }
        const keys = buildArenaMatchKeys(
          candidate.model,
          candidate.organization,
        );
        return keys.some(key => wanted.has(key));
      }) ?? null;

    if (!entries || entries.length === 0 || !entry) {
      return [
        {
          signalId: 'chatbot-arena.eval',
          status: 'missing',
          fields: [
            {
              scope: 'additional',
              values: {
                chatbotArenaEvalStatus: 'missing',
                chatbotArenaEvalUpdatedAt: now,
              },
            },
          ],
        },
      ];
    }

    const scores = entries.map(e => e.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const normalized =
      max > min ? (100 * (entry.score - min)) / (max - min) : 50;

    return [
      {
        signalId: 'chatbot-arena.eval',
        status: 'ok',
        value: Math.round(normalized * 100) / 100,
        fields: [
          {
            scope: 'additional',
            values: {
              chatbotArenaEvalScore: Math.round(normalized * 100) / 100,
              chatbotArenaEvalElo: entry.score,
              chatbotArenaEvalVotes: entry.votes ?? null,
              chatbotArenaEvalStatus: 'ok',
              chatbotArenaEvalUpdatedAt: now,
              chatbotArenaEvalSources: [CHATBOT_ARENA_SOURCE],
            },
          },
        ],
        provenance: {
          source: 'chatbot-arena',
          subjectId: entry.model,
          fetchedAt: now,
        },
      },
    ];
  };

  return {
    id: 'chatbot-arena',
    produces: ['chatbot-arena.eval'],
    timeoutMs: options.timeoutMs,
    includeRegistries: options.includeRegistries ?? DEFAULT_MODEL_REGISTRIES,
    appliesTo: options.appliesTo,
    collect,
  };
}

// ---------------------------------------------------------------------------
// Hugging Face model index + popularity
// ---------------------------------------------------------------------------

/**
 * Options for the `huggingface-model-index` signal adapter.
 */
export interface Hcs25HuggingFaceSignalAdapterOptions {
  /** Hugging Face API base. Default `https://huggingface.co/api`. */
  apiBase?: string;
  /** OpenRouter API base for `hugging_face_id` resolution. */
  openrouterApiBase?: string;
  /** Optional HF token for private/gated models. */
  token?: string;
  /** Download cap for the popularity log-scale. Default 10_000_000. */
  downloadsCap?: number;
  /** Likes cap for the popularity log-scale. Default 100_000. */
  likesCap?: number;
  /** Model-index metric cap. Default 60. */
  maxMetrics?: number;
  /**
   * Resolve a canonical HF id through the OpenRouter catalog plus a HF
   * search fallback when the subject id is not already a HF id. Default
   * true.
   */
  resolveHuggingFaceId?: boolean;
  timeoutMs?: number;
  includeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

/**
 * Creates the `huggingface-model-index` signal adapter: fetches the HF
 * model record, extracts model-index metrics when present (filtered +
 * normalized per the production rules), folds in a downloads/likes
 * popularity proxy (`model-index` 0.8 / `popularity` 0.2 in `mixed` mode),
 * resolves the canonical HF id via OpenRouter/HF search, and stores the
 * `huggingFaceEval*` fields (with `huggingFaceEvalMode` distinguishing the
 * path and `openrouterHuggingFaceId` recorded when resolved via OpenRouter).
 */
export function createHuggingFaceSignalAdapter(
  options: Hcs25HuggingFaceSignalAdapterOptions = {},
): Hcs25SignalAdapter {
  const apiBase = stripTrailingSlashes(options.apiBase ?? HF_API_BASE);

  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const additional = readSubjectAdditional(subject);
    const storedHfId =
      readString(additional, 'huggingFaceModelId') ??
      readString(additional, 'openrouterHuggingFaceId');
    const modelId = resolveModelId(subject);
    if (!modelId && !storedHfId) {
      return [
        {
          signalId: 'huggingface.model_index',
          status: 'missing',
          fields: [
            {
              scope: 'additional',
              values: {
                huggingFaceEvalStatus: 'missing',
                huggingFaceEvalUpdatedAt: now,
              },
            },
          ],
        },
      ];
    }

    try {
      const headers: Record<string, string> = options.token
        ? { authorization: `Bearer ${options.token}` }
        : {};
      let huggingFaceId = storedHfId ?? modelId!;
      let resolvedViaOpenRouter = false;
      if (!storedHfId && options.resolveHuggingFaceId !== false && modelId) {
        const resolved = await resolveHuggingFaceModelId(modelId, context, {
          huggingFaceApiBase: apiBase,
          openrouterApiBase: options.openrouterApiBase,
          token: options.token,
        }).catch((): null => null);
        if (resolved) {
          huggingFaceId = resolved;
          resolvedViaOpenRouter = true;
        }
      }

      const data = await requestJson<HuggingFaceModelResponse>(
        `${apiBase}/models/${encodeModelIdForPath(huggingFaceId)}`,
        {
          fetch: context.fetch,
          headers,
          timeoutMs: context.timeoutMs,
          signal: context.signal,
        },
      );

      const metrics = extractModelIndexMetrics(data, options.maxMetrics ?? 60);
      const modelIndexScore =
        metrics.length > 0
          ? metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length
          : null;

      const downloads = parseNumber(data.downloads);
      const likes = parseNumber(data.likes);
      const popularityScore = computePopularityScore(
        downloads,
        likes,
        options.downloadsCap ?? 10_000_000,
        options.likesCap ?? 100_000,
      );

      let score: number | null = null;
      let mode: string;
      if (modelIndexScore !== null && popularityScore !== null) {
        score = modelIndexScore * 0.8 + popularityScore * 0.2;
        mode = 'mixed';
      } else if (modelIndexScore !== null) {
        score = modelIndexScore;
        mode = 'model-index';
      } else if (popularityScore !== null) {
        score = popularityScore;
        mode = 'popularity';
      } else {
        mode = 'missing';
      }

      const normalized =
        score === null
          ? null
          : Math.round(Math.min(100, Math.max(0, score)) * 100) / 100;
      const sources: string[] = [];
      if (modelIndexScore !== null) {
        sources.push(HUGGINGFACE_MODEL_INDEX_SOURCE);
      }
      if (popularityScore !== null) {
        sources.push(HUGGINGFACE_POPULARITY_SOURCE);
      }

      return [
        {
          signalId: 'huggingface.model_index',
          status: normalized === null ? 'missing' : 'ok',
          value: normalized,
          fields: [
            {
              scope: 'additional',
              values: {
                huggingFaceModelId:
                  typeof data.id === 'string' && data.id.trim()
                    ? data.id
                    : huggingFaceId,
                huggingFaceEvalScore: normalized,
                huggingFaceSignalScore: normalized,
                huggingFaceEvalMetricsCount: metrics.length,
                huggingFaceDownloads: downloads,
                huggingFaceLikes: likes,
                huggingFaceEvalMode: mode,
                huggingFaceEvalStatus: normalized === null ? 'missing' : 'ok',
                huggingFaceEvalUpdatedAt: now,
                huggingFaceEvalSources: sources,
                ...(resolvedViaOpenRouter
                  ? { openrouterHuggingFaceId: huggingFaceId }
                  : {}),
              },
            },
          ],
          provenance: {
            source: 'huggingface',
            sourceUrl: `${apiBase}/models/${encodeModelIdForPath(huggingFaceId)}`,
            subjectId: huggingFaceId,
            fetchedAt: now,
          },
        },
      ];
    } catch (error) {
      const missing =
        error instanceof Hcs25CollectorHttpError && error.status === 404;
      return [
        {
          signalId: 'huggingface.model_index',
          status: missing ? 'missing' : statusFromError(error),
          fields: [
            {
              scope: 'additional',
              values: {
                huggingFaceEvalStatus: missing ? 'missing' : 'error',
                huggingFaceEvalUpdatedAt: now,
              },
            },
          ],
        },
      ];
    }
  };

  return {
    id: 'huggingface-model-index',
    produces: ['huggingface.model_index'],
    timeoutMs: options.timeoutMs,
    includeRegistries: options.includeRegistries ?? DEFAULT_MODEL_REGISTRIES,
    appliesTo: options.appliesTo,
    collect,
  };
}

// ---------------------------------------------------------------------------
// Open LLM leaderboard
// ---------------------------------------------------------------------------

/**
 * A leaderboard dataset row: a model identifier plus named metric values.
 */
export interface Hcs25OpenLlmRow {
  model: string;
  metrics: Record<string, number>;
}

export type Hcs25OpenLlmSource = (
  subject: Hcs25Subject,
  context: Hcs25CollectContext,
) => Promise<readonly Hcs25OpenLlmRow[] | null>;

/**
 * Options for the `openllm-leaderboard` signal adapter.
 */
export interface Hcs25OpenLlmSignalAdapterOptions {
  /** Leaderboard data source. Default:
   * {@link createOpenLlmHuggingFaceSource}. */
  source?: Hcs25OpenLlmSource;
  timeoutMs?: number;
  includeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

/**
 * Creates an OpenLLM source that reads rows from a JSON endpoint returning
 * `[{model: string, <metric>: number, ...}]` (or `{rows: [...]}`). Metric
 * keys are every numeric field besides the model key.
 */
export function createOpenLlmJsonSource(options: {
  url: string;
  modelKey?: string;
}): Hcs25OpenLlmSource {
  const modelKey = options.modelKey ?? 'model';
  return async (_subject, context) => {
    const data = await requestJson<unknown>(options.url, {
      fetch: context.fetch,
      timeoutMs: context.timeoutMs,
      signal: context.signal,
    });
    const record = asRecord(data);
    const rows = Array.isArray(data) ? data : record?.rows;
    if (!Array.isArray(rows)) {
      return null;
    }
    const out: Hcs25OpenLlmRow[] = [];
    for (const row of rows) {
      const rowRecord = asRecord(row);
      if (!rowRecord) {
        continue;
      }
      const model = readString(rowRecord, modelKey);
      if (!model) {
        continue;
      }
      const metrics: Record<string, number> = {};
      for (const [key, value] of Object.entries(rowRecord)) {
        const parsed = parseNumber(value);
        if (key !== modelKey && parsed !== null) {
          metrics[key] = parsed;
        }
      }
      out.push({ model, metrics });
    }
    return out;
  };
}

const tokenizeForSimilarity = (value: string): Set<string> =>
  new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 1),
  );

const jaccardSimilarity = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  return intersection / (a.size + b.size - intersection);
};

/**
 * Production Open LLM leaderboard source: resolves the subject's HF model
 * directory inside the `open-llm-leaderboard/results` HF dataset
 * (`/api/datasets/{id}/tree/{branch}/{org}/{repo}`), picks the latest
 * `results_*.json`, fetches it via `/datasets/{id}/resolve/{branch}/{path}`
 * and extracts `payload.results` metrics. When the exact `org/repo` tree
 * path is absent, falls back to a Jaccard-similarity match across the org's
 * top-level directories (production parity).
 */
export function createOpenLlmHuggingFaceSource(
  options: {
    huggingFaceApiBase?: string;
    huggingFaceDatasetsBase?: string;
    datasetId?: string;
    datasetBranch?: string;
    /** Path cache TTL in ms. Default 24h. */
    cacheTtlMs?: number;
    /** Minimum Jaccard similarity for org-directory fallback. Default 0.6. */
    minSimilarity?: number;
  } = {},
): Hcs25OpenLlmSource {
  const apiBase = stripTrailingSlashes(
    options.huggingFaceApiBase ?? HF_API_BASE,
  );
  const datasetsBase = stripTrailingSlashes(
    options.huggingFaceDatasetsBase ?? HF_DATASETS_BASE,
  );
  const datasetId = options.datasetId ?? OPENLLM_DATASET_ID;
  const branch = options.datasetBranch ?? OPENLLM_DATASET_BRANCH;
  const cacheTtlMs = options.cacheTtlMs ?? 24 * 60 * 60 * 1000;
  const minSimilarity = options.minSimilarity ?? 0.6;
  const pathCache = new Map<
    string,
    { path: string | null; fetchedAt: number }
  >();
  const orgCache = new Map<string, { paths: string[]; fetchedAt: number }>();

  const listTree = async (
    context: Hcs25CollectContext,
    path: string,
  ): Promise<Array<{ path?: string }>> => {
    const url = `${apiBase}/datasets/${datasetId}/tree/${branch}/${encodeModelIdForPath(path)}`;
    const payload = await requestJson<Array<{ path?: string }>>(url, {
      fetch: context.fetch,
      timeoutMs: context.timeoutMs,
      signal: context.signal,
    });
    return Array.isArray(payload) ? payload : [];
  };

  const latestResultsPath = async (
    context: Hcs25CollectContext,
    dir: string,
  ): Promise<string | null> => {
    const candidates = (await listTree(context, dir))
      .map(entry => (typeof entry.path === 'string' ? entry.path : ''))
      .filter(path => path.includes('results_') && path.endsWith('.json'));
    return candidates.length > 0 ? (candidates.sort().at(-1) ?? null) : null;
  };

  const resolveViaOrg = async (
    context: Hcs25CollectContext,
    huggingFaceId: string,
  ): Promise<string | null> => {
    const slashIndex = huggingFaceId.indexOf('/');
    if (slashIndex <= 0 || slashIndex === huggingFaceId.length - 1) {
      return null;
    }
    const org = huggingFaceId.slice(0, slashIndex);
    const repo = huggingFaceId.slice(slashIndex + 1);
    if (!org || !repo) {
      return null;
    }
    const orgKey = org.toLowerCase();
    let paths: string[];
    const cached = orgCache.get(orgKey);
    if (cached && Date.now() - cached.fetchedAt < cacheTtlMs) {
      paths = cached.paths;
    } else {
      try {
        paths = (await listTree(context, org))
          .map(entry => (typeof entry.path === 'string' ? entry.path : ''))
          .filter(
            path =>
              path.startsWith(`${org}/`) &&
              !path.slice(org.length + 1).includes('/') &&
              path.slice(org.length + 1).length > 0,
          );
      } catch {
        return null;
      }
      orgCache.set(orgKey, { paths, fetchedAt: Date.now() });
    }
    if (paths.length === 0) {
      return null;
    }
    const targetTokens = tokenizeForSimilarity(repo);
    let bestPath: string | null = null;
    let bestSimilarity = 0;
    for (const path of paths) {
      const candidateRepo = path.slice(org.length + 1);
      const similarity = jaccardSimilarity(
        targetTokens,
        tokenizeForSimilarity(candidateRepo),
      );
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestPath = path;
      }
    }
    if (!bestPath || bestSimilarity < minSimilarity) {
      return null;
    }
    try {
      return await latestResultsPath(context, bestPath);
    } catch {
      return null;
    }
  };

  const resolveResultsPath = async (
    context: Hcs25CollectContext,
    huggingFaceId: string,
  ): Promise<string | null> => {
    const key = huggingFaceId.toLowerCase();
    const cached = pathCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < cacheTtlMs) {
      return cached.path;
    }
    let path: string | null = null;
    try {
      path = await latestResultsPath(context, huggingFaceId);
    } catch {
      path = null;
    }
    if (!path) {
      path = await resolveViaOrg(context, huggingFaceId);
    }
    pathCache.set(key, { path, fetchedAt: Date.now() });
    return path;
  };

  return async (subject, context) => {
    const additional = readSubjectAdditional(subject);
    const huggingFaceId =
      readString(additional, 'huggingFaceModelId') ??
      readString(additional, 'openrouterHuggingFaceId') ??
      resolveModelId(subject);
    if (!huggingFaceId) {
      return null;
    }
    const resultPath = await resolveResultsPath(context, huggingFaceId);
    if (!resultPath) {
      return null;
    }
    const url = `${datasetsBase}/${datasetId}/resolve/${branch}/${resultPath}`;
    const payload = await requestJson<Record<string, unknown>>(url, {
      fetch: context.fetch,
      timeoutMs: context.timeoutMs,
      signal: context.signal,
    });
    const results = asRecord(payload)?.results;
    if (!isJsonObject(results)) {
      return null;
    }
    const metrics: Record<string, number> = {};
    for (const groupValue of Object.values(
      results as Record<string, unknown>,
    )) {
      if (!isJsonObject(groupValue as Hcs25JsonValue)) {
        continue;
      }
      for (const [name, rawValue] of Object.entries(
        groupValue as Record<string, unknown>,
      )) {
        const normalizedName = name.trim().toLowerCase();
        if (
          !normalizedName ||
          normalizedName.includes('stderr') ||
          normalizedName === 'alias'
        ) {
          continue;
        }
        const value = parseNumber(rawValue);
        if (value === null || !shouldIncludeMetric(normalizedName)) {
          continue;
        }
        // Store the raw value; the adapter applies normalizeMetricValue.
        metrics[name] = value;
      }
    }
    if (Object.keys(metrics).length === 0) {
      return null;
    }
    return [{ model: huggingFaceId, metrics }];
  };
}

/**
 * Creates the `openllm-leaderboard` signal adapter: finds the subject's
 * model on the Open LLM leaderboard dataset (production HF-datasets source
 * by default), averages its normalized metric values, and stores the
 * `openLlmEval*` fields.
 */
export function createOpenLlmSignalAdapter(
  options: Hcs25OpenLlmSignalAdapterOptions = {},
): Hcs25SignalAdapter {
  const source = options.source ?? createOpenLlmHuggingFaceSource();
  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const modelId = resolveModelId(subject);
    if (!modelId) {
      return [
        {
          signalId: 'openllm.leaderboard',
          status: 'missing',
          fields: [
            {
              scope: 'additional',
              values: {
                openLlmEvalStatus: 'missing',
                openLlmEvalUpdatedAt: now,
              },
            },
          ],
        },
      ];
    }

    let rows: readonly Hcs25OpenLlmRow[] | null = null;
    try {
      rows = await source(subject, context);
    } catch (error) {
      return [
        {
          signalId: 'openllm.leaderboard',
          status: statusFromError(error),
          fields: [
            {
              scope: 'additional',
              values: {
                openLlmEvalStatus: 'error',
                openLlmEvalUpdatedAt: now,
              },
            },
          ],
        },
      ];
    }

    const row =
      rows?.find(candidate => modelIdMatches(candidate.model, modelId)) ??
      (rows?.length === 1 ? rows[0] : null);

    if (!row) {
      return [
        {
          signalId: 'openllm.leaderboard',
          status: 'missing',
          fields: [
            {
              scope: 'additional',
              values: {
                openLlmEvalStatus: 'missing',
                openLlmEvalUpdatedAt: now,
              },
            },
          ],
        },
      ];
    }

    const values = Object.values(row.metrics)
      .map(normalizeMetricValue)
      .filter((value): value is number => value !== null);
    const score =
      values.length > 0
        ? Math.round(
            (values.reduce((sum, v) => sum + v, 0) / values.length) * 100,
          ) / 100
        : null;

    return [
      {
        signalId: 'openllm.leaderboard',
        status: score === null ? 'missing' : 'ok',
        value: score,
        fields: [
          {
            scope: 'additional',
            values: {
              openLlmEvalScore: score,
              openLlmEvalMetricsCount: values.length,
              openLlmEvalStatus: score === null ? 'missing' : 'ok',
              openLlmEvalUpdatedAt: now,
              openLlmEvalSources: [...OPENLLM_EVAL_SOURCES],
            },
          },
        ],
        provenance: {
          source: 'openllm-leaderboard',
          subjectId: row.model,
          fetchedAt: now,
        },
      },
    ];
  };

  return {
    id: 'openllm-leaderboard',
    produces: ['openllm.leaderboard'],
    timeoutMs: options.timeoutMs,
    includeRegistries: options.includeRegistries ?? DEFAULT_MODEL_REGISTRIES,
    appliesTo: options.appliesTo,
    collect,
  };
}
