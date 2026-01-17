import 'dotenv/config';
import { createServer, type IncomingMessage, type Server } from 'http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import localtunnel from 'localtunnel';
import { HCS10Client } from '../../src/hcs-10/sdk';
import {
  AgentBuilder,
  AIAgentCapability,
  AIAgentType,
  HCS11Client,
  InboundTopicType,
  ProfileType,
  type HCS11Profile,
} from '../../src/hcs-11';
import { toHederaCaip10 } from '../../src/hcs-14/caip';
import {
  JsonObject,
  RegistryBrokerClient,
  RegistryBrokerError,
  type AgentRegistrationRequest,
} from '../../src/services/registry-broker';
import { Logger } from '../../src/utils/logger';
import { resolveHederaLedgerAuthConfig } from '../utils/ledger-config';
import { authenticateWithHederaLedger } from '../utils/registry-auth';

const logger = new Logger({ module: 'RegistryBrokerHcs10ChatDemo' });

const BASE_URL =
  process.env.REGISTRY_BROKER_BASE_URL?.trim() ||
  'http://127.0.0.1:4000/api/v1';
const REGISTRY = 'hashgraph-online';

interface LocalA2AAgentHandle {
  agentId: string;
  port: number;
  baseUrl: string;
  publicUrl?: string;
  a2aEndpoint: string;
  agentCardUrl: string;
  stop: () => Promise<void>;
}

interface TunnelHandle {
  url: string;
  close: () => Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let data = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      data += chunk;
    });
    request.on('end', () => resolve(data));
    request.on('error', reject);
  });

const jsonResponse = (
  response: NodeJS.WritableStream & {
    writeHead: (status: number, headers: Record<string, string>) => void;
  },
  status: number,
  payload: unknown,
): void => {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(body);
};

const buildAgentCard = (agentId: string, baseUrl: string) => ({
  id: agentId,
  name: `Local Demo Agent (${agentId})`,
  description: 'Local A2A agent used by the HCS-10 registry demo.',
  version: '1.0.0',
  capabilities: {
    streaming: false,
    messageHandling: true,
  },
  url: `${baseUrl}/a2a`,
  serviceEndpoint: `${baseUrl}/a2a`,
  endpoints: {
    a2a: `${baseUrl}/a2a`,
  },
  created: new Date().toISOString(),
});

const buildAgentReply = (agentId: string, text: string) => ({
  kind: 'message',
  role: 'agent',
  messageId: `msg-${Date.now()}`,
  parts: [
    {
      kind: 'text',
      text:
        text.length > 0 ? text : `Agent ${agentId} received an empty message.`,
    },
  ],
});

const extractMessageText = (payload: Record<string, unknown>): string => {
  const params = payload.params;
  if (!isRecord(params)) {
    return 'Hello from the local A2A demo agent.';
  }
  const message = params.message;
  if (!isRecord(message)) {
    return 'Hello from the local A2A demo agent.';
  }
  const parts = message.parts;
  if (!Array.isArray(parts)) {
    return 'Hello from the local A2A demo agent.';
  }
  const first = parts[0];
  if (!isRecord(first)) {
    return 'Hello from the local A2A demo agent.';
  }
  const text = first.text;
  if (typeof text !== 'string') {
    return 'Hello from the local A2A demo agent.';
  }
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : 'Hello from the local A2A demo agent.';
};

const resolvePayloadId = (payload: unknown): string | number | null => {
  if (!isRecord(payload)) {
    return null;
  }
  const id = payload.id;
  if (typeof id === 'string' || typeof id === 'number') {
    return id;
  }
  return null;
};

const describeError = (error: unknown): string => {
  if (error instanceof RegistryBrokerError) {
    const status = error.status ? ` status=${error.status}` : '';
    const body =
      error.body && typeof error.body === 'object'
        ? ` body=${JSON.stringify(error.body)}`
        : '';
    return `${error.message}${status}${body}`;
  }
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
};

