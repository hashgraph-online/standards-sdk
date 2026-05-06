import type {
  AcceptConversationOptions,
  AcceptEncryptedChatSessionOptions,
  AgentAuthConfig,
  ChatConversationHandle,
  DecryptedHistoryEntry,
  ChatHistoryCompactionResponse,
  ChatHistoryFetchOptions,
  ChatHistorySnapshotWithDecryptedEntries,
  ChatReadinessRequestPayload,
  ChatReadinessResponse,
  ChatRetryRequestPayload,
  ChatRetryResponse,
  ChatSessionEndResponse,
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
  chatReadinessResponseSchema,
  chatSessionEndResponseSchema,
  createSessionResponseSchema,
  encryptionHandshakeResponseSchema,
  sendMessageResponseSchema,
  sessionEncryptionStatusResponseSchema,
} from '../schemas';
import type { RegistryBrokerClient } from './base-client';
import { serialiseAuthConfig, toJsonObject } from './utils';
import {
  EncryptedChatManager,
  EncryptionUnavailableError,
} from './encrypted-chat-manager';

export interface RegistryBrokerChatApi {
  start: (options: StartChatOptions) => Promise<ChatConversationHandle>;
  readiness: (
    payload: ChatReadinessRequestPayload,
  ) => Promise<ChatReadinessResponse>;
  createSession: (
    payload: CreateSessionRequestPayload,
  ) => Promise<CreateSessionResponse>;
  sendMessage: (
    payload: SendMessageRequestPayload,
  ) => Promise<SendMessageResponse>;
  retryMessage: (
    messageId: string,
    payload: ChatRetryRequestPayload,
  ) => Promise<ChatRetryResponse>;
  cancelSession: (sessionId: string) => Promise<ChatSessionEndResponse>;
  endSession: (sessionId: string) => Promise<ChatSessionEndResponse>;
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
  createEncryptedSession: (
    options: StartEncryptedChatSessionOptions,
  ) => Promise<EncryptedChatSessionHandle>;
  acceptEncryptedSession: (
    options: AcceptEncryptedChatSessionOptions,
  ) => Promise<EncryptedChatSessionHandle>;
  startConversation: (
    options: StartConversationOptions,
  ) => Promise<ChatConversationHandle>;
  acceptConversation: (
    options: AcceptConversationOptions,
  ) => Promise<ChatConversationHandle>;
}

export function createChatApi(
  client: RegistryBrokerClient,
  encryptedManager: EncryptedChatManager,
): RegistryBrokerChatApi {
  return {
    start: (options: StartChatOptions) => client.startChat(options),
    readiness: (payload: ChatReadinessRequestPayload) =>
      client.checkChatReadiness(payload),
    createSession: (payload: CreateSessionRequestPayload) =>
      client.createSession(payload),
    sendMessage: (payload: SendMessageRequestPayload) =>
      client.sendMessage(payload),
    retryMessage: (messageId: string, payload: ChatRetryRequestPayload) =>
      client.retryMessage(messageId, payload),
    cancelSession: (sessionId: string) => client.cancelSession(sessionId),
    endSession: (sessionId: string) => client.endSession(sessionId),
    getHistory: (sessionId: string, options?: ChatHistoryFetchOptions) =>
      client.fetchHistorySnapshot(sessionId, options),
    compactHistory: (payload: CompactHistoryRequestPayload) =>
      client.compactHistory(payload),
    getEncryptionStatus: (sessionId: string) =>
      client.fetchEncryptionStatus(sessionId),
    submitEncryptionHandshake: (
      sessionId: string,
      payload: EncryptionHandshakeSubmissionPayload,
    ) => client.postEncryptionHandshake(sessionId, payload),
    startConversation: (options: StartConversationOptions) =>
      client.startConversation(options),
    acceptConversation: (options: AcceptConversationOptions) =>
      client.acceptConversation(options),
    createEncryptedSession: (options: StartEncryptedChatSessionOptions) =>
      encryptedManager.startSession(options),
    acceptEncryptedSession: (options: AcceptEncryptedChatSessionOptions) =>
      encryptedManager.acceptSession(options),
  };
}

