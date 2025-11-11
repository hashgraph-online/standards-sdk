import 'dotenv/config';
import { Agent, fetch as undiciFetch } from 'undici';
import registerDemoAgent, {
  type DemoProfileMode,
  type RegisterAgentOptions,
  type RegisteredAgent,
} from './register-agent';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  RegistryBrokerParseError,
} from '../../src/services/registry-broker';
import {
  startLocalA2AAgent,
  type LocalA2AAgentHandle,
} from '../utils/local-a2a-agent';
import { resolveDemoLedgerAuthMode } from '../utils/registry-auth';
import {
  resolveEvmLedgerAuthConfig,
  resolveHederaLedgerAuthConfig,
} from '../utils/ledger-config';

const DEFAULT_BASE_URL = 'https://registry.hashgraphonline.com/api/v1';
const DEFAULT_MODE: DemoProfileMode = 'ai';
const DEFAULT_ERC8004_NETWORKS = ['ethereum-sepolia', 'base-sepolia'];

const resolvePreferredErc8004Selections = (): string[] => {
  const raw = process.env.REGISTRY_BROKER_DEMO_ERC8004_NETWORKS?.trim();
  const entries =
    raw && raw.length > 0
      ? raw
          .split(/[,\s]+/)
          .map(value => value.trim())
          .filter(Boolean)
      : DEFAULT_ERC8004_NETWORKS;
  return Array.from(
    new Set(
      entries.map(entry =>
        entry.includes(':')
          ? entry.toLowerCase()
          : `erc-8004:${entry.toLowerCase()}`,
      ),
    ),
  );
};

const summariseProgressAdditionalRegistries = (
  registered: RegisteredAgent,
): Array<Record<string, unknown>> | undefined => {
  const progressSource =
    registered.updateProgress ?? registered.registrationProgress;
  if (!progressSource) {
    return undefined;
  }

  return Object.values(progressSource.additionalRegistries).map(entry => ({
    registry: entry.registryId,
    registryKey: entry.registryKey,
    status: entry.status,
    agentId: entry.agentId ?? undefined,
    agentUri: entry.agentUri ?? undefined,
    credits: entry.credits ?? undefined,
  }));
};

const headersTimeoutMs = Number(
  process.env.REGISTRY_BROKER_DEMO_HEADERS_TIMEOUT_MS ?? '600000',
);
const bodyTimeoutMs = Number(
  process.env.REGISTRY_BROKER_DEMO_BODY_TIMEOUT_MS ?? '600000',
);

const dispatcher = new Agent({
  headersTimeout: Number.isFinite(headersTimeoutMs)
    ? headersTimeoutMs
    : 600_000,
  bodyTimeout: Number.isFinite(bodyTimeoutMs) ? bodyTimeoutMs : 600_000,
});

const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) =>
  undiciFetch(input as any, {
    ...(init as any),
    dispatcher,
  })) as unknown as typeof fetch;

let activeAgentHandle: LocalA2AAgentHandle | null = null;

const parseBooleanFlag = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) {
    return defaultValue;
  }
  const normalised = value.trim().toLowerCase();
  if (normalised === '1' || normalised === 'true' || normalised === 'yes') {
    return true;
  }
  if (normalised === '0' || normalised === 'false' || normalised === 'no') {
    return false;
  }
  return defaultValue;
};

