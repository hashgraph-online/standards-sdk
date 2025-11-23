import dotenv from 'dotenv';
import fetch from 'node-fetch';
import {
  LocalA2AAgentHandle,
  startLocalA2AAgent,
} from '../utils/local-a2a-agent';
import {
  assertAdapterSupport,
  normaliseMessage,
  startDemoHcs10Agent,
  waitForAgentAvailability,
} from '../utils/registry-broker';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  type AgentRegistrationRequest,
  type RegisterAgentResponse,
} from '../../src/services/registry-broker';
import {
  HCS11Client,
  type HCS11Profile,
  ProfileType,
  AIAgentType,
  AIAgentCapability,
} from '../../src/hcs-11';
import { parseHcs14Did, toHederaCaip10 } from '../../src/hcs-14';
import { Logger } from '../../src/utils/logger';
import {
  normaliseNetwork,
  resolveNetwork,
  resolveNetworkScopedLedgerValue,
} from './network';

dotenv.config();

interface DemoConfig {
  baseUrl: string;
  apiKey?: string;
  ledgerAccountId?: string;
  ledgerPrivateKey?: string;
  bearerEmail: string;
  prompt: string;
  adapterCheck: string;
}

const DEFAULT_BASE_URL = 'https://registry.hashgraphonline.com/api/v1';
const TARGET_REGISTRY = 'hashgraph-online';

const REQUEST_TIMEOUT_MS =
  Number.parseInt(process.env.HCS10_CHAT_TIMEOUT_MS ?? '', 10) || 120_000;
const FALLBACK_TOPUP_HBAR = Math.max(
  Number.parseFloat(process.env.HCS10_CHAT_TOPUP_HBAR ?? '0.2') || 0.2,
  0.01,
);
const logger = new Logger({ module: 'Hcs10ChatDemo' });

const readConfig = (): DemoConfig => {
  const baseUrl =
    process.env.REGISTRY_BROKER_BASE_URL?.trim() || DEFAULT_BASE_URL;
  let apiKey = process.env.REGISTRY_BROKER_API_KEY?.trim();
  try {
    const parsed = new URL(baseUrl);
    const host = parsed.hostname.toLowerCase();
    const isLocal =
      host === '127.0.0.1' || host === 'localhost' || host === '::1';
    if (isLocal) {
      apiKey = undefined;
    }
  } catch {
    // ignore parse errors
  }
  const ledgerAccountId =
    process.env.HEDERA_ACCOUNT_ID?.trim() ||
    process.env.HEDERA_OPERATOR_ID?.trim() ||
    undefined;
  const ledgerPrivateKey =
    process.env.HEDERA_PRIVATE_KEY?.trim() ||
    process.env.HEDERA_OPERATOR_KEY?.trim() ||
    undefined;
  const bearerEmail =
    process.env.HCS10_CHAT_EMAIL?.trim() || 'demo@hashgraphonline.com';
  const prompt =
    process.env.HCS10_CHAT_PROMPT?.trim() ||
    'Hello from the cross-protocol chat demo. Please introduce yourself.';
  const adapterCheck =
    process.env.HCS10_CHAT_REQUIRED_ADAPTER?.trim() || 'openconvai-adapter';

  return {
    baseUrl,
    apiKey,
    ledgerAccountId,
    ledgerPrivateKey,
    bearerEmail,
    prompt,
    adapterCheck,
  };
};

const describeError = (error: unknown): string => {
  if (error instanceof RegistryBrokerError) {
    const statusSuffix = error.status ? ` status=${error.status}` : '';
    const bodyFragment =
      error.body && typeof error.body === 'object'
        ? ` body=${JSON.stringify(error.body)}`
        : '';
    return `${error.message}${statusSuffix}${bodyFragment}`;
  }
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
};

const withRequestTimeout = async <T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | undefined;
  return await Promise.race([
    promise.finally(() => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }),
    new Promise<T>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new Error(
            `${label} timed out after ${timeoutMs}ms. Set HCS10_CHAT_TIMEOUT_MS to adjust.`,
          ),
        );
      }, timeoutMs);
    }),
  ]);
};

const withAgentGuard = async <T>(
  agent: LocalA2AAgentHandle,
  action: () => Promise<T>,
): Promise<T> => {
  try {
    return await action();
  } finally {
    await agent.stop();
  }
};