export async function checkChatReadiness(
  client: RegistryBrokerClient,
  payload: ChatReadinessRequestPayload,
): Promise<ChatReadinessResponse> {
  const body: JsonObject = {};
  if ('uaid' in payload && payload.uaid) {
    body.uaid = payload.uaid;
  }
  if ('agentUrl' in payload && payload.agentUrl) {
    body.agentUrl = payload.agentUrl;
  }
  const raw = await client.requestJson<JsonValue>('/chat/readiness', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  });
  return client.parseWithSchema(
    raw,
    chatReadinessResponseSchema,
    'chat readiness response',
  );
}

export async function createSession(
  client: RegistryBrokerClient,
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
  if (payload.visibility) {
    body.visibility = payload.visibility;
  }
  try {
    const raw = await client.requestJson<JsonValue>('/chat/session', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    });
    return client.parseWithSchema(
      raw,
      createSessionResponseSchema,
      'chat session response',
    );
  } catch (error) {
    const maybeError = error instanceof Error ? error : null;
    if (
      allowHistoryAutoTopUp &&
      client.shouldAutoTopUpHistory(payload, maybeError)
    ) {
      await client.executeHistoryAutoTopUp('chat.session');
      return createSession(client, payload, false);
    }
    throw error;
  }
}

export async function startChat(
  client: RegistryBrokerClient,
  encryptedManager: EncryptedChatManager,
  options: StartChatOptions,
): Promise<ChatConversationHandle> {
  if ('uaid' in options && options.uaid) {
    return startConversation(client, encryptedManager, {
      uaid: options.uaid,
      senderUaid: options.senderUaid,
      historyTtlSeconds: options.historyTtlSeconds,
      auth: options.auth,
      encryption: options.encryption,
      onSessionCreated: options.onSessionCreated,
    });
  }
  if ('agentUrl' in options && options.agentUrl) {
    const session = await createSession(client, {
      agentUrl: options.agentUrl,
      auth: options.auth,
      historyTtlSeconds: options.historyTtlSeconds,
      senderUaid: options.senderUaid,
    });
    options.onSessionCreated?.(session.sessionId);
    return createPlaintextConversationHandle(
      client,
      session.sessionId,
      session.encryption ?? null,
      options.auth,
      { agentUrl: options.agentUrl, uaid: options.uaid },
    );
  }
  throw new Error('startChat requires either uaid or agentUrl');
}

export async function startConversation(
  client: RegistryBrokerClient,
  encryptedManager: EncryptedChatManager,
  options: StartConversationOptions,
): Promise<ChatConversationHandle> {
  const preference = options.encryption?.preference ?? 'preferred';
  const requestEncryption = preference !== 'disabled';
  if (!requestEncryption) {
    const session = await createSession(client, {
      uaid: options.uaid,
      auth: options.auth,
      historyTtlSeconds: options.historyTtlSeconds,
      senderUaid: options.senderUaid,
      encryptionRequested: false,
    });
    options.onSessionCreated?.(session.sessionId);
    return createPlaintextConversationHandle(
      client,
      session.sessionId,
      session.encryption ?? null,
      options.auth,
      { uaid: options.uaid },
    );
  }
  try {
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
      return createPlaintextConversationHandle(
        client,
        error.sessionId,
        error.summary ?? null,
        options.auth,
        { uaid: options.uaid },
      );
    }
    throw error;
  }
}

export async function acceptConversation(
  client: RegistryBrokerClient,
  encryptedManager: EncryptedChatManager,
  options: AcceptConversationOptions,
): Promise<ChatConversationHandle> {
  const preference = options.encryption?.preference ?? 'preferred';
  if (preference === 'disabled') {
    return createPlaintextConversationHandle(client, options.sessionId, null);
  }
  try {
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
      return createPlaintextConversationHandle(
        client,
        options.sessionId,
        null,
        undefined,
        { uaid: options.responderUaid },
      );
    }
    throw error;
  }
}

export function createPlaintextConversationHandle(
  client: RegistryBrokerClient,
  sessionId: string,
  summary: SessionEncryptionSummary | null,
  defaultAuth?: AgentAuthConfig,
  context?: { uaid?: string; agentUrl?: string },
): ChatConversationHandle {
  const uaid = context?.uaid?.trim();
  const agentUrl = context?.agentUrl?.trim();
  const fetchHistory = async (
    options?: ChatHistoryFetchOptions,
  ): Promise<DecryptedHistoryEntry[]> => {
    const snapshot = await client.fetchHistorySnapshot(sessionId, options);
    if (snapshot.decryptedHistory) {
      return snapshot.decryptedHistory;
    }
    return snapshot.history.map(entry => ({
      entry,
      plaintext: entry.content,
    }));
  };
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
      return sendMessage(client, {
        sessionId,
        message,
        streaming: options.streaming,
        auth: options.auth ?? defaultAuth,
        uaid,
        agentUrl,
      });
    },
    decryptHistoryEntry: entry => entry.content,
    fetchHistory,
  };
}

