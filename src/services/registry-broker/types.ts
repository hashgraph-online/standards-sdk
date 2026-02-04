import { z } from 'zod';
import type { Signer } from '@hashgraph/sdk';
import type { Buffer } from 'buffer';
import type {
  AdapterConfigContext,
  AdapterManifest,
  AdapterPackage,
} from '../../hcs-21/types';
import {
  adaptersResponseSchema,
  createSessionResponseSchema,
  encryptionHandshakeResponseSchema,
  detectProtocolResponseSchema,
  dashboardStatsResponseSchema,
  metricsSummaryResponseSchema,
  popularResponseSchema,
  protocolsResponseSchema,
  registerAgentResponseSchema,
  registrationQuoteResponseSchema,
  creditPurchaseResponseSchema,
  x402CreditPurchaseResponseSchema,
  x402MinimumsResponseSchema,
  registriesResponseSchema,
  registrySearchByNamespaceSchema,
  searchFacetsResponseSchema,
  adapterDetailsResponseSchema,
  adapterRegistryAdaptersResponseSchema,
  adapterRegistryCategoriesResponseSchema,
  adapterRegistryCategorySchema,
  adapterRegistryCreateCategoryResponseSchema,
  adapterRegistrySubmitAdapterResponseSchema,
  adapterRegistrySubmitAdapterAcceptedResponseSchema,
  adapterRegistrySubmissionStatusResponseSchema,
  adapterDescriptorSchema,
  adapterChatProfileSchema,
  additionalRegistryCatalogResponseSchema,
  vectorSearchRequestSchema,
  vectorSearchResponseSchema,
  resolveResponseSchema,
  searchResponseSchema,
  sendMessageResponseSchema,
  chatHistorySnapshotResponseSchema,
  chatHistoryCompactionResponseSchema,
  statsResponseSchema,
  sessionEncryptionStatusResponseSchema,
  uaidConnectionStatusSchema,
  uaidValidationResponseSchema,
  websocketStatsResponseSchema,
  ledgerChallengeResponseSchema,
  ledgerVerifyResponseSchema,
  registerAgentPendingResponseSchema,
  registerAgentPartialResponseSchema,
  registerAgentSuccessResponseSchema,
  registrationProgressAdditionalEntrySchema,
  registrationProgressRecordSchema,
  registrationProgressResponseSchema,
  registerEncryptionKeyResponseSchema,
  searchStatusResponseSchema,
  agentFeedbackResponseSchema,
  agentFeedbackEligibilityResponseSchema,
  agentFeedbackSubmissionResponseSchema,
  agentFeedbackIndexResponseSchema,
  agentFeedbackEntriesIndexResponseSchema,
  moltbookOwnerRegistrationUpdateResponseSchema,
  AIAgentType,
  AIAgentCapability,
  registerStatusResponseSchema,
  verificationChallengeDetailsResponseSchema,
  verificationChallengeResponseSchema,
  verificationOwnershipResponseSchema,
  verificationStatusResponseSchema,
  verificationVerifyResponseSchema,
  verificationVerifySenderResponseSchema,
  skillRegistryConfigResponseSchema,
  skillRegistryFileDescriptorSchema,
  skillRegistryJobStatusResponseSchema,
  skillRegistryListResponseSchema,
  skillRegistryOwnershipResponseSchema,
  skillRegistryPublishResponseSchema,
  skillRegistryPublishSummarySchema,
  skillRegistryQuoteResponseSchema,
} from './schemas';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface RegistryBrokerClientOptions {
  baseUrl?: string;
  fetchImplementation?: typeof fetch;
  defaultHeaders?: Record<string, string>;
  apiKey?: string;
  /**
   * Optional account identifier to send as the `x-account-id` header.
   *
   * This is used by some Registry Broker deployments to attribute registrations
   * when no API key / user session is present (for example local docker E2E).
   */
  accountId?: string;
  ledgerApiKey?: string;
  registrationAutoTopUp?: AutoTopUpOptions;
  historyAutoTopUp?: HistoryAutoTopUpOptions;
  encryption?: ClientEncryptionOptions;
}

