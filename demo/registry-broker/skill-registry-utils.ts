import { readFile, readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  type SkillRegistryFileInput,
  type SkillRegistryJobStatusResponse,
} from '../../src/services/registry-broker';
import { Hcs26SkillRegistryResolver } from '../../src/hcs-26';
import { Logger } from '../../src/utils/logger';

export const DEFAULT_BASE_URL = 'http://localhost:4000';
const logger = Logger.getInstance({ module: 'skill-registry-demo' });

const isInvalidApiKeyResponse = (error: RegistryBrokerError): boolean => {
  if (error.status !== 401) {
    return false;
  }

  const body = error.body;
  const haystack = (() => {
    if (typeof body === 'string') {
      return body;
    }
    try {
      return JSON.stringify(body);
    } catch {
      return String(body);
    }
  })().toLowerCase();

  return (
    haystack.includes('invalid api key') ||
    haystack.includes('invalid api key provided')
  );
};

const isAbortedOperationResponse = (error: RegistryBrokerError): boolean => {
  if (error.status !== 400) {
    return false;
  }
  const body = error.body;
  const haystack = (() => {
    if (typeof body === 'string') {
      return body;
    }
    try {
      return JSON.stringify(body);
    } catch {
      return String(body);
    }
  })().toLowerCase();
  return haystack.includes('aborted');
};

export const resolveArgValue = (prefix: string): string | undefined => {
  const arg = process.argv.find(entry => entry.startsWith(prefix));
  if (!arg) {
    return undefined;
  }
  const value = arg.slice(prefix.length).trim();
  return value.length > 0 ? value : undefined;
};

export const resolveSkillDir = (): string => {
  const arg =
    resolveArgValue('--skill-dir=') ??
    resolveArgValue('--dir=') ??
    process.env.SKILL_DIR?.trim();
  return arg && arg.length > 0 ? arg : '../skills/openskills-my-first-skill';
};

export const resolveSkillNameOverride = (): string | undefined =>
  resolveArgValue('--name=') ?? (process.env.SKILL_NAME?.trim() || undefined);

export const resolveSkillVersionOverride = (): string | undefined =>
  resolveArgValue('--version=') ??
  (process.env.SKILL_VERSION?.trim() || undefined);

export const isQuoteOnly = (): boolean =>
  process.argv.includes('--quote-only') || process.env.SKILL_QUOTE_ONLY === '1';

