import {
  RegistryBrokerClient,
  RegistryBrokerError,
  RegistryBrokerParseError,
  type ResolvedAgentResponse,
  type ChatHistoryEntry,
  type SendMessageResponse,
} from '../../src/services/registry-broker';
import registerDemoAgent, {
  type DemoProfileMode,
  type RegisteredAgent,
} from './register-agent';
import { PrivateKey } from '@hashgraph/sdk';
import { setTimeout as delay } from 'node:timers/promises';
import { HCS11Profile } from '../../src/hcs-11/types';
import { ZodError } from 'zod';
import {
  LocalA2AAgentHandle,
  startLocalA2AAgent,
} from '../utils/local-a2a-agent';
import {
  assertAdapterSupport,
  normaliseMessage,
  waitForAgentAvailability,
} from '../utils/registry-broker';
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

const resolveProfileMode = (): DemoProfileMode => {
  const argProfile = process.argv
    .map(arg => arg.trim())
    .find(arg => arg.startsWith('--profile='));
  const inlineFlag = process.argv.includes('--mcp')
    ? 'mcp'
    : process.argv.includes('--ai')
      ? 'ai'
      : undefined;

  const candidate =
    (argProfile ? argProfile.split('=')[1] : undefined) ??
    inlineFlag ??
    process.env.REGISTRY_BROKER_DEMO_PROFILE?.trim()?.toLowerCase();

  return candidate === 'mcp' ? 'mcp' : 'ai';
};

const profileMode: DemoProfileMode = resolveProfileMode();
const preferredHistoryTtlSeconds = (() => {
  const raw = process.env.CHAT_HISTORY_TTL_SECONDS?.trim();
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.log(
      'Ignoring CHAT_HISTORY_TTL_SECONDS because it is not a positive number.',
    );
    return undefined;
  }
  return parsed;
})();

const generateHistoryProbeToken = (): string =>
  `rbk-context-${Date.now().toString(36)}-${Math.floor(Math.random() * 10_000)
    .toString(16)
    .padStart(3, '0')}`;

const OPENROUTER_DEFAULT_UAID =
  'uaid:aid:openrouter-adapter;uid=openrouter/auto;registry=openrouter;proto=openrouter-adapter';

const localAgents: LocalA2AAgentHandle[] = [];
const skipOptionalDemos = process.env.SKIP_OPTIONAL_DEMOS === '1';
const skipHistoryCompactionDemo =
  process.env.SKIP_HISTORY_COMPACTION_DEMO === '1';

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

  if (error instanceof RegistryBrokerParseError) {
    return `Registry broker parse error: ${error.message}`;
  }

  if (error instanceof Error) {
    if ('cause' in error && error.cause) {
      return `${error.message}: ${String(error.cause)}`;
    }
    return error.message;
  }

  return String(error);
};

type LedgerNetwork = 'mainnet' | 'testnet';

const resolveLedgerNetwork = (): LedgerNetwork =>
  process.env.HEDERA_NETWORK?.trim()?.toLowerCase() === 'mainnet'
    ? 'mainnet'
    : 'testnet';

const resolveNetworkScopedLedgerValue = (
  network: LedgerNetwork,
  key: 'ACCOUNT_ID' | 'PRIVATE_KEY',
): string | undefined => {
  const prefix = network === 'mainnet' ? 'MAINNET' : 'TESTNET';
  const envKey = `${prefix}_HEDERA_${key}` as keyof NodeJS.ProcessEnv;
  const value = process.env[envKey];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
};

const readDemoConfig = (): DemoConfig => {
  const ledgerNetwork = resolveLedgerNetwork();
  const scopedAccountId = resolveNetworkScopedLedgerValue(
    ledgerNetwork,
    'ACCOUNT_ID',
  );
  const scopedPrivateKey = resolveNetworkScopedLedgerValue(
    ledgerNetwork,
    'PRIVATE_KEY',
  );

  return {
    apiKey: process.env.REGISTRY_BROKER_API_KEY?.trim() || undefined,
    a2aAgentOneUrl: process.env.A2A_AGENT_ONE_URL?.trim() || undefined,
    a2aAgentTwoUrl: process.env.A2A_AGENT_TWO_URL?.trim() || undefined,
    ledgerAccountId:
      scopedAccountId ||
      process.env.HEDERA_ACCOUNT_ID?.trim() ||
      process.env.HEDERA_OPERATOR_ID?.trim() ||
      undefined,
    ledgerPrivateKey:
      scopedPrivateKey ||
      process.env.HEDERA_PRIVATE_KEY?.trim() ||
      process.env.HEDERA_OPERATOR_KEY?.trim() ||
      undefined,
    ledgerNetwork,
  };
};

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

