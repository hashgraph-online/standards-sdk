import {
  RegistryBrokerClient,
  RegistryBrokerError,
  type SendMessageResponse,
} from '../src/services/registry-broker';
import { PrivateKey } from '@hashgraph/sdk';
import { setTimeout as delay } from 'node:timers/promises';
import {
  AIAgentCapability,
  AIAgentProfile,
  AIAgentType,
  ProfileType,
} from '../src/hcs-11/types';
import {
  LocalA2AAgentHandle,
  startLocalA2AAgent,
} from './utils/local-a2a-agent';
import dotenv from 'dotenv';

dotenv.config();

interface DemoConfig {
  apiKey?: string;
  a2aAgentOneUrl?: string;
  a2aAgentTwoUrl?: string;
  ledgerAccountId?: string;
  ledgerPrivateKey?: string;
  ledgerNetwork?: 'mainnet' | 'testnet';
}

interface RegisteredAgent {
  alias: string;
  uaid: string;
  agentId: string;
}

const OPENROUTER_DEFAULT_UAID =
  'uaid:aid:openrouter-adapter;uid=openrouter/auto;registry=openrouter;proto=openrouter-adapter';

const localAgents: LocalA2AAgentHandle[] = [];

const normaliseMessage = (response: SendMessageResponse): string => {
  const primary = response.message?.trim();
  if (primary) {
    return primary;
  }

  const content = response.content?.trim();
  if (content) {
    return content;
  }

  return '';
};

const cleanupLocalAgents = async (): Promise<void> => {
  if (localAgents.length === 0) {
    return;
  }
  const agents = localAgents.splice(0, localAgents.length);
  await Promise.allSettled(agents.map(agent => agent.stop()));
};

const waitForAgentAvailability = async (
  client: RegistryBrokerClient,
  uaid: string,
  timeoutMs = 15000,
): Promise<void> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const resolved = await client.resolveUaid(uaid);
      if (resolved) {
        return;
      }
    } catch {}
    await delay(500);
  }
  throw new Error(`Agent ${uaid} was not resolved within ${timeoutMs}ms`);
};

const assertAdapterSupport = async (
  client: RegistryBrokerClient,
  baseUrl: string,
  adapterName: string,
): Promise<void> => {
  let adapters;
  try {
    adapters = await client.adapters();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown adapter query failure';
    throw new Error(`Unable to query adapters from ${baseUrl}: ${message}`);
  }
  if (!adapters.adapters.includes(adapterName)) {
    throw new Error(
      `Registry Broker is missing the ${adapterName}. Provide REGISTRY_BROKER_BASE_URL for a broker with A2A support or enable the adapter before running the demo.`,
    );
  }
  console.log(`Broker adapter check: ${adapterName} available.`);
};

const handleSignal = () => {
  cleanupLocalAgents().finally(() => process.exit(0));
};

process.once('SIGINT', handleSignal);
process.once('SIGTERM', handleSignal);

const createAgentProfile = (alias: string): AIAgentProfile => ({
  version: '1.0',
  type: ProfileType.AI_AGENT,
  display_name: alias,
  alias,
  bio: `Temporary agent ${alias} created for the registry broker SDK demo`,
  aiAgent: {
    type: AIAgentType.MANUAL,
    capabilities: [AIAgentCapability.TEXT_GENERATION],
    model: 'demo-model',
    creator: 'sdk-demo',
  },
});

