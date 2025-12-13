import type {
  AcceptConversationOptions,
  AcceptEncryptedChatSessionOptions,
  AgentAuthConfig,
  ChatConversationHandle,
  ChatHistoryCompactionResponse,
  ChatHistoryFetchOptions,
  ChatHistorySnapshotWithDecryptedEntries,
  CompactHistoryRequestPayload,
  CreateSessionRequestPayload,
  CreateSessionResponse,
  EncryptionHandshakeRecord,
  EncryptionHandshakeSubmissionPayload,
  EncryptedChatSessionHandle,
  JsonObject,
  JsonValue,
  SendMessageRequestPayload,
  SendMessageResponse,
  SessionEncryptionStatusResponse,
  SessionEncryptionSummary,
  StartChatOptions,
  StartConversationOptions,
  StartEncryptedChatSessionOptions,
} from '../types';
import {
  chatHistoryCompactionResponseSchema,
  createSessionResponseSchema,
  encryptionHandshakeResponseSchema,
  sendMessageResponseSchema,
  sessionEncryptionStatusResponseSchema,
} from '../schemas';
import { RegistryBrokerClient } from './base-client';
import { serialiseAuthConfig, toJsonObject } from './utils';
import {
  EncryptedChatManager,
  EncryptionUnavailableError,
} from './encrypted-chat-manager';
const encryptedManagers = new WeakMap<
  RegistryBrokerClient,
  EncryptedChatManager
>();
const chatApis = new WeakMap<
  RegistryBrokerClient,
  RegistryBrokerClient['chat']
>();
function getEncryptedChatManager(
  client: RegistryBrokerClient,
): EncryptedChatManager {
  const existing = encryptedManagers.get(client);
  if (existing) {
    return existing;
  }
  const created = new EncryptedChatManager(client);
  encryptedManagers.set(client, created);
  return created;
}
declare module './base-client' {
  interface RegistryBrokerClient {
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
    createSession(
      payload: CreateSessionRequestPayload,
      allowHistoryAutoTopUp?: boolean,
    ): Promise<CreateSessionResponse>;
    startChat(options: StartChatOptions): Promise<ChatConversationHandle>;
    startConversation(
      options: StartConversationOptions,
    ): Promise<ChatConversationHandle>;
    acceptConversation(
      options: AcceptConversationOptions,
    ): Promise<ChatConversationHandle>;
    compactHistory(
      payload: CompactHistoryRequestPayload,
    ): Promise<ChatHistoryCompactionResponse>;
    fetchEncryptionStatus(
      sessionId: string,
    ): Promise<SessionEncryptionStatusResponse>;
    postEncryptionHandshake(
      sessionId: string,
      payload: EncryptionHandshakeSubmissionPayload,
    ): Promise<EncryptionHandshakeRecord>;
    sendMessage(
      payload: SendMessageRequestPayload,
    ): Promise<SendMessageResponse>;
    endSession(sessionId: string): Promise<void>;
    createPlaintextConversationHandle(
      sessionId: string,
      summary: SessionEncryptionSummary | null,
      defaultAuth?: AgentAuthConfig,
      context?: { uaid?: string; agentUrl?: string },
    ): ChatConversationHandle;
  }
}
Object.defineProperty(RegistryBrokerClient.prototype, 'chat', {
  get(this: RegistryBrokerClient) {
    const existing = chatApis.get(this);
    if (existing) {
      return existing;
    }
    const encryptedManager = getEncryptedChatManager(this);
    const api = {
      start: (options: StartChatOptions) => this.startChat(options),
      createSession: (payload: CreateSessionRequestPayload) =>
        this.createSession(payload),
      sendMessage: (payload: SendMessageRequestPayload) =>
        this.sendMessage(payload),
      endSession: (sessionId: string) => this.endSession(sessionId),
      getHistory: (sessionId: string, options?: ChatHistoryFetchOptions) =>
        this.fetchHistorySnapshot(sessionId, options),
      compactHistory: (payload: CompactHistoryRequestPayload) =>
        this.compactHistory(payload),
      getEncryptionStatus: (sessionId: string) =>
        this.fetchEncryptionStatus(sessionId),
      submitEncryptionHandshake: (
        sessionId: string,
        payload: EncryptionHandshakeSubmissionPayload,
      ) => this.postEncryptionHandshake(sessionId, payload),
      startConversation: (options: StartConversationOptions) =>
        this.startConversation(options),
      acceptConversation: (options: AcceptConversationOptions) =>
        this.acceptConversation(options),
      createEncryptedSession: (options: StartEncryptedChatSessionOptions) =>
        encryptedManager.startSession(options),
      acceptEncryptedSession: (options: AcceptEncryptedChatSessionOptions) =>
        encryptedManager.acceptSession(options),
    };
    chatApis.set(this, api);
    return api;
  },
});
RegistryBrokerClient.prototype.createSession = async function (
  this: RegistryBrokerClient,
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
    const maybeError = error instanceof Error ? error : null;
    if (
      allowHistoryAutoTopUp &&
      this.shouldAutoTopUpHistory(payload, maybeError)
    ) {
      await this.executeHistoryAutoTopUp('chat.session');
      return this.createSession(payload, false);
    }
    throw error;
  }
};
RegistryBrokerClient.prototype.startChat = async function (
  this: RegistryBrokerClient,
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
};
RegistryBrokerClient.prototype.startConversation = async function (
  this: RegistryBrokerClient,
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
    const encryptedManager = getEncryptedChatManager(this);
    const handle = await encryptedManager.startSession({
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
};
RegistryBrokerClient.prototype.acceptConversation = async function (
  this: RegistryBrokerClient,
  options: AcceptConversationOptions,
): Promise<ChatConversationHandle> {
  const preference = options.encryption?.preference ?? 'preferred';
  if (preference === 'disabled') {
    return this.createPlaintextConversationHandle(options.sessionId, null);
  }
  try {
    const encryptedManager = getEncryptedChatManager(this);
    const handle = await encryptedManager.acceptSession({
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
};
RegistryBrokerClient.prototype.createPlaintextConversationHandle = function (
  this: RegistryBrokerClient,
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
};
RegistryBrokerClient.prototype.compactHistory = async function (
  this: RegistryBrokerClient,
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
};
RegistryBrokerClient.prototype.fetchEncryptionStatus = async function (
  this: RegistryBrokerClient,
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
};
RegistryBrokerClient.prototype.postEncryptionHandshake = async function (
  this: RegistryBrokerClient,
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
};
RegistryBrokerClient.prototype.sendMessage = async function (
  this: RegistryBrokerClient,
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
    body.cipherEnvelope = toJsonObject(cipherEnvelope);
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
};
RegistryBrokerClient.prototype.endSession = async function (
  this: RegistryBrokerClient,
  sessionId: string,
): Promise<void> {
  await this.request(`/chat/session/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
};