const extractCreditShortfall = (
  error: unknown,
): { shortfallCredits: number; creditsPerHbar: number } | null => {
  if (error instanceof RegistryBrokerError && error.status === 402) {
    const body = error.body;
    if (body && typeof body === 'object') {
      const shortfall = Number(
        (body as Record<string, unknown>).shortfallCredits,
      );
      const perHbar = Number((body as Record<string, unknown>).creditsPerHbar);
      if (
        Number.isFinite(shortfall) &&
        shortfall > 0 &&
        Number.isFinite(perHbar) &&
        perHbar > 0
      ) {
        return { shortfallCredits: shortfall, creditsPerHbar: perHbar };
      }
    }
  }
  return null;
};

const registerLocalA2aAgent = async (
  client: RegistryBrokerClient,
  local: LocalA2AAgentHandle,
): Promise<string> => {
  const publicBase =
    (local.publicUrl && local.publicUrl.replace(/\/$/, '')) || null;
  const localBase = local.baseUrl.replace(/\/$/, '');
  const reachableBase = publicBase ?? localBase;
  if (!reachableBase) {
    throw new Error('Local A2A agent is missing a reachable base URL');
  }

  const profile: HCS11Profile = {
    version: '1.0',
    type: ProfileType.AI_AGENT,
    display_name: `HCS-10 Local Bridge (${local.agentId})`,
    alias: local.agentId,
    bio: 'Local A2A bridge agent used by the HCS-10 cross-protocol chat demo.',
    properties: {
      tags: ['demo', 'hcs-10', 'a2a'],
    },
    socials: [],
    aiAgent: {
      type: AIAgentType.MANUAL,
      model: 'hcs10-local-bridge',
      capabilities: [AIAgentCapability.TEXT_GENERATION],
      creator: 'standards-sdk demo',
    },
  };

  const payload: AgentRegistrationRequest = {
    profile,
    protocol: 'a2a',
    communicationProtocol: 'a2a',
    registry: TARGET_REGISTRY,
    endpoint: `${reachableBase}/.well-known/agent.json`,
    metadata: {
      adapter: 'nanda-adapter',
      source: 'hcs10-demo',
      tunnelUrl: local.publicUrl,
      localEndpoint: local.localA2aEndpoint,
      nativeId: local.agentId,
    },
  };

  const response: RegisterAgentResponse = await client.registerAgent(payload);
  const attemptId = response.attemptId?.trim();
  if (attemptId) {
    await client.waitForRegistrationCompletion(attemptId, {
      intervalMs: 1_000,
      timeoutMs: 60_000,
      throwOnFailure: false,
    });
  }

  const uaid = response.uaid?.trim();
  if (!uaid) {
    throw new Error('Local A2A agent registration did not return a UAID');
  }

  await waitForAgentAvailability(client, uaid, 60_000);
  return uaid;
};

interface CreditTopUpContext {
  client: RegistryBrokerClient;
  ledgerAccountId?: string;
  ledgerPrivateKey?: string;
  context: string;
  metadata?: Record<string, unknown>;
}

const attemptWithCreditTopup = async <T>(
  operation: () => Promise<T>,
  params: CreditTopUpContext,
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    const shortfall = extractCreditShortfall(error);
    const canTopUp =
      params.ledgerAccountId &&
      params.ledgerPrivateKey &&
      (shortfall ||
        (error instanceof RegistryBrokerError && error.status === 402));

    if (!canTopUp) {
      throw error;
    }

    const hbarAmount = shortfall
      ? Math.max(shortfall.shortfallCredits / shortfall.creditsPerHbar, 0.01)
      : FALLBACK_TOPUP_HBAR;
    const logMessage = shortfall
      ? `Insufficient registry credits (${shortfall.shortfallCredits}) during ${params.context}; purchasing ~${hbarAmount.toFixed(4)} HBAR...`
      : `Credit balance unavailable during ${params.context}; purchasing fallback ${hbarAmount.toFixed(4)} HBAR...`;
    logger.warn(logMessage);

    await withRequestTimeout(
      params.client.purchaseCreditsWithHbar({
        accountId: params.ledgerAccountId!,
        privateKey: params.ledgerPrivateKey!,
        hbarAmount,
        memo: `hcs-10-chat-${params.context}`,
        metadata: params.metadata,
      }),
      `purchaseCreditsWithHbar (${params.context})`,
    );

    return await operation();
  }
};

