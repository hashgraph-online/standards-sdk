import { PrivateKey, TransactionReceipt } from '@hashgraph/sdk';
import { LogLevel } from '../utils/logger';
import { AIAgentCapability } from '../hcs-11';
import {
  ProgressData,
  ProgressStage,
  ProgressCallback,
} from '../utils/progress-reporter';

export type RegistrationResult = {
  success: boolean;
  error?: string;
  transactionId?: string;
  transaction?: string;
};

export interface ValidationError {
  validation: string;
  code: string;
  message: string;
  path: string[];
}

export type NetworkType = 'mainnet' | 'testnet';

export enum InboundTopicType {
  PUBLIC = 'PUBLIC',
  CONTROLLED = 'CONTROLLED',
  FEE_BASED = 'FEE_BASED',
}

export type FeeAmount = {
  amount: number; // Amount in tinybars
  decimals?: number; // Decimal places for fixed point representation
  tokenId?: string; // Optional token ID for token fees
};

// For backward compatibility
export interface RegistrationProgressData {
  stage: 'preparing' | 'submitting' | 'confirming' | 'completed' | 'verifying' | 'failed';
  message: string;
  progressPercent?: number;
  details?: Record<string, any>;
}

export type RegistrationProgressCallback = (
  data: RegistrationProgressData
) => void;

export interface TopicFeeConfig {
  feeAmount: FeeAmount;
  feeCollectorAccountId: string;
  exemptAccounts?: string[];
}

export interface FeeConfigBuilderInterface {
  setHbarAmount(hbarAmount: number): FeeConfigBuilderInterface;
  setFeeAmount(amount: number, decimals?: number): FeeConfigBuilderInterface;
  setFeeCollector(accountId: string): FeeConfigBuilderInterface;
  addExemptAccount(accountId: string): FeeConfigBuilderInterface;
  addExemptAccounts(accountIds: string[]): FeeConfigBuilderInterface;
  build(): TopicFeeConfig;
}

export interface FeeConfigBuilderStatic {
  new (): FeeConfigBuilderInterface;
  forHbar(
    hbarAmount: number,
    collectorAccountId: string,
    exemptAccounts?: string[]
  ): FeeConfigBuilderInterface;
}

export interface AgentConfig<T> {
  accountId: string;
  privateKey: string;
  operatorId: string;
  inboundTopicId: string;
  outboundTopicId: string;
  profileTopicId: string;
  pfpTopicId: string;
  client: T;
}

export interface HCSClientConfig {
  network: NetworkType;
  operatorId: string;
  operatorPrivateKey: string;
  operatorPublicKey?: string;
  logLevel?: LogLevel;
  prettyPrint?: boolean;
  guardedRegistryBaseUrl?: string;
  feeAmount?: number; // Default fee amount for HIP-991 fee payments
}

export interface Message {
  message: string;
  sequence_number?: number;
}

export interface Links {
  next: string;
}

export interface ApiResponse {
  messages?: any[];
  links?: {
    next?: string;
  };
}

export interface RegistrationResponse {
  transaction: string;
  transaction_id: string;
}

export interface Topic {
  topicId: string;
  memo: string;
  adminKey: boolean;
  submitKey: boolean;
}

export interface CreateAgentResponse {
  inboundTopicId: string;
  outboundTopicId: string;
  pfpTopicId: string;
  profileTopicId: string;
}

export interface CreateAccountResponse {
  accountId: string;
  privateKey: string;
}

export interface InscribePfpResponse {
  pfpTopicId: string;
  transactionId: string;
  success: boolean;
  error?: string;
}

export interface StoreHCS11ProfileResponse {
  profileTopicId: string;
  pfpTopicId?: string;
  transactionId: string;
  success: boolean;
  error?: string;
}

export interface GetTopicsResponse {
  inboundTopic: string;
  outboundTopic: string;
}

export interface HandleConnectionRequestResponse {
  connectionTopicId: string;
  confirmedConnectionSequenceNumber: number;
  operatorId: string;
}

export interface WaitForConnectionConfirmationResponse {
  connectionTopicId: string;
  sequence_number: number;
  confirmedBy: string;
  memo: string;
}

export interface GetAccountAndSignerResponse {
  accountId: string;
  signer: PrivateKey;
}

export interface AgentRegistrationResult {
  success: boolean;
  error?: string;
  transactionId?: string;
  transaction?: string;
  confirmed?: boolean;
  state?: AgentCreationState;
  metadata?: {
    capabilities?: number[];
    [key: string]: any;
  };
}

export interface AgentConfiguration {
  name: string;
  description: string;
  capabilities: AIAgentCapability[];
  metadata: any;
  pfpBuffer: Buffer;
  pfpFileName: string;
  network: NetworkType;
  inboundTopicType: InboundTopicType;
  feeConfig?: FeeConfigBuilderInterface;
  connectionFeeConfig?: FeeConfigBuilderInterface;
  existingAccount?: {
    accountId: string;
    privateKey: string;
  };
  existingPfpTopicId?: string;
}

export interface AgentCreationState {
  pfpTopicId?: string;
  inboundTopicId?: string;
  outboundTopicId?: string;
  profileTopicId?: string;
  currentStage: 'init' | 'pfp' | 'topics' | 'profile' | 'registration' | 'complete';
  completedPercentage: number;
  error?: string;
  createdResources?: string[];
  agentMetadata?: Record<string, any>;
} 