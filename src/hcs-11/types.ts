import type { Signer } from '@hashgraph/sdk';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';
import { RegistrationProgressCallback } from '../hcs-10/types';
import { LogLevel } from '../utils/logger';
import { FeeConfigBuilderInterface } from '../fees';
import { NetworkType } from '../utils/types';

export enum ProfileType {
  PERSONAL = 0,
  AI_AGENT = 1,
  MCP_SERVER = 2,
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

export enum MCPServerCapability {
  RESOURCE_PROVIDER = 0,
  TOOL_PROVIDER = 1,
  PROMPT_TEMPLATE_PROVIDER = 2,
  LOCAL_FILE_ACCESS = 3,
  DATABASE_INTEGRATION = 4,
  API_INTEGRATION = 5,
  WEB_ACCESS = 6,
  KNOWLEDGE_BASE = 7,
  MEMORY_PERSISTENCE = 8,
  CODE_ANALYSIS = 9,
  CONTENT_GENERATION = 10,
  COMMUNICATION = 11,
  DOCUMENT_PROCESSING = 12,
  CALENDAR_SCHEDULE = 13,
  SEARCH = 14,
  ASSISTANT_ORCHESTRATION = 15,
}

export enum VerificationType {
  DNS = 'dns',
  SIGNATURE = 'signature',
  CHALLENGE = 'challenge',
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

export interface MCPServerVerification {
  type: VerificationType;
  value: string;
  dns_field?: string;
  challenge_path?: string;
}

export interface MCPServerConnectionInfo {
  url: string;
  transport: 'stdio' | 'sse';
}

export interface MCPServerHost {
  minVersion?: string;
}

export interface MCPServerResource {
  name: string;
  description: string;
}

export interface MCPServerTool {
  name: string;
  description: string;
}

export interface MCPServerDetails {
  version: string;
  connectionInfo: MCPServerConnectionInfo;
  services: MCPServerCapability[];
  description: string;
  verification?: MCPServerVerification;
  host?: MCPServerHost;
  capabilities?: string[];
  resources?: MCPServerResource[];
  tools?: MCPServerTool[];
  maintainer?: string;
  repository?: string;
  docs?: string;
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

export interface MCPServerProfile extends BaseProfile {
  type: ProfileType.MCP_SERVER;
  mcpServer: MCPServerDetails;
}

export type HCS11Profile = PersonalProfile | AIAgentProfile | MCPServerProfile;

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
  keyType?: 'ed25519' | 'ecdsa';
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
  inboundTopicId: string;
  outboundTopicId: string;
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

export interface MCPServerConfig {
  name: string;
  alias?: string;
  bio?: string;
  socials?: SocialLink[];
  network: NetworkType;
  mcpServer: MCPServerDetails;
  pfpBuffer?: Buffer;
  pfpFileName?: string;
  existingPfpTopicId?: string;
  existingAccount?: {
    accountId: string;
    privateKey: string;
  };
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

export const mcpServiceNameToCapabilityMap: Record<
  string,
  MCPServerCapability
> = {
  resource_provider: MCPServerCapability.RESOURCE_PROVIDER,
  tool_provider: MCPServerCapability.TOOL_PROVIDER,
  prompt_template_provider: MCPServerCapability.PROMPT_TEMPLATE_PROVIDER,
  local_file_access: MCPServerCapability.LOCAL_FILE_ACCESS,
  database_integration: MCPServerCapability.DATABASE_INTEGRATION,
  api_integration: MCPServerCapability.API_INTEGRATION,
  web_access: MCPServerCapability.WEB_ACCESS,
  knowledge_base: MCPServerCapability.KNOWLEDGE_BASE,
  memory_persistence: MCPServerCapability.MEMORY_PERSISTENCE,
  code_analysis: MCPServerCapability.CODE_ANALYSIS,
  content_generation: MCPServerCapability.CONTENT_GENERATION,
  communication: MCPServerCapability.COMMUNICATION,
  document_processing: MCPServerCapability.DOCUMENT_PROCESSING,
  calendar_schedule: MCPServerCapability.CALENDAR_SCHEDULE,
  search: MCPServerCapability.SEARCH,
  assistant_orchestration: MCPServerCapability.ASSISTANT_ORCHESTRATION,
};
