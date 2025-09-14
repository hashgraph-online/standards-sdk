/**
 * HCS-15 Petal Account Structure Types
 */

import { PrivateKey, PublicKey, AccountId } from '@hashgraph/sdk';
import type { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';
import { Logger, LogLevel } from '../utils/logger';
import { NetworkType } from '../utils/types';
import {
  PersonalProfile,
  AIAgentProfile,
  MCPServerProfile,
  ProfileType,
} from '../hcs-11/types';
import { AgentBuilder, PersonBuilder, MCPServerBuilder } from '../hcs-11';

export interface PetalConfig {
  baseAccountId: string;
  basePrivateKey: string;
  displayName: string;
  alias?: string;
  bio?: string;
  profileType: ProfileType;
  initialBalance?: number;
  maxAutomaticTokenAssociations?: number;
  stateTopicId?: string;
}

export interface PetalAccount {
  accountId: AccountId;
  baseAccountId: string;
  privateKey: PrivateKey;
  publicKey: PublicKey;
  profileTopicId: string;
  inboundTopicId?: string;
  outboundTopicId?: string;
  stateTopicId?: string;
}

export type PetalProfile = (
  | PersonalProfile
  | AIAgentProfile
  | MCPServerProfile
) & {
  base_account: string;
};

export interface PetalCreationResult {
  petalAccount: PetalAccount;
  transactionId: string;
  profileTopicId: string;
}

export type ProfileBuilder = AgentBuilder | PersonBuilder | MCPServerBuilder;

export interface PetalCreationOptions {
  baseAccountId: string;
  basePrivateKey: string;
  initialBalance?: number;
  maxAutomaticTokenAssociations?: number;
  ttl?: number;
}

/**
 * Base configuration shared by HCS‑15 Node and Browser clients.
 */
export interface HCS15ClientConfig {
  network: NetworkType;
  logLevel?: LogLevel;
  silent?: boolean;
  mirrorNodeUrl?: string;
  logger?: Logger;
}

/**
 * Node SDK configuration for HCS‑15 client.
 */
export interface SDKHCS15ClientConfig extends HCS15ClientConfig {
  operatorId: string;
  operatorKey: string | PrivateKey;
  keyType?: 'ed25519' | 'ecdsa';
}

/**
 * Browser client configuration for HCS‑15 operations.
 */
export interface BrowserHCS15ClientConfig extends HCS15ClientConfig {
  hwc?: HashinalsWalletConnectSDK;
  signer?: DAppSigner;
}
