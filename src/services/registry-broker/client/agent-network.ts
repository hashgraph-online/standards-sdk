/**
 * Agent-network client surface — typed methods over the registry-broker
 * /api/v1/agent-* routes. Two auth planes:
 *
 *  - Owner plane uses the client's configured credentials (x-api-key).
 *  - Bot plane takes a `hol_agt_…` grant bearer token per call; the token is
 *    passed as Authorization and never persisted by the client.
 *
 * Every response is parsed with the schemas below so pending/terminal
 * discriminated states survive to callers. Idempotency keys, lease versions
 * (fencing tokens), and cancellation ids are passed through unchanged.
 */
import { z } from 'zod';
import type { RegistryBrokerClient } from './base-client';
import { RegistryBrokerParseError } from './errors';
import type { JsonValue } from '../types';

// ---------------------------------------------------------------------------
// Schemas (mirror broker contract)
// ---------------------------------------------------------------------------

export const agentNetworkProviderSchema = z.enum([
  'openclaw',
  'grok',
  'dot',
  'muse',
  'api',
  'other',
]);
export type AgentNetworkProvider = z.infer<typeof agentNetworkProviderSchema>;

export const agentConnectionStateSchema = z.enum([
  'unavailable',
  'pending_pairing',
  'interactive_verified',
  'polling_verified',
  'push_verified',
  'needs_reconnect',
  'paused',
  'degraded',
]);

export const agentRegistrationStateSchema = z.enum([
  'unregistered',
  'quote_issued',
  'pending',
  'registered',
  'failed',
]);

/**
 * The registration *result* enum is distinct from the persisted lifecycle
 * state — a register call resolves to one of these, including `linked` for
 * owners attaching an existing UAID.
 */
export const agentRegistrationResultStateSchema = z.enum([
  'registered',
  'pending',
  'linked',
  'unregistered',
]);

export const agentReceiveModeSchema = z.enum(['none', 'poll', 'push']);

export const agentRequestStateSchema = z.enum([
  'accepted',
  'awaiting_consent',
  'queued',
  'processing',
  'completed',
  'rejected',
  'failed',
  'expired',
  'canceled',
]);
export type AgentRequestState = z.infer<typeof agentRequestStateSchema>;

export const agentDeliveryStateSchema = z.enum([
  'pending',
  'notifying',
  'provider_accepted',
  'acknowledged',
  'retry_scheduled',
  'permanently_failed',
]);
export type AgentDeliveryState = z.infer<typeof agentDeliveryStateSchema>;

export const agentMessageKindSchema = z.enum(['request', 'response', 'event']);
export type AgentMessageKind = z.infer<typeof agentMessageKindSchema>;

const isoDate = z.string();

export const agentRuntimeViewSchema = z.object({
  runtimeId: z.string().uuid(),
  uaid: z.string().nullable(),
  ownerType: z.string(),
  ownerId: z.string(),
  declaredProvider: agentNetworkProviderSchema,
  connectionState: agentConnectionStateSchema,
  registrationState: agentRegistrationStateSchema,
  registrationAttemptId: z.string().nullable(),
  receiveMode: agentReceiveModeSchema,
  gatewayUrl: z.string().nullable(),
  paused: z.boolean(),
  allowedPeerUaids: z.array(z.string()).nullable(),
  capabilities: z.array(z.string()),
  lastActivityAt: isoDate.nullable(),
  createdAt: isoDate,
});
export type AgentRuntimeView = z.infer<typeof agentRuntimeViewSchema>;

export const agentRuntimeQuoteSchema = z.object({
  quoteId: z.string(),
  expiresAt: isoDate,
  registrationFeeCredits: z.number().nullable(),
  gatewayUrl: z.string(),
});
export type AgentRuntimeQuote = z.infer<typeof agentRuntimeQuoteSchema>;

export const agentPairingStartSchema = z.object({
  grantId: z.string().uuid(),
  pairingCode: z.string(),
  expiresAt: isoDate,
});
export type AgentPairingStart = z.infer<typeof agentPairingStartSchema>;

export const agentPairingCompleteSchema = z.object({
  grantId: z.string().uuid(),
  runtimeId: z.string().uuid(),
  token: z.string(),
  scopes: z.array(z.string()),
});
export type AgentPairingComplete = z.infer<typeof agentPairingCompleteSchema>;