const truncateHistoryContent = (content: string, maxLength = 160): string =>
  content.length > maxLength ? `${content.slice(0, maxLength - 1)}…` : content;

const logChatHistory = (
  history: ChatHistoryEntry[] | undefined,
  label: string,
): void => {
  if (!history) {
    console.log(`    ${label}: history not provided by broker.`);
    return;
  }
  if (history.length === 0) {
    console.log(`    ${label}: history is empty.`);
    return;
  }

  console.log(
    `    ${label}: ${history.length} entr${history.length === 1 ? 'y' : 'ies'}`,
  );
  history.forEach((entry, index) => {
    console.log(
      `      ${index + 1}. [${entry.role}] ${new Date(entry.timestamp).toISOString()} :: ${truncateHistoryContent(entry.content)}`,
    );
  });
};

const getLatestAgentHistoryEntry = (
  history?: ChatHistoryEntry[],
): ChatHistoryEntry | undefined =>
  history?.filter(entry => entry.role === 'agent').slice(-1)[0];

const describeLatestAgentReply = (
  response: Pick<SendMessageResponse, 'history'>,
): ChatHistoryEntry | undefined => getLatestAgentHistoryEntry(response.history);

const updateDemoAgent = async (
  client: RegistryBrokerClient,
  agent: RegisteredAgent,
  config: DemoConfig,
  mode: DemoProfileMode,
  ledgerCredentials?: { accountId: string; privateKey: string } | null,
) => {
  logSection('Agent Update');

  console.log('  Waiting for registry to surface agent before update...');
  try {
    await waitForAgentAvailability(client, agent.uaid, 120000);
  } catch (error) {
    console.log(
      `  Agent not yet indexed after wait: ${describeError(error)}. Proceeding with retry logic...`,
    );
  }

  const baseUrl =
    process.env.REGISTRY_BROKER_BASE_URL?.trim() ??
    'http://127.0.0.1:4000/api/v1';

  const buildHeaders = () => {
    const headers = new Headers();
    const defaults = client.getDefaultHeaders();
    Object.entries(defaults).forEach(([key, value]) => {
      headers.set(key, value);
    });
    headers.set('content-type', 'application/json');
    headers.set('accept', 'application/json');
    return headers;
  };

  const buildUpdatePayload = (
    current: ResolvedAgentResponse['agent'],
  ):
    | {
        profile: HCS11Profile;
        endpoint: string;
        communicationProtocol: 'a2a';
        registry: string;
        metadata?: Record<string, unknown>;
      }
    | {
        profile: HCS11Profile;
        communicationProtocol: 'mcp';
        registry: string;
        metadata?: Record<string, unknown>;
      } => {
    if (!current.profile) {
      throw new Error('Resolved agent did not include a profile');
    }

    const profileCopy = JSON.parse(
      JSON.stringify(current.profile),
    ) as HCS11Profile;

    if (mode === 'ai') {
      profileCopy.bio = `Updated profile for ${agent.alias} via the registry broker demo`;
      if (profileCopy.aiAgent) {
        profileCopy.aiAgent.model = 'demo-model';
      }

      const primaryEndpoint =
        typeof current.endpoints === 'object' && current.endpoints
          ? Array.isArray(current.endpoints)
            ? current.endpoints[0]
            : ((current.endpoints as Record<string, unknown>).primary as
                | string
                | undefined)
          : undefined;
      const baseEndpoint =
        primaryEndpoint ?? config.a2aAgentOneUrl ?? 'https://example.com/agent';
      const updatedEndpoint = `${baseEndpoint.replace(/\/$/, '')}?refresh=${Date.now()}`;

      return {
        profile: profileCopy,
        endpoint: updatedEndpoint,
        communicationProtocol: 'a2a',
        registry: current.registry ?? 'hashgraph-online',
        metadata: {
          provider: 'sdk-demo-update',
        },
      };
    }

    if (!profileCopy.mcpServer) {
      throw new Error('Expected MCP server profile for update');
    }
    profileCopy.bio = `Updated MCP server profile for ${agent.alias}`;
    profileCopy.mcpServer.description = `Updated MCP server description for ${agent.alias}`;
    profileCopy.mcpServer.docs = 'https://docs.hashgraphonline.com/mcp-demo';

    return {
      profile: profileCopy,
      communicationProtocol: 'mcp',
      registry: current.registry ?? 'hashgraph-online',
      metadata: {
        provider: 'sdk-demo-mcp-update',
      },
    };
  };

  const submitUpdate = async (
    payload:
      | {
          profile: HCS11Profile;
          endpoint: string;
          communicationProtocol: 'a2a';
          registry: string;
          metadata?: Record<string, unknown>;
        }
      | {
          profile: HCS11Profile;
          communicationProtocol: 'mcp';
          registry: string;
          metadata?: Record<string, unknown>;
        },
  ) => {
    const response = await fetch(
      `${baseUrl}/register/${encodeURIComponent(agent.uaid)}`,
      {
        method: 'PUT',
        headers: buildHeaders(),
        body: JSON.stringify(payload),
      },
    );
    const body = await response.json().catch(() => null);
    return { response, body };
  };

  const handleSuccess = (body: any) => {
    console.log('  Agent update successful.');
    console.log(`    New profile topic: ${body?.profile?.tId ?? 'unknown'}`);
    if (body?.profileRegistry) {
      console.log(
        `    Profile registry topic: ${body.profileRegistry.topicId} (${body.profileRegistry.sequenceNumber ?? 'n/a'})`,
      );
    }
  };

  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let resolved: ResolvedAgentResponse;
    try {
      resolved = await client.resolveUaid(agent.uaid);
    } catch (error) {
      console.log(
        `  Resolve attempt ${attempt + 1}/${maxAttempts} failed: ${describeError(error)}. Retrying in 10s...`,
      );
      await delay(10000);
      continue;
    }

    let updatePayload: ReturnType<typeof buildUpdatePayload>;
    try {
      updatePayload = buildUpdatePayload(resolved.agent);
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }

    const { response, body } = await submitUpdate(updatePayload);

    if (response.status === 404) {
      console.log(
        `  Update attempt ${attempt + 1}/${maxAttempts} returned 404 (agent not yet indexed). Retrying in 10s...`,
      );
      await delay(10000);
      continue;
    }

    if (response.status === 402) {
      if (!ledgerCredentials) {
        throw new Error(
          'Agent update requires additional credits but ledger credentials were not provided.',
        );
      }
      const shortfallCredits = Number(body?.shortfallCredits ?? 0);
      const creditsPerHbar = Number(body?.creditsPerHbar ?? 0);
      const estimatedHbar = Number(body?.estimatedHbar ?? 0);
      if (shortfallCredits <= 0) {
        throw new Error(
          'Received insufficient credits response without shortfall details.',
        );
      }
      const paddedCredits = shortfallCredits + 1;
      const resolvedHbarAmount =
        creditsPerHbar > 0
          ? Math.ceil((paddedCredits / creditsPerHbar) * 1e8) / 1e8
          : estimatedHbar > 0
            ? estimatedHbar
            : null;
      if (!resolvedHbarAmount || resolvedHbarAmount <= 0) {
        throw new Error('Unable to resolve HBAR amount for credit top-up.');
      }
      console.log(
        `  Purchasing credits to cover update shortfall (${shortfallCredits} credits).`,
      );
      await client.purchaseCreditsWithHbar({
        accountId: ledgerCredentials.accountId,
        privateKey: ledgerCredentials.privateKey,
        hbarAmount: resolvedHbarAmount,
        memo: `registry-broker-demo:update:${agent.alias}`,
        metadata: {
          purpose: 'agent-update',
          shortfallCredits,
          requestedCredits: paddedCredits,
        },
      });
      await delay(2000);
      const retry = await submitUpdate(updatePayload);
      if (retry.response.status === 404) {
        console.log(
          `  Update retry returned 404 (agent not yet indexed). Retrying in 10s...`,
        );
        await delay(10000);
        continue;
      }
      if (!retry.response.ok) {
        throw new Error(
          `Update retry failed with status ${retry.response.status}: ${JSON.stringify(retry.body)}`,
        );
      }
      handleSuccess(retry.body);
      return;
    }

    if (!response.ok) {
      throw new Error(
        `Agent update failed with status ${response.status}: ${JSON.stringify(body)}`,
      );
    }

    handleSuccess(body);
    return;
  }

  throw new Error('Agent update failed after multiple retries');
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

