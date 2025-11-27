import 'dotenv/config';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  type AgentSearchHit,
} from '../../src/services/registry-broker';
import registerDemoAgent, { type RegisteredAgent } from './register-agent';
import {
  startLocalA2AAgent,
  type LocalA2AAgentHandle,
} from '../utils/local-a2a-agent';
import { waitForAgentAvailability } from '../utils/registry-broker';
import { resolveHederaLedgerAuthConfig } from '../utils/ledger-config';

const defaultBaseUrl = 'https://hol.org/registry/api/v1';
const defaultAlias = 'registry-ping-agent';
const defaultQuery = 'Registry Ping Agent';
const defaultRequesterAlias = 'Ping Demo Requester';
const defaultAgentHost = '0.0.0.0';
const defaultAgentPort = 7200;
const defaultLedgerTtlMinutes = 30;

const parseBoolean = (value?: string | null): boolean | undefined => {
  if (!value) {
    return undefined;
  }
  const lowered = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(lowered)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(lowered)) {
    return false;
  }
  return undefined;
};

interface PingDemoConfig {
  baseUrl: string;
}

const resolveConfig = (): PingDemoConfig => {
  const baseUrl =
    process.env.REGISTRY_BROKER_BASE_URL?.trim() || defaultBaseUrl;
  return {
    baseUrl,
  };
};

const resolvePingAgent = async (
  client: RegistryBrokerClient,
  config: PingDemoConfig,
): Promise<{ uaid: string; hit?: AgentSearchHit }> => {
  const uaidOverride = process.env.PING_AGENT_UAID?.trim();
  if (uaidOverride) {
    console.log('Using PING_AGENT_UAID override:', uaidOverride);
    return { uaid: uaidOverride };
  }

  const searchResponse = await client.search({
    q: defaultQuery,
    registries: ['a2a-registry'],
    limit: 10,
  });
  if (!searchResponse.hits.length) {
    throw new Error(
      `No agents matched query "${defaultQuery}". Provide PING_AGENT_UAID to override lookup.`,
    );
  }
  const alias = defaultAlias.toLowerCase();
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

  console.log('\n📇 Located Registry Ping Agent');
  console.log(
    `  • Display name: ${match.name ?? match.profile.display_name ?? 'unknown name'}`,
  );
  console.log(`  • Registry: ${match.registry}`);
  console.log(`  • Provider: ${match.metadata?.provider ?? 'Registry Broker'}`);
  console.log(`  • UAID: ${match.uaid}`);

  return { uaid: match.uaid, hit: match };
};

interface RequesterContext {
  agent: RegisteredAgent;
  handle: LocalA2AAgentHandle;
}

interface LedgerCredentials {
  accountId: string;
  privateKey: string;
}

interface InsufficientCreditsDetails {
  error?: string;
  shortfallCredits?: number;
  creditsPerHbar?: number;
  estimatedHbar?: number;
}

const shouldAutoTopUp = (): boolean =>
  parseBoolean(process.env.REGISTRY_BROKER_DEMO_AUTO_TOP_UP) ?? true;

const resolveTopUpAmount = (
  details?: InsufficientCreditsDetails | null,
): number => {
  const overrideRaw =
    process.env.DEMO_CREDIT_TOP_UP_HBAR?.trim() ||
    process.env.REGISTRY_BROKER_DEMO_TOP_UP_HBAR?.trim();
  if (overrideRaw) {
    const override = Number(overrideRaw);
    return Number.isFinite(override) && override > 0 ? override : 0;
  }
  if (details?.estimatedHbar && details.estimatedHbar > 0) {
    return Math.max(details.estimatedHbar * 1.1, 0.75);
  }
  if (
    details &&
    typeof details.shortfallCredits === 'number' &&
    typeof details.creditsPerHbar === 'number' &&
    details.shortfallCredits > 0 &&
    details.creditsPerHbar > 0
  ) {
    const estimated = details.shortfallCredits / details.creditsPerHbar;
    return Math.max(estimated * 1.1, 0.75);
  }
  return 1;
};

const isInsufficientCreditsError = (
  error: unknown,
): error is RegistryBrokerError & { body?: InsufficientCreditsDetails } => {
  if (!(error instanceof RegistryBrokerError)) {
    return false;
  }
  if (error.status !== 402) {
    return false;
  }
  const body = error.body as InsufficientCreditsDetails | undefined;
  return body?.error === 'insufficient_credits';
};

const maybePurchaseCredits = async (
  client: RegistryBrokerClient,
  ledger: LedgerCredentials,
  details?: InsufficientCreditsDetails | null,
): Promise<boolean> => {
  if (!shouldAutoTopUp()) {
    console.log(
      '  ⚠️  Auto top-up disabled (set REGISTRY_BROKER_DEMO_AUTO_TOP_UP=true to enable automatic purchases).',
    );
    return false;
  }
  const amount = resolveTopUpAmount(details);
  if (!amount || !Number.isFinite(amount) || amount <= 0) {
    console.log(
      '  ⚠️  Unable to determine credit top-up amount. Set DEMO_CREDIT_TOP_UP_HBAR to a positive value.',
    );
    return false;
  }
  console.log(
    `  💸 Purchasing ${amount}ℏ to cover ping demo registration (set REGISTRY_BROKER_DEMO_AUTO_TOP_UP=false to skip).`,
  );
  await client.purchaseCreditsWithHbar({
    accountId: ledger.accountId,
    privateKey: ledger.privateKey,
    hbarAmount: amount,
    memo: 'registry-ping-demo',
    metadata: { purpose: 'registry-ping-demo' },
  });
  console.log('  💰 Credit purchase complete.');
  return true;
};