export const agentMessageViewSchema = z.object({
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
  schemaVersion: z.literal('hol-agent-message/1'),
  kind: agentMessageKindSchema,
  senderUaid: z.string(),
  recipientUaid: z.string(),
  inReplyTo: z.string().uuid().nullable(),
  content: z.object({ type: z.literal('text'), text: z.string() }),
  requestState: agentRequestStateSchema,
  createdAt: isoDate,
  expiresAt: isoDate,
  traceId: z.string(),
});
export type AgentMessageView = z.infer<typeof agentMessageViewSchema>;

export const agentMessageAcceptedSchema = z.object({
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
  requestState: agentRequestStateSchema,
  createdAt: isoDate,
  expiresAt: isoDate,
  deduplicated: z.boolean(),
});
export type AgentMessageAccepted = z.infer<typeof agentMessageAcceptedSchema>;

export const agentLeaseViewSchema = z.object({
  leaseId: z.string().uuid(),
  messageId: z.string().uuid(),
  fencingToken: z.number().int(),
  expiresAt: isoDate,
});
export type AgentLeaseView = z.infer<typeof agentLeaseViewSchema>;

export const agentClaimedMessageSchema = z.object({
  message: agentMessageViewSchema,
  lease: agentLeaseViewSchema,
});
export type AgentClaimedMessage = z.infer<typeof agentClaimedMessageSchema>;

export const agentInboxItemSchema = z.object({
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
  kind: agentMessageKindSchema,
  senderUaid: z.string(),
  content: z.object({ type: z.literal('text'), text: z.string() }),
  requestState: agentRequestStateSchema,
  deliveryState: agentDeliveryStateSchema,
  acknowledged: z.boolean(),
  leaseId: z.string().uuid().nullable(),
  fencingToken: z.number().int().nullable(),
  createdAt: isoDate,
  expiresAt: isoDate,
});
export type AgentInboxItem = z.infer<typeof agentInboxItemSchema>;

export const agentInboxListSchema = z.object({
  items: z.array(agentInboxItemSchema),
  nextCursor: z.string().nullable(),
});
export type AgentInboxList = z.infer<typeof agentInboxListSchema>;

export const agentConversationViewSchema = z.object({
  conversationId: z.string().uuid(),
  state: z.enum(['active', 'canceled', 'expired']),
  participants: z.array(z.object({ uaid: z.string() })),
  messages: z.array(agentMessageViewSchema),
  nextCursor: z.string().nullable(),
});
export type AgentConversationView = z.infer<typeof agentConversationViewSchema>;

export const agentReplyResultSchema = z.object({
  request: agentMessageViewSchema,
  response: agentMessageViewSchema,
});
export type AgentReplyResult = z.infer<typeof agentReplyResultSchema>;

export const agentRuntimeRegistrationResultSchema = z.object({
  runtime: agentRuntimeViewSchema,
  registration: agentRegistrationResultStateSchema,
});
export type AgentRuntimeRegistrationResult = z.infer<
  typeof agentRuntimeRegistrationResultSchema
>;

export const agentProbeResultSchema = z.object({
  nonce: z.string(),
  issuedAt: isoDate,
});

export const agentSubscriptionEventTypeSchema = z.enum([
  'notify_request',
  'notify_event',
  'notify_response',
]);
export type AgentSubscriptionEventType = z.infer<
  typeof agentSubscriptionEventTypeSchema
>;

export const agentSubscriptionViewSchema = z.object({
  subscriptionId: z.string().uuid(),
  runtimeId: z.string().uuid(),
  eventType: agentSubscriptionEventTypeSchema,
  callbackUrl: z.string().nullable(),
  state: z.string(),
  expiresAt: isoDate.nullable(),
  createdAt: isoDate,
});
export type AgentSubscriptionView = z.infer<typeof agentSubscriptionViewSchema>;

export const agentSubscriptionListSchema = z.object({
  subscriptions: z.array(agentSubscriptionViewSchema),
});

export const agentSubscriptionCreatedSchema = z.object({
  subscription: agentSubscriptionViewSchema,
});

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface RegisterAgentRuntimeInput {
  displayName: string;
  declaredProvider: AgentNetworkProvider;
  description?: string;
  capabilities?: string[];
  linkExistingUaid?: string;
  preferredReceiveMode?: 'poll' | 'push';
}

export interface UpdateAgentRuntimePolicyInput {
  paused?: boolean;
  allowedPeerUaids?: string[];
  maxOutboundPerMinute?: number;
  maxPendingMessages?: number;
  receiveMode?: 'poll' | 'push';
}

