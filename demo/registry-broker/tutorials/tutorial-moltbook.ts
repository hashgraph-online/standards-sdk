import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import { fetch } from 'undici';

import {
  RegistryBrokerClient,
  RegistryBrokerError,
  type AgentRegistrationRequest,
} from '../../../src/services/registry-broker';
import {
  AIAgentCapability,
  AIAgentType,
  ProfileType,
  type HCS11Profile,
} from '../../../src/hcs-11/types';
import {
  startLocalA2AAgent,
  type LocalA2AAgentHandle,
} from '../../utils/local-a2a-agent';
import { resolveHederaLedgerAuthConfig } from '../../utils/ledger-config';

const DEFAULT_BROKER_BASE_URL = 'http://127.0.0.1:4000/api/v1';
const DEFAULT_MOLTBOOK_BASE_URL = 'https://www.moltbook.com/api/v1';
const REGISTRY = 'hashgraph-online';
const AI_MODEL = 'sdk-demo-model';
const MOLTBOOK_REGISTRY_KEY = 'moltbook:main';

type TutorialCliArgs = {
  alias?: string;
  brokerBaseUrl?: string;
  brokerAccountId?: string;
};

type MoltbookSecrets = {
  apiKey: string;
  claimUrl?: string;
  verificationCode?: string;
  tweetTemplate?: string;
};

const parseCliArgs = (argv: string[]): TutorialCliArgs => {
  const args: TutorialCliArgs = {};
  const rest = argv.slice(2);
  const positionals: string[] = [];

  for (let i = 0; i < rest.length; i += 1) {
    const entry = rest[i];
    if (!entry) {
      continue;
    }
    if (entry === '--broker') {
      const value = rest[i + 1];
      if (value) {
        args.brokerBaseUrl = value;
        i += 1;
      }
      continue;
    }
    if (entry === '--account-id') {
      const value = rest[i + 1];
      if (value) {
        args.brokerAccountId = value;
        i += 1;
      }
      continue;
    }
    if (entry.startsWith('--')) {
      continue;
    }
    positionals.push(entry);
  }

  if (positionals.length > 0) {
    args.alias = positionals[0];
  }
  return args;
};

const buildAiProfile = (alias: string, endpoint: string): HCS11Profile => ({
  version: '1.0',
  type: ProfileType.AI_AGENT,
  display_name: alias,
  alias,
  bio: `Demo AI agent ${alias} registered via the standards-sdk tutorial`,
  properties: {
    tags: ['tutorial', 'sdk', 'registry-broker', 'moltbook'],
    agentFactsUrl: `${endpoint.replace(/\/$/, '')}/.well-known/agent.json`,
  },
  socials: [
    {
      platform: 'x',
      handle: 'hashgraphonline',
    },
  ],
  aiAgent: {
    type: AIAgentType.MANUAL,
    model: AI_MODEL,
    capabilities: [
      AIAgentCapability.TEXT_GENERATION,
      AIAgentCapability.CODE_GENERATION,
      AIAgentCapability.WORKFLOW_AUTOMATION,
    ],
    creator: 'standards-sdk tutorial',
  },
});

const resolveBrokerBaseUrl = (cli: TutorialCliArgs): string => {
  const cliValue = cli.brokerBaseUrl?.trim() ?? '';
  if (cliValue.length > 0) {
    return cliValue;
  }
  const raw =
    process.env.REGISTRY_BROKER_BASE_URL ??
    process.env.REGISTRY_BROKER_URL ??
    process.env.HOL_REGISTRY_BROKER_BASE_URL ??
    '';
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_BROKER_BASE_URL;
};

const resolveBrokerAccountId = (cli: TutorialCliArgs): string => {
  const cliValue = cli.brokerAccountId?.trim() ?? '';
  if (cliValue.length > 0) {
    return cliValue;
  }
  const raw =
    process.env.REGISTRY_BROKER_ACCOUNT_ID ??
    process.env.HEDERA_OPERATOR_ID ??
    '0.0.1234';
  return raw.trim().length > 0 ? raw.trim() : '0.0.1234';
};

