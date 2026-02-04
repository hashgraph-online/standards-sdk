/**
 * Skill Registry publish demo (Registry Broker)
 *
 * Publishes a skill package (SKILL.md + skill.json + optional files) through the
 * Registry Broker skill registry endpoints.
 *
 * Usage:
 *   pnpm -C standards-sdk tsx demo/registry-broker/skill-registry-publish-demo.ts --skill-dir=../skills/openskills-my-first-skill
 *
 * Required environment (one of):
 * - Static API key mode:
 *   - REGISTRY_BROKER_BASE_URL (defaults to http://localhost:4000)
 *   - REGISTRY_BROKER_API_KEY
 *   - REGISTRY_BROKER_ACCOUNT_ID (linked Hedera account id)
 * - Ledger auth mode (fallback when account id not provided):
 *   - HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY (or EVM equivalents per demo utils)
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  type SkillRegistryFileInput,
  type SkillRegistryJobStatusResponse,
} from '../../src/services/registry-broker';
import { authenticateWithDemoLedger } from '../utils/registry-auth';

const DEFAULT_BASE_URL = 'http://localhost:4000';

const resolveArgValue = (prefix: string): string | undefined => {
  const arg = process.argv.find(entry => entry.startsWith(prefix));
  if (!arg) {
    return undefined;
  }
  const value = arg.slice(prefix.length).trim();
  return value.length > 0 ? value : undefined;
};

const resolveSkillDir = (): string => {
  const arg =
    resolveArgValue('--skill-dir=') ??
    resolveArgValue('--dir=') ??
    process.env.SKILL_DIR?.trim();
  return arg && arg.length > 0 ? arg : '../skills/openskills-my-first-skill';
};

const resolveSkillNameOverride = (): string | undefined =>
  resolveArgValue('--name=') ?? (process.env.SKILL_NAME?.trim() || undefined);

const resolveSkillVersionOverride = (): string | undefined =>
  resolveArgValue('--version=') ??
  (process.env.SKILL_VERSION?.trim() || undefined);

const isQuoteOnly = (): boolean =>
  process.argv.includes('--quote-only') || process.env.SKILL_QUOTE_ONLY === '1';

const shouldDevTopUpCredits = (): boolean =>
  process.argv.includes('--dev-topup') ||
  process.argv.includes('--auto-topup') ||
  process.env.SKILL_DEV_TOPUP === '1';

const resolveDevTopUpAmount = (): number | undefined => {
  const arg = resolveArgValue('--dev-topup-amount=');
  const raw = arg ?? process.env.SKILL_DEV_TOPUP_AMOUNT?.trim();
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
};

const guessMimeType = (fileName: string): string => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'text/markdown';
  }
  if (lower.endsWith('.json')) {
    return 'application/json';
  }
  if (lower.endsWith('.txt')) {
    return 'text/plain';
  }
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    return 'text/yaml';
  }
  return 'application/octet-stream';
};

const rewriteSkillJson = (
  raw: Buffer,
  overrides: { name?: string; version?: string },
): Buffer => {
  if (!overrides.name && !overrides.version) {
    return raw;
  }

  const parsed = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
  if (overrides.name) {
    parsed.name = overrides.name;
  }
  if (overrides.version) {
    parsed.version = overrides.version;
  }

  return Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
};

const loadSkillFiles = async (
  skillDir: string,
  overrides: { name?: string; version?: string },
): Promise<SkillRegistryFileInput[]> => {
  const entries = await readdir(skillDir);
  const files: SkillRegistryFileInput[] = [];

  for (const entry of entries) {
    if (entry.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(skillDir, entry);
    const fileStat = await stat(fullPath);
    if (!fileStat.isFile()) {
      continue;
    }
    let data = await readFile(fullPath);
    if (entry === 'skill.json') {
      data = rewriteSkillJson(data, overrides);
    }
    files.push({
      name: entry,
      base64: data.toString('base64'),
      mimeType: guessMimeType(entry),
    });
  }

  const names = new Set(files.map(file => file.name));
  if (!names.has('SKILL.md')) {
    throw new Error(`Missing SKILL.md in ${skillDir}`);
  }
  if (!names.has('skill.json')) {
    throw new Error(`Missing skill.json in ${skillDir}`);
  }

  return files.sort((a, b) => a.name.localeCompare(b.name));
};

const pollJob = async (
  client: RegistryBrokerClient,
  jobId: string,
  params: { accountId?: string } = {},
  timeoutMs = 180_000,
): Promise<SkillRegistryJobStatusResponse> => {
  const started = Date.now();
  let lastStatus: string | null = null;

  while (Date.now() - started < timeoutMs) {
    const job = await client.getSkillPublishJob(jobId, params);
    if (job.status !== lastStatus) {
      // eslint-disable-next-line no-console
      console.log(`• Job status: ${job.status}`);
      lastStatus = job.status;
    }
    if (job.status === 'completed') {
      return job;
    }
    if (job.status === 'failed') {
      throw new Error(job.failureReason ?? 'Job failed');
    }
    await delay(2_000);
  }

  throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`);
};

const resolveBaseUrlForPath = (clientBaseUrl: string, suffix: string): string =>
  clientBaseUrl.replace(/\/$/, '') + suffix;

const postDevCreditGrant = async (params: {
  baseUrl: string;
  apiKey: string;
  accountId: string;
  amount: number;
}): Promise<{ credited: number; balance: number }> => {
  const res = await fetch(
    resolveBaseUrlForPath(params.baseUrl, '/credits/dev/grant'),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': params.apiKey,
      },
      body: JSON.stringify({
        accountId: params.accountId,
        amount: params.amount,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(
      `Dev credit grant failed (${res.status} ${res.statusText}): ${await res.text()}`,
    );
  }

  const json = (await res.json()) as { credited?: unknown; balance?: unknown };
  const credited = typeof json.credited === 'number' ? json.credited : 0;
  const balance = typeof json.balance === 'number' ? json.balance : 0;
  return { credited, balance };
};

const fetchCreditBalance = async (params: {
  baseUrl: string;
  apiKey: string;
  accountId: string;
}): Promise<number> => {
  const url = new URL(
    resolveBaseUrlForPath(params.baseUrl, '/credits/balance'),
  );
  url.searchParams.set('accountId', params.accountId);
  const res = await fetch(url.toString(), {
    headers: {
      'x-api-key': params.apiKey,
    },
  });
  if (!res.ok) {
    throw new Error(
      `Failed to read credit balance (${res.status} ${res.statusText}): ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { balance?: unknown };
  return typeof json.balance === 'number' ? json.balance : 0;
};

const main = async (): Promise<void> => {
  const baseUrl =
    process.env.REGISTRY_BROKER_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const apiKey = process.env.REGISTRY_BROKER_API_KEY?.trim() || undefined;
  const skillDir = resolveSkillDir();
  const quoteOnly = isQuoteOnly();
  const devTopUp = shouldDevTopUpCredits();
  const devTopUpAmount = resolveDevTopUpAmount();
  const nameOverride = resolveSkillNameOverride();
  const versionOverride = resolveSkillVersionOverride();

  const client = new RegistryBrokerClient({
    baseUrl,
    ...(apiKey ? { apiKey } : {}),
  });

  let accountId = process.env.REGISTRY_BROKER_ACCOUNT_ID?.trim() || '';

  if (!accountId) {
    const canLedgerAuth =
      Boolean(
        process.env.HEDERA_OPERATOR_ID?.trim() &&
          process.env.HEDERA_OPERATOR_KEY?.trim(),
      ) || Boolean(process.env.EVM_PRIVATE_KEY?.trim());
    if (!canLedgerAuth) {
      throw new Error(
        'Provide REGISTRY_BROKER_ACCOUNT_ID (static API key mode) or ledger credentials (HEDERA_OPERATOR_ID/HEDERA_OPERATOR_KEY).',
      );
    }
    const auth = await authenticateWithDemoLedger(client, {
      label: 'skill-registry-publish-demo',
      expiresInMinutes: 30,
      setAccountHeader: true,
    });
    accountId = auth.accountId;
  }

  // eslint-disable-next-line no-console
  console.log(`• Broker:   ${client.baseUrl}`);
  // eslint-disable-next-line no-console
  console.log(`• Account:  ${accountId}`);
  // eslint-disable-next-line no-console
  console.log(`• Skill dir: ${path.resolve(skillDir)}`);
  if (nameOverride) {
    // eslint-disable-next-line no-console
    console.log(`• Override name: ${nameOverride}`);
  }
  if (versionOverride) {
    // eslint-disable-next-line no-console
    console.log(`• Override version: ${versionOverride}`);
  }

  const config = await client.skillsConfig();
  if (!config.enabled) {
    throw new Error('Skill registry is disabled on this broker');
  }

  const files = await loadSkillFiles(skillDir, {
    name: nameOverride,
    version: versionOverride,
  });

  // eslint-disable-next-line no-console
  console.log(
    `• Uploading ${files.length} file(s): ${files.map(file => file.name).join(', ')}`,
  );

  const quote = await client.quoteSkillPublish({
    files,
    accountId,
  });

  // eslint-disable-next-line no-console
  console.log(
    `• Quote: ${quote.credits} credits (${quote.estimatedCostHbar} HBAR est)`,
  );

  if (quoteOnly) {
    // eslint-disable-next-line no-console
    console.log('ℹ️  Quote-only mode enabled; skipping publish.');
    return;
  }

  if (devTopUp) {
    if (!apiKey) {
      throw new Error('--dev-topup requires REGISTRY_BROKER_API_KEY');
    }
    const currentBalance = await fetchCreditBalance({
      baseUrl: client.baseUrl,
      apiKey,
      accountId,
    });
    if (currentBalance < quote.credits) {
      const requested = devTopUpAmount ?? Math.ceil(quote.credits * 2);
      const grant = await postDevCreditGrant({
        baseUrl: client.baseUrl,
        apiKey,
        accountId,
        amount: requested,
      });
      // eslint-disable-next-line no-console
      console.log(
        `• Dev credits grant: +${grant.credited} (balance now ${grant.balance})`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`• Credits OK: balance ${currentBalance}`);
    }
  }

  const publish = await client.publishSkill({
    files,
    quoteId: quote.quoteId,
    accountId,
  });

  // eslint-disable-next-line no-console
  console.log(`• Publish job: ${publish.jobId}`);

  const completed = await pollJob(client, publish.jobId, { accountId });

  // eslint-disable-next-line no-console
  console.log('✅ Completed');
  // eslint-disable-next-line no-console
  console.log({
    name: completed.name,
    version: completed.version,
    directoryTopicId: completed.directoryTopicId,
    packageTopicId: completed.packageTopicId,
    skillJsonHrl: completed.skillJsonHrl,
    totalCostCredits: completed.totalCostCredits,
    totalCostHbar: completed.totalCostHbar,
  });

  const listed = await client.listSkills({
    name: completed.name,
    version: completed.version,
    limit: 1,
    includeFiles: true,
  });

  const summary = listed.items[0];
  if (!summary) {
    throw new Error('Published skill did not appear in /skills list response');
  }

  // eslint-disable-next-line no-console
  console.log(
    `• Listed: ${summary.name} v${summary.version} (${summary.packageTopicId})`,
  );
};

main().catch(error => {
  // eslint-disable-next-line no-console
  if (error instanceof RegistryBrokerError) {
    console.error(
      `Registry broker error ${error.status} (${error.statusText}):`,
      error.body,
    );
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
