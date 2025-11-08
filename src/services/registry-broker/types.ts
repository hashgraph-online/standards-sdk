import { z } from 'zod';
import {
  adaptersResponseSchema,
  createSessionResponseSchema,
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
} from './schemas';
import { HCS11Profile } from '../../hcs-11/types';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export type ChatHistoryEntry = z.infer<
  typeof createSessionResponseSchema
>['history'][number];

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
}

export interface AgentRegistrationRequest {
  profile: HCS11Profile;
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
  network: 'mainnet' | 'testnet';
}

export type LedgerChallengeResponse = z.infer<
  typeof ledgerChallengeResponseSchema
>;

export interface LedgerAuthenticationSignerResult {
  signature: string;
  signatureKind?: 'raw' | 'map';
  publicKey?: string;
}

export interface LedgerAuthenticationOptions extends LedgerChallengeRequest {
  sign: (
    message: string,
  ) =>
    | LedgerAuthenticationSignerResult
    | Promise<LedgerAuthenticationSignerResult>;
  expiresInMinutes?: number;
}

export interface LedgerVerifyRequest extends LedgerChallengeRequest {
  challengeId: string;
  signature: string;
  signatureKind?: 'raw' | 'map';
  publicKey?: string;
  expiresInMinutes?: number;
}

export type LedgerVerifyResponse = z.infer<typeof ledgerVerifyResponseSchema>;

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

type CreateSessionBasePayload = {
  auth?: AgentAuthConfig;
  historyTtlSeconds?: number;
};

export type CreateSessionRequestPayload =
  | (CreateSessionBasePayload & { uaid: string })
  | (CreateSessionBasePayload & { agentUrl: string });

export interface CompactHistoryRequestPayload {
  sessionId: string;
  preserveEntries?: number;
}

export interface SendMessageBasePayload {
  message: string;
  streaming?: boolean;
  auth?: AgentAuthConfig;
}

export type SendMessageRequestPayload =
  | (SendMessageBasePayload & { uaid: string })
  | (SendMessageBasePayload & { sessionId: string })
  | (SendMessageBasePayload & { agentUrl: string; sessionId?: string });
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

export type SearchFacetsResponse = z.infer<typeof searchFacetsResponseSchema>;
