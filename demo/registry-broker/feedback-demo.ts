import 'dotenv/config';
import { Logger } from '@hashgraphonline/standards-sdk';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  RegistryBrokerParseError,
} from '../../src/services/registry-broker';
import type { AgentSearchHit } from '../../src/services/registry-broker/types';
import { authenticateWithDemoLedger } from '../utils/registry-auth';

const logger = new Logger({ module: 'demo/registry-broker/feedback-demo' });

const args = process.argv.slice(2);

const readArg = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const match = args.find(value => value.startsWith(prefix));
  if (!match) {
    return undefined;
  }
  const raw = match.slice(prefix.length).trim();
  return raw.length > 0 ? raw : undefined;
};

const resolveBaseUrl = (): string => {
  const raw = readArg('base-url');
  if (raw) {
    return raw;
  }
  return (
    process.env.REGISTRY_BROKER_BASE_URL?.trim() ||
    'http://localhost:4000/api/v1'
  );
};

const shouldSkipAuth = (): boolean => {
  const raw = readArg('skip-auth');
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const resolveUaidArg = (name: string): string | null => {
  const raw = readArg(name);
  if (!raw) {
    return null;
  }
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const extractUaid = (hit: AgentSearchHit): string | null => {
  if (typeof hit.uaid === 'string' && hit.uaid.trim().length > 0) {
    return hit.uaid.trim();
  }
  return null;
};

type FindAgentOptions = {
  predicate?: (hit: AgentSearchHit) => boolean;
  query?: string;
};

const extractAgentId = (hit: AgentSearchHit): number | null => {
  if (!isRecord(hit.metadata)) {
    const originalId =
      typeof hit.originalId === 'string' ? hit.originalId.trim() : '';
    if (originalId.length > 0) {
      const parts = originalId
        .split(':')
        .map(part => part.trim())
        .filter(Boolean);
      const last = parts.at(-1);
      if (last) {
        const parsed = Number(last);
        if (Number.isFinite(parsed)) {
          return Math.trunc(parsed);
        }
      }
    }
    return null;
  }
  const raw = hit.metadata.agentId;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  const originalId =
    typeof hit.originalId === 'string' ? hit.originalId.trim() : '';
  if (originalId.length > 0) {
    const parts = originalId
      .split(':')
      .map(part => part.trim())
      .filter(Boolean);
    const last = parts.at(-1);
    if (last) {
      const parsed = Number(last);
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed);
      }
    }
  }
  return null;
};

const resolveRegistry = (): string => {
  const raw = readArg('registry');
  const normalized = raw ? raw.trim().toLowerCase() : '';
  return normalized.length > 0 ? normalized : 'erc-8004-solana';
};

const resolveAgentIdArg = (): number | null => {
  const raw = readArg('agent-id');
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const resolveScore = (): number => {
  const raw = readArg('score');
  const parsed = raw ? Number(raw) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return 92;
  }
  return Math.min(100, Math.max(0, Math.round(parsed)));
};