const describeError = (error: unknown): string => {
  if (error instanceof RegistryBrokerError) {
    const bodyMessage =
      typeof error.body === 'object' && error.body && 'error' in error.body
        ? String((error.body as { error?: string }).error ?? 'Unknown error')
        : typeof error.body === 'string'
          ? error.body
          : 'Unknown error';
    return `Registry broker error ${error.status} (${error.statusText}): ${bodyMessage}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const readDemoConfig = (): DemoConfig => ({
  apiKey: process.env.REGISTRY_BROKER_API_KEY?.trim() || undefined,
  a2aAgentOneUrl: process.env.A2A_AGENT_ONE_URL?.trim() || undefined,
  a2aAgentTwoUrl: process.env.A2A_AGENT_TWO_URL?.trim() || undefined,
  ledgerAccountId:
    process.env.HEDERA_ACCOUNT_ID?.trim() ||
    process.env.HEDERA_OPERATOR_ID?.trim() ||
    undefined,
  ledgerPrivateKey:
    process.env.HEDERA_PRIVATE_KEY?.trim() ||
    process.env.HEDERA_OPERATOR_KEY?.trim() ||
    undefined,
  ledgerNetwork:
    process.env.HEDERA_NETWORK?.trim()?.toLowerCase() === 'mainnet'
      ? 'mainnet'
      : 'testnet',
});

const logSection = (title: string) => {
  console.log(`\n=== ${title} ===`);
};

const logStep = (title: string) => {
  console.log(`\n--- ${title} ---`);
};

const runStep = async (title: string, action: () => Promise<void>) => {
  logStep(title);
  try {
    await action();
  } catch (error) {
    console.log(`  ${title} failed: ${describeError(error)}`);
  }
};

const registerDemoAgent = async (
  client: RegistryBrokerClient,
  alias: string,
  endpoint: string,
  autoTopUp?: { accountId: string; privateKey: string },
): Promise<RegisteredAgent> => {
  const registration = await client.registerAgent(
    {
      profile: createAgentProfile(alias),
      endpoint,
      communicationProtocol: 'a2a',
      registry: 'hashgraph-online',
    },
    autoTopUp
      ? {
          autoTopUp: {
            accountId: autoTopUp.accountId,
            privateKey: autoTopUp.privateKey,
            memo: `registry-broker-demo:${alias}`,
          },
        }
      : undefined,
  );

  return {
    alias,
    uaid: registration.uaid,
    agentId: registration.agentId,
  };
};

const showcaseSearchAndDiscovery = async (
  client: RegistryBrokerClient,
  agent: RegisteredAgent,
) => {
  logSection('Discovery & Search');

  await runStep('Keyword search', async () => {
    const result = await client.search({ q: agent.alias, limit: 3 });
    if (result.hits.length === 0) {
      console.log('  No results yet — indexing may still be in progress.');
    }
    result.hits.forEach((hit, index) => {
      console.log(`  Hit ${index + 1}: ${hit.name} [registry=${hit.registry}]`);
    });
  });

  await runStep('Vector search', async () => {
    try {
      const vector = await client.vectorSearch({
        query: 'openrouter',
        limit: 3,
      });
      if (vector.hits.length === 0) {
        console.log('  Vector index available but returned no results.');
      }
      vector.hits.forEach((hit, index) => {
        console.log(`  Vector hit ${index + 1}: ${hit.agent.name}`);
      });
    } catch (error) {
      if (error instanceof RegistryBrokerError && error.status === 501) {
        console.log('  Vector search not available on this deployment (501).');
        return;
      }
      throw error;
    }
  });

  await runStep('Registry namespace search', async () => {
    const namespaceSearch = await client.registrySearchByNamespace(
      'openrouter',
      'meta',
    );
    console.log(
      `  Returned ${namespaceSearch.hits.length} hits from openrouter namespace.`,
    );
  });

  await runStep('Protocols and detection', async () => {
    const protocols = await client.listProtocols();
    console.log(
      `  Supported protocols: ${protocols.protocols.join(', ') || 'none reported'}`,
    );

    const detection = await client.detectProtocol({
      jsonrpc: '2.0',
      method: 'ping',
    });
    console.log(
      `  Detection sample resolved to: ${detection.protocol ?? 'unknown'}`,
    );
  });

  await runStep('UAID utilities', async () => {
    const validation = await client.validateUaid(agent.uaid);
    console.log(`  UAID valid: ${validation.valid}`);
    console.log(`  Supported UAID formats: ${validation.formats.join(', ')}`);
  });
};

const showcaseOperationalInsights = async (client: RegistryBrokerClient) => {
  logSection('Operational Insights');

  await runStep('Registry stats', async () => {
    const stats = await client.stats();
    console.log(`  Total agents: ${stats.totalAgents}`);
    console.log(
      `  Registries indexed: ${Object.keys(stats.registries).length}`,
    );
  });

  await runStep('Metrics summary', async () => {
    const metrics = await client.metricsSummary();
    console.log(`  HTTP requests served: ${metrics.http.requestsTotal}`);
    console.log(`  Active connections: ${metrics.http.activeConnections}`);
    console.log(`  Websocket connections: ${metrics.websocket.connections}`);
  });

  await runStep('Websocket stats', async () => {
    const websocketStats = await client.websocketStats();
    console.log(`  Connected websocket clients: ${websocketStats.clients}`);
  });

  await runStep('Dashboard snapshot', async () => {
    const dashboard = await client.dashboardStats();
    const adapterCount = dashboard.adapters?.length ?? 0;
    console.log(`  Adapters tracked: ${adapterCount}`);
    if (adapterCount > 0 && dashboard.adapters) {
      dashboard.adapters.slice(0, 3).forEach(adapter => {
        console.log(
          `    - ${adapter.name} [${adapter.status}] agents=${adapter.agentCount}`,
        );
      });
      if (adapterCount > 3) {
        console.log(`    … and ${adapterCount - 3} more adapters.`);
      }
    }
  });
};

const showcaseBroadcast = async (client: RegistryBrokerClient) => {
  logSection('Broadcast & Messaging');

  await runStep('Broadcast to OpenRouter UAID', async () => {
    const broadcast = await client.broadcastToUaids(
      [OPENROUTER_DEFAULT_UAID],
      'Registry Broker demo broadcast ping.',
    );

    broadcast.results.forEach(result => {
      console.log(
        `  Result for ${result.uaid}: ${result.success ? 'success' : `failed (${result.error})`}`,
      );
    });
  });
};

const showcaseA2AConversation = async (
  client: RegistryBrokerClient,
  config: DemoConfig,
  autoTopUp?: { accountId: string; privateKey: string },
) => {
  if (!config.a2aAgentOneUrl || !config.a2aAgentTwoUrl) {
    logSection('A2A Conversation');
    console.log(
      'Skipping A2A cross-chat demo – set A2A_AGENT_ONE_URL and A2A_AGENT_TWO_URL to enable.',
    );
    return;
  }

  logSection('A2A Conversation');
  const timestamp = Date.now();
  let agentOne: RegisteredAgent;
  let agentTwo: RegisteredAgent;
  try {
    agentOne = await registerDemoAgent(
      client,
      `sdk-demo-agent-one-${timestamp}`,
      config.a2aAgentOneUrl,
      autoTopUp,
    );
    agentTwo = await registerDemoAgent(
      client,
      `sdk-demo-agent-two-${timestamp}`,
      config.a2aAgentTwoUrl,
      autoTopUp,
    );
  } catch (error) {
    console.log(
      `  Unable to register demo agents via broker: ${describeError(error)}`,
    );
    throw error;
  }

  console.log(`  Agent One UAID: ${agentOne.uaid}`);
  console.log(`  Agent Two UAID: ${agentTwo.uaid}`);

  console.log('  Waiting for broker to resolve agents...');
  try {
    await waitForAgentAvailability(client, agentOne.uaid, 60000);
    await waitForAgentAvailability(client, agentTwo.uaid, 60000);
    console.log('  Broker resolved both agents.');
  } catch (error) {
    console.log(
      `  UAID resolution still pending after waiting: ${describeError(error)}`,
    );
    console.log('  Continuing with broker-mediated chat attempts.');
  }

  const greeting = 'Hello from Agent One! Please say hello back.';

  try {
    const responseFromOne = await client.chat.sendMessage({
      uaid: agentOne.uaid,
      message: greeting,
    });
    const responseFromOneText = normaliseMessage(responseFromOne);
    if (!responseFromOneText) {
      throw new Error('Agent One returned an empty message');
    }
    console.log(`  Agent One replied: ${responseFromOneText}`);

    const responseFromTwo = await client.chat.sendMessage({
      uaid: agentTwo.uaid,
      message: `Agent One says: "${responseFromOneText}". How do you respond?`,
    });
    const responseFromTwoText = normaliseMessage(responseFromTwo);
    if (!responseFromTwoText) {
      throw new Error('Agent Two returned an empty message');
    }
    console.log(`  Agent Two replied: ${responseFromTwoText}`);
  } catch (error) {
    console.log(`  Broker-mediated chat unavailable: ${describeError(error)}`);
  }
};

const showcaseOpenRouterChat = async (client: RegistryBrokerClient) => {
  logSection('OpenRouter UAID Chat');
  try {
    const chatResponse = await client.chat.sendMessage({
      uaid: OPENROUTER_DEFAULT_UAID,
      message: 'Respond with a short greeting for the registry broker demo.',
    });
    console.log('  Chat response received:');
    console.log(`    Session: ${chatResponse.sessionId}`);
    console.log(`    Message: ${chatResponse.message}`);
  } catch (error) {
    console.log(`  Unable to complete chat: ${describeError(error)}`);
  }
};

const showcaseOpenRouterAuthenticatedChat = async (
  client: RegistryBrokerClient,
) => {
  logSection('OpenRouter Authenticated Chat');

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    console.log(
      '  Skipping authenticated OpenRouter chat – set OPENROUTER_API_KEY to enable.',
    );
    return;
  }

  const modelId =
    process.env.OPENROUTER_MODEL_ID?.trim() || 'anthropic/claude-3.5-sonnet';
  const agentUrl = modelId.startsWith('openrouter://')
    ? modelId
    : `openrouter://${modelId}`;
  const auth = { type: 'bearer' as const, token: apiKey };

  try {
    const session = await client.chat.createSession({
      agentUrl,
      auth,
    });

    const response = await client.chat.sendMessage({
      sessionId: session.sessionId,
      auth,
      message:
        'Provide a two sentence description of your capabilities and pricing.',
    });

    console.log('  Chat response received:');
    console.log(`    Session: ${response.sessionId}`);
    console.log(`    Message: ${response.message}`);
  } catch (error) {
    console.log(
      `  Authenticated OpenRouter chat failed: ${describeError(error)}`,
    );
  }
};

const main = async () => {
  console.log('=== Registry Broker Demo ===');
  const config = readDemoConfig();
  const baseUrlEnv = process.env.REGISTRY_BROKER_BASE_URL?.trim();
  const baseUrl =
    baseUrlEnv && baseUrlEnv.length > 0
      ? baseUrlEnv
      : 'http://127.0.0.1:4000/api/v1';
  const client = new RegistryBrokerClient({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    baseUrl,
  });

  let ledgerCredentials: { accountId: string; privateKey: string } | null = null;

  if (config.apiKey) {
    console.log(
      'Using provided REGISTRY_BROKER_API_KEY for authenticated requests.',
    );
  } else {
    console.log(
      'No REGISTRY_BROKER_API_KEY set; some authenticated endpoints may fail.',
    );
  }
  await runStep('Ledger authentication', async () => {
    if (!config.ledgerAccountId || !config.ledgerPrivateKey) {
      throw new Error(
        'HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be set for ledger authentication.',
      );
    }

    console.log(`  Using configured Hedera account: ${config.ledgerAccountId}`);
    const privateKey = PrivateKey.fromString(config.ledgerPrivateKey);

    const challenge = await client.createLedgerChallenge({
      accountId: config.ledgerAccountId,
      network: config.ledgerNetwork ?? 'testnet',
    });

    const signatureBytes = await privateKey.sign(
      Buffer.from(challenge.message, 'utf8'),
    );
    const signature = Buffer.from(signatureBytes).toString('base64');
    const publicKey = privateKey.publicKey.toString();

    const verification = await client.verifyLedgerChallenge({
      challengeId: challenge.challengeId,
      accountId: config.ledgerAccountId,
      network: config.ledgerNetwork ?? 'testnet',
      signature,
      publicKey,
    });

    console.log(
      `  Ledger key issued for ${verification.accountId} on ${verification.network}.`,
    );
    console.log(
      `  Ledger API key prefix: ${verification.apiKey.prefix}…${verification.apiKey.lastFour}`,
    );

    ledgerCredentials = {
      accountId: config.ledgerAccountId,
      privateKey: config.ledgerPrivateKey,
    };
    client.setLedgerApiKey(verification.key);
    client.setDefaultHeader('x-account-id', verification.accountId);
  });

  if (!ledgerCredentials) {
    throw new Error('Ledger authentication failed; unable to continue demo.');
  }

  if (baseUrlEnv) {
    console.log(
      `Using broker base URL from REGISTRY_BROKER_BASE_URL: ${baseUrl}`,
    );
  } else {
    console.log(`Using local broker base URL: ${baseUrl}`);
  }

  await assertAdapterSupport(client, baseUrl, 'a2a-protocol-adapter');

  let registeredAgent: RegisteredAgent | null = null;

  if (!config.a2aAgentOneUrl || !config.a2aAgentTwoUrl) {
    logSection('Local A2A Agent Setup');
    const firstAgent = await startLocalA2AAgent({
      agentId: 'local-demo-agent-one',
    });
    const secondAgent = await startLocalA2AAgent({
      agentId: 'local-demo-agent-two',
    });
    console.log(
      `  Started local agent one at ${firstAgent.localA2aEndpoint}${
        firstAgent.publicUrl ? ` (public: ${firstAgent.a2aEndpoint})` : ''
      }`,
    );
    console.log(
      `  Started local agent two at ${secondAgent.localA2aEndpoint}${
        secondAgent.publicUrl ? ` (public: ${secondAgent.a2aEndpoint})` : ''
      }`,
    );
    localAgents.push(firstAgent, secondAgent);
    config.a2aAgentOneUrl = firstAgent.a2aEndpoint;
    config.a2aAgentTwoUrl = secondAgent.a2aEndpoint;
  }

  await runStep('Agent Registration', async () => {
    const alias = `sdk-demo-agent-${Date.now()}`;
    console.log(`Registering agent with alias: ${alias}`);
    const agent = await registerDemoAgent(
      client,
      alias,
      config.a2aAgentOneUrl ?? 'https://example.com/agent',
      ledgerCredentials ?? undefined,
    );
    registeredAgent = agent;
    console.log('  Registration complete:');
    console.log(`    UAID: ${agent.uaid}`);
    console.log(`    Agent ID: ${agent.agentId}`);
  });

  if (registeredAgent) {
    await showcaseSearchAndDiscovery(client, registeredAgent);
    await showcaseOperationalInsights(client);
    await showcaseBroadcast(client);
  } else {
    console.log(
      'Skipping discovery and broadcast steps because no agent was registered.',
    );
  }

  if (registeredAgent) {
    await runStep('A2A Conversation', async () => {
      await showcaseA2AConversation(
        client,
        config,
        ledgerCredentials ?? undefined,
      );
    });
  } else {
    console.log(
      'Skipping A2A conversation because no agent was registered.',
    );
  }
  await showcaseOpenRouterAuthenticatedChat(client);
  await showcaseOpenRouterChat(client);

  await cleanupLocalAgents();
};

main()
  .then(async () => {
    await cleanupLocalAgents();
    process.exit(0);
  })
  .catch(async error => {
    console.error('Demo failed:', describeError(error));
    await cleanupLocalAgents();
    process.exit(1);
  });
