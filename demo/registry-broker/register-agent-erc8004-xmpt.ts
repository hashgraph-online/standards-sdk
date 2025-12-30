import 'dotenv/config';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  RegistryBrokerParseError,
} from '../../src/services/registry-broker';
import { Logger } from '../../src/utils/logger';
import registerDemoAgent, { type RegisterAgentOptions } from './register-agent';
import { resolveDemoLedgerAuthMode } from '../utils/registry-auth';
import {
  resolveEvmLedgerAuthConfig,
  resolveHederaLedgerAuthConfig,
} from '../utils/ledger-config';
import { startLocalXmtpAgent } from '../utils/local-xmtp-agent';
import {
  createTimeoutFetchImplementation,
  normaliseMessage,
  waitForRegistryBrokerAvailability,
} from '../utils/registry-broker';

const DEFAULT_BASE_URL = 'https://hol.org/registry/api/v1';
const DEFAULT_ERC8004_NETWORKS = ['ethereum-sepolia', 'base-sepolia'];

const logger = new Logger({ module: 'demo/registry-broker-erc8004-xmtp' });

const resolvePreferredErc8004Selections = (): string[] => {
  const raw = process.env.REGISTRY_BROKER_DEMO_ERC8004_NETWORKS?.trim();
  const entries =
    raw && raw.length > 0
      ? raw
          .split(/[,\s]+/)
          .map(value => value.trim())
          .filter(Boolean)
      : DEFAULT_ERC8004_NETWORKS;
  return Array.from(
    new Set(
      entries.map(entry =>
        entry.includes(':')
          ? entry.toLowerCase()
          : `erc-8004:${entry.toLowerCase()}`,
      ),
    ),
  );
};

