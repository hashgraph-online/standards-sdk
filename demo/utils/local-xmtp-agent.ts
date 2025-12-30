import {
  Client as XmtpClient,
  ConsentState,
  IdentifierKind,
  type Identifier,
  type Signer as XmtpSigner,
} from '@xmtp/node-sdk';
import { Wallet, getAddress, getBytes } from 'ethers';
import { Logger } from '../../src/utils/logger';

export interface LocalXmtpAgentOptions {
  agentId: string;
  privateKey?: string;
  env?: 'dev' | 'production' | 'local';
  requestTimeoutMs?: number;
  relayEnabled?: boolean;
}

export interface LocalXmtpAgentHandle {
  agentId: string;
  address: string;
  inboxId: string;
  endpoint: string;
  stop: () => Promise<void>;
}

const asTextMessage = (message: unknown): string => {
  if (typeof message === 'string') {
    return message;
  }
  if (message === null || message === undefined) {
    return '';
  }
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
};

const parseRelayCommand = (
  message: string,
): { address: string; message: string } | null => {
  const trimmed = message.trim();
  if (!trimmed.toLowerCase().startsWith('relay ')) {
    return null;
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length < 3) {
    return null;
  }
  const [, address, ...rest] = parts;
  const payload = rest.join(' ').trim();
  if (!address || !payload) {
    return null;
  }
  try {
    return { address: getAddress(address), message: payload };
  } catch {
    return null;
  }
};

const shouldIgnoreInbound = (text: string): boolean => {
  const normalized = text.trim().toLowerCase();
  return (
    normalized.startsWith('xmtp agent ') ||
    normalized.startsWith('relayed via xmtp ') ||
    normalized.startsWith('relay failed:')
  );
};

const createSigner = (wallet: Wallet): XmtpSigner => ({
  type: 'EOA',
  signMessage: async (message: string) =>
    getBytes(await wallet.signMessage(message)),
  getIdentifier: () =>
    ({
      identifier: wallet.address,
      identifierKind: IdentifierKind.Ethereum,
    }) satisfies Identifier,
});

const sendDmAndAwaitReply = async (
  client: XmtpClient,
  clientInboxId: string,
  recipientAddress: string,
  payload: string,
  timeoutMs: number,
): Promise<string> => {
  const identifier: Identifier = {
    identifier: getAddress(recipientAddress),
    identifierKind: IdentifierKind.Ethereum,
  };

  const dm = await client.conversations.newDmWithIdentifier(identifier);
  await dm.sync().catch(() => undefined);
  const stream = await dm.stream({ disableSync: false });
  const sendStartedAt = Date.now();

  try {
    await dm.send(payload);

    const deadline = sendStartedAt + timeoutMs;
    while (Date.now() < deadline) {
      const remainingMs = deadline - Date.now();
      const next = await Promise.race([
        stream.next(),
        new Promise<{ value: undefined; done: true }>(resolve => {
          setTimeout(
            () => resolve({ value: undefined, done: true }),
            remainingMs,
          );
        }),
      ]);

      if (!next || next.done || !next.value) {
        break;
      }

      const received = next.value;
      if (received.senderInboxId === clientInboxId) {
        continue;
      }
      if (received.sentAt.getTime() + 5 * 60_000 < sendStartedAt) {
        continue;
      }

      return asTextMessage(received.content);
    }
  } finally {
    await stream.end().catch(() => undefined);
  }

  throw new Error('Timed out waiting for XMTP reply');
};

export async function startLocalXmtpAgent(
  options: LocalXmtpAgentOptions,
): Promise<LocalXmtpAgentHandle> {
  const logger = new Logger({
    module: `demo/local-xmtp-agent:${options.agentId}`,
  });

  const wallet = options.privateKey
    ? new Wallet(options.privateKey.trim())
    : Wallet.createRandom();
  const requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  const relayEnabled = options.relayEnabled ?? false;

  const client = await XmtpClient.create(createSigner(wallet), {
    env: 'dev',
    dbPath: null,
  });

  if (!client.isRegistered) {
    await client.register();
  }

  await client.conversations
    .syncAll([ConsentState.Unknown, ConsentState.Allowed])
    .catch(() => undefined);

  const inboxId = client.inboxId;
  const endpoint = `xmtp://${wallet.address}`;

  const stream = await client.conversations.streamAllDmMessages({
    disableSync: false,
    consentStates: [ConsentState.Unknown, ConsentState.Allowed],
  });

  let stopped = false;
  const syncTimer = setInterval(() => {
    void client.conversations
      .syncAll([ConsentState.Unknown, ConsentState.Allowed])
      .catch(() => undefined);
  }, 2000);

  const loop = (async () => {
    while (!stopped) {
      const next = await stream.next();
      if (!next || next.done || !next.value) {
        break;
      }

      const message = next.value;
      if (message.senderInboxId === inboxId) {
        continue;
      }

      const text = asTextMessage(message.content).trim();
      if (shouldIgnoreInbound(text)) {
        continue;
      }
      logger.info('Received XMTP message', {
        inboxId,
        fromInboxId: message.senderInboxId,
        conversationId: message.conversationId,
        content: text,
      });

      const conversation = await client.conversations.getConversationById(
        message.conversationId,
      );
      if (!conversation) {
        continue;
      }

      if (conversation.consentState === ConsentState.Unknown) {
        conversation.updateConsentState(ConsentState.Allowed);
      }

      if (!text) {
        const response = `XMTP agent ${options.agentId} received an empty message.`;
        logger.info('Sending XMTP reply', { response });
        await conversation.send(response);
        await conversation.publishMessages().catch(() => undefined);
        continue;
      }

      const relay = relayEnabled ? parseRelayCommand(text) : null;
      if (relay) {
        try {
          const relayed = await sendDmAndAwaitReply(
            client,
            inboxId,
            relay.address,
            relay.message,
            requestTimeoutMs,
          );
          const response = `Relayed via XMTP to ${relay.address}: ${relayed.trim() || '[empty reply]'}`;
          logger.info('Sending XMTP reply', { response });
          await conversation.send(response);
          await conversation.publishMessages().catch(() => undefined);
        } catch (error) {
          const response = `Relay failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
          logger.info('Sending XMTP reply', { response });
          await conversation.send(response);
          await conversation.publishMessages().catch(() => undefined);
        }
        continue;
      }

      const response = `XMTP agent ${options.agentId} received: ${text}`;
      logger.info('Sending XMTP reply', { response });
      await conversation.send(response);
      await conversation.publishMessages().catch(() => undefined);
    }
  })();

  return {
    agentId: options.agentId,
    address: wallet.address,
    inboxId,
    endpoint,
    stop: async () => {
      stopped = true;
      clearInterval(syncTimer);
      await stream.end().catch(() => undefined);
      await loop.catch(() => undefined);
    },
  };
}
