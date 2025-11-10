import { RegistryBrokerClient } from '../../src/services/registry-broker';
import { authenticateClientWithLedger } from './ledger-auth';
import {
  resolveEvmLedgerAuthConfig,
  resolveHederaLedgerAuthConfig,
} from './ledger-config';

export interface DemoLedgerAuthOptions {
  label?: string;
  expiresInMinutes?: number;
  setAccountHeader?: boolean;
}

export interface HederaLedgerAuthResult {
  accountId: string;
  network: 'mainnet' | 'testnet';
  networkCanonical: `hedera:${'mainnet' | 'testnet'}`;
  privateKey: string;
}

export interface EvmLedgerAuthResult {
  accountId: string;
  network: string;
  networkCanonical: string;
}

export const authenticateWithHederaLedger = async (
  client: RegistryBrokerClient,
  options: DemoLedgerAuthOptions = {},
): Promise<HederaLedgerAuthResult> => {
  const config = resolveHederaLedgerAuthConfig();
  await authenticateClientWithLedger({
    client,
    accountId: config.accountId,
    privateKey: config.privateKey,
    network: `hedera:${config.network}`,
    label: options.label,
    expiresInMinutes: options.expiresInMinutes,
    setAccountHeader: options.setAccountHeader,
  });
  return {
    accountId: config.accountId,
    network: config.network,
    networkCanonical: `hedera:${config.network}`,
    privateKey: config.privateKey,
  };
};

export const authenticateWithEvmLedger = async (
  client: RegistryBrokerClient,
  options: DemoLedgerAuthOptions = {},
): Promise<EvmLedgerAuthResult> => {
  const config = resolveEvmLedgerAuthConfig();
  await authenticateClientWithLedger({
    client,
    accountId: config.accountId,
    network: config.network,
    label: options.label,
    expiresInMinutes: options.expiresInMinutes,
    setAccountHeader: options.setAccountHeader,
    sign: config.sign,
  });
  return {
    accountId: config.accountId,
    network: config.network,
    networkCanonical: config.network,
  };
};

export type DemoLedgerAuthMode = 'hedera' | 'evm';

export const resolveDemoLedgerAuthMode = (): DemoLedgerAuthMode => {
  const raw = process.env.REGISTRY_BROKER_LEDGER_MODE?.trim().toLowerCase();
  if (raw === 'evm') {
    return 'evm';
  }
  return 'hedera';
};

export const authenticateWithDemoLedger = async (
  client: RegistryBrokerClient,
  options: DemoLedgerAuthOptions & { mode?: DemoLedgerAuthMode } = {},
) => {
  const mode = options.mode ?? resolveDemoLedgerAuthMode();
  return mode === 'evm'
    ? authenticateWithEvmLedger(client, options)
    : authenticateWithHederaLedger(client, options);
};