export const guessMimeType = (fileName: string): string => {
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

export const loadSkillFiles = async (
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

export const pollJob = async (
  client: RegistryBrokerClient,
  jobId: string,
  params: { accountId?: string } = {},
  timeoutMs = 12 * 60_000,
  hooks: { onUnauthorized?: () => Promise<void> } = {},
): Promise<SkillRegistryJobStatusResponse> => {
  const started = Date.now();
  let lastStatus: string | null = null;
  let lastTransientError: string | null = null;
  let lastNetworkError: string | null = null;

  while (Date.now() - started < timeoutMs) {
    let job: SkillRegistryJobStatusResponse;
    try {
      job = await client.getSkillPublishJob(jobId, params);
      lastTransientError = null;
      lastNetworkError = null;
    } catch (error) {
      const isFetchFailed =
        error instanceof TypeError &&
        typeof error.message === 'string' &&
        error.message.toLowerCase().includes('fetch failed');

      if (isFetchFailed) {
        const summary = error.message || 'fetch failed';
        if (summary !== lastNetworkError) {
          logger.warn(
            `• Job status: transient network error (${summary}); retrying...`,
          );
          lastNetworkError = summary;
        }
        await delay(2_000);
        continue;
      }
      if (error instanceof RegistryBrokerError) {
        if (hooks.onUnauthorized && isInvalidApiKeyResponse(error)) {
          logger.warn('• Job status: API key expired; re-authenticating...');
          try {
            await hooks.onUnauthorized();
          } catch (hookError) {
            if (
              hookError instanceof RegistryBrokerError &&
              (isAbortedOperationResponse(hookError) ||
                hookError.status === 502 ||
                hookError.status === 503)
            ) {
              logger.warn(
                `• Job status: re-auth failed transiently (${hookError.status}); retrying...`,
              );
              await delay(1_000);
              continue;
            }
            throw hookError;
          }
          await delay(250);
          continue;
        }
        const bodyError =
          error.body && typeof error.body === 'object' && 'error' in error.body
            ? String((error.body as { error?: unknown }).error ?? '')
            : '';
        const normalized = bodyError.toLowerCase();
        const retryable =
          error.status === 503 ||
          (error.status === 500 &&
            (normalized.includes('failed to fetch job status') ||
              normalized.includes('temporarily unavailable')));

        if (retryable) {
          const summary = bodyError || `${error.status} ${error.statusText}`;
          if (summary !== lastTransientError) {
            logger.warn(`• Job status: (retrying) ${summary}`);
            lastTransientError = summary;
          }
          await delay(2_000);
          continue;
        }
      }
      throw error;
    }
    if (job.status !== lastStatus) {
      logger.info(`• Job status: ${job.status}`);
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

export const verifyHcs26Publish = async (params: {
  completed: SkillRegistryJobStatusResponse;
}): Promise<void> => {
  const { completed } = params;

  const waitForNonNull = async <T>(
    label: string,
    fn: () => Promise<T | null>,
    timeoutMs = 120_000,
    intervalMs = 3_000,
  ): Promise<T> => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = await fn();
      if (value !== null) {
        return value;
      }
      logger.info(`• HCS-26 verify: waiting for ${label}...`);
      await delay(intervalMs);
    }
    throw new Error(`HCS-26 verify: timed out waiting for ${label}`);
  };

  const skillUid =
    completed.skillUid ?? completed.directorySequenceNumber ?? null;
  const versionRegistryTopicId =
    completed.versionRegistryTopicId ?? completed.packageTopicId ?? null;
  const manifestHrl = completed.manifestHrl ?? completed.skillJsonHrl ?? null;

  if (!skillUid || !versionRegistryTopicId || !manifestHrl) {
    logger.info(
      '• HCS-26 verify: skipped (missing skillUid/versionRegistryTopicId/manifestHrl)',
    );
    return;
  }

  const resolver = new Hcs26SkillRegistryResolver({
    network: completed.network,
  });

  const discovery = await waitForNonNull(
    `discovery register (skillUid ${skillUid})`,
    () =>
      resolver.getDiscoveryRegister({
        directoryTopicId: completed.directoryTopicId,
        skillUid,
      }),
  );

  if (discovery.t_id !== versionRegistryTopicId) {
    throw new Error(
      `HCS-26 verify: discovery t_id mismatch (expected ${versionRegistryTopicId}, got ${discovery.t_id})`,
    );
  }

  const versionRegister = await waitForNonNull(
    `version register (skillUid ${skillUid})`,
    () =>
      resolver.getLatestVersionRegister({
        versionRegistryTopicId,
        skillUid,
      }),
  );

  const manifestTopicIdMatch = manifestHrl.match(
    /^hcs:\/\/1\/([0-9]+\.[0-9]+\.[0-9]+)$/,
  );
  const manifestTopicId = manifestTopicIdMatch ? manifestTopicIdMatch[1] : null;

  if ('t_id' in versionRegister) {
    if (!manifestTopicId) {
      throw new Error(
        `HCS-26 verify: expected manifestHrl to be an HCS-1 HRL, got ${manifestHrl}`,
      );
    }
    if (versionRegister.t_id !== manifestTopicId) {
      throw new Error(
        `HCS-26 verify: version t_id mismatch (expected ${manifestTopicId}, got ${versionRegister.t_id})`,
      );
    }
  } else if ('manifest_hcs1' in versionRegister) {
    if (versionRegister.manifest_hcs1 !== manifestHrl) {
      throw new Error(
        `HCS-26 verify: manifest_hcs1 mismatch (expected ${manifestHrl}, got ${versionRegister.manifest_hcs1})`,
      );
    }
  } else {
    throw new Error('HCS-26 verify: unknown version register shape');
  }

  const checksumStarted = Date.now();
  let lastChecksumError: string | null = null;
  let manifest:
    | Awaited<ReturnType<typeof resolver.resolveManifest>>['manifest']
    | null = null;

  while (Date.now() - checksumStarted < 120_000) {
    try {
      const resolved = await resolver.resolveManifest({ manifestHrl });
      await resolver.verifyVersionRegisterMatchesManifest({
        versionRegister,
        manifestSha256Hex: resolved.sha256Hex,
      });
      manifest = resolved.manifest;
      break;
    } catch (error) {
      const summary = error instanceof Error ? error.message : 'unknown error';
      if (summary !== lastChecksumError) {
        logger.warn(`• HCS-26 verify: retrying checksum (${summary})`);
        lastChecksumError = summary;
      }
      await delay(3_000);
    }
  }

  if (!manifest) {
    throw new Error(
      'HCS-26 verify: timed out waiting for manifest checksum match',
    );
  }

  logger.info(
    `• HCS-26 verify: OK (skillUid ${skillUid}, files ${manifest.files.length})`,
  );
};
