import 'dotenv/config';
import { RegistryBrokerClient } from '../../src/services/registry-broker/client';
import { resolveEvmLedgerAuthConfig } from '../utils/ledger-config';

const DEFAULT_CREDIT_UNIT_USD = Number(process.env.CREDIT_UNIT_USD || '0.01');
const DEFAULT_BROKER_BASE_URL = 'https://hol.org/registry/api/v1';

const resolveNetwork = (override?: string) => {
  const network = (
    override ||
    process.env.CREDITS_ETH_NETWORK ||
    'base-sepolia'
  )
    .trim()
    .toLowerCase();
  switch (network) {
    case 'base':
    case 'eip155:8453':
      return { id: 'base' as const, rpc: 'https://mainnet.base.org' };
    case 'base-sepolia':
    case 'eip155:84532':
    default:
      return {
        id: 'base-sepolia' as const,
        rpc: 'https://sepolia.base.org',
      };
  }
};

const resolveCredits = (): number => {
  const value = process.env.CREDITS_AMOUNT
    ? Number(process.env.CREDITS_AMOUNT)
    : 100;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('CREDITS_AMOUNT must be a positive number.');
  }
  return value;
};

const main = async (p0: (a: any) => never) => {
  const baseUrlOverride = process.env.REGISTRY_BROKER_BASE_URL?.trim();
  const brokerBaseUrl = baseUrlOverride || DEFAULT_BROKER_BASE_URL;
  const client = new RegistryBrokerClient({
    baseUrl: baseUrlOverride,
  });

  const evmLedgerAuth = resolveEvmLedgerAuthConfig();
  const ledgerAccountId = evmLedgerAuth.accountId;
  const accountId = ledgerAccountId;
  const requestedCredits = resolveCredits();
  const network = resolveNetwork(evmLedgerAuth.network);
  const rpcUrl = process.env.CREDITS_ETH_RPC_URL?.trim() || network.rpc;
  const walletPrivateKey = evmLedgerAuth.privateKey;

  await client.authenticateWithLedgerCredentials({
    accountId: evmLedgerAuth.accountId,
    network: evmLedgerAuth.network,
    sign: evmLedgerAuth.sign,
    label: 'x402 top-up',
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

  console.log(`🔐 Purchasing credits via x402 (${network.id})...`);
  console.log(`• Account: ${accountId}`);
  console.log(`• Credits: ${credits}`);
  console.log(`• Broker:  ${brokerBaseUrl}`);

  const response = await client.buyCreditsWithX402({
    accountId,
    credits,
    description: 'x402 demo credit top-up',
    metadata: { demo: 'registry-broker-x402-topup' },
    evmPrivateKey: walletPrivateKey,
    network: network.id,
    rpcUrl,
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

main(a => {
  process.exit(0);
}).catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
