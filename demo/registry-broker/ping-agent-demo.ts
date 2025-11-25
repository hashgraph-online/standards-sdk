import 'dotenv/config';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  type AgentSearchHit,
} from '../../src/services/registry-broker';
import { normaliseMessage } from '../utils/registry-broker';

const defaultBaseUrl = 'https://hol.org/registry/api/v1';
const defaultAlias = 'registry-ping-agent';
const defaultQuery = 'Registry Ping Agent';
const parseList = (value: string | undefined): string[] =>
  value
    ? value
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean)
    : [];

const baseUrl = process.env.REGISTRY_BROKER_BASE_URL?.trim() || defaultBaseUrl;

const resolvePingAgent = async (
  client: RegistryBrokerClient,
): Promise<{ uaid: string; hit?: AgentSearchHit }> => {
  const uaidOverride = process.env.PING_AGENT_UAID?.trim();
  if (uaidOverride) {
    console.log('Using PING_AGENT_UAID override:', uaidOverride);
    return { uaid: uaidOverride };
  }

  const alias = (
    process.env.PING_AGENT_ALIAS?.trim() || defaultAlias
  ).toLowerCase();
  const query = process.env.PING_AGENT_QUERY?.trim() || defaultQuery;
  const registries = parseList(process.env.PING_AGENT_REGISTRIES);
  const searchRegistries =
    registries.length > 0 ? registries : ['a2a-registry'];
  const searchLimit = (() => {
    const raw = process.env.PING_AGENT_SEARCH_LIMIT?.trim();
    if (!raw) {
      return 10;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
  })();

  const searchResponse = await client.search({
    q: query,
    registries: searchRegistries,
    limit: searchLimit,
  });

  if (!searchResponse.hits.length) {
    throw new Error(
      `No agents matched query "${query}". Provide PING_AGENT_UAID to override lookup.`,
    );
  }

  const match =
    searchResponse.hits.find(hit => {
      const candidateAlias = hit.profile.alias?.toLowerCase();
      const id = hit.id?.toLowerCase();
      const name = hit.name?.toLowerCase();
      return (
        candidateAlias === alias ||
        id === alias ||
        name === alias ||
        hit.uaid.toLowerCase() === alias
      );
    }) ?? searchResponse.hits[0];

  console.log(
    `Located Registry Ping Agent: ${match.name ?? match.profile.display_name ?? 'unknown name'}`,
  );
  console.log('  Registry:', match.registry);
  console.log('  Provider:', match.metadata?.provider ?? 'Registry Broker');
  console.log('  UAID:', match.uaid);

  return { uaid: match.uaid, hit: match };
};

const run = async (): Promise<void> => {
  const apiKey = process.env.REGISTRY_BROKER_API_KEY?.trim() || undefined;
  const client = new RegistryBrokerClient({
    baseUrl,
    apiKey,
  });

  const { uaid } = await resolvePingAgent(client);

  const session = await client.chat
    .createSession({
      uaid,
      historyTtlSeconds: 900,
    })
    .catch(error => {
      if (
        error instanceof RegistryBrokerError &&
        (error.status === 401 || error.status === 403)
      ) {
        throw new Error(
          'Registry Broker rejected the request (401/403). Set REGISTRY_BROKER_API_KEY to authenticate, even though the ping agent itself costs 0 credits.',
        );
      }
      throw error;
    });
  console.log('Session created:', session.sessionId);

  const response = await client.chat
    .sendMessage({
      sessionId: session.sessionId,
      uaid,
      message: 'PING',
    })
    .catch(error => {
      if (
        error instanceof RegistryBrokerError &&
        (error.status === 401 || error.status === 403)
      ) {
        throw new Error(
          'Registry Broker rejected the request (401/403). Double-check REGISTRY_BROKER_API_KEY.',
        );
      }
      throw error;
    });

  console.log('Ping agent reply:', normaliseMessage(response));
  const agentLatency =
    response.history.filter(entry => entry.role === 'agent').at(-1)?.metadata
      ?.latencyMs ?? 'n/a';
  console.log('Latency (ms):', agentLatency);
  console.log('History entries returned:', response.history.length);
};

run().catch(error => {
  console.error('Ping agent demo failed:', error);
  process.exit(1);
});
