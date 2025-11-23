import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import { RegistryBrokerClient } from '../../src/services/registry-broker';
import registerDemoAgent, { type RegisteredAgent } from './register-agent';
import {
  startLocalA2AAgent,
  type LocalA2AAgentHandle,
} from '../utils/local-a2a-agent';
import { waitForAgentAvailability } from '../utils/registry-broker';
import { resolveHederaLedgerAuthConfig } from '../utils/ledger-config';

interface DemoConfig {
  baseUrl: string;
  agentHost: string;
  agentProtocol: 'http' | 'https';
  firstAgentPort: number;
  ledgerTtlMinutes: number;
}

const DEFAULT_AGENT_HOST = 'localhost';
const DEFAULT_AGENT_PORT = 7100;

const resolveConfig = (): DemoConfig => {
  const baseUrl =
    process.env.REGISTRY_BROKER_BASE_URL?.trim() ??
    'https://hol.org/registry/api/v1';
  const agentHost =
    process.env.REGISTRY_BROKER_DEMO_AGENT_HOST?.trim() || DEFAULT_AGENT_HOST;
  const protocolRaw =
    process.env.REGISTRY_BROKER_DEMO_AGENT_PROTOCOL?.trim() ?? 'http';
  const agentProtocol: 'http' | 'https' =
    protocolRaw.toLowerCase() === 'https' ? 'https' : 'http';
  const portRaw = process.env.REGISTRY_BROKER_DEMO_AGENT_PORT?.trim();
  const firstAgentPort = portRaw ? Number(portRaw) : DEFAULT_AGENT_PORT;
  if (!Number.isFinite(firstAgentPort) || firstAgentPort <= 0) {
    throw new Error(
      `REGISTRY_BROKER_DEMO_AGENT_PORT must be a positive integer. Received ${portRaw}.`,
    );
  }
  const ledgerTtlMinutes = Number(
    process.env.REGISTRY_BROKER_LEDGER_AUTH_TTL_MINUTES ?? '30',
  );
  return {
    baseUrl,
    agentHost,
    agentProtocol,
    firstAgentPort: Math.floor(firstAgentPort),
    ledgerTtlMinutes:
      Number.isFinite(ledgerTtlMinutes) && ledgerTtlMinutes > 0
        ? Math.floor(ledgerTtlMinutes)
        : 30,
  };
};

const buildAgentPublicUrl = (config: DemoConfig, port: number): string =>
  `${config.agentProtocol}://${config.agentHost}:${port}`;

const ensureCreditBalance = async (
  client: RegistryBrokerClient,
  ledger: { accountId: string; privateKey: string },
): Promise<void> => {
  const hbarAmount = Number(
    process.env.ENCRYPTED_DEMO_CREDIT_TOP_UP_HBAR ?? '20',
  );
  if (!Number.isFinite(hbarAmount) || hbarAmount <= 0) {
    console.log('  ⚠️  Skipping credit top-up (no HBAR amount configured).');
    return;
  }
  console.log(`  💸 Purchasing ${hbarAmount}ℏ to cover demo registrations...`);
  await client.purchaseCreditsWithHbar({
    accountId: ledger.accountId,
    privateKey: ledger.privateKey,
    hbarAmount,
    memo: 'registry-broker-encrypted-chat-demo',
    metadata: { purpose: 'encrypted-chat-demo' },
  });
  console.log('  💰 Credit purchase complete.');
};

const registerLocalAgent = async (
  client: RegistryBrokerClient,
  alias: string,
  handle: LocalA2AAgentHandle,
): Promise<RegisteredAgent> => {
  const endpoint = handle.publicUrl ?? handle.a2aEndpoint;
  const agent = await registerDemoAgent(client, alias, endpoint, 'ai', {
    skipAdditionalRegistryUpdate: true,
    additionalRegistries: [],
    updateAdditionalRegistries: [],
  });
  await waitForAgentAvailability(client, agent.uaid, 60_000);
  console.log(`  ✅ Registered ${alias}: ${agent.uaid}`);
  return agent;
};