const resolveTag = (name: string): string | null => {
  const raw = readArg(name);
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const findAgent = async (
  client: RegistryBrokerClient,
  registry: string,
  options: FindAgentOptions = {},
): Promise<AgentSearchHit | null> => {
  const limit = 100;
  for (let page = 1; page <= 5; page += 1) {
    const response = await client.search({
      registry,
      limit,
      page,
      ...(options.query ? { q: options.query } : {}),
    });
    const match = response.hits.find(
      hit =>
        Boolean(extractUaid(hit)) &&
        (!options.predicate || options.predicate(hit)),
    );
    if (match) {
      return match;
    }
    const total = response.total ?? 0;
    if (page * limit >= total) {
      break;
    }
  }
  return null;
};

const ensureUaid = async (
  client: RegistryBrokerClient,
  registry: string,
  argName: string,
  options: FindAgentOptions = {},
): Promise<string> => {
  const fromArg = resolveUaidArg(argName);
  if (fromArg) {
    return fromArg;
  }
  const hit = await findAgent(client, registry, options);
  if (!hit) {
    throw new Error(
      `No agents found for registry ${registry}. Provide --${argName}.`,
    );
  }
  const uaid = extractUaid(hit);
  if (!uaid) {
    throw new Error(
      `Agent UAID missing for registry ${registry}. Provide --${argName}.`,
    );
  }
  return uaid;
};

const createClient = async (baseUrl: string): Promise<RegistryBrokerClient> => {
  if (shouldSkipAuth()) {
    return new RegistryBrokerClient({ baseUrl });
  }

  const apiKey = process.env.REGISTRY_BROKER_API_KEY?.trim();
  const client = new RegistryBrokerClient({
    baseUrl,
    apiKey: apiKey && apiKey.length > 0 ? apiKey : undefined,
  });
  if (!apiKey) {
    try {
      await authenticateWithDemoLedger(client, {
        label: 'registry-broker-feedback',
        expiresInMinutes: 30,
        setAccountHeader: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(
        'Ledger authentication unavailable; continuing without auth.',
        {
          error: message,
        },
      );
    }
  }
  return client;
};

const sendChatMessages = async (
  client: RegistryBrokerClient,
  uaid: string,
): Promise<{ sessionId: string }> => {
  const session = await client.chat.createSession({
    uaid,
    historyTtlSeconds: 900,
  });

  const prompts = [
    'Share a short summary of your capabilities.',
    'Provide a sample response in one sentence.',
    'Acknowledge this feedback request.',
  ];

  for (const message of prompts) {
    try {
      await client.chat.sendMessage({
        sessionId: session.sessionId,
        uaid,
        message,
      });
    } catch (error) {
      const messageText =
        error instanceof Error
          ? error.message
          : String(error ?? 'Unknown error');
      logger.warn('Chat send failed; continuing for feedback eligibility', {
        uaid,
        sessionId: session.sessionId,
        error: messageText,
      });
    }
  }

  return { sessionId: session.sessionId };
};

const run = async (): Promise<void> => {
  const baseUrl = resolveBaseUrl();
  const client = await createClient(baseUrl);
  const registry = resolveRegistry();
  const uaidArg = resolveUaidArg('uaid');
  const agentId = resolveAgentIdArg() ?? 114;
  const score = resolveScore();
  const tag1 = resolveTag('tag1');
  const tag2 = resolveTag('tag2');

  const solanaDevnet114 =
    'uaid:aid:fYW9MXvUReko;uid=solana-devnet:114;registry=erc-8004-solana;proto=erc-8004-solana;nativeId=solana-devnet:114';

  const resolveUaidFromSearch = async (): Promise<string> => {
    return await ensureUaid(client, registry, 'uaid', {
      predicate: hit => extractAgentId(hit) === agentId,
    });
  };

  const uaid = await (async (): Promise<string> => {
    if (uaidArg) {
      return uaidArg;
    }

    try {
      return await resolveUaidFromSearch();
    } catch (error) {
      if (registry === 'erc-8004-solana' && agentId === 114) {
        logger.warn('Falling back to known Solana devnet agent UAID', {
          uaid: solanaDevnet114,
          error: error instanceof Error ? error.message : String(error),
        });
        return solanaDevnet114;
      }
      throw error;
    }
  })();

  logger.info('Running feedback demo', {
    baseUrl,
    registry,
    uaid,
    score,
    tag1,
    tag2,
  });

  const { sessionId } = await sendChatMessages(client, uaid);
  const eligibility = await client.checkAgentFeedbackEligibility(uaid, {
    sessionId,
  });

  logger.info('Feedback eligibility', eligibility);

  if (!eligibility.eligible) {
    await client.chat.endSession(sessionId);
    throw new Error(
      `Feedback not eligible: ${eligibility.reason ?? 'unknown_reason'}`,
    );
  }

  const submission = await client.submitAgentFeedback(uaid, {
    sessionId,
    score,
    tag1,
    tag2,
  });

  logger.info('Feedback submitted', submission);

  const feedback = await client.getAgentFeedback(uaid);
  logger.info('Feedback summary', feedback.summary);

  await client.chat.endSession(sessionId);

  const feedbackIndex = await client.listAgentFeedbackIndex({
    page: 1,
    limit: 50,
    registries: ['erc-8004', 'erc-8004-solana'],
  });
  logger.info('Feedback index', {
    page: feedbackIndex.page,
    limit: feedbackIndex.limit,
    total: feedbackIndex.total,
    items: feedbackIndex.items.slice(0, 5),
  });

  logger.info('Feedback demo completed');
};

run().catch((error: unknown) => {
  if (error instanceof RegistryBrokerError) {
    logger.error('Feedback demo failed', {
      status: error.status,
      statusText: error.statusText,
      body: error.body,
    });
    process.exit(1);
  }
  if (error instanceof RegistryBrokerParseError) {
    const causeMessage =
      error.cause instanceof Error
        ? error.cause.message
        : typeof error.cause === 'string'
          ? error.cause
          : error.cause
            ? 'unprintable'
            : undefined;
    logger.error('Feedback demo failed', {
      error: error.message,
      ...(causeMessage ? { cause: causeMessage } : {}),
    });
    process.exit(1);
  }
  const message = error instanceof Error ? error.message : String(error);
  logger.error('Feedback demo failed', { error: message });
  process.exit(1);
});