export type ChatHistoryEntry = z.infer<
  typeof createSessionResponseSchema
>['history'][number];

export type CipherEnvelope = NonNullable<ChatHistoryEntry['cipherEnvelope']>;

export type CipherEnvelopeRecipient = CipherEnvelope['recipients'][number];

export interface EphemeralKeyPair {
  privateKey: string;
  publicKey: string;
}

export interface DeriveSharedSecretOptions {
  privateKey: string;
  peerPublicKey: string;
}

export type SharedSecretInput = string | Uint8Array | Buffer;

export interface EncryptCipherEnvelopeOptions {
  plaintext: string;
  sessionId: string;
  recipients: Array<
    Pick<
      CipherEnvelopeRecipient,
      'uaid' | 'ledgerAccountId' | 'userId' | 'email'
    >
  >;
  sharedSecret: SharedSecretInput;
  associatedData?: string;
  revision?: number;
}

export interface DecryptCipherEnvelopeOptions {
  envelope: CipherEnvelope;
  sharedSecret: SharedSecretInput;
  encoding?: BufferEncoding;
}

export type SessionEncryptionStatusResponse = z.infer<
  typeof sessionEncryptionStatusResponseSchema
>;

export type SessionEncryptionSummary =
  SessionEncryptionStatusResponse['encryption'];

export type EncryptionHandshakeResponse = z.infer<
  typeof encryptionHandshakeResponseSchema
>;

export type EncryptionHandshakeRecord =
  EncryptionHandshakeResponse['handshake'];

export interface RegisterEncryptionKeyPayload {
  keyType: 'secp256k1' | 'ed25519' | 'x25519';
  publicKey: string;
  uaid?: string;
  ledgerAccountId?: string;
  ledgerNetwork?: string;
  email?: string;
}

export type RegisterEncryptionKeyResponse = z.infer<
  typeof registerEncryptionKeyResponseSchema
>;

export interface AgentRegistrationRequestMetadata {
  trustScore?: number;
  verified?: boolean;
  avgLatency?: number;
  uptime?: number;
  provider?: string;
  category?: string;
  adapter?: string;
  openConvAICompatible?: boolean;
  customFields?: Record<string, string | number | boolean>;
  nativeId?: string;
  tunnelUrl?: string;
  publicUrl?: string;
  payments?: JsonValue;
  [key: string]: JsonValue | undefined;
}

export interface AgentRegistrationRequest {
  profile: JsonObject;
  endpoint?: string;
  protocol?: string;
  communicationProtocol?: string;
  registry?: string;
  additionalRegistries?: string[];
  metadata?: AgentRegistrationRequestMetadata;
}

export interface AutoTopUpOptions {
  accountId: string;
  privateKey: string;
  memo?: string;
}

export interface HistoryAutoTopUpOptions extends AutoTopUpOptions {
  hbarAmount?: number;
}

export interface RegisterAgentOptions {
  autoTopUp?: AutoTopUpOptions;
}

export interface RegistrationProgressWaitOptions {
  intervalMs?: number;
  timeoutMs?: number;
  throwOnFailure?: boolean;
  onProgress?: (progress: RegistrationProgressRecord) => void;
  signal?: AbortSignal;
}

export type AgentSearchHit = z.infer<
  typeof searchResponseSchema
>['hits'][number];

export type AgentProfile = AgentSearchHit['profile'];

export type SearchResult = z.infer<typeof searchResponseSchema>;

export interface SearchParams {
  q?: string;
  page?: number;
  limit?: number;
  registry?: string;
  registries?: string[];
  capabilities?: string[];
  protocols?: string[];
  minTrust?: number;
  adapters?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc' | string;
  type?: 'ai-agents' | 'mcp-servers' | 'all' | (string & {});
  verified?: boolean;
  online?: boolean;
  metadata?: Record<string, Array<string | number | boolean>>;
}

export type RegistryStatsResponse = z.infer<typeof statsResponseSchema>;

