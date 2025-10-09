import {
  CreateSessionRequestPayload,
  CreateSessionResponse,
  AgentRegistrationRequest,
  RegisterAgentResponse,
  PopularSearchesResponse,
  RegistriesResponse,
  RegistryStatsResponse,
  ResolvedAgentResponse,
  SearchParams,
  SearchResult,
  SendMessageRequestPayload,
  SendMessageResponse,
  ProtocolsResponse,
  DetectProtocolResponse,
  ProtocolDetectionMessage,
  RegistrySearchByNamespaceResponse,
  WebsocketStatsResponse,
  MetricsSummaryResponse,
  UaidValidationResponse,
  UaidBroadcastResponse,
  UaidConnectionStatus,
  DashboardStatsResponse,
  JsonValue,
  VectorSearchRequest,
  VectorSearchResponse,
} from './types';
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
import { ZodError, z } from 'zod';

const DEFAULT_USER_AGENT = '@hashgraphonline/standards-sdk/registry-broker-client';

const normaliseHeaderName = (name: string): string => name.trim().toLowerCase();

const isBrowserRuntime = (): boolean => typeof window !== 'undefined' && typeof window.fetch === 'function';

const DEFAULT_BASE_URL = 'https://registry.hashgraphonline.com/api/v1';
const JSON_CONTENT_TYPE = /application\/json/i;

export interface RegistryBrokerClientOptions {
  baseUrl?: string;
  fetchImplementation?: typeof fetch;
  defaultHeaders?: Record<string, string>;
  apiKey?: string;
}

interface RequestConfig {
  method?: string;
  body?: JsonValue;
  headers?: Record<string, string>;
}

interface ErrorDetails {
  status: number;
  statusText: string;
  body: JsonValue;
}

export class RegistryBrokerError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: JsonValue;

  constructor(message: string, details: ErrorDetails) {
    super(message);
    this.status = details.status;
    this.statusText = details.statusText;
    this.body = details.body;
  }
}

export class RegistryBrokerParseError extends Error {
  readonly cause: ZodError | Error | string;

  constructor(message: string, cause: ZodError | Error | string) {
    super(message);
    this.cause = cause;
  }
}

function normaliseBaseUrl(input?: string): string {
  const trimmed = input?.trim();
  const baseCandidate = trimmed && trimmed.length > 0 ? trimmed : DEFAULT_BASE_URL;
  const withoutTrailing = baseCandidate.replace(/\/+$/, '');
  if (/\/api\/v\d+$/i.test(withoutTrailing)) {
    return withoutTrailing;
  }
  return `${withoutTrailing}/api/v1`;
}

function buildSearchQuery(params: SearchParams): string {
  const query = new URLSearchParams();
  if (params.q) {
    query.set('q', params.q);
  }
  if (typeof params.page === 'number') {
    query.set('page', params.page.toString());
  }
  if (typeof params.limit === 'number') {
    query.set('limit', params.limit.toString());
  }
  if (params.registry) {
    query.set('registry', params.registry);
  }
  if (typeof params.minTrust === 'number') {
    query.set('minTrust', params.minTrust.toString());
  }
  if (params.capabilities?.length) {
    params.capabilities.forEach(value => {
      query.append('capabilities', value);
    });
  }
  const queryString = query.toString();
  return queryString.length > 0 ? `?${queryString}` : '';
}

