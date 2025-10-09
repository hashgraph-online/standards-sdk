import { z } from 'zod';
import {
  createSessionResponseSchema,
  detectProtocolResponseSchema,
  dashboardStatsResponseSchema,
  metricsSummaryResponseSchema,
  popularResponseSchema,
  protocolsResponseSchema,
  registerAgentResponseSchema,
  registriesResponseSchema,
  registrySearchByNamespaceSchema,
  vectorSearchRequestSchema,
  vectorSearchResponseSchema,
  resolveResponseSchema,
  searchResponseSchema,
  sendMessageResponseSchema,
  statsResponseSchema,
  uaidBroadcastResponseSchema,
  uaidConnectionStatusSchema,
  uaidValidationResponseSchema,
  websocketStatsResponseSchema,
} from './schemas';
import { HCS11Profile } from '../../hcs-11/types';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

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
  metadata?: AgentRegistrationRequestMetadata;
}

export type AgentSearchHit = z.infer<typeof searchResponseSchema>['hits'][number];

export type AgentProfile = AgentSearchHit['profile'];

export type SearchResult = z.infer<typeof searchResponseSchema>;

export interface SearchParams {
  q?: string;
  page?: number;
  limit?: number;
  registry?: string;
  capabilities?: string[];
  minTrust?: number;
}

export type RegistryStatsResponse = z.infer<typeof statsResponseSchema>;

export type RegistriesResponse = z.infer<typeof registriesResponseSchema>;

export type PopularSearchesResponse = z.infer<typeof popularResponseSchema>;

export type ResolvedAgentResponse = z.infer<typeof resolveResponseSchema>;

export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;

export type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>;

export type RegisterAgentResponse = z.infer<typeof registerAgentResponseSchema>;

export type ProtocolsResponse = z.infer<typeof protocolsResponseSchema>;

export type DetectProtocolResponse = z.infer<typeof detectProtocolResponseSchema>;

export type ProtocolDetectionMessage = JsonObject;

export type RegistrySearchByNamespaceResponse = z.infer<
  typeof registrySearchByNamespaceSchema
>;

export type WebsocketStatsResponse = z.infer<typeof websocketStatsResponseSchema>;

export type MetricsSummaryResponse = z.infer<typeof metricsSummaryResponseSchema>;

export type UaidValidationResponse = z.infer<typeof uaidValidationResponseSchema>;

export type UaidBroadcastResponse = z.infer<typeof uaidBroadcastResponseSchema>;

export type UaidConnectionStatus = z.infer<typeof uaidConnectionStatusSchema>;

export type DashboardStatsResponse = z.infer<typeof dashboardStatsResponseSchema>;

export type VectorSearchFilter = z.infer<typeof vectorSearchRequestSchema>['filter'];

export type VectorSearchRequest = z.infer<typeof vectorSearchRequestSchema>;

export type VectorSearchResponse = z.infer<typeof vectorSearchResponseSchema>;

export type CreateSessionRequestPayload =
  | {
      uaid: string;
    }
  | {
      agentUrl: string;
    };

export interface SendMessageBasePayload {
  message: string;
  streaming?: boolean;
}

export type SendMessageRequestPayload =
  | (SendMessageBasePayload & { uaid: string })
  | (SendMessageBasePayload & { sessionId: string })
  | (SendMessageBasePayload & { agentUrl: string; sessionId?: string });
