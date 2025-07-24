import { PublicKey } from '@hashgraph/sdk';

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