export interface SendAgentMessageInput {
  recipientUaid: string;
  conversationId?: string;
  kind: 'request' | 'event';
  content: { type: 'text'; text: string };
  expiresInSeconds?: number;
  /** Caller-generated dedupe key — passed through unchanged. */
  idempotencyKey: string;
}

export interface AgentLeaseRef {
  leaseId: string;
  fencingToken: number;
}

export interface ReplyToAgentMessageInput extends AgentLeaseRef {
  content: { type: 'text'; text: string };
  idempotencyKey: string;
  outcome?: 'answered' | 'partial' | 'refused';
}

export interface AgentInboxQuery {
  cursor?: string;
  limit?: number;
  includeAcknowledged?: boolean;
}

export interface CreateAgentSubscriptionInput {
  eventType?: AgentSubscriptionEventType;
  /** Public HTTPS webhook target — validated for safety server-side. */
  callbackUrl: string;
  signingSecret?: string;
  expiresAt?: string;
}

export interface WaitForAgentReplyOptions {
  /** Absolute bound — never resends the request. Default 60s. */
  timeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('waitForReply aborted'));
      },
      { once: true },
    );
  });

export interface RegistryBrokerAgentNetworkApi {
  // --- owner plane (client credentials) ---
  quoteRuntime(): Promise<AgentRuntimeQuote>;
  registerRuntime(
    input: RegisterAgentRuntimeInput,
  ): Promise<AgentRuntimeRegistrationResult>;
  listRuntimes(): Promise<AgentRuntimeView[]>;
  updateRuntimePolicy(
    runtimeId: string,
    input: UpdateAgentRuntimePolicyInput,
  ): Promise<AgentRuntimeView>;
  probeRuntime(runtimeId: string): Promise<{ nonce: string; issuedAt: string }>;
  startAgentConnection(runtimeId: string): Promise<AgentPairingStart>;
  completeAgentPairing(pairingCode: string): Promise<AgentPairingComplete>;
  revokeAgentConnection(grantId: string): Promise<void>;
  /** Owner-scoped inbox read — no bot grant token required. */
  listRuntimeInbox(
    runtimeId: string,
    query?: AgentInboxQuery,
  ): Promise<AgentInboxList>;
  /** Owner-scoped conversation read scoped to an owned runtime. */
  getRuntimeConversation(
    runtimeId: string,
    conversationId: string,
    query?: { cursor?: string; limit?: number },
  ): Promise<AgentConversationView>;
  createAgentSubscription(
    runtimeId: string,
    input: CreateAgentSubscriptionInput,
  ): Promise<AgentSubscriptionView>;
  listAgentSubscriptions(
    runtimeId: string,
  ): Promise<AgentSubscriptionView[]>;
  revokeAgentSubscription(
    runtimeId: string,
    subscriptionId: string,
  ): Promise<void>;

  // --- bot plane (grant bearer token) ---
  agentMe(token: string): Promise<AgentRuntimeView>;
  sendAgentMessage(
    token: string,
    input: SendAgentMessageInput,
  ): Promise<AgentMessageAccepted>;
  getAgentMessage(token: string, messageId: string): Promise<AgentMessageView>;
  getAgentConversation(
    token: string,
    conversationId: string,
    query?: { cursor?: string; limit?: number },
  ): Promise<AgentConversationView>;
  listAgentInbox(
    token: string,
    query?: AgentInboxQuery,
  ): Promise<AgentInboxList>;
  claimAgentMessage(token: string): Promise<AgentClaimedMessage | null>;
  acknowledgeAgentMessage(
    token: string,
    messageId: string,
    lease: AgentLeaseRef,
  ): Promise<AgentMessageView>;
  renewAgentMessageLease(
    token: string,
    messageId: string,
    lease: AgentLeaseRef & { extendSeconds?: number },
  ): Promise<AgentLeaseView>;
  replyToAgentMessage(
    token: string,
    messageId: string,
    input: ReplyToAgentMessageInput,
  ): Promise<AgentReplyResult>;
  rejectAgentMessage(
    token: string,
    messageId: string,
    lease: AgentLeaseRef & { reason?: string },
  ): Promise<AgentMessageView>;
  cancelAgentConversation(
    token: string,
    conversationId: string,
  ): Promise<{ conversationId: string; canceledMessages: number }>;
  /**
   * Bounded wait for a reply — polls status without resending. Returns the
   * response message when the request completes, null on timeout.
   */
  waitForAgentReply(
    token: string,
    messageId: string,
    options?: WaitForAgentReplyOptions,
  ): Promise<AgentMessageView | null>;
}

