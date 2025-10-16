import {
  AdaptersResponse,
  CreateSessionRequestPayload,
  CreateSessionResponse,
  AgentRegistrationRequest,
  RegisterAgentResponse,
  RegisterAgentQuoteResponse,
  CreditPurchaseResponse,
  PopularSearchesResponse,
  RegistriesResponse,
  RegistryStatsResponse,
  ResolvedAgentResponse,
  SearchFacetsResponse,
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
  JsonObject,
  VectorSearchRequest,
  VectorSearchResponse,
  AgentAuthConfig,
  LedgerChallengeRequest,
  LedgerChallengeResponse,
  LedgerVerifyRequest,
  LedgerVerifyResponse,
  RegisterAgentOptions,
} from './types';
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
  registriesResponseSchema,
  registrySearchByNamespaceSchema,
  searchFacetsResponseSchema,
  vectorSearchResponseSchema,
  resolveResponseSchema,
  searchResponseSchema,
  sendMessageResponseSchema,
  statsResponseSchema,
  uaidBroadcastResponseSchema,
  uaidConnectionStatusSchema,
  uaidValidationResponseSchema,
  websocketStatsResponseSchema,
  ledgerChallengeResponseSchema,
  ledgerVerifyResponseSchema,
} from './schemas';
import { ZodError, z } from 'zod';

const DEFAULT_USER_AGENT =
  '@hashgraphonline/standards-sdk/registry-broker-client';

const normaliseHeaderName = (name: string): string => name.trim().toLowerCase();

const isBrowserRuntime = (): boolean =>
  typeof window !== 'undefined' && typeof window.fetch === 'function';

const DEFAULT_BASE_URL = 'https://registry.hashgraphonline.com/api/v1';
const JSON_CONTENT_TYPE = /application\/json/i;

const toJsonValue = (value: unknown): JsonValue => {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => (item === undefined ? null : toJsonValue(item)));
  }
  if (typeof value === 'object') {
    const result: JsonObject = {};
    Object.entries(value as Record<string, unknown>).forEach(
      ([key, entryValue]) => {
        if (entryValue !== undefined) {
          result[key] = toJsonValue(entryValue);
        }
      },
    );
    return result;
  }
  throw new TypeError('Only JSON-compatible values are supported');
};

const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toJsonObject = (value: unknown): JsonObject => {
  const normalised = toJsonValue(value);
  if (isJsonObject(normalised)) {
    return normalised;
  }
  throw new TypeError('Expected JSON object value');
};

const serialiseAuthConfig = (auth: AgentAuthConfig): JsonObject => {
  const authPayload: JsonObject = {};
  if (auth.type) {
    authPayload.type = auth.type;
  }
  if (auth.token) {
    authPayload.token = auth.token;
  }
  if (auth.username) {
    authPayload.username = auth.username;
  }
  if (auth.password) {
    authPayload.password = auth.password;
  }
  if (auth.headerName) {
    authPayload.headerName = auth.headerName;
  }
  if (auth.headerValue) {
    authPayload.headerValue = auth.headerValue;
  }
  if (auth.headers) {
    authPayload.headers = { ...auth.headers };
  }
  return authPayload;
};

const serialiseAgentRegistrationRequest = (
  payload: AgentRegistrationRequest,
): JsonObject => {
  const body: JsonObject = {
    profile: toJsonObject(payload.profile),
  };
  if (payload.endpoint !== undefined) {
    body.endpoint = payload.endpoint;
  }
  if (payload.protocol !== undefined) {
    body.protocol = payload.protocol;
  }
  if (payload.communicationProtocol !== undefined) {
    body.communicationProtocol = payload.communicationProtocol;
  }
  if (payload.registry !== undefined) {
    body.registry = payload.registry;
  }
  if (payload.metadata !== undefined) {
    body.metadata = toJsonObject(payload.metadata);
  }
  return body;
};