export type RegistriesResponse = z.infer<typeof registriesResponseSchema>;

export type PopularSearchesResponse = z.infer<typeof popularResponseSchema>;

export type ResolvedAgentResponse = z.infer<typeof resolveResponseSchema>;

export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;

export type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>;
export type ChatHistorySnapshotResponse = z.infer<
  typeof chatHistorySnapshotResponseSchema
>;
export type ChatHistoryCompactionResponse = z.infer<
  typeof chatHistoryCompactionResponseSchema
>;

export type AgentFeedbackResponse = z.infer<typeof agentFeedbackResponseSchema>;
export type AgentFeedbackEligibilityResponse = z.infer<
  typeof agentFeedbackEligibilityResponseSchema
>;
export type AgentFeedbackSubmissionResponse = z.infer<
  typeof agentFeedbackSubmissionResponseSchema
>;
export type AgentFeedbackIndexResponse = z.infer<
  typeof agentFeedbackIndexResponseSchema
>;

export type VerificationStatusResponse = z.infer<
  typeof verificationStatusResponseSchema
>;
export type VerificationChallengeResponse = z.infer<
  typeof verificationChallengeResponseSchema
>;
export type VerificationChallengeDetailsResponse = z.infer<
  typeof verificationChallengeDetailsResponseSchema
>;
export type VerificationVerifyResponse = z.infer<
  typeof verificationVerifyResponseSchema
>;
export type VerificationOwnershipResponse = z.infer<
  typeof verificationOwnershipResponseSchema
>;
export type VerificationVerifySenderResponse = z.infer<
  typeof verificationVerifySenderResponseSchema
>;

export type RegisterStatusResponse = z.infer<
  typeof registerStatusResponseSchema
>;

export type MoltbookOwnerRegistrationUpdateResponse = z.infer<
  typeof moltbookOwnerRegistrationUpdateResponseSchema
>;

export type SkillRegistryFileDescriptor = z.infer<
  typeof skillRegistryFileDescriptorSchema
>;
export type SkillRegistryPublishSummary = z.infer<
  typeof skillRegistryPublishSummarySchema
>;
export type SkillRegistryListResponse = z.infer<
  typeof skillRegistryListResponseSchema
>;
export type SkillRegistryQuoteResponse = z.infer<
  typeof skillRegistryQuoteResponseSchema
>;
export type SkillRegistryPublishResponse = z.infer<
  typeof skillRegistryPublishResponseSchema
>;
export type SkillRegistryJobStatusResponse = z.infer<
  typeof skillRegistryJobStatusResponseSchema
>;
export type SkillRegistryConfigResponse = z.infer<
  typeof skillRegistryConfigResponseSchema
>;
export type SkillRegistryOwnershipResponse = z.infer<
  typeof skillRegistryOwnershipResponseSchema
>;

export type SkillRegistryFileRole = 'skill-md' | 'skill-json' | 'file';

export interface SkillRegistryFileInput {
  name: string;
  base64: string;
  mimeType?: string;
}

export interface SkillRegistryQuoteRequest {
  files: SkillRegistryFileInput[];
  directoryTopicId?: string;
  accountId?: string;
}

export interface SkillRegistryPublishRequest {
  files: SkillRegistryFileInput[];
  directoryTopicId?: string;
  accountId?: string;
  quoteId?: string;
}

export interface MoltbookOwnerRegistrationUpdateRequest {
  registered?: boolean;
  name?: string;
  description?: string;
  endpoint?: string;
  metadata?: JsonObject;
}
export type AgentFeedbackEntriesIndexResponse = z.infer<
  typeof agentFeedbackEntriesIndexResponseSchema
>;

export interface AgentFeedbackQuery {
  includeRevoked?: boolean;
}

export interface AgentFeedbackEligibilityRequest {
  sessionId: string;
}

export interface AgentFeedbackSubmissionRequest {
  sessionId: string;
  score: number;
  tag1?: string;
  tag2?: string;
  fileUri?: string;
  fileHash?: string;
}

