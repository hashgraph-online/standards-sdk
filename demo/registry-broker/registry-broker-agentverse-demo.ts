#!/usr/bin/env node
import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import {
  RegistryBrokerClient,
  type SendMessageResponse,
  type ChatHistoryEntry,
} from '../../src/services/registry-broker';
import {
  startLocalA2AAgent,
  type LocalA2AAgentHandle,
} from '../utils/local-a2a-agent';
import { HCS14Client } from '../../src/hcs-14/sdk';
import fetch from 'node-fetch';

const log = (msg: string) => console.log(msg);
const section = (title: string) => log(`\n=== ${title} ===`);

const truncate = (value: string, max = 140) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

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

async function run(): Promise<void> {
  const brokerBase =
    process.env.REGISTRY_BROKER_BASE_URL?.trim() ||
    process.env.BROKER_URL?.trim() ||
    'http://localhost:4000/api/v1';
  const client = new RegistryBrokerClient({ baseUrl: brokerBase });

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
  const local: LocalA2AAgentHandle = await startLocalA2AAgent({
    agentId: `sdk-agentverse-demo-${Date.now()}`,
  });
  log(`  Local agent started on ${local.localA2aEndpoint}`);
  if (local.publicUrl) {
    log(`  Public tunnel: ${local.publicUrl}`);
  }

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

      if (local.publicUrl) {
        const agentEndpoint = local.publicUrl;
        const localReply: SendMessageResponse = await client.chat.sendMessage({
          agentUrl: agentEndpoint,
          sessionId,
          message: avReply.message || defaultIntro,
        });
        log(`  Local A2A replied: ${truncate(localReply.message)}`);
        describeHistory(localReply.history);
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
