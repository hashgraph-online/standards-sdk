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
  RegistrationProgressWaitOptions,
  ChatHistorySnapshotResponse,
  ChatHistoryCompactionResponse,
  CompactHistoryRequestPayload,
  AdapterDetailsResponse,
  AdditionalRegistryCatalogResponse,
  X402CreditPurchaseResponse,
  X402MinimumsResponse,
  SessionEncryptionStatusResponse,
  EncryptionHandshakeRecord,
  EncryptionHandshakeSubmissionPayload,
  RegisterEncryptionKeyPayload,
  RegisterEncryptionKeyResponse,
  EphemeralKeyPair,
  DeriveSharedSecretOptions,
  EncryptCipherEnvelopeOptions,
  DecryptCipherEnvelopeOptions,
  SharedSecretInput,
  CipherEnvelope,
  CipherEnvelopeRecipient,
  ChatConversationHandle,
  StartChatOptions,
  StartConversationOptions,
  AcceptConversationOptions,
  ChatHistoryEntry,
  ClientEncryptionOptions,
  AutoRegisterEncryptionKeyOptions,
  EnsureAgentKeyOptions,
  RegistryBrokerClientOptions,
  InitializeAgentClientOptions,
  ChatHistoryFetchOptions,
  ChatHistorySnapshotWithDecryptedEntries,
  RecipientIdentity,
  EncryptedChatSessionHandle,
  SessionEncryptionSummary,
  LedgerAuthenticationSignerResult,
  StartEncryptedChatSessionOptions,
  AcceptEncryptedChatSessionOptions,
  SearchStatusResponse,
} from './types';
import * as path from 'node:path';
import { Buffer } from 'node:buffer';
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { canonicalizeLedgerNetwork } from './ledger-network';
import axios from 'axios';
import type { SignerSignature } from '@hashgraph/sdk';
import type { Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import {
  withPaymentInterceptor,
  decodeXPaymentResponse,
  Signer,
  MultiNetworkSigner,
} from 'x402-axios';
import { createSigner as createX402Signer } from 'x402/types';
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
  vectorSearchResponseSchema,
  searchStatusResponseSchema,
  resolveResponseSchema,
  searchResponseSchema,
  sendMessageResponseSchema,
  chatHistorySnapshotResponseSchema,
  chatHistoryCompactionResponseSchema,
  sessionEncryptionStatusResponseSchema,
  registerEncryptionKeyResponseSchema,
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

type FsModule = {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  writeFileSync: (path: string, data: string) => void;
  appendFileSync: (path: string, data: string) => void;
};

type NodeRequire = (id: string) => unknown;

declare const require: NodeRequire | undefined;

const getFs = (): FsModule | null => {
  if (typeof require !== 'function') {
    return null;
  }

  try {
    const fsModule = require('node:fs') as Partial<FsModule> | null;

    if (
      fsModule &&
      typeof fsModule.existsSync === 'function' &&
      typeof fsModule.readFileSync === 'function' &&
      typeof fsModule.writeFileSync === 'function' &&
      typeof fsModule.appendFileSync === 'function'
    ) {
      return fsModule as FsModule;
    }
  } catch {}

  return null;
};

const DEFAULT_USER_AGENT =
  '@hashgraphonline/standards-sdk/registry-broker-client';

const DEFAULT_PROGRESS_INTERVAL_MS = 1_500;
const DEFAULT_PROGRESS_TIMEOUT_MS = 5 * 60 * 1_000;

export interface InitializedAgentClient {
  client: RegistryBrokerClient;
  encryption?: { publicKey: string; privateKey?: string } | null;
}

const createAbortError = (): Error =>
  typeof DOMException === 'function'
    ? new DOMException('Aborted', 'AbortError')
    : new Error('The operation was aborted');

const normaliseHeaderName = (name: string): string => name.trim().toLowerCase();

const isBrowserRuntime = (): boolean =>
  typeof window !== 'undefined' && typeof window.fetch === 'function';

const DEFAULT_BASE_URL = 'https://hol.org/registry/api/v1';
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

export interface GenerateEncryptionKeyPairOptions {
  keyType?: 'secp256k1';
  envVar?: string;
  envPath?: string;
  overwrite?: boolean;
}

interface RequestConfig {
  method?: string;
  body?: unknown;
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
  readonly rawValue?: JsonValue;

  constructor(
    message: string,
    cause: ZodError | Error | string,
    rawValue?: JsonValue,
  ) {
    super(message);
    this.cause = cause;
    this.rawValue = rawValue;
  }
}

function normaliseBaseUrl(input?: string): string {
  const trimmed = input?.trim();
  let baseCandidate =
    trimmed && trimmed.length > 0 ? trimmed : DEFAULT_BASE_URL;

  try {
    const url = new URL(baseCandidate.replace(/\/+$/, ''));
    const hostname = url.hostname.toLowerCase();
    const ensureRegistryPrefix = (): void => {
      if (!url.pathname.startsWith('/registry')) {
        url.pathname =
          url.pathname === '/' ? '/registry' : `/registry${url.pathname}`;
      }
    };

    if (hostname === 'hol.org') {
      ensureRegistryPrefix();
      baseCandidate = url.toString();
    } else if (
      hostname === 'registry.hashgraphonline.com' ||
      hostname === 'hashgraphonline.com'
    ) {
      // Avoid 301s that downgrade POST->GET by normalizing directly to hol.org/registry.
      ensureRegistryPrefix();
      url.hostname = 'hol.org';
      baseCandidate = url.toString();
    }
  } catch {
    // If parsing fails, fall back to string handling below.
  }

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
  readonly chat: {
    start: (options: StartChatOptions) => Promise<ChatConversationHandle>;
    createSession: (
      payload: CreateSessionRequestPayload,
    ) => Promise<CreateSessionResponse>;
    sendMessage: (
      payload: SendMessageRequestPayload,
    ) => Promise<SendMessageResponse>;
    endSession: (sessionId: string) => Promise<void>;
    getHistory: (
      sessionId: string,
      options?: ChatHistoryFetchOptions,
    ) => Promise<ChatHistorySnapshotWithDecryptedEntries>;
    compactHistory: (
      payload: CompactHistoryRequestPayload,
    ) => Promise<ChatHistoryCompactionResponse>;
    getEncryptionStatus: (
      sessionId: string,
    ) => Promise<SessionEncryptionStatusResponse>;
    submitEncryptionHandshake: (
      sessionId: string,
      payload: EncryptionHandshakeSubmissionPayload,
    ) => Promise<EncryptionHandshakeRecord>;
    createEncryptedSession?: (
      options: StartEncryptedChatSessionOptions,
    ) => Promise<EncryptedChatSessionHandle>;
    acceptEncryptedSession?: (
      options: AcceptEncryptedChatSessionOptions,
    ) => Promise<EncryptedChatSessionHandle>;
    startConversation: (
      options: StartConversationOptions,
    ) => Promise<ChatConversationHandle>;
    acceptConversation: (
      options: AcceptConversationOptions,
    ) => Promise<ChatConversationHandle>;
  };

  readonly encryption: {
    registerKey: (
      payload: RegisterEncryptionKeyPayload,
    ) => Promise<RegisterEncryptionKeyResponse>;
    generateEphemeralKeyPair: () => EphemeralKeyPair;
    deriveSharedSecret: (options: DeriveSharedSecretOptions) => Buffer;
    encryptCipherEnvelope: (
      options: EncryptCipherEnvelopeOptions,
    ) => CipherEnvelope;
    decryptCipherEnvelope: (options: DecryptCipherEnvelopeOptions) => string;
    ensureAgentKey: (
      options: EnsureAgentKeyOptions,
    ) => Promise<{ publicKey: string; privateKey?: string }>;
  };

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;
  private readonly registrationAutoTopUp?: AutoTopUpOptions;
  private readonly historyAutoTopUp?: HistoryAutoTopUpOptions;
  private readonly encryptedChatManager: EncryptedChatManager;
  private readonly encryptionOptions?: ClientEncryptionOptions;
  private readonly encryptionBootstrapPromise: Promise<void> | null;
  private readonly conversationContexts = new Map<
    string,
    ConversationContextState[]
  >();

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
    this.encryptedChatManager = new EncryptedChatManager(this);
    this.encryptionOptions = options.encryption;
    this.encryptionBootstrapPromise = this.bootstrapEncryptionOptions(
      options.encryption,
    );

    this.chat = {
      start: options => this.startChat(options),
      createSession: payload => this.createSession(payload),
      sendMessage: payload => this.sendMessage(payload),
      endSession: sessionId => this.endSession(sessionId),
      getHistory: (sessionId, options) =>
        this.fetchHistorySnapshot(sessionId, options),
      compactHistory: payload => this.compactHistory(payload),
      getEncryptionStatus: sessionId => this.fetchEncryptionStatus(sessionId),
      submitEncryptionHandshake: (sessionId, payload) =>
        this.postEncryptionHandshake(sessionId, payload),
      startConversation: opts => this.startConversation(opts),
      acceptConversation: opts => this.acceptConversation(opts),
    };

    this.encryption = {
      registerKey: payload => this.registerEncryptionKey(payload),
      generateEphemeralKeyPair: () => this.createEphemeralKeyPair(),
      deriveSharedSecret: options => this.deriveSharedSecret(options),
      encryptCipherEnvelope: options => this.buildCipherEnvelope(options),
      decryptCipherEnvelope: options => this.openCipherEnvelope(options),
      ensureAgentKey: options => this.ensureAgentEncryptionKey(options),
    };

    this.chat.createEncryptedSession = options =>
      this.encryptedChatManager.startSession(options);
    this.chat.acceptEncryptedSession = options =>
      this.encryptedChatManager.acceptSession(options);
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

  private bootstrapEncryptionOptions(
    options?: ClientEncryptionOptions,
  ): Promise<void> | null {
    if (!options?.autoRegister || options.autoRegister.enabled === false) {
      return null;
    }
    return this.autoRegisterEncryptionKey(options.autoRegister).then(
      (): void => undefined,
    );
  }

  private async autoRegisterEncryptionKey(
    config: AutoRegisterEncryptionKeyOptions,
  ): Promise<{ publicKey: string; privateKey?: string }> {
    const identity = this.normalizeAutoRegisterIdentity(config);
    if (!identity) {
      throw new Error(
        'Auto-registration requires uaid, ledgerAccountId, or email',
      );
    }
    const material = await this.resolveAutoRegisterKeyMaterial(config);
    if (!material) {
      throw new Error(
        'Unable to resolve encryption public key for auto-registration',
      );
    }
    await this.registerEncryptionKey({
      keyType: config.keyType ?? 'secp256k1',
      publicKey: material.publicKey,
      ...identity,
    });
    return material;
  }

  private normalizeAutoRegisterIdentity(
    config: AutoRegisterEncryptionKeyOptions,
  ): Pick<
    RegisterEncryptionKeyPayload,
    'uaid' | 'ledgerAccountId' | 'ledgerNetwork' | 'email'
  > | null {
    const identity: Pick<
      RegisterEncryptionKeyPayload,
      'uaid' | 'ledgerAccountId' | 'ledgerNetwork' | 'email'
    > = {};
    if (config.uaid) {
      identity.uaid = config.uaid;
    }
    if (config.ledgerAccountId) {
      identity.ledgerAccountId = config.ledgerAccountId;
      if (config.ledgerNetwork) {
        identity.ledgerNetwork = config.ledgerNetwork;
      }
    }
    if (config.email) {
      identity.email = config.email;
    }
    if (identity.uaid || identity.ledgerAccountId || identity.email) {
      return identity;
    }
    return null;
  }

  private async resolveAutoRegisterKeyMaterial(
    config: AutoRegisterEncryptionKeyOptions,
  ): Promise<{ publicKey: string; privateKey?: string } | null> {
    if (config.publicKey?.trim()) {
      return { publicKey: config.publicKey.trim() };
    }
    let privateKey = config.privateKey?.trim();
    const envVar = config.envVar ?? 'RB_ENCRYPTION_PRIVATE_KEY';
    if (!privateKey && envVar && process?.env?.[envVar]?.trim()) {
      privateKey = process.env[envVar]?.trim();
    }
    if (!privateKey && config.generateIfMissing) {
      const pair = await this.generateEncryptionKeyPair({
        keyType: config.keyType ?? 'secp256k1',
        envVar,
        envPath: config.envPath,
        overwrite: config.overwriteEnv,
      });
      if (envVar) {
        process.env[envVar] = pair.privateKey;
      }
      return { publicKey: pair.publicKey, privateKey: pair.privateKey };
    }
    if (privateKey) {
      const publicKey = this.derivePublicKeyFromPrivateKey(privateKey);
      return { publicKey, privateKey };
    }
    return null;
  }

  private derivePublicKeyFromPrivateKey(privateKey: string): string {
    const normalized = this.hexToBuffer(privateKey);
    const publicKey = secp256k1.getPublicKey(normalized, true);
    return Buffer.from(publicKey).toString('hex');
  }

  private ensureAgentEncryptionKey(
    options: EnsureAgentKeyOptions,
  ): Promise<{ publicKey: string; privateKey?: string }> {
    return this.autoRegisterEncryptionKey({
      ...options,
      uaid: options.uaid,
      enabled: true,
    });
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
    const normalizedKey = normalizeHexPrivateKey(params.evmPrivateKey);
    const walletClient = await createX402Signer(network, normalizedKey);

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

    const networkPayload = resolvedNetwork.canonical;

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

    logger?.info?.(
      `Authenticating ledger account ${accountId} (${resolvedNetwork.canonical})${labelSuffix}...`,
    );
    const verification = await this.authenticateWithLedger(authOptions);
    if (setAccountHeader) {
      this.setDefaultHeader('x-account-id', verification.accountId);
    }
    logger?.info?.(
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
        const fallback = await this.search(
          this.buildVectorFallbackSearchParams(request),
        );
        return this.convertSearchResultToVectorResponse(fallback);
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
    if (payload.encryptionRequested !== undefined) {
      body.encryptionRequested = payload.encryptionRequested;
    }
    if (payload.senderUaid) {
      body.senderUaid = payload.senderUaid;
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

  private async startChat(
    options: StartChatOptions,
  ): Promise<ChatConversationHandle> {
    if ('uaid' in options && options.uaid) {
      return this.startConversation({
        uaid: options.uaid,
        senderUaid: options.senderUaid,
        historyTtlSeconds: options.historyTtlSeconds,
        auth: options.auth,
        encryption: options.encryption,
        onSessionCreated: options.onSessionCreated,
      });
    }
    if ('agentUrl' in options && options.agentUrl) {
      const session = await this.createSession({
        agentUrl: options.agentUrl,
        auth: options.auth,
        historyTtlSeconds: options.historyTtlSeconds,
        senderUaid: options.senderUaid,
      });
      options.onSessionCreated?.(session.sessionId);
      return this.createPlaintextConversationHandle(
        session.sessionId,
        session.encryption ?? null,
        options.auth,
        { agentUrl: options.agentUrl, uaid: options.uaid },
      );
    }
    throw new Error('startChat requires either uaid or agentUrl');
  }

  private async startConversation(
    options: StartConversationOptions,
  ): Promise<ChatConversationHandle> {
    const preference = options.encryption?.preference ?? 'preferred';
    const requestEncryption = preference !== 'disabled';
    if (!requestEncryption) {
      const session = await this.createSession({
        uaid: options.uaid,
        auth: options.auth,
        historyTtlSeconds: options.historyTtlSeconds,
        senderUaid: options.senderUaid,
        encryptionRequested: false,
      });
      options.onSessionCreated?.(session.sessionId);
      return this.createPlaintextConversationHandle(
        session.sessionId,
        session.encryption ?? null,
        options.auth,
        { uaid: options.uaid },
      );
    }
    try {
      const handle = await this.encryptedChatManager.startSession({
        uaid: options.uaid,
        senderUaid: options.senderUaid,
        historyTtlSeconds: options.historyTtlSeconds,
        handshakeTimeoutMs: options.encryption?.handshakeTimeoutMs,
        pollIntervalMs: options.encryption?.pollIntervalMs,
        onSessionCreated: sessionId => {
          options.onSessionCreated?.(sessionId);
        },
        auth: options.auth,
      });
      return handle;
    } catch (error) {
      if (error instanceof EncryptionUnavailableError) {
        if (preference === 'required') {
          throw error;
        }
        return this.createPlaintextConversationHandle(
          error.sessionId,
          error.summary ?? null,
          options.auth,
          { uaid: options.uaid },
        );
      }
      throw error;
    }
  }

  private async acceptConversation(
    options: AcceptConversationOptions,
  ): Promise<ChatConversationHandle> {
    const preference = options.encryption?.preference ?? 'preferred';
    if (preference === 'disabled') {
      return this.createPlaintextConversationHandle(options.sessionId, null);
    }
    try {
      const handle = await this.encryptedChatManager.acceptSession({
        sessionId: options.sessionId,
        responderUaid: options.responderUaid,
        handshakeTimeoutMs: options.encryption?.handshakeTimeoutMs,
        pollIntervalMs: options.encryption?.pollIntervalMs,
      });
      return handle;
    } catch (error) {
      if (
        error instanceof EncryptionUnavailableError &&
        preference !== 'required'
      ) {
        return this.createPlaintextConversationHandle(
          options.sessionId,
          null,
          undefined,
          { uaid: options.responderUaid },
        );
      }
      throw error;
    }
  }

  private async fetchHistorySnapshot(
    sessionId: string,
    options?: ChatHistoryFetchOptions,
  ): Promise<ChatHistorySnapshotWithDecryptedEntries> {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new Error('sessionId is required to fetch chat history');
    }
    const raw = await this.requestJson<JsonValue>(
      `/chat/session/${encodeURIComponent(sessionId)}/history`,
      {
        method: 'GET',
      },
    );
    const snapshot = this.parseWithSchema(
      raw,
      chatHistorySnapshotResponseSchema,
      'chat history snapshot response',
    );
    return this.attachDecryptedHistory(sessionId, snapshot, options);
  }

  private attachDecryptedHistory(
    sessionId: string,
    snapshot: ChatHistorySnapshotResponse,
    options?: ChatHistoryFetchOptions,
  ): ChatHistorySnapshotWithDecryptedEntries {
    const shouldDecrypt =
      options?.decrypt !== undefined
        ? options.decrypt
        : this.encryptionOptions?.autoDecryptHistory === true;
    if (!shouldDecrypt) {
      return snapshot;
    }
    const context = this.resolveDecryptionContext(sessionId, options);
    if (!context) {
      throw new Error(
        'Unable to decrypt chat history: encryption context unavailable',
      );
    }
    const decryptedHistory = snapshot.history.map(entry => ({
      entry,
      plaintext: this.decryptHistoryEntryFromContext(sessionId, entry, context),
    }));
    return { ...snapshot, decryptedHistory };
  }

  private registerConversationContext(context: ConversationContextInput): void {
    const normalized: ConversationContextState = {
      sessionId: context.sessionId,
      sharedSecret: Buffer.from(context.sharedSecret),
      identity: context.identity ? { ...context.identity } : undefined,
    };
    const entries = this.conversationContexts.get(context.sessionId) ?? [];
    const existingIndex = entries.findIndex(existing =>
      this.identitiesMatch(existing.identity, normalized.identity),
    );
    if (existingIndex >= 0) {
      entries[existingIndex] = normalized;
    } else {
      entries.push(normalized);
    }
    this.conversationContexts.set(context.sessionId, entries);
  }

  // Exposed for EncryptedChatManager to persist decryption context
  registerConversationContextForEncryption(
    context: ConversationContextInput,
  ): void {
    this.registerConversationContext(context);
  }

  private resolveDecryptionContext(
    sessionId: string,
    options?: ChatHistoryFetchOptions,
  ): ConversationContextState | null {
    if (options?.sharedSecret) {
      return {
        sessionId,
        sharedSecret: this.normalizeSharedSecret(options.sharedSecret),
        identity: options.identity,
      };
    }
    const contexts = this.conversationContexts.get(sessionId);
    if (!contexts || contexts.length === 0) {
      return null;
    }
    if (options?.identity) {
      const match = contexts.find(context =>
        this.identitiesMatch(context.identity, options.identity),
      );
      if (match) {
        return match;
      }
    }
    return contexts[0];
  }

  private decryptHistoryEntryFromContext(
    sessionId: string,
    entry: ChatHistoryEntry,
    context: ConversationContextState,
  ): string | null {
    const envelope = entry.cipherEnvelope;
    if (!envelope) {
      return entry.content;
    }
    const secret = Buffer.from(context.sharedSecret);
    try {
      return this.encryption.decryptCipherEnvelope({
        envelope,
        sharedSecret: secret,
      });
    } catch (_error) {
      return null;
    }
  }

  private identitiesMatch(
    a?: RecipientIdentity,
    b?: RecipientIdentity,
  ): boolean {
    if (!a && !b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    if (a.uaid && b.uaid && a.uaid.toLowerCase() === b.uaid.toLowerCase()) {
      return true;
    }
    if (
      a.ledgerAccountId &&
      b.ledgerAccountId &&
      a.ledgerAccountId.toLowerCase() === b.ledgerAccountId.toLowerCase()
    ) {
      return true;
    }
    if (a.userId && b.userId && a.userId === b.userId) {
      return true;
    }
    if (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()) {
      return true;
    }
    return false;
  }

  private identityMatchesRecipient(
    recipient: CipherEnvelopeRecipient,
    identity: RecipientIdentity,
  ): boolean {
    if (
      identity.uaid &&
      recipient.uaid?.toLowerCase() === identity.uaid.toLowerCase()
    ) {
      return true;
    }
    if (
      identity.ledgerAccountId &&
      recipient.ledgerAccountId?.toLowerCase() ===
        identity.ledgerAccountId.toLowerCase()
    ) {
      return true;
    }
    if (identity.userId && recipient.userId === identity.userId) {
      return true;
    }
    if (
      identity.email &&
      recipient.email?.toLowerCase() === identity.email.toLowerCase()
    ) {
      return true;
    }
    return false;
  }

  private createPlaintextConversationHandle(
    sessionId: string,
    summary: SessionEncryptionSummary | null,
    defaultAuth?: AgentAuthConfig,
    context?: { uaid?: string; agentUrl?: string },
  ): ChatConversationHandle {
    const uaid = context?.uaid?.trim();
    const agentUrl = context?.agentUrl?.trim();
    return {
      sessionId,
      mode: 'plaintext',
      summary: summary ?? null,
      send: async options => {
        const plaintext = options.plaintext;
        if (!plaintext || plaintext.trim().length === 0) {
          throw new Error('plaintext is required for chat messages');
        }
        const message = options.message ?? plaintext;
        return this.sendMessage({
          sessionId,
          message,
          streaming: options.streaming,
          auth: options.auth ?? defaultAuth,
          uaid,
          agentUrl,
        });
      },
      decryptHistoryEntry: entry => entry.content,
    };
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

  private async fetchEncryptionStatus(
    sessionId: string,
  ): Promise<SessionEncryptionStatusResponse> {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new Error('sessionId is required for encryption status');
    }
    const raw = await this.requestJson<JsonValue>(
      `/chat/session/${encodeURIComponent(sessionId)}/encryption`,
      {
        method: 'GET',
      },
    );
    return this.parseWithSchema(
      raw,
      sessionEncryptionStatusResponseSchema,
      'session encryption status response',
    );
  }

  private async postEncryptionHandshake(
    sessionId: string,
    payload: EncryptionHandshakeSubmissionPayload,
  ): Promise<EncryptionHandshakeRecord> {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new Error('sessionId is required for encryption handshake');
    }
    const raw = await this.requestJson<JsonValue>(
      `/chat/session/${encodeURIComponent(sessionId)}/encryption-handshake`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          role: payload.role,
          keyType: payload.keyType,
          ephemeralPublicKey: payload.ephemeralPublicKey,
          longTermPublicKey: payload.longTermPublicKey,
          signature: payload.signature,
          uaid: payload.uaid,
          userId: payload.userId,
          ledgerAccountId: payload.ledgerAccountId,
          metadata: payload.metadata,
        },
      },
    );
    const response = this.parseWithSchema(
      raw,
      encryptionHandshakeResponseSchema,
      'encryption handshake response',
    );
    return response.handshake;
  }

  private async registerEncryptionKey(
    payload: RegisterEncryptionKeyPayload,
  ): Promise<RegisterEncryptionKeyResponse> {
    const raw = await this.requestJson<JsonValue>('/encryption/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    });
    return this.parseWithSchema(
      raw,
      registerEncryptionKeyResponseSchema,
      'register encryption key response',
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
    let cipherEnvelope = payload.cipherEnvelope ?? null;
    if (payload.encryption) {
      const sessionIdForEncryption =
        payload.encryption.sessionId ??
        (typeof body.sessionId === 'string' ? body.sessionId : undefined);
      if (!sessionIdForEncryption) {
        throw new Error(
          'sessionId is required when using encrypted chat payloads',
        );
      }
      if (!payload.encryption.recipients?.length) {
        throw new Error('recipients are required for encrypted chat payloads');
      }
      cipherEnvelope = this.encryption.encryptCipherEnvelope({
        ...payload.encryption,
        sessionId: sessionIdForEncryption,
      });
    }
    if (cipherEnvelope) {
      body.cipherEnvelope = cipherEnvelope as JsonObject;
    }
    delete body.encryption;

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

  async generateEncryptionKeyPair(
    options: GenerateEncryptionKeyPairOptions = {},
  ): Promise<{
    privateKey: string;
    publicKey: string;
    envPath?: string;
    envVar: string;
  }> {
    this.assertNodeRuntime('generateEncryptionKeyPair');

    const keyType = options.keyType ?? 'secp256k1';
    if (keyType !== 'secp256k1') {
      throw new Error('Only secp256k1 key generation is supported currently');
    }

    const privateKeyBytes = randomBytes(32);
    const privateKey = Buffer.from(privateKeyBytes).toString('hex');
    const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);
    const publicKey = Buffer.from(publicKeyBytes).toString('hex');

    const envVar = options.envVar ?? 'RB_ENCRYPTION_PRIVATE_KEY';
    const resolvedPath = options.envPath
      ? path.resolve(options.envPath)
      : undefined;

    if (resolvedPath) {
      const fsModule = getFs();

      if (!fsModule) {
        throw new Error(
          'File system module is not available; cannot write encryption key env file',
        );
      }

      const envLine = `${envVar}=${privateKey}`;
      if (fsModule.existsSync(resolvedPath)) {
        const content = fsModule.readFileSync(resolvedPath, 'utf-8');
        const lineRegex = new RegExp(`^${envVar}=.*$`, 'm');
        if (lineRegex.test(content)) {
          if (!options.overwrite) {
            throw new Error(
              `${envVar} already exists in ${resolvedPath}; set overwrite=true to replace it`,
            );
          }
          const updated = content.replace(lineRegex, envLine);
          fsModule.writeFileSync(resolvedPath, updated);
        } else {
          const needsNewline = !content.endsWith('\n');
          fsModule.appendFileSync(
            resolvedPath,
            `${needsNewline ? '\n' : ''}${envLine}\n`,
          );
        }
      } else {
        fsModule.writeFileSync(resolvedPath, `${envLine}\n`);
      }
    }

    return {
      privateKey,
      publicKey,
      envPath: resolvedPath,
      envVar,
    };
  }

  private buildUrl(path: string): string {
    const normalisedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${normalisedPath}`;
  }

  private buildVectorFallbackSearchParams(
    request: VectorSearchRequest,
  ): SearchParams {
    const params: SearchParams = {
      q: request.query,
    };
    let effectiveLimit: number | undefined;
    if (typeof request.limit === 'number' && Number.isFinite(request.limit)) {
      effectiveLimit = request.limit;
      params.limit = request.limit;
    }
    if (
      typeof request.offset === 'number' &&
      Number.isFinite(request.offset) &&
      request.offset > 0
    ) {
      const limit = effectiveLimit && effectiveLimit > 0 ? effectiveLimit : 20;
      params.limit = limit;
      params.page = Math.floor(request.offset / limit) + 1;
    }
    if (request.filter?.registry) {
      params.registry = request.filter.registry;
    }
    if (request.filter?.protocols?.length) {
      params.protocols = [...request.filter.protocols];
    }
    if (request.filter?.adapter?.length) {
      params.adapters = [...request.filter.adapter];
    }
    if (request.filter?.capabilities?.length) {
      params.capabilities = request.filter.capabilities.map(value =>
        typeof value === 'number' ? value.toString(10) : value,
      );
    }
    if (request.filter?.type) {
      params.type = request.filter.type;
    }
    return params;
  }

  private convertSearchResultToVectorResponse(
    result: SearchResult,
  ): VectorSearchResponse {
    const hits = result.hits.map(agent => ({
      agent,
      score: 0,
      highlights: {},
    }));
    const total = result.total;
    const limit = result.limit;
    const page = result.page;
    const totalVisible = page * limit;
    const limited = total > totalVisible || page > 1;

    return {
      hits,
      total,
      took: 0,
      totalAvailable: total,
      visible: hits.length,
      limited,
      credits_used: 0,
    };
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
        value,
      );
    }
  }

  private assertNodeRuntime(feature: string): void {
    if (typeof process === 'undefined' || !process.versions?.node) {
      throw new Error(`${feature} is only available in Node.js environments`);
    }
  }

  private createEphemeralKeyPair(): EphemeralKeyPair {
    this.assertNodeRuntime('generateEphemeralKeyPair');
    const privateKeyBytes = randomBytes(32);
    const publicKey = secp256k1.getPublicKey(privateKeyBytes, true);
    return {
      privateKey: Buffer.from(privateKeyBytes).toString('hex'),
      publicKey: Buffer.from(publicKey).toString('hex'),
    };
  }

  private deriveSharedSecret(options: DeriveSharedSecretOptions): Buffer {
    this.assertNodeRuntime('deriveSharedSecret');
    const privateKey = this.hexToBuffer(options.privateKey);
    const peerPublicKey = this.hexToBuffer(options.peerPublicKey);
    const shared = secp256k1.getSharedSecret(privateKey, peerPublicKey, true);
    return createHash('sha256').update(Buffer.from(shared)).digest();
  }

  private buildCipherEnvelope(
    options: EncryptCipherEnvelopeOptions,
  ): CipherEnvelope {
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

  private openCipherEnvelope(options: DecryptCipherEnvelopeOptions): string {
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

  private normalizeSharedSecret(input: SharedSecretInput): Buffer {
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

  private bufferFromString(value: string): Buffer {
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

  private hexToBuffer(value: string): Uint8Array {
    const normalized = value.startsWith('0x') ? value.slice(2) : value;
    if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
      throw new Error('Expected hex-encoded value');
    }
    return Buffer.from(normalized, 'hex');
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

interface EncryptedSessionContext {
  sessionId: string;
  sharedSecret: Uint8Array;
  summary: SessionEncryptionSummary;
  recipients: RecipientIdentity[];
  identity?: RecipientIdentity;
}

interface ConversationContextInput {
  sessionId: string;
  sharedSecret: Uint8Array | Buffer;
  identity?: RecipientIdentity;
}

interface ConversationContextState {
  sessionId: string;
  sharedSecret: Buffer;
  identity?: RecipientIdentity;
}

class EncryptedChatManager {
  constructor(private readonly client: RegistryBrokerClient) {}
  registerConversationContext(context: ConversationContextInput): void {
    this.client.registerConversationContextForEncryption(context);
  }

  async startSession(
    options: StartEncryptedChatSessionOptions,
  ): Promise<EncryptedChatSessionHandle> {
    await this.client.encryptionReady();
    const session = await this.client.chat.createSession({
      uaid: options.uaid,
      senderUaid: options.senderUaid,
      encryptionRequested: true,
      historyTtlSeconds: options.historyTtlSeconds,
      auth: options.auth,
    });
    options.onSessionCreated?.(session.sessionId);
    const summary = session.encryption;
    if (!summary?.enabled) {
      throw new EncryptionUnavailableError(
        session.sessionId,
        session.encryption ?? null,
      );
    }
    const handle = await this.establishRequesterContext({
      sessionId: session.sessionId,
      summary,
      senderUaid: options.senderUaid,
      handshakeTimeoutMs: options.handshakeTimeoutMs,
      pollIntervalMs: options.pollIntervalMs,
    });
    return handle;
  }

  async acceptSession(
    options: AcceptEncryptedChatSessionOptions,
  ): Promise<EncryptedChatSessionHandle> {
    await this.client.encryptionReady();
    const summary = await this.waitForEncryptionSummary(
      options.sessionId,
      options.handshakeTimeoutMs,
      options.pollIntervalMs,
    );
    const handle = await this.establishResponderContext({
      sessionId: options.sessionId,
      summary,
      responderUaid: options.responderUaid,
      handshakeTimeoutMs: options.handshakeTimeoutMs,
      pollIntervalMs: options.pollIntervalMs,
    });
    return handle;
  }

  private async establishRequesterContext(params: {
    sessionId: string;
    summary: SessionEncryptionSummary;
    senderUaid?: string;
    handshakeTimeoutMs?: number;
    pollIntervalMs?: number;
  }): Promise<EncryptedChatSessionHandle> {
    const keyPair = this.client.encryption.generateEphemeralKeyPair();
    await this.client.chat.submitEncryptionHandshake(params.sessionId, {
      role: 'requester',
      keyType: 'secp256k1',
      ephemeralPublicKey: keyPair.publicKey,
      uaid: params.senderUaid ?? params.summary.requester?.uaid ?? undefined,
    });
    const { summary, record } = await this.waitForHandshakeCompletion(
      params.sessionId,
      params.handshakeTimeoutMs,
      params.pollIntervalMs,
    );
    const responderKey = record.responder?.ephemeralPublicKey;
    if (!responderKey) {
      throw new Error('Responder handshake was not completed in time');
    }
    const sharedSecret = this.client.encryption
      .deriveSharedSecret({
        privateKey: keyPair.privateKey,
        peerPublicKey: responderKey,
      })
      .subarray();
    const recipients = this.buildRecipients(summary);
    return this.createHandle({
      sessionId: params.sessionId,
      sharedSecret,
      summary,
      recipients,
      identity: summary.requester ?? undefined,
    });
  }

  private async establishResponderContext(params: {
    sessionId: string;
    summary: SessionEncryptionSummary;
    responderUaid?: string;
    handshakeTimeoutMs?: number;
    pollIntervalMs?: number;
  }): Promise<EncryptedChatSessionHandle> {
    const keyPair = this.client.encryption.generateEphemeralKeyPair();
    await this.client.chat.submitEncryptionHandshake(params.sessionId, {
      role: 'responder',
      keyType: 'secp256k1',
      ephemeralPublicKey: keyPair.publicKey,
      uaid: params.responderUaid ?? params.summary.responder?.uaid ?? undefined,
    });
    const { summary, record } = await this.waitForHandshakeCompletion(
      params.sessionId,
      params.handshakeTimeoutMs,
      params.pollIntervalMs,
    );
    const requesterKey = record.requester?.ephemeralPublicKey;
    if (!requesterKey) {
      throw new Error('Requester handshake was not detected in time');
    }
    const sharedSecret = this.client.encryption
      .deriveSharedSecret({
        privateKey: keyPair.privateKey,
        peerPublicKey: requesterKey,
      })
      .subarray();
    const recipients = this.buildRecipients(summary);
    return this.createHandle({
      sessionId: params.sessionId,
      sharedSecret,
      summary,
      recipients,
      identity: summary.responder ?? undefined,
    });
  }

  private async waitForHandshakeCompletion(
    sessionId: string,
    timeoutMs = 30_000,
    pollIntervalMs = 1_000,
  ): Promise<{
    summary: SessionEncryptionSummary;
    record: EncryptionHandshakeRecord;
  }> {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const status = await this.client.chat.getEncryptionStatus(sessionId);
      const summary = status.encryption;
      const record = summary?.handshake;
      if (summary && record && record.status === 'complete') {
        return { summary, record };
      }
      if (Date.now() >= deadline) {
        throw new Error('Timed out waiting for encrypted handshake completion');
      }
      await this.delay(pollIntervalMs);
    }
  }

  private async waitForEncryptionSummary(
    sessionId: string,
    _timeoutMs = 30_000,
    _pollIntervalMs = 1_000,
  ): Promise<SessionEncryptionSummary> {
    const status = await this.client.chat.getEncryptionStatus(sessionId);
    if (!status.encryption?.enabled) {
      throw new EncryptionUnavailableError(
        sessionId,
        status.encryption ?? null,
      );
    }
    return status.encryption;
  }

  private buildRecipients(
    summary: SessionEncryptionSummary,
  ): RecipientIdentity[] {
    const candidates = [summary.requester, summary.responder].filter(Boolean);
    const normalized = candidates
      .map(candidate => {
        if (!candidate) {
          return null;
        }
        const recipient: RecipientIdentity = {};
        if (candidate.uaid) {
          recipient.uaid = candidate.uaid;
        }
        if (candidate.ledgerAccountId) {
          recipient.ledgerAccountId = candidate.ledgerAccountId;
        }
        if (candidate.userId) {
          recipient.userId = candidate.userId;
        }
        if (candidate.email) {
          recipient.email = candidate.email;
        }
        return recipient;
      })
      .filter((entry): entry is RecipientIdentity =>
        Boolean(
          entry?.uaid ||
            entry?.ledgerAccountId ||
            entry?.userId ||
            entry?.email,
        ),
      );
    if (normalized.length > 0) {
      return normalized;
    }
    if (summary.responder?.uaid) {
      return [{ uaid: summary.responder.uaid }];
    }
    return [];
  }

  private createHandle(
    context: EncryptedSessionContext,
  ): EncryptedChatSessionHandle {
    const sharedSecret = context.sharedSecret;
    const uaid =
      context.summary.requester?.uaid ??
      context.summary.responder?.uaid ??
      context.identity?.uaid;
    const handle: EncryptedChatSessionHandle = {
      sessionId: context.sessionId,
      mode: 'encrypted',
      summary: context.summary,
      send: async options => {
        const recipients = options.recipients ?? context.recipients;
        return this.client.chat.sendMessage({
          sessionId: context.sessionId,
          message: options.message ?? '[ciphertext omitted]',
          streaming: options.streaming,
          auth: options.auth,
          uaid,
          encryption: {
            plaintext: options.plaintext,
            sharedSecret: Buffer.from(sharedSecret),
            recipients,
          },
        });
      },
      decryptHistoryEntry: entry =>
        this.decryptEntry(entry, context.identity, sharedSecret),
    };
    this.registerConversationContext({
      sessionId: context.sessionId,
      sharedSecret,
      identity: context.identity,
    });
    return handle;
  }

  private decryptEntry(
    entry: ChatHistoryEntry,
    identity: RecipientIdentity | undefined,
    fallbackSecret: Uint8Array,
  ): string | null {
    const envelope = entry.cipherEnvelope;
    if (!envelope) {
      return null;
    }
    const secret: SharedSecretInput = Buffer.from(fallbackSecret);
    try {
      return this.client.encryption.decryptCipherEnvelope({
        envelope,
        sharedSecret: secret,
      });
    } catch (_error) {
      return null;
    }
  }

  private recipientMatches(
    candidate: CipherEnvelopeRecipient,
    target: RecipientIdentity,
  ): boolean {
    if (
      target.uaid &&
      candidate.uaid?.toLowerCase() === target.uaid.toLowerCase()
    ) {
      return true;
    }
    if (
      target.ledgerAccountId &&
      candidate.ledgerAccountId?.toLowerCase() ===
        target.ledgerAccountId.toLowerCase()
    ) {
      return true;
    }
    if (target.userId && candidate.userId === target.userId) {
      return true;
    }
    if (
      target.email &&
      candidate.email?.toLowerCase() === target.email.toLowerCase()
    ) {
      return true;
    }
    return false;
  }

  private async delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}

class EncryptionUnavailableError extends Error {
  constructor(
    readonly sessionId: string,
    readonly summary?: SessionEncryptionSummary | null,
  ) {
    super('Encryption is not enabled for this session');
  }
}