export type RegisterAgentSuccessResponse = z.infer<
  typeof registerAgentSuccessResponseSchema
>;
export type RegisterAgentPendingResponse = z.infer<
  typeof registerAgentPendingResponseSchema
>;
export type RegisterAgentPartialResponse = z.infer<
  typeof registerAgentPartialResponseSchema
>;
export type RegisterAgentResponse = z.infer<typeof registerAgentResponseSchema>;

export type RegistrationProgressAdditionalEntry = z.infer<
  typeof registrationProgressAdditionalEntrySchema
>;
export type RegistrationProgressRecord = z.infer<
  typeof registrationProgressRecordSchema
>;
export type RegistrationProgressResponse = z.infer<
  typeof registrationProgressResponseSchema
>;
export type RegisterAgentQuoteResponse = z.infer<
  typeof registrationQuoteResponseSchema
>;
export type CreditPurchaseResponse = z.infer<
  typeof creditPurchaseResponseSchema
>;
export type X402CreditPurchaseResponse = z.infer<
  typeof x402CreditPurchaseResponseSchema
>;
export type X402MinimumsResponse = z.infer<typeof x402MinimumsResponseSchema>;
export type AdditionalRegistryCatalogResponse = z.infer<
  typeof additionalRegistryCatalogResponseSchema
>;
export type AdditionalRegistryDescriptor =
  AdditionalRegistryCatalogResponse['registries'][number];
export type AdditionalRegistryNetworkDescriptor =
  AdditionalRegistryDescriptor['networks'][number];

export type AdapterDetailsResponse = z.infer<
  typeof adapterDetailsResponseSchema
>;

export interface LedgerChallengeRequest {
  accountId: string;
  network: string;
}

export type LedgerChallengeResponse = z.infer<
  typeof ledgerChallengeResponseSchema
>;

export interface LedgerAuthenticationSignerResult {
  signature: string;
  signatureKind?: 'raw' | 'map' | 'evm';
  publicKey?: string;
}

export interface LedgerAuthenticationOptions extends LedgerChallengeRequest {
  signer?: Signer;
  sign?: (
    message: string,
  ) =>
    | LedgerAuthenticationSignerResult
    | Promise<LedgerAuthenticationSignerResult>;
  expiresInMinutes?: number;
}

export interface LedgerVerifyRequest extends LedgerChallengeRequest {
  challengeId: string;
  signature: string;
  signatureKind?: 'raw' | 'map' | 'evm';
  publicKey?: string;
  expiresInMinutes?: number;
}

export type LedgerVerifyResponse = z.infer<typeof ledgerVerifyResponseSchema>;

export interface LedgerAuthenticationLogger {
  info?: (message: string) => void;
  warn?: (message: string) => void;
}

export interface LedgerCredentialAuthOptions {
  accountId: string;
  network: string;
  signer?: Signer;
  sign?: (
    message: string,
  ) =>
    | LedgerAuthenticationSignerResult
    | Promise<LedgerAuthenticationSignerResult>;
  hederaPrivateKey?: string;
  evmPrivateKey?: string;
  expiresInMinutes?: number;
  setAccountHeader?: boolean;
  label?: string;
  logger?: LedgerAuthenticationLogger;
}

export type ProtocolsResponse = z.infer<typeof protocolsResponseSchema>;

export type DetectProtocolResponse = z.infer<
  typeof detectProtocolResponseSchema
>;

export type ProtocolDetectionMessage = JsonObject;

export type RegistrySearchByNamespaceResponse = z.infer<
  typeof registrySearchByNamespaceSchema
>;

export type WebsocketStatsResponse = z.infer<
  typeof websocketStatsResponseSchema
>;

export type MetricsSummaryResponse = z.infer<
  typeof metricsSummaryResponseSchema
>;

export type UaidValidationResponse = z.infer<
  typeof uaidValidationResponseSchema
>;

export type UaidConnectionStatus = z.infer<typeof uaidConnectionStatusSchema>;

export type DashboardStatsResponse = z.infer<
  typeof dashboardStatsResponseSchema
>;

