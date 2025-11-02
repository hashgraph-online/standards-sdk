import 'dotenv/config';
// For safe URL parsing and host validation
// No additional npm package required as Node's built-in URL class is used
import { RegistryBrokerClient } from '../../src/services/registry-broker';
import type {
  AgentSearchHit,
  SendMessageResponse,
} from '../../src/services/registry-broker/types';

const baseUrl =
  process.env.REGISTRY_BROKER_BASE_URL?.trim() ||
  'https://registry.hashgraphonline.com/api/v1';

/**
 * Returns true if the provided URL string (tokenUri) has a hostname that equals, or is a subdomain of, the specified `host`.
 * Host comparison is done case-insensitively.
 */
function isMatchingHost(tokenUriString: string, host: string): boolean {
  if (!tokenUriString) return false;
  try {
    // Ensure valid URL -- must have protocol to be parsable by URL()
    const urlObj = new URL(tokenUriString);
    const hostname = urlObj.hostname.toLowerCase();
    const hostToMatch = host.toLowerCase();
    // Match exact host or subdomain (i.e., ends with '.host')
    return hostname === hostToMatch || hostname.endsWith('.' + hostToMatch);
  } catch {
    // Not a valid URL
    return false;
  }
}

const targetUaid = process.env.ERC8004_AGENT_UAID?.trim() || null;
const directAgentUrl = process.env.ERC8004_AGENT_URL?.trim() || null;
const searchQuery =
  process.env.ERC8004_AGENT_QUERY?.trim() || 'defillama-verifiable-agent';

