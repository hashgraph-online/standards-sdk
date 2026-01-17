import { Buffer } from 'buffer';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { ZodError, z } from 'zod';
import type {
  AgentFeedbackEligibilityRequest,
  AgentFeedbackEligibilityResponse,
  AgentFeedbackIndexResponse,
  AgentFeedbackEntriesIndexResponse,
  AgentFeedbackQuery,
  AgentFeedbackResponse,
  AgentFeedbackSubmissionRequest,
  AgentFeedbackSubmissionResponse,
  AutoTopUpOptions,
  ClientEncryptionOptions,
  CreateSessionRequestPayload,
  DeriveSharedSecretOptions,
  DecryptCipherEnvelopeOptions,
  EncryptCipherEnvelopeOptions,
  EphemeralKeyPair,
  HistoryAutoTopUpOptions,
  InitializeAgentClientOptions,
  JsonObject,
  JsonValue,
  RegisterAgentResponse,
  RegisterAgentPartialResponse,
  RegisterAgentPendingResponse,
  RegisterAgentSuccessResponse,
  RegistryBrokerClientOptions,
  SharedSecretInput,
  SearchParams,
  SearchResult,
  RegistryStatsResponse,
  RegistriesResponse,
  AdditionalRegistryCatalogResponse,
  PopularSearchesResponse,
  ProtocolsResponse,
  ProtocolDetectionMessage,
  DetectProtocolResponse,
  RegistrySearchByNamespaceResponse,
  VectorSearchRequest,
  VectorSearchResponse,
  SearchStatusResponse,
  WebsocketStatsResponse,
  MetricsSummaryResponse,
  SearchFacetsResponse,
} from '../types';
import {
  agentFeedbackEligibilityResponseSchema,
  agentFeedbackEntriesIndexResponseSchema,
  agentFeedbackIndexResponseSchema,
  agentFeedbackResponseSchema,
  agentFeedbackSubmissionResponseSchema,
  searchResponseSchema,
  statsResponseSchema,
  registriesResponseSchema,
  additionalRegistryCatalogResponseSchema,
  popularResponseSchema,
  protocolsResponseSchema,
  detectProtocolResponseSchema,
  registrySearchByNamespaceSchema,
  vectorSearchResponseSchema,
  searchStatusResponseSchema,
  websocketStatsResponseSchema,
  metricsSummaryResponseSchema,
  searchFacetsResponseSchema,
} from '../schemas';
import {
  createAbortError,
  DEFAULT_BASE_URL,
  DEFAULT_HISTORY_TOP_UP_HBAR,
  DEFAULT_USER_AGENT,
  JSON_CONTENT_TYPE,
  isJsonObject,
  isBrowserRuntime,
  normaliseBaseUrl,
  normaliseHeaderName,
  buildSearchQuery,
} from './utils';
import {
  RegistryBrokerError,
  RegistryBrokerParseError,
  type ErrorDetails,
} from './errors';
export interface InitializedAgentClient {
  client: RegistryBrokerClient;
  encryption?: { publicKey: string; privateKey?: string } | null;
}
export interface GenerateEncryptionKeyPairOptions {
  keyType?: 'secp256k1';
  envVar?: string;
  envPath?: string;
  overwrite?: boolean;
}
export interface RequestConfig {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}
export class RegistryBrokerClient {
  static async initializeAgent(
    options: InitializeAgentClientOptions,
  ): Promise<InitializedAgentClient> {
    const { uaid, ensureEncryptionKey = true, ...clientOptions } = options;
    const client = new RegistryBrokerClient(clientOptions);
    let encryption: { publicKey: string; privateKey?: string } | null = null;
    if (ensureEncryptionKey) {
      const ensureOptions =
        typeof ensureEncryptionKey === 'object'
          ? ensureEncryptionKey
          : { generateIfMissing: true };
      encryption = await client.encryption.ensureAgentKey({
        uaid,
        ...ensureOptions,
      });
    }
    return { client, encryption };
  }
  readonly baseUrl: string;
  readonly fetchImpl: typeof fetch;
  readonly defaultHeaders: Record<string, string>;
  readonly registrationAutoTopUp?: AutoTopUpOptions;
  readonly historyAutoTopUp?: HistoryAutoTopUpOptions;
  readonly encryptionOptions?: ClientEncryptionOptions;
  encryptionBootstrapPromise: Promise<void> | null = null;
  constructor(options: RegistryBrokerClientOptions = {}) {
    const {
      baseUrl = DEFAULT_BASE_URL,
      fetchImplementation,
      defaultHeaders,
      apiKey,
      ledgerApiKey,
      registrationAutoTopUp,
      historyAutoTopUp,
      encryption,
    } = options;
    this.baseUrl = normaliseBaseUrl(baseUrl);
    this.fetchImpl = fetchImplementation ?? fetch;
    this.defaultHeaders = {
      ...(defaultHeaders ?? {}),
    };
    Object.entries(this.defaultHeaders).forEach(([key, value]) => {
      const headerName = normaliseHeaderName(key);
      if (headerName !== key) {
        delete this.defaultHeaders[key];
        this.defaultHeaders[headerName] = value;
      }
    });
    if (apiKey) {
      this.defaultHeaders['x-api-key'] = apiKey;
    }
    if (ledgerApiKey) {
      this.defaultHeaders['x-ledger-api-key'] = ledgerApiKey;
    }
    this.registrationAutoTopUp = registrationAutoTopUp;
    this.historyAutoTopUp = historyAutoTopUp;
    this.encryptionOptions = encryption;

    if (this.encryptionOptions) {
      this.encryptionBootstrapPromise = this.initializeEncryptionBootstrap(
        this.encryptionOptions,
      );
    }
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

  async encryptionReady(): Promise<void> {
    if (!this.encryptionBootstrapPromise) {
      return;
    }
    await this.encryptionBootstrapPromise;
  }

  buildUrl(path: string): string {
    const normalisedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${normalisedPath}`;
  }

  async request(path: string, config: RequestConfig): Promise<Response> {
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
  }

  async requestJson<T extends JsonValue = JsonValue>(
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

  async getAgentFeedback(
    uaid: string,
    options: AgentFeedbackQuery = {},
  ): Promise<AgentFeedbackResponse> {
    const normalized = uaid.trim();
    if (!normalized) {
      throw new Error('uaid is required');
    }
    const query = options.includeRevoked === true ? '?includeRevoked=true' : '';
    const raw = await this.requestJson<JsonValue>(
      `/agents/${encodeURIComponent(normalized)}/feedback${query}`,
      { method: 'GET' },
    );
    return this.parseWithSchema(
      raw,
      agentFeedbackResponseSchema,
      'agent feedback response',
    );
  }

  async listAgentFeedbackIndex(
    options: { page?: number; limit?: number; registries?: string[] } = {},
  ): Promise<AgentFeedbackIndexResponse> {
    const params = new URLSearchParams();
    if (typeof options.page === 'number' && Number.isFinite(options.page)) {
      params.set('page', String(Math.trunc(options.page)));
    }
    if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
      params.set('limit', String(Math.trunc(options.limit)));
    }
    if (options.registries?.length) {
      params.set('registry', options.registries.join(','));
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : '';

    const raw = await this.requestJson<JsonValue>(`/agents/feedback${suffix}`, {
      method: 'GET',
    });
    return this.parseWithSchema(
      raw,
      agentFeedbackIndexResponseSchema,
      'agent feedback index response',
    );
  }

  async listAgentFeedbackEntriesIndex(
    options: { page?: number; limit?: number; registries?: string[] } = {},
  ): Promise<AgentFeedbackEntriesIndexResponse> {
    const params = new URLSearchParams();
    if (typeof options.page === 'number' && Number.isFinite(options.page)) {
      params.set('page', String(Math.trunc(options.page)));
    }
    if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
      params.set('limit', String(Math.trunc(options.limit)));
    }
    if (options.registries?.length) {
      params.set('registry', options.registries.join(','));
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : '';

    const raw = await this.requestJson<JsonValue>(
      `/agents/feedback/entries${suffix}`,
      { method: 'GET' },
    );
    return this.parseWithSchema(
      raw,
      agentFeedbackEntriesIndexResponseSchema,
      'agent feedback entries index response',
    );
  }

  async checkAgentFeedbackEligibility(
    uaid: string,
    payload: AgentFeedbackEligibilityRequest,
  ): Promise<AgentFeedbackEligibilityResponse> {
    const normalized = uaid.trim();
    if (!normalized) {
      throw new Error('uaid is required');
    }
    const raw = await this.requestJson<JsonValue>(
      `/agents/${encodeURIComponent(normalized)}/feedback/eligibility`,
      {
        method: 'POST',
        body: payload,
        headers: { 'content-type': 'application/json' },
      },
    );
    return this.parseWithSchema(
      raw,
      agentFeedbackEligibilityResponseSchema,
      'agent feedback eligibility response',
    );
  }

  async submitAgentFeedback(
    uaid: string,
    payload: AgentFeedbackSubmissionRequest,
  ): Promise<AgentFeedbackSubmissionResponse> {
    const normalized = uaid.trim();
    if (!normalized) {
      throw new Error('uaid is required');
    }
    const raw = await this.requestJson<JsonValue>(
      `/agents/${encodeURIComponent(normalized)}/feedback`,
      {
        method: 'POST',
        body: payload,
        headers: { 'content-type': 'application/json' },
      },
    );
    return this.parseWithSchema(
      raw,
      agentFeedbackSubmissionResponseSchema,
      'agent feedback submission response',
    );
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

  parseWithSchema<T>(
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
        value,
      );
    }
  }

  async delay(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0) {
      if (signal?.aborted) {
        throw createAbortError();
      }
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        resolve();
      }, ms);

      const onAbort = (): void => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(createAbortError());
      };

      if (signal) {
        if (signal.aborted) {
          clearTimeout(timer);
          reject(createAbortError());
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  assertNodeRuntime(feature: string): void {
    if (typeof process === 'undefined' || !process.versions?.node) {
      throw new Error(`${feature} is only available in Node.js environments`);
    }
  }

  createEphemeralKeyPair(): EphemeralKeyPair {
    this.assertNodeRuntime('generateEphemeralKeyPair');
    const privateKeyBytes = randomBytes(32);
    const publicKey = secp256k1.getPublicKey(privateKeyBytes, true);
    return {
      privateKey: Buffer.from(privateKeyBytes).toString('hex'),
      publicKey: Buffer.from(publicKey).toString('hex'),
    };
  }

  deriveSharedSecret(options: DeriveSharedSecretOptions): Buffer {
    this.assertNodeRuntime('deriveSharedSecret');
    const privateKey = this.hexToBuffer(options.privateKey);
    const peerPublicKey = this.hexToBuffer(options.peerPublicKey);
    const shared = secp256k1.getSharedSecret(privateKey, peerPublicKey, true);
    return createHash('sha256').update(Buffer.from(shared)).digest();
  }

  buildCipherEnvelope(options: EncryptCipherEnvelopeOptions) {
    this.assertNodeRuntime('encryptCipherEnvelope');
    const sharedSecret = this.normalizeSharedSecret(options.sharedSecret);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', sharedSecret, iv);
    const aadSource = options.associatedData ?? options.sessionId;
    const associatedDataEncoded = aadSource
      ? Buffer.from(aadSource, 'utf8').toString('base64')
      : undefined;
    if (aadSource) {
      cipher.setAAD(Buffer.from(aadSource, 'utf8'));
    }
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(options.plaintext, 'utf8')),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([ciphertext, tag]);

    return {
      algorithm: 'aes-256-gcm',
      ciphertext: payload.toString('base64'),
      nonce: iv.toString('base64'),
      associatedData: associatedDataEncoded,
      keyLocator: {
        sessionId: options.sessionId,
        revision: options.revision ?? 1,
      },
      recipients: options.recipients.map(recipient => ({
        ...recipient,
        encryptedShare: '',
      })),
    };
  }

  openCipherEnvelope(options: DecryptCipherEnvelopeOptions): string {
    this.assertNodeRuntime('decryptCipherEnvelope');
    const sharedSecret = this.normalizeSharedSecret(options.sharedSecret);
    const payload = Buffer.from(options.envelope.ciphertext, 'base64');
    const nonce = Buffer.from(options.envelope.nonce, 'base64');
    const ciphertext = payload.slice(0, payload.length - 16);
    const tag = payload.slice(payload.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', sharedSecret, nonce);
    if (options.envelope.associatedData) {
      decipher.setAAD(Buffer.from(options.envelope.associatedData, 'base64'));
    }
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString(options.encoding ?? 'utf8');
  }

  normalizeSharedSecret(input: SharedSecretInput): Buffer {
    if (Buffer.isBuffer(input)) {
      return Buffer.from(input);
    }
    if (input instanceof Uint8Array) {
      return Buffer.from(input);
    }
    if (typeof input === 'string') {
      return this.bufferFromString(input);
    }
    throw new Error('Unsupported shared secret input');
  }

  bufferFromString(value: string): Buffer {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error('sharedSecret string cannot be empty');
    }
    const normalized = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    if (/^[0-9a-fA-F]+$/.test(normalized) && normalized.length % 2 === 0) {
      return Buffer.from(normalized, 'hex');
    }
    return Buffer.from(trimmed, 'base64');
  }

  hexToBuffer(value: string): Uint8Array {
    const normalized = value.startsWith('0x') ? value.slice(2) : value;
    if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
      throw new Error('Expected hex-encoded value');
    }
    return Buffer.from(normalized, 'hex');
  }

  extractInsufficientCreditsDetails(error: unknown): {
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

  private extractErrorMessage(body: JsonValue): string | undefined {
    if (typeof body === 'string') {
      return body;
    }
    if (isJsonObject(body) && typeof body.error === 'string') {
      return body.error;
    }
    if (isJsonObject(body) && typeof body.message === 'string') {
      return body.message;
    }
    return undefined;
  }

  shouldAutoTopUpHistory(
    payload: CreateSessionRequestPayload,
    error: Error | null,
  ): boolean {
    if (!this.historyAutoTopUp || payload.historyTtlSeconds === undefined) {
      return false;
    }
    if (!(error instanceof RegistryBrokerError)) {
      return false;
    }
    if (error.status !== 402) {
      return false;
    }
    const message = this.extractErrorMessage(error.body);
    if (!message) {
      return true;
    }
    const normalised = message.toLowerCase();
    return (
      normalised.includes('history') || normalised.includes('chat history')
    );
  }

  async executeHistoryAutoTopUp(reason: string): Promise<void> {
    if (!this.historyAutoTopUp) {
      return;
    }
    const hbarAmount =
      this.historyAutoTopUp.hbarAmount && this.historyAutoTopUp.hbarAmount > 0
        ? this.historyAutoTopUp.hbarAmount
        : DEFAULT_HISTORY_TOP_UP_HBAR;
    await this.purchaseCreditsWithHbar({
      accountId: this.historyAutoTopUp.accountId,
      privateKey: this.historyAutoTopUp.privateKey,
      hbarAmount,
      memo:
        this.historyAutoTopUp.memo ??
        'registry-broker-client:chat-history-topup',
      metadata: {
        purpose: 'chat-history',
        reason,
      },
    });
  }

  initializeEncryptionBootstrap(
    options: ClientEncryptionOptions,
  ): Promise<void> {
    return this.bootstrapEncryptionOptions(options).then((): void => undefined);
  }

  bootstrapEncryptionOptions(
    _options?: ClientEncryptionOptions,
  ): Promise<{ publicKey: string; privateKey?: string } | null> {
    return Promise.resolve(null);
  }

  /**
   * Encryption utilities - stub implementation
   * Full encryption support available in npm version
   */
  readonly encryption = {
    ensureAgentKey: async (_options: {
      uaid: string;
      generateIfMissing?: boolean;
    }): Promise<{ publicKey: string; privateKey?: string }> => {
      throw new Error(
        'Encryption not available in JSR version. Use npm: @hashgraphonline/standards-sdk',
      );
    },
    registerKey: async (_payload: unknown): Promise<unknown> => {
      throw new Error(
        'Encryption not available in JSR version. Use npm: @hashgraphonline/standards-sdk',
      );
    },
  };

  /**
   * Purchase credits with HBAR - stub implementation
   * Full credits support available in npm version
   */
  async purchaseCreditsWithHbar(_options: {
    accountId: string;
    privateKey: string;
    hbarAmount: number;
    memo?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    throw new Error(
      'Credits not available in JSR version. Use npm: @hashgraphonline/standards-sdk',
    );
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

  async getAdditionalRegistries(): Promise<AdditionalRegistryCatalogResponse> {
    const raw = await this.requestJson<JsonValue>(
      '/register/additional-registries',
      {
        method: 'GET',
      },
    );
    return this.parseWithSchema(
      raw,
      additionalRegistryCatalogResponseSchema,
      'additional registry catalog response',
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

  async vectorSearch(request: VectorSearchRequest): Promise<VectorSearchResponse> {
    try {
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
    } catch (error) {
      if (error instanceof RegistryBrokerError && error.status === 501) {
        const fallbackParams: SearchParams = { q: request.query };
        if (request.limit) fallbackParams.limit = request.limit;
        if (request.filter?.registry) fallbackParams.registry = request.filter.registry;
        if (request.filter?.protocols?.length) fallbackParams.protocols = [...request.filter.protocols];
        const fallback = await this.search(fallbackParams);
        return {
          hits: fallback.hits.map(agent => ({ agent, score: 0, highlights: {} })),
          total: fallback.total,
          took: 0,
          totalAvailable: fallback.total,
          visible: fallback.hits.length,
          limited: fallback.total > fallback.limit,
          credits_used: 0,
        };
      }
      throw error;
    }
  }

  async searchStatus(): Promise<SearchStatusResponse> {
    const raw = await this.requestJson<JsonValue>('/search/status', {
      method: 'GET',
    });
    return this.parseWithSchema(
      raw,
      searchStatusResponseSchema,
      'search status response',
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
}

export const isPendingRegisterAgentResponse = (
  response: RegisterAgentResponse,
): response is RegisterAgentPendingResponse => response.status === 'pending';

export const isPartialRegisterAgentResponse = (
  response: RegisterAgentResponse,
): response is RegisterAgentPartialResponse =>
  response.status === 'partial' && response.success === false;

export const isSuccessRegisterAgentResponse = (
  response: RegisterAgentResponse,
): response is RegisterAgentSuccessResponse =>
  response.success === true && response.status !== 'pending';