const showcaseA2AConversation = async (
  client: RegistryBrokerClient,
  config: DemoConfig,
) => {
  if (skipOptionalDemos) {
    logSection('A2A Conversation');
    console.log('Skipping A2A conversation (SKIP_OPTIONAL_DEMOS=1).');
    return;
  }
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
      'ai',
      {
        skipAdditionalRegistryUpdate: true,
      },
    );
    agentTwo = await registerDemoAgent(
      client,
      `sdk-demo-agent-two-${timestamp}`,
      config.a2aAgentTwoUrl,
      'ai',
      {
        skipAdditionalRegistryUpdate: true,
      },
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
  if (skipOptionalDemos) {
    logSection('OpenRouter UAID Chat');
    console.log('Skipping OpenRouter UAID chat (SKIP_OPTIONAL_DEMOS=1).');
    return;
  }
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
  ledgerCredentials?: { accountId: string; privateKey: string } | null,
) => {
  if (skipOptionalDemos) {
    logSection('OpenRouter Authenticated Chat');
    console.log(
      'Skipping authenticated OpenRouter chat (SKIP_OPTIONAL_DEMOS=1).',
    );
    return;
  }
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
      historyTtlSeconds: preferredHistoryTtlSeconds,
    });

    console.log(
      `    History TTL: ${session.historyTtlSeconds ?? 'default'} seconds`,
    );
    logChatHistory(session.history, 'Initial history snapshot');

    const capabilitiesPrompt =
      'Provide a two sentence description of your capabilities and pricing.';
    const response = await client.chat.sendMessage({
      sessionId: session.sessionId,
      auth,
      message: capabilitiesPrompt,
    });

    console.log('  Chat response received:');
    console.log(`    Session: ${response.sessionId}`);
    console.log(`    Message: ${response.message}`);
    console.log(
      `    History TTL: ${response.historyTtlSeconds ?? 'default'} seconds`,
    );
    logChatHistory(response.history, 'History after first prompt');

    const latestAgentEntry = describeLatestAgentReply(response);
    if (latestAgentEntry) {
      console.log(
        `    Latest agent reply captured for context: "${truncateHistoryContent(latestAgentEntry.content, 120)}"`,
      );
    } else {
      console.log(
        '    No agent reply recorded in history after the first prompt.',
      );
    }

    const memoryToken = generateHistoryProbeToken();
    const memoryPrompt = `Remember this code phrase for later use in this session: ${memoryToken}. Confirm once.`;
    const memoryResponse = await client.chat.sendMessage({
      sessionId: session.sessionId,
      auth,
      message: memoryPrompt,
    });
    console.log('  Memory prompt response received:');
    console.log(`    Message: ${memoryResponse.message}`);
    console.log(
      `    History TTL: ${memoryResponse.historyTtlSeconds ?? 'default'} seconds`,
    );
    logChatHistory(memoryResponse.history, 'History after memory prompt');

    const recallPrompt =
      'Without me repeating it, what code phrase did I ask you to store earlier? Reply using only that phrase.';
    const recallResponse = await client.chat.sendMessage({
      sessionId: session.sessionId,
      auth,
      message: recallPrompt,
    });
    console.log('  Recall response received:');
    console.log(`    Message: ${recallResponse.message}`);
    console.log(
      `    History TTL: ${recallResponse.historyTtlSeconds ?? 'default'} seconds`,
    );
    logChatHistory(recallResponse.history, 'History after recall prompt');

    const tokenMatched = recallResponse.message
      .toLowerCase()
      .includes(memoryToken.toLowerCase());
    const historyContainsToken = recallResponse.history?.some(entry =>
      entry.content.includes(memoryToken),
    );
    if (tokenMatched) {
      console.log(
        `    ✅ Chat history verified: agent recalled stored phrase "${memoryToken}".`,
      );
    } else if (historyContainsToken) {
      console.log(
        `    ⚠️ Agent declined to repeat "${memoryToken}", but broker history retained the phrase for downstream consumers.`,
      );
    } else {
      console.log(
        `    ⚠️ Chat history check failed; expected phrase "${memoryToken}" was missing.`,
      );
    }

    await showcaseHistoryCompaction(
      client,
      session.sessionId,
      ledgerCredentials,
    );
  } catch (error) {
    console.log(
      `  Authenticated OpenRouter chat failed: ${describeError(error)}`,
    );
  }
};

