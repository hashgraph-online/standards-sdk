import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { resolveSubjectEndpoint } from './endpoints';
import { isTimeoutError } from './http';
import type {
  Hcs25CollectContext,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
} from './types';

/**
 * A protocol probe: returns a connectivity score in `[0,100]`, or null when
 * the probe is not meaningful for the subject.
 */
export type Hcs25ConnectivityProbe = (
  subject: Hcs25Subject,
  context: Hcs25CollectContext,
) => Promise<number | null>;

const MCP_PROTOCOL_VERSION = '2024-11-05';

async function fetchOk(
  context: Hcs25CollectContext,
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<boolean> {
  const response = await context.fetch(url, {
    ...init,
    signal: context.signal,
  });
  return response.status < 500;
}

/**
 * MCP probe: posts a JSON-RPC `initialize` request to the endpoint. Any
 * definite HTTP response (including 4xx such as 405 on SSE-only endpoints)
 * proves connectivity; only network failure or 5xx count as disconnected.
 */
export const mcpConnectivityProbe: Hcs25ConnectivityProbe = async (
  subject,
  context,
) => {
  const endpoint = resolveSubjectEndpoint(subject);
  if (!endpoint) {
    return null;
  }
  const ok = await fetchOk(context, endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'hcs-25-connectivity-probe', version: '1' },
      },
    }),
  });
  return ok ? 100 : 0;
};

/**
 * A2A probe: fetches the agent card at `/.well-known/agent.json` relative to
 * the endpoint origin (or the endpoint itself when it already points at a
 * well-known path).
 */
export const a2aConnectivityProbe: Hcs25ConnectivityProbe = async (
  subject,
  context,
) => {
  const endpoint = resolveSubjectEndpoint(subject);
  if (!endpoint) {
    return null;
  }
  const cardUrl = endpoint.includes('/.well-known/')
    ? endpoint
    : new URL('/.well-known/agent.json', endpoint).toString();
  const ok = await fetchOk(context, cardUrl);
  return ok ? 100 : 0;
};

/**
 * Generic HTTP probe: GET the endpoint; any response below 500 counts as
 * connected.
 */
export const httpConnectivityProbe: Hcs25ConnectivityProbe = async (
  subject,
  context,
) => {
  const endpoint = resolveSubjectEndpoint(subject);
  if (!endpoint) {
    return null;
  }
  const ok = await fetchOk(context, endpoint);
  return ok ? 100 : 0;
};

const DEFAULT_PROBES: Record<string, Hcs25ConnectivityProbe> = {
  mcp: mcpConnectivityProbe,
  a2a: a2aConnectivityProbe,
};

/**
 * Options for the connectivity signal adapter.
 */
export interface Hcs25ConnectivitySignalAdapterOptions {
  /**
   * Probe map keyed by target name. Keys `mcp`/`a2a` are used automatically
   * for matching `subject.protocol`; other keys run unconditionally as
   * named targets and populate `connectivityTargets`. Pass `{default: fn}`
   * to override the fallback HTTP probe.
   */
  probes?: Record<string, Hcs25ConnectivityProbe>;
  /** Per-adapter timeout in milliseconds. */
  timeoutMs?: number;
  includeRegistries?: readonly string[];
  excludeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

const DEFAULT_EXCLUDED_REGISTRIES: readonly string[] = [
  'openrouter',
  'near-ai',
];

/**
 * Creates the `connectivity` signal adapter: probes the subject's endpoint
 * using a protocol-aware probe (MCP initialize / A2A agent card / generic
 * HTTP) plus any named custom probes, and stores `connectivityScore` /
 * `connectivityTargets` under `metadata.additional`.
 */
export function createConnectivitySignalAdapter(
  options: Hcs25ConnectivitySignalAdapterOptions = {},
): Hcs25SignalAdapter {
  const probes = { ...DEFAULT_PROBES, ...options.probes };

  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now;
    const protocol = subject.protocol?.toLowerCase();
    const protocolProbe = protocol ? probes[protocol] : undefined;
    const defaultProbe = probes.default ?? httpConnectivityProbe;
    const namedTargets = Object.keys(probes).filter(
      key => key !== protocol && key !== 'default' && !(key in DEFAULT_PROBES),
    );

    const results: Hcs25SignalAdapterResult[] = [];
    const targets: Record<string, number> = {};
    let primaryScore: number | null = null;
    let primaryStatus: 'ok' | 'timeout' | 'error' = 'ok';
    let probed = false;

    const runProbe = async (
      probe: Hcs25ConnectivityProbe,
      signalId: string,
      target?: string,
    ): Promise<void> => {
      try {
        const score = await probe(subject, context);
        if (score === null) {
          return;
        }
        probed = true;
        const clamped = Math.min(100, Math.max(0, score));
        if (target) {
          targets[target] = clamped;
        } else {
          primaryScore = clamped;
        }
        results.push({
          signalId,
          status: 'ok',
          value: clamped,
          provenance: {
            source: 'connectivity-probe',
            sourceUrl: resolveSubjectEndpoint(subject) ?? undefined,
            subjectId: subject.id,
            fetchedAt: now.toISOString(),
          },
        });
      } catch (error) {
        probed = true;
        const status = isTimeoutError(error) ? 'timeout' : 'error';
        if (!target) {
          primaryStatus = status;
          primaryScore = 0;
        }
        results.push({
          signalId,
          status,
          provenance: {
            source: 'connectivity-probe',
            subjectId: subject.id,
            fetchedAt: now.toISOString(),
          },
        });
      }
    };

    await runProbe(protocolProbe ?? defaultProbe, 'connectivity.probe');

    for (const target of namedTargets) {
      await runProbe(probes[target], `connectivity.${target}`, target);
    }

    if (!probed) {
      return [
        {
          signalId: 'connectivity.probe',
          status: 'missing',
          fields: [
            {
              scope: 'additional',
              values: { connectivityStatus: 'missing' },
            },
          ],
        },
      ];
    }

    const additional: Record<string, Hcs25JsonValue> = {
      connectivityStatus: primaryStatus === 'ok' ? 'ok' : primaryStatus,
    };
    if (primaryScore !== null) {
      additional.connectivityScore = primaryScore;
    }
    if (Object.keys(targets).length > 0) {
      additional.connectivityTargets = { ...targets };
    }

    const last = results[results.length - 1];
    return [
      ...results,
      {
        signalId: 'connectivity.score',
        status: primaryStatus === 'ok' ? 'ok' : primaryStatus,
        value: primaryScore ?? undefined,
        fields: [{ scope: 'additional', values: additional }],
        provenance: last?.provenance,
      },
    ];
  };

  return {
    id: 'connectivity',
    produces: ['connectivity.probe', 'connectivity.score'],
    timeoutMs: options.timeoutMs,
    includeRegistries: options.includeRegistries,
    excludeRegistries: options.excludeRegistries ?? DEFAULT_EXCLUDED_REGISTRIES,
    appliesTo: options.appliesTo,
    collect,
  };
}
