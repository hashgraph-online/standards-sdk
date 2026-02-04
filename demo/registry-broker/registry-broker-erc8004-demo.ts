import 'dotenv/config';
// For safe URL parsing and host validation
// No additional npm package required as Node's built-in URL class is used
import {
  RegistryBrokerClient,
  RegistryBrokerError,
} from '../../src/services/registry-broker';
import type {
  AgentSearchHit,
  SendMessageResponse,
} from '../../src/services/registry-broker/types';

const baseUrl =
  process.env.REGISTRY_BROKER_BASE_URL?.trim() ||
  'https://hol.org/registry/api/v1';

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
const localDefaultAgentUrl = 'http://ping-agent:8080/.well-known/agent.json';

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

const normaliseChatEndpointUrl = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.endsWith('/mcp/messages')) {
    return `${trimmed.slice(0, -'/messages'.length)}`;
  }
  return trimmed;
};

const isLikelyChatEndpointUrl = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  const lower = trimmed.toLowerCase();
  if (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.svg')
  ) {
    return false;
  }

  if (lower.includes('/.well-known/agent.json')) {
    return true;
  }

  if (lower.includes('/mcp')) {
    return true;
  }

  return lower.includes('/ipfs/') || lower.includes('/ipns/');
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

type ChatCandidate = {
  uaid: string | null;
  name: string;
  agentUrl: string;
  score: number;
};

const scoreCandidateUrl = (value: string): number => {
  const lower = value.toLowerCase();
  if (lower.includes('/.well-known/agent.json')) {
    return 100;
  }
  if (lower.includes('/tasks/send')) {
    return 90;
  }
  if (lower.includes('/ipfs/') || lower.includes('/ipns/')) {
    return 80;
  }
  if (lower.includes('/mcp')) {
    return 10;
  }
  return 0;
};

const buildChatCandidates = (hits: AgentSearchHit[]): ChatCandidate[] => {
  const seen = new Set<string>();
  const candidates: ChatCandidate[] = [];

  hits.forEach(hit => {
    const resolved = extractAgentUrl(hit);
    if (!resolved) {
      return;
    }
    const normalised = normaliseChatEndpointUrl(resolved);
    if (!isLikelyChatEndpointUrl(normalised)) {
      return;
    }
    const key = `${hit.uaid ?? ''}|${normalised}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({
      uaid: hit.uaid ?? null,
      name: hit.name,
      agentUrl: normalised,
      score: scoreCandidateUrl(normalised),
    });
  });

  return candidates.sort((a, b) => b.score - a.score);
};

const run = async (p0: (a: any) => never) => {
  const localBase =
    baseUrl.startsWith('http://127.0.0.1') ||
    baseUrl.startsWith('http://localhost');
  const localFallbackAgentUrl = localBase ? localDefaultAgentUrl : null;
  const apiKey = process.env.REGISTRY_BROKER_API_KEY?.trim();
  const fetchImplementation: typeof fetch = async (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };

  const activeClient = new RegistryBrokerClient({
    baseUrl,
    apiKey: !localBase ? apiKey : undefined,
    fetchImplementation,
  });

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

  const tryChatCandidate = async (
    candidate: ChatCandidate,
  ): Promise<{ sessionId: string }> => {
    console.log('Opening broker-managed chat session via agentUrl');
    console.log(`Resolved agentUrl: ${candidate.agentUrl}`);
    const session = await activeClient.chat.createSession({
      agentUrl: candidate.agentUrl,
    });

    console.log('Session established:');
    console.log(`  Session ID: ${session.sessionId}`);
    console.log(
      `  History TTL: ${session.historyTtlSeconds ?? 'unknown'} seconds`,
    );
    console.log(`  Agent name: ${session.agent.name || candidate.name}`);

    console.log('Sending initial prompt through the broker…');
    const firstResponse = await activeClient.chat.sendMessage({
      sessionId: session.sessionId,
      message: samplePrompt,
    });
    console.log('Agent reply:');
    console.log(extractReplyContent(firstResponse));

    const followUpPrompt =
      'Fetch the current total value locked (TVL) in USD for Uniswap and reply exactly in the format "Uniswap: $<amount>".';
    console.log('Sending follow-up prompt to validate context retention…');
    const secondResponse = await activeClient.chat.sendMessage({
      sessionId: session.sessionId,
      message: followUpPrompt,
    });
    console.log('Follow-up reply:');
    console.log(extractReplyContent(secondResponse));

    const historySnapshot = await activeClient.chat.getHistory(
      session.sessionId,
    );
    console.log('--- Conversation History Snapshot ---');
    historySnapshot.history.forEach(entry => {
      console.log(`  [${entry.role}] ${entry.content}`);
    });

    await activeClient.chat
      .endSession(session.sessionId)
      .catch(() => undefined);
    return { sessionId: session.sessionId };
  };

  console.log(
    `Searching for ERC-8004 agents with query "${searchQuery}" via ${baseUrl}…`,
  );
  const searchResult = await performSearch(activeClient, searchQuery);
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

  const candidates = buildChatCandidates(searchResult.hits);
  if (candidates.length === 0) {
    throw new Error(
      'No viable agentUrl candidates were found for ERC-8004 hits',
    );
  }

  const ordered = targetUaid
    ? [
        ...candidates.filter(candidate => candidate.uaid === targetUaid),
        ...candidates.filter(candidate => candidate.uaid !== targetUaid),
      ]
    : candidates;

  let attemptOrder = ordered;
  if (directAgentUrl) {
    const normalised = normaliseChatEndpointUrl(directAgentUrl);
    console.log(`Including direct agentUrl from env: ${normalised}`);
    attemptOrder = [
      {
        uaid: targetUaid,
        name: 'Direct agentUrl (env)',
        agentUrl: normalised,
        score: scoreCandidateUrl(normalised),
      },
      ...attemptOrder.filter(candidate => candidate.agentUrl !== normalised),
    ];
  } else if (localFallbackAgentUrl) {
    const normalised = normaliseChatEndpointUrl(localFallbackAgentUrl);
    console.log(`Including local demo agentUrl: ${normalised}`);
    attemptOrder = [
      {
        uaid: null,
        name: 'Local ping-agent',
        agentUrl: normalised,
        score: scoreCandidateUrl(normalised),
      },
      ...attemptOrder.filter(candidate => candidate.agentUrl !== normalised),
    ];
  }

  const maxAttempts = Math.min(10, attemptOrder.length);
  for (let index = 0; index < maxAttempts; index += 1) {
    const candidate = attemptOrder[index];
    console.log(
      `Selected candidate ${index + 1}/${maxAttempts}: ${candidate.name}${candidate.uaid ? ` (${candidate.uaid})` : ''}`,
    );
    try {
      await tryChatCandidate(candidate);
      return;
    } catch (error) {
      if (error instanceof RegistryBrokerError) {
        console.warn('Candidate failed; trying next', {
          status: error.status,
          statusText: error.statusText,
          body: error.body,
        });
        continue;
      }
      console.warn('Candidate failed; trying next', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new Error('No candidate chat endpoint succeeded');
};

run(a => {
  process.exit(1);
}).catch(error => {
  console.error('ERC-8004 demo failed:', error);
  process.exit(1);
});