const resolveDockerReachableUrl = (raw: string): string => {
  try {
    const url = new URL(raw);
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      const bridgeHost =
        process.env.LOCAL_AGENT_DOCKER_HOST?.trim() || 'localhost';
      url.hostname = bridgeHost;
      return url.toString();
    }
  } catch {
    return raw;
  }
  return raw;
};

const ensureAgentRegistration = async ({
  client,
  uaid,
  profile,
  network,
  accountId,
  ledgerAccountId,
  ledgerPrivateKey,
}: {
  client: RegistryBrokerClient;
  uaid: string;
  profile: HCS11Profile;
  network: 'mainnet' | 'testnet';
  accountId: string;
  ledgerAccountId?: string;
  ledgerPrivateKey?: string;
}): Promise<string> => {
  const attemptResolve = async (
    candidate: string | undefined,
  ): Promise<string | null> => {
    if (!candidate) {
      return null;
    }
    try {
      await withRequestTimeout(
        client.resolveUaid(candidate),
        'resolveUaid pre-registration',
      );
      logger.info(`UAID ${candidate} already present in registry.`);
      return candidate;
    } catch (error) {
      const notFound =
        error instanceof RegistryBrokerError && error.status === 404;
      if (notFound) {
        return null;
      }
      throw error;
    }
  };

  const existingRegistryUaid = uaid.startsWith('uaid:aid:')
    ? await attemptResolve(uaid)
    : null;
  if (existingRegistryUaid) {
    return existingRegistryUaid;
  }

  const nativeId = toHederaCaip10(network, accountId);
  const registrationProfile: HCS11Profile = {
    ...profile,
    base_account: accountId,
    properties: {
      ...(profile.properties ?? {}),
      network,
      registry: TARGET_REGISTRY,
      nativeId,
    },
  };

  const customFields: Record<string, string> = {
    network,
    registry: TARGET_REGISTRY,
    nativeId,
    accountId,
  };
  if (registrationProfile.inboundTopicId) {
    customFields.inboundTopicId = registrationProfile.inboundTopicId;
  }
  if (registrationProfile.outboundTopicId) {
    customFields.outboundTopicId = registrationProfile.outboundTopicId;
  }

  logger.info(
    `Registering agent with Registry Broker (${TARGET_REGISTRY}, hcs-10)...`,
  );
  let registration;
  const attemptRegistration = async (): Promise<void> => {
    registration = await withRequestTimeout(
      client.registerAgent(
        {
          profile: registrationProfile,
          protocol: 'hcs-10',
          communicationProtocol: 'hcs-10',
          registry: TARGET_REGISTRY,
          metadata: {
            adapter: 'openconvai-adapter',
            openConvAICompatible: true,
            customFields,
          },
        },
        undefined,
      ),
      'registerAgent',
    );
  };
  await attemptWithCreditTopup(attemptRegistration, {
    client,
    ledgerAccountId,
    ledgerPrivateKey,
    context: 'registration',
    metadata: { uaid },
  });

  if (!registration.success) {
    throw new Error(
      `Registry broker registration failed: ${registration.message ?? 'unknown error'}`,
    );
  }

  const registryUaid = registration.uaid ?? uaid;
  logger.info(
    `Registry broker registration ${registration.status ?? 'created'} for ${registryUaid}`,
  );
  return registryUaid;
};