const resolveMoltbookBaseUrl = (): string => {
  const raw = process.env.MOLTBOOK_BASE_URL ?? '';
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_MOLTBOOK_BASE_URL;
};

const resolveOptionalLedgerAuth = async (
  client: RegistryBrokerClient,
): Promise<void> => {
  const apiKey = process.env.REGISTRY_BROKER_API_KEY?.trim();
  if (apiKey) {
    client.setApiKey(apiKey);
    return;
  }

  const ledgerAccountId = process.env.HEDERA_OPERATOR_ID?.trim();
  const ledgerPrivateKey = process.env.HEDERA_OPERATOR_KEY?.trim();
  const ledgerNetwork = process.env.HEDERA_NETWORK?.trim();
  if (!ledgerAccountId || !ledgerPrivateKey || !ledgerNetwork) {
    return;
  }

  const hederaLedgerConfig = resolveHederaLedgerAuthConfig();
  await client.authenticateWithLedgerCredentials({
    accountId: hederaLedgerConfig.accountId,
    network: `hedera:${hederaLedgerConfig.network}`,
    hederaPrivateKey: hederaLedgerConfig.privateKey,
    expiresInMinutes: 30,
    label: 'registry-broker-tutorial-moltbook',
  });
};

const parseMoltbookSecrets = (payload: unknown): MoltbookSecrets | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const apiKeyRaw = record.apiKey;
  if (typeof apiKeyRaw !== 'string' || apiKeyRaw.trim().length === 0) {
    return null;
  }
  const asOptionalString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;

  return {
    apiKey: apiKeyRaw.trim(),
    claimUrl: asOptionalString(record.claimUrl),
    verificationCode: asOptionalString(record.verificationCode),
    tweetTemplate: asOptionalString(record.tweetTemplate),
  };
};

