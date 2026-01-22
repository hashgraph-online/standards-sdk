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
import type { RegistryBrokerClient } from './base-client';

export interface ConversationContextInput {
  sessionId: string;
  sharedSecret: Uint8Array | Buffer;
  identity?: RecipientIdentity;
}

export interface ConversationContextState {
  sessionId: string;
  sharedSecret: Buffer;
  identity?: RecipientIdentity;
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

export async function fetchHistorySnapshot(
  conversationContexts: Map<string, ConversationContextState[]>,
  client: RegistryBrokerClient,
  sessionId: string,
  options?: ChatHistoryFetchOptions,
): Promise<ChatHistorySnapshotWithDecryptedEntries> {
  if (!sessionId || sessionId.trim().length === 0) {
    throw new Error('sessionId is required to fetch chat history');
  }
  const raw = await client.requestJson<JsonValue>(
    `/chat/session/${encodeURIComponent(sessionId)}/history`,
    {
      method: 'GET',
    },
  );
  const snapshot = client.parseWithSchema(
    raw,
    chatHistorySnapshotResponseSchema,
    'chat history snapshot response',
  );
  return attachDecryptedHistory(
    conversationContexts,
    client,
    sessionId,
    snapshot,
    options,
  );
}

export function attachDecryptedHistory(
  conversationContexts: Map<string, ConversationContextState[]>,
  client: RegistryBrokerClient,
  sessionId: string,
  snapshot: ChatHistorySnapshotResponse,
  options?: ChatHistoryFetchOptions,
): ChatHistorySnapshotWithDecryptedEntries {
  const shouldDecrypt =
    options?.decrypt !== undefined
      ? options.decrypt
      : client.encryptionOptions?.autoDecryptHistory === true;
  if (!shouldDecrypt) {
    return snapshot;
  }
  const requiresContext = snapshot.history.some(entry =>
    Boolean(entry.cipherEnvelope),
  );
  if (!requiresContext) {
    return {
      ...snapshot,
      decryptedHistory: snapshot.history.map(entry => ({
        entry,
        plaintext: entry.content,
      })),
    };
  }
  const context = resolveDecryptionContext(
    conversationContexts,
    client,
    sessionId,
    options,
  );
  if (!context) {
    throw new Error(
      'Unable to decrypt chat history: encryption context unavailable',
    );
  }
  const decryptedHistory = snapshot.history.map(entry => ({
    entry,
    plaintext: decryptHistoryEntryFromContext(client, entry, context),
  }));
  return { ...snapshot, decryptedHistory };
}

export function registerConversationContextForEncryption(
  conversationContexts: Map<string, ConversationContextState[]>,
  context: ConversationContextInput,
): void {
  const normalized: ConversationContextState = {
    sessionId: context.sessionId,
    sharedSecret: Buffer.from(context.sharedSecret),
    identity: context.identity ? { ...context.identity } : undefined,
  };
  const entries = conversationContexts.get(context.sessionId) ?? [];
  const existingIndex = entries.findIndex(existing =>
    identitiesMatch(existing.identity, normalized.identity),
  );
  if (existingIndex >= 0) {
    entries[existingIndex] = normalized;
  } else {
    entries.push(normalized);
  }
  conversationContexts.set(context.sessionId, entries);
}

export function resolveDecryptionContext(
  conversationContexts: Map<string, ConversationContextState[]>,
  client: RegistryBrokerClient,
  sessionId: string,
  options?: ChatHistoryFetchOptions,
): ConversationContextState | null {
  if (options?.sharedSecret) {
    return {
      sessionId,
      sharedSecret: client.normalizeSharedSecret(options.sharedSecret),
      identity: options.identity,
    };
  }
  const contexts = conversationContexts.get(sessionId);
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
}

export function decryptHistoryEntryFromContext(
  client: RegistryBrokerClient,
  entry: ChatHistoryEntry,
  context: ConversationContextState,
): string | null {
  const envelope = entry.cipherEnvelope;
  if (!envelope) {
    return entry.content;
  }
  const secret = Buffer.from(context.sharedSecret);
  try {
    return client.encryption.decryptCipherEnvelope({
      envelope,
      sharedSecret: secret,
    });
  } catch (_error) {
    return null;
  }
}