const isLedgerAuthDisabledError = (error: unknown): boolean => {
  if (!(error instanceof RegistryBrokerError)) {
    return false;
  }
  if (error.status !== 503) {
    return false;
  }
  if (!error.body || typeof error.body !== 'object') {
    return false;
  }
  const body = error.body as Record<string, unknown>;
  return body.error === 'Ledger authentication is disabled';
};

const startLocalA2AAgent = async (
  agentId: string,
  port: number,
  publicUrl?: string,
): Promise<LocalA2AAgentHandle> => {
  const server: Server = createServer(async (request, response) => {
    if (!request.url) {
      jsonResponse(response, 404, { error: 'missing url' });
      return;
    }

    if (request.method === 'GET' && request.url.startsWith('/health')) {
      jsonResponse(response, 200, { status: 'ok', agentId });
      return;
    }

    if (
      request.method === 'GET' &&
      request.url.startsWith('/.well-known/agent.json')
    ) {
      const hostHeader = request.headers.host || `localhost:${port}`;
      const baseUrl = `${request.headers['x-forwarded-proto'] || 'http'}://${hostHeader}`;
      jsonResponse(response, 200, buildAgentCard(agentId, baseUrl));
      return;
    }

    if (request.method === 'POST' && request.url.startsWith('/a2a')) {
      const raw = await readBody(request);
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        jsonResponse(response, 400, { error: 'invalid json' });
        return;
      }
      if (!isRecord(payload) || payload.method !== 'message/send') {
        jsonResponse(response, 200, {
          jsonrpc: '2.0',
          id: resolvePayloadId(payload),
          error: { code: -32601, message: 'Method not found' },
        });
        return;
      }
      const text = extractMessageText(payload);
      jsonResponse(response, 200, {
        jsonrpc: '2.0',
        id: resolvePayloadId(payload),
        result: buildAgentReply(agentId, text),
      });
      return;
    }

    jsonResponse(response, 404, { error: 'not found' });
  });

  await new Promise<void>(resolve => {
    server.listen(port, '0.0.0.0', resolve);
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const resolvedPublicUrl = publicUrl?.replace(/\/$/, '');
  const endpointBase = resolvedPublicUrl ?? baseUrl;

  return {
    agentId,
    port,
    baseUrl,
    publicUrl: resolvedPublicUrl,
    a2aEndpoint: `${endpointBase}/a2a`,
    agentCardUrl: `${endpointBase}/.well-known/agent.json`,
    stop: async () =>
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      ),
  };
};

const detectCloudflared = async (): Promise<boolean> =>
  await new Promise(resolve => {
    const child = spawn('cloudflared', ['--version']);
    child.once('error', () => resolve(false));
    child.once('exit', code => resolve(code === 0));
  });

const startCloudflareTunnel = async (port: number): Promise<TunnelHandle> => {
  const child = spawn('cloudflared', [
    'tunnel',
    '--url',
    `http://127.0.0.1:${port}`,
    '--no-autoupdate',
  ]);

  const urlPattern = /https:\/\/[^\s]+trycloudflare\.com/;

  return await new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (resolved) {
        return;
      }
      child.kill();
      reject(new Error('Cloudflare tunnel startup timed out'));
    }, 15000);

    const handleOutput = (chunk: unknown) => {
      const text = (chunk ?? '').toString();
      const match = text.match(urlPattern);
      if (!match || resolved) {
        return;
      }
      resolved = true;
      clearTimeout(timeout);
      resolve({
        url: match[0],
        close: async () => {
          child.kill();
          try {
            await once(child, 'exit');
          } catch {}
        },
      });
    };

    child.stdout?.on('data', handleOutput);
    child.stderr?.on('data', handleOutput);
    child.once('error', reject);
    child.once('exit', code => {
      if (!resolved) {
        reject(
          new Error(
            `Cloudflare tunnel exited early (code ${code ?? 'unknown'})`,
          ),
        );
      }
    });
  });
};

