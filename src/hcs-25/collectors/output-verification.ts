import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { readString } from '../signals';
import { Hcs25CollectorHttpError, isTimeoutError, requestJson } from './http';
import type {
  Hcs25CollectContext,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
} from './types';

/**
 * A verification provider exposing the spec reference stats endpoint
 * `GET {baseUrl}/v1/stats/{agentId}?window={n}d`.
 */
export interface Hcs25VerificationProvider {
  id: string;
  baseUrl: string;
  /** On-chain signer address for attestation provenance, when available. */
  signerAddress?: string;
  /** URL to the provider's verification methodology documentation. */
  methodologyUrl?: string;
}

interface StakeLevelStats {
  checks?: number;
  allowRate?: number;
  avgConfidence?: number;
}

interface ProviderStatsResponse {
  allowRate?: number;
  blockRate?: number;
  uncertainRate?: number;
  avgConfidence?: number;
  totalChecks?: number;
  stakeDistribution?: Record<string, StakeLevelStats>;
  windowDays?: number;
  updatedAt?: string;
}

/**
 * Options for the output-verification signal adapter.
 */
export interface Hcs25OutputVerificationSignalAdapterOptions {
  /** Verification providers to query; responses are check-weight merged. */
  providers: readonly Hcs25VerificationProvider[];
  /** Lookback window in days for the stats query. Default 7. */
  windowDays?: number;
  /** Resolves the provider-side agent id; defaults to `subject.id`. */
  resolveAgentId?: (subject: Hcs25Subject) => string | null;
  timeoutMs?: number;
  includeRegistries?: readonly string[];
  excludeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

function clamp01(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(1, Math.max(0, value));
}

function defaultResolveAgentId(subject: Hcs25Subject): string | null {
  const metadata = subject.metadata ?? {};
  return (
    readString(metadata, 'verificationAgentId') ??
    readString(metadata, 'nativeId') ??
    subject.id ??
    null
  );
}

/**
 * Creates the `output-verification` signal adapter: queries each configured
 * provider's `{baseUrl}/v1/stats/{agentId}?window={n}d` endpoint, merges the
 * responses weighted by check counts, and stores
 * `metadata.outputVerificationSummary` per the signal catalog.
 */
export function createOutputVerificationSignalAdapter(
  options: Hcs25OutputVerificationSignalAdapterOptions,
): Hcs25SignalAdapter {
  const windowDays = options.windowDays ?? 7;
  const resolveAgentId = options.resolveAgentId ?? defaultResolveAgentId;

  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const agentId = resolveAgentId(subject);
    if (!agentId || options.providers.length === 0) {
      return [{ signalId: 'verification.summary', status: 'missing' }];
    }

    const perProvider: Array<{
      provider: Hcs25VerificationProvider;
      stats: ProviderStatsResponse;
    }> = [];
    let sawError = false;

    for (const provider of options.providers) {
      const url = `${provider.baseUrl.replace(/\/$/, '')}/v1/stats/${encodeURIComponent(agentId)}?window=${windowDays}d`;
      try {
        const stats = await requestJson<ProviderStatsResponse>(url, {
          fetch: context.fetch,
          timeoutMs: context.timeoutMs,
          signal: context.signal,
        });
        perProvider.push({ provider, stats });
      } catch (error) {
        if (
          !(error instanceof Hcs25CollectorHttpError && error.status === 404)
        ) {
          sawError = true;
        }
      }
    }

    if (perProvider.length === 0) {
      return [
        {
          signalId: 'verification.summary',
          status: sawError ? 'error' : 'missing',
        },
      ];
    }

    let totalChecks = 0;
    let allowSum = 0;
    let blockSum = 0;
    let uncertainSum = 0;
    let confidenceSum = 0;
    const stakeTotals: Record<
      string,
      { checks: number; allowRate: number; confidence: number }
    > = {};
    const providersOut: Record<string, Hcs25JsonValue>[] = [];

    for (const { provider, stats } of perProvider) {
      const checks = Math.max(0, Math.floor(stats.totalChecks ?? 0));
      totalChecks += checks;
      const weight = checks > 0 ? checks : 1;
      allowSum += (stats.allowRate ?? 0) * weight;
      blockSum += (stats.blockRate ?? 0) * weight;
      uncertainSum += (stats.uncertainRate ?? 0) * weight;
      confidenceSum += (stats.avgConfidence ?? 0) * weight;

      for (const [level, levelStats] of Object.entries(
        stats.stakeDistribution ?? {},
      )) {
        const levelChecks = Math.max(0, Math.floor(levelStats.checks ?? 0));
        if (levelChecks <= 0) {
          continue;
        }
        const bucket =
          stakeTotals[level] ??
          (stakeTotals[level] = { checks: 0, allowRate: 0, confidence: 0 });
        bucket.checks += levelChecks;
        bucket.allowRate += (levelStats.allowRate ?? 0) * levelChecks;
        bucket.confidence += (levelStats.avgConfidence ?? 0) * levelChecks;
      }

      providersOut.push({
        id: provider.id,
        signerAddress: provider.signerAddress ?? null,
        methodologyUrl: provider.methodologyUrl ?? null,
        checksContributed: checks,
      });
    }

    const divisor = perProvider.reduce(
      (sum, { stats }) =>
        sum + Math.max(0, Math.floor(stats.totalChecks ?? 0) || 1),
      0,
    );

    const stakeDistribution: Record<string, Hcs25JsonValue> = {};
    for (const [level, bucket] of Object.entries(stakeTotals)) {
      stakeDistribution[level] = {
        checks: bucket.checks,
        allowRate: bucket.allowRate / bucket.checks,
        avgConfidence: bucket.confidence / bucket.checks,
      };
    }

    const summary: Record<string, Hcs25JsonValue> = {
      allowRate: clamp01(allowSum / divisor) ?? 0,
      blockRate: clamp01(blockSum / divisor) ?? 0,
      uncertainRate: clamp01(uncertainSum / divisor),
      avgConfidence: clamp01(confidenceSum / divisor) ?? 0,
      totalChecks,
      stakeDistribution:
        Object.keys(stakeDistribution).length > 0 ? stakeDistribution : null,
      windowDays,
      providers: providersOut,
      updatedAt: now,
    };

    return [
      {
        signalId: 'verification.summary',
        status: 'ok',
        value: summary.allowRate,
        fields: [{ scope: 'outputVerificationSummary', values: summary }],
        provenance: {
          source: 'output-verification',
          subjectId: agentId,
          fetchedAt: now,
          params: { windowDays, providers: options.providers.map(p => p.id) },
        },
      },
    ];
  };

  return {
    id: 'output-verification',
    produces: ['verification.summary'],
    timeoutMs: options.timeoutMs,
    includeRegistries: options.includeRegistries,
    excludeRegistries: options.excludeRegistries,
    appliesTo: options.appliesTo,
    collect,
  };
}
