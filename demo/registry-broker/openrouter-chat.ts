import 'dotenv/config';
import { Logger } from '@hashgraphonline/standards-sdk';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  RegistryBrokerParseError,
} from '../../src/services/registry-broker';
import { authenticateWithHederaLedger } from '../utils/registry-auth';
import { resolveHederaLedgerAuthConfig } from '../utils/ledger-config';

const logger = new Logger({
  module: 'demo/registry-broker/openrouter-chat',
});

const resolveBaseUrl = (): string => {
  const arg = process.argv.find(value => value.startsWith('--base-url='));
  const raw = arg ? arg.split('=')[1] : undefined;
  const trimmed = raw ? raw.trim() : '';
  if (trimmed.length > 0) {
    return trimmed;
  }
  return (
    process.env.REGISTRY_BROKER_BASE_URL?.trim() ||
    'https://hol.org/registry/api/v1'
  );
};

type HederaLedgerCredentials = {
  accountId: string;
  privateKey: string;
};

const resolveInitialTopUpHbar = (): number => {
  const arg = process.argv.find(value => value.startsWith('--topup-hbar='));
  const raw = arg ? arg.split('=')[1] : undefined;
  const parsed = raw ? Number(raw) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return parsed;
};

const resolveTopUpHbar = (errorBody: unknown): number | null => {
  if (!errorBody || typeof errorBody !== 'object') {
    return null;
  }
  const record = errorBody as Record<string, unknown>;
  const shortfallCredits = Number(record.shortfallCredits ?? 0);
  const creditsPerHbar = Number(record.creditsPerHbar ?? 0);
  const estimatedHbar = Number(record.estimatedHbar ?? 0);

  if (!Number.isFinite(shortfallCredits) || shortfallCredits <= 0) {
    return Number.isFinite(estimatedHbar) && estimatedHbar > 0
      ? estimatedHbar
      : null;
  }

  const paddedCredits = shortfallCredits + 1;
  if (Number.isFinite(creditsPerHbar) && creditsPerHbar > 0) {
    return Math.ceil((paddedCredits / creditsPerHbar) * 1e8) / 1e8;
  }

  return Number.isFinite(estimatedHbar) && estimatedHbar > 0
    ? estimatedHbar
    : null;
};

const withAutoTopUp = async <T>(
  label: string,
  action: () => Promise<T>,
  client: RegistryBrokerClient,
  ledger: HederaLedgerCredentials | null,
): Promise<T> => {
  try {
    return await action();
  } catch (error) {
    if (!(error instanceof RegistryBrokerError) || error.status !== 402) {
      throw error;
    }

    if (!ledger) {
      throw new Error(
        `${label} requires credits but no Hedera ledger credentials were available for auto top-up.`,
      );
    }

    const resolvedHbar = resolveTopUpHbar(error.body) ?? 0.1;
    logger.warn('Credit shortfall detected; purchasing credits via HBAR.', {
      label,
      resolvedHbar,
      status: error.status,
      statusText: error.statusText,
      body: error.body,
    });

    await client.purchaseCreditsWithHbar({
      accountId: ledger.accountId,
      privateKey: ledger.privateKey,
      hbarAmount: resolvedHbar,
      memo: `openrouter-chat:auto-topup:${Date.now().toString(36)}`,
      metadata: {
        source: 'openrouter-chat-demo',
        context: label,
        resolvedHbar,
      },
    });

    return await action();
  }
};

