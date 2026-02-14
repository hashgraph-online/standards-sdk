/**
 * Skill Registry publish demo (Registry Broker)
 * Publishes a single skill package (SKILL.md + skill.json + optional files) through Registry Broker skill registry endpoints.
 * Usage:
 *   pnpm -C standards-sdk tsx demo/registry-broker/skill-registry-publish-demo.ts --skill-dir=../skills/openskills-my-first-skill
 *   pnpm -C standards-sdk tsx demo/registry-broker/skill-registry-publish-demo.ts --base-url=http://localhost:4000 --ledger-network=testnet --skill-dir=../skills/openskills-my-first-skill
 */
import 'dotenv/config';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  type SkillRegistryFileInput,
} from '../../src/services/registry-broker';
import { Logger } from '../../src/utils/logger';
import { authenticateWithDemoLedger } from '../utils/registry-auth';
import {
  DEFAULT_BASE_URL,
  isQuoteOnly,
  loadSkillFiles,
  pollJob,
  resolveArgValue,
  resolveSkillDir,
  resolveSkillNameOverride,
  resolveSkillVersionOverride,
  verifyHcs26Publish,
} from './skill-registry-utils';

const logger = Logger.getInstance({ module: 'skill-registry-demo' });

const isAbortedOperationError = (error: RegistryBrokerError): boolean => {
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

const isInvalidApiKeyError = (error: unknown): boolean => {
  if (!(error instanceof RegistryBrokerError)) {
    return false;
  }
  if (error.status !== 401) {
    return false;
  }
  const body = error.body;
  if (Array.isArray(body)) {
    const first = body[0];
    if (first && typeof first === 'object' && 'error' in first) {
      return String((first as { error?: unknown }).error ?? '')
        .toLowerCase()
        .includes('invalid api key');
    }
  }
  if (body && typeof body === 'object' && 'error' in body) {
    return String((body as { error?: unknown }).error ?? '')
      .toLowerCase()
      .includes('invalid api key');
  }
  return false;
};

const isFetchFailedError = (error: unknown): boolean =>
  error instanceof TypeError &&
  typeof error.message === 'string' &&
  error.message.toLowerCase().includes('fetch failed');

const isTransientRegistryError = (error: unknown): boolean => {
  if (isFetchFailedError(error)) {
    return true;
  }
  if (error instanceof RegistryBrokerError) {
    return (
      error.status === 500 ||
      error.status === 502 ||
      error.status === 503 ||
      error.status === 504
    );
  }
  return false;
};

const isFastMode = (): boolean =>
  process.argv.includes('--fast') || process.env.SKILL_PUBLISH_FAST === '1';

const withAuthRetry = async <T>(
  fn: () => Promise<T>,
  reauthenticate?: () => Promise<void>,
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (reauthenticate && isInvalidApiKeyError(error)) {
      logger.warn('• API key expired; re-authenticating and retrying...');
      await reauthenticate();
      return await fn();
    }
    throw error;
  }
};

