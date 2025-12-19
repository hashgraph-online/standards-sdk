import 'dotenv/config';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  type AgentRegistrationRequest,
} from '../../../src/services/registry-broker';
import {
  MCPServerCapability,
  ProfileType,
  type HCS11Profile,
} from '../../../src/hcs-11/types';
import { resolveHederaLedgerAuthConfig } from '../../utils/ledger-config';

const BASE_URL = 'https://hol.org/registry/api/v1';
const REGISTRY = 'hashgraph-online';
const MCP_VERSION = '2024.10';

const buildMcpProfile = (alias: string, endpoint: string): HCS11Profile => ({
  version: '1.0',
  type: ProfileType.MCP_SERVER,
  display_name: alias,
  alias,
  bio: `Demo MCP server ${alias} registered via the standards-sdk tutorial`,
  properties: {
    tags: ['tutorial', 'sdk', 'registry-broker'],
  },
  socials: [
    {
      platform: 'github',
      handle: 'hashgraphonline',
    },
  ],
  mcpServer: {
    version: MCP_VERSION,
    description: `Demo MCP server for ${alias}`,
    connectionInfo: {
      url: endpoint,
      transport: 'sse',
    },
    services: [
      MCPServerCapability.RESOURCE_PROVIDER,
      MCPServerCapability.TOOL_PROVIDER,
      MCPServerCapability.API_INTEGRATION,
    ],
    maintainer: 'Hashgraph Online Tutorial',
    docs: 'https://docs.hashgraphonline.com/registry-broker',
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
    process.argv[2]?.trim() || `sdk-mcp-demo-${Date.now().toString(36)}`;
  const endpoint =
    process.env.MCP_SERVER_URL?.trim() ||
    `https://mcp-demo.hashgraphonline.com/${alias}`;

  const registrationPayload: AgentRegistrationRequest = {
    profile: buildMcpProfile(alias, endpoint),
    communicationProtocol: 'mcp',
    registry: REGISTRY,
    metadata: { provider: 'sdk-tutorial' },
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
  await main();
};

void runTutorial();
