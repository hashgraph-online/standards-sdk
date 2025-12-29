import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  RegistryBrokerParseError,
} from '../../src/services/registry-broker';
import { Logger } from '../../src/utils/logger';
import registerDemoAgent from './register-agent';
import { startLocalXmtpAgent } from '../utils/local-xmtp-agent';
import { resolveDemoLedgerAuthMode } from '../utils/registry-auth';
import {
  resolveEvmLedgerAuthConfig,
  resolveHederaLedgerAuthConfig,
} from '../utils/ledger-config';
import {
  assertAdapterSupport,
  normaliseMessage,
  createTimeoutFetchImplementation,
  waitForRegistryBrokerAvailability,
  waitForAgentAvailability,
} from '../utils/registry-broker';

const DEFAULT_BASE_URL = 'https://hol.org/registry/api/v1';

const logger = new Logger({ module: 'demo/registry-broker-xmtp' });

const describeError = (error: unknown): string => {
  if (error instanceof RegistryBrokerError) {
    const bodyMessage =
      typeof error.body === 'object' && error.body && 'error' in error.body
        ? String((error.body as { error?: string }).error ?? 'Unknown error')
        : typeof error.body === 'string'
          ? error.body
          : 'Unknown error';
    return `Registry broker error ${error.status} (${error.statusText}): ${bodyMessage}`;
  }

  if (error instanceof RegistryBrokerParseError) {
    return `Registry broker parse error: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const main = async (): Promise<void> => {
  const baseUrl =
    process.env.REGISTRY_BROKER_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const apiKey = process.env.REGISTRY_BROKER_API_KEY?.trim() || undefined;

  const encryptionEnabled = process.env.REGISTRY_BROKER_DEMO_ENCRYPTION !== '0';

  const requestTimeoutMs = Math.max(
    10_000,
    Number(process.env.REGISTRY_BROKER_DEMO_HTTP_TIMEOUT_MS ?? '120000') ||
      120_000,
  );

  logger.info('Starting XMTP demo', {
    baseUrl,
    useApiKey: Boolean(apiKey),
    encryptionEnabled,
    requestTimeoutMs,
  });

  const client = new RegistryBrokerClient({
    baseUrl,
    fetchImplementation: createTimeoutFetchImplementation(requestTimeoutMs),
    ...(apiKey ? { apiKey } : {}),
    ...(encryptionEnabled ? { encryption: { autoDecryptHistory: true } } : {}),
  });

  const responder = new RegistryBrokerClient({
    baseUrl,
    fetchImplementation: createTimeoutFetchImplementation(requestTimeoutMs),
    ...(apiKey ? { apiKey } : {}),
    ...(encryptionEnabled ? { encryption: { autoDecryptHistory: true } } : {}),
  });

  await waitForRegistryBrokerAvailability(client);
  logger.info('Registry Broker is reachable');

  let ledgerAuthMode: ReturnType<typeof resolveDemoLedgerAuthMode> | null =
    null;
  let ledgerAccountId: string | null = null;
  let ledgerNetwork: string | null = null;

  if (!apiKey) {
    ledgerAuthMode = resolveDemoLedgerAuthMode();
    logger.info('Authenticating with ledger credentials', {
      mode: ledgerAuthMode,
    });
    if (ledgerAuthMode === 'hedera') {
      const config = resolveHederaLedgerAuthConfig();
      ledgerAccountId = config.accountId;
      ledgerNetwork = `hedera:${config.network}`;
      await client.authenticateWithLedgerCredentials({
        accountId: config.accountId,
        network: `hedera:${config.network}`,
        hederaPrivateKey: config.privateKey,
        expiresInMinutes:
          Number(process.env.REGISTRY_BROKER_LEDGER_AUTH_TTL_MINUTES ?? '30') ||
          30,
        label: 'xmtp demo',
      });
      await responder.authenticateWithLedgerCredentials({
        accountId: config.accountId,
        network: `hedera:${config.network}`,
        hederaPrivateKey: config.privateKey,
        expiresInMinutes:
          Number(process.env.REGISTRY_BROKER_LEDGER_AUTH_TTL_MINUTES ?? '30') ||
          30,
        label: 'xmtp demo responder',
      });
    } else if (ledgerAuthMode === 'evm') {
      const config = resolveEvmLedgerAuthConfig();
      ledgerAccountId = config.accountId;
      ledgerNetwork = config.network;
      await client.authenticateWithLedgerCredentials({
        accountId: config.accountId,
        network: config.network,
        sign: config.sign,
        expiresInMinutes:
          Number(process.env.REGISTRY_BROKER_LEDGER_AUTH_TTL_MINUTES ?? '30') ||
          30,
        label: 'xmtp demo',
      });
      await responder.authenticateWithLedgerCredentials({
        accountId: config.accountId,
        network: config.network,
        sign: config.sign,
        expiresInMinutes:
          Number(process.env.REGISTRY_BROKER_LEDGER_AUTH_TTL_MINUTES ?? '30') ||
          30,
        label: 'xmtp demo responder',
      });
    } else {
      throw new Error(
        `Unsupported REGISTRY_BROKER_LEDGER_MODE "${ledgerAuthMode}" for this demo.`,
      );
    }
    logger.info('Ledger authentication completed', {
      accountId: ledgerAccountId,
      network: ledgerNetwork,
    });
  }

  await assertAdapterSupport(client, baseUrl, 'xmtp-adapter');

  const agentAHandle = await startLocalXmtpAgent({
    agentId: `xmtp-demo-a-${Date.now().toString(36)}`,
    relayEnabled: true,
  });
  const agentBHandle = await startLocalXmtpAgent({
    agentId: `xmtp-demo-b-${Date.now().toString(36)}`,
  });

  try {
    const agentA = await registerDemoAgent(
      client,
      agentAHandle.agentId,
      agentAHandle.endpoint,
      'ai',
      {
        communicationProtocol: 'xmtp',
        additionalRegistries: [],
        updateAdditionalRegistries: [],
        metadata: { xmtpAddress: agentAHandle.address },
      },
    );
    const agentB = await registerDemoAgent(
      client,
      agentBHandle.agentId,
      agentBHandle.endpoint,
      'ai',
      {
        communicationProtocol: 'xmtp',
        additionalRegistries: [],
        updateAdditionalRegistries: [],
        metadata: { xmtpAddress: agentBHandle.address },
      },
    );

    await waitForAgentAvailability(client, agentA.uaid, 120_000);
    await waitForAgentAvailability(client, agentB.uaid, 120_000);

    logger.info('XMTP demo agents ready', {
      baseUrl,
      agentA: { uaid: agentA.uaid, endpoint: agentAHandle.endpoint },
      agentB: { uaid: agentB.uaid, endpoint: agentBHandle.endpoint },
    });

    logger.info('Direct XMTP chat (broker -> agentB)');
    const direct = await client.sendMessage({
      uaid: agentB.uaid,
      message: 'Hello from the XMTP demo (direct)',
    });
    logger.info('Direct reply received', { reply: normaliseMessage(direct) });

    await delay(1500);

    logger.info('Relay XMTP chat (broker -> agentA -> agentB)');
    const relayed = await client.sendMessage({
      uaid: agentA.uaid,
      message: `relay ${agentBHandle.address} Hello from agent A (relayed)`,
    });
    logger.info('Relay reply received', { reply: normaliseMessage(relayed) });

    if (encryptionEnabled) {
      if (!ledgerAccountId || !ledgerNetwork) {
        logger.warn(
          'Skipping encrypted chat demo: ledger identity unavailable (set up ledger auth or disable via REGISTRY_BROKER_DEMO_ENCRYPTION=0).',
        );
      } else {
        logger.info('Registering encryption keys for demo identities');
        const requesterKeyPair = await client.generateEncryptionKeyPair({
          envVar: 'RB_ENCRYPTION_PRIVATE_KEY_DEMO_REQUESTER',
        });
        await client.encryption.registerKey({
          keyType: 'secp256k1',
          publicKey: requesterKeyPair.publicKey,
          ledgerAccountId,
          ledgerNetwork,
          label: 'xmtp demo requester',
        });
        const agentBKeyPair = await client.generateEncryptionKeyPair({
          envVar: 'RB_ENCRYPTION_PRIVATE_KEY_DEMO_AGENT_B',
        });
        await client.encryption.registerKey({
          keyType: 'secp256k1',
          publicKey: agentBKeyPair.publicKey,
          uaid: agentB.uaid,
          label: 'xmtp demo agentB',
        });

        logger.info('Encrypted chat (encrypted history + plaintext transport)');
        let responderAccept: Promise<unknown> | null = null;
        const conversation = await client.startConversation({
          uaid: agentB.uaid,
          encryption: {
            preference: 'required',
            handshakeTimeoutMs: 60_000,
            pollIntervalMs: 1_000,
          },
          onSessionCreated: sessionId => {
            responderAccept = responder.acceptConversation({
              sessionId,
              responderUaid: agentB.uaid,
              encryption: {
                preference: 'required',
                handshakeTimeoutMs: 60_000,
                pollIntervalMs: 1_000,
              },
            });
          },
        });
        await responderAccept;

        const encrypted = await conversation.send({
          plaintext: 'Hello from the XMTP demo (encrypted history)',
          message: 'Hello from the XMTP demo (encrypted history)',
        });
        logger.info('Encrypted reply received', {
          reply: normaliseMessage(encrypted),
          sessionId: conversation.sessionId,
        });

        const snapshot = await client.fetchHistorySnapshot(
          conversation.sessionId,
          {
            decrypt: true,
          },
        );
        const decrypted =
          snapshot.decryptedHistory?.map(entry => ({
            role: entry.entry.role,
            plaintext: entry.plaintext,
          })) ?? [];
        logger.info('Decrypted history snapshot', { decrypted });
      }
    }
  } catch (error) {
    logger.error('XMTP demo failed', { error: describeError(error) });
    throw error;
  } finally {
    await Promise.allSettled([agentAHandle.stop(), agentBHandle.stop()]);
  }
};

void main();