export class RegistryBrokerClient {
  readonly chat: {
    createSession: (payload: CreateSessionRequestPayload) => Promise<CreateSessionResponse>;
    sendMessage: (payload: SendMessageRequestPayload) => Promise<SendMessageResponse>;
    endSession: (sessionId: string) => Promise<void>;
  };

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: RegistryBrokerClientOptions = {}) {
    this.baseUrl = normaliseBaseUrl(options.baseUrl);
    const fetchCandidate = options.fetchImplementation ?? globalThis.fetch;
    if (!fetchCandidate) {
      throw new Error('A fetch implementation is required for RegistryBrokerClient');
    }
    this.fetchImpl = fetchCandidate;
    this.defaultHeaders = {};
    if (options.defaultHeaders) {
      Object.entries(options.defaultHeaders).forEach(([name, value]) => {
        if (typeof value === 'string') {
          this.setDefaultHeader(name, value);
        }
      });
    }
    if (options.apiKey && options.apiKey.trim().length > 0) {
      this.setApiKey(options.apiKey);
    }

    this.chat = {
      createSession: payload => this.createSession(payload),
      sendMessage: payload => this.sendMessage(payload),
      endSession: sessionId => this.endSession(sessionId),
    };
  }

  setApiKey(apiKey?: string): void {
    this.setDefaultHeader('x-api-key', apiKey);
  }

  setDefaultHeader(name: string, value?: string | null): void {
    if (!name || name.trim().length === 0) {
      return;
    }
    const headerName = normaliseHeaderName(name);
    if (!value || value.trim().length === 0) {
      delete this.defaultHeaders[headerName];
      return;
    }
    this.defaultHeaders[headerName] = value.trim();
  }

  getDefaultHeaders(): Record<string, string> {
    return { ...this.defaultHeaders };
  }

  async search(params: SearchParams = {}): Promise<SearchResult> {
    const query = buildSearchQuery(params);
    const raw = await this.requestJson<JsonValue>(`/search${query}`, { method: 'GET' });
    return this.parseWithSchema(raw, searchResponseSchema, 'search response');
  }

  async stats(): Promise<RegistryStatsResponse> {
    const raw = await this.requestJson<JsonValue>('/stats', { method: 'GET' });
    return this.parseWithSchema(raw, statsResponseSchema, 'stats response');
  }

  async registries(): Promise<RegistriesResponse> {
    const raw = await this.requestJson<JsonValue>('/registries', { method: 'GET' });
    return this.parseWithSchema(raw, registriesResponseSchema, 'registries response');
  }

  async popularSearches(): Promise<PopularSearchesResponse> {
    const raw = await this.requestJson<JsonValue>('/popular', { method: 'GET' });
    return this.parseWithSchema(raw, popularResponseSchema, 'popular searches response');
  }

  async resolveUaid(uaid: string): Promise<ResolvedAgentResponse> {
    const raw = await this.requestJson<JsonValue>(`/resolve/${encodeURIComponent(uaid)}`, {
      method: 'GET',
    });
    return this.parseWithSchema(raw, resolveResponseSchema, 'resolve UAID response');
  }

  async registerAgent(payload: AgentRegistrationRequest): Promise<RegisterAgentResponse> {
    const raw = await this.requestJson<JsonValue>('/register', {
      method: 'POST',
      body: payload,
      headers: { 'content-type': 'application/json' },
    });
    return this.parseWithSchema(raw, registerAgentResponseSchema, 'register agent response');
  }

  async listProtocols(): Promise<ProtocolsResponse> {
    const raw = await this.requestJson<JsonValue>('/protocols', { method: 'GET' });
    return this.parseWithSchema(raw, protocolsResponseSchema, 'protocols response');
  }

  async detectProtocol(message: ProtocolDetectionMessage): Promise<DetectProtocolResponse> {
    const raw = await this.requestJson<JsonValue>('/detect-protocol', {
      method: 'POST',
      body: { message },
      headers: { 'content-type': 'application/json' },
    });
    return this.parseWithSchema(raw, detectProtocolResponseSchema, 'detect protocol response');
  }

  async registrySearchByNamespace(
    registry: string,
    query?: string,
  ): Promise<RegistrySearchByNamespaceResponse> {
    const params = new URLSearchParams();
    if (query) {
      params.set('q', query);
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    const raw = await this.requestJson<JsonValue>(
      `/registries/${encodeURIComponent(registry)}/search${suffix}`,
      {
        method: 'GET',
      },
    );
    return this.parseWithSchema(raw, registrySearchByNamespaceSchema, 'registry search response');
  }

  async vectorSearch(request: VectorSearchRequest): Promise<VectorSearchResponse> {
    const raw = await this.requestJson<JsonValue>('/search', {
      method: 'POST',
      body: request,
      headers: { 'content-type': 'application/json' },
    });
    return this.parseWithSchema(raw, vectorSearchResponseSchema, 'vector search response');
  }

  async websocketStats(): Promise<WebsocketStatsResponse> {
    const raw = await this.requestJson<JsonValue>('/websocket/stats', { method: 'GET' });
    return this.parseWithSchema(raw, websocketStatsResponseSchema, 'websocket stats response');
  }

  async metricsSummary(): Promise<MetricsSummaryResponse> {
    const raw = await this.requestJson<JsonValue>('/metrics', { method: 'GET' });
    return this.parseWithSchema(raw, metricsSummaryResponseSchema, 'metrics summary response');
  }

  async validateUaid(uaid: string): Promise<UaidValidationResponse> {
    const raw = await this.requestJson<JsonValue>(
      `/uaids/validate/${encodeURIComponent(uaid)}`,
      {
        method: 'GET',
      },
    );
    return this.parseWithSchema(raw, uaidValidationResponseSchema, 'UAID validation response');
  }

  async broadcastToUaids(uaids: string[], message: JsonValue): Promise<UaidBroadcastResponse> {
    const raw = await this.requestJson<JsonValue>('/uaids/broadcast', {
      method: 'POST',
      body: { uaids, message },
      headers: { 'content-type': 'application/json' },
    });
    return this.parseWithSchema(raw, uaidBroadcastResponseSchema, 'UAID broadcast response');
  }

  async getUaidConnectionStatus(uaid: string): Promise<UaidConnectionStatus> {
    const raw = await this.requestJson<JsonValue>(
      `/uaids/connections/${encodeURIComponent(uaid)}/status`,
      {
        method: 'GET',
      },
    );
    return this.parseWithSchema(raw, uaidConnectionStatusSchema, 'UAID connection status');
  }

  async closeUaidConnection(uaid: string): Promise<void> {
    await this.request(`/uaids/connections/${encodeURIComponent(uaid)}`, {
      method: 'DELETE',
    });
  }

  async dashboardStats(): Promise<DashboardStatsResponse> {
    const raw = await this.requestJson<JsonValue>('/dashboard/stats', { method: 'GET' });
    return this.parseWithSchema(raw, dashboardStatsResponseSchema, 'dashboard stats response');
  }

  private async createSession(
    payload: CreateSessionRequestPayload,
  ): Promise<CreateSessionResponse> {
    const body = 'uaid' in payload ? { uaid: payload.uaid } : { agentUrl: payload.agentUrl };
    const raw = await this.requestJson<JsonValue>('/chat/session', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    });
    return this.parseWithSchema(raw, createSessionResponseSchema, 'chat session response');
  }

  private async sendMessage(
    payload: SendMessageRequestPayload,
  ): Promise<SendMessageResponse> {
    const raw = await this.requestJson<JsonValue>('/chat/message', {
      method: 'POST',
      body: payload,
      headers: { 'content-type': 'application/json' },
    });
    return this.parseWithSchema(raw, sendMessageResponseSchema, 'chat message response');
  }

  private async endSession(sessionId: string): Promise<void> {
    await this.request(`/chat/session/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  }

  private buildUrl(path: string): string {
    const normalisedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${normalisedPath}`;
  }

  private request = async (path: string, config: RequestConfig): Promise<Response> => {
    const headers = new Headers();
    Object.entries(this.defaultHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
    if (config.headers) {
      Object.entries(config.headers).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }
    if (!headers.has('accept')) {
      headers.set('accept', 'application/json');
    }
    if (!headers.has('user-agent') && !isBrowserRuntime()) {
      headers.set('user-agent', DEFAULT_USER_AGENT);
    }

    const init: RequestInit = {
      method: config.method ?? 'GET',
      headers,
    };

    if (config.body !== undefined) {
      init.body = JSON.stringify(config.body);
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
    }

    const response = await this.fetchImpl(this.buildUrl(path), init);
    if (response.ok) {
      return response;
    }
    const errorBody = await this.extractErrorBody(response);
    throw new RegistryBrokerError('Registry broker request failed', {
      status: response.status,
      statusText: response.statusText,
      body: errorBody,
    });
  };

  private async requestJson<T extends JsonValue = JsonValue>(
    path: string,
    config: RequestConfig,
  ): Promise<T> {
    const response = await this.request(path, config);
    const contentType = response.headers?.get('content-type') ?? '';
    if (!JSON_CONTENT_TYPE.test(contentType)) {
      const body = await response.text();
      throw new RegistryBrokerParseError('Expected JSON response from registry broker', body);
    }
    return (await response.json()) as T;
  }

  private async extractErrorBody(response: Response): Promise<JsonValue> {
    const contentType = response.headers?.get('content-type') ?? '';
    if (JSON_CONTENT_TYPE.test(contentType)) {
      try {
        return (await response.json()) as JsonValue;
      } catch (error) {
        return { parseError: String(error) };
      }
    }
    try {
      return await response.text();
    } catch (error) {
      return { parseError: String(error) };
    }
  }

  private parseWithSchema<T>(value: JsonValue, schema: z.ZodSchema<T>, context: string): T {
    try {
      return schema.parse(value);
    } catch (error) {
      throw new RegistryBrokerParseError(
        `Failed to parse ${context}`,
        error instanceof ZodError || error instanceof Error ? error : String(error),
      );
    }
  }
}
