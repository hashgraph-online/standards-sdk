import { PublicKey, PrivateKey } from '@hashgraph/sdk';
import type { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';
import { z } from 'zod';
import { Logger, LogLevel } from '../utils/logger';
import { NetworkType } from '../utils/types';

/**
 * HCS-17 Topic state information
 */
export interface TopicState {
  topicId: string;
  latestRunningHash: string;
}

/**
 * HCS-17 Account state hash input
 */
export interface AccountStateInput {
  accountId: string;
  publicKey: PublicKey | string;
  topics: TopicState[];
}

/**
 * HCS-17 Composite state hash input for Flora/Bloom
 */
export interface CompositeStateInput {
  compositeAccountId: string;
  compositePublicKeyFingerprint: string;
  memberStates: Array<{
    accountId: string;
    stateHash: string;
  }>;
  compositeTopics: TopicState[];
}

/**
 * HCS-17 State hash message format
 */
export interface StateHashMessage {
  p: 'hcs-17';
  op: 'state_hash';
  state_hash: string;
  topics: string[];
  account_id: string;
  timestamp?: string;
  m?: string;
}

export const hcs17MessageSchema = z.object({
  p: z.literal('hcs-17'),
  op: z.literal('state_hash'),
  state_hash: z.string().min(1),
  topics: z.array(z.string()),
  account_id: z.string().min(1),
  timestamp: z.string().optional(),
  m: z.string().optional(),
});

/**
 * HCS-17 State hash result
 */
export interface StateHashResult {
  stateHash: string;
  accountId: string;
  timestamp: Date;
  topicCount: number;
}

/**
 * HCS-17 Composite state hash result
 */
export interface CompositeStateHashResult extends StateHashResult {
  memberCount: number;
  compositeTopicCount: number;
}

/**
 * HCS-17 errors
 */
export class StateHashError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'StateHashError';
  }
}

/**
 * Base configuration shared by HCS‑17 Node and Browser clients.
 */
export interface HCS17ClientConfig {
  network: NetworkType;
  logLevel?: LogLevel;
  silent?: boolean;
  mirrorNodeUrl?: string;
  logger?: Logger;
}

/**
 * Node SDK configuration for HCS‑17 client.
 */
export interface SDKHCS17ClientConfig extends HCS17ClientConfig {
  operatorId: string;
  operatorKey: string | PrivateKey;
  keyType?: 'ed25519' | 'ecdsa';
}

/**
 * Browser client configuration for HCS‑17 operations.
 */
export interface BrowserHCS17ClientConfig extends HCS17ClientConfig {
  hwc?: HashinalsWalletConnectSDK;
  signer?: DAppSigner;
}

/**
 * HCS‑17 topic types (numeric codes for memo encoding).
 */
export enum HCS17TopicType {
  STATE = 0,
}

/**
 * Generate the standard HCS‑17 topic memo: `hcs-17:<type>:<ttl>`.
 */
export function generateHCS17Memo(ttl: number): string {
  return `hcs-17:${HCS17TopicType.STATE}:${ttl}`;
}

/**
 * Parse an HCS‑17 memo into `{ type, ttl }` if valid.
 */
export function parseHCS17Memo(memo: string): { type: HCS17TopicType; ttl: number } | undefined {
  try {
    const match = memo.match(/^hcs-17:(\d+):(\d+)$/);
    if (!match) {
      return undefined;
    }
    const type = Number(match[1]) as HCS17TopicType;
    const ttl = Number(match[2]);
    if (Number.isNaN(type) || Number.isNaN(ttl) || ttl <= 0) {
      return undefined;
    }
    return { type, ttl };
  } catch {
    return undefined;
  }
}
