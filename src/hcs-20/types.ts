/**
 * HCS-20 Auditable Points Standard Types
 */

import { z } from 'zod';
import { AccountId, TopicId, PrivateKey } from '@hashgraph/sdk';

/**
 * HCS-20 Constants
 */
export const HCS20_CONSTANTS = {
  PROTOCOL: 'hcs-20',
  PUBLIC_TOPIC_ID: '0.0.4350190',
  REGISTRY_TOPIC_ID: '0.0.4362300',
  MAX_NUMBER_LENGTH: 18,
  MAX_NAME_LENGTH: 100,
  MAX_METADATA_LENGTH: 100,
  HEDERA_ACCOUNT_REGEX:
    /^(0|(?:[1-9]\d*))\.(0|(?:[1-9]\d*))\.(0|(?:[1-9]\d*))$/,
} as const;

/**
 * Hedera Account ID validator
 */
const HederaAccountIdSchema = z
  .string()
  .regex(
    HCS20_CONSTANTS.HEDERA_ACCOUNT_REGEX,
    'Invalid Hedera account ID format',
  );

/**
 * Number string validator
 */
const NumberStringSchema = z
  .string()
  .regex(/^\d+$/, 'Must be a valid number')
  .max(
    HCS20_CONSTANTS.MAX_NUMBER_LENGTH,
    `Max ${HCS20_CONSTANTS.MAX_NUMBER_LENGTH} digits`,
  );

/**
 * Tick validator
 */
const TickSchema = z
  .string()
  .min(1, 'Tick cannot be empty')
  .transform(val => val.toLowerCase().trim());

/**
 * Base HCS-20 Message Schema
 */
const HCS20BaseMessageSchema = z.object({
  p: z.literal('hcs-20'),
  m: z.string().optional(),
});

/**
 * Deploy Points Operation Schema
 */
export const HCS20DeployMessageSchema = HCS20BaseMessageSchema.extend({
  op: z.literal('deploy'),
  name: z.string().min(1).max(HCS20_CONSTANTS.MAX_NAME_LENGTH),
  tick: TickSchema,
  max: NumberStringSchema,
  lim: NumberStringSchema.optional(),
  metadata: z.string().max(HCS20_CONSTANTS.MAX_METADATA_LENGTH).optional(),
});

/**
 * Mint Points Operation Schema
 */
export const HCS20MintMessageSchema = HCS20BaseMessageSchema.extend({
  op: z.literal('mint'),
  tick: TickSchema,
  amt: NumberStringSchema,
  to: HederaAccountIdSchema,
});

/**
 * Burn Points Operation Schema
 */
export const HCS20BurnMessageSchema = HCS20BaseMessageSchema.extend({
  op: z.literal('burn'),
  tick: TickSchema,
  amt: NumberStringSchema,
  from: HederaAccountIdSchema,
});

/**
 * Transfer Points Operation Schema
 */
export const HCS20TransferMessageSchema = HCS20BaseMessageSchema.extend({
  op: z.literal('transfer'),
  tick: TickSchema,
  amt: NumberStringSchema,
  from: HederaAccountIdSchema,
  to: HederaAccountIdSchema,
});

/**
 * Register Topic Operation Schema
 */
export const HCS20RegisterMessageSchema = HCS20BaseMessageSchema.extend({
  op: z.literal('register'),
  name: z.string().min(1).max(HCS20_CONSTANTS.MAX_NAME_LENGTH),
  metadata: z.string().max(HCS20_CONSTANTS.MAX_METADATA_LENGTH).optional(),
  private: z.boolean(),
  t_id: HederaAccountIdSchema,
});

/**
 * Union schema for all HCS-20 messages
 */
export const HCS20MessageSchema = z.discriminatedUnion('op', [
  HCS20DeployMessageSchema,
  HCS20MintMessageSchema,
  HCS20BurnMessageSchema,
  HCS20TransferMessageSchema,
  HCS20RegisterMessageSchema,
]);

/**
 * Inferred types from schemas
 */
export type HCS20BaseMessage = z.infer<typeof HCS20BaseMessageSchema>;
export type HCS20DeployMessage = z.infer<typeof HCS20DeployMessageSchema>;
export type HCS20MintMessage = z.infer<typeof HCS20MintMessageSchema>;
export type HCS20BurnMessage = z.infer<typeof HCS20BurnMessageSchema>;
export type HCS20TransferMessage = z.infer<typeof HCS20TransferMessageSchema>;
export type HCS20RegisterMessage = z.infer<typeof HCS20RegisterMessageSchema>;
export type HCS20Message = z.infer<typeof HCS20MessageSchema>;
export type HCS20Operation = HCS20Message['op'];

/**
 * Points Configuration
 */
export interface PointsConfig {
  name: string;
  tick: string;
  maxSupply: string;
  limitPerMint?: string;
  metadata?: string;
}

/**
 * Points Information
 */