const publishSkillPackage = async (params: {
  client: RegistryBrokerClient;
  files: SkillRegistryFileInput[];
  accountId: string;
  ledgerPrivateKey?: string;
  quoteOnly: boolean;
  fastMode: boolean;
  reauthenticate?: () => Promise<void>;
}): Promise<void> => {
  const {
    client,
    files,
    accountId,
    ledgerPrivateKey,
    quoteOnly,
    fastMode,
    reauthenticate,
  } = params;

  logger.info(
    `• Uploading ${files.length} file(s): ${files.map(file => file.name).join(', ')}`,
  );

  const quote = await (async () => {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        return await withAuthRetry(
          () =>
            client.quoteSkillPublish({
              files,
              ...(accountId ? { accountId } : {}),
            }),
          reauthenticate,
        );
      } catch (error) {
        if (isTransientRegistryError(error) && attempt < 6) {
          const summary =
            error instanceof RegistryBrokerError
              ? `${error.status} ${error.statusText}`
              : error instanceof Error
                ? error.message
                : 'unknown error';
          logger.warn(`• Quote retry ${attempt}/6 (${summary})`);
          await delay(Math.min(6_000, 750 * attempt));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Unreachable quote retry loop');
  })();

  logger.info(
    `• Quote: ${quote.credits} credits (${quote.estimatedCostHbar} HBAR est)`,
  );

  if (quoteOnly) {
    logger.info('• Quote-only mode enabled; skipping publish.');
    return;
  }

  const publish = await (async () => {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        return await withAuthRetry(
          () =>
            client.publishSkill({
              files,
              quoteId: quote.quoteId,
              ...(accountId ? { accountId } : {}),
            }),
          reauthenticate,
        );
      } catch (error) {
        if (error instanceof RegistryBrokerError) {
          const body = error.body;
          const message = (() => {
            if (typeof body === 'string') {
              return body;
            }
            if (Array.isArray(body)) {
              const first = body[0];
              if (first && typeof first === 'object' && 'error' in first) {
                return String((first as { error?: unknown }).error ?? '');
              }
              return '';
            }
            if (body && typeof body === 'object') {
              const record = body as Record<string, unknown>;
              if (typeof record.error === 'string') {
                return record.error;
              }
              if (Array.isArray(record.errors)) {
                return record.errors
                  .map(entry => (typeof entry === 'string' ? entry : ''))
                  .filter(Boolean)
                  .join('; ');
              }
            }
            return '';
          })();
          if (
            error.status === 400 &&
            message.toLowerCase().includes('insufficient credits')
          ) {
            if (!ledgerPrivateKey) {
              throw new Error(
                'Insufficient credits for skill publish. Fund this account or run with Hedera ledger credentials available for credit purchase.',
              );
            }
            const topupHbar = 20;
            logger.warn(
              `• Insufficient credits; purchasing credits with ${topupHbar} HBAR`,
            );
            const purchase = await withAuthRetry(
              () =>
                client.purchaseCreditsWithHbar({
                  accountId,
                  privateKey: ledgerPrivateKey,
                  hbarAmount: topupHbar,
                  memo: 'skills seed purchase',
                  metadata: {
                    demo: 'skill-registry-publish-demo',
                    seed: true,
                  },
                }),
              reauthenticate,
            );
            logger.info(
              `• Credits purchased: ${purchase.credits} (tx ${purchase.transactionId})`,
            );
            continue;
          }
        }

        if (isTransientRegistryError(error) && attempt < 6) {
          const summary =
            error instanceof RegistryBrokerError
              ? `${error.status} ${error.statusText}`
              : error instanceof Error
                ? error.message
                : 'unknown error';
          logger.warn(`• Publish retry ${attempt}/6 (${summary})`);
          await delay(Math.min(10_000, 1_000 * attempt));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Skill publish failed after retries');
  })();

  logger.info(`• Publish job: ${publish.jobId}`);

  const completed = await pollJob(
    client,
    publish.jobId,
    accountId ? { accountId } : {},
    12 * 60_000,
    { onUnauthorized: reauthenticate },
  );

  logger.info('• Completed');
  logger.info({
    name: completed.name,
    version: completed.version,
    directoryTopicId: completed.directoryTopicId,
    packageTopicId: completed.packageTopicId,
    skillJsonHrl: completed.skillJsonHrl,
    totalCostCredits: completed.totalCostCredits,
    totalCostHbar: completed.totalCostHbar,
  });

  if (fastMode) {
    return;
  }

  await verifyHcs26Publish({ completed });

  const listed = await (async () => {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        return await withAuthRetry(
          () =>
            client.listSkills({
              name: completed.name,
              version: completed.version,
              limit: 1,
              includeFiles: true,
            }),
          reauthenticate,
        );
      } catch (error) {
        if (isFetchFailedError(error)) {
          logger.warn(`• skills list retry ${attempt}/6 (fetch failed)`);
          await delay(2_000);
          continue;
        }
        if (
          error instanceof RegistryBrokerError &&
          (error.status === 503 || error.status === 502)
        ) {
          logger.warn(`• skills list retry ${attempt}/6 (${error.status})`);
          await delay(2_000);
          continue;
        }
        throw error;
      }
    }
    throw new Error('Unable to verify /skills listing after publish');
  })();

  const summary = listed.items[0];
  if (!summary) {
    throw new Error('Published skill did not appear in /skills list response');
  }

  logger.info(
    `• Listed: ${summary.name} v${summary.version} (${summary.packageTopicId})`,
  );
};

