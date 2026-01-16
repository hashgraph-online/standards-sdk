import { DidIssueRequest, DidIssueRequestHedera, DidIssuer } from './types';
import type { AdapterMeta } from '../adapters/types';
import { optionalImport } from '../../utils/dynamic-import';
import type { PublicKey, TransactionReceipt } from '@hashgraph/sdk';

type CreateDID = typeof import('@hiero-did-sdk/registrar').createDID;
type HieroRegistrarModule = typeof import('@hiero-did-sdk/registrar');

const hieroRegistrarModuleId = ['@hiero-did-sdk', 'registrar'].join('/');

let registrarPromise: Promise<CreateDID | null> | null = null;

type PublisherClientLike = {
  ledgerId?: {
    isMainnet: () => boolean;
    isTestnet: () => boolean;
    isPreviewnet: () => boolean;
    isLocalNode: () => boolean;
    toString: () => string;
  };
  operatorPublicKey?: PublicKey;
  operatorAccountId?: { toString: () => string };
};

type AutoRenewTransactionLike = {
  getAutoRenewAccountId?: () => unknown;
  setAutoRenewAccountId?: (value: string) => void;
  freezeWith: (client: PublisherClientLike) => {
    execute: (client: PublisherClientLike) => Promise<{
      getReceipt: (client: PublisherClientLike) => Promise<TransactionReceipt>;
    }>;
  };
};

function toAccountIdString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (
    value &&
    typeof (value as { toString?: () => string }).toString === 'function'
  ) {
    const result = (value as { toString: () => string }).toString();
    return typeof result === 'string' && result.trim() ? result : null;
  }

  return null;
}

function createHieroPublisher(client: PublisherClientLike) {
  return {
    network: () => {
      const ledgerId = client.ledgerId;
      if (!ledgerId) {
        throw new Error('Hedera SDK Client must be configured with a network');
      }
      if (ledgerId.isMainnet()) return 'mainnet';
      if (ledgerId.isTestnet()) return 'testnet';
      if (ledgerId.isPreviewnet()) return 'previewnet';
      if (ledgerId.isLocalNode()) return 'local-node';
      throw new Error(`Unknown network, ledger ID: ${ledgerId.toString()}`);
    },
    publicKey: () => {
      if (!client.operatorPublicKey) {
        throw new Error(
          'Hedera SDK Client must be configured with an operator account',
        );
      }
      return client.operatorPublicKey;
    },
    publish: async (transaction: AutoRenewTransactionLike) => {
      const current =
        typeof transaction.getAutoRenewAccountId === 'function'
          ? transaction.getAutoRenewAccountId()
          : null;
      const autoRenewAccountId = toAccountIdString(client.operatorAccountId);

      if (
        !current &&
        autoRenewAccountId &&
        typeof transaction.setAutoRenewAccountId === 'function'
      ) {
        transaction.setAutoRenewAccountId(autoRenewAccountId);
      }

      const response = await transaction.freezeWith(client).execute(client);
      return response.getReceipt(client);
    },
  };
}

async function loadCreateDID(): Promise<CreateDID | null> {
  if (!registrarPromise) {
    // Prefer ESM to keep @hashgraph/sdk classes consistent across caller + registrar.
    registrarPromise = optionalImport<HieroRegistrarModule>(
      hieroRegistrarModuleId,
      { preferImport: true },
    ).then(mod => mod?.createDID ?? null);
  }
  return registrarPromise;
}

export class HederaHieroIssuer implements DidIssuer {
  readonly meta: AdapterMeta = {
    id: 'hedera/hiero',
    didMethods: ['hedera'],
    caip2Networks: [
      'hedera:mainnet',
      'hedera:testnet',
      'hedera:previewnet',
      'hedera:devnet',
    ],
    caip10Namespaces: ['hedera'],
    displayName: 'Hedera (Hiero Registrar)',
    description: 'Issues did:hedera identifiers using the Hiero DID registrar.',
    homepage: 'https://github.com/hiero-ledger/hiero-did-sdk-js',
  };

  supports(method: string): boolean {
    return method === 'hedera';
  }

  async issue(request: DidIssueRequest): Promise<string> {
    if (request.method !== 'hedera') {
      throw new Error('HederaHieroIssuer only handles method "hedera"');
    }
    if (!('client' in request)) {
      throw new Error('Hedera client is required to issue did:hedera');
    }
    const createDID = await loadCreateDID();
    if (!createDID) {
      throw new Error(
        'Hiero registrar unavailable. Ensure @hiero-did-sdk/registrar is installed.',
      );
    }
    const client = (request as DidIssueRequestHedera).client;
    const did = await createDID(
      {},
      { publisher: createHieroPublisher(client) },
    );
    return did.did;
  }
}
