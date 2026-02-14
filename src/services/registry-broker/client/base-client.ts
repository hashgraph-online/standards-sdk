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
  AcceptConversationOptions,
  AcceptEncryptedChatSessionOptions,
  AdapterDetailsResponse,
  AdapterRegistryAdaptersResponse,
  AdapterRegistryCategoriesResponse,
  AdapterRegistryCategory,
  AdapterRegistrySubmitAdapterAcceptedResponse,
  AdapterRegistrySubmissionStatusResponse,
  AdaptersResponse,
  AdditionalRegistryCatalogResponse,
  AgentAuthConfig,
  AgentRegistrationRequest,
  ChatConversationHandle,
  ChatHistoryCompactionResponse,
  ChatHistoryEntry,
  ChatHistoryFetchOptions,
  ChatHistorySnapshotResponse,
  ChatHistorySnapshotWithDecryptedEntries,
  CipherEnvelope,
  CompactHistoryRequestPayload,
  CreateAdapterRegistryCategoryRequest,
  CreateSessionResponse,
  CreditPurchaseResponse,
  DashboardStatsResponse,
  DetectProtocolResponse,
  EncryptionHandshakeRecord,
  EncryptionHandshakeSubmissionPayload,
  EncryptedChatSessionHandle,
  EnsureAgentKeyOptions,
  LedgerAuthenticationOptions,
  LedgerChallengeRequest,
  LedgerChallengeResponse,
  LedgerCredentialAuthOptions,
  LedgerVerifyRequest,
  LedgerVerifyResponse,
  MetricsSummaryResponse,
  MoltbookOwnerRegistrationUpdateRequest,
  MoltbookOwnerRegistrationUpdateResponse,
  PopularSearchesResponse,
  ProtocolDetectionMessage,
  ProtocolsResponse,
  RegisterAgentOptions,
  RegisterAgentQuoteResponse,
  RegisterEncryptionKeyPayload,
  RegisterEncryptionKeyResponse,
  RegistriesResponse,
  RegisterStatusResponse,
  RegistrationProgressRecord,
  RegistrationProgressWaitOptions,
  RegistrySearchByNamespaceResponse,
  RegistryStatsResponse,
  ResolvedAgentResponse,
  SearchFacetsResponse,
  SearchParams,
  SearchResult,
  SearchStatusResponse,
  SendMessageRequestPayload,
  SendMessageResponse,
  SessionEncryptionStatusResponse,
  SessionEncryptionSummary,
  SharedSecretInput,
  StartChatOptions,
  StartConversationOptions,
  StartEncryptedChatSessionOptions,
  SubmitAdapterRegistryAdapterRequest,
  UaidConnectionStatus,
  UaidValidationResponse,
  VectorSearchRequest,
  VectorSearchResponse,
  WebsocketStatsResponse,
  VerificationChallengeDetailsResponse,
  VerificationChallengeResponse,
  VerificationOwnershipResponse,
  VerificationStatusResponse,
  VerificationVerifyResponse,
  VerificationVerifySenderResponse,
  X402MinimumsResponse,
  SkillRegistryConfigResponse,
  SkillRegistryJobStatusResponse,
  SkillRegistryListResponse,
  SkillRegistryMineResponse,
  SkillRegistryMyListResponse,
  SkillRegistryOwnershipResponse,
  SkillRegistryPublishRequest,
  SkillRegistryPublishResponse,
  SkillRegistryQuoteRequest,
  SkillRegistryQuoteResponse,
  SkillRegistryVoteRequest,
  SkillRegistryVoteStatusResponse,
  SkillRegistryVersionsResponse,
  SkillVerificationRequestCreateRequest,
  SkillVerificationRequestCreateResponse,
  SkillVerificationStatusResponse,
} from '../types';
import {
  agentFeedbackEligibilityResponseSchema,
  agentFeedbackEntriesIndexResponseSchema,
  agentFeedbackIndexResponseSchema,
  agentFeedbackResponseSchema,
  agentFeedbackSubmissionResponseSchema,
  registerAgentResponseSchema,
} from '../schemas';
import type {
  ConversationContextInput,
  ConversationContextState,
} from './chat-history';
import {
  attachDecryptedHistory as attachDecryptedHistoryImpl,
  decryptHistoryEntryFromContext as decryptHistoryEntryFromContextImpl,
  fetchHistorySnapshot as fetchHistorySnapshotImpl,
  registerConversationContextForEncryption as registerConversationContextForEncryptionImpl,
  resolveDecryptionContext as resolveDecryptionContextImpl,
} from './chat-history';
import type { RegistryBrokerChatApi } from './chat';
import {
  acceptConversation as acceptConversationImpl,
  compactHistory as compactHistoryImpl,
  createChatApi,
  createPlaintextConversationHandle as createPlaintextConversationHandleImpl,
  createSession as createSessionImpl,
  endSession as endSessionImpl,
  fetchEncryptionStatus as fetchEncryptionStatusImpl,
  postEncryptionHandshake as postEncryptionHandshakeImpl,
  sendMessage as sendMessageImpl,
  startChat as startChatImpl,
  startConversation as startConversationImpl,
} from './chat';
import { EncryptedChatManager } from './encrypted-chat-manager';
import type { RegistryBrokerEncryptionApi } from './encryption';
import {
  bootstrapEncryptionOptions as bootstrapEncryptionOptionsImpl,
  createEncryptionApi,
  generateEncryptionKeyPair as generateEncryptionKeyPairImpl,
} from './encryption';
import {
  adapters as adaptersImpl,
  adaptersDetailed as adaptersDetailedImpl,
  adapterRegistryAdapters as adapterRegistryAdaptersImpl,
  adapterRegistryCategories as adapterRegistryCategoriesImpl,
  adapterRegistrySubmissionStatus as adapterRegistrySubmissionStatusImpl,
  createAdapterRegistryCategory as createAdapterRegistryCategoryImpl,
  submitAdapterRegistryAdapter as submitAdapterRegistryAdapterImpl,
} from './adapters';
import {
  closeUaidConnection as closeUaidConnectionImpl,
  dashboardStats as dashboardStatsImpl,
  getRegistrationProgress as getRegistrationProgressImpl,
  getRegistrationQuote as getRegistrationQuoteImpl,
  getUaidConnectionStatus as getUaidConnectionStatusImpl,
  resolveUaid as resolveUaidImpl,
  updateAgent as updateAgentImpl,
  validateUaid as validateUaidImpl,
  waitForRegistrationCompletion as waitForRegistrationCompletionImpl,
} from './agents';
import {
  createVerificationChallenge as createVerificationChallengeImpl,
  getRegisterStatus as getRegisterStatusImpl,
  getVerificationChallenge as getVerificationChallengeImpl,
  getVerificationOwnership as getVerificationOwnershipImpl,
  getVerificationStatus as getVerificationStatusImpl,
  registerOwnedMoltbookAgent as registerOwnedMoltbookAgentImpl,
  verifySenderOwnership as verifySenderOwnershipImpl,
  verifyVerificationChallenge as verifyVerificationChallengeImpl,
} from './verification';
import type {
  BuyCreditsWithX402Params,
  PurchaseCreditsWithX402Params,
  X402PurchaseResult,
} from './credits';
import {
  buyCreditsWithX402 as buyCreditsWithX402Impl,
  getX402Minimums as getX402MinimumsImpl,
  purchaseCreditsWithHbar as purchaseCreditsWithHbarImpl,
  purchaseCreditsWithX402 as purchaseCreditsWithX402Impl,
} from './credits';
import {
  authenticateWithLedger as authenticateWithLedgerImpl,
  authenticateWithLedgerCredentials as authenticateWithLedgerCredentialsImpl,
  createLedgerChallenge as createLedgerChallengeImpl,
  verifyLedgerChallenge as verifyLedgerChallengeImpl,
} from './ledger-auth';
import {
  detectProtocol as detectProtocolImpl,
  facets as facetsImpl,
  getAdditionalRegistries as getAdditionalRegistriesImpl,
  listProtocols as listProtocolsImpl,
  metricsSummary as metricsSummaryImpl,
  popularSearches as popularSearchesImpl,
  registries as registriesImpl,
  registrySearchByNamespace as registrySearchByNamespaceImpl,
  search as searchImpl,
  searchStatus as searchStatusImpl,
  stats as statsImpl,
  vectorSearch as vectorSearchImpl,
  websocketStats as websocketStatsImpl,
} from './search';
import {
  getSkillOwnership as getSkillOwnershipImpl,
  getSkillPublishJob as getSkillPublishJobImpl,
  getSkillVerificationStatus as getSkillVerificationStatusImpl,
  getSkillVoteStatus as getSkillVoteStatusImpl,
  getMySkillsList as getMySkillsListImpl,
  listSkills as listSkillsImpl,
  listMySkills as listMySkillsImpl,
  listSkillVersions as listSkillVersionsImpl,
  publishSkill as publishSkillImpl,
  quoteSkillPublish as quoteSkillPublishImpl,
  requestSkillVerification as requestSkillVerificationImpl,
  setSkillVote as setSkillVoteImpl,
  skillsConfig as skillsConfigImpl,
} from './skills';
import {
  createAbortError,
  DEFAULT_BASE_URL,
  DEFAULT_HISTORY_TOP_UP_HBAR,
  DEFAULT_USER_AGENT,
  JSON_CONTENT_TYPE,
  MINIMUM_REGISTRATION_AUTO_TOP_UP_CREDITS,
  isJsonObject,
  isBrowserRuntime,
  normaliseBaseUrl,
  normaliseHeaderName,
  serialiseAgentRegistrationRequest,
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
  private chatApi: RegistryBrokerChatApi | null = null;
  private encryptedChatManager: EncryptedChatManager | null = null;
  private encryptionApi: RegistryBrokerEncryptionApi | null = null;
  private conversationContexts = new Map<string, ConversationContextState[]>();
  constructor(options: RegistryBrokerClientOptions = {}) {
    const {
      baseUrl = DEFAULT_BASE_URL,
      fetchImplementation,
      defaultHeaders,
      apiKey,
      accountId,
      ledgerApiKey,
      registrationAutoTopUp,
      historyAutoTopUp,
      encryption,
    } = options;
    this.baseUrl = normaliseBaseUrl(baseUrl);
    const resolvedFetch =
      fetchImplementation ??
      (typeof globalThis.fetch === 'function' ? globalThis.fetch : null);
    if (!resolvedFetch) {
      throw new Error(
        'A fetch implementation is required for RegistryBrokerClient',
      );
    }
    this.fetchImpl = resolvedFetch;
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
    const existingLedgerHeader =
      this.defaultHeaders['x-ledger-api-key']?.trim();
    if (!this.defaultHeaders['x-api-key'] && existingLedgerHeader) {
      this.defaultHeaders['x-api-key'] = existingLedgerHeader;
    }
    if (apiKey) {
      this.defaultHeaders['x-api-key'] = apiKey;
    }
    if (typeof accountId === 'string' && accountId.trim().length > 0) {
      this.defaultHeaders['x-account-id'] = accountId.trim();
    }
    if (ledgerApiKey) {
      if (!this.defaultHeaders['x-api-key']) {
        this.defaultHeaders['x-api-key'] = ledgerApiKey;
      }
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

  get chat(): RegistryBrokerChatApi {
    if (this.chatApi) {
      return this.chatApi;
    }
    const api = createChatApi(this, this.getEncryptedChatManager());
    this.chatApi = api;
    return api;
  }

  get encryption(): RegistryBrokerEncryptionApi {
    if (this.encryptionApi) {
      return this.encryptionApi;
    }
    const api = createEncryptionApi(this);
    this.encryptionApi = api;
    return api;
  }

  setApiKey(apiKey?: string): void {
    this.setDefaultHeader('x-api-key', apiKey);
  }

  setLedgerApiKey(apiKey?: string): void {
    this.setDefaultHeader('x-api-key', apiKey);
    delete this.defaultHeaders['x-ledger-api-key'];
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

  async search(params: SearchParams = {}): Promise<SearchResult> {
    return searchImpl(this, params);
  }

  async searchErc8004ByAgentId(params: {
    chainId: number;
    agentId: number | bigint | string;
    limit?: number;
    page?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc' | string;
  }): Promise<SearchResult> {
    const chainId = Math.floor(params.chainId);
    if (!Number.isFinite(chainId) || chainId <= 0) {
      throw new Error('chainId must be a positive integer');
    }

    const rawAgentId =
      typeof params.agentId === 'bigint'
        ? params.agentId.toString()
        : String(params.agentId);
    const agentId = rawAgentId.trim();
    if (!agentId) {
      throw new Error('agentId is required');
    }

    const nativeId = `${chainId}:${agentId}`;

    return searchImpl(this, {
      registries: ['erc-8004'],
      limit: params.limit ?? 1,
      ...(typeof params.page === 'number' ? { page: params.page } : {}),
      ...(typeof params.sortBy === 'string' ? { sortBy: params.sortBy } : {}),
      ...(typeof params.sortOrder === 'string'
        ? { sortOrder: params.sortOrder }
        : {}),
      metadata: {
        nativeId: [nativeId],
        networkKey: [`eip155:${chainId}`],
      },
    });
  }

  async stats(): Promise<RegistryStatsResponse> {
    return statsImpl(this);
  }

  async registries(): Promise<RegistriesResponse> {
    return registriesImpl(this);
  }

  async getAdditionalRegistries(): Promise<AdditionalRegistryCatalogResponse> {
    return getAdditionalRegistriesImpl(this);
  }

  async popularSearches(): Promise<PopularSearchesResponse> {
    return popularSearchesImpl(this);
  }

  async listProtocols(): Promise<ProtocolsResponse> {
    return listProtocolsImpl(this);
  }

  async detectProtocol(
    message: ProtocolDetectionMessage,
  ): Promise<DetectProtocolResponse> {
    return detectProtocolImpl(this, message);
  }

  async registrySearchByNamespace(
    registry: string,
    query?: string,
  ): Promise<RegistrySearchByNamespaceResponse> {
    return registrySearchByNamespaceImpl(this, registry, query);
  }

  async vectorSearch(
    request: VectorSearchRequest,
  ): Promise<VectorSearchResponse> {
    return vectorSearchImpl(this, request);
  }

  async searchStatus(): Promise<SearchStatusResponse> {
    return searchStatusImpl(this);
  }

  async websocketStats(): Promise<WebsocketStatsResponse> {
    return websocketStatsImpl(this);
  }

  async metricsSummary(): Promise<MetricsSummaryResponse> {
    return metricsSummaryImpl(this);
  }

  async facets(adapter?: string): Promise<SearchFacetsResponse> {
    return facetsImpl(this, adapter);
  }

  async adapters(): Promise<AdaptersResponse> {
    return adaptersImpl(this);
  }

  async skillsConfig(): Promise<SkillRegistryConfigResponse> {
    return skillsConfigImpl(this);
  }

  async listSkills(options?: {
    name?: string;
    version?: string;
    limit?: number;
    cursor?: string;
    includeFiles?: boolean;
    accountId?: string;
  }): Promise<SkillRegistryListResponse> {
    return listSkillsImpl(this, options);
  }

  async listSkillVersions(params: {
    name: string;
  }): Promise<SkillRegistryVersionsResponse> {
    return listSkillVersionsImpl(this, params);
  }

  async listMySkills(params?: {
    limit?: number;
  }): Promise<SkillRegistryMineResponse> {
    return listMySkillsImpl(this, params);
  }

  async getMySkillsList(params?: {
    limit?: number;
    cursor?: string;
  }): Promise<SkillRegistryMyListResponse> {
    return getMySkillsListImpl(this, params);
  }

  async quoteSkillPublish(
    payload: SkillRegistryQuoteRequest,
  ): Promise<SkillRegistryQuoteResponse> {
    return quoteSkillPublishImpl(this, payload);
  }

  async publishSkill(
    payload: SkillRegistryPublishRequest,
  ): Promise<SkillRegistryPublishResponse> {
    return publishSkillImpl(this, payload);
  }

  async getSkillPublishJob(
    jobId: string,
    params?: { accountId?: string },
  ): Promise<SkillRegistryJobStatusResponse> {
    return getSkillPublishJobImpl(this, jobId, params);
  }

  async getSkillOwnership(params: {
    name: string;
    accountId?: string;
  }): Promise<SkillRegistryOwnershipResponse> {
    return getSkillOwnershipImpl(this, params);
  }

  async getSkillVoteStatus(params: {
    name: string;
  }): Promise<SkillRegistryVoteStatusResponse> {
    return getSkillVoteStatusImpl(this, params);
  }

  async setSkillVote(
    payload: SkillRegistryVoteRequest,
  ): Promise<SkillRegistryVoteStatusResponse> {
    return setSkillVoteImpl(this, payload);
  }

  async requestSkillVerification(
    payload: SkillVerificationRequestCreateRequest,
  ): Promise<SkillVerificationRequestCreateResponse> {
    return requestSkillVerificationImpl(this, payload);
  }

  async getSkillVerificationStatus(params: {
    name: string;
  }): Promise<SkillVerificationStatusResponse> {
    return getSkillVerificationStatusImpl(this, params);
  }

  async adaptersDetailed(): Promise<AdapterDetailsResponse> {
    return adaptersDetailedImpl(this);
  }

  async adapterRegistryCategories(): Promise<AdapterRegistryCategoriesResponse> {
    return adapterRegistryCategoriesImpl(this);
  }

  async adapterRegistryAdapters(filters?: {
    category?: string;
    entity?: string;
    keywords?: string[];
    query?: string;
    limit?: number;
    offset?: number;
  }): Promise<AdapterRegistryAdaptersResponse> {
    return adapterRegistryAdaptersImpl(this, filters);
  }

  async createAdapterRegistryCategory(
    payload: CreateAdapterRegistryCategoryRequest,
  ): Promise<AdapterRegistryCategory> {
    return createAdapterRegistryCategoryImpl(this, payload);
  }

  async submitAdapterRegistryAdapter(
    payload: SubmitAdapterRegistryAdapterRequest,
  ): Promise<AdapterRegistrySubmitAdapterAcceptedResponse> {
    return submitAdapterRegistryAdapterImpl(this, payload);
  }

  async adapterRegistrySubmissionStatus(
    submissionId: string,
  ): Promise<AdapterRegistrySubmissionStatusResponse> {
    return adapterRegistrySubmissionStatusImpl(this, submissionId);
  }

  async resolveUaid(uaid: string): Promise<ResolvedAgentResponse> {
    return resolveUaidImpl(this, uaid);
  }

  async performRegisterAgent(
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

  async ensureCreditsForRegistration(
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
    return getRegistrationQuoteImpl(this, payload);
  }

  async updateAgent(
    uaid: string,
    payload: AgentRegistrationRequest,
  ): Promise<RegisterAgentResponse> {
    return updateAgentImpl(this, uaid, payload);
  }

  async getRegisterStatus(uaid: string): Promise<RegisterStatusResponse> {
    return getRegisterStatusImpl(this, uaid);
  }

  async registerOwnedMoltbookAgent(
    uaid: string,
    payload: MoltbookOwnerRegistrationUpdateRequest,
  ): Promise<MoltbookOwnerRegistrationUpdateResponse> {
    return registerOwnedMoltbookAgentImpl(this, uaid, payload);
  }

  async getRegistrationProgress(
    attemptId: string,
  ): Promise<RegistrationProgressRecord | null> {
    return getRegistrationProgressImpl(this, attemptId);
  }

  async waitForRegistrationCompletion(
    attemptId: string,
    options?: RegistrationProgressWaitOptions,
  ): Promise<RegistrationProgressRecord> {
    return waitForRegistrationCompletionImpl(this, attemptId, options);
  }

  async validateUaid(uaid: string): Promise<UaidValidationResponse> {
    return validateUaidImpl(this, uaid);
  }

  async getUaidConnectionStatus(uaid: string): Promise<UaidConnectionStatus> {
    return getUaidConnectionStatusImpl(this, uaid);
  }

  async closeUaidConnection(uaid: string): Promise<void> {
    return closeUaidConnectionImpl(this, uaid);
  }

  async dashboardStats(): Promise<DashboardStatsResponse> {
    return dashboardStatsImpl(this);
  }

  async purchaseCreditsWithHbar(params: {
    accountId: string;
    privateKey: string;
    hbarAmount: number;
    memo?: string;
    metadata?: JsonObject;
  }): Promise<CreditPurchaseResponse> {
    return purchaseCreditsWithHbarImpl(this, params);
  }

  async getX402Minimums(): Promise<X402MinimumsResponse> {
    return getX402MinimumsImpl(this);
  }

  async purchaseCreditsWithX402(
    params: PurchaseCreditsWithX402Params,
  ): Promise<X402PurchaseResult> {
    return purchaseCreditsWithX402Impl(this, params);
  }

  async buyCreditsWithX402(
    params: BuyCreditsWithX402Params,
  ): Promise<X402PurchaseResult> {
    return buyCreditsWithX402Impl(this, params);
  }

  async generateEncryptionKeyPair(
    options: GenerateEncryptionKeyPairOptions = {},
  ): Promise<{
    privateKey: string;
    publicKey: string;
    envPath?: string;
    envVar: string;
  }> {
    return generateEncryptionKeyPairImpl(this, options);
  }

  async createLedgerChallenge(
    payload: LedgerChallengeRequest,
  ): Promise<LedgerChallengeResponse> {
    return createLedgerChallengeImpl(this, payload);
  }

  async verifyLedgerChallenge(
    payload: LedgerVerifyRequest,
  ): Promise<LedgerVerifyResponse> {
    return verifyLedgerChallengeImpl(this, payload);
  }

  async authenticateWithLedger(
    options: LedgerAuthenticationOptions,
  ): Promise<LedgerVerifyResponse> {
    return authenticateWithLedgerImpl(this, options);
  }

  async authenticateWithLedgerCredentials(
    options: LedgerCredentialAuthOptions,
  ): Promise<LedgerVerifyResponse> {
    return authenticateWithLedgerCredentialsImpl(this, options);
  }

  async getVerificationStatus(
    uaid: string,
  ): Promise<VerificationStatusResponse> {
    return getVerificationStatusImpl(this, uaid);
  }

  async createVerificationChallenge(
    uaid: string,
  ): Promise<VerificationChallengeResponse> {
    return createVerificationChallengeImpl(this, uaid);
  }

  async getVerificationChallenge(
    challengeId: string,
  ): Promise<VerificationChallengeDetailsResponse> {
    return getVerificationChallengeImpl(this, challengeId);
  }

  async verifyVerificationChallenge(params: {
    challengeId: string;
    method?: 'moltbook-post' | string;
  }): Promise<VerificationVerifyResponse> {
    return verifyVerificationChallengeImpl(this, params);
  }

  async getVerificationOwnership(
    uaid: string,
  ): Promise<VerificationOwnershipResponse> {
    return getVerificationOwnershipImpl(this, uaid);
  }

  async verifySenderOwnership(
    uaid: string,
  ): Promise<VerificationVerifySenderResponse> {
    return verifySenderOwnershipImpl(this, uaid);
  }

  async fetchHistorySnapshot(
    sessionId: string,
    options?: ChatHistoryFetchOptions,
  ): Promise<ChatHistorySnapshotWithDecryptedEntries> {
    return fetchHistorySnapshotImpl(
      this.conversationContexts,
      this,
      sessionId,
      options,
    );
  }

  attachDecryptedHistory(
    sessionId: string,
    snapshot: ChatHistorySnapshotResponse,
    options?: ChatHistoryFetchOptions,
  ): ChatHistorySnapshotWithDecryptedEntries {
    return attachDecryptedHistoryImpl(
      this.conversationContexts,
      this,
      sessionId,
      snapshot,
      options,
    );
  }

  registerConversationContextForEncryption(
    context: ConversationContextInput,
  ): void {
    registerConversationContextForEncryptionImpl(
      this.conversationContexts,
      context,
    );
  }

  resolveDecryptionContext(
    sessionId: string,
    options?: ChatHistoryFetchOptions,
  ): ConversationContextState | null {
    return resolveDecryptionContextImpl(
      this.conversationContexts,
      this,
      sessionId,
      options,
    );
  }

  decryptHistoryEntryFromContext(
    _sessionId: string,
    entry: ChatHistoryEntry,
    context: ConversationContextState,
  ): string | null {
    return decryptHistoryEntryFromContextImpl(this, entry, context);
  }

  async createSession(
    payload: CreateSessionRequestPayload,
    allowHistoryAutoTopUp = true,
  ): Promise<CreateSessionResponse> {
    return createSessionImpl(this, payload, allowHistoryAutoTopUp);
  }

  async startChat(options: StartChatOptions): Promise<ChatConversationHandle> {
    return startChatImpl(this, this.getEncryptedChatManager(), options);
  }

  async startConversation(
    options: StartConversationOptions,
  ): Promise<ChatConversationHandle> {
    return startConversationImpl(this, this.getEncryptedChatManager(), options);
  }

  async acceptConversation(
    options: AcceptConversationOptions,
  ): Promise<ChatConversationHandle> {
    return acceptConversationImpl(
      this,
      this.getEncryptedChatManager(),
      options,
    );
  }

  compactHistory(
    payload: CompactHistoryRequestPayload,
  ): Promise<ChatHistoryCompactionResponse> {
    return compactHistoryImpl(this, payload);
  }

  fetchEncryptionStatus(
    sessionId: string,
  ): Promise<SessionEncryptionStatusResponse> {
    return fetchEncryptionStatusImpl(this, sessionId);
  }

  postEncryptionHandshake(
    sessionId: string,
    payload: EncryptionHandshakeSubmissionPayload,
  ): Promise<EncryptionHandshakeRecord> {
    return postEncryptionHandshakeImpl(this, sessionId, payload);
  }

  sendMessage(
    payload: SendMessageRequestPayload,
  ): Promise<SendMessageResponse> {
    return sendMessageImpl(this, payload);
  }

  endSession(sessionId: string): Promise<void> {
    return endSessionImpl(this, sessionId);
  }

  createPlaintextConversationHandle(
    sessionId: string,
    summary: SessionEncryptionSummary | null,
    defaultAuth?: AgentAuthConfig,
    context?: { uaid?: string; agentUrl?: string },
  ): ChatConversationHandle {
    return createPlaintextConversationHandleImpl(
      this,
      sessionId,
      summary,
      defaultAuth,
      context,
    );
  }

  private getEncryptedChatManager(): EncryptedChatManager {
    if (this.encryptedChatManager) {
      return this.encryptedChatManager;
    }
    const manager = new EncryptedChatManager(this);
    this.encryptedChatManager = manager;
    return manager;
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

  buildCipherEnvelope(options: EncryptCipherEnvelopeOptions): CipherEnvelope {
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
    options?: ClientEncryptionOptions,
  ): Promise<{ publicKey: string; privateKey?: string } | null> {
    return bootstrapEncryptionOptionsImpl(this, options);
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
