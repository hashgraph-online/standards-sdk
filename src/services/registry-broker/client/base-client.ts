import { Buffer } from 'node:buffer';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { ZodError, z } from 'zod';
import type {
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
} from '../types';
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