export interface RegistryBrokerClientOptions {
  baseUrl?: string;
  fetchImplementation?: typeof fetch;
  defaultHeaders?: Record<string, string>;
  apiKey?: string;
  ledgerApiKey?: string;
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
  const baseCandidate =
    trimmed && trimmed.length > 0 ? trimmed : DEFAULT_BASE_URL;
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
    createSession: (
      payload: CreateSessionRequestPayload,
    ) => Promise<CreateSessionResponse>;
    sendMessage: (
      payload: SendMessageRequestPayload,
    ) => Promise<SendMessageResponse>;
    endSession: (sessionId: string) => Promise<void>;
  };

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: RegistryBrokerClientOptions = {}) {
    this.baseUrl = normaliseBaseUrl(options.baseUrl);
    const fetchCandidate = options.fetchImplementation ?? globalThis.fetch;
    if (!fetchCandidate) {
      throw new Error(
        'A fetch implementation is required for RegistryBrokerClient',
      );
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
    if (options.ledgerApiKey && options.ledgerApiKey.trim().length > 0) {
      this.setLedgerApiKey(options.ledgerApiKey);
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

  setLedgerApiKey(apiKey?: string): void {
    this.setDefaultHeader('x-ledger-api-key', apiKey);
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
    const raw = await this.requestJson<JsonValue>(`/search${query}`, {
      method: 'GET',
    });
    return this.parseWithSchema(raw, searchResponseSchema, 'search response');
  }

  async stats(): Promise<RegistryStatsResponse> {
    const raw = await this.requestJson<JsonValue>('/stats', { method: 'GET' });
    return this.parseWithSchema(raw, statsResponseSchema, 'stats response');
  }

  async registries(): Promise<RegistriesResponse> {
    const raw = await this.requestJson<JsonValue>('/registries', {
      method: 'GET',
    });
    return this.parseWithSchema(
      raw,
      registriesResponseSchema,
      'registries response',
    );
  }

  async popularSearches(): Promise<PopularSearchesResponse> {
    const raw = await this.requestJson<JsonValue>('/popular', {
      method: 'GET',
    });
    return this.parseWithSchema(
      raw,
      popularResponseSchema,
      'popular searches response',
    );
  }

  async resolveUaid(uaid: string): Promise<ResolvedAgentResponse> {
    const raw = await this.requestJson<JsonValue>(
      `/resolve/${encodeURIComponent(uaid)}`,
      {
        method: 'GET',
      },
    );
    return this.parseWithSchema(
      raw,
      resolveResponseSchema,
      'resolve UAID response',
    );
  }

  private async performRegisterAgent(
    payload: AgentRegistrationRequest,
  ): Promise<RegisterAgentResponse> {
    const raw = await this.requestJson<JsonValue>('/register', {
      method: 'POST',
      body: serialiseAgentRegistrationRequest(payload),
      headers: { 'content-type': 'application/json' },
    });
    return this.parseWithSchema(
      raw,
      registerAgentResponseSchema,
      'register agent response',
    );
  }

  async registerAgent(
    payload: AgentRegistrationRequest,
    options?: RegisterAgentOptions,
  ): Promise<RegisterAgentResponse> {
    const autoTopUp = options?.autoTopUp;

    if (!autoTopUp) {
      return this.performRegisterAgent(payload);
    }

    await this.ensureCreditsForRegistration(payload, autoTopUp);

    let retried = false;
    while (true) {
      try {
        return await this.performRegisterAgent(payload);
      } catch (error) {
        const shortfall = this.extractInsufficientCreditsDetails(error);
        if (shortfall && !retried) {
          await this.ensureCreditsForRegistration(payload, autoTopUp);
          retried = true;
          continue;
        }
        throw error;
      }
    }
  }

  async getRegistrationQuote(
    payload: AgentRegistrationRequest,
  ): Promise<RegisterAgentQuoteResponse> {
    const raw = await this.requestJson<JsonValue>('/register/quote', {
      method: 'POST',
      body: serialiseAgentRegistrationRequest(payload),
      headers: { 'content-type': 'application/json' },
    });

    return this.parseWithSchema(
      raw,
      registrationQuoteResponseSchema,
      'registration quote response',
    );
  }

  async purchaseCreditsWithHbar(params: {
    accountId: string;
    privateKey: string;
    hbarAmount: number;
    memo?: string;
    metadata?: JsonObject;
  }): Promise<CreditPurchaseResponse> {
    const body: JsonObject = {
      accountId: params.accountId,
      payerKey: params.privateKey,
      hbarAmount: this.calculateHbarAmountParam(params.hbarAmount),
    };

    if (params.memo) {
      body.memo = params.memo;
    }

    if (params.metadata) {
      body.metadata = params.metadata;
    }

    const raw = await this.requestJson<JsonValue>('/credits/purchase', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });

    return this.parseWithSchema(
      raw,
      creditPurchaseResponseSchema,
      'credit purchase response',
    );
  }

  private calculateHbarAmount(
    shortfallCredits: number,
    creditsPerHbar: number,
  ): number {
    if (creditsPerHbar <= 0) {
      throw new Error('creditsPerHbar must be positive');
    }
    const rawHbar = shortfallCredits / creditsPerHbar;
    const tinybars = Math.ceil(rawHbar * 1e8);
    return tinybars / 1e8;
  }

  private calculateHbarAmountParam(hbarAmount: number): number {
    const tinybars = Math.ceil(hbarAmount * 1e8);
    if (tinybars <= 0) {
      throw new Error('Calculated purchase amount must be positive');
    }
    return tinybars / 1e8;
  }

  private async ensureCreditsForRegistration(
    payload: AgentRegistrationRequest,
    autoTopUp: RegisterAgentOptions['autoTopUp'],
  ): Promise<void> {
    const details = autoTopUp ?? null;
    if (!details) {
      return;
    }

    if (!details.accountId || !details.accountId.trim()) {
      throw new Error('autoTopUp.accountId is required');
    }

    if (!details.privateKey || !details.privateKey.trim()) {
      throw new Error('autoTopUp.privateKey is required');
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const quote = await this.getRegistrationQuote(payload);
      const shortfall = quote.shortfallCredits ?? 0;
      if (shortfall <= 0) {
        return;
      }

      const creditsPerHbar = quote.creditsPerHbar ?? null;
      if (!creditsPerHbar || creditsPerHbar <= 0) {
        throw new Error('Unable to determine credits per HBAR for auto top-up');
      }

      const hbarAmount = this.calculateHbarAmount(shortfall, creditsPerHbar);

      await this.purchaseCreditsWithHbar({
        accountId: details.accountId.trim(),
        privateKey: details.privateKey.trim(),
        hbarAmount,
        memo: details.memo ?? 'Registry Broker auto top-up',
        metadata: {
          shortfallCredits: shortfall,
          requiredCredits: quote.requiredCredits,
        },
      });
    }

    const finalQuote = await this.getRegistrationQuote(payload);
    if ((finalQuote.shortfallCredits ?? 0) > 0) {
      throw new Error('Unable to purchase sufficient credits for registration');
    }
  }

  private extractInsufficientCreditsDetails(error: unknown): {
    shortfallCredits: number;
  } | null {
    if (!(error instanceof RegistryBrokerError) || error.status !== 402) {
      return null;
    }

    const body = error.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return null;
    }

    const maybeShortfall = (body as JsonObject)['shortfallCredits'];
    if (typeof maybeShortfall !== 'number' || maybeShortfall <= 0) {
      return null;
    }

    return { shortfallCredits: maybeShortfall };
  }

  async createLedgerChallenge(
    payload: LedgerChallengeRequest,
  ): Promise<LedgerChallengeResponse> {
    const raw = await this.requestJson<JsonValue>('/auth/ledger/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: {
        accountId: payload.accountId,
        network: payload.network,
      },
    });

    return this.parseWithSchema(
      raw,
      ledgerChallengeResponseSchema,
      'ledger challenge response',
    );
  }

  async verifyLedgerChallenge(
    payload: LedgerVerifyRequest,
  ): Promise<LedgerVerifyResponse> {
    const body: JsonObject = {
      challengeId: payload.challengeId,
      accountId: payload.accountId,
      network: payload.network,
      signature: payload.signature,
    };

    if (payload.signatureKind) {
      body.signatureKind = payload.signatureKind;
    }
    if (payload.publicKey) {
      body.publicKey = payload.publicKey;
    }

    const raw = await this.requestJson<JsonValue>('/auth/ledger/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });

    const result = this.parseWithSchema(
      raw,
      ledgerVerifyResponseSchema,
      'ledger verification response',
    );

    this.setLedgerApiKey(result.key);
    return result;
  }

  async listProtocols(): Promise<ProtocolsResponse> {
    const raw = await this.requestJson<JsonValue>('/protocols', {
      method: 'GET',
    });
    return this.parseWithSchema(
      raw,
      protocolsResponseSchema,
      'protocols response',
    );
  }

  async detectProtocol(
    message: ProtocolDetectionMessage,
  ): Promise<DetectProtocolResponse> {
    const raw = await this.requestJson<JsonValue>('/detect-protocol', {
      method: 'POST',
      body: { message },
      headers: { 'content-type': 'application/json' },
    });
    return this.parseWithSchema(
      raw,
      detectProtocolResponseSchema,
      'detect protocol response',
    );
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
    return this.parseWithSchema(
      raw,
      registrySearchByNamespaceSchema,
      'registry search response',
    );
  }

  async vectorSearch(
    request: VectorSearchRequest,
  ): Promise<VectorSearchResponse> {
    const raw = await this.requestJson<JsonValue>('/search', {
      method: 'POST',
      body: request,
      headers: { 'content-type': 'application/json' },
    });
    return this.parseWithSchema(
      raw,
      vectorSearchResponseSchema,
      'vector search response',
    );
  }

  async websocketStats(): Promise<WebsocketStatsResponse> {
    const raw = await this.requestJson<JsonValue>('/websocket/stats', {
      method: 'GET',
    });
    return this.parseWithSchema(
      raw,
      websocketStatsResponseSchema,
      'websocket stats response',
    );
  }

  async metricsSummary(): Promise<MetricsSummaryResponse> {
    const raw = await this.requestJson<JsonValue>('/metrics', {
      method: 'GET',
    });
    return this.parseWithSchema(
      raw,
      metricsSummaryResponseSchema,
      'metrics summary response',
    );
  }

  async validateUaid(uaid: string): Promise<UaidValidationResponse> {
    const raw = await this.requestJson<JsonValue>(
      `/uaids/validate/${encodeURIComponent(uaid)}`,
      {
        method: 'GET',
      },
    );
    return this.parseWithSchema(
      raw,
      uaidValidationResponseSchema,
      'UAID validation response',
    );
  }

  async broadcastToUaids(
    uaids: string[],
    message: JsonValue,
  ): Promise<UaidBroadcastResponse> {
    const raw = await this.requestJson<JsonValue>('/uaids/broadcast', {
      method: 'POST',
      body: { uaids, message },
      headers: { 'content-type': 'application/json' },
    });
    return this.parseWithSchema(
      raw,
      uaidBroadcastResponseSchema,
      'UAID broadcast response',
    );
  }

  async getUaidConnectionStatus(uaid: string): Promise<UaidConnectionStatus> {
    const raw = await this.requestJson<JsonValue>(
      `/uaids/connections/${encodeURIComponent(uaid)}/status`,
      {
        method: 'GET',
      },
    );
    return this.parseWithSchema(
      raw,
      uaidConnectionStatusSchema,
      'UAID connection status',
    );
  }

  async closeUaidConnection(uaid: string): Promise<void> {
    await this.request(`/uaids/connections/${encodeURIComponent(uaid)}`, {
      method: 'DELETE',
    });
  }

  async dashboardStats(): Promise<DashboardStatsResponse> {
    const raw = await this.requestJson<JsonValue>('/dashboard/stats', {
      method: 'GET',
    });
    return this.parseWithSchema(
      raw,
      dashboardStatsResponseSchema,
      'dashboard stats response',
    );
  }

  async adapters(): Promise<AdaptersResponse> {
    const raw = await this.requestJson<JsonValue>('/adapters', {
      method: 'GET',
    });
    return this.parseWithSchema(
      raw,
      adaptersResponseSchema,
      'adapters response',
    );
  }

  async facets(adapter?: string): Promise<SearchFacetsResponse> {
    const params = new URLSearchParams();
    if (adapter) {
      params.set('adapter', adapter);
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    const raw = await this.requestJson<JsonValue>(`/search/facets${suffix}`, {
      method: 'GET',
    });
    return this.parseWithSchema(
      raw,
      searchFacetsResponseSchema,
      'search facets response',
    );
  }

  private async createSession(
    payload: CreateSessionRequestPayload,
  ): Promise<CreateSessionResponse> {
    const body: JsonObject = {};
    if ('uaid' in payload) {
      body.uaid = payload.uaid;
    } else {
      body.agentUrl = payload.agentUrl;
    }
    if (payload.auth) {
      body.auth = serialiseAuthConfig(payload.auth);
    }
    const raw = await this.requestJson<JsonValue>('/chat/session', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    });
    return this.parseWithSchema(
      raw,
      createSessionResponseSchema,
      'chat session response',
    );
  }

  private async sendMessage(
    payload: SendMessageRequestPayload,
  ): Promise<SendMessageResponse> {
    const body: JsonObject = {
      message: payload.message,
    };
    if (payload.streaming !== undefined) {
      body.streaming = payload.streaming;
    }
    if (payload.auth) {
      body.auth = serialiseAuthConfig(payload.auth);
    }
    if ('uaid' in payload) {
      body.uaid = payload.uaid;
    }
    if ('sessionId' in payload && payload.sessionId) {
      body.sessionId = payload.sessionId;
    }
    if ('agentUrl' in payload && payload.agentUrl) {
      body.agentUrl = payload.agentUrl;
    }

    const raw = await this.requestJson<JsonValue>('/chat/message', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    });
    return this.parseWithSchema(
      raw,
      sendMessageResponseSchema,
      'chat message response',
    );
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

  private request = async (
    path: string,
    config: RequestConfig,
  ): Promise<Response> => {
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
      throw new RegistryBrokerParseError(
        'Expected JSON response from registry broker',
        body,
      );
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

  private parseWithSchema<T>(
    value: JsonValue,
    schema: z.ZodSchema<T>,
    context: string,
  ): T {
    try {
      return schema.parse(value);
    } catch (error) {
      throw new RegistryBrokerParseError(
        `Failed to parse ${context}`,
        error instanceof ZodError || error instanceof Error
          ? error
          : String(error),
      );
    }
  }
}
