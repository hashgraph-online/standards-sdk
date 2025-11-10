import {
  AdaptersResponse,
  CreateSessionRequestPayload,
  CreateSessionResponse,
  AgentRegistrationRequest,
  RegisterAgentResponse,
  RegisterAgentQuoteResponse,
  RegisterAgentPendingResponse,
  RegisterAgentPartialResponse,
  RegisterAgentSuccessResponse,
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
  LedgerAuthenticationOptions,
  LedgerCredentialAuthOptions,
  RegisterAgentOptions,
  AutoTopUpOptions,
  HistoryAutoTopUpOptions,
  RegistrationProgressRecord,
  RegistrationProgressResponse,
  RegistrationProgressWaitOptions,
  ChatHistorySnapshotResponse,
  ChatHistoryCompactionResponse,
  CompactHistoryRequestPayload,
  AdapterDetailsResponse,
  AdditionalRegistryCatalogResponse,
  X402CreditPurchaseResponse,
  X402MinimumsResponse,
} from './types';
import { canonicalizeLedgerNetwork } from './ledger-network';
import axios from 'axios';
import type { SignerSignature } from '@hashgraph/sdk';
import { createWalletClient, http, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import {
  withPaymentInterceptor,
  decodeXPaymentResponse,
  Signer,
  MultiNetworkSigner,
} from 'x402-axios';
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
  adapterDetailsResponseSchema,
  additionalRegistryCatalogResponseSchema,
  registrationProgressResponseSchema,
} from './schemas';
import { ZodError, z } from 'zod';
import { createPrivateKeySigner } from './private-key-signer';

const DEFAULT_USER_AGENT =
  '@hashgraphonline/standards-sdk/registry-broker-client';

const DEFAULT_PROGRESS_INTERVAL_MS = 1_500;
const DEFAULT_PROGRESS_TIMEOUT_MS = 5 * 60 * 1_000;

const createAbortError = (): Error =>
  typeof DOMException === 'function'
    ? new DOMException('Aborted', 'AbortError')
    : new Error('The operation was aborted');

const normaliseHeaderName = (name: string): string => name.trim().toLowerCase();

const isBrowserRuntime = (): boolean =>
  typeof window !== 'undefined' && typeof window.fetch === 'function';

const DEFAULT_BASE_URL = 'https://registry.hashgraphonline.com/api/v1';
const JSON_CONTENT_TYPE = /application\/json/i;
const DEFAULT_HISTORY_TOP_UP_HBAR = 0.25;
const MINIMUM_REGISTRATION_AUTO_TOP_UP_CREDITS = 1;

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
  if (payload.additionalRegistries !== undefined) {
    body.additionalRegistries = payload.additionalRegistries;
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
  registrationAutoTopUp?: AutoTopUpOptions;
  historyAutoTopUp?: HistoryAutoTopUpOptions;
}

interface RequestConfig {
  method?: string;
  body?: JsonValue;
  headers?: Record<string, string>;
}

interface PurchaseCreditsWithX402Params {
  accountId: string;
  credits: number;
  usdAmount?: number;
  description?: string;
  metadata?: JsonObject;
  walletClient: Signer | MultiNetworkSigner;
}

type X402NetworkId = 'base' | 'base-sepolia';

interface BuyCreditsWithX402Params {
  accountId: string;
  credits: number;
  usdAmount?: number;
  description?: string;
  metadata?: JsonObject;
  evmPrivateKey: string;
  network?: X402NetworkId;
  rpcUrl?: string;
}

const X402_NETWORK_CONFIG: Record<
  X402NetworkId,
  {
    rpcUrl: string;
    chain: Chain;
  }
> = {
  base: {
    rpcUrl: 'https://mainnet.base.org',
    chain: base,
  },
  'base-sepolia': {
    rpcUrl: 'https://sepolia.base.org',
    chain: baseSepolia,
  },
};

