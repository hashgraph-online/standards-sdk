import 'dotenv/config';
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

const BASE_URL = 'https://hol.org/registry/api/v1';
const REGISTRY = 'hashgraph-online';
const AI_MODEL = 'sdk-demo-model';

let activeAgentHandle: LocalA2AAgentHandle | null = null;

const buildAiProfile = (alias: string, endpoint: string): HCS11Profile => ({
  version: '1.0',
  type: ProfileType.AI_AGENT,
  display_name: alias,
  alias,
  bio: `Demo AI agent ${alias} registered via the standards-sdk tutorial`,
  properties: {
    tags: ['tutorial', 'sdk', 'registry-broker'],
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

const main = async () => {
  const client = new RegistryBrokerClient({
    baseUrl: BASE_URL,
  });

  const hederaLedgerConfig = resolveHederaLedgerAuthConfig();
  await client.authenticateWithLedgerCredentials({
    accountId: hederaLedgerConfig.accountId,
    network: `hedera:${hederaLedgerConfig.network}`,
    hederaPrivateKey: hederaLedgerConfig.privateKey,
    expiresInMinutes: 30,
    label: 'registry-broker-tutorial',
  });

  const alias =
    process.argv[2]?.trim() || `sdk-a2a-demo-${Date.now().toString(36)}`;

  const localAgentHandle = await startLocalA2AAgent({ agentId: alias });
  activeAgentHandle = localAgentHandle;
  const endpoint =
    localAgentHandle.publicUrl ?? localAgentHandle.a2aEndpoint;

  const registrationPayload: AgentRegistrationRequest = {
    profile: buildAiProfile(alias, endpoint),
    communicationProtocol: 'a2a',
    registry: REGISTRY,
    metadata: { provider: 'sdk-tutorial' },
    endpoint,
  };

  try {
    const response = await client.registerAgent(registrationPayload);
    console.log(
      JSON.stringify(
        {
          uaid: response.uaid,
          agentId: response.agentId,
          endpoint,
          additionalRegistries: response.additionalRegistries ?? [],
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (error instanceof RegistryBrokerError) {
      console.error(
        `Register failed (${error.status} ${error.statusText}): ${JSON.stringify(error.body)}`,
      );
    }
    throw error;
  }
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
