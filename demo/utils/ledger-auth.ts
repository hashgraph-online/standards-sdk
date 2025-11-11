import type { RegistryBrokerClient } from '../../src/services/registry-broker';
import type {
  LedgerAuthenticationSignerResult,
  LedgerVerifyResponse,
} from '../../src/services/registry-broker/types';
import { canonicalizeLedgerNetwork } from '../../src/services/registry-broker/ledger-network';

export interface LedgerAuthenticationOptions {
  client: RegistryBrokerClient;
  accountId: string;
  privateKey?: string;
  network: string;
  expiresInMinutes?: number;
  /**
   * Optional label to include in log output, e.g. "registration client".
   */
  label?: string;
  /**
   * When true (default), sets the x-account-id header on the client using the
   * verified ledger account returned by the broker.
   */
  setAccountHeader?: boolean;
  /**
   * Optional logger; defaults to console.
   */
  logger?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
  };
  sign?: (
    message: string,
  ) =>
    | LedgerAuthenticationSignerResult
    | Promise<LedgerAuthenticationSignerResult>;
}

export interface LedgerAuthenticationResult {
  verification: LedgerVerifyResponse;
}

const getLogger = (
  logger?: LedgerAuthenticationOptions['logger'],
): Required<LedgerAuthenticationOptions['logger']> => {
  if (logger) {
    return {
      info: logger.info ?? console.log,
      warn: logger.warn ?? console.warn,
    };
  }
  return {
    info: console.log,
    warn: console.warn,
  };
};

export const authenticateClientWithLedger = async (
  options: LedgerAuthenticationOptions,
): Promise<LedgerAuthenticationResult> => {
  const {
    client,
    accountId,
    privateKey,
    network,
    expiresInMinutes,
    label,
    setAccountHeader = true,
    sign,
  } = options;

  if (!sign && !privateKey) {
    throw new Error(
      'Provide a privateKey or custom sign function for ledger authentication.',
    );
  }

  const resolvedNetwork = canonicalizeLedgerNetwork(network);
  const logger = getLogger(options.logger);

  const verification = await client.authenticateWithLedgerCredentials({
    accountId,
    network: resolvedNetwork.canonical,
    hederaPrivateKey: privateKey,
    sign,
    expiresInMinutes,
    setAccountHeader,
    label,
    logger,
  });

  return { verification };
};
