import 'dotenv/config';
import { Logger } from '@hashgraphonline/standards-sdk';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  RegistryBrokerParseError,
  type AgentSearchHit,
} from '../../src/services/registry-broker';
import { authenticateWithDemoLedger } from '../utils/registry-auth';

const logger = new Logger({
  module: 'demo/registry-broker/solana-devnet-chat',
});

const registry = 'erc-8004-solana';
const networkId = 'solana-devnet';

const resolveBaseUrl = (): string => {
  const arg = process.argv.find(value => value.startsWith('--base-url='));
  const raw = arg ? arg.split('=')[1] : undefined;
  const trimmed = raw ? raw.trim() : '';
  if (trimmed.length > 0) {
    return trimmed;
  }
  return (
    process.env.REGISTRY_BROKER_BASE_URL?.trim() ||
    'https://hol.org/registry/api/v1'
  );
};

const resolveAgentId = (): number => {
  const arg = process.argv.find(value => value.startsWith('--agent-id='));
  const raw = arg ? arg.split('=')[1] : undefined;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 114;
  }
  return parsed;
};

const agentId = resolveAgentId();
const baseUrl = resolveBaseUrl();
const expectedId = `erc8004-solana:${networkId}:${agentId}`;
const expectedOriginalId = `${networkId}:${agentId}`;

const matchesAgent = (hit: AgentSearchHit): boolean => {
  if (hit.id === expectedId) {
    return true;
  }
  if (hit.originalId === expectedOriginalId) {
    return true;
  }
  const metadata = hit.metadata ?? {};
  const rawAgentId = (metadata as { agentId?: unknown }).agentId;
  if (typeof rawAgentId === 'number') {
    return rawAgentId === agentId;
  }
  if (typeof rawAgentId === 'string') {
    return Number.parseInt(rawAgentId, 10) === agentId;
  }
  return false;
};

const findAgent = async (
  client: RegistryBrokerClient,
): Promise<AgentSearchHit> => {
  const limit = 200;
  const firstPage = await client.search({ registry, limit, page: 1 });
  const firstMatch = firstPage.hits.find(matchesAgent);
  if (firstMatch) {
    return firstMatch;
  }

  const total = firstPage.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));
  const maxPages = Math.min(pages, 5);

  for (let page = 2; page <= maxPages; page += 1) {
    const response = await client.search({ registry, limit, page });
    const match = response.hits.find(matchesAgent);
    if (match) {
      return match;
    }
  }

  throw new Error(
    `Unable to locate Solana agent ${agentId} (expected id ${expectedId}).`,
  );
};

const run = async (): Promise<void> => {
  const registryApiKey = process.env.REGISTRY_BROKER_API_KEY?.trim();
  const client = new RegistryBrokerClient({
    baseUrl,
    apiKey: registryApiKey,
  });

  if (!registryApiKey) {
    logger.warn(
      'REGISTRY_BROKER_API_KEY is not set; API key access is recommended for production usage.',
    );
  }

  await authenticateWithDemoLedger(client, {
    label: 'solana-devnet-chat',
    expiresInMinutes: 30,
    setAccountHeader: true,
  });

  logger.info('Searching for Solana devnet agent', {
    registry,
    expectedId,
    agentId,
  });

  const agent = await findAgent(client);
  logger.info('Found Solana agent', {
    uaid: agent.uaid,
    id: agent.id,
    name: agent.name,
  });

  if (!agent.uaid) {
    throw new Error('Solana agent UAID is missing.');
  }

  const session = await client.chat.createSession({
    uaid: agent.uaid,
    historyTtlSeconds: 900,
  });
  logger.info('Session created', { sessionId: session.sessionId });

  const prompt = `Confirm you are Solana devnet agent ${agentId} and reply with a short JSON payload containing "agent", "network", and "capabilities".`;
  const response = await client.chat.sendMessage({
    sessionId: session.sessionId,
    uaid: agent.uaid,
    message: prompt,
  });

  logger.info('Chat response received', {
    message: response.message,
    historyEntries: response.history?.length ?? 0,
  });

  await client.chat.endSession(session.sessionId);
  logger.info('Session closed', { sessionId: session.sessionId });
};

run().catch((error: unknown) => {
  if (error instanceof RegistryBrokerError) {
    logger.error('Solana devnet chat demo failed', {
      error: error.message,
      status: error.status,
      statusText: error.statusText,
      body: error.body,
    });
    process.exit(1);
    return;
  }
  if (error instanceof RegistryBrokerParseError) {
    logger.error('Solana devnet chat demo failed', {
      error: error.message,
      cause: String(error.cause),
      rawValue: error.rawValue,
    });
    process.exit(1);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  logger.error('Solana devnet chat demo failed', { error: message });
  process.exit(1);
});
