import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { readString, readSubjectAdditional } from '../signals';
import { Hcs25CollectorHttpError, isTimeoutError, requestJson } from './http';
import type {
  Hcs25CollectContext,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
} from './types';

const HF_API_BASE = 'https://huggingface.co/api';

const DEFAULT_MODEL_REGISTRIES: readonly string[] = ['openrouter', 'near-ai'];

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
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, Hcs25JsonValue>;
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
  /** Total categories the source covers, for coverage computation. */
  totalCategories?: number;
  /** Coverage proxy such as relative category volume in `[0,1]`. */
  coverageWeight?: number;
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
  /** Data source; required (OpenRouter has no stable public evals API). */
  source: Hcs25OpenRouterEvalsSource;
  /**
   * Category-coverage ratio in `[0,1]` below which the stored status is
   * `low-coverage`. Default 0.5.
   */
  lowCoverageThreshold?: number;
  timeoutMs?: number;
  includeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

/**
 * Creates an OpenRouter evals source that fetches a JSON document shaped
 * `{rows: Hcs25OpenRouterEvalRow[], totalCategories?, coverageWeight?}` from
 * a configured endpoint. For sources with a different shape, wrap
 * `requestJson` in a custom `Hcs25OpenRouterEvalsSource`.
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

/**
 * Creates the `openrouter-evals` signal adapter: collects per-category
 * benchmark rows for the subject's model, computes a weighted mean score
 * with a coverage proxy, and stores the `openrouterEval*` fields under
 * `metadata.additional`.
 */