const startLocaltunnel = async (port: number): Promise<TunnelHandle> => {
  const tunnel = await localtunnel({ port });
  return {
    url: tunnel.url,
    close: async () => {
      await new Promise<void>(resolve => {
        tunnel.close();
        resolve();
      });
    },
  };
};

const preflightAgentCard = async (baseUrl: string): Promise<boolean> => {
  try {
    const response = await fetch(new URL('/.well-known/agent.json', baseUrl));
    return response.ok;
  } catch {
    return false;
  }
};

const buildUserAgentBuilder = (
  alias: string,
  network: 'mainnet' | 'testnet',
): AgentBuilder =>
  new AgentBuilder()
    .setName('HCS-10 User Agent')
    .setAlias(alias)
    .setBio('User agent created via the HCS-10 SDK client.')
    .setCapabilities([AIAgentCapability.TEXT_GENERATION])
    .setType('manual')
    .setModel('hcs10-user-demo')
    .setCreator('standards-sdk demo')
    .setNetwork(network)
    .setInboundTopicType(InboundTopicType.PUBLIC);

const fetchProfileWithRetry = async (
  client: HCS11Client,
  accountId: string,
  network: 'mainnet' | 'testnet',
  attempts = 6,
  delayMs = 5000,
): Promise<HCS11Profile> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await client.fetchProfileByAccountId(accountId, network);
    if (result.success && result.profile) {
      return result.profile;
    }
    if (attempt < attempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Unable to fetch HCS-11 profile after retries.');
};

const waitForUaid = async (
  client: RegistryBrokerClient,
  uaid: string,
  timeoutMs = 60000,
): Promise<void> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await client.resolveUaid(uaid);
      return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`UAID ${uaid} was not resolved within ${timeoutMs}ms.`);
};

const resolveShortfall = (
  error: unknown,
): { shortfallCredits: number; creditsPerHbar: number } | null => {
  if (!(error instanceof RegistryBrokerError) || error.status !== 402) {
    return null;
  }
  const body = isRecord(error.body) ? error.body : undefined;
  const shortfall = Number(body?.shortfallCredits);
  const perHbar = Number(body?.creditsPerHbar);
  if (
    Number.isFinite(shortfall) &&
    shortfall > 0 &&
    Number.isFinite(perHbar) &&
    perHbar > 0
  ) {
    return { shortfallCredits: shortfall, creditsPerHbar: perHbar };
  }
  return null;
};

const withCreditTopUp = async <T>(
  action: () => Promise<T>,
  client: RegistryBrokerClient,
  accountId: string,
  privateKey: string,
): Promise<T> => {
  try {
    return await action();
  } catch (error) {
    const shortfall = resolveShortfall(error);
    if (!shortfall) {
      throw error;
    }
    const estimated = shortfall.shortfallCredits / shortfall.creditsPerHbar;
    const hbarAmount = Math.max(estimated * 1.1, 0.02);
    logger.warn(
      `Purchasing registry credits (~${hbarAmount.toFixed(4)} HBAR) due to insufficient balance.`,
    );
    await client.purchaseCreditsWithHbar({
      accountId,
      privateKey,
      hbarAmount,
      memo: 'registry-broker-demo',
      metadata: { purpose: 'demo' },
    });
    return await action();
  }
};

const withRetries = async <T>(
  action: (attempt: number) => Promise<T>,
  attempts = 3,
  delayMs = 2000,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
};

const withTimeout = async <T>(
  action: Promise<T>,
  label: string,
  timeoutMs = 5000,
): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return await Promise.race([
    action.finally(() => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }),
    timeoutPromise,
  ]);
};

