import {
  AccountId,
  LedgerId,
  PrivateKey,
  SignerSignature,
  type Signer,
  type AccountBalance,
  type AccountInfo,
  type Transaction,
  type TransactionRecord,
} from '@hashgraph/sdk';

const unsupported = (method: string): Error =>
  new Error(`${method} is not supported by the in-memory signer`);

export interface PrivateKeySignerOptions {
  accountId: string;
  privateKey: string;
  network: 'mainnet' | 'testnet';
}

export const createPrivateKeySigner = (
  options: PrivateKeySignerOptions,
): Signer => {
  if (!options.privateKey) {
    throw new Error('privateKey is required to create a ledger signer.');
  }
  if (!options.accountId) {
    throw new Error('accountId is required to create a ledger signer.');
  }
  const accountId = AccountId.fromString(options.accountId);
  const privateKey = PrivateKey.fromString(options.privateKey);
  const ledgerId = LedgerId.fromString(options.network);

  return {
    getLedgerId: () => ledgerId,
    getAccountId: () => accountId,
    getAccountKey: () => privateKey.publicKey,
    getNetwork: () => ({}),
    getMirrorNetwork: () => [],
    sign: async (messages: Uint8Array[]): Promise<SignerSignature[]> =>
      Promise.all(
        messages.map(async message => {
          const signature = await privateKey.sign(message);
          return new SignerSignature({
            publicKey: privateKey.publicKey,
            signature,
            accountId,
          });
        }),
      ),
    getAccountBalance: async (): Promise<AccountBalance> => {
      throw unsupported('getAccountBalance');
    },
    getAccountInfo: async (): Promise<AccountInfo> => {
      throw unsupported('getAccountInfo');
    },
    getAccountRecords: async (): Promise<TransactionRecord[]> => {
      throw unsupported('getAccountRecords');
    },
    signTransaction: async <T extends Transaction>(_: T): Promise<T> => {
      throw unsupported('signTransaction');
    },
    checkTransaction: async <T extends Transaction>(_: T): Promise<T> => {
      throw unsupported('checkTransaction');
    },
    populateTransaction: async <T extends Transaction>(_: T): Promise<T> => {
      throw unsupported('populateTransaction');
    },
    call: async <RequestT, ResponseT, OutputT>(
      _request: unknown,
    ): Promise<OutputT> => {
      throw unsupported('call');
    },
  };
};
