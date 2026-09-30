import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { readString, readSubjectAdditional } from '../signals';
import { Hcs25CollectorHttpError, isTimeoutError, requestJson } from './http';
import type {
  Hcs25CollectContext,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
} from './types';

const AGENTVERSE_API_BASE = 'https://agentverse.ai';

/**
 * Options for the AgentVerse insights signal adapter.
 */
export interface Hcs25AgentverseSignalAdapterOptions {
  /** AgentVerse API base URL. Default `https://agentverse.ai`. */
  baseUrl?: string;
  /** Almanac contract network (`mainnet`/`testnet`) query hint. */
  contract?: 'mainnet' | 'testnet';
  /**
   * Also fetch `GET /v1/search/agents/{address}` and store its operational
   * status as `metrics.isOnline` / `metrics.lastActiveAt`. Default true.
   */
  fetchAgentStatus?: boolean;
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
    readString(metadata, 'nativeId'),
    readString(metadata, 'address'),
    readString(metadata, 'uid'),
  ]) {
    if (value && value.startsWith('agent1')) {
      return value;
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

    const results: Hcs25SignalAdapterResult[] = [];
    const sources: string[] = [];

    const contractParam =
      options.contract ??
      readString(readSubjectAdditional(subject), 'agentverseInsightsContract');
    const insightsUrl = `${baseUrl}/v1/search/analytics/insights/${encodeURIComponent(address)}${contractParam ? `?contract=${contractParam}` : ''}`;

    try {
      const data = await requestJson<AgentverseInsightsResponse>(insightsUrl, {
        fetch: context.fetch,
        timeoutMs: context.timeoutMs,
        signal: context.signal,
      });
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
              agentverseInsightsContract:
                (data.contract === 'mainnet' || data.contract === 'testnet'
                  ? data.contract
                  : contractParam) ?? null,
              agentverseInsightsRating: num(data.rating),
              agentverseInsightsReadmeQualityScore: num(
                data.readme_quality_score,
              ),
              agentverseInsightsReadmeUniquenessScore: num(
                data.readme_uniqueness_score,
              ),
              agentverseInsightsInteractionsScore: num(data.interactions_score),
              agentverseInsightsAvgResponseTime: num(data.avg_response_time),
              agentverseInsightsAsi1TotalInteractions: num(
                data.asi1_total_interactions,
              ),
              agentverseInsightsAsi1TotalSuccessInteractions: num(
                data.asi1_total_success_interactions,
              ),
              agentverseInsightsAsi1RecentInteractions: num(
                data.asi1_recent_interactions,
              ),
              agentverseInsightsAsi1RecentSuccessInteractions: num(
                data.asi1_recent_success_interactions,
              ),
              agentverseInsightsVerifierTotalInteractions: num(
                data.verifier_total_interactions,
              ),
              agentverseInsightsVerifierTotalSuccessInteractions: num(
                data.verifier_total_success_interactions,
              ),
              agentverseInsightsVerifierRecentInteractions: num(
                data.verifier_recent_interactions,
              ),
              agentverseInsightsVerifierRecentSuccessInteractions: num(
                data.verifier_recent_success_interactions,
              ),
            },
          },
        ],
        provenance: {
          source: 'agentverse',
          sourceUrl: insightsUrl,
          subjectId: address,
          fetchedAt: now,
        },
      });
    } catch (error) {
      const missing =
        error instanceof Hcs25CollectorHttpError && error.status === 404;
      const status = missing
        ? 'missing'
        : isTimeoutError(error)
          ? 'timeout'
          : 'error';
      results.push({
        signalId: 'agentverse.insights',
        status,
        fields: [
          {
            scope: 'additional',
            values: {
              agentverseInsightsUpdatedAt: now,
              agentverseInsightsStatus: missing ? 'missing' : 'upstream-error',
              agentverseInsightsAddress: address,
            },
          },
        ],
        provenance: {
          source: 'agentverse',
          sourceUrl: insightsUrl,
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