export interface PointsInfo extends PointsConfig {
  topicId: string;
  deployerAccountId: string;
  currentSupply: string;
  deploymentTimestamp: string;
  isPrivate: boolean;
}

/**
 * Points Balance
 */
export interface PointsBalance {
  tick: string;
  accountId: string;
  balance: string;
  lastUpdated: string;
}

/**
 * Points Transaction
 */
export interface PointsTransaction {
  id: string;
  operation: HCS20Operation;
  tick: string;
  amount?: string;
  from?: string;
  to?: string;
  timestamp: string;
  sequenceNumber: number;
  topicId: string;
  transactionId: string;
  memo?: string;
}

/**
 * HCS-20 Client Configuration
 */
export interface HCS20ClientConfig {
  mirrorNodeUrl?: string;
  logger?: any;
  network?: 'mainnet' | 'testnet';
  registryTopicId?: string;
  publicTopicId?: string;
}

/**
 * Browser-specific HCS-20 Client Configuration
 */
export interface BrowserHCS20ClientConfig extends HCS20ClientConfig {
  walletConnectProjectId?: string;
  hwcMetadata?: {
    name: string;
    description: string;
    icons: string[];
    url: string;
  };
}

/**
 * SDK-specific HCS-20 Client Configuration
 */
export interface SDKHCS20ClientConfig extends HCS20ClientConfig {
  operatorId: string | AccountId;
  operatorKey: string | PrivateKey;
  keyType?: 'ed25519' | 'ecdsa';
}

/**
 * Deploy Points Progress
 */
export interface DeployPointsProgress {
  stage: 'creating-topic' | 'submitting-deploy' | 'confirming' | 'complete';
  percentage: number;
  topicId?: string;
  deployTxId?: string;
  error?: string;
}

/**
 * Deploy Points Options
 */
export interface DeployPointsOptions extends PointsConfig {
  usePrivateTopic?: boolean;
  topicMemo?: string;
  progressCallback?: (data: DeployPointsProgress) => void;
}

/**
 * Mint Points Progress
 */
export interface MintPointsProgress {
  stage: 'validating' | 'submitting' | 'confirming' | 'complete';
  percentage: number;
  mintTxId?: string;
  error?: string;
}

/**
 * Mint Points Options
 */
export interface MintPointsOptions {
  tick: string;
  amount: string;
  to: string | AccountId;
  memo?: string;
  progressCallback?: (data: MintPointsProgress) => void;
}

/**
 * Transfer Points Progress
 */
export interface TransferPointsProgress {
  stage: 'validating-balance' | 'submitting' | 'confirming' | 'complete';
  percentage: number;
  transferTxId?: string;
  error?: string;
}

/**
 * Transfer Points Options
 */
export interface TransferPointsOptions {
  tick: string;
  amount: string;
  from: string | AccountId;
  to: string | AccountId;
  memo?: string;
  progressCallback?: (data: TransferPointsProgress) => void;
}

/**
 * Burn Points Progress
 */
export interface BurnPointsProgress {
  stage: 'validating-balance' | 'submitting' | 'confirming' | 'complete';
  percentage: number;
  burnTxId?: string;
  error?: string;
}

/**
 * Burn Points Options
 */
export interface BurnPointsOptions {
  tick: string;
  amount: string;
  from: string | AccountId;
  memo?: string;
  progressCallback?: (data: BurnPointsProgress) => void;
}

/**
 * Register Topic Progress
 */
export interface RegisterTopicProgress {
  stage: 'validating' | 'submitting' | 'confirming' | 'complete';
  percentage: number;
  registerTxId?: string;
  error?: string;
}

/**
 * Register Topic Options
 */
export interface RegisterTopicOptions {
  topicId: string | TopicId;
  name: string;
  metadata?: string;
  isPrivate: boolean;
  memo?: string;
  progressCallback?: (data: RegisterTopicProgress) => void;
}

/**
 * Query Points Options
 */
export interface QueryPointsOptions {
  tick?: string;
  accountId?: string | AccountId;
  topicId?: string | TopicId;
  limit?: number;
  order?: 'asc' | 'desc';
}

/**
 * Points Query Result
 */
export interface PointsQueryResult {
  points: PointsInfo[];
  balances?: PointsBalance[];
  transactions?: PointsTransaction[];
  totalCount: number;
  hasMore: boolean;
  nextCursor?: string;
}

/**
 * Points State
 */
export interface PointsState {
  deployedPoints: Map<string, PointsInfo>;
  balances: Map<string, Map<string, PointsBalance>>;
  transactions: PointsTransaction[];
  lastProcessedSequence: number;
  lastProcessedTimestamp: string;
}

/**
 * HCS-20 Registry Entry
 */
export interface HCS20RegistryEntry {
  name: string;
  topicId: string;
  metadata?: string;
  isPrivate: boolean;
  registeredAt: string;
  registeredBy: string;
}