export type VectorSearchFilter = z.infer<
  typeof vectorSearchRequestSchema
>['filter'];

export type VectorSearchRequest = z.infer<typeof vectorSearchRequestSchema>;

export type VectorSearchResponse = z.infer<typeof vectorSearchResponseSchema>;
export type SearchStatusResponse = z.infer<typeof searchStatusResponseSchema>;

type CreateSessionBasePayload = {
  auth?: AgentAuthConfig;
  historyTtlSeconds?: number;
  encryptionRequested?: boolean;
  senderUaid?: string;
};

export type CreateSessionRequestPayload =
  | (CreateSessionBasePayload & { uaid: string })
  | (CreateSessionBasePayload & { agentUrl: string });

export interface CompactHistoryRequestPayload {
  sessionId: string;
  preserveEntries?: number;
}

export interface SendMessageEncryptionOptions
  extends Omit<EncryptCipherEnvelopeOptions, 'sessionId'> {
  sessionId?: string;
}

export interface SendMessageBasePayload {
  message: string;
  streaming?: boolean;
  auth?: AgentAuthConfig;
  cipherEnvelope?: CipherEnvelope;
  encryption?: SendMessageEncryptionOptions;
}

export interface StartEncryptedChatSessionOptions {
  uaid: string;
  senderUaid?: string;
  historyTtlSeconds?: number;
  handshakeTimeoutMs?: number;
  pollIntervalMs?: number;
  onSessionCreated?: (sessionId: string) => void;
  auth?: AgentAuthConfig;
}