const main = async (): Promise<void> => {
  const hederaLedgerConfig = resolveHederaLedgerAuthConfig();
  const network = hederaLedgerConfig.network;
  const accountId = hederaLedgerConfig.accountId;
  const privateKey = hederaLedgerConfig.privateKey;
  const apiKey = process.env.REGISTRY_BROKER_API_KEY?.trim();

  const client = new RegistryBrokerClient({
    baseUrl: BASE_URL,
    ...(apiKey ? { apiKey } : {}),
  });

  logger.info(`Registry broker base URL: ${BASE_URL}`);
  logger.info(`Using Hedera network: ${network}`);

  try {
    await withRetries(
      async () =>
        await authenticateWithHederaLedger(client, {
          expiresInMinutes: 30,
          label: 'registry-broker-demo',
          setAccountHeader: true,
        }),
      3,
      3000,
    );
  } catch (error) {
    if (!isLedgerAuthDisabledError(error)) {
      throw error;
    }
    logger.warn('Ledger authentication is disabled; continuing without it.');
  }

  const hcs10Client = new HCS10Client({
    network,
    operatorId: accountId,
    operatorPrivateKey: privateKey,
    logLevel: 'info',
  });

  const userAlias = `hcs10-user-${Date.now().toString(36)}`;
  const userBuilder = buildUserAgentBuilder(userAlias, network);
  const creationResult = await hcs10Client.create(userBuilder, {
    ttl: 120,
    updateAccountMemo: true,
  });

  if (
    !creationResult.inboundTopicId ||
    !creationResult.outboundTopicId ||
    !creationResult.profileTopicId
  ) {
    throw new Error('HCS-10 agent creation did not return topic identifiers.');
  }

  const hcs11Client = new HCS11Client({
    network,
    auth: {
      operatorId: accountId,
      privateKey,
    },
  });

  const profile = await fetchProfileWithRetry(hcs11Client, accountId, network);
  const profileUaid = profile.uaid ?? toHederaCaip10(network, accountId);

  const enrichedProfile: HCS11Profile = {
    ...profile,
    inboundTopicId: profile.inboundTopicId ?? creationResult.inboundTopicId,
    outboundTopicId: profile.outboundTopicId ?? creationResult.outboundTopicId,
    base_account: accountId,
    properties: {
      ...(profile.properties ?? {}),
      network,
    },
  };

  logger.info('Registering HCS-10 user agent with Registry Broker.');
  const hcs10RegistrationPayload: AgentRegistrationRequest = {
    profile: enrichedProfile as unknown as JsonObject,
    protocol: 'hcs-10',
    communicationProtocol: 'hcs-10',
    registry: REGISTRY,
    metadata: {
      adapter: 'openconvai-adapter',
      openConvAICompatible: true,
    },
  };

  const userRegistration = await withCreditTopUp(
    () => client.registerAgent(hcs10RegistrationPayload),
    client,
    accountId,
    privateKey,
  );
  const userAttemptId = userRegistration.attemptId?.trim();
  if (userAttemptId) {
    await client.waitForRegistrationCompletion(userAttemptId, {
      intervalMs: 1000,
      timeoutMs: 60000,
      throwOnFailure: false,
    });
  }
  const userUaid = userRegistration.uaid?.trim() ?? profileUaid;
  if (!userUaid) {
    throw new Error('User agent registration did not return a UAID.');
  }
  await waitForUaid(client, userUaid, 60000);
  logger.info(`User agent UAID: ${userUaid}`);

  const a2aAgentId = `a2a-demo-${Date.now().toString(36)}`;
  const a2aPort = Number(process.env.A2A_DEMO_PORT || '6102');
  let tunnel: TunnelHandle | null = null;
  const explicitPublicUrl =
    process.env.REGISTRY_BROKER_DEMO_A2A_PUBLIC_URL?.trim();
  let publicUrl = explicitPublicUrl || undefined;
  let localAgent: LocalA2AAgentHandle | null = null;

  if (!publicUrl) {
    const tunnelPref =
      process.env.REGISTRY_BROKER_DEMO_TUNNEL?.trim().toLowerCase();
    const preferLocaltunnel = tunnelPref === 'localtunnel';
    if (!preferLocaltunnel) {
      const hasCloudflared = await detectCloudflared();
      if (hasCloudflared) {
        tunnel = await startCloudflareTunnel(a2aPort);
        publicUrl = tunnel.url;
        const reachable = await preflightAgentCard(publicUrl);
        if (!reachable) {
          logger.warn(
            `Cloudflared URL ${publicUrl} is not reachable. Falling back to localtunnel.`,
          );
          await tunnel.close();
          tunnel = null;
          publicUrl = undefined;
        }
      }
    }
    if (!publicUrl) {
      tunnel = await startLocaltunnel(a2aPort);
      publicUrl = tunnel.url;
    }
  }

  localAgent = await startLocalA2AAgent(a2aAgentId, a2aPort, publicUrl);

  logger.info(`Local A2A agent URL: ${localAgent.a2aEndpoint}`);

  const a2aProfile: HCS11Profile = {
    version: '1.0',
    type: ProfileType.AI_AGENT,
    display_name: a2aAgentId,
    alias: a2aAgentId,
    bio: 'Local A2A demo agent registered via Registry Broker.',
    properties: {
      tags: ['demo', 'a2a', 'registry-broker'],
      agentFactsUrl: localAgent.agentCardUrl,
    },
    socials: [],
    aiAgent: {
      type: AIAgentType.MANUAL,
      model: 'a2a-demo',
      capabilities: [AIAgentCapability.TEXT_GENERATION],
      creator: 'standards-sdk demo',
    },
  };

  const a2aRegistrationPayload: AgentRegistrationRequest = {
    profile: a2aProfile as unknown as JsonObject,
    communicationProtocol: 'a2a',
    registry: REGISTRY,
    metadata: { provider: 'registry-broker-demo', local: true },
    endpoint: localAgent.agentCardUrl,
  };

  try {
    const a2aRegistration = await withRetries(
      async attempt =>
        await withCreditTopUp(
          () => client.registerAgent(a2aRegistrationPayload),
          client,
          accountId,
          privateKey,
        ).catch(error => {
          if (attempt < 3) {
            logger.warn(
              `A2A registration attempt ${attempt} failed: ${describeError(
                error,
              )}`,
            );
          }
          throw error;
        }),
      3,
      2500,
    );
    const a2aAttemptId = a2aRegistration.attemptId?.trim();
    if (a2aAttemptId) {
      await client.waitForRegistrationCompletion(a2aAttemptId, {
        intervalMs: 1000,
        timeoutMs: 60000,
        throwOnFailure: false,
      });
    }
    const a2aUaid = a2aRegistration.uaid?.trim() ?? '';
    if (!a2aUaid) {
      throw new Error('A2A registration did not return a UAID.');
    }
    await waitForUaid(client, a2aUaid, 60000);
    logger.info(`A2A agent UAID: ${a2aUaid}`);

    await new Promise(resolve => setTimeout(resolve, 3000));

    const session = await withCreditTopUp(
      () =>
        client.chat.createSession({
          uaid: a2aUaid,
          historyTtlSeconds: 600,
        }),
      client,
      accountId,
      privateKey,
    );
    const response = await withCreditTopUp(
      () =>
        client.chat.sendMessage({
          sessionId: session.sessionId,
          uaid: a2aUaid,
          message:
            process.env.A2A_DEMO_PROMPT?.trim() ||
            'Please reply with a friendly greeting for the demo.',
        }),
      client,
      accountId,
      privateKey,
    );
    const reply =
      response.message ?? response.content ?? 'No response content.';
    logger.info(`A2A reply: ${reply}`);
    await client.chat.endSession(session.sessionId);
  } finally {
    if (tunnel) {
      try {
        await withTimeout(tunnel.close(), 'tunnel shutdown');
      } catch (error) {
        logger.warn(`Tunnel shutdown issue: ${describeError(error)}`);
      }
    }
    if (localAgent) {
      try {
        await withTimeout(localAgent.stop(), 'local agent shutdown');
      } catch (error) {
        logger.warn(`Local agent shutdown issue: ${describeError(error)}`);
      }
    }
  }
};

main()
  .then(() => {
    logger.info('Demo complete.');
    process.exit(0);
  })
  .catch(error => {
    logger.error(describeError(error));
    process.exit(1);
  });
