import 'dotenv/config';
import { PrivateKey } from '@hashgraph/sdk';
import { RegistryBrokerClient } from '../../src/services/registry-broker';

type LedgerNetwork = 'mainnet' | 'testnet';

const baseUrl =
  process.env.REGISTRY_BROKER_BASE_URL?.trim() ||
  'http://127.0.0.1:4000/api/v1';
const apiKey = process.env.OPENROUTER_API_KEY?.trim();
if (!apiKey) {
  throw new Error('OPENROUTER_API_KEY is required for this demo');
}

const modelId =
  process.env.OPENROUTER_MODEL_ID?.trim() || 'anthropic/claude-3.5-sonnet';
const agentUrl = modelId.startsWith('openrouter://')
  ? modelId
  : `openrouter://${modelId}`;

const isLocalBroker = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return url.includes('localhost') || url.includes('127.0.0.1');
  }
};

const resolvePreferredNetwork = (): LedgerNetwork => {
  const declared =
    process.env.HEDERA_NETWORK?.trim().toLowerCase() === 'mainnet'
      ? 'mainnet'
      : 'testnet';
  if (isLocalBroker(baseUrl) && declared === 'mainnet') {
    return 'testnet';
  }
  return declared;
};

const ledgerNetwork = resolvePreferredNetwork();
const ledgerEnvLabel = ledgerNetwork === 'mainnet' ? 'MAINNET' : 'TESTNET';

const resolveLedgerCredential = (
  kind: 'ACCOUNT_ID' | 'PRIVATE_KEY',
): string | undefined => {
  const prefix = ledgerNetwork === 'mainnet' ? 'MAINNET' : 'TESTNET';
  const scopedKey = `${prefix}_HEDERA_${kind}` as keyof NodeJS.ProcessEnv;
  const scoped = process.env[scopedKey];
  if (typeof scoped === 'string' && scoped.trim().length > 0) {
    return scoped.trim();
  }
  const genericKey = `HEDERA_${kind}` as keyof NodeJS.ProcessEnv;
  const generic = process.env[genericKey];
  if (typeof generic === 'string' && generic.trim().length > 0) {
    return generic.trim();
  }
  return undefined;
};

const ledgerAccountId = resolveLedgerCredential('ACCOUNT_ID');
const ledgerPrivateKey = resolveLedgerCredential('PRIVATE_KEY');

const run = async () => {
  const client = new RegistryBrokerClient({ baseUrl });
  if (!ledgerAccountId || !ledgerPrivateKey) {
    throw new Error(
      `Set ${ledgerEnvLabel}_HEDERA_ACCOUNT_ID and ${ledgerEnvLabel}_HEDERA_PRIVATE_KEY (or matching HEDERA_ACCOUNT_ID / HEDERA_PRIVATE_KEY) for the ${ledgerNetwork} network.`,
    );
  }

  console.log(
    `Authenticating with ledger account ${ledgerAccountId} on ${ledgerNetwork}`,
  );

  const challenge = await client.createLedgerChallenge({
    accountId: ledgerAccountId,
    network: ledgerNetwork,
  });
  const key = PrivateKey.fromString(ledgerPrivateKey);
  const signature = Buffer.from(
    key.sign(Buffer.from(challenge.message, 'utf8')),
  ).toString('base64');
  const verify = await client.verifyLedgerChallenge({
    challengeId: challenge.challengeId,
    accountId: ledgerAccountId,
    network: ledgerNetwork,
    signature,
    signatureKind: 'raw',
    publicKey: key.publicKey.toString(),
    expiresInMinutes: 10,
  });
  client.setLedgerApiKey(verify.key);

  const auth = { type: 'bearer' as const, token: apiKey };

  console.log('Creating session with', agentUrl);
  const session = await client.chat.createSession({
    agentUrl,
    auth,
    historyTtlSeconds: 900,
  });
  console.log('Session created:', session.sessionId);

  const prompt =
    'Respond with a short JSON object summarizing your capabilities (keys: "summary", "pricing").';
  const response = await client.chat.sendMessage({
    sessionId: session.sessionId,
    auth,
    message: prompt,
  });

  console.log('Chat response message:', response.message);
  console.log('Remaining history entries:', response.history.length);
};

run().catch(error => {
  console.error('Demo failed:', error);
  process.exit(1);
});