export async function compactHistory(
  client: RegistryBrokerClient,
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
  const raw = await client.requestJson<JsonValue>(
    `/chat/session/${encodeURIComponent(payload.sessionId)}/compact`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    },
  );
  return client.parseWithSchema(
    raw,
    chatHistoryCompactionResponseSchema,
    'chat history compaction response',
  );
}

export async function fetchEncryptionStatus(
  client: RegistryBrokerClient,
  sessionId: string,
): Promise<SessionEncryptionStatusResponse> {
  if (!sessionId || sessionId.trim().length === 0) {
    throw new Error('sessionId is required for encryption status');
  }
  const raw = await client.requestJson<JsonValue>(
    `/chat/session/${encodeURIComponent(sessionId)}/encryption`,
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    sessionEncryptionStatusResponseSchema,
    'session encryption status response',
  );
}

export async function postEncryptionHandshake(
  client: RegistryBrokerClient,
  sessionId: string,
  payload: EncryptionHandshakeSubmissionPayload,
): Promise<EncryptionHandshakeRecord> {
  if (!sessionId || sessionId.trim().length === 0) {
    throw new Error('sessionId is required for encryption handshake');
  }
  const raw = await client.requestJson<JsonValue>(
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
  const response = client.parseWithSchema(
    raw,
    encryptionHandshakeResponseSchema,
    'encryption handshake response',
  );
  return response.handshake;
}

export async function sendMessage(
  client: RegistryBrokerClient,
  payload: SendMessageRequestPayload,
): Promise<SendMessageResponse> {
  const body: JsonObject = {
    message: payload.message,
  };
  if (payload.streaming !== undefined) {
    body.streaming = payload.streaming;
  }
  if (payload.idempotencyKey) {
    body.idempotencyKey = payload.idempotencyKey;
  }
  if (payload.senderUaid) {
    body.senderUaid = payload.senderUaid;
  }
  if (payload.transport) {
    body.transport = payload.transport;
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
    cipherEnvelope = client.encryption.encryptCipherEnvelope({
      ...payload.encryption,
      sessionId: sessionIdForEncryption,
    });
  }
  if (cipherEnvelope) {
    body.cipherEnvelope = toJsonObject(cipherEnvelope);
  }
  const raw = await client.requestJson<JsonValue>('/chat/message', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  });
  return client.parseWithSchema(
    raw,
    sendMessageResponseSchema,
    'chat message response',
  );
}

export async function endSession(
  client: RegistryBrokerClient,
  sessionId: string,
): Promise<ChatSessionEndResponse> {
  const raw = await client.requestJson<JsonValue>(
    `/chat/session/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
    },
  );
  return client.parseWithSchema(
    raw,
    chatSessionEndResponseSchema,
    'chat session end response',
  );
}

export async function cancelSession(
  client: RegistryBrokerClient,
  sessionId: string,
): Promise<ChatSessionEndResponse> {
  const raw = await client.requestJson<JsonValue>(
    `/chat/session/${encodeURIComponent(sessionId)}/cancel`,
    {
      method: 'POST',
    },
  );
  return client.parseWithSchema(
    raw,
    chatSessionEndResponseSchema,
    'chat session cancel response',
  );
}

export async function retryMessage(
  client: RegistryBrokerClient,
  messageId: string,
  payload: ChatRetryRequestPayload,
): Promise<ChatRetryResponse> {
  const body: JsonObject = {
    sessionId: payload.sessionId,
    message: payload.message,
  };
  if (payload.uaid) {
    body.uaid = payload.uaid;
  }
  if (payload.agentUrl) {
    body.agentUrl = payload.agentUrl;
  }
  if (payload.idempotencyKey) {
    body.idempotencyKey = payload.idempotencyKey;
  }
  if (payload.auth) {
    body.auth = serialiseAuthConfig(payload.auth);
  }
  const raw = await client.requestJson<JsonValue>(
    `/chat/message/${encodeURIComponent(messageId)}/retry`,
    {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    },
  );
  return client.parseWithSchema(
    raw,
    sendMessageResponseSchema,
    'chat retry response',
  );
}