const run = async (): Promise<void> => {
  const config = readConfig();
  logger.info('=== HCS-10 Cross-Protocol Chat Demo ===');
  logger.info(`Registry Broker: ${config.baseUrl}`);
  const network = resolveNetwork(config.baseUrl);
  logger.info(`Derived Hedera network: ${network}`);

  const scopedAccountId = resolveNetworkScopedLedgerValue(
    network,
    'ACCOUNT_ID',
  );
  const scopedPrivateKey = resolveNetworkScopedLedgerValue(
    network,
    'PRIVATE_KEY',
  );

  const ledgerAccountId = scopedAccountId ?? config.ledgerAccountId;
  const ledgerPrivateKey = scopedPrivateKey ?? config.ledgerPrivateKey;

  if (!ledgerAccountId || !ledgerPrivateKey) {
    throw new Error(
      'Set HEDERA_ACCOUNT_ID/HEDERA_PRIVATE_KEY (or MAINNET_/TESTNET_ variants) before running the HCS-10 chat demo.',
    );
  }

  logger.info(`Ledger Account: ${ledgerAccountId}`);

  const hederaAccountId = ledgerAccountId;
  const hederaPrivateKey = ledgerPrivateKey;
  const clientOptions = {
    baseUrl: config.baseUrl,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  };

  const userClient = new RegistryBrokerClient(clientOptions);
  const registrationClient = new RegistryBrokerClient(clientOptions);
  const brokerHost = (() => {
    try {
      return new URL(config.baseUrl).hostname;
    } catch {
      return config.baseUrl;
    }
  })();
  const brokerIsLocal =
    brokerHost === '127.0.0.1' ||
    brokerHost === 'localhost' ||
    brokerHost === '::1';

  await assertAdapterSupport(userClient, config.baseUrl, config.adapterCheck);
  logger.info(`Broker adapter check: ${config.adapterCheck} available.`);

  logger.info('Starting local HCS-10 demo agent (Bob)...');
  const recreateAgent =
    process.env.HCS10_CHAT_RECREATE_AGENT?.toLowerCase() === 'true';
  const hcsAgent = await startDemoHcs10Agent({
    registryUrl: config.baseUrl,
    hederaAccountId,
    hederaPrivateKey,
    hederaNetwork: network,
    enableDemoPfp: false,
    reuseExistingAgent: !recreateAgent,
    startupTimeoutMs:
      Number.parseInt(process.env.HCS10_AGENT_STARTUP_TIMEOUT_MS ?? '', 10) ||
      240_000,
  });

  try {
    const hcs11Client = new HCS11Client({
      network,
      auth: {
        operatorId: hederaAccountId,
        privateKey: hederaPrivateKey,
      },
    });

    logger.info('Fetching HCS-11 profile for demo agent...');
    const profileResult = await hcs11Client.fetchProfileByAccountId(
      hcsAgent.accountId,
      network,
    );

    if (!profileResult.success || !profileResult.profile?.uaid) {
      throw new Error(
        `Unable to resolve UAID for agent account ${hcsAgent.accountId}: ${profileResult.error ?? 'profile is missing UAID'}`,
      );
    }

    const profileUaid = profileResult.profile.uaid;
    const enrichedProfile: HCS11Profile = {
      ...profileResult.profile,
      inboundTopicId:
        profileResult.profile.inboundTopicId ?? hcsAgent.inboundTopicId,
      outboundTopicId:
        profileResult.profile.outboundTopicId ?? hcsAgent.outboundTopicId,
      base_account: hcsAgent.accountId,
      properties: {
        ...(profileResult.profile.properties ?? {}),
        network,
      },
    };
    await registrationClient.authenticateWithLedgerCredentials({
      accountId: ledgerAccountId,
      network: `hedera:${network}`,
      hederaPrivateKey: ledgerPrivateKey,
      label: 'registration client',
      logger,
    });
    const registryUaid = await ensureAgentRegistration({
      client: registrationClient,
      uaid: profileUaid,
      profile: enrichedProfile,
      network,
      accountId: hcsAgent.accountId,
      ledgerAccountId,
      ledgerPrivateKey,
    });
    if (registryUaid !== profileUaid) {
      logger.warn(
        `Registry UAID (${registryUaid}) differs from profile UAID (${profileUaid}); continuing with registry-provided identifier.`,
      );
    }
    const parsedDid = parseHcs14Did(registryUaid);
    const routedAgentId =
      typeof parsedDid.params?.uid === 'string'
        ? parsedDid.params.uid.trim()
        : '';
    if (!routedAgentId) {
      throw new Error(
        `Registry UAID ${registryUaid} is missing a uid parameter; cannot route to the HCS-10 agent.`,
      );
    }
    const registryFromUaid = (
      typeof parsedDid.params?.registry === 'string' &&
      parsedDid.params.registry.trim().length > 0
        ? parsedDid.params.registry.trim()
        : TARGET_REGISTRY
    ).toLowerCase();

    logger.info(`Profile UAID: ${profileUaid}`);
    logger.info(`Registry UAID: ${registryUaid}`);
    logger.info(`Resolved agent identifier from UAID: ${routedAgentId}`);
    logger.info(
      `Ensuring UAID is available in the ${registryFromUaid} registry...`,
    );
    try {
      try {
        await waitForAgentAvailability(userClient, registryUaid, 120_000);
      } catch (error) {
        logger.warn(
          `UAID ${registryUaid} did not become available: ${describeError(error)}`,
        );
      }
    } catch (error) {
      throw new Error(
        `UAID ${registryUaid} did not become available: ${describeError(error)}`,
      );
    }

    await userClient.authenticateWithLedgerCredentials({
      accountId: ledgerAccountId,
      network: `hedera:${network}`,
      hederaPrivateKey: ledgerPrivateKey,
      label: 'user client',
      logger,
    });

    const resolvedAgent = await withRequestTimeout(
      userClient.resolveUaid(registryUaid),
      'resolveUaid post-registration',
    );
    const resolvedName =
      resolvedAgent?.profile?.displayName ??
      resolvedAgent?.profile?.name ??
      resolvedAgent?.uaid ??
      registryUaid;
    logger.info(`Resolved agent profile: ${resolvedName}`);

    if (!brokerIsLocal) {
      logger.info(
        'Skipping local A2A roundtrip because registry broker is remote and cannot reach localhost.',
      );
      const hcsSession = await attemptWithCreditTopup(
        () =>
          withRequestTimeout(
            userClient.chat.createSession({
              uaid: registryUaid,
            }),
            'chat.createSession',
          ),
        {
          client: userClient,
          ledgerAccountId,
          ledgerPrivateKey,
          context: 'session',
          metadata: { uaid: registryUaid },
        },
      );

      logger.info(`Created HCS-10 chat session: ${hcsSession.sessionId}`);
      const hcsResponse = await attemptWithCreditTopup(
        () =>
          withRequestTimeout(
            userClient.chat.sendMessage({
              sessionId: hcsSession.sessionId,
              message: config.prompt,
              uaid: registryUaid,
            }),
            'chat.sendMessage (hcs-10)',
          ),
        {
          client: userClient,
          ledgerAccountId,
          ledgerPrivateKey,
          context: 'message',
          metadata: { uaid: registryUaid },
        },
      );
      const hcsMessage = normaliseMessage(hcsResponse);
      logger.info('HCS-10 agent response:');
      logger.info(`  ${hcsMessage}`);

      await withRequestTimeout(
        userClient.chat.endSession(hcsSession.sessionId),
        'chat.endSession (hcs-10)',
      );
      return;
    }

    const explicitPort = process.env.REGISTRY_BROKER_DEMO_A2A_PORT
      ? Number(process.env.REGISTRY_BROKER_DEMO_A2A_PORT)
      : undefined;
    const explicitPublicUrl =
      process.env.REGISTRY_BROKER_DEMO_A2A_PUBLIC_URL?.trim() || undefined;

    const localAgent = await startLocalA2AAgent({
      agentId: `interop-local-${Date.now()}`,
      port: Number.isFinite(explicitPort) ? explicitPort : undefined,
      publicUrl: explicitPublicUrl,
    });
    logger.info(`Started local A2A agent at ${localAgent.baseUrl}`);

    let localUaid: string | null = null;
    try {
      localUaid = await attemptWithCreditTopup(
        () => registerLocalA2aAgent(userClient, localAgent),
        {
          client: userClient,
          ledgerAccountId,
          ledgerPrivateKey,
          context: 'local-a2a-registration',
          metadata: { source: 'hcs10-demo' },
        },
      );
      logger.info(`Registered local A2A agent with UAID: ${localUaid}`);
    } catch (error) {
      logger.warn(
        `Failed to register local A2A agent with broker, falling back to direct JSON-RPC: ${describeError(error)}`,
      );
    }

    const sendLocalA2aMessage = async (
      endpoint: string,
      messageText: string,
    ): Promise<string> => {
      const body = {
        jsonrpc: '2.0',
        id: `hcs10-local-${Date.now().toString(36)}`,
        method: 'message/send',
        params: {
          message: {
            kind: 'message',
            messageId: `msg-${Date.now().toString(36)}`,
            role: 'user',
            parts: [
              {
                kind: 'text',
                text: messageText,
              },
            ],
          },
        },
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return `Local A2A agent returned non-JSON response (status ${response.status}).`;
      }

      const isRecord = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null && !Array.isArray(value);

      if (!isRecord(payload)) {
        return `Local A2A agent returned unexpected payload: ${JSON.stringify(
          payload,
        )}`;
      }

      const result = payload.result;
      if (!isRecord(result)) {
        return `Local A2A agent response missing result: ${JSON.stringify(
          payload,
        )}`;
      }

      const parts = result.parts;
      if (!Array.isArray(parts) || parts.length === 0) {
        return `Local A2A agent response missing parts: ${JSON.stringify(
          result,
        )}`;
      }

      const first = parts[0];
      if (!isRecord(first) || typeof first.text !== 'string') {
        return `Local A2A agent response missing text part: ${JSON.stringify(
          first,
        )}`;
      }

      const text = first.text.trim();
      return text.length > 0
        ? text
        : `Local A2A agent returned an empty message.`;
    };

    await withAgentGuard(localAgent, async () => {
      const hcsSession = await attemptWithCreditTopup(
        () =>
          withRequestTimeout(
            userClient.chat.createSession({
              uaid: registryUaid,
            }),
            'chat.createSession',
          ),
        {
          client: userClient,
          ledgerAccountId,
          ledgerPrivateKey,
          context: 'session',
          metadata: { uaid: registryUaid },
        },
      );

      logger.info(`Created HCS-10 chat session: ${hcsSession.sessionId}`);
      const hcsResponse = await attemptWithCreditTopup(
        () =>
          withRequestTimeout(
            userClient.chat.sendMessage({
              sessionId: hcsSession.sessionId,
              message: config.prompt,
              uaid: registryUaid,
            }),
            'chat.sendMessage (hcs-10)',
          ),
        {
          client: userClient,
          ledgerAccountId,
          ledgerPrivateKey,
          context: 'message',
          metadata: { uaid: registryUaid },
        },
      );
      const hcsMessage = normaliseMessage(hcsResponse);
      logger.info('HCS-10 agent response:');
      logger.info(`  ${hcsMessage}`);

      await withRequestTimeout(
        userClient.chat.endSession(hcsSession.sessionId),
        'chat.endSession (hcs-10)',
      );

      const localPrompt = `HCS-10 agent replied with: "${hcsMessage}". Craft a friendly acknowledgement.`;

      if (localUaid) {
        const localSession = await attemptWithCreditTopup(
          () =>
            withRequestTimeout(
              userClient.chat.createSession({
                uaid: localUaid as string,
              }),
              'chat.createSession (local-a2a)',
            ),
          {
            client: userClient,
            ledgerAccountId,
            ledgerPrivateKey,
            context: 'session-local-a2a',
            metadata: { uaid: localUaid },
          },
        );

        const localResponse = await attemptWithCreditTopup(
          () =>
            withRequestTimeout(
              userClient.chat.sendMessage({
                sessionId: localSession.sessionId,
                uaid: localUaid as string,
                message: localPrompt,
              }),
              'chat.sendMessage (local-a2a)',
            ),
          {
            client: userClient,
            ledgerAccountId,
            ledgerPrivateKey,
            context: 'message-local-a2a',
            metadata: { uaid: localUaid },
          },
        );

        const localMessage = normaliseMessage(localResponse);
        logger.info('Local A2A agent response via broker:');
        logger.info(`  ${localMessage}`);

        await withRequestTimeout(
          userClient.chat.endSession(localSession.sessionId),
          'chat.endSession (local-a2a)',
        );
      } else {
        const localMessage = await sendLocalA2aMessage(
          localAgent.localA2aEndpoint,
          localPrompt,
        );
        logger.info('Local A2A agent response (direct):');
        logger.info(`  ${localMessage}`);
      }
    });
  } finally {
    await hcsAgent.stop().catch(error => {
      logger.warn(
        `Failed to cleanly stop HCS-10 demo agent: ${describeError(error)}`,
      );
    });
  }
};

run()
  .then(() => {
    logger.info('Demo complete.');
    process.exit(0);
  })
  .catch(error => {
    logger.error('Demo failed', describeError(error));
    process.exit(1);
  });
