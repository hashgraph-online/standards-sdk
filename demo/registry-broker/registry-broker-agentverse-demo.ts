#!/usr/bin/env node
import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  type SendMessageResponse,
  type ChatHistoryEntry,
  type AgentRegistrationRequest,
  type RegisterAgentResponse,
} from '../../src/services/registry-broker';
import {
  startLocalA2AAgent,
  type LocalA2AAgentHandle,
} from '../utils/local-a2a-agent';
import { HCS14Client } from '../../src/hcs-14/sdk';
import {
  type HCS11Profile,
  ProfileType,
  AIAgentType,
  AIAgentCapability,
} from '../../src/hcs-11/types';
import { waitForAgentAvailability } from '../utils/registry-broker';
import fetch from 'node-fetch';
import {
  authenticateWithDemoLedger,
  type HederaLedgerAuthResult,
} from '../utils/registry-auth';

const log = (msg: string) => console.log(msg);
const section = (title: string) => log(`\n=== ${title} ===`);

const truncate = (value: string, max = 140) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

const describeError = (error: unknown): string => {
  if (error instanceof RegistryBrokerError) {
    const body =
      typeof error.body === 'string'
        ? error.body
        : error.body && typeof error.body === 'object'
          ? JSON.stringify(error.body)
          : 'Unknown error';
    return `Registry broker error ${error.status} (${error.statusText}): ${body}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const describeHistory = (history?: ChatHistoryEntry[]) => {
  if (!history) {
    log('  History: (not provided)');
    return;
  }
  log(`  History: ${history.length} entr${history.length === 1 ? 'y' : 'ies'}`);
  history.forEach((entry, i) =>
    log(
      `    ${i + 1}. [${entry.role}] ${new Date(entry.timestamp).toISOString()} :: ${truncate(
        entry.content,
      )}`,
    ),
  );
};

const extractCreditShortfall = (
  error: unknown,
): { shortfallCredits: number; creditsPerHbar: number } | null => {
  if (error instanceof RegistryBrokerError && error.status === 402) {
    const body = error.body;
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      const shortfall = Number(record.shortfallCredits);
      const perHbar = Number(record.creditsPerHbar);
      if (
        Number.isFinite(shortfall) &&
        Number.isFinite(perHbar) &&
        shortfall > 0 &&
        perHbar > 0
      ) {
        return { shortfallCredits: shortfall, creditsPerHbar: perHbar };
      }
    }
  }
  return null;
};

const hasHederaLedgerAuth = (
  value: unknown,
): value is HederaLedgerAuthResult => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.accountId === 'string' &&
    typeof record.privateKey === 'string' &&
    record.privateKey.length > 0
  );
};

const registerLocalA2aAgent = async (
  client: RegistryBrokerClient,
  local: LocalA2AAgentHandle,
): Promise<string> => {
  const publicBase =
    (local.publicUrl && local.publicUrl.replace(/\/$/, '')) || null;
  const localBase = local.baseUrl.replace(/\/$/, '');
  const reachableBase = publicBase ?? localBase;
  if (!reachableBase) {
    throw new Error('Local A2A agent is missing a reachable base URL');
  }

  const profile: HCS11Profile = {
    version: '1.0',
    type: ProfileType.AI_AGENT,
    display_name: `AgentVerse Local Bridge (${local.agentId})`,
    alias: local.agentId,
    bio: 'Local A2A bridge agent used by the registry-broker AgentVerse demo.',
    properties: {
      tags: ['demo', 'agentverse', 'a2a'],
    },
    socials: [],
    aiAgent: {
      type: AIAgentType.MANUAL,
      model: 'agentverse-local-bridge',
      capabilities: [AIAgentCapability.TEXT_GENERATION],
      creator: 'standards-sdk demo',
    },
  };

  const payload: AgentRegistrationRequest = {
    profile,
    protocol: 'a2a',
    communicationProtocol: 'a2a',
    registry: 'hashgraph-online',
    endpoint: `${reachableBase}/.well-known/agent.json`,
    metadata: {
      adapter: 'nanda-adapter',
      source: 'agentverse-demo',
      tunnelUrl: local.publicUrl,
      localEndpoint: local.localA2aEndpoint,
      nativeId: local.agentId,
    },
  };

  const response: RegisterAgentResponse = await client.registerAgent(payload);
  const attemptId = response.attemptId?.trim();
  if (attemptId) {
    await client.waitForRegistrationCompletion(attemptId, {
      intervalMs: 1_000,
      timeoutMs: 60_000,
      throwOnFailure: false,
    });
  }

  const uaid = response.uaid?.trim();
  if (!uaid) {
    throw new Error('Local A2A agent registration did not return a UAID');
  }

  await waitForAgentAvailability(client, uaid, 60_000);
  return uaid;
};

async function run(): Promise<void> {
  const brokerBase =
    process.env.REGISTRY_BROKER_BASE_URL?.trim() ||
    'https://hol.org/registry/api/v1';
  const client = new RegistryBrokerClient({ baseUrl: brokerBase });
  const registrationClient = new RegistryBrokerClient({ baseUrl: brokerBase });

  // Wait for broker to be ready
  const healthUrl = brokerBase.replace(/\/api\/v1\/?$/, '') + '/health';
  const start = Date.now();
  while (Date.now() - start < 60000) {
    try {
      const r = await fetch(healthUrl);
      if (r.ok) break;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }

  const ledgerAuth = await authenticateWithDemoLedger(registrationClient, {
    label: 'agentverse-demo',
    expiresInMinutes: 30,
    setAccountHeader: true,
  });

  const attemptWithCreditTopup = async <T>(
    operation: () => Promise<T>,
    context: string,
  ): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      const shortfall = extractCreditShortfall(error);
      if (!shortfall || !hasHederaLedgerAuth(ledgerAuth)) {
        throw error;
      }
      const hbarAmount = Math.max(
        shortfall.shortfallCredits / shortfall.creditsPerHbar,
        0.25,
      );
      log(
        `  ⚠️  Purchasing ${hbarAmount.toFixed(4)} HBAR credits for ${context}...`,
      );
      await registrationClient.purchaseCreditsWithHbar({
        accountId: ledgerAuth.accountId,
        privateKey: ledgerAuth.privateKey,
        hbarAmount,
        memo: `agentverse-${context}`,
        metadata: { context },
      });
      return operation();
    }
  };

  // Deterministic target: mailbox agent known to support flight tracking prompts.
  // Allow override via env, but default to the working mailbox agent.
  const targetAddress =
    process.env.AGENTVERSE_TARGET_ADDRESS?.trim() ||
    'agent1qvlttvjczdzsrgsu2zza7wl8vus4xjynluu2mfhpf45hsrtk7p4hyzd7ssa';

  const hcs14 = new HCS14Client();

  const buildUaidFromAddress = async (address: string): Promise<string> =>
    hcs14.createUaid(
      {
        registry: 'agentverse',
        name: 'AgentVerse Agent',
        version: '1.0',
        protocol: 'agentverse',
        nativeId: address,
        skills: [],
      },
      {
        uid: 'sdk-demo',
        registry: 'agentverse',
        proto: 'agentverse',
        nativeId: address,
      },
    ) as Promise<string>;

  // Rebuild UAID deterministically via HCS-14; resolve via RegistryBrokerClient
  // to keep the flow explicit and reliable.
  const targetUaid = await buildUaidFromAddress(targetAddress);
  try {
    await client.resolveUaid(targetUaid);
  } catch {
    // Proceed anyway; some deployments may not have indexed the agent yet
  }

  section('Start local A2A agent');
  const explicitPort = process.env.REGISTRY_BROKER_DEMO_A2A_PORT
    ? Number(process.env.REGISTRY_BROKER_DEMO_A2A_PORT)
    : undefined;
  const explicitPublicUrl =
    process.env.REGISTRY_BROKER_DEMO_A2A_PUBLIC_URL?.trim() || undefined;

  const local: LocalA2AAgentHandle = await startLocalA2AAgent({
    agentId: `sdk-agentverse-demo-${Date.now()}`,
    port: Number.isFinite(explicitPort) ? explicitPort : undefined,
    publicUrl: explicitPublicUrl,
  });
  log(`  Local agent started on ${local.localA2aEndpoint}`);
  if (local.publicUrl) {
    log(`  Public tunnel: ${local.publicUrl}`);
  }

  let localUaid: string | null = null;
  try {
    localUaid = await attemptWithCreditTopup(
      () => registerLocalA2aAgent(registrationClient, local),
      'local-a2a-registration',
    );
    log(`  Registered local agent with UAID: ${localUaid}`);
  } catch (error) {
    log(`  Failed to register local A2A agent: ${describeError(error)}`);
  }

  const sendLocalA2aMessage = async (
    endpoint: string,
    messageText: string,
  ): Promise<string> => {
    const body = {
      jsonrpc: '2.0',
      id: `agentverse-local-${Date.now().toString(36)}`,
      method: 'message/send',
      params: {
        message: {
          kind: 'message',
          messageId: `msg-${Date.now().toString(36)}`,
          role: 'user',
          parts: [
            {
              kind: 'text',
              text: messageText,
            },
          ],
        },
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return `Local A2A agent returned non-JSON response (status ${response.status}).`;
    }

    const isRecord = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null && !Array.isArray(value);

    if (!isRecord(payload)) {
      return `Local A2A agent returned unexpected payload: ${JSON.stringify(
        payload,
      )}`;
    }

    const result = payload.result;
    if (!isRecord(result)) {
      return `Local A2A agent response missing result: ${JSON.stringify(
        payload,
      )}`;
    }

    const parts = result.parts;
    if (!Array.isArray(parts) || parts.length === 0) {
      return `Local A2A agent response missing parts: ${JSON.stringify(
        result,
      )}`;
    }

    const first = parts[0];
    if (!isRecord(first) || typeof first.text !== 'string') {
      return `Local A2A agent response missing text part: ${JSON.stringify(
        first,
      )}`;
    }

    const text = first.text.trim();
    return text.length > 0
      ? text
      : `Local A2A agent returned an empty message.`;
  };

  const sessionId = uuidv4();
  const defaultIntro = 'Hello from the SDK demo. Introduce yourself briefly.';

  section('AgentVerse ↔ A2A conversation');
  // Optionally accept an env-provided UAID or list of UAIDs; otherwise use the
  // deterministic mailbox agent UAID.
  const envCandidates = process.env.AGENTVERSE_CANDIDATES?.split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  const avCandidates =
    envCandidates && envCandidates.length > 0 ? envCandidates : [targetUaid];
  let usedAddress: string | null = null;

  const isEmptyMessage = (m?: string) =>
    !m || m.trim() === '' || m.trim() === '{}' || m.trim() === '[]';
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const isEcho = (m: string, inputs: string[]) => {
    const nm = normalize(m);
    return inputs.some(inp => normalize(inp) === nm);
  };

  const decideInitialPrompt = (uaid: string): string => 'Track AA123';

  const waitForNonEmptyHistory = async (
    sid: string,
    sinceCount: number,
    timeoutMs = 120000,
    banned: string[] = [],
    minLen = 20,
  ): Promise<string | null> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const snap = await client.chat.getHistory(sid);
      const entries = snap.history || [];
      const slice = entries.slice(sinceCount);
      const found = slice.find(e => {
        if (e.role !== 'agent') return false;
        if (isEmptyMessage(e.content)) return false;
        if (typeof e.content !== 'string') return false;
        const text = e.content.trim();
        if (text.length < minLen) return false;
        if (isEcho(text, banned)) return false;
        return true;
      });
      if (found) return found.content;
      await new Promise(r => setTimeout(r, 1000));
    }
    return null;
  };

  for (const addressOrUaid of avCandidates) {
    // Accept both raw addresses and UAIDs; if it's not a UAID, build via HCS-14.
    const uaid = addressOrUaid.startsWith('uaid:')
      ? addressOrUaid
      : await buildUaidFromAddress(addressOrUaid);
    log(`  Trying AgentVerse UAID: ${uaid}`);
    try {
      const firstMessage = decideInitialPrompt(uaid);
      const userInputs = [firstMessage];
      let avReply: SendMessageResponse = await client.chat.sendMessage({
        uaid,
        message: firstMessage,
        sessionId,
      });
      if (avReply.error) {
        throw new Error(String(avReply.error));
      }
      // Track the resolved nativeId if available, else keep raw value
      try {
        const parsed = hcs14.parseHcs14Did(uaid);
        usedAddress = (parsed.params?.nativeId as string) || addressOrUaid;
      } catch {
        usedAddress = addressOrUaid;
      }
      // If empty, wait for a non-empty mailbox/event reply in history
      if (
        isEmptyMessage(avReply.message) ||
        isEcho(avReply.message || '', userInputs) ||
        (avReply.message || '').length < 60
      ) {
        const nonEmpty = await waitForNonEmptyHistory(
          sessionId,
          avReply.history?.length || 0,
          30000,
          userInputs,
          60,
        );
        if (nonEmpty) {
          avReply = { ...avReply, message: nonEmpty } as SendMessageResponse;
        } else {
          const hinted = await client.chat.sendMessage({
            uaid,
            sessionId,
            message: 'Track AA123',
          });
          userInputs.push('Track AA123');
          if (
            !hinted.error &&
            (isEmptyMessage(hinted.message) ||
              isEcho(hinted.message || '', userInputs) ||
              (hinted.message || '').length < 60)
          ) {
            const late = await waitForNonEmptyHistory(
              sessionId,
              hinted.history?.length || 0,
              30000,
              userInputs,
              60,
            );
            if (late) {
              avReply = { ...hinted, message: late } as SendMessageResponse;
            } else {
              avReply = hinted;
            }
          } else if (!hinted.error) {
            avReply = hinted;
          }
        }
      }
      log(`  AgentVerse replied: ${truncate(avReply.message)}`);
      describeHistory(avReply.history);

      if (localUaid) {
        const localSession = await client.chat.createSession({
          uaid: localUaid,
        });
        const localResponse = await client.chat.sendMessage({
          sessionId: localSession.sessionId,
          uaid: localUaid,
          message: avReply.message || defaultIntro,
        });
        const localReplyText = localResponse.message || '';
        log(
          `  Local A2A replied via broker: ${truncate(localReplyText || '')}`,
        );
      } else if (local.localA2aEndpoint) {
        const agentEndpoint = local.localA2aEndpoint;
        const localReplyText = await sendLocalA2aMessage(
          agentEndpoint,
          avReply.message || defaultIntro,
        );
        log(`  Local A2A replied (direct): ${truncate(localReplyText)}`);
      }

      const followUp = 'Thanks. Summarize the previous reply in one sentence.';
      let avReply2: SendMessageResponse = await client.chat.sendMessage({
        uaid,
        sessionId,
        message: followUp,
      });
      userInputs.push(followUp);
      if (
        isEmptyMessage(avReply2.message) ||
        isEcho(avReply2.message || '', userInputs) ||
        (avReply2.message || '').length < 60
      ) {
        const nonEmpty2 = await waitForNonEmptyHistory(
          sessionId,
          avReply2.history?.length || 0,
          30000,
          userInputs,
          60,
        );
        if (nonEmpty2) {
          avReply2 = { ...avReply2, message: nonEmpty2 } as SendMessageResponse;
        }
      }
      log(`  AgentVerse follow-up: ${truncate(avReply2.message)}`);
      describeHistory(avReply2.history);
      break;
    } catch (error) {
      log(
        `  AgentVerse candidate failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (!usedAddress) {
    throw new Error('No AgentVerse candidate responded successfully');
  }

  section('Fetch session history snapshot');
  const snapshot = await client.chat.getHistory(sessionId);
  log(`  Session ${sessionId} history TTL: ${snapshot.historyTtlSeconds}s`);
  describeHistory(snapshot.history);

  if (localUaid) {
    section('Local A2A UAID sanity check');
    try {
      const localSession = await client.chat.createSession({
        uaid: localUaid,
      });
      const localResponse = await client.chat.sendMessage({
        sessionId: localSession.sessionId,
        uaid: localUaid,
        message: defaultIntro,
      });
      const localReplyText = localResponse.message || '';
      log(
        `  Local A2A (UAID) replied via broker: ${truncate(
          localReplyText || '',
        )}`,
      );
    } catch (error) {
      log(`  Local A2A UAID sanity check failed: ${describeError(error)}`);
    }
  }

  // Optional late mailbox reply check: some AgentVerse mailbox agents send an
  // empty ack immediately and the real reply a bit later. Wait briefly and
  // fetch history again to surface any late arrivals (useful when the broker's
  // background poller is running).
  try {
    const finalHistory = await (async (): Promise<ChatHistoryEntry[]> => {
      const snapshot2 = await client.chat.getHistory(sessionId);
      const baseline = snapshot2.history ?? [];
      const awaited = await waitForNonEmptyHistory(
        sessionId,
        baseline.length,
        60000,
        userInputs,
        60,
      );
      if (awaited) {
        const refreshed = await client.chat.getHistory(sessionId);
        return refreshed.history ?? [];
      }
      return baseline;
    })();
    section('Late mailbox reply check');
    describeHistory(finalHistory);
  } catch {}

  await local.stop();
}

run().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
