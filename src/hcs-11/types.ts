import type { Signer } from '@hashgraph/sdk';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';
import { RegistrationProgressCallback } from '../hcs-10/types';
import { LogLevel } from '../utils/logger';
import { FeeConfigBuilderInterface } from '../fees';
import { NetworkType } from '../utils/types';

export enum ProfileType {
  PERSONAL = 0,
  AI_AGENT = 1,
}

export enum AIAgentType {
  MANUAL = 0,
  AUTONOMOUS = 1,
}

export enum EndpointType {
  REST = 0,
  WEBSOCKET = 1,
  GRPC = 2,
}

export enum AIAgentCapability {
  TEXT_GENERATION = 0,
  IMAGE_GENERATION = 1,
  AUDIO_GENERATION = 2,
  VIDEO_GENERATION = 3,
  CODE_GENERATION = 4,
  LANGUAGE_TRANSLATION = 5,
  SUMMARIZATION_EXTRACTION = 6,
  KNOWLEDGE_RETRIEVAL = 7,
  DATA_INTEGRATION = 8,
  MARKET_INTELLIGENCE = 9,
  TRANSACTION_ANALYTICS = 10,
  SMART_CONTRACT_AUDIT = 11,
  GOVERNANCE_FACILITATION = 12,
  SECURITY_MONITORING = 13,
  COMPLIANCE_ANALYSIS = 14,
  FRAUD_DETECTION = 15,
  MULTI_AGENT_COORDINATION = 16,
  API_INTEGRATION = 17,
  WORKFLOW_AUTOMATION = 18,
}

export type SocialPlatform =
  | 'twitter'
  | 'github'
  | 'discord'
  | 'telegram'
  | 'linkedin'
  | 'youtube'
  | 'website'
  | 'x';

export interface SocialLink {
  platform: SocialPlatform;
  handle: string;
}

export interface AIAgentDetails {
  type: AIAgentType;
  capabilities: AIAgentCapability[];
  model: string;
  creator?: string;
}

export interface BaseProfile {
  version: string;
  type: ProfileType;
  display_name: string;
  alias?: string;
  bio?: string;
  socials?: SocialLink[];
  profileImage?: string;
  properties?: Record<string, any>;
  inboundTopicId?: string;
  outboundTopicId?: string;
}

export interface PersonalProfile extends BaseProfile {
  type: ProfileType.PERSONAL;
}

export interface AIAgentProfile extends BaseProfile {
  type: ProfileType.AI_AGENT;
  aiAgent: AIAgentDetails;
}

export type HCS11Profile = PersonalProfile | AIAgentProfile;

export enum InboundTopicType {
  PUBLIC = 'PUBLIC',
  CONTROLLED = 'CONTROLLED',
  FEE_BASED = 'FEE_BASED',
}

export interface HCS11Auth {
  operatorId: string;
  privateKey?: string;
  signer?: DAppSigner | Signer;
}

export interface HCS11ClientConfig {
  network: NetworkType;
  auth: HCS11Auth;
  logLevel?: LogLevel;
  silent?: boolean;
}

export interface TransactionResult<T = unknown> {
  success: boolean;
  error?: string;
  result?: T;
}

export interface InscribeProfileResponse {
  profileTopicId: string;
  transactionId: string;
  success: boolean;
  error?: string;
  inboundTopicId?: string;
  outboundTopicId?: string;
}

export interface InscribeImageResponse {
  imageTopicId: string;
  transactionId: string;
  success: boolean;
  error?: string;
}

export interface AgentMetadata {
  type: 'autonomous' | 'manual';
  model?: string;
  socials?: { [key in SocialPlatform]?: string };
  creator?: string;
  properties?: Record<string, any>;
}

export interface ProgressOptions {
  progressCallback?: RegistrationProgressCallback;
}

export interface InscribeImageOptions extends ProgressOptions {
  waitForConfirmation?: boolean;
}

export interface InscribeProfileOptions extends ProgressOptions {
  waitForConfirmation?: boolean;
}

export interface AgentConfiguration {
  name: string;
  alias: string;
  bio: string;
  capabilities: number[];
  metadata: AgentMetadata;
  pfpBuffer?: Buffer;
  pfpFileName?: string;
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

export interface PersonConfig extends BaseProfile {
  type: ProfileType.PERSONAL;
  pfpBuffer?: Buffer;
  pfpFileName?: string;
}

export const SUPPORTED_SOCIAL_PLATFORMS: SocialPlatform[] = [
  'twitter',
  'github',
  'discord',
  'telegram',
  'linkedin',
  'youtube',
  'website',
  'x',
];

export const capabilityNameToCapabilityMap: Record<string, AIAgentCapability> =
  {
    text_generation: AIAgentCapability.TEXT_GENERATION,
    image_generation: AIAgentCapability.IMAGE_GENERATION,
    audio_generation: AIAgentCapability.AUDIO_GENERATION,
    video_generation: AIAgentCapability.VIDEO_GENERATION,
    code_generation: AIAgentCapability.CODE_GENERATION,
    language_translation: AIAgentCapability.LANGUAGE_TRANSLATION,
    summarization: AIAgentCapability.SUMMARIZATION_EXTRACTION,
    extraction: AIAgentCapability.SUMMARIZATION_EXTRACTION,
    knowledge_retrieval: AIAgentCapability.KNOWLEDGE_RETRIEVAL,
    data_integration: AIAgentCapability.DATA_INTEGRATION,
    data_visualization: AIAgentCapability.DATA_INTEGRATION,
    market_intelligence: AIAgentCapability.MARKET_INTELLIGENCE,
    transaction_analytics: AIAgentCapability.TRANSACTION_ANALYTICS,
    smart_contract_audit: AIAgentCapability.SMART_CONTRACT_AUDIT,
    governance: AIAgentCapability.GOVERNANCE_FACILITATION,
    security_monitoring: AIAgentCapability.SECURITY_MONITORING,
    compliance_analysis: AIAgentCapability.COMPLIANCE_ANALYSIS,
    fraud_detection: AIAgentCapability.FRAUD_DETECTION,
    multi_agent: AIAgentCapability.MULTI_AGENT_COORDINATION,
    api_integration: AIAgentCapability.API_INTEGRATION,
    workflow_automation: AIAgentCapability.WORKFLOW_AUTOMATION,
  };

export interface AgentMetadata {
  type: 'autonomous' | 'manual';
  model?: string;
  socials?: {
    twitter?: string;
    discord?: string;
    github?: string;
    website?: string;
    x?: string;
    linkedin?: string;
    youtube?: string;
    telegram?: string;
  };
  creator?: string;
  properties?: Record<string, any>;
}