const showcaseHistoryCompaction = async (
  client: RegistryBrokerClient,
  sessionId: string,
  ledgerCredentials?: { accountId: string; privateKey: string } | null,
) => {
  if (skipHistoryCompactionDemo) {
    console.log(
      '  Skipping history compaction (SKIP_HISTORY_COMPACTION_DEMO=1).',
    );
    return;
  }

  console.log('\n--- Chat History Compaction ---');
  try {
    console.log(
      '  Requesting compaction with the latest 4 entries preserved...',
    );
    await attemptHistoryCompaction(client, sessionId, ledgerCredentials);
  } catch (error) {
    console.log(`  History compaction unavailable: ${describeError(error)}`);
  }
};

const attemptHistoryCompaction = async (
  client: RegistryBrokerClient,
  sessionId: string,
  ledgerCredentials?: { accountId: string; privateKey: string } | null,
): Promise<void> => {
  const performCompaction = async () => {
    const compaction = await client.chat.compactHistory({
      sessionId,
      preserveEntries: 4,
    });
    console.log('  Compaction successful.');
    console.log(`    Credits debited: ${compaction.creditsDebited ?? 'n/a'}`);
    console.log(
      `    Summary entry: ${truncateHistoryContent(compaction.summaryEntry.content, 200)}`,
    );
    const snapshot = await client.chat.getHistory(sessionId);
    console.log(
      `    Snapshot now contains ${snapshot.history.length} entr${snapshot.history.length === 1 ? 'y' : 'ies'}.`,
    );
  };

  try {
    await performCompaction();
    return;
  } catch (error) {
    if (
      error instanceof RegistryBrokerError &&
      error.status === 402 &&
      ledgerCredentials
    ) {
      console.log(
        '  Insufficient credits; purchasing a top-up for compaction...',
      );
      await client.purchaseCreditsWithHbar({
        accountId: ledgerCredentials.accountId,
        privateKey: ledgerCredentials.privateKey,
        hbarAmount: 0.2,
        memo: 'registry-broker-demo:history-compaction',
        metadata: {
          purpose: 'history-compaction',
        },
      });
      await delay(2000);
      await performCompaction();
      return;
    }
    throw error;
  }
};

