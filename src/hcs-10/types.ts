import { PrivateKey } from '@hashgraph/sdk';
import { LogLevel } from '../utils/logger';
import { AIAgentCapability, AIAgentProfile } from '../hcs-11';
import { NetworkType } from '../utils/types';

export interface ValidationError {
  validation: string;
  code: string;
  message: string;
  path: string[];
}

export interface RegistrationProgressData {
  stage:
    | 'preparing'
    | 'submitting'
    | 'confirming'
    | 'completed'
    | 'verifying'
    | 'failed';
  message: string;
  progressPercent?: number;
  details?: Record<string, any>;
}

export type RegistrationProgressCallback = (
  data: RegistrationProgressData
) => void;

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

export interface TransactMessage {
  operator_id: string;
  schedule_id: string;
  tx_id: string;
  data?: string;
  timestamp: number;
  memo?: string;
  sequence_number: number;
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
    capabilities?: AIAgentCapability[];
    [key: string]: any;
  };
}

export interface AgentCreationState {
  pfpTopicId?: string;
  inboundTopicId?: string;
  outboundTopicId?: string;
  profileTopicId?: string;
  currentStage:
    | 'init'
    | 'pfp'
    | 'topics'
    | 'profile'
    | 'registration'
    | 'complete';
  completedPercentage: number;
  error?: string;
  createdResources?: string[];
  agentMetadata?: Record<string, any>;
}

export type RegistrationResult = {
  transaction?: any;
  transactionId?: string;
  success: boolean;
  error?: string;
  validationErrors?: ValidationError[];
};

export interface RegistrationSearchOptions {
  tags?: AIAgentCapability[];
  accountId?: string;
  network?: string;
}

interface Registration {
  id: string;
  transactionId: string;
  status: 'pending' | 'success' | 'failed';
  network: string;
  accountId: string;
  inboundTopicId: string;
  outboundTopicId: string;
  operatorId: string;
  metadata: AIAgentProfile;
  registryTopicId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationSearchResult {
  registrations: Registration[];
  error?: string;
  success: boolean;
}

export interface RegistrationsApiResponse {
  registrations: Registration[];
  transaction_id?: string;
  transaction?: string;
  error?: string;
  details?: ValidationError[];
}