const registerRequesterAgent = async (
  client: RegistryBrokerClient,
  ledger: LedgerCredentials,
): Promise<RequesterContext> => {
  console.log('\n🤖 Launching local requester agent...');
  const handle = await startLocalA2AAgent({
    agentId: 'registry-ping-demo-requester',
    port: defaultAgentPort,
    bindAddress: defaultAgentHost,
  });
  try {
    if (!handle.publicUrl) {
      await handle.stop().catch(() => undefined);
      throw new Error(
        'Failed to establish a public tunnel for the requester agent. Install `cloudflared` or set REGISTRY_BROKER_DEMO_A2A_PUBLIC_URL.',
      );
    }
    console.log(`  • Local endpoint: ${handle.localA2aEndpoint}`);
    console.log(`  • Public URL: ${handle.publicUrl}`);
    const registerAgent = () =>
      registerDemoAgent(
        client,
        defaultRequesterAlias,
        handle.publicUrl!,
        'ai',
        {
          skipAdditionalRegistryUpdate: true,
          additionalRegistries: [],
          updateAdditionalRegistries: [],
        },
      );
    let agent: RegisteredAgent;
    try {
      agent = await registerAgent();
    } catch (error) {
      if (!isInsufficientCreditsError(error)) {
        throw error;
      }
      const toppedUp = await maybePurchaseCredits(client, ledger, error.body);
      if (!toppedUp) {
        throw error;
      }
      agent = await registerAgent();
    }
    await waitForAgentAvailability(client, agent.uaid, 60_000);
    console.log(`  • Registered requester agent (${agent.uaid})`);
    return { agent, handle };
  } catch (error) {
    await handle.stop().catch(() => undefined);
    throw error;
  }
};

const run = async (): Promise<void> => {
  const config = resolveConfig();
  const hedera = resolveHederaLedgerAuthConfig();
  const apiKey = process.env.REGISTRY_BROKER_API_KEY?.trim() || undefined;
  const adminClient = new RegistryBrokerClient({
    baseUrl: config.baseUrl,
    apiKey,
  });

  console.log('\n🚀 Registry Ping Agent demo');
  console.log(`  • API base: ${config.baseUrl}`);
  console.log(
    `  • Local agent bind: http://${defaultAgentHost}:${defaultAgentPort}`,
  );

  console.log('\n🔐 Authenticating with Hedera ledger credentials...');
  await adminClient.authenticateWithLedgerCredentials({
    accountId: hedera.accountId,
    network: `hedera:${hedera.network}`,
    hederaPrivateKey: hedera.privateKey,
    label: 'ping-agent-demo',
    expiresInMinutes: defaultLedgerTtlMinutes,
  });
  adminClient.setDefaultHeader('x-account-id', hedera.accountId);
  console.log(
    `  • Ledger authenticated for ${hedera.accountId} (${hedera.network})`,
  );

  const pingAgent = await resolvePingAgent(adminClient, config);

  let requesterContext: RequesterContext | null = null;
  try {
    requesterContext = await registerRequesterAgent(adminClient, hedera);
    const sharedHeaders = adminClient.getDefaultHeaders();
    const requesterSetup = await RegistryBrokerClient.initializeAgent({
      baseUrl: config.baseUrl,
      defaultHeaders: sharedHeaders,
      uaid: requesterContext.agent.uaid,
      encryption: { autoDecryptHistory: true },
      ensureEncryptionKey: {
        uaid: requesterContext.agent.uaid,
        generateIfMissing: true,
        label: 'ping-agent-demo-requester',
      },
    });
    console.log(
      `\n🔑 Registered requester encryption key for ${requesterContext.agent.uaid}`,
    );
    const requesterClient = requesterSetup.client;

    console.log('\n✉️  Creating encrypted chat session...');
    const encryptedHandle = await requesterClient.chat.createEncryptedSession({
      uaid: pingAgent.uaid,
      senderUaid: requesterContext.agent.uaid,
      historyTtlSeconds: 900,
    });
    console.log(`  • Session ID: ${encryptedHandle.sessionId}`);

    const prompts = ['PING', 'PING?', 'PONG?'];
    for (const prompt of prompts) {
      console.log(`📨 Sending encrypted ping (${prompt})...`);
      const encryptedResponse = await encryptedHandle.send({
        plaintext: prompt,
        message: `${prompt} (encrypted transport)`,
      });

      const encryptedEntries = encryptedResponse.history.filter(entry =>
        Boolean(entry.cipherEnvelope),
      );
      console.log(
        `  • Broker stored ${encryptedEntries.length} encrypted entries (history length ${encryptedResponse.history.length}).`,
      );
      console.log('  • Decrypted history snapshot:');
      encryptedResponse.history.forEach(entry => {
        if (entry.cipherEnvelope) {
          try {
            const decrypted =
              encryptedHandle.decryptHistoryEntry(entry) ??
              '(unable to decrypt)';
            console.log(`    [${entry.role}] ${decrypted}`);
          } catch (error) {
            console.log(
              `    [${entry.role}] (decrypt error: ${
                error instanceof Error ? error.message : String(error)
              })`,
            );
          }
        } else {
          console.log(`    [${entry.role}] ${entry.content ?? ''}`);
        }
      });
      const agentLatency =
        encryptedResponse.history.filter(entry => entry.role === 'agent').at(-1)
          ?.metadata?.latencyMs ?? 'n/a';
      console.log(`  • Latency (ms): ${agentLatency}`);
    }
  } finally {
    if (requesterContext?.handle) {
      await requesterContext.handle.stop().catch(() => undefined);
    }
  }
};

run().catch(error => {
  console.error('Ping agent demo failed:', error);
  process.exit(1);
});