export function createOpenRouterEvalsSignalAdapter(
  options: Hcs25OpenRouterEvalsSignalAdapterOptions,
): Hcs25SignalAdapter {
  const lowCoverageThreshold = options.lowCoverageThreshold ?? 0.5;

  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const modelId = resolveModelId(subject);

    let data: Hcs25OpenRouterEvalsData | null = null;
    try {
      data = await options.source(subject, context);
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
                  openrouterEvalStatus: 'missing',
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
    const categories = new Set<string>();
    for (const row of rows) {
      const score =
        typeof row.score === 'number'
          ? row.score
          : typeof row.rank === 'number' &&
              typeof row.outOf === 'number' &&
              row.outOf > 0
            ? 100 * (1 - (row.rank - 1) / row.outOf)
            : null;
      if (score === null) {
        continue;
      }
      const weight = row.weight ?? 1;
      weightedSum += score * weight;
      totalWeight += weight;
      if (row.category) {
        categories.add(row.category);
      }
    }

    if (totalWeight === 0) {
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
    const coverageRatio =
      data.totalCategories && data.totalCategories > 0
        ? categories.size / data.totalCategories
        : (data.coverageWeight ?? 1);
    const status = coverageRatio < lowCoverageThreshold ? 'low-coverage' : 'ok';

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
              openrouterEvalSources: ['openrouter'],
              openrouterEvalMetricsCount: rows.length,
              openrouterEvalCategoryCount: categories.size,
              openrouterEvalCoverageWeight:
                Math.round(coverageRatio * 1000) / 1000,
              openrouterEvalCategories: [...categories].slice(0, 10),
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
  /** Leaderboard source; required. */
  source: Hcs25LeaderboardSource;
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
      if (!asRecord(row)) {
        continue;
      }
      const rowRecord = asRecord(row)!;
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

/**
 * Creates the `chatbot-arena` signal adapter: looks up the subject's model
 * on a preference leaderboard, normalizes its raw Elo-like score against
 * the snapshot min/max, and stores the `chatbotArenaEval*` fields.
 */
export function createChatbotArenaSignalAdapter(
  options: Hcs25ChatbotArenaSignalAdapterOptions,
): Hcs25SignalAdapter {
  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const modelId = resolveModelId(subject);
    const wanted = [modelId, ...(options.aliases ?? [])].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );

    let entries: readonly Hcs25LeaderboardEntry[] | null = null;
    try {
      entries = await options.source(subject, context);
    } catch (error) {
      return [
        {
          signalId: 'chatbot-arena.eval',
          status: statusFromError(error),
        },
      ];
    }

    const entry =
      entries?.find(candidate =>
        wanted.some(id => modelIdMatches(candidate.model, id)),
      ) ?? null;

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
        value: normalized,
        fields: [
          {
            scope: 'additional',
            values: {
              chatbotArenaEvalScore: Math.round(normalized * 100) / 100,
              chatbotArenaEvalElo: entry.score,
              chatbotArenaEvalVotes: entry.votes ?? null,
              chatbotArenaEvalStatus: 'ok',
              chatbotArenaEvalUpdatedAt: now,
              chatbotArenaEvalSources: ['chatbot-arena'],
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

interface HuggingFaceModelResponse {
  id?: string;
  downloads?: number;
  likes?: number;
  cardData?: {
    'model-index'?: Array<{
      results?: Array<{
        metrics?: Array<{ name?: string; value?: number }>;
      }>;
    }>;
  };
}

/**
 * Options for the `huggingface-model-index` signal adapter.
 */
export interface Hcs25HuggingFaceSignalAdapterOptions {
  /** Hugging Face API base. Default `https://huggingface.co/api`. */
  apiBase?: string;
  /** Optional HF token for private/gated models. */
  token?: string;
  /** Download cap for the popularity log-scale. Default 1_000_000. */
  downloadsCap?: number;
  /** Likes cap for the popularity log-scale. Default 10_000. */
  likesCap?: number;
  timeoutMs?: number;
  includeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

function normalizeMetricValue(value: number): number {
  return Math.min(1, Math.max(0, value > 1 ? value / 100 : value));
}

function logUnitScale(value: number, cap: number): number {
  if (cap <= 0) {
    return 0;
  }
  return Math.min(
    1,
    Math.max(0, Math.log1p(Math.max(0, value)) / Math.log1p(cap)),
  );
}

/**
 * Creates the `huggingface-model-index` signal adapter: fetches the HF
 * model record, extracts model-index metrics when present, falls back to a
 * downloads/likes popularity proxy, and stores the `huggingFaceEval*`
 * fields (with `huggingFaceEvalMode` distinguishing the path).
 */
export function createHuggingFaceSignalAdapter(
  options: Hcs25HuggingFaceSignalAdapterOptions = {},
): Hcs25SignalAdapter {
  const apiBase = options.apiBase ?? HF_API_BASE;

  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const modelId = resolveModelId(subject);
    if (!modelId) {
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
      const data = await requestJson<HuggingFaceModelResponse>(
        `${apiBase}/models/${encodeURIComponent(modelId)}`,
        {
          fetch: context.fetch,
          headers,
          timeoutMs: context.timeoutMs,
          signal: context.signal,
        },
      );

      const metrics: number[] = [];
      for (const indexEntry of data.cardData?.['model-index'] ?? []) {
        for (const result of indexEntry.results ?? []) {
          for (const metric of result.metrics ?? []) {
            if (
              typeof metric.value === 'number' &&
              Number.isFinite(metric.value)
            ) {
              metrics.push(normalizeMetricValue(metric.value));
            }
          }
        }
      }

      const downloads =
        typeof data.downloads === 'number' ? data.downloads : null;
      const likes = typeof data.likes === 'number' ? data.likes : null;
      const popularity =
        downloads === null && likes === null
          ? null
          : 0.7 *
              logUnitScale(downloads ?? 0, options.downloadsCap ?? 1_000_000) +
            0.3 * logUnitScale(likes ?? 0, options.likesCap ?? 10_000);

      const modelIndexScore =
        metrics.length > 0
          ? metrics.reduce((sum, v) => sum + v, 0) / metrics.length
          : null;

      let score: number | null = null;
      let mode: string;
      if (modelIndexScore !== null && popularity !== null) {
        score = 0.7 * modelIndexScore + 0.3 * popularity;
        mode = 'mixed';
      } else if (modelIndexScore !== null) {
        score = modelIndexScore;
        mode = 'model-index';
      } else if (popularity !== null) {
        score = popularity;
        mode = 'popularity';
      } else {
        mode = 'missing';
      }

      const normalized =
        score === null ? null : Math.round(Math.min(1, score) * 10000) / 100;

      return [
        {
          signalId: 'huggingface.model_index',
          status: normalized === null ? 'missing' : 'ok',
          value: normalized,
          fields: [
            {
              scope: 'additional',
              values: {
                huggingFaceModelId: data.id ?? modelId,
                huggingFaceEvalScore: normalized,
                huggingFaceSignalScore: normalized,
                huggingFaceEvalMetricsCount: metrics.length,
                huggingFaceDownloads: downloads,
                huggingFaceLikes: likes,
                huggingFaceEvalMode: mode,
                huggingFaceEvalStatus: normalized === null ? 'missing' : 'ok',
                huggingFaceEvalUpdatedAt: now,
                huggingFaceEvalSources: ['huggingface'],
              },
            },
          ],
          provenance: {
            source: 'huggingface',
            sourceUrl: `${apiBase}/models/${encodeURIComponent(modelId)}`,
            subjectId: modelId,
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
  /** Leaderboard data source; required. */
  source: Hcs25OpenLlmSource;
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
        if (
          key !== modelKey &&
          typeof value === 'number' &&
          Number.isFinite(value)
        ) {
          metrics[key] = value;
        }
      }
      out.push({ model, metrics });
    }
    return out;
  };
}

/**
 * Creates the `openllm-leaderboard` signal adapter: finds the subject's
 * model on the leaderboard dataset, averages its normalized metric values,
 * and stores the `openLlmEval*` fields.
 */
export function createOpenLlmSignalAdapter(
  options: Hcs25OpenLlmSignalAdapterOptions,
): Hcs25SignalAdapter {
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
      rows = await options.source(subject, context);
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
      rows?.find(candidate => modelIdMatches(candidate.model, modelId)) ?? null;

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

    const values = Object.values(row.metrics).map(normalizeMetricValue);
    const score =
      values.length > 0
        ? Math.round(
            (values.reduce((sum, v) => sum + v, 0) / values.length) * 10000,
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
              openLlmEvalSources: ['openllm-leaderboard'],
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
