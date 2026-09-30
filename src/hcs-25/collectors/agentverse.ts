import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { readString, readSubjectAdditional } from '../signals';
import { parseTimestampMs } from './freshness';
import { Hcs25CollectorHttpError, isTimeoutError, requestJson } from './http';
import type {
  Hcs25CollectContext,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
} from './types';

const AGENTVERSE_API_BASE = 'https://agentverse.ai';
const INSIGHTS_SOURCES = ['agentverse:insights:v1'];
const AGENTVERSE_ADDRESS_REGEX =
  /^agent1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{59}$/i;

/**
 * Options for the AgentVerse insights signal adapter.
 */
export interface Hcs25AgentverseSignalAdapterOptions {
  /** AgentVerse API base URL. Default `https://agentverse.ai`. */
  baseUrl?: string;
  /**
   * Almanac contract network query hint. When omitted, production behavior
   * applies: `mainnet` is tried first and `testnet` is probed on
   * missing/empty payloads.
   */
  contract?: 'mainnet' | 'testnet';
  /**
   * Also fetch `GET /v1/search/agents/{address}` and store its operational
   * status as `metrics.isOnline` / `metrics.lastActiveAt`. Default true.
   */
  fetchAgentStatus?: boolean;
  /** Refresh interval for stored `ok` state in ms. Default 6 hours. */
  ttlMs?: number;
  /** Refresh interval after a failure state in ms. Default 1 hour. */
  failureTtlMs?: number;
  timeoutMs?: number;
  includeRegistries?: readonly string[];
  excludeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

const DEFAULT_INCLUDED_REGISTRIES: readonly string[] = ['agentverse', 'uagent'];

interface AgentverseInsightsResponse {
  address?: string;
  rating?: number | null;
  contract?: string;
  readme_quality_score?: number | null;
  readme_uniqueness_score?: number | null;
  interactions_score?: number | null;
  avg_response_time?: number | null;
  recent_uptime?: number | null;
  asi1_total_interactions?: number | null;
  asi1_total_success_interactions?: number | null;
  asi1_recent_interactions?: number | null;
  asi1_recent_success_interactions?: number | null;
  verifier_total_interactions?: number | null;
  verifier_total_success_interactions?: number | null;
  verifier_recent_interactions?: number | null;
  verifier_recent_success_interactions?: number | null;
}

interface AgentverseAgentResponse {
  status?: string;
  last_updated?: string;
}

function resolveAgentAddress(subject: Hcs25Subject): string | null {
  const additional = readSubjectAdditional(subject);
  const metadata = subject.metadata ?? {};
  for (const value of [
    readString(additional, 'agentverseInsightsAddress'),
    subject.id,
    readString(metadata, 'nativeId'),
    readString(metadata, 'uid'),
    readString(metadata, 'address'),
  ]) {
    if (value && AGENTVERSE_ADDRESS_REGEX.test(value.trim())) {
      return value.trim();
    }
  }
  const uaidFull = readString(metadata, 'uaidFull');
  if (uaidFull) {
    const nativeId = uaidFull
      .match(/(?:^|;)nativeId=([^;]+)(?:;|$)/i)?.[1]
      ?.trim();
    if (nativeId && AGENTVERSE_ADDRESS_REGEX.test(nativeId)) {
      return nativeId;
    }
    const uid = uaidFull.match(/(?:^|;)uid=([^;]+)(?:;|$)/i)?.[1]?.trim();
    if (uid && AGENTVERSE_ADDRESS_REGEX.test(uid)) {
      return uid;
    }
  }
  return null;
}

function num(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Creates the `agentverse-insights` signal adapter: fetches the AgentVerse
 * insights endpoint for the subject's agent address and stores the
 * `agentverseInsights*` field family (rating, quality proxies, interaction
 * and verifier counters) under `metadata.additional`. Optionally also reads
 * the agent record for online status.
 */
export function createAgentverseInsightsSignalAdapter(
  options: Hcs25AgentverseSignalAdapterOptions = {},
): Hcs25SignalAdapter {
  const baseUrl = options.baseUrl ?? AGENTVERSE_API_BASE;
  const fetchAgentStatus = options.fetchAgentStatus ?? true;

  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const address = resolveAgentAddress(subject);
    if (!address) {
      return [
        {
          signalId: 'agentverse.insights',
          status: 'missing',
          fields: [
            {
              scope: 'additional',
              values: {
                agentverseInsightsStatus: 'missing',
                agentverseInsightsUpdatedAt: now,
              },
            },
          ],
        },
      ];
    }

    // Freshness gate (production TTL/failure-TTL semantics).
    if (!context.force) {
      const additional = readSubjectAdditional(subject);
      const storedStatus = readString(additional, 'agentverseInsightsStatus');
      const storedUpdatedMs = parseTimestampMs(
        (additional as Record<string, Hcs25JsonValue>)
          .agentverseInsightsUpdatedAt,
      );
      if (storedStatus && storedUpdatedMs !== null) {
        const ttl =
          storedStatus === 'ok'
            ? (options.ttlMs ?? 6 * 60 * 60 * 1000)
            : (options.failureTtlMs ?? 60 * 60 * 1000);
        if (context.now.getTime() - storedUpdatedMs < ttl) {
          return [
            {
              signalId: 'agentverse.insights',
              status: storedStatus === 'ok' ? 'ok' : 'missing',
              provenance: {
                source: 'agentverse',
                subjectId: address,
                fetchedAt: new Date(storedUpdatedMs).toISOString(),
              },
            },
          ];
        }
      }
    }

    const results: Hcs25SignalAdapterResult[] = [];
    const sources: string[] = [];

    const contractParam =
      options.contract ??
      readString(readSubjectAdditional(subject), 'agentverseInsightsContract');
    // Production behavior: mainnet first, then testnet on 404/422 or an
    // all-empty payload; non-missing HTTP failures are upstream-error.
    const contractsToTry: Array<'mainnet' | 'testnet'> =
      contractParam === 'mainnet' || contractParam === 'testnet'
        ? [contractParam]
        : ['mainnet', 'testnet'];

    let insightsResult:
      | {
          data: AgentverseInsightsResponse;
          contract: 'mainnet' | 'testnet';
          url: string;
        }
      | { status: 'missing' | 'upstream-error' }
      | { status: 'timeout' | 'error' } = { status: 'missing' };

    for (const contract of contractsToTry) {
      const insightsUrl = `${baseUrl}/v1/search/analytics/insights/${encodeURIComponent(address)}?contract=${contract}`;
      try {
        const data = await requestJson<AgentverseInsightsResponse>(
          insightsUrl,
          {
            fetch: context.fetch,
            timeoutMs: context.timeoutMs,
            signal: context.signal,
          },
        );
        const hasAnySignal =
          num(data.rating) !== null ||
          num(data.readme_quality_score) !== null ||
          num(data.readme_uniqueness_score) !== null ||
          num(data.interactions_score) !== null ||
          num(data.avg_response_time) !== null ||
          (num(data.asi1_total_interactions) ?? 0) > 0 ||
          (num(data.asi1_recent_interactions) ?? 0) > 0 ||
          (num(data.verifier_total_interactions) ?? 0) > 0 ||
          (num(data.verifier_recent_interactions) ?? 0) > 0;
        if (!hasAnySignal) {
          continue;
        }
        insightsResult = { data, contract, url: insightsUrl };
        break;
      } catch (error) {
        if (
          error instanceof Hcs25CollectorHttpError &&
          (error.status === 404 || error.status === 422)
        ) {
          continue;
        }
        insightsResult = {
          status: isTimeoutError(error) ? 'timeout' : 'upstream-error',
        };
        break;
      }
    }

    if ('data' in insightsResult) {
      const { data, contract, url } = insightsResult;
      sources.push('insights');
      results.push({
        signalId: 'agentverse.insights',
        status: 'ok',
        value: num(data.rating),
        fields: [
          {
            scope: 'additional',
            values: {
              agentverseInsightsUpdatedAt: now,
              agentverseInsightsStatus: 'ok',
              agentverseInsightsAddress: address,
              agentverseInsightsContract: contract,
              agentverseInsightsSources: [...INSIGHTS_SOURCES],
              agentverseInsightsRating: num(data.rating),
              agentverseInsightsReadmeQualityScore: num(
                data.readme_quality_score,
              ),
              agentverseInsightsReadmeUniquenessScore: num(
                data.readme_uniqueness_score,
              ),
              agentverseInsightsInteractionsScore: num(data.interactions_score),
              agentverseInsightsAvgResponseTime: num(data.avg_response_time),
              agentverseInsightsAsi1TotalInteractions:
                num(data.asi1_total_interactions) ?? 0,
              agentverseInsightsAsi1TotalSuccessInteractions:
                num(data.asi1_total_success_interactions) ?? 0,
              agentverseInsightsAsi1RecentInteractions:
                num(data.asi1_recent_interactions) ?? 0,
              agentverseInsightsAsi1RecentSuccessInteractions:
                num(data.asi1_recent_success_interactions) ?? 0,
              agentverseInsightsVerifierTotalInteractions:
                num(data.verifier_total_interactions) ?? 0,
              agentverseInsightsVerifierTotalSuccessInteractions:
                num(data.verifier_total_success_interactions) ?? 0,
              agentverseInsightsVerifierRecentInteractions:
                num(data.verifier_recent_interactions) ?? 0,
              agentverseInsightsVerifierRecentSuccessInteractions:
                num(data.verifier_recent_success_interactions) ?? 0,
            },
          },
        ],
        provenance: {
          source: 'agentverse',
          sourceUrl: url,
          subjectId: address,
          fetchedAt: now,
        },
      });
    } else {
      const stored =
        insightsResult.status === 'missing' ? 'missing' : 'upstream-error';
      results.push({
        signalId: 'agentverse.insights',
        status:
          insightsResult.status === 'timeout'
            ? 'timeout'
            : stored === 'missing'
              ? 'missing'
              : 'error',
        fields: [
          {
            scope: 'additional',
            values: {
              agentverseInsightsUpdatedAt: now,
              agentverseInsightsStatus: stored,
              agentverseInsightsAddress: address,
              agentverseInsightsSources: [...INSIGHTS_SOURCES],
            },
          },
        ],
        provenance: {
          source: 'agentverse',
          subjectId: address,
          fetchedAt: now,
        },
      });
    }

    if (fetchAgentStatus) {
      const agentUrl = `${baseUrl}/v1/search/agents/${encodeURIComponent(address)}${contractParam ? `?contract=${contractParam}` : ''}`;
      try {
        const agent = await requestJson<AgentverseAgentResponse>(agentUrl, {
          fetch: context.fetch,
          timeoutMs: context.timeoutMs,
          signal: context.signal,
        });
        sources.push('search-agent');
        results.push({
          signalId: 'agentverse.agent_status',
          status: 'ok',
          value: agent.status ?? null,
          fields: [
            {
              scope: 'metrics',
              values: {
                isOnline: agent.status === 'active',
                lastActiveAt: agent.last_updated ?? null,
              },
            },
          ],
          provenance: {
            source: 'agentverse',
            sourceUrl: agentUrl,
            subjectId: address,
            fetchedAt: now,
          },
        });
      } catch {
        results.push({
          signalId: 'agentverse.agent_status',
          status: 'missing',
        });
      }
    }

    if (sources.length > 0) {
      results.push({
        signalId: 'agentverse.sources',
        status: 'ok',
        value: sources,
        fields: [
          {
            scope: 'additional',
            values: { agentverseInsightsSources: sources },
          },
        ],
      });
    }

    return results;
  };

  return {
    id: 'agentverse-insights',
    produces: [
      'agentverse.insights',
      'agentverse.agent_status',
      'agentverse.sources',
    ],
    timeoutMs: options.timeoutMs,
    includeRegistries: options.includeRegistries ?? DEFAULT_INCLUDED_REGISTRIES,
    excludeRegistries: options.excludeRegistries,
    appliesTo: options.appliesTo,
    collect,
  };
}