const main = async (): Promise<void> => {
  const baseUrl =
    process.env.REGISTRY_BROKER_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const apiKey = process.env.REGISTRY_BROKER_API_KEY?.trim();
  const preferLedger = parseBooleanFlag(
    process.env.REGISTRY_BROKER_DEMO_USE_LEDGER,
    !apiKey,
  );
  const ledgerMode = resolveDemoLedgerAuthMode();
  const hederaLedgerConfig =
    preferLedger && ledgerMode === 'hedera'
      ? resolveHederaLedgerAuthConfig()
      : null;
  const enableAutoTopUp =
    preferLedger &&
    ledgerMode === 'hedera' &&
    parseBooleanFlag(process.env.REGISTRY_BROKER_DEMO_AUTO_TOP_UP, true);
  const autoTopUpCredentials =
    enableAutoTopUp && hederaLedgerConfig
      ? {
          accountId: hederaLedgerConfig.accountId,
          privateKey: hederaLedgerConfig.privateKey,
        }
      : undefined;

  if (!preferLedger && !apiKey) {
    throw new Error(
      'Provide REGISTRY_BROKER_API_KEY or enable ledger authentication via REGISTRY_BROKER_DEMO_USE_LEDGER=1.',
    );
  }

  const client = new RegistryBrokerClient({
    baseUrl,
    fetchImplementation: fetchImpl,
    ...(apiKey ? { apiKey } : {}),
    ...(autoTopUpCredentials
      ? {
          registrationAutoTopUp: autoTopUpCredentials,
          historyAutoTopUp: { ...autoTopUpCredentials },
        }
      : {}),
  });

  if (preferLedger) {
    console.log('Authenticating ledger account…');
    try {
      if (ledgerMode === 'hedera' && hederaLedgerConfig) {
        const verification = await client.authenticateWithLedgerCredentials({
          accountId: hederaLedgerConfig.accountId,
          network: `hedera:${hederaLedgerConfig.network}`,
          hederaPrivateKey: hederaLedgerConfig.privateKey,
          expiresInMinutes:
            Number(
              process.env.REGISTRY_BROKER_LEDGER_AUTH_TTL_MINUTES ?? '30',
            ) || 30,
          label: 'erc-8004 registration',
        });
        console.log(
          `  Ledger authenticated for ${verification.accountId} (${verification.network})`,
        );
      } else if (ledgerMode === 'evm') {
        const evmLedger = resolveEvmLedgerAuthConfig();
        const verification = await client.authenticateWithLedgerCredentials({
          accountId: evmLedger.accountId,
          network: evmLedger.network,
          sign: evmLedger.sign,
          expiresInMinutes:
            Number(
              process.env.REGISTRY_BROKER_LEDGER_AUTH_TTL_MINUTES ?? '30',
            ) || 30,
          label: 'erc-8004 registration',
        });
        console.log(
          `  Ledger authenticated for ${verification.accountId} (${verification.network})`,
        );
      } else {
        throw new Error(
          `Unsupported REGISTRY_BROKER_LEDGER_MODE "${ledgerMode}" for this demo.`,
        );
      }
    } catch (error) {
      if (error instanceof RegistryBrokerError) {
        console.error(
          `Ledger authentication failed (${error.status} ${error.statusText}): ${JSON.stringify(error.body)}`,
        );
      }
      throw error;
    }
  } else {
    console.log('Using provided REGISTRY_BROKER_API_KEY for authentication.');
  }

  const alias =
    process.argv[2]?.trim() || `sdk-erc8004-demo-${Date.now().toString(36)}`;

  const erc8004Selections =
    process.env.REGISTRY_BROKER_DEMO_SKIP_ERC8004 === '1'
      ? []
      : resolvePreferredErc8004Selections();

  const registerOptions: RegisterAgentOptions = {
    ...(hederaLedgerConfig
      ? {
          ledgerAccountId: hederaLedgerConfig.accountId,
          ledgerPrivateKey: hederaLedgerConfig.privateKey,
        }
      : {}),
    additionalRegistries: [],
    updateAdditionalRegistries: erc8004Selections,
  };

  console.log(
    `Preparing to register agent "${alias}" via ${baseUrl} (mode: ${DEFAULT_MODE}).`,
  );
  if (registerOptions.updateAdditionalRegistries.length > 0) {
    console.log(
      `  Targeting ERC-8004 networks: ${registerOptions.updateAdditionalRegistries.join(', ')}`,
    );
  } else {
    console.log('  ERC-8004 update disabled for this demo run.');
  }
  let localAgentHandle: LocalA2AAgentHandle | null = null;
  let registered;

  try {
    localAgentHandle = await startLocalA2AAgent({
      agentId: alias,
    });
    activeAgentHandle = localAgentHandle;

    const endpoint = localAgentHandle.a2aEndpoint;
    const publicEndpoint = localAgentHandle.publicUrl ?? endpoint;
    if (localAgentHandle.publicUrl) {
      console.log(
        `Started local agent with public endpoint: ${publicEndpoint}`,
      );
    } else {
      console.log(
        `Started local agent at ${endpoint} (tunnel unavailable, using local URL).`,
      );
    }

    registered = await registerDemoAgent(
      client,
      alias,
      publicEndpoint,
      DEFAULT_MODE,
      registerOptions,
    );
  } catch (error) {
    if (error instanceof RegistryBrokerError) {
      console.error(
        `Failed to register agent (status ${error.status} ${error.statusText}):`,
        error.message,
      );
      if (error.body) {
        console.error('Error details:', JSON.stringify(error.body, null, 2));
      }
      if (error.status === 500 || error.status === 402) {
        console.error(
          'Hint: ensure the ledger account has credits/HBAR or rerun with REGISTRY_BROKER_DEMO_AUTO_TOP_UP=0 after manually funding.',
        );
      }
    } else if (error instanceof RegistryBrokerParseError) {
      console.error('Failed to register agent: response parse error.');
      if (error.cause instanceof Error) {
        console.error(error.cause);
      } else if (error.cause) {
        try {
          console.error(
            'Parse error details:',
            JSON.stringify(error.cause, null, 2),
          );
        } catch {
          console.error('Parse error details:', error.cause);
        }
      }
    } else if (error instanceof Error) {
      console.error('Failed to register agent:', error.message);
    } else {
      console.error('Failed to register agent:', error);
    }
    throw error;
  }

  const progressAdditionalRegistries =
    summariseProgressAdditionalRegistries(registered);

  const summary = {
    uaid: registered.uaid,
    agentId: registered.agentId,
    endpoint: localAgentHandle?.publicUrl ?? localAgentHandle?.a2aEndpoint,
    localEndpoint: localAgentHandle?.localA2aEndpoint,
    additionalRegistries:
      progressAdditionalRegistries ??
      registered.updateResponse?.additionalRegistries ??
      registered.registrationResponse.additionalRegistries ??
      [],
  };
  console.log('Registration complete:');
  console.log(JSON.stringify(summary, null, 2));
};

main()
  .catch(error => {
    console.error(
      'ERC-8004 demo failed:',
      error instanceof Error ? error.message : error,
    );
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  })
  .finally(async () => {
    await Promise.all([
      (async () => {
        if (activeAgentHandle) {
          try {
            await activeAgentHandle.stop();
          } catch (error) {
            console.warn(
              'Warning: failed to stop local agent',
              error instanceof Error ? error.message : error,
            );
          } finally {
            activeAgentHandle = null;
          }
        }
      })(),
      (async () => {
        try {
          await dispatcher.close();
          process.exit(0);
        } catch {
          // ignore shutdown errors
        }
      })(),
    ]);
    process.exit(0);
  });
