import { jest } from '@jest/globals';
import { RegistryBrokerClient } from '../../src/services/registry-broker';
import { RegistryBrokerParseError } from '../../src/services/registry-broker/client/errors';
import {
  agentMessageViewSchema,
  agentRuntimeViewSchema,
} from '../../src/services/registry-broker/client';

const RUNTIME_ID = '550e8400-e29b-41d4-a716-446655440000';
const MESSAGE_ID = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const LEASE_ID = '33333333-3333-4333-8333-333333333333';
const GRANT_ID = '44444444-4444-4444-8444-444444444444';
const SUBSCRIPTION_ID = '66666666-6666-4666-8666-666666666666';

const runtimeView = {
  runtimeId: RUNTIME_ID,
  uaid: 'uaid:aid:test-runtime',
  ownerType: 'user',
  ownerId: 'owner-1',
  declaredProvider: 'openclaw',
  connectionState: 'interactive_verified',
  registrationState: 'registered',
  registrationAttemptId: null,
  receiveMode: 'poll',
  gatewayUrl: 'https://hol.org/agents/x/a2a',
  paused: false,
  allowedPeerUaids: null,
  capabilities: ['text'],
  lastActivityAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
};

const messageView = (overrides: Record<string, unknown> = {}) => ({
  messageId: MESSAGE_ID,
  conversationId: CONVERSATION_ID,
  schemaVersion: 'hol-agent-message/1' as const,
  kind: 'request',
  senderUaid: 'uaid:aid:sender',
  recipientUaid: 'uaid:aid:recipient',
  inReplyTo: null,
  content: { type: 'text', text: 'nonce-123 compute 37 + 58' },
  requestState: 'accepted',
  createdAt: '2026-10-01T00:00:00.000Z',
  expiresAt: '2026-10-01T01:00:00.000Z',
  traceId: 'trace-1',
  ...overrides,
});

function createResponse(payload: {
  status?: number;
  body?: unknown;
}): Response {
  const status = payload.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => payload.body ?? {},
    text: async () => JSON.stringify(payload.body ?? {}),
  } as unknown as Response;
}

interface CapturedRequest {
  url: string;
  method: string;
  headers: Headers;
  body?: unknown;
}