const run = async (): Promise<void> => {
  const baseUrl = resolveBaseUrl();
  const registryApiKey = process.env.REGISTRY_BROKER_API_KEY?.trim();
  const client = new RegistryBrokerClient({
    baseUrl,
    apiKey: registryApiKey,
  });

  let ledgerCredentials: HederaLedgerCredentials | null = null;
  try {
    const config = resolveHederaLedgerAuthConfig();
    ledgerCredentials = {
      accountId: config.accountId,
      privateKey: config.privateKey,
    };
    if (registryApiKey) {
      client.setDefaultHeader('x-account-id', config.accountId);
    }
  } catch {
    ledgerCredentials = null;
  }

  if (!registryApiKey) {
    logger.warn(
      'REGISTRY_BROKER_API_KEY is not set; falling back to Hedera ledger authentication.',
    );
    try {
      const ledger = await authenticateWithHederaLedger(client, {
        label: 'openrouter-chat',
        expiresInMinutes: 30,
        setAccountHeader: true,
      });
      ledgerCredentials = {
        accountId: ledger.accountId,
        privateKey: ledger.privateKey,
      };
    } catch (error) {
      logger.warn(
        'Ledger authentication unavailable; continuing without auth.',
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  } else {
    logger.info('Using API key authentication for registry broker access.');
  }

  const initialTopUpHbar = resolveInitialTopUpHbar();
  if (initialTopUpHbar > 0) {
    if (!ledgerCredentials) {
      throw new Error(
        '--topup-hbar was provided but Hedera ledger credentials are not configured.',
      );
    }
    logger.info('Purchasing credits via HBAR (explicit top-up requested).', {
      hbarAmount: initialTopUpHbar,
      accountId: ledgerCredentials.accountId,
    });
    await client.purchaseCreditsWithHbar({
      accountId: ledgerCredentials.accountId,
      privateKey: ledgerCredentials.privateKey,
      hbarAmount: initialTopUpHbar,
      memo: `openrouter-chat:topup:${Date.now().toString(36)}`,
      metadata: {
        source: 'openrouter-chat-demo',
        context: 'initial-topup',
        hbarAmount: initialTopUpHbar,
      },
    });
  }

  const modelId =
    process.env.OPENROUTER_MODEL_ID?.trim() || 'anthropic/claude-3.5-sonnet';
  const registry = process.env.OPENROUTER_REGISTRY?.trim() || 'openrouter';

  const searchResult = await client.search({
    q: modelId,
    registries: [registry],
    limit: 1,
  });

  if (searchResult.hits.length === 0) {
    throw new Error(
      `Unable to locate model "${modelId}" in registry "${registry}".`,
    );
  }

  const { uaid } = searchResult.hits[0];
  logger.info('Using UAID discovered via search', { uaid });

  const session = await withAutoTopUp(
    'chat.createSession',
    () =>
      client.chat.createSession({
        uaid,
        historyTtlSeconds: 900,
      }),
    client,
    ledgerCredentials,
  );
  logger.info('Session created', { sessionId: session.sessionId });

  const echoPrompt = 'Reply with only this JSON: {"pong": true}';
  const echoResponse = await withAutoTopUp(
    'chat.sendMessage:echo',
    () =>
      client.chat.sendMessage({
        sessionId: session.sessionId,
        uaid,
        message: echoPrompt,
      }),
    client,
    ledgerCredentials,
  );

  logger.info('Echo response received', {
    message: echoResponse.message,
    historyEntries: echoResponse.history.length,
  });

  const prompt =
    'Respond with a short JSON object summarizing your capabilities (keys: "summary", "pricing").';
  const response = await withAutoTopUp(
    'chat.sendMessage:capabilities',
    () =>
      client.chat.sendMessage({
        sessionId: session.sessionId,
        uaid,
        message: prompt,
      }),
    client,
    ledgerCredentials,
  );

  logger.info('Chat response received', {
    message: response.message,
    historyEntries: response.history.length,
  });

  await client.chat.endSession(session.sessionId);
  logger.info('Session closed', { sessionId: session.sessionId });
};

run().catch((error: unknown) => {
  if (error instanceof RegistryBrokerError) {
    logger.error('OpenRouter chat demo failed', {
      error: error.message,
      status: error.status,
      statusText: error.statusText,
      body: error.body,
    });
    process.exit(1);
    return;
  }
  if (error instanceof RegistryBrokerParseError) {
    logger.error('OpenRouter chat demo failed', {
      error: error.message,
      cause: String(error.cause),
      rawValue: error.rawValue,
    });
    process.exit(1);
    return;
  }
  logger.error('OpenRouter chat demo failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
