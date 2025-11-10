import dotenv from 'dotenv';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
} from '../../src/services/registry-broker';
import { resolveHederaLedgerAuthConfig } from '../utils/ledger-config';

interface DemoLedgerCredentials {
  accountId: string;
  privateKey: string;
  network: 'mainnet' | 'testnet';
}

dotenv.config();

const describeError = (error: unknown): string => {
  if (error instanceof RegistryBrokerError) {
    const body =
      typeof error.body === 'object' && error.body && 'error' in error.body
        ? String((error.body as { error?: string }).error ?? 'Unknown error')
        : typeof error.body === 'string'
          ? error.body
          : 'Unknown error';
    return `Registry broker error ${error.status} (${error.statusText}): ${body}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const truncate = (value: string, max = 160): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

const resolveDemoConfig = () => ({
  baseUrl:
    process.env.REGISTRY_BROKER_BASE_URL?.trim() ||
    'https://registry.hashgraphonline.com/api/v1',
  openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim(),
  openRouterModel:
    process.env.OPENROUTER_MODEL_ID?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    'anthropic/claude-3.5-sonnet',
});

const ensureDemoCredits = async (
  client: RegistryBrokerClient,
  ledgerCredentials: DemoLedgerCredentials,
): Promise<void> => {
  if (ledgerCredentials.network !== 'testnet') {
    return;
  }
  try {
    console.log('--- Demo credit bootstrap ---');
    await client.purchaseCreditsWithHbar({
      accountId: ledgerCredentials.accountId,
      privateKey: ledgerCredentials.privateKey,
      hbarAmount: Number(process.env.DEMO_CREDIT_TOP_UP_HBAR ?? '0.25') || 0.25,
      memo: 'registry-broker-history-demo:bootstrap',
      metadata: { purpose: 'history-demo' },
    });
    console.log('  Credits purchased for demo account.');
  } catch (error) {
    console.log(
      `  Unable to auto-purchase demo credits (proceeding without bootstrap): ${describeError(error)}`,
    );
  }
};

const runHistoryFlow = async (
  client: RegistryBrokerClient,
  openRouterApiKey: string,
  openRouterModel: string,
  ledgerCredentials: DemoLedgerCredentials,
) => {
  console.log('\n=== Chat history flow ===');
  const registry = process.env.OPENROUTER_REGISTRY?.trim() || 'openrouter';

  const auth = { type: 'bearer' as const, token: openRouterApiKey };
  const session = await client.chat.createSession({
    agentUrl: openRouterModel.startsWith('openrouter://')
      ? openRouterModel
      : `openrouter://${openRouterModel}`,
    historyTtlSeconds:
      Number(process.env.CHAT_HISTORY_TTL_SECONDS ?? '1800') || 1800,
  });
  console.log(`  Session established: ${session.sessionId}`);
  await sendPrompt(
    client,
    session.sessionId,
    auth,
    'Provide a concise description of your capabilities.',
  );
  await sendPrompt(
    client,
    session.sessionId,
    auth,
    'Remember this phrase and confirm once: registry-demo-token.',
  );
  await sendPrompt(
    client,
    session.sessionId,
    auth,
    'What token did I just ask you to store?',
  );

  const snapshot = await client.chat.getHistory(session.sessionId);
  console.log(
    `  Broker reports ${snapshot.history.length} entr${snapshot.history.length === 1 ? 'y' : 'ies'} stored.`,
  );

  await attemptHistoryCompaction(client, session.sessionId, ledgerCredentials);

  const afterSnapshot = await client.chat.getHistory(session.sessionId);
  console.log(
    `  After compaction: ${afterSnapshot.history.length} entr${afterSnapshot.history.length === 1 ? 'y' : 'ies'}.`,
  );
};

const sendPrompt = async (
  client: RegistryBrokerClient,
  sessionId: string,
  auth: { type: 'bearer'; token: string },
  message: string,
) => {
  const response = await client.chat.sendMessage({
    sessionId,
    auth,
    message,
  });
  console.log(`  Agent replied: ${truncate(response.message, 200)}`);
};

const attemptHistoryCompaction = async (
  client: RegistryBrokerClient,
  sessionId: string,
  ledgerCredentials: DemoLedgerCredentials,
) => {
  const runCompaction = async () => {
    const result = await client.chat.compactHistory({
      sessionId,
      preserveEntries: Number(process.env.CHAT_HISTORY_PRESERVE ?? '4') || 4,
    });
    console.log('--- Compaction summary ---');
    console.log(`  Credits debited: ${result.creditsDebited ?? 'n/a'}`);
    console.log(
      `  Summary entry: ${truncate(result.summaryEntry.content, 200)}`,
    );
  };

  try {
    await runCompaction();
  } catch (error) {
    if (error instanceof RegistryBrokerError && error.status === 402) {
      console.log(
        '  Insufficient credits; purchasing top-up for compaction...',
      );
      await client.purchaseCreditsWithHbar({
        accountId: ledgerCredentials.accountId,
        privateKey: ledgerCredentials.privateKey,
        hbarAmount:
          Number(process.env.HISTORY_COMPACTION_TOP_UP_HBAR ?? '0.2') || 0.2,
        memo: 'registry-broker-history-demo:compaction',
        metadata: { purpose: 'history-compaction' },
      });
      await runCompaction();
      return;
    }
    console.log(`  Compaction skipped: ${describeError(error)}`);
  }
};

const main = async (p0: (a: any) => never) => {
  console.log('=== Registry Broker History Demo ===');
  const config = resolveDemoConfig();
  if (!config.openRouterApiKey) {
    throw new Error('OPENROUTER_API_KEY is required to run this demo.');
  }

  const client = new RegistryBrokerClient({
    baseUrl: config.baseUrl,
  });

  const ledgerConfig = resolveHederaLedgerAuthConfig();
  await client.authenticateWithLedgerCredentials({
    accountId: ledgerConfig.accountId,
    network: `hedera:${ledgerConfig.network}`,
    hederaPrivateKey: ledgerConfig.privateKey,
    label: 'history demo',
  });
  const ledgerCredentials: DemoLedgerCredentials = {
    accountId: ledgerConfig.accountId,
    privateKey: ledgerConfig.privateKey,
    network: ledgerConfig.network,
  };
  await ensureDemoCredits(client, ledgerCredentials);

  await runHistoryFlow(
    client,
    config.openRouterApiKey,
    config.openRouterModel,
    ledgerCredentials,
  );
};

main(a => {
  process.exit(0);
}).catch(error => {
  console.error('History demo failed:', describeError(error));
  process.exit(1);
});