const describeError = (error: unknown): string => {
  if (error instanceof RegistryBrokerError) {
    return `Registry broker error ${error.status} (${error.statusText}): ${JSON.stringify(
      error.body,
    )}`;
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
  const apiKey = process.env.REGISTRY_BROKER_API_KEY?.trim();
  const ledgerMode = resolveDemoLedgerAuthMode();
  const preferLedger =
    process.env.REGISTRY_BROKER_DEMO_USE_LEDGER === '0' ? false : !apiKey;

  const encryptionEnabled = process.env.REGISTRY_BROKER_DEMO_ENCRYPTION !== '0';

  const requestTimeoutMs = Math.max(
    10_000,
    Number(process.env.REGISTRY_BROKER_DEMO_HTTP_TIMEOUT_MS ?? '120000') ||
      120_000,
  );

  logger.info('Starting ERC-8004 XMTP demo', {
    baseUrl,
    preferLedger,
    encryptionEnabled,
    requestTimeoutMs,
  });

  if (!preferLedger && !apiKey) {
    throw new Error(
      'Provide REGISTRY_BROKER_API_KEY or enable ledger authentication via REGISTRY_BROKER_DEMO_USE_LEDGER=1.',
    );
  }

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

  let ledgerAccountId: string | null = null;
  let ledgerNetwork: string | null = null;

  if (preferLedger) {
    logger.info('Authenticating with ledger credentials', { ledgerMode });
    if (ledgerMode === 'hedera') {
      const hederaLedgerConfig = resolveHederaLedgerAuthConfig();
      ledgerAccountId = hederaLedgerConfig.accountId;
      ledgerNetwork = `hedera:${hederaLedgerConfig.network}`;
      await client.authenticateWithLedgerCredentials({
        accountId: hederaLedgerConfig.accountId,
        network: `hedera:${hederaLedgerConfig.network}`,
        hederaPrivateKey: hederaLedgerConfig.privateKey,
        expiresInMinutes:
          Number(process.env.REGISTRY_BROKER_LEDGER_AUTH_TTL_MINUTES ?? '30') ||
          30,
        label: 'erc-8004 xmtp registration',
      });
      await responder.authenticateWithLedgerCredentials({
        accountId: hederaLedgerConfig.accountId,
        network: `hedera:${hederaLedgerConfig.network}`,
        hederaPrivateKey: hederaLedgerConfig.privateKey,
        expiresInMinutes:
          Number(process.env.REGISTRY_BROKER_LEDGER_AUTH_TTL_MINUTES ?? '30') ||
          30,
        label: 'erc-8004 xmtp responder',
      });
    } else if (ledgerMode === 'evm') {
      const evmLedger = resolveEvmLedgerAuthConfig();
      ledgerAccountId = evmLedger.accountId;
      ledgerNetwork = evmLedger.network;
      await client.authenticateWithLedgerCredentials({
        accountId: evmLedger.accountId,
        network: evmLedger.network,
        sign: evmLedger.sign,
        expiresInMinutes:
          Number(process.env.REGISTRY_BROKER_LEDGER_AUTH_TTL_MINUTES ?? '30') ||
          30,
        label: 'erc-8004 xmtp registration',
      });
      await responder.authenticateWithLedgerCredentials({
        accountId: evmLedger.accountId,
        network: evmLedger.network,
        sign: evmLedger.sign,
        expiresInMinutes:
          Number(process.env.REGISTRY_BROKER_LEDGER_AUTH_TTL_MINUTES ?? '30') ||
          30,
        label: 'erc-8004 xmtp responder',
      });
    } else {
      throw new Error(
        `Unsupported REGISTRY_BROKER_LEDGER_MODE "${ledgerMode}" for this demo.`,
      );
    }
    logger.info('Ledger authentication completed', {
      ledgerAccountId,
      ledgerNetwork,
    });
  }

  const alias =
    process.argv[2]?.trim() ||
    `sdk-erc8004-xmtp-demo-${Date.now().toString(36)}`;

  const xmtpAgent = await startLocalXmtpAgent({ agentId: alias });
  const endpointForBroker = xmtpAgent.endpoint;

  try {
    const erc8004Selections =
      process.env.REGISTRY_BROKER_DEMO_SKIP_ERC8004 === '1'
        ? []
        : resolvePreferredErc8004Selections();

    const registerOptions: RegisterAgentOptions = {
      updateAdditionalRegistries: erc8004Selections,
      communicationProtocol: 'xmtp',
      metadata: { xmtpAddress: xmtpAgent.address },
    };

    const registered = await registerDemoAgent(
      client,
      alias,
      endpointForBroker,
      'ai',
      registerOptions,
    );

    logger.info('Registration complete', {
      baseUrl,
      uaid: registered.uaid,
      agentId: registered.agentId,
      endpoint: endpointForBroker,
      additionalRegistries:
        registered.updateResponse?.additionalRegistries ??
        registered.registrationResponse.additionalRegistries ??
        [],
    });

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
          label: 'erc-8004 xmtp requester',
        });
        const agentKeyPair = await client.generateEncryptionKeyPair({
          envVar: 'RB_ENCRYPTION_PRIVATE_KEY_DEMO_AGENT',
        });
        await client.encryption.registerKey({
          keyType: 'secp256k1',
          publicKey: agentKeyPair.publicKey,
          uaid: registered.uaid,
          label: 'erc-8004 xmtp agent',
        });

        logger.info('Encrypted chat (encrypted history + plaintext transport)');
        let responderAccept: Promise<unknown> | null = null;
        const conversation = await client.startConversation({
          uaid: registered.uaid,
          encryption: {
            preference: 'required',
            handshakeTimeoutMs: 60_000,
            pollIntervalMs: 1_000,
          },
          onSessionCreated: sessionId => {
            responderAccept = responder.acceptConversation({
              sessionId,
              responderUaid: registered.uaid,
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
          plaintext: 'Hello from the ERC-8004 XMTP demo (encrypted history)',
          message: 'Hello from the ERC-8004 XMTP demo (encrypted history)',
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
    logger.error('ERC-8004 XMTP demo failed', { error: describeError(error) });
    throw error;
  } finally {
    await xmtpAgent.stop();
  }
};

void main();
