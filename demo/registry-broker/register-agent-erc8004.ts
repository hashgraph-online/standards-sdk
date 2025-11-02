import 'dotenv/config';
import { Agent, fetch as undiciFetch } from 'undici';
import { PrivateKey } from '@hashgraph/sdk';
import registerDemoAgent, {
  type DemoProfileMode,
  type RegisterAgentOptions,
} from './register-agent';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
} from '../../src/services/registry-broker';
import {
  startLocalA2AAgent,
  type LocalA2AAgentHandle,
} from '../utils/local-a2a-agent';

const DEFAULT_BASE_URL = 'https://registry.hashgraphonline.com/api/v1';
const DEFAULT_MODE: DemoProfileMode = 'ai';

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

const resolveEnv = (primary: string, fallback?: string): string | undefined => {
  const candidate = process.env[primary]?.trim();
  if (candidate && candidate.length > 0) {
    return candidate;
  }
  if (fallback) {
    const fallbackValue = process.env[fallback]?.trim();
    if (fallbackValue && fallbackValue.length > 0) {
      return fallbackValue;
    }
  }
  return undefined;
};

const requireValue = (value: string | undefined, label: string): string => {
  if (!value) {
    throw new Error(
      `${label} is required. Set it via .env or environment variables.`,
    );
  }
  return value;
};

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

type LedgerNetwork = 'mainnet' | 'testnet';

const resolveLedgerNetwork = (): LedgerNetwork =>
  (process.env.HEDERA_NETWORK ?? 'testnet').trim().toLowerCase() === 'mainnet'
    ? 'mainnet'
    : 'testnet';

const resolveNetworkScopedLedgerValue = (
  network: LedgerNetwork,
  suffix: 'ACCOUNT_ID' | 'PRIVATE_KEY',
): string | undefined => {
  const scopePrefix = network === 'mainnet' ? 'MAINNET' : 'TESTNET';
  return process.env[`${scopePrefix}_HEDERA_${suffix}`]?.trim();
};

const main = async (): Promise<void> => {
  const baseUrl =
    process.env.REGISTRY_BROKER_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const apiKey = process.env.REGISTRY_BROKER_API_KEY?.trim();
  const preferLedger = parseBooleanFlag(
    process.env.REGISTRY_BROKER_DEMO_USE_LEDGER,
    !apiKey,
  );

  let ledgerNetwork: LedgerNetwork | undefined;
  let accountId: string | undefined;
  let privateKeyRaw: string | undefined;

  if (preferLedger) {
    ledgerNetwork = resolveLedgerNetwork();
    const scopedAccount = resolveNetworkScopedLedgerValue(
      ledgerNetwork,
      'ACCOUNT_ID',
    );
    const scopedKey = resolveNetworkScopedLedgerValue(
      ledgerNetwork,
      'PRIVATE_KEY',
    );

    accountId = requireValue(
      scopedAccount ??
        resolveEnv('HEDERA_ACCOUNT_ID', 'TESTNET_HEDERA_ACCOUNT_ID'),
      `${ledgerNetwork.toUpperCase()} account ID`,
    );

    privateKeyRaw = requireValue(
      scopedKey ??
        resolveEnv('HEDERA_PRIVATE_KEY', 'TESTNET_HEDERA_PRIVATE_KEY'),
      `${ledgerNetwork.toUpperCase()} private key`,
    );
  } else if (!apiKey) {
    throw new Error(
      'Provide REGISTRY_BROKER_API_KEY or enable ledger authentication via REGISTRY_BROKER_DEMO_USE_LEDGER=1.',
    );
  }

  const client = new RegistryBrokerClient({
    baseUrl,
    fetchImplementation: fetchImpl,
    ...(apiKey ? { apiKey } : {}),
    ...(preferLedger &&
    parseBooleanFlag(process.env.REGISTRY_BROKER_DEMO_AUTO_TOP_UP, true)
      ? {
          registrationAutoTopUp: {
            accountId: accountId!,
            privateKey: privateKeyRaw!,
          },
          historyAutoTopUp: {
            accountId: accountId!,
            privateKey: privateKeyRaw!,
          },
        }
      : {}),
  });

  if (preferLedger) {
    console.log(`Authenticating ledger account on ${ledgerNetwork}…`);
    const privateKey = PrivateKey.fromString(privateKeyRaw!);
    const challenge = await client.createLedgerChallenge({
      accountId: accountId!,
      network: ledgerNetwork!,
    });
    const signature = Buffer.from(
      await privateKey.sign(Buffer.from(challenge.message, 'utf8')),
    ).toString('base64');
    const publicKey = privateKey.publicKey.toString();
    const verification = await client.verifyLedgerChallenge({
      challengeId: challenge.challengeId,
      accountId: accountId!,
      network: ledgerNetwork!,
      signature,
      publicKey,
    });

    client.setDefaultHeader('x-account-id', verification.accountId);
    console.log(
      `Ledger authentication complete. Issued API key prefix: ${verification.apiKey.prefix}…${verification.apiKey.lastFour}`,
    );
  } else {
    console.log('Using provided REGISTRY_BROKER_API_KEY for authentication.');
  }

  const alias =
    process.argv[2]?.trim() || `sdk-erc8004-demo-${Date.now().toString(36)}`;

  const registerOptions: RegisterAgentOptions = {
    ...(preferLedger
      ? {
          ledgerAccountId: accountId,
          ledgerPrivateKey: privateKeyRaw,
        }
      : {}),
    additionalRegistries: [],
    updateAdditionalRegistries:
      process.env.REGISTRY_BROKER_DEMO_SKIP_ERC8004 === '1' ? [] : ['erc-8004'],
  };

  console.log(
    `Preparing to register agent "${alias}" via ${baseUrl} (mode: ${DEFAULT_MODE}).`,
  );
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
    } else if (error instanceof Error) {
      console.error('Failed to register agent:', error.message);
    } else {
      console.error('Failed to register agent:', error);
    }
    throw error;
  }

  const summary = {
    uaid: registered.uaid,
    agentId: registered.agentId,
    endpoint: localAgentHandle?.publicUrl ?? localAgentHandle?.a2aEndpoint,
    localEndpoint: localAgentHandle?.localA2aEndpoint,
    additionalRegistries:
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
        } catch {
          // ignore shutdown errors
        }
      })(),
    ]);
  });