export interface AcceptEncryptedChatSessionOptions {
  sessionId: string;
  responderUaid?: string;
  handshakeTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface EncryptedChatSendOptions {
  plaintext: string;
  message?: string;
  recipients?: Array<
    Pick<
      CipherEnvelopeRecipient,
      'uaid' | 'ledgerAccountId' | 'userId' | 'email'
    >
  >;
  streaming?: boolean;
  auth?: AgentAuthConfig;
}

export type ConversationMode = 'encrypted' | 'plaintext';

export interface DecryptedHistoryEntry {
  entry: ChatHistoryEntry;
  plaintext: string | null;
}

export interface ChatConversationHandle {
  sessionId: string;
  mode: ConversationMode;
  summary?: SessionEncryptionSummary | null;
  send: (options: EncryptedChatSendOptions) => Promise<SendMessageResponse>;
  decryptHistoryEntry: (entry: ChatHistoryEntry) => string | null;
  fetchHistory: (
    options?: ChatHistoryFetchOptions,
  ) => Promise<DecryptedHistoryEntry[]>;
}

export interface EncryptedChatSessionHandle extends ChatConversationHandle {
  summary: SessionEncryptionSummary;
  mode: 'encrypted';
}

export type RecipientIdentity = Pick<
  CipherEnvelopeRecipient,
  'uaid' | 'ledgerAccountId' | 'userId' | 'email'
>;

export interface ChatHistoryFetchOptions {
  decrypt?: boolean;
  identity?: RecipientIdentity;
  sharedSecret?: SharedSecretInput;
}

export type ChatHistorySnapshotWithDecryptedEntries =
  ChatHistorySnapshotResponse & {
    decryptedHistory?: DecryptedHistoryEntry[];
  };

export interface ConversationEncryptionOptions {
  preference?: 'preferred' | 'required' | 'disabled';
  handshakeTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface StartConversationOptions {
  uaid: string;
  senderUaid?: string;
  historyTtlSeconds?: number;
  auth?: AgentAuthConfig;
  encryption?: ConversationEncryptionOptions;
  onSessionCreated?: (sessionId: string) => void;
}

export interface AcceptConversationOptions {
  sessionId: string;
  responderUaid?: string;
  encryption?: ConversationEncryptionOptions;
}

export interface StartChatBaseOptions {
  auth?: AgentAuthConfig;
  historyTtlSeconds?: number;
  encryption?: ConversationEncryptionOptions;
  senderUaid?: string;
  onSessionCreated?: (sessionId: string) => void;
}

export type StartChatOptions =
  | (StartChatBaseOptions & { uaid: string; agentUrl?: never })
  | (StartChatBaseOptions & { agentUrl: string; uaid?: never });

export interface AutoRegisterEncryptionKeyOptions {
  enabled?: boolean;
  keyType?: 'secp256k1';
  publicKey?: string;
  privateKey?: string;
  envVar?: string;
  envPath?: string;
  generateIfMissing?: boolean;
  overwriteEnv?: boolean;
  uaid?: string;
  ledgerAccountId?: string;
  ledgerNetwork?: string;
  email?: string;
  label?: string;
}

export interface ClientEncryptionOptions {
  autoRegister?: AutoRegisterEncryptionKeyOptions;
  autoDecryptHistory?: boolean;
}

export interface EnsureAgentKeyOptions
  extends Omit<AutoRegisterEncryptionKeyOptions, 'enabled' | 'uaid'> {
  uaid: string;
}

export interface InitializeAgentClientOptions
  extends RegistryBrokerClientOptions {
  uaid: string;
  ensureEncryptionKey?: boolean | EnsureAgentKeyOptions;
}

export type SendMessageRequestPayload =
  | (SendMessageBasePayload & { uaid: string })
  | (SendMessageBasePayload & { sessionId: string })
  | (SendMessageBasePayload & { agentUrl: string; sessionId?: string });

export interface EncryptionHandshakeSubmissionPayload {
  role: 'requester' | 'responder';
  keyType: string;
  ephemeralPublicKey: string;
  longTermPublicKey?: string;
  signature?: string;
  uaid?: string;
  userId?: string;
  ledgerAccountId?: string;
  metadata?: Record<string, JsonValue>;
}
export type AgentAuthType = 'bearer' | 'basic' | 'header' | 'apiKey';

export interface AgentAuthConfig {
  type?: AgentAuthType;
  token?: string;
  username?: string;
  password?: string;
  headerName?: string;
  headerValue?: string;
  headers?: Record<string, string>;
}

export type AdaptersResponse = z.infer<typeof adaptersResponseSchema>;

export type AdapterRegistryCategory = z.infer<
  typeof adapterRegistryCategorySchema
>;

export type AdapterRegistryCategoriesResponse = z.infer<
  typeof adapterRegistryCategoriesResponseSchema
>;

export type AdapterRegistryAdaptersResponse = z.infer<
  typeof adapterRegistryAdaptersResponseSchema
>;

export type AdapterRegistryCreateCategoryResponse = z.infer<
  typeof adapterRegistryCreateCategoryResponseSchema
>;

export type AdapterRegistrySubmitAdapterResponse = z.infer<
  typeof adapterRegistrySubmitAdapterResponseSchema
>;

export type AdapterRegistrySubmitAdapterAcceptedResponse = z.infer<
  typeof adapterRegistrySubmitAdapterAcceptedResponseSchema
>;

export type AdapterRegistrySubmissionStatusResponse = z.infer<
  typeof adapterRegistrySubmissionStatusResponseSchema
>;

export interface CreateAdapterRegistryCategoryRequest {
  name: string;
  description?: string;
  type?: 'adapter-type' | 'custom';
  slug?: string;
  metadata?: {
    version?: string;
    name?: string;
    description?: string;
    operator?: {
      account?: string;
      name?: string;
      contact?: string;
    };
    entityTypes?: string[];
    categories?: string[];
    tags?: string[];
    links?: Record<string, string>;
  };
}

export interface SubmitAdapterRegistryAdapterRequest {
  adapterId: string;
  adapterName: string;
  entity: string;
  package: AdapterPackage;
  config: AdapterConfigContext;
  stateModel?: string;
  signature?: string;
  manifest: AdapterManifest;
  manifestPointer?: string;
  manifestSequence?: number;
  keywords?: string[];
  categorySlug?: string;
  newCategory?: CreateAdapterRegistryCategoryRequest;
}

export type SearchFacetsResponse = z.infer<typeof searchFacetsResponseSchema>;
