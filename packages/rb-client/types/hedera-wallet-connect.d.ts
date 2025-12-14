import type { AccountId, Signer } from '@hashgraph/sdk';

declare module '@hashgraph/hedera-wallet-connect' {
  export interface DAppSigner extends Signer {
    getAccountId(): AccountId;
  }
}
