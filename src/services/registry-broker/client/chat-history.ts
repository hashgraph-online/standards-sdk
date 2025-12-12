import { Buffer } from 'buffer';
import type {
  ChatHistoryEntry,
  ChatHistoryFetchOptions,
  ChatHistorySnapshotResponse,
  ChatHistorySnapshotWithDecryptedEntries,
  JsonValue,
  RecipientIdentity,
} from '../types';
import { chatHistorySnapshotResponseSchema } from '../schemas';
import { RegistryBrokerClient } from './base-client';

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

const conversationContexts = new WeakMap<
  RegistryBrokerClient,
  Map<string, ConversationContextState[]>
>();

function getConversationContextMap(
  client: RegistryBrokerClient,
): Map<string, ConversationContextState[]> {
  const existing = conversationContexts.get(client);
  if (existing) {
    return existing;
  }
  const created = new Map<string, ConversationContextState[]>();
  conversationContexts.set(client, created);
  return created;
}

function identitiesMatch(
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

declare module './base-client' {
  interface RegistryBrokerClient {
    fetchHistorySnapshot(
      sessionId: string,
      options?: ChatHistoryFetchOptions,
    ): Promise<ChatHistorySnapshotWithDecryptedEntries>;
    attachDecryptedHistory(
      sessionId: string,
      snapshot: ChatHistorySnapshotResponse,
      options?: ChatHistoryFetchOptions,
    ): ChatHistorySnapshotWithDecryptedEntries;
    registerConversationContextForEncryption(
      context: ConversationContextInput,
    ): void;
    resolveDecryptionContext(
      sessionId: string,
      options?: ChatHistoryFetchOptions,
    ): ConversationContextState | null;
    decryptHistoryEntryFromContext(
      sessionId: string,
      entry: ChatHistoryEntry,
      context: ConversationContextState,
    ): string | null;
  }
}

RegistryBrokerClient.prototype.fetchHistorySnapshot = async function (
  this: RegistryBrokerClient,
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
};

RegistryBrokerClient.prototype.attachDecryptedHistory = function (
  this: RegistryBrokerClient,
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
};

RegistryBrokerClient.prototype.registerConversationContextForEncryption =
  function (
    this: RegistryBrokerClient,
    context: ConversationContextInput,
  ): void {
    const normalized: ConversationContextState = {
      sessionId: context.sessionId,
      sharedSecret: Buffer.from(context.sharedSecret),
      identity: context.identity ? { ...context.identity } : undefined,
    };
    const map = getConversationContextMap(this);
    const entries = map.get(context.sessionId) ?? [];
    const existingIndex = entries.findIndex(existing =>
      identitiesMatch(existing.identity, normalized.identity),
    );
    if (existingIndex >= 0) {
      entries[existingIndex] = normalized;
    } else {
      entries.push(normalized);
    }
    map.set(context.sessionId, entries);
  };

RegistryBrokerClient.prototype.resolveDecryptionContext = function (
  this: RegistryBrokerClient,
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
  const map = getConversationContextMap(this);
  const contexts = map.get(sessionId);
  if (!contexts || contexts.length === 0) {
    return null;
  }
  if (options?.identity) {
    const match = contexts.find(context =>
      identitiesMatch(context.identity, options.identity),
    );
    if (match) {
      return match;
    }
  }
  return contexts[0];
};

RegistryBrokerClient.prototype.decryptHistoryEntryFromContext = function (
  this: RegistryBrokerClient,
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
};