const startDemo = async (): Promise<void> => {
  const config = resolveConfig();
  const hedera = resolveHederaLedgerAuthConfig();
  const adminClient = new RegistryBrokerClient({ baseUrl: config.baseUrl });

  console.log('\n🚀 Starting encrypted chat demo');
  console.log(`  ⚙️  Broker API: ${config.baseUrl}`);
  console.log(
    `  🛰️  Local agents: ${config.agentProtocol}://${config.agentHost}:${config.firstAgentPort}/${config.firstAgentPort + 1}`,
  );

  console.log('\n🔐 Authenticating via Hedera ledger...');
  let lastError: unknown;
  let ledgerCredentials: { accountId: string; privateKey: string } | null =
    null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await adminClient.authenticateWithLedgerCredentials({
        accountId: hedera.accountId,
        network: `hedera:${hedera.network}`,
        hederaPrivateKey: hedera.privateKey,
        expiresInMinutes: config.ledgerTtlMinutes,
        label: 'encrypted-chat-demo',
      });
      console.log(
        `  🔑 Ledger authenticated for ${hedera.accountId} (${hedera.network}).`,
      );
      ledgerCredentials = {
        accountId: hedera.accountId,
        privateKey: hedera.privateKey,
      };
      break;
    } catch (error) {
      lastError = error;
      console.warn(
        `  Ledger auth attempt ${attempt + 1} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await delay(1000 * (attempt + 1));
      if (attempt === 4) {
        throw lastError instanceof Error
          ? lastError
          : new Error('Ledger authentication failed');
      }
    }
  }

  if (!ledgerCredentials) {
    throw lastError instanceof Error
      ? lastError
      : new Error('Ledger authentication failed');
  }

  console.log('\n💳 Ensuring sufficient credits for agent registration...');
  await ensureCreditBalance(adminClient, ledgerCredentials);

  console.log('\n🤖 Bootstrapping local demo agents...');

  const agentHandles: LocalA2AAgentHandle[] = [];
  try {
    console.log('Starting ephemeral local agents...');
    const requesterHandle = await startLocalA2AAgent({
      agentId: 'encrypted-demo-requester',
      port: config.firstAgentPort,
      publicUrl: buildAgentPublicUrl(config, config.firstAgentPort),
    });
    agentHandles.push(requesterHandle);
    const responderPort = config.firstAgentPort + 1;
    const responderHandle = await startLocalA2AAgent({
      agentId: 'encrypted-demo-responder',
      port: responderPort,
      publicUrl: buildAgentPublicUrl(config, responderPort),
    });
    agentHandles.push(responderHandle);

    console.log('\n🗂️  Registering demo agents in Registry Broker...');
    const requesterAgent = await registerLocalAgent(
      adminClient,
      'Encrypted Demo Requester',
      requesterHandle,
    );
    const responderAgent = await registerLocalAgent(
      adminClient,
      'Encrypted Demo Responder',
      responderHandle,
    );

    console.log('\n🔑 Registering long-term encryption keys...');
    const sharedHeaders = adminClient.getDefaultHeaders();
    const requesterSetup = await RegistryBrokerClient.initializeAgent({
      baseUrl: config.baseUrl,
      defaultHeaders: sharedHeaders,
      uaid: requesterAgent.uaid,
      encryption: { autoDecryptHistory: true },
      ensureEncryptionKey: {
        uaid: requesterAgent.uaid,
        generateIfMissing: true,
        label: 'encrypted-chat-demo-requester',
      },
    });
    console.log(
      `  🔐 Registered encryption key for requester (${requesterAgent.uaid}).`,
    );
    const responderSetup = await RegistryBrokerClient.initializeAgent({
      baseUrl: config.baseUrl,
      defaultHeaders: sharedHeaders,
      uaid: responderAgent.uaid,
      encryption: { autoDecryptHistory: true },
      ensureEncryptionKey: {
        uaid: responderAgent.uaid,
        generateIfMissing: true,
        label: 'encrypted-chat-demo-responder',
      },
    });
    console.log(
      `  🔐 Registered encryption key for responder (${responderAgent.uaid}).`,
    );
    const requesterClient = requesterSetup.client;
    const responderClient = responderSetup.client;

    let resolveSessionId: ((sessionId: string) => void) | undefined;
    const sessionIdPromise = new Promise<string>(resolve => {
      resolveSessionId = resolve;
    });

    console.log('\n🤝 Establishing encrypted conversation...');
    const requesterConversationPromise = requesterClient.chat.startConversation(
      {
        uaid: responderAgent.uaid,
        senderUaid: requesterAgent.uaid,
        encryption: { preference: 'required' },
        onSessionCreated: sessionId => {
          console.log(`  📬 Session ready: ${sessionId}`);
          resolveSessionId?.(sessionId);
        },
      },
    );
    const responderConversationPromise = sessionIdPromise.then(sessionId =>
      responderClient.chat.acceptConversation({
        sessionId,
        responderUaid: responderAgent.uaid,
        encryption: { preference: 'required' },
      }),
    );
    const [requesterConversation, responderConversation] = await Promise.all([
      requesterConversationPromise,
      responderConversationPromise,
    ]);
    console.log(
      `  🤝 Handshake complete → ${requesterConversation.summary?.algorithm ?? 'aes-gcm'}.`,
    );

    console.log('\n📨 Sending ciphertext via /chat/message...');
    await requesterConversation.send({
      plaintext: 'Hello from the encrypted chat demo!',
    });
    const requesterHistory = await requesterClient.chat.getHistory(
      requesterConversation.sessionId,
      { decrypt: true },
    );
    const responderViewOfRequester = await responderClient.chat.getHistory(
      requesterConversation.sessionId,
      { decrypt: true },
    );
    const latestRequester = requesterHistory.decryptedHistory?.at(-1);
    const latestResponderView =
      responderViewOfRequester.decryptedHistory?.at(-1);
    console.log(
      `  🧑‍🚀 Requester decrypted: ${
        latestRequester?.plaintext ?? '[no ciphertext found]'
      }`,
    );
    console.log(
      `  🤖 Responder decrypted locally: ${
        latestResponderView?.plaintext ?? '[no ciphertext found]'
      }`,
    );

    console.log('\n📨 Responder sending a reply...');
    await responderConversation.send({
      plaintext: 'Responder received your message and says hello back!',
    });
    const responderHistory = await responderClient.chat.getHistory(
      requesterConversation.sessionId,
      { decrypt: true },
    );
    const requesterViewOfResponder = await requesterClient.chat.getHistory(
      requesterConversation.sessionId,
      { decrypt: true },
    );
    const latestResponder = responderHistory.decryptedHistory?.at(-1);
    const latestRequesterView =
      requesterViewOfResponder.decryptedHistory?.at(-1);
    console.log(
      `  🤖 Responder decrypted locally and requester sees: ${
        latestRequesterView?.plaintext ?? '[no ciphertext found]'
      }`,
    );

    console.log('\n✅ Demo complete. Session summary:');
    console.log(`   • Requester: ${requesterAgent.uaid}`);
    console.log(`   • Responder: ${responderAgent.uaid}`);
    console.log(`   • Session:   ${requesterConversation.sessionId}`);
  } finally {
    await Promise.all(
      agentHandles.map(async handle => {
        try {
          await handle.stop();
        } catch (error) {
          console.warn(
            `Failed to stop local agent ${handle.agentId}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }),
    );
  }
};

startDemo().catch(error => {
  console.error('Encrypted chat demo failed:', error);
  process.exitCode = 1;
});