const bearerHeaders = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
});

const encodePath = (value: string): string => encodeURIComponent(value);

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) {
      query.set(k, String(v));
    }
  }
  const s = query.toString();
  return s ? `?${s}` : '';
};

export function createAgentNetworkApi(
  client: RegistryBrokerClient,
): RegistryBrokerAgentNetworkApi {
  const json = async <S extends z.ZodTypeAny>(
    path: string,
    schema: S,
    init: { method?: string; body?: unknown; token?: string },
  ): Promise<z.infer<S>> => {
    const raw = await client.requestJson<JsonValue>(`${path}`, {
      method: init.method ?? 'GET',
      body: init.body as JsonValue,
      headers: init.token ? bearerHeaders(init.token) : undefined,
    });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new RegistryBrokerParseError(
        'Unexpected agent-network response shape',
        JSON.stringify(raw).slice(0, 500),
      );
    }
    return parsed.data;
  };

  const bot204 = async (path: string, token: string, body?: unknown) => {
    const response = await client.request(`${path}`, {
      method: 'POST',
      body,
      headers: bearerHeaders(token),
    });
    return response.status === 204 ? null : response.json();
  };

  return {
    quoteRuntime: () =>
      json('/agent-runtimes/quote', agentRuntimeQuoteSchema, {
        method: 'POST',
      }),

    registerRuntime: (input) =>
      json('/agent-runtimes/register', agentRuntimeRegistrationResultSchema, {
        method: 'POST',
        body: input,
      }),

    listRuntimes: async () => {
      const raw = await client.requestJson<JsonValue>('/agent-runtimes', {});
      const parsed = z
        .object({ runtimes: z.array(agentRuntimeViewSchema) })
        .safeParse(raw);
      if (!parsed.success) {
        throw new RegistryBrokerParseError(
          'Unexpected runtime list shape',
          JSON.stringify(raw).slice(0, 500),
        );
      }
      return parsed.data.runtimes;
    },

    updateRuntimePolicy: (runtimeId, input) =>
      json(
        `/agent-runtimes/${encodePath(runtimeId)}`,
        agentRuntimeViewSchema,
        { method: 'PATCH', body: input },
      ),

    probeRuntime: async (runtimeId) =>
      (await json(
        `/agent-runtimes/${encodePath(runtimeId)}/probe`,
        agentProbeResultSchema,
        { method: 'POST' },
      )) as { nonce: string; issuedAt: string },

    startAgentConnection: (runtimeId) =>
      json('/agent-connections', agentPairingStartSchema, {
        method: 'POST',
        body: { runtimeId },
      }),

    completeAgentPairing: (pairingCode) =>
      json('/agent-connections/pair', agentPairingCompleteSchema, {
        method: 'POST',
        body: { pairingCode },
      }),

    revokeAgentConnection: async (grantId) => {
      await client.request(`/agent-connections/${encodePath(grantId)}`, {
        method: 'DELETE',
      });
    },

    listRuntimeInbox: (runtimeId, query) =>
      json(
        `/agent-runtimes/${encodePath(runtimeId)}/inbox${qs({
          cursor: query?.cursor,
          limit: query?.limit,
          includeAcknowledged: query?.includeAcknowledged,
        })}`,
        agentInboxListSchema,
        {},
      ),

    getRuntimeConversation: (runtimeId, conversationId, query) =>
      json(
        `/agent-runtimes/${encodePath(runtimeId)}/conversations/${encodePath(
          conversationId,
        )}${qs({ cursor: query?.cursor, limit: query?.limit })}`,
        agentConversationViewSchema,
        {},
      ),

    createAgentSubscription: async (runtimeId, input) =>
      (
        await json(
          `/agent-runtimes/${encodePath(runtimeId)}/subscriptions`,
          agentSubscriptionCreatedSchema,
          { method: 'POST', body: input },
        )
      ).subscription,

    listAgentSubscriptions: async (runtimeId) =>
      (
        await json(
          `/agent-runtimes/${encodePath(runtimeId)}/subscriptions`,
          agentSubscriptionListSchema,
          {},
        )
      ).subscriptions,

    revokeAgentSubscription: async (runtimeId, subscriptionId) => {
      await client.request(
        `/agent-runtimes/${encodePath(runtimeId)}/subscriptions/${encodePath(
          subscriptionId,
        )}`,
        { method: 'DELETE' },
      );
    },

    agentMe: async (token) => {
      const raw = await client.requestJson<JsonValue>(
        '/agent-runtimes/me',
        { headers: bearerHeaders(token) },
      );
      const parsed = z
        .object({ runtime: agentRuntimeViewSchema })
        .safeParse(raw);
      if (!parsed.success) {
        throw new RegistryBrokerParseError(
          'Unexpected agent-runtimes/me shape',
          JSON.stringify(raw).slice(0, 500),
        );
      }
      return parsed.data.runtime;
    },

    sendAgentMessage: (token, input) =>
      json('/agent-messages', agentMessageAcceptedSchema, {
        method: 'POST',
        body: input,
        token,
      }),

    getAgentMessage: (token, messageId) =>
      json(
        `/agent-messages/${encodePath(messageId)}`,
        agentMessageViewSchema,
        { token },
      ),

    getAgentConversation: (token, conversationId, query) =>
      json(
        `/agent-conversations/${encodePath(conversationId)}${qs({
          cursor: query?.cursor,
          limit: query?.limit,
        })}`,
        agentConversationViewSchema,
        { token },
      ),

    listAgentInbox: (token, query) =>
      json(
        `/agent-inbox${qs({
          cursor: query?.cursor,
          limit: query?.limit,
          includeAcknowledged: query?.includeAcknowledged,
        })}`,
        agentInboxListSchema,
        { token },
      ),

    claimAgentMessage: async (token) => {
      const raw = await bot204('/agent-inbox/leases', token, {});
      if (raw === null) {
        return null;
      }
      const parsed = agentClaimedMessageSchema.safeParse(raw);
      if (!parsed.success) {
        throw new RegistryBrokerParseError(
          'Unexpected claim response shape',
          JSON.stringify(raw).slice(0, 500),
        );
      }
      return parsed.data;
    },

    acknowledgeAgentMessage: (token, messageId, lease) =>
      json(
        `/agent-inbox/${encodePath(messageId)}/ack`,
        agentMessageViewSchema,
        { method: 'POST', body: lease, token },
      ),

    renewAgentMessageLease: (token, messageId, input) =>
      json(
        `/agent-inbox/${encodePath(messageId)}/lease/renew`,
        agentLeaseViewSchema,
        { method: 'POST', body: input, token },
      ),

    replyToAgentMessage: (token, messageId, input) =>
      json(
        `/agent-messages/${encodePath(messageId)}/reply`,
        agentReplyResultSchema,
        { method: 'POST', body: input, token },
      ),

    rejectAgentMessage: (token, messageId, input) =>
      json(
        `/agent-messages/${encodePath(messageId)}/reject`,
        agentMessageViewSchema,
        { method: 'POST', body: input, token },
      ),

    cancelAgentConversation: async (token, conversationId) => {
      const raw = await client.requestJson<JsonValue>(
        `/agent-conversations/${encodePath(conversationId)}/cancel`,
        { method: 'POST', body: {}, headers: bearerHeaders(token) },
      );
      const parsed = z
        .object({
          conversationId: z.string().uuid(),
          canceledMessages: z.number(),
        })
        .safeParse(raw);
      if (!parsed.success) {
        throw new RegistryBrokerParseError(
          'Unexpected cancel response shape',
          JSON.stringify(raw).slice(0, 500),
        );
      }
      return parsed.data as {
        conversationId: string;
        canceledMessages: number;
      };
    },

    waitForAgentReply: async (token, messageId, options) => {
      const timeoutMs = options?.timeoutMs ?? 60_000;
      const interval = Math.max(250, options?.pollIntervalMs ?? 2_000);
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const message = await json(
          `/agent-messages/${encodePath(messageId)}`,
          agentMessageViewSchema,
          { token },
        );
        if (message.requestState === 'completed') {
          const conversation = await json(
            `/agent-conversations/${encodePath(message.conversationId)}`,
            agentConversationViewSchema,
            { token },
          );
          return (
            conversation.messages.find(
              (m) => m.inReplyTo === messageId && m.kind === 'response',
            ) ?? null
          );
        }
        if (
          message.requestState === 'rejected' ||
          message.requestState === 'failed' ||
          message.requestState === 'expired' ||
          message.requestState === 'canceled'
        ) {
          return null;
        }
        await sleep(Math.min(interval, deadline - Date.now()), options?.signal);
      }
      return null;
    },
  };
}
