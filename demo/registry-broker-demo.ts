import { RegistryBrokerClient, RegistryBrokerError } from '../src/services/registry-broker';
import {
  AIAgentCapability,
  AIAgentType,
  ProfileType,
} from '../src/hcs-11/types';
import {
  LocalA2AAgentHandle,
  startLocalA2AAgent,
} from './utils/local-a2a-agent';

interface DemoConfig {
  apiKey?: string;
  a2aAgentOneUrl?: string;
  a2aAgentTwoUrl?: string;
}

interface RegisteredAgent {
  alias: string;
  uaid: string;
  agentId: string;
}

const OPENROUTER_DEFAULT_UAID =
  'uaid:aid:openrouter-adapter;uid=openrouter/auto;registry=openrouter;proto=openrouter-adapter';

const localAgents: LocalA2AAgentHandle[] = [];

const cleanupLocalAgents = async (): Promise<void> => {
  if (localAgents.length === 0) {
    return;
  }
  const agents = localAgents.splice(0, localAgents.length);
  await Promise.allSettled(agents.map(agent => agent.stop()));
};

const handleSignal = () => {
  cleanupLocalAgents().finally(() => process.exit(0));
};

process.once('SIGINT', handleSignal);
process.once('SIGTERM', handleSignal);

const createAgentProfile = (alias: string) => ({
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

const sendLocalA2AMessage = async (endpoint: string, message: string): Promise<string> => {
  const rpcRequest = {
    jsonrpc: '2.0',
    method: 'message/send',
    params: {
      message: {
        kind: 'message',
        messageId: `demo-${Date.now()}`,
        role: 'user',
        parts: [
          {
            kind: 'text',
            text: message,
          },
        ],
      },
      configuration: {
        blocking: true,
        acceptedOutputModes: ['text/plain'],
      },
    },
    id: Date.now(),
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(rpcRequest),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message ?? 'Unknown RPC error');
  }

  const result = payload.result;
  const text = result?.parts?.[0]?.text;
  if (typeof text === 'string' && text.length > 0) {
    return text;
  }
  return JSON.stringify(result);
};

const registerDemoAgent = async (
  client: RegistryBrokerClient,
  alias: string,
  endpoint: string,
): Promise<RegisteredAgent> => {
  const registration = await client.registerAgent({
    profile: createAgentProfile(alias),
    endpoint,
    communicationProtocol: 'a2a',
    registry: 'hashgraph-online',
  });

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
      const vector = await client.vectorSearch({ query: 'openrouter', limit: 3 });
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
    const namespaceSearch = await client.registrySearchByNamespace('openrouter', 'meta');
    console.log(`  Returned ${namespaceSearch.hits.length} hits from openrouter namespace.`);
  });

  await runStep('Protocols and detection', async () => {
    const protocols = await client.listProtocols();
    console.log(`  Supported protocols: ${protocols.protocols.join(', ') || 'none reported'}`);

    const detection = await client.detectProtocol({ jsonrpc: '2.0', method: 'ping' });
    console.log(`  Detection sample resolved to: ${detection.protocol ?? 'unknown'}`);
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
    console.log(`  Registries indexed: ${Object.keys(stats.registries).length}`);
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
        console.log(`    - ${adapter.name} [${adapter.status}] agents=${adapter.agentCount}`);
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
  const agentOne = await registerDemoAgent(
    client,
    `sdk-demo-agent-one-${timestamp}`,
    config.a2aAgentOneUrl,
  );
  const agentTwo = await registerDemoAgent(
    client,
    `sdk-demo-agent-two-${timestamp}`,
    config.a2aAgentTwoUrl,
  );

  console.log(`  Agent One UAID: ${agentOne.uaid}`);
  console.log(`  Agent Two UAID: ${agentTwo.uaid}`);

  const greeting = 'Hello from Agent One! Please say hello back.';

  try {
    const agentOneSession = await client.chat.createSession({
      agentUrl: config.a2aAgentOneUrl,
    });
    let responseFromOneText = '';
    try {
      const responseFromOne = await client.chat.sendMessage({
        agentUrl: config.a2aAgentOneUrl,
        sessionId: agentOneSession.sessionId,
        message: greeting,
      });
      console.log(`  Agent One replied: ${responseFromOne.message}`);
      responseFromOneText = responseFromOne.message;
    } catch (error) {
      throw error;
    } finally {
      await client.chat.endSession(agentOneSession.sessionId).catch(() => undefined);
    }

    const agentTwoSession = await client.chat.createSession({
      agentUrl: config.a2aAgentTwoUrl,
    });
    try {
      const responseFromTwo = await client.chat.sendMessage({
        agentUrl: config.a2aAgentTwoUrl,
        sessionId: agentTwoSession.sessionId,
        message: `Agent One says: "${responseFromOneText}". How do you respond?`,
      });
      console.log(`  Agent Two replied: ${responseFromTwo.message}`);
    } finally {
      await client.chat.endSession(agentTwoSession.sessionId).catch(() => undefined);
    }
  } catch (error) {
    console.log(`  Broker-mediated chat unavailable: ${describeError(error)}`);
    console.log('  Falling back to direct local A2A conversation.');
    const agentOneHandle =
      localAgents.find(agent => agent.a2aEndpoint === config.a2aAgentOneUrl) ?? null;
    const agentTwoHandle =
      localAgents.find(agent => agent.a2aEndpoint === config.a2aAgentTwoUrl) ?? null;

    const responseFromOne = await sendLocalA2AMessage(
      agentOneHandle?.localA2aEndpoint ?? config.a2aAgentOneUrl,
      greeting,
    );
    console.log(`  Agent One replied (local): ${responseFromOne}`);
    const responseFromTwo = await sendLocalA2AMessage(
      agentTwoHandle?.localA2aEndpoint ?? config.a2aAgentTwoUrl,
      `Agent One says: "${responseFromOne}". How do you respond?`,
    );
    console.log(`  Agent Two replied (local): ${responseFromTwo}`);
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

const main = async () => {
  console.log('=== Registry Broker Demo ===');
  const config = readDemoConfig();
  const baseUrl = process.env.REGISTRY_BROKER_BASE_URL || undefined;
  const client = new RegistryBrokerClient({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });

  if (config.apiKey) {
    console.log('Using provided REGISTRY_BROKER_API_KEY for authenticated requests.');
  } else {
    console.log('No REGISTRY_BROKER_API_KEY set; some authenticated endpoints may fail.');
  }
  if (baseUrl) {
    console.log(`Using custom broker base URL: ${baseUrl}`);
  }

  if (!config.a2aAgentOneUrl || !config.a2aAgentTwoUrl) {
    logSection('Local A2A Agent Setup');
    const firstAgent = await startLocalA2AAgent({ agentId: 'local-demo-agent-one' });
    const secondAgent = await startLocalA2AAgent({ agentId: 'local-demo-agent-two' });
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

  logSection('Agent Registration');
  const alias = `sdk-demo-agent-${Date.now()}`;
  console.log(`Registering agent with alias: ${alias}`);
  const agent = await registerDemoAgent(client, alias, 'https://example.com/agent');
  console.log('Registration complete:');
  console.log(`  UAID: ${agent.uaid}`);
  console.log(`  Agent ID: ${agent.agentId}`);

  await showcaseSearchAndDiscovery(client, agent);
  await showcaseOperationalInsights(client);
  await showcaseBroadcast(client);
  await showcaseA2AConversation(client, config);
  await showcaseOpenRouterChat(client);

  await cleanupLocalAgents();
};

main()
  .catch(error => {
    console.error('Demo failed:', describeError(error));
    return 1;
  })
  .then(async exitCode => {
    await cleanupLocalAgents();
    if (exitCode) {
      process.exit(exitCode);
    }
  });