const fetchMoltbookMe = async (
  baseUrl: string,
  apiKey: string,
): Promise<{ status: number; ok: boolean; payload: unknown; raw: string }> => {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/agents/me`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const text = await response.text();
  const payload = (() => {
    const trimmed = text.trim();
    if (!trimmed.length) {
      return null;
    }
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return trimmed;
    }
  })();
  return { status: response.status, ok: response.ok, payload, raw: text };
};

const isClaimed = (payload: unknown): boolean | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const claimed = record.is_claimed;
  if (typeof claimed === 'boolean') {
    return claimed;
  }
  const agent = record.agent;
  if (agent && typeof agent === 'object') {
    const agentClaimed = (agent as Record<string, unknown>).is_claimed;
    if (typeof agentClaimed === 'boolean') {
      return agentClaimed;
    }
  }
  return null;
};

let activeAgentHandle: LocalA2AAgentHandle | null = null;

const main = async () => {
  const cli = parseCliArgs(process.argv);
  const client = new RegistryBrokerClient({
    baseUrl: resolveBrokerBaseUrl(cli),
    accountId: resolveBrokerAccountId(cli),
  });
  await resolveOptionalLedgerAuth(client);

  const alias =
    cli.alias?.trim() || `sdk-moltbook-demo-${Date.now().toString(36)}`;

  const localAgentHandle = await startLocalA2AAgent({ agentId: alias });
  activeAgentHandle = localAgentHandle;
  const endpoint = localAgentHandle.publicUrl ?? localAgentHandle.a2aEndpoint;

  const registrationPayload: AgentRegistrationRequest = {
    profile: buildAiProfile(alias, endpoint),
    communicationProtocol: 'a2a',
    registry: REGISTRY,
    metadata: { provider: 'sdk-tutorial', demo: 'moltbook' },
    endpoint,
  };

  let registrationResponse: Awaited<
    ReturnType<RegistryBrokerClient['registerAgent']>
  >;
  try {
    registrationResponse = await client.registerAgent(registrationPayload);
  } catch (error) {
    if (error instanceof RegistryBrokerError) {
      console.error(
        `Register failed (${error.status} ${error.statusText}): ${JSON.stringify(error.body)}`,
      );
    }
    throw error;
  }

  const updatePayload: AgentRegistrationRequest = {
    profile: registrationPayload.profile,
    communicationProtocol: registrationPayload.communicationProtocol,
    registry: registrationPayload.registry,
    metadata: registrationPayload.metadata,
    endpoint: registrationPayload.endpoint,
    additionalRegistries: [MOLTBOOK_REGISTRY_KEY],
  };

  let updateResponse: Awaited<ReturnType<RegistryBrokerClient['updateAgent']>>;
  try {
    updateResponse = await client.updateAgent(
      registrationResponse.uaid,
      updatePayload,
    );
  } catch (error) {
    if (error instanceof RegistryBrokerError) {
      console.error(
        `Update failed (${error.status} ${error.statusText}): ${JSON.stringify(error.body)}`,
      );
    }
    throw error;
  }

  const secretsRaw =
    updateResponse.additionalRegistrySecrets?.[MOLTBOOK_REGISTRY_KEY];
  const secrets = parseMoltbookSecrets(secretsRaw);

  console.log(
    JSON.stringify(
      {
        uaid: registrationResponse.uaid,
        agentId: registrationResponse.agentId,
        endpoint,
        additionalRegistries: updateResponse.additionalRegistries ?? [],
        moltbook: secrets
          ? {
              claimUrl: secrets.claimUrl ?? null,
              verificationCode: secrets.verificationCode ?? null,
              tweetTemplate: secrets.tweetTemplate ?? null,
            }
          : null,
      },
      null,
      2,
    ),
  );

  if (!secrets) {
    console.log(
      `No Moltbook secrets returned for ${MOLTBOOK_REGISTRY_KEY}. Ensure Registry Broker has MOLTBOOK_REGISTRATION_ENABLED=true.`,
    );
    return;
  }

  const moltbookBaseUrl = resolveMoltbookBaseUrl();
  console.log('\nMoltbook claim flow:');
  console.log(
    `- 1) Post the claim tweet (must include the verification code) using the X handle you want to associate with this Moltbook agent.`,
  );
  if (secrets.tweetTemplate) {
    console.log(`- Tweet template:\n${secrets.tweetTemplate}`);
  } else if (secrets.verificationCode) {
    console.log(`- Verification code: ${secrets.verificationCode}`);
  }
  if (secrets.claimUrl) {
    console.log(
      `- 2) Open the claim URL and follow the Moltbook prompts: ${secrets.claimUrl}`,
    );
  }

  console.log(
    '\nPolling Moltbook /agents/me to detect when the agent is claimed...',
  );
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const meResult = await fetchMoltbookMe(moltbookBaseUrl, secrets.apiKey);
    if (!meResult.ok) {
      const error = (() => {
        if (!meResult.payload || typeof meResult.payload !== 'object') {
          return null;
        }
        return (meResult.payload as Record<string, unknown>).error;
      })();
      if (meResult.status === 401 && error === 'Agent not yet claimed') {
        console.log('Moltbook agent not claimed yet.');
        await delay(5_000);
        continue;
      }
      throw new Error(
        `Moltbook /agents/me failed: HTTP ${meResult.status} ${meResult.raw}`,
      );
    }

    const claimed = isClaimed(meResult.payload);
    if (claimed === true) {
      console.log('Moltbook agent is claimed ✅');
      return;
    }
    if (claimed === false) {
      console.log('Moltbook agent not claimed yet.');
    } else {
      console.log(
        'Moltbook /agents/me did not include is_claimed; continuing.',
      );
    }
    await delay(5_000);
  }

  console.log(
    'Timed out waiting for Moltbook claim to complete. Re-run this script after posting the claim tweet and completing the claim URL flow.',
  );
};

const runTutorial = async () => {
  try {
    await main();
  } finally {
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
  }
};

void runTutorial();