const normalizeHexPrivateKey = (value: string): `0x${string}` => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('evmPrivateKey is required');
  }
  return trimmed.startsWith('0x')
    ? (trimmed as `0x${string}`)
    : (`0x${trimmed}` as `0x${string}`);
};

type X402PurchaseResult = X402CreditPurchaseResponse & {
  paymentResponseHeader?: string;
  paymentResponse?: ReturnType<typeof decodeXPaymentResponse>;
};

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
  if (/\/api$/i.test(withoutTrailing)) {
    return `${withoutTrailing}/v1`;
  }
  return `${withoutTrailing}/api/v1`;
}

function buildSearchQuery(params: SearchParams): string {
  const query = new URLSearchParams();
  const appendList = (key: string, values?: string[]) => {
    if (!values) {
      return;
    }
    values.forEach(value => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          query.append(key, trimmed);
        }
      }
    });
  };

  if (params.q) {
    const trimmed = params.q.trim();
    if (trimmed.length > 0) {
      query.set('q', trimmed);
    }
  }
  if (typeof params.page === 'number') {
    query.set('page', params.page.toString());
  }
  if (typeof params.limit === 'number') {
    query.set('limit', params.limit.toString());
  }
  if (params.registry) {
    const trimmed = params.registry.trim();
    if (trimmed.length > 0) {
      query.set('registry', trimmed);
    }
  }
  appendList('registries', params.registries);
  if (typeof params.minTrust === 'number') {
    query.set('minTrust', params.minTrust.toString());
  }
  appendList('capabilities', params.capabilities);
  appendList('protocols', params.protocols);
  appendList('adapters', params.adapters);

  if (params.metadata) {
    Object.entries(params.metadata).forEach(([key, values]) => {
      if (!key || !Array.isArray(values) || values.length === 0) {
        return;
      }
      const trimmedKey = key.trim();
      if (trimmedKey.length === 0) {
        return;
      }
      values.forEach(value => {
        if (value === undefined || value === null) {
          return;
        }
        query.append(`metadata.${trimmedKey}`, String(value));
      });
    });
  }

  if (params.type) {
    const trimmedType = params.type.trim();
    if (trimmedType.length > 0 && trimmedType.toLowerCase() !== 'all') {
      query.set('type', trimmedType);
    }
  }

  if (params.verified === true) {
    query.set('verified', 'true');
  }

  if (params.online === true) {
    query.set('online', 'true');
  }

  if (params.sortBy) {
    const trimmedSort = params.sortBy.trim();
    if (trimmedSort.length > 0) {
      query.set('sortBy', trimmedSort);
    }
  }

  if (params.sortOrder) {
    const lowered = params.sortOrder.toLowerCase();
    if (lowered === 'asc' || lowered === 'desc') {
      query.set('sortOrder', lowered);
    }
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
    getHistory: (sessionId: string) => Promise<ChatHistorySnapshotResponse>;
    compactHistory: (
      payload: CompactHistoryRequestPayload,
    ) => Promise<ChatHistoryCompactionResponse>;
  };

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;
  private readonly registrationAutoTopUp?: AutoTopUpOptions;
  private readonly historyAutoTopUp?: HistoryAutoTopUpOptions;

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

    this.registrationAutoTopUp = options.registrationAutoTopUp;
    this.historyAutoTopUp = options.historyAutoTopUp;

    this.chat = {
      createSession: payload => this.createSession(payload),
      sendMessage: payload => this.sendMessage(payload),
      endSession: sessionId => this.endSession(sessionId),
      getHistory: sessionId => this.fetchHistorySnapshot(sessionId),
      compactHistory: payload => this.compactHistory(payload),
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
    const autoTopUp = options?.autoTopUp ?? this.registrationAutoTopUp;

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

  async updateAgent(
    uaid: string,
    payload: AgentRegistrationRequest,
  ): Promise<RegisterAgentResponse> {
    const raw = await this.requestJson<JsonValue>(
      `/register/${encodeURIComponent(uaid)}`,
      {
        method: 'PUT',
        body: serialiseAgentRegistrationRequest(payload),
        headers: { 'content-type': 'application/json' },
      },
    );

    return this.parseWithSchema(
      raw,
      registerAgentResponseSchema,
      'update agent response',
    );
  }

  async getRegistrationProgress(
    attemptId: string,
  ): Promise<RegistrationProgressRecord | null> {
    const normalisedAttemptId = attemptId.trim();
    if (!normalisedAttemptId) {
      throw new Error('attemptId is required');
    }

    try {
      const raw = await this.requestJson<JsonValue>(
        `/register/progress/${encodeURIComponent(normalisedAttemptId)}`,
        { method: 'GET' },
      );

      const parsed = this.parseWithSchema(
        raw,
        registrationProgressResponseSchema,
        'registration progress response',
      );

      return parsed.progress;
    } catch (error) {
      if (error instanceof RegistryBrokerError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async waitForRegistrationCompletion(
    attemptId: string,
    options: RegistrationProgressWaitOptions = {},
  ): Promise<RegistrationProgressRecord> {
    const normalisedAttemptId = attemptId.trim();
    if (!normalisedAttemptId) {
      throw new Error('attemptId is required');
    }

    const interval = Math.max(
      250,
      options.intervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS,
    );
    const timeoutMs = options.timeoutMs ?? DEFAULT_PROGRESS_TIMEOUT_MS;
    const throwOnFailure = options.throwOnFailure ?? true;
    const signal = options.signal;
    const startedAt = Date.now();

    while (true) {
      if (signal?.aborted) {
        throw createAbortError();
      }

      const progress = await this.getRegistrationProgress(normalisedAttemptId);

      if (progress) {
        options.onProgress?.(progress);

        if (progress.status === 'completed') {
          return progress;
        }

        if (progress.status === 'partial' || progress.status === 'failed') {
          if (throwOnFailure) {
            throw new RegistryBrokerError(
              'Registration did not complete successfully',
              {
                status: 409,
                statusText: progress.status,
                body: progress,
              },
            );
          }
          return progress;
        }
      }

      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(
          `Registration progress polling timed out after ${timeoutMs}ms`,
        );
      }

      await this.delay(interval, signal);
    }
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

  async getX402Minimums(): Promise<X402MinimumsResponse> {
    const raw = await this.requestJson<JsonValue>(
      '/credits/purchase/x402/minimums',
      { method: 'GET' },
    );
    return this.parseWithSchema(
      raw,
      x402MinimumsResponseSchema,
      'x402 minimums response',
    );
  }

  async purchaseCreditsWithX402(
    params: PurchaseCreditsWithX402Params,
  ): Promise<X402PurchaseResult> {
    if (!Number.isFinite(params.credits) || params.credits <= 0) {
      throw new Error('credits must be a positive number');
    }
    if (
      params.usdAmount !== undefined &&
      (!Number.isFinite(params.usdAmount) || params.usdAmount <= 0)
    ) {
      throw new Error('usdAmount must be a positive number when provided');
    }

    const body: JsonObject = {
      accountId: params.accountId,
      credits: params.credits,
    };

    if (params.usdAmount !== undefined) {
      body.usdAmount = params.usdAmount;
    }
    if (params.description) {
      body.description = params.description;
    }
    if (params.metadata) {
      body.metadata = params.metadata;
    }

    const axiosClient = axios.create({
      baseURL: this.baseUrl,
      headers: {
        ...this.getDefaultHeaders(),
        'content-type': 'application/json',
      },
    });

    const paymentClient = withPaymentInterceptor(
      axiosClient,
      params.walletClient,
    );

    const response = await paymentClient.post('/credits/purchase/x402', body);

    const parsed = this.parseWithSchema(
      response.data,
      x402CreditPurchaseResponseSchema,
      'x402 credit purchase response',
    );

    const paymentHeader =
      typeof response.headers['x-payment-response'] === 'string'
        ? response.headers['x-payment-response']
        : undefined;
    const decodedPayment =
      paymentHeader !== undefined
        ? decodeXPaymentResponse(paymentHeader)
        : undefined;

    return {
      ...parsed,
      paymentResponseHeader: paymentHeader,
      paymentResponse: decodedPayment,
    };
  }

  async buyCreditsWithX402(
    params: BuyCreditsWithX402Params,
  ): Promise<X402PurchaseResult> {
    const network: X402NetworkId = params.network ?? 'base';
    const config = X402_NETWORK_CONFIG[network];
    const rpcUrl = params.rpcUrl?.trim() || config.rpcUrl;
    const normalizedKey = normalizeHexPrivateKey(params.evmPrivateKey);
    const account = privateKeyToAccount(normalizedKey);
    const walletClient = createWalletClient({
      account,
      chain: config.chain,
      transport: http(rpcUrl),
    });

    return this.purchaseCreditsWithX402({
      accountId: params.accountId,
      credits: params.credits,
      usdAmount: params.usdAmount,
      description: params.description,
      metadata: params.metadata,
      walletClient,
    });
  }

  private calculateHbarAmount(
    creditsToPurchase: number,
    creditsPerHbar: number,
  ): number {
    if (creditsPerHbar <= 0) {
      throw new Error('creditsPerHbar must be positive');
    }
    if (creditsToPurchase <= 0) {
      throw new Error('creditsToPurchase must be positive');
    }
    const rawHbar = creditsToPurchase / creditsPerHbar;
    const tinybars = Math.ceil(rawHbar * 1e8);
    return tinybars / 1e8;
  }

  private resolveCreditsToPurchase(shortfallCredits: number): number {
    if (!Number.isFinite(shortfallCredits) || shortfallCredits <= 0) {
      return 0;
    }
    return Math.max(
      Math.ceil(shortfallCredits),
      MINIMUM_REGISTRATION_AUTO_TOP_UP_CREDITS,
    );
  }

  private calculateHbarAmountParam(hbarAmount: number): number {
    const tinybars = Math.ceil(hbarAmount * 1e8);
    if (tinybars <= 0) {
      throw new Error('Calculated purchase amount must be positive');
    }
    return tinybars / 1e8;
  }

  private shouldAutoTopUpHistory(
    payload: CreateSessionRequestPayload,
    error: unknown,
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

  private async executeHistoryAutoTopUp(reason: string): Promise<void> {
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
      const creditsToPurchase = this.resolveCreditsToPurchase(shortfall);
      if (creditsToPurchase <= 0) {
        return;
      }

      const creditsPerHbar = quote.creditsPerHbar ?? null;
      if (!creditsPerHbar || creditsPerHbar <= 0) {
        throw new Error('Unable to determine credits per HBAR for auto top-up');
      }

      const hbarAmount = this.calculateHbarAmount(
        creditsToPurchase,
        creditsPerHbar,
      );

      await this.purchaseCreditsWithHbar({
        accountId: details.accountId.trim(),
        privateKey: details.privateKey.trim(),
        hbarAmount,
        memo: details.memo ?? 'Registry Broker auto top-up',
        metadata: {
          shortfallCredits: shortfall,
          requiredCredits: quote.requiredCredits,
          purchasedCredits: creditsToPurchase,
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
    const resolvedNetwork = canonicalizeLedgerNetwork(payload.network);
    const network =
      resolvedNetwork.kind === 'hedera'
        ? (resolvedNetwork.hederaNetwork ?? resolvedNetwork.canonical)
        : resolvedNetwork.canonical;
    const raw = await this.requestJson<JsonValue>('/auth/ledger/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: {
        accountId: payload.accountId,
        network,
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
    const resolvedNetwork = canonicalizeLedgerNetwork(payload.network);
    const network =
      resolvedNetwork.kind === 'hedera'
        ? (resolvedNetwork.hederaNetwork ?? resolvedNetwork.canonical)
        : resolvedNetwork.canonical;
    const body: JsonObject = {
      challengeId: payload.challengeId,
      accountId: payload.accountId,
      network,
      signature: payload.signature,
    };

    if (payload.signatureKind) {
      body.signatureKind = payload.signatureKind;
    }
    if (payload.publicKey) {
      body.publicKey = payload.publicKey;
    }
    if (typeof payload.expiresInMinutes === 'number') {
      body.expiresInMinutes = payload.expiresInMinutes;
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

  async authenticateWithLedger(
    options: LedgerAuthenticationOptions,
  ): Promise<LedgerVerifyResponse> {
    const challenge = await this.createLedgerChallenge({
      accountId: options.accountId,
      network: options.network,
    });
    const signed = await this.resolveLedgerAuthSignature(
      challenge.message,
      options,
    );
    const verification = await this.verifyLedgerChallenge({
      challengeId: challenge.challengeId,
      accountId: options.accountId,
      network: options.network,
      signature: signed.signature,
      signatureKind: signed.signatureKind,
      publicKey: signed.publicKey,
      expiresInMinutes: options.expiresInMinutes,
    });
    return verification;
  }

  private async resolveLedgerAuthSignature(
    message: string,
    options: LedgerAuthenticationOptions,
  ): Promise<LedgerAuthenticationSignerResult> {
    if (typeof options.sign === 'function') {
      const result = await options.sign(message);
      if (
        !result ||
        typeof result.signature !== 'string' ||
        result.signature.length === 0
      ) {
        throw new Error('Custom ledger signer failed to produce a signature.');
      }
      return result;
    }

    if (!options.signer || typeof options.signer.sign !== 'function') {
      throw new Error(
        'Ledger authentication requires a Hedera Signer or custom sign function.',
      );
    }

    const payload = Buffer.from(message, 'utf8');
    const signatures: SignerSignature[] = await options.signer.sign([payload]);
    const signatureEntry = signatures?.[0];
    if (!signatureEntry) {
      throw new Error('Signer did not return any signatures.');
    }

    let derivedPublicKey: string | undefined;
    if (signatureEntry.publicKey) {
      derivedPublicKey = signatureEntry.publicKey.toString();
    } else if (typeof options.signer.getAccountKey === 'function') {
      const accountKey = await options.signer.getAccountKey();
      if (accountKey && typeof accountKey.toString === 'function') {
        derivedPublicKey = accountKey.toString();
      }
    }

    return {
      signature: Buffer.from(signatureEntry.signature).toString('base64'),
      signatureKind: 'raw',
      publicKey: derivedPublicKey,
    };
  }

  async authenticateWithLedgerCredentials(
    options: LedgerCredentialAuthOptions,
  ): Promise<LedgerVerifyResponse> {
    const {
      accountId,
      network,
      signer,
      sign,
      hederaPrivateKey,
      evmPrivateKey,
      expiresInMinutes,
      setAccountHeader = true,
      label,
      logger,
    } = options;

    const resolvedNetwork = canonicalizeLedgerNetwork(network);
    const labelSuffix = label ? ` for ${label}` : '';
    const logInfo = logger?.info;

    const networkPayload =
      resolvedNetwork.kind === 'hedera'
        ? (resolvedNetwork.hederaNetwork ?? resolvedNetwork.canonical)
        : resolvedNetwork.canonical;

    const authOptions: LedgerAuthenticationOptions = {
      accountId,
      network: networkPayload,
      expiresInMinutes,
    };

    if (sign) {
      authOptions.sign = sign;
    } else if (signer) {
      authOptions.signer = signer;
    } else if (hederaPrivateKey) {
      if (resolvedNetwork.kind !== 'hedera' || !resolvedNetwork.hederaNetwork) {
        throw new Error(
          'hederaPrivateKey can only be used with hedera:mainnet or hedera:testnet networks.',
        );
      }
      authOptions.signer = createPrivateKeySigner({
        accountId,
        privateKey: hederaPrivateKey,
        network: resolvedNetwork.hederaNetwork,
      });
    } else if (evmPrivateKey) {
      if (resolvedNetwork.kind !== 'evm') {
        throw new Error(
          'evmPrivateKey can only be used with CAIP-2 EVM networks (eip155:<chainId>).',
        );
      }
      const formattedKey = evmPrivateKey.startsWith('0x')
        ? (evmPrivateKey as `0x${string}`)
        : (`0x${evmPrivateKey}` as `0x${string}`);
      const account = privateKeyToAccount(formattedKey);
      authOptions.sign = async message => ({
        signature: await account.signMessage({ message }),
        signatureKind: 'evm',
        publicKey: account.publicKey,
      });
    } else {
      throw new Error(
        'Provide a signer, sign function, hederaPrivateKey, or evmPrivateKey to authenticate with the ledger.',
      );
    }

    logInfo?.(
      `Authenticating ledger account ${accountId} (${resolvedNetwork.canonical})${labelSuffix}...`,
    );
    const verification = await this.authenticateWithLedger(authOptions);
    if (setAccountHeader) {
      this.setDefaultHeader('x-account-id', verification.accountId);
    }
    logInfo?.(
      `Ledger authentication complete${labelSuffix}. Issued key prefix: ${verification.apiKey.prefix}…${verification.apiKey.lastFour}`,
    );
    return verification;
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

  async adaptersDetailed(): Promise<AdapterDetailsResponse> {
    const raw = await this.requestJson<JsonValue>('/adapters/details', {
      method: 'GET',
    });
    return this.parseWithSchema(
      raw,
      adapterDetailsResponseSchema,
      'adapter details response',
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
    allowHistoryAutoTopUp = true,
  ): Promise<CreateSessionResponse> {
    const body: JsonObject = {};
    if ('uaid' in payload && payload.uaid) {
      body.uaid = payload.uaid;
    }
    if ('agentUrl' in payload && payload.agentUrl) {
      body.agentUrl = payload.agentUrl;
    }
    if (payload.auth) {
      body.auth = serialiseAuthConfig(payload.auth);
    }
    if (payload.historyTtlSeconds !== undefined) {
      body.historyTtlSeconds = payload.historyTtlSeconds;
    }
    try {
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
    } catch (error) {
      if (
        allowHistoryAutoTopUp &&
        this.shouldAutoTopUpHistory(payload, error)
      ) {
        await this.executeHistoryAutoTopUp('chat.session');
        return this.createSession(payload, false);
      }
      throw error;
    }
  }

  private async fetchHistorySnapshot(
    sessionId: string,
  ): Promise<ChatHistorySnapshotResponse> {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new Error('sessionId is required to fetch chat history');
    }
    const raw = await this.requestJson<JsonValue>(
      `/chat/session/${encodeURIComponent(sessionId)}/history`,
      {
        method: 'GET',
      },
    );
    return this.parseWithSchema(
      raw,
      chatHistorySnapshotResponseSchema,
      'chat history snapshot response',
    );
  }

  private async compactHistory(
    payload: CompactHistoryRequestPayload,
  ): Promise<ChatHistoryCompactionResponse> {
    if (!payload.sessionId || payload.sessionId.trim().length === 0) {
      throw new Error('sessionId is required to compact chat history');
    }
    const body: JsonObject = {};
    if (
      typeof payload.preserveEntries === 'number' &&
      Number.isFinite(payload.preserveEntries) &&
      payload.preserveEntries >= 0
    ) {
      body.preserveEntries = Math.floor(payload.preserveEntries);
    }
    const raw = await this.requestJson<JsonValue>(
      `/chat/session/${encodeURIComponent(payload.sessionId)}/compact`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      },
    );
    return this.parseWithSchema(
      raw,
      chatHistoryCompactionResponseSchema,
      'chat history compaction response',
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

  private async delay(ms: number, signal?: AbortSignal): Promise<void> {
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
