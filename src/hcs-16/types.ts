import {
  AccountId,
  TopicId,
  PublicKey,
  Key,
  PrivateKey,
  KeyList,
  TokenId,
} from '@hashgraph/sdk';
import { BaseProfile, SocialLink } from '../hcs-11/types';

/**
 * HCS-16 Topic type enums
 */
export enum FloraTopicType {
  COMMUNICATION = 0,
  TRANSACTION = 1,
  STATE = 2,
}

/**
 * HCS-16 Flora member
 */
export interface FloraMember {
  accountId: string;
  publicKey?: PublicKey | string;
  privateKey?: string;
  weight?: number;
}

/**
 * HCS-16 Flora topics
 */
export interface FloraTopics {
  communication: TopicId;
  transaction: TopicId;
  state: TopicId;
  custom?: Array<{
    name: string;
    topicId: string;
    description?: string;
  }>;
}

/**
 * HCS-16 Flora configuration
 */
export interface FloraConfig {
  displayName: string;
  bio?: string;
  members: FloraMember[];
  threshold: number;
  initialBalance?: number;
  maxAutomaticTokenAssociations?: number;
  policies?: {
    membershipChange?: string;
    scheduleTxApproval?: string;
  };
  customFees?: {
    amount: number;
    feeCollectorAccountId: string;
  }[];
  metadata?: Record<string, any>;
}

/**
 * HCS-16 Flora creation result
 */
export interface FloraCreationResult {
  floraAccountId: AccountId;
  topics: FloraTopics;
  keyList: Key;
  transactionId: string;
}

/**
 * HCS-16 Message protocol operations
 */
export enum FloraOperation {
  FLORA_CREATED = 'flora_created',
  TRANSACTION = 'transaction',
  STATE_UPDATE = 'state_update',
  FLORA_JOIN_REQUEST = 'flora_join_request',
  FLORA_JOIN_VOTE = 'flora_join_vote',
  FLORA_JOIN_ACCEPTED = 'flora_join_accepted',
}

/**
 * HCS-16 Message envelope
 */
export interface FloraMessage {
  p: 'hcs-16';
  op: FloraOperation;
  operator_id: string;
  m?: string;
  [key: string]: unknown;
}

/**
 * HCS-16 Flora profile (extends HCS-11)
 */
export interface FloraProfile extends BaseProfile {
  version: string;
  type: 3;
  display_name: string;
  members: FloraMember[];
  threshold: number;
  topics: {
    communication: string;
    transaction: string;
    state: string;
    custom?: Array<{
      name: string;
      topicId: string;
      description?: string;
    }>;
  };
  alias?: string;
  bio?: string;
  socials?: SocialLink[];
  profileImage?: string;
  properties?: Record<string, unknown>;
  inboundTopicId: string;
  outboundTopicId: string;
  policies?: Record<string, string>;
  metadata?: Record<string, any>;
}

/**
 * HCS-16 errors
 */
export class FloraError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'FloraError';
  }
}

/**
 * Flora state update message
 */
export interface FloraStateUpdate {
  p: 'hcs-16';
  op: 'state_update';
  operator_id: string;
  hash: string;
  epoch?: number;
  members?: string[];
  timestamp: string;
}

/**
 * HIP-991 Custom fee configuration for transaction topics
 */
export interface TransactionTopicFee {
  amount: number;
  feeCollectorAccountId: string;
  denominatingTokenId?: string;
}

/**
 * Configuration for creating HCS-16 transaction topics with HIP-991 support
 */
export interface TransactionTopicConfig {
  memo: string;
  adminKey?: PrivateKey | KeyList;
  submitKey?: PrivateKey | KeyList;
  feeScheduleKey?: PrivateKey | KeyList;
  customFees?: TransactionTopicFee[];
  feeExemptKeys?: Key[];
}

/** credit_purchase not part of HCS-16 specification; no message type defined. */
