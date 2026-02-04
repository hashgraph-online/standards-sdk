import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger } from '../../src/utils/logger';

const DEFAULT_API_URL = 'https://registry-staging.hol.org/api/v1';

const logger = new Logger({
  module: 'demo/registry-broker/openclaw-xmtp-proxy',
});

type XmtpRoundtripResult = {
  sessionId: string;
  publicUrlCandidates?: string[];
};

const resolveCli = (): { cliPath: string; cliCwd: string } => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '../../..');
  const cliCwd = path.join(repoRoot, 'registry-broker-hashnet-openclaw');
  const cliPath = path.join(cliCwd, 'bin', 'cli.js');

  if (!existsSync(cliPath)) {
    throw new Error(
      `OpenClaw CLI not found at ${cliPath}. Run this demo from the hashgraph-online repo root.`,
    );
  }

  return { cliPath, cliCwd };
};

const parseCliJson = (stdout: string): XmtpRoundtripResult => {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('OpenClaw CLI returned empty output (expected JSON).');
  }

  try {
    return JSON.parse(trimmed) as XmtpRoundtripResult;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      return JSON.parse(slice) as XmtpRoundtripResult;
    }
    throw new Error('OpenClaw CLI returned non-JSON output.');
  }
};

const fetchJson = async <T>(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; ok: boolean; json: T | null; text: string }> => {
  const res = await fetch(url, init);
  const text = await res.text();
  const json = (() => {
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  })();
  return { status: res.status, ok: res.ok, json, text };
};

const findFirstReachableUrl = async (candidates: string[]): Promise<string> => {
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { method: 'GET' });
      if (res.ok) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  throw new Error(
    `No public URL candidates were reachable: ${candidates.join(', ')}`,
  );
};

const run = async (): Promise<void> => {
  const args = process.argv.slice(2);

  const fromUaid = (process.env.DEMO_XMTP_FROM_UAID ?? args[0] ?? '').trim();
  const toUaid = (process.env.DEMO_XMTP_TO_UAID ?? args[1] ?? '').trim();

  if (!fromUaid || !toUaid) {
    throw new Error(
      'Missing UAIDs. Provide DEMO_XMTP_FROM_UAID and DEMO_XMTP_TO_UAID (or pass <fromUaid> <toUaid> as args).',
    );
  }

  const rawApiUrl = (
    process.env.REGISTRY_BROKER_API_URL ??
    process.env.REGISTRY_BROKER_BASE_URL ??
    ''
  ).trim();
  const apiUrl =
    rawApiUrl.includes('/registry/api/v1') ||
    rawApiUrl.includes('registry-staging.hol.org/api/v1')
      ? rawApiUrl
      : DEFAULT_API_URL;

  const title =
    process.env.DEMO_PUBLIC_CHAT_TITLE?.trim() ||
    'OpenClaw XMTP Proxy Demo (standards-sdk)';
  const tags =
    process.env.DEMO_PUBLIC_CHAT_TAGS?.trim() ||
    'openclaw,xmtp-proxy,standards-sdk,demo';
  const categories =
    process.env.DEMO_PUBLIC_CHAT_CATEGORIES?.trim() || 'messaging,chat,proxy';

  const message = `Ping from standards-sdk demo (${new Date().toISOString()})`;

  const { cliPath, cliCwd } = resolveCli();

  logger.info('Starting OpenClaw XMTP proxy roundtrip', {
    apiUrl,
    fromUaid,
    toUaid,
  });

  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      'xmtp-roundtrip',
      fromUaid,
      toUaid,
      message,
      '--title',
      title,
      '--tags',
      tags,
      '--categories',
      categories,
      '--json',
    ],
    {
      cwd: cliCwd,
      env: { ...process.env, REGISTRY_BROKER_API_URL: apiUrl },
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `OpenClaw CLI failed (exit ${result.status}): ${result.stderr || result.stdout}`,
    );
  }

  const cliJson = parseCliJson(result.stdout);

  if (!cliJson.sessionId) {
    throw new Error('OpenClaw CLI JSON did not include a sessionId.');
  }

  const sessionId = cliJson.sessionId;
  const publicUrlCandidates = Array.isArray(cliJson.publicUrlCandidates)
    ? cliJson.publicUrlCandidates.filter(value => typeof value === 'string')
    : [];

  logger.info('Roundtrip completed; verifying broker session', { sessionId });

  const meta = await fetchJson<{
    sessionId?: string;
    visibility?: string;
  }>(`${apiUrl}/chat/session/${encodeURIComponent(sessionId)}/meta`);

  if (!meta.ok || !meta.json) {
    throw new Error(
      `Failed to fetch session meta (HTTP ${meta.status}). Body: ${meta.text.slice(0, 500)}`,
    );
  }

  if (meta.json.visibility !== 'public') {
    throw new Error(
      `Expected session visibility "public", got "${meta.json.visibility ?? 'unknown'}".`,
    );
  }

  const history = await fetchJson<{
    history?: Array<{ content?: string }>;
    historyTtlSeconds?: number;
  }>(`${apiUrl}/chat/session/${encodeURIComponent(sessionId)}/history`);

  if (!history.ok || !history.json) {
    throw new Error(
      `Failed to fetch session history (HTTP ${history.status}). Body: ${history.text.slice(0, 500)}`,
    );
  }

  const contents = (history.json.history ?? [])
    .map(entry => entry.content ?? '')
    .filter(content => content.length > 0);

  if (history.json.historyTtlSeconds !== 604800) {
    throw new Error(
      `Expected historyTtlSeconds=604800 (7 days), got ${String(history.json.historyTtlSeconds)}.`,
    );
  }

  if (!contents.some(content => content.includes(message))) {
    throw new Error(
      'Expected the ingested ping message to appear in broker history, but it was not found.',
    );
  }

  if (publicUrlCandidates.length === 0) {
    throw new Error('OpenClaw CLI did not return any public URL candidates.');
  }

  const publicUrl = await findFirstReachableUrl(publicUrlCandidates);
  const publicPage = await fetch(publicUrl, { method: 'GET' });
  const publicHtml = await publicPage.text();

  if (!publicPage.ok) {
    throw new Error(
      `Public chat page fetch failed (HTTP ${publicPage.status}).`,
    );
  }

  if (!publicHtml.toLowerCase().includes('public chat')) {
    throw new Error(
      'Public chat page rendered, but did not look like a public chat page (missing expected page title).',
    );
  }

  logger.info('XMTP proxy demo verified end-to-end', { sessionId, publicUrl });
};

run().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('Demo failed', { error: message });
  process.exit(1);
});
