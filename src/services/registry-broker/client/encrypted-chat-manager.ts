import type {
  AcceptEncryptedChatSessionOptions,
  ChatHistoryEntry,
  ChatHistoryFetchOptions,
  CipherEnvelopeRecipient,
  DecryptedHistoryEntry,
  EncryptedChatSessionHandle,
  EncryptionHandshakeRecord,
  RecipientIdentity,
  SessionEncryptionSummary,
  SharedSecretInput,
  StartEncryptedChatSessionOptions,
} from '../types';
import type { RegistryBrokerClient } from './base-client';

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

export class EncryptionUnavailableError extends Error {
  constructor(
    readonly sessionId: string,
    readonly summary?: SessionEncryptionSummary | null,
  ) {
    super('Encryption is not enabled for this session');
  }
}

export class EncryptedChatManager {
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
    const decryptHistoryEntry = (entry: ChatHistoryEntry): string | null =>
      this.decryptEntry(entry, context.identity, sharedSecret);
    const fetchHistory = async (
      options?: ChatHistoryFetchOptions,
    ): Promise<DecryptedHistoryEntry[]> => {
      const snapshot = await this.client.fetchHistorySnapshot(
        context.sessionId,
        options,
      );
      if (snapshot.decryptedHistory) {
        return snapshot.decryptedHistory;
      }
      return snapshot.history.map(entry => ({
        entry,
        plaintext: decryptHistoryEntry(entry),
      }));
    };
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
      decryptHistoryEntry,
      fetchHistory,
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