const ensureDemoCreditBalance = async (
  client: RegistryBrokerClient,
  ledgerCredentials: { accountId: string; privateKey: string },
): Promise<void> => {
  try {
    console.log('  Purchasing credits to cover demo flows on testnet...');
    await client.purchaseCreditsWithHbar({
      accountId: ledgerCredentials.accountId,
      privateKey: ledgerCredentials.privateKey,
      hbarAmount: Number(process.env.DEMO_CREDIT_TOP_UP_HBAR ?? '0.25') || 0.25,
      memo: 'registry-broker-demo:bootstrap-credits',
      metadata: { purpose: 'demo-bootstrap' },
    });
    console.log('  Demo credit purchase successful.');
  } catch (error) {
    console.log(
      `  Unable to purchase demo credits automatically: ${describeError(error)}`,
    );
  }
};

const main = async () => {
  console.log('=== Registry Broker Demo ===');
  console.log(`Profile mode: ${profileMode.toUpperCase()}`);
  const config = readDemoConfig();
  const baseUrlEnv = process.env.REGISTRY_BROKER_BASE_URL?.trim();
  const baseUrl =
    baseUrlEnv && baseUrlEnv.length > 0
      ? baseUrlEnv
      : 'http://127.0.0.1:4000/api/v1';
  const autoTopUpCredentials =
    config.ledgerAccountId && config.ledgerPrivateKey
      ? {
          accountId: config.ledgerAccountId,
          privateKey: config.ledgerPrivateKey,
        }
      : undefined;
  const client = new RegistryBrokerClient({
    baseUrl,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(autoTopUpCredentials
      ? {
          registrationAutoTopUp: autoTopUpCredentials,
          historyAutoTopUp: { ...autoTopUpCredentials },
        }
      : {}),
  });

  let ledgerCredentials: { accountId: string; privateKey: string } | null =
    null;

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

    let attemptError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
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
        return;
      } catch (error) {
        attemptError = error;
        console.log(
          `  Ledger auth attempt ${attempt + 1} failed: ${describeError(error)}`,
        );
        await delay(1000 * (attempt + 1));
      }
    }

    throw attemptError instanceof Error
      ? attemptError
      : new Error(describeError(attemptError));
  });

  if (!ledgerCredentials) {
    throw new Error('Ledger authentication failed; unable to continue demo.');
  }

  if (config.ledgerNetwork === 'testnet') {
    await ensureDemoCreditBalance(client, ledgerCredentials);
  }

  if (baseUrlEnv) {
    console.log(
      `Using broker base URL from REGISTRY_BROKER_BASE_URL: ${baseUrl}`,
    );
  } else {
    console.log(`Using local broker base URL: ${baseUrl}`);
  }

  const requiredAdapter =
    profileMode === 'mcp' ? 'mcp-adapter' : 'a2a-protocol-adapter';
  await assertAdapterSupport(client, baseUrl, requiredAdapter);

  let registeredAgent: RegisteredAgent | null = null;

  if (
    profileMode === 'ai' &&
    (!config.a2aAgentOneUrl || !config.a2aAgentTwoUrl)
  ) {
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
    const registrationEndpoint =
      profileMode === 'ai'
        ? (config.a2aAgentOneUrl ?? 'https://example.com/agent')
        : `https://mcp-demo.hashgraphonline.com/${alias}`;
    const agent = await registerDemoAgent(
      client,
      alias,
      registrationEndpoint,
      profileMode,
      {
        ledgerAccountId: ledgerCredentials.accountId,
        ledgerPrivateKey: ledgerCredentials.privateKey,
      },
    );
    registeredAgent = agent;
    console.log('  Registration complete:');
    console.log(`    UAID: ${agent.uaid}`);
    console.log(`    Agent ID: ${agent.agentId}`);
  });

  if (registeredAgent) {
    await showcaseSearchAndDiscovery(client, registeredAgent);
    await showcaseOperationalInsights(client);
  } else {
    console.log('Skipping discovery steps because no agent was registered.');
  }

  if (profileMode === 'ai' && registeredAgent) {
    await runStep('A2A Conversation', async () => {
      await showcaseA2AConversation(client, config);
    });
  } else if (profileMode === 'ai') {
    console.log('Skipping A2A conversation because no agent was registered.');
  } else {
    console.log(
      'Skipping A2A conversation (not applicable for MCP profile mode).',
    );
  }
  await showcaseOpenRouterAuthenticatedChat(client, ledgerCredentials);
  await showcaseOpenRouterChat(client);

  if (registeredAgent) {
    await runStep('Agent Profile Update', async () => {
      await updateDemoAgent(
        client,
        registeredAgent,
        config,
        profileMode,
        ledgerCredentials,
      );
    });
  } else {
    console.log('Skipping agent update because no agent is registered.');
  }

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