describe('RegistryBrokerClient agentNetwork', () => {
  const fetchImplementation = jest.fn<typeof fetch>();
  const captured: CapturedRequest[] = [];

  const client = new RegistryBrokerClient({
    baseUrl: 'https://broker.test',
    apiKey: 'owner-key',
    fetchImplementation: (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured.push({
        url: String(input),
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return fetchImplementation(input, init);
    }) as typeof fetch,
  });

  beforeEach(() => {
    fetchImplementation.mockReset();
    captured.length = 0;
  });

  const lastRequest = () => captured[captured.length - 1];

  describe('owner plane', () => {
    it('lists runtimes with the client api key', async () => {
      fetchImplementation.mockResolvedValueOnce(
        createResponse({ body: { runtimes: [runtimeView] } }),
      );
      const runtimes = await client.agentNetwork.listRuntimes();
      expect(runtimes).toHaveLength(1);
      expect(runtimes[0].runtimeId).toBe(RUNTIME_ID);
      const req = lastRequest();
      expect(req.url).toBe('https://broker.test/api/v1/agent-runtimes');
      expect(req.method).toBe('GET');
      expect(req.headers.get('x-api-key')).toBe('owner-key');
    });

    it('registers a runtime and parses the result', async () => {
      fetchImplementation.mockResolvedValueOnce(
        createResponse({
          body: { runtime: runtimeView, registration: 'registered' },
        }),
      );
      const result = await client.agentNetwork.registerRuntime({
        displayName: 'OpenClaw Bot',
        declaredProvider: 'openclaw',
        linkExistingUaid: 'uaid:aid:test-runtime',
      });
      expect(result.runtime.uaid).toBe('uaid:aid:test-runtime');
      expect(result.registration).toBe('registered');
      const req = lastRequest();
      expect(req.url).toBe('https://broker.test/api/v1/agent-runtimes/register');
      expect(req.method).toBe('POST');
      expect(req.body).toMatchObject({
        displayName: 'OpenClaw Bot',
        linkExistingUaid: 'uaid:aid:test-runtime',
      });
    });

    it('probes a runtime and returns required fields', async () => {
      fetchImplementation.mockResolvedValueOnce(
        createResponse({
          body: { nonce: 'n-1', issuedAt: '2026-10-01T00:00:00.000Z' },
        }),
      );
      const probe = await client.agentNetwork.probeRuntime(RUNTIME_ID);
      expect(probe.nonce).toBe('n-1');
      expect(lastRequest().url).toBe(
        `https://broker.test/api/v1/agent-runtimes/${RUNTIME_ID}/probe`,
      );
    });

    it('starts and completes pairing', async () => {
      fetchImplementation.mockResolvedValueOnce(
        createResponse({
          body: {
            grantId: GRANT_ID,
            pairingCode: 'hol_pair_abc',
            expiresAt: '2026-10-01T00:10:00.000Z',
          },
        }),
      );
      const start = await client.agentNetwork.startAgentConnection(RUNTIME_ID);
      expect(start.pairingCode).toBe('hol_pair_abc');
      const startReq = lastRequest();
      expect(startReq.url).toBe('https://broker.test/api/v1/agent-connections');
      expect(startReq.body).toEqual({ runtimeId: RUNTIME_ID });

      fetchImplementation.mockResolvedValueOnce(
        createResponse({
          body: {
            grantId: GRANT_ID,
            runtimeId: RUNTIME_ID,
            token: 'hol_agt_secret',
            scopes: ['inbox:read'],
          },
        }),
      );
      const complete =
        await client.agentNetwork.completeAgentPairing('hol_pair_abc');
      expect(complete.token).toBe('hol_agt_secret');
      expect(lastRequest().body).toEqual({ pairingCode: 'hol_pair_abc' });
    });

    it('revokes a connection with DELETE', async () => {
      fetchImplementation.mockResolvedValueOnce(
        createResponse({ status: 204 }),
      );
      await client.agentNetwork.revokeAgentConnection(GRANT_ID);
      const req = lastRequest();
      expect(req.method).toBe('DELETE');
      expect(req.url).toBe(
        `https://broker.test/api/v1/agent-connections/${GRANT_ID}`,
      );
    });

    it('reads the owner inbox without a grant token', async () => {
      fetchImplementation.mockResolvedValueOnce(
        createResponse({
          body: {
            items: [
              {
                messageId: MESSAGE_ID,
                conversationId: CONVERSATION_ID,
                kind: 'request',
                senderUaid: 'uaid:aid:sender',
                content: { type: 'text', text: 'nonce-123 compute 37 + 58' },
                requestState: 'completed',
                deliveryState: 'acknowledged',
                acknowledged: true,
                leaseId: null,
                fencingToken: null,
                createdAt: '2026-10-01T00:00:00.000Z',
                expiresAt: '2026-10-01T01:00:00.000Z',
              },
            ],
            nextCursor: 'next-1',
          },
        }),
      );
      const inbox = await client.agentNetwork.listRuntimeInbox(RUNTIME_ID, {
        cursor: 'c0',
        limit: 5,
        includeAcknowledged: true,
      });
      expect(inbox.items).toHaveLength(1);
      expect(inbox.nextCursor).toBe('next-1');
      const req = lastRequest();
      expect(req.url).toBe(
        `https://broker.test/api/v1/agent-runtimes/${RUNTIME_ID}/inbox?cursor=c0&limit=5&includeAcknowledged=true`,
      );
      expect(req.headers.get('x-api-key')).toBe('owner-key');
    });

    it('reads an owner-scoped conversation', async () => {
      fetchImplementation.mockResolvedValueOnce(
        createResponse({
          body: {
            conversationId: CONVERSATION_ID,
            state: 'active',
            participants: [
              { uaid: 'uaid:aid:recipient' },
              { uaid: 'uaid:aid:sender' },
            ],
            messages: [messageView()],
            nextCursor: null,
          },
        }),
      );
      const view = await client.agentNetwork.getRuntimeConversation(
        RUNTIME_ID,
        CONVERSATION_ID,
      );
      expect(view.messages).toHaveLength(1);
      const req = lastRequest();
      expect(req.url).toBe(
        `https://broker.test/api/v1/agent-runtimes/${RUNTIME_ID}/conversations/${CONVERSATION_ID}`,
      );
      expect(req.headers.get('x-api-key')).toBe('owner-key');
    });

    it('creates, lists, and revokes push subscriptions', async () => {
      const subscription = {
        subscriptionId: SUBSCRIPTION_ID,
        runtimeId: RUNTIME_ID,
        eventType: 'notify_request',
        callbackUrl: 'https://hooks.example.net/agent',
        state: 'active',
        expiresAt: null,
        createdAt: '2026-10-01T00:00:00.000Z',
      };
      fetchImplementation
        .mockResolvedValueOnce(createResponse({ body: { subscription } }))
        .mockResolvedValueOnce(
          createResponse({ body: { subscriptions: [subscription] } }),
        )
        .mockResolvedValueOnce(createResponse({ status: 204 }));

      const created = await client.agentNetwork.createAgentSubscription(
        RUNTIME_ID,
        {
          eventType: 'notify_request',
          callbackUrl: 'https://hooks.example.net/agent',
          signingSecret: 'whsec_test_secret',
        },
      );
      expect(created.subscriptionId).toBe(SUBSCRIPTION_ID);
      let req = lastRequest();
      expect(req.url).toBe(
        `https://broker.test/api/v1/agent-runtimes/${RUNTIME_ID}/subscriptions`,
      );
      expect(req.method).toBe('POST');
      expect(req.body).toMatchObject({
        callbackUrl: 'https://hooks.example.net/agent',
      });
      // the client must be able to send the secret — server never returns it
      expect(req.body).toHaveProperty('signingSecret', 'whsec_test_secret');
      expect(JSON.stringify(created)).not.toContain('whsec_test_secret');

      const listed =
        await client.agentNetwork.listAgentSubscriptions(RUNTIME_ID);
      expect(listed).toHaveLength(1);
      expect(JSON.stringify(listed)).not.toContain('whsec_test_secret');
      req = lastRequest();
      expect(req.method).toBe('GET');
      expect(req.url).toBe(
        `https://broker.test/api/v1/agent-runtimes/${RUNTIME_ID}/subscriptions`,
      );

      await client.agentNetwork.revokeAgentSubscription(
        RUNTIME_ID,
        SUBSCRIPTION_ID,
      );
      req = lastRequest();
      expect(req.method).toBe('DELETE');
      expect(req.url).toBe(
        `https://broker.test/api/v1/agent-runtimes/${RUNTIME_ID}/subscriptions/${SUBSCRIPTION_ID}`,
      );
    });
  });

  describe('bot plane', () => {
    it('sends the grant token as Authorization, not request fields', async () => {
      fetchImplementation.mockResolvedValueOnce(
        createResponse({
          body: {
            messageId: MESSAGE_ID,
            conversationId: CONVERSATION_ID,
            requestState: 'accepted',
            createdAt: '2026-10-01T00:00:00.000Z',
            expiresAt: '2026-10-01T01:00:00.000Z',
            deduplicated: false,
          },
        }),
      );
      const accepted = await client.agentNetwork.sendAgentMessage(
        'hol_agt_tok',
        {
          recipientUaid: 'uaid:aid:recipient',
          kind: 'request',
          content: { type: 'text', text: 'hello' },
          idempotencyKey: 'idem-1',
        },
      );
      expect(accepted.messageId).toBe(MESSAGE_ID);
      const req = lastRequest();
      expect(req.url).toBe('https://broker.test/api/v1/agent-messages');
      expect(req.headers.get('authorization')).toBe('Bearer hol_agt_tok');
      expect(req.body).toMatchObject({
        recipientUaid: 'uaid:aid:recipient',
        idempotencyKey: 'idem-1',
      });
      // sender identity must not be client-settable
      expect(req.body).not.toHaveProperty('senderUaid');
    });

    it('resolves agent identity via bearer token', async () => {
      fetchImplementation.mockResolvedValueOnce(
        createResponse({ body: { runtime: runtimeView } }),
      );
      const me = await client.agentNetwork.agentMe('hol_agt_tok');
      expect(me.runtimeId).toBe(RUNTIME_ID);
      expect(lastRequest().headers.get('authorization')).toBe(
        'Bearer hol_agt_tok',
      );
    });

    it('claims a message and returns lease + fencing token', async () => {
      fetchImplementation.mockResolvedValueOnce(
        createResponse({
          body: {
            message: messageView(),
            lease: {
              leaseId: LEASE_ID,
              messageId: MESSAGE_ID,
              fencingToken: 7,
              expiresAt: '2026-10-01T00:05:00.000Z',
            },
          },
        }),
      );
      const claimed = await client.agentNetwork.claimAgentMessage('hol_agt_tok');
      expect(claimed?.lease.fencingToken).toBe(7);
      expect(claimed?.message.messageId).toBe(MESSAGE_ID);
      const req = lastRequest();
      expect(req.url).toBe('https://broker.test/api/v1/agent-inbox/leases');
      expect(req.method).toBe('POST');
    });

    it('returns null when claim yields 204', async () => {
      fetchImplementation.mockResolvedValueOnce(
        createResponse({ status: 204 }),
      );
      const claimed = await client.agentNetwork.claimAgentMessage('hol_agt_tok');
      expect(claimed).toBeNull();
    });

    it('acknowledges with lease + fencing token in the body', async () => {
      fetchImplementation.mockResolvedValueOnce(
        createResponse({ body: messageView({ requestState: 'processing' }) }),
      );
      await client.agentNetwork.acknowledgeAgentMessage(
        'hol_agt_tok',
        MESSAGE_ID,
        { leaseId: LEASE_ID, fencingToken: 7 },
      );
      const req = lastRequest();
      expect(req.url).toBe(
        `https://broker.test/api/v1/agent-inbox/${MESSAGE_ID}/ack`,
      );
      expect(req.body).toEqual({ leaseId: LEASE_ID, fencingToken: 7 });
    });

    it('replies atomically with outcome + idempotency key', async () => {
      fetchImplementation.mockResolvedValueOnce(
        createResponse({
          body: {
            request: messageView({ requestState: 'completed' }),
            response: messageView({
              kind: 'response',
              inReplyTo: MESSAGE_ID,
              content: { type: 'text', text: '95 nonce-123' },
            }),
          },
        }),
      );
      const result = await client.agentNetwork.replyToAgentMessage(
        'hol_agt_tok',
        MESSAGE_ID,
        {
          leaseId: LEASE_ID,
          fencingToken: 7,
          content: { type: 'text', text: '95 nonce-123' },
          idempotencyKey: 'reply-1',
          outcome: 'answered',
        },
      );
      expect(result.response.inReplyTo).toBe(MESSAGE_ID);
      const req = lastRequest();
      expect(req.url).toBe(
        `https://broker.test/api/v1/agent-messages/${MESSAGE_ID}/reply`,
      );
      expect(req.body).toMatchObject({
        leaseId: LEASE_ID,
        fencingToken: 7,
        outcome: 'answered',
        idempotencyKey: 'reply-1',
      });
    });

    it('cancels a conversation', async () => {
      fetchImplementation.mockResolvedValueOnce(
        createResponse({
          body: { conversationId: CONVERSATION_ID, canceledMessages: 2 },
        }),
      );
      const result = await client.agentNetwork.cancelAgentConversation(
        'hol_agt_tok',
        CONVERSATION_ID,
      );
      expect(result.canceledMessages).toBe(2);
      expect(lastRequest().url).toBe(
        `https://broker.test/api/v1/agent-conversations/${CONVERSATION_ID}/cancel`,
      );
    });
  });

  describe('parsing', () => {
    it('throws RegistryBrokerParseError on malformed responses', async () => {
      fetchImplementation.mockResolvedValueOnce(
        createResponse({ body: { unexpected: true } }),
      );
      await expect(client.agentNetwork.listRuntimes()).rejects.toBeInstanceOf(
        RegistryBrokerParseError,
      );
    });

    it('schema module exports discriminate states', () => {
      expect(
        agentRequestStateRoundTrip('awaiting_consent'),
      ).toBe('awaiting_consent');
      expect(agentRuntimeViewSchema.safeParse(runtimeView).success).toBe(true);
      expect(
        agentRuntimeViewSchema.safeParse({ ...runtimeView, paused: 'yes' })
          .success,
      ).toBe(false);
      expect(agentMessageViewSchema.safeParse(messageView()).success).toBe(
        true,
      );
    });
  });

  describe('waitForAgentReply', () => {
    it('returns the response message once the request completes', async () => {
      fetchImplementation
        .mockResolvedValueOnce(
          createResponse({ body: messageView({ requestState: 'queued' }) }),
        )
        .mockResolvedValueOnce(
          createResponse({
            body: messageView({ requestState: 'completed' }),
          }),
        )
        .mockResolvedValueOnce(
          createResponse({
            body: {
              conversationId: CONVERSATION_ID,
              state: 'active',
              participants: [{ uaid: 'uaid:aid:sender' }],
              messages: [
                messageView(),
                messageView({
                  messageId: '55555555-5555-4555-8555-555555555555',
                  kind: 'response',
                  inReplyTo: MESSAGE_ID,
                  content: { type: 'text', text: '95 nonce-123' },
                }),
              ],
              nextCursor: null,
            },
          }),
        );
      const reply = await client.agentNetwork.waitForAgentReply(
        'hol_agt_tok',
        MESSAGE_ID,
        { timeoutMs: 5_000, pollIntervalMs: 250 },
      );
      expect(reply?.content.text).toBe('95 nonce-123');
      expect(captured.filter((r) => r.url.includes('/agent-messages/')).length)
        .toBeGreaterThanOrEqual(2);
    });

    it('returns null on terminal non-completed states', async () => {
      fetchImplementation.mockResolvedValueOnce(
        createResponse({ body: messageView({ requestState: 'rejected' }) }),
      );
      const reply = await client.agentNetwork.waitForAgentReply(
        'hol_agt_tok',
        MESSAGE_ID,
        { timeoutMs: 5_000 },
      );
      expect(reply).toBeNull();
    });
  });
});

import { agentRequestStateSchema } from '../../src/services/registry-broker/client';
function agentRequestStateRoundTrip(state: string): string {
  return agentRequestStateSchema.parse(state);
}