const samplePrompt =
  'Provide a concise summary of your capabilities and the type of on-chain data you can access.';

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const normaliseAgentHttpUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${trimmed.slice('ipfs://'.length)}`;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return null;
};

const extractAgentUrl = (hit: AgentSearchHit): string | null => {
  const metadata = asRecord(hit.metadata);
  const registration = metadata ? asRecord(metadata.registration) : null;

  // Prefer explicit communication endpoints first (more likely to include ports)
  const endpointsRecord = metadata
    ? asRecord(metadata.communicationEndpoints)
    : null;
  const primary = normaliseAgentHttpUrl(endpointsRecord?.primary);
  if (primary) return primary;

  // Then prefer well-known/primary attached to the hit
  if (
    hit.endpoints &&
    typeof hit.endpoints === 'object' &&
    !Array.isArray(hit.endpoints)
  ) {
    const endpointRecord = hit.endpoints as Record<string, unknown>;
    const wellKnown = normaliseAgentHttpUrl(endpointRecord.wellKnown);
    if (wellKnown) return wellKnown;
    const primaryEndpoint = normaliseAgentHttpUrl(endpointRecord.primary);
    if (primaryEndpoint) return primaryEndpoint;
  }

  // Fallback to registration.data.endpoints list
  if (registration) {
    const data = asRecord(registration.data);
    const endpoints =
      data && Array.isArray(data.endpoints) ? data.endpoints : [];
    for (const candidate of endpoints) {
      const record = asRecord(candidate);
      const endpoint = record && normaliseAgentHttpUrl(record.endpoint);
      if (endpoint) return endpoint;
    }
  }

  // Last resort: resolvedUrl or tokenUri
  const resolved = normaliseAgentHttpUrl(registration?.resolvedUrl);
  if (resolved) return resolved;
  const tokenUri = normaliseAgentHttpUrl(registration?.tokenUri);
  if (tokenUri) return tokenUri;

  return null;
};

const extractReplyContent = (payload: SendMessageResponse): string => {
  const content =
    typeof payload.content === 'string' && payload.content.trim().length > 0
      ? payload.content.trim()
      : null;
  if (content) {
    return content;
  }
  return typeof payload.message === 'string' ? payload.message : '';
};

const run = async () => {
  let activeClient = new RegistryBrokerClient({ baseUrl });

  const performSearch = async (client: RegistryBrokerClient, query: string) => {
    // Prefer adapter-scoped search on staging/production
    let result = await client.search({
      q: query,
      adapters: ['erc8004-adapter'],
      sortBy: 'most-recent',
      limit: 200,
    });
    if (result.total === 0 || result.hits.length === 0) {
      // Fallback to registry filter and a simpler query term
      result = await client.search({
        q: query,
        registry: 'erc-8004',
        limit: 200,
      });
      if (
        result.total === 0 ||
        (result.hits.length === 0 && query.toLowerCase() !== 'defillama')
      ) {
        result = await client.search({
          q: 'defillama',
          adapters: ['erc8004-adapter'],
          sortBy: 'most-recent',
          limit: 200,
        });
      }
    }
    return result;
  };

  let agentUrl: string;
  let agentName = 'ERC-8004 Agent';

  if (directAgentUrl) {
    console.log(`Using direct ERC8004 agent URL from env: ${directAgentUrl}`);
    agentUrl = directAgentUrl;
  } else {
    console.log(
      `Searching for ERC-8004 agents with query "${searchQuery}" via ${baseUrl}…`,
    );
    let searchResult = await performSearch(activeClient, searchQuery);
    console.log(
      `Broker search returned ${searchResult.total} matches (${searchResult.hits.length} hits)`,
    );
    if (searchResult.total === 0 || searchResult.hits.length === 0) {
      throw new Error('No ERC-8004 agents matched the provided queries');
    }
    console.log(
      `Found ${searchResult.hits.length} candidates (showing first 5):`,
    );
    searchResult.hits.slice(0, 5).forEach(hit => {
      console.log(`- ${hit.name} (${hit.uaid})`);
    });
    const agent =
      (targetUaid && searchResult.hits.find(hit => hit.uaid === targetUaid)) ||
      searchResult.hits.find(hit => {
        const metadata = asRecord(hit.metadata);
        const registration = metadata ? asRecord(metadata.registration) : null;
        const tokenUri = registration?.tokenUri;
        const tokenUriString =
          typeof tokenUri === 'string' ? tokenUri.toLowerCase() : '';
        const name = hit.name.toLowerCase();
        return (
          tokenUriString.includes('defillama') || name.includes('defillama')
        );
      }) ||
      searchResult.hits[0];
    agentName = agent.name;
    console.log(`Selected agent: ${agentName}`);

    const resolved = extractAgentUrl(agent);
    if (!resolved) {
      throw new Error(
        'Selected agent does not expose an HTTP-compatible endpoint',
      );
    }
    agentUrl = resolved;
  }

  console.log(`Opening broker-managed chat session via ${agentUrl}`);
  const session = await activeClient.chat.createSession({ agentUrl });

  console.log('Session established:');
  console.log(`  Session ID: ${session.sessionId}`);
  console.log(
    `  History TTL: ${session.historyTtlSeconds ?? 'unknown'} seconds`,
  );
  console.log(`  Agent name: ${session.agent.name || agentName}`);

  console.log('Sending initial prompt through the broker…');
  const firstResponse = await activeClient.chat.sendMessage({
    sessionId: session.sessionId,
    agentUrl,
    message: samplePrompt,
  });
  console.log('Agent reply:');
  console.log(extractReplyContent(firstResponse));

  const followUpPrompt =
    'Fetch the current total value locked (TVL) in USD for Uniswap and reply exactly in the format "Uniswap: $<amount>".';
  console.log('Sending follow-up prompt to validate context retention…');
  const secondResponse = await activeClient.chat.sendMessage({
    sessionId: session.sessionId,
    agentUrl,
    message: followUpPrompt,
  });
  console.log('Follow-up reply:');
  console.log(extractReplyContent(secondResponse));

  const historySnapshot = await activeClient.chat.getHistory(session.sessionId);
  console.log('--- Conversation History Snapshot ---');
  historySnapshot.history.forEach(entry => {
    console.log(`  [${entry.role}] ${entry.content}`);
  });

  await activeClient.chat.endSession(session.sessionId).catch(() => undefined);
};

run().catch(error => {
  console.error('ERC-8004 demo failed:', error);
  process.exit(1);
});
