import 'dotenv/config';
import { PrivateKey } from '@hashgraph/sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { RegistryBrokerClient } from '../../src/services/registry-broker/client';

const DEFAULT_CREDIT_UNIT_USD = Number(
  process.env.X402_DEMO_CREDIT_UNIT_USD || '0.01',
);
const DEFAULT_BROKER_BASE_URL = 'https://registry.hashgraphonline.com/api/v1';

const resolveAccountId = (): string => {
  const account =
    process.env.X402_DEMO_ACCOUNT_ID?.trim() ||
    process.env.HEDERA_ACCOUNT_ID?.trim();
  if (!account) {
    throw new Error(
      'Set X402_DEMO_ACCOUNT_ID or HEDERA_ACCOUNT_ID to choose which credit account to top up.',
    );
  }
  return account;
};

const resolveLedgerAccountId = (): string => {
  const account =
    process.env.X402_DEMO_LEDGER_ACCOUNT_ID?.trim() ||
    process.env.HEDERA_ACCOUNT_ID?.trim() ||
    process.env.TESTNET_HEDERA_ACCOUNT_ID?.trim();
  if (!account) {
    throw new Error(
      'Set X402_DEMO_LEDGER_ACCOUNT_ID or HEDERA_ACCOUNT_ID for ledger auth.',
    );
  }
  return account;
};

const resolveLedgerPrivateKey = (): string => {
  const key =
    process.env.X402_DEMO_LEDGER_PRIVATE_KEY?.trim() ||
    process.env.HEDERA_PRIVATE_KEY?.trim() ||
    process.env.TESTNET_HEDERA_PRIVATE_KEY?.trim();
  if (!key) {
    throw new Error(
      'Set X402_DEMO_LEDGER_PRIVATE_KEY or HEDERA_PRIVATE_KEY for ledger auth.',
    );
  }
  return key;
};

const resolveLedgerNetwork = (): 'mainnet' | 'testnet' => {
  const network =
    process.env.X402_DEMO_LEDGER_NETWORK?.trim() ||
    process.env.HEDERA_NETWORK ||
    'mainnet';
  const normalized = network
    .trim()
    .toLowerCase();
  return normalized === 'testnet' ? 'testnet' : 'mainnet';
};

const resolveWalletPrivateKey = (): `0x${string}` => {
  const key = process.env.ETH_PK?.trim();
  if (!key) {
    throw new Error('ETH_PK is required to sign x402 payments.');
  }
  return key.startsWith('0x') ? (key as `0x${string}`) : (`0x${key}` as const);
};

const resolveNetwork = () => {
  const network = (process.env.X402_DEMO_NETWORK || 'base-sepolia')
    .trim()
    .toLowerCase();
  switch (network) {
    case 'base':
      return { id: 'base', chain: base, rpc: 'https://mainnet.base.org' };
    case 'base-sepolia':
    default:
      return {
        id: 'base-sepolia',
        chain: baseSepolia,
        rpc: 'https://sepolia.base.org',
      };
  }
};

const resolveCredits = (): number => {
  const value = process.env.X402_DEMO_CREDITS
    ? Number(process.env.X402_DEMO_CREDITS)
    : 100;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('X402_DEMO_CREDITS must be a positive number.');
  }
  return value;
};

const main = async () => {
  const baseUrlOverride = process.env.REGISTRY_BROKER_BASE_URL?.trim();
  const brokerBaseUrl = baseUrlOverride || DEFAULT_BROKER_BASE_URL;
  const client = new RegistryBrokerClient({
    baseUrl: baseUrlOverride,
  });

  const accountId = resolveAccountId();
  const ledgerAccountId = resolveLedgerAccountId();
  const ledgerPrivateKey = resolveLedgerPrivateKey();
  const ledgerNetwork = resolveLedgerNetwork();
  const requestedCredits = resolveCredits();
  const network = resolveNetwork();
  const rpcUrl = process.env.X402_DEMO_RPC_URL?.trim() || network.rpc;
  const walletPrivateKey = resolveWalletPrivateKey();

  console.log(`🔐 Authenticating ledger account ${ledgerAccountId} (${ledgerNetwork})...`);
  const ledgerKey = PrivateKey.fromString(ledgerPrivateKey);
  await client.authenticateWithLedger({
    accountId: ledgerAccountId,
    network: ledgerNetwork,
    sign: async (message: string) => {
      const signature = await ledgerKey.sign(Buffer.from(message, 'utf8'));
      return {
        signature: Buffer.from(signature).toString('base64'),
        signatureKind: 'raw' as const,
        publicKey: ledgerKey.publicKey.toString(),
      };
    },
  });

  const minimums = await client.getX402Minimums();
  const creditUnitUsd =
    minimums.creditUnitUsd && minimums.creditUnitUsd > 0
      ? minimums.creditUnitUsd
      : DEFAULT_CREDIT_UNIT_USD;
  const minimumUsd = Number(minimums.minimums?.[network.id]?.minUsd ?? 0);
  const minimumCredits =
    minimumUsd > 0 ? Math.ceil(minimumUsd / creditUnitUsd) : 0;
  const credits = Math.max(requestedCredits, minimumCredits);

  if (credits !== requestedCredits) {
    console.log(
      `ℹ️  Adjusted credits to ${credits} to satisfy ${network.id} minimum (${minimumUsd.toFixed(
        4,
      )} USD).`,
    );
  }

  const payer = privateKeyToAccount(walletPrivateKey);
  const walletClient = createWalletClient({
    account: payer,
    chain: network.chain,
    transport: http(rpcUrl),
  });

  console.log(`🔐 Purchasing credits via x402 (${network.id})...`);
  console.log(`• Account: ${accountId}`);
  console.log(`• Credits: ${credits}`);
  console.log(`• Broker:  ${brokerBaseUrl}`);

  const response = await client.purchaseCreditsWithX402({
    accountId,
    credits,
    description: 'x402 demo credit top-up',
    metadata: { demo: 'registry-broker-x402-topup' },
    walletClient,
  });

  console.log('✅ Purchase settled');
  console.log(`Payer:     ${response.payment?.payer ?? 'unknown'}`);
  console.log(`Credits:   ${response.creditedCredits}`);
  console.log(`Balance:   ${response.balance}`);
  if (response.payment?.settlement?.transaction) {
    console.log(
      `Settlement: ${response.payment.settlement.transaction} (${response.payment.settlement.network ?? network.id})`,
    );
  }
};

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