const main = async (): Promise<void> => {
  const quoteOnly = isQuoteOnly();
  const fastMode = isFastMode();

  const baseUrl =
    resolveArgValue('--base-url=') ??
    process.env.REGISTRY_BROKER_BASE_URL?.trim() ??
    DEFAULT_BASE_URL;
  const ledgerNetworkArg = resolveArgValue('--ledger-network=');
  const apiKey = process.env.REGISTRY_BROKER_API_KEY?.trim() || undefined;
  const authToken = process.env.REGISTRY_BROKER_AUTH_TOKEN?.trim() || undefined;

  if (ledgerNetworkArg) {
    process.env.LEDGER_NETWORK = ledgerNetworkArg;
  }

  if (baseUrl.includes('registry-staging.hol.org')) {
    process.env.LEDGER_NETWORK = 'testnet';
  }
  if (
    baseUrl.includes('registry.hol.org') ||
    baseUrl.includes('hol.org/registry')
  ) {
    process.env.LEDGER_NETWORK = 'mainnet';
  }

  const client = new RegistryBrokerClient({
    baseUrl,
    ...(apiKey ? { apiKey } : {}),
    ...(authToken
      ? {
          defaultHeaders: {
            authorization: `Bearer ${authToken}`,
          },
        }
      : {}),
  });

  let accountId = process.env.REGISTRY_BROKER_ACCOUNT_ID?.trim() || '';
  let ledgerPrivateKey: string | undefined;
  const reauthenticate = async (): Promise<void> => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      try {
        const auth = await authenticateWithDemoLedger(client, {
          label: 'skill-registry-publish-demo',
          mode: 'hedera',
          expiresInMinutes: 30,
          setAccountHeader: true,
        });
        accountId = auth.accountId;
        if ('privateKey' in auth) {
          ledgerPrivateKey = auth.privateKey;
        }
        return;
      } catch (error) {
        if (
          error instanceof RegistryBrokerError &&
          isAbortedOperationError(error)
        ) {
          logger.warn(`• Ledger auth aborted; retrying (${attempt}/10)...`);
          await delay(Math.min(5_000, 750 * attempt));
          continue;
        }
        if (
          error instanceof RegistryBrokerError &&
          (error.status === 502 || error.status === 503)
        ) {
          logger.warn(
            `• Ledger auth temporary failure (${error.status}); retrying (${attempt}/10)...`,
          );
          await delay(Math.min(6_000, 1_000 * attempt));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Ledger authentication aborted repeatedly');
  };

  if (!accountId && !authToken) {
    try {
      await reauthenticate();
    } catch (error) {
      if (error instanceof RegistryBrokerError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Ledger authentication failed (${message}). Set TESTNET_HEDERA_ACCOUNT_ID + TESTNET_HEDERA_PRIVATE_KEY (or REGISTRY_BROKER_ACCOUNT_ID / REGISTRY_BROKER_AUTH_TOKEN).`,
      );
    }
  }

  logger.info(`• Broker:   ${client.baseUrl}`);
  logger.info(`• Account:  ${accountId || '(from auth session)'}`);
  if (fastMode) {
    logger.info('• Fast mode enabled (--fast): skipping HCS-26 + list verify');
  }

  const config = await (async () => {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        return await client.skillsConfig();
      } catch (error) {
        if (isFetchFailedError(error)) {
          logger.warn(`• skills/config retry ${attempt}/6 (fetch failed)`);
          await delay(2_000);
          continue;
        }
        if (
          error instanceof RegistryBrokerError &&
          (error.status === 503 || error.status === 502)
        ) {
          logger.warn(`• skills/config retry ${attempt}/6 (${error.status})`);
          await delay(2_000);
          continue;
        }
        throw error;
      }
    }
    throw new Error('Skill registry config did not become available');
  })();
  if (!config.enabled) {
    throw new Error('Skill registry is disabled on this broker');
  }

  const skillDir = resolveSkillDir();
  const nameOverride = resolveSkillNameOverride();
  const versionOverride = resolveSkillVersionOverride();

  logger.info(`• Skill dir: ${path.resolve(skillDir)}`);
  if (nameOverride) {
    logger.info(`• Override name: ${nameOverride}`);
  }
  if (versionOverride) {
    logger.info(`• Override version: ${versionOverride}`);
  }

  const files = await loadSkillFiles(skillDir, {
    name: nameOverride,
    version: versionOverride,
  });

  await publishSkillPackage({
    client,
    files,
    accountId,
    ledgerPrivateKey,
    quoteOnly,
    fastMode,
    reauthenticate,
  });
};

main().catch(error => {
  if (error instanceof RegistryBrokerError) {
    logger.error(
      `Registry broker error ${error.status} (${error.statusText}):`,
      error.body,
    );
  } else {
    logger.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
