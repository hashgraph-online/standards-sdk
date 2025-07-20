import { AccountId, PublicKey, PrivateKey } from '@hashgraph/sdk';

/**
 * HCS-21 Petal Account configuration
 */
export interface PetalAccountConfig {
  sharedPrivateKey: PrivateKey;
  initialBalance?: number; // in hbar
  maxAutomaticTokenAssociations?: number;
  memo?: string;
}

/**
 * HCS-21 Petal Account creation result
 */
export interface PetalAccountResult {
  accountId: AccountId;
  publicKey: PublicKey;
  evmAddress?: string;
  transactionId: string;
}

/**
 * HCS-21 Profile reference in account memo
 */
export interface PetalProfileReference {
  protocol: 'hcs-11';
  resourceLocator: string; // e.g., "hcs://1/0.0.8768762"
  baseAccount?: string; // Required for petal accounts
}

/**
 * HCS-21 Petal relationship
 */
export interface PetalRelationship {
  petalAccountId: string;
  baseAccountId: string;
  sharedPublicKey: PublicKey;
  profileTopicId?: string;
}

/**
 * HCS-21 errors
 */
export class PetalAccountError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'PetalAccountError';
  }
}