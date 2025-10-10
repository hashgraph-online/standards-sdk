import { jest } from '@jest/globals';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
} from '../../src/services/registry-broker';
import {
  AIAgentCapability,
  AIAgentType,
  ProfileType,
} from '../../src/hcs-11/types';

jest.setTimeout(90000);

describe('RegistryBrokerClient (integration)', () => {
  const apiKey =
    process.env.REGISTRY_BROKER_API_KEY ||
    process.env.RB_API_KEY ||
    'rbk_8875323d68cd4e7633d31996a5fbdefb6a16ae82225bf178ab12ded55a09d2c0';
  const client = new RegistryBrokerClient({ apiKey });
  const openRouterUaid =
    'uaid:aid:openrouter-adapter;uid=openrouter/auto;registry=openrouter;proto=openrouter-adapter';

  it('performs a discovery search against the live registry', async () => {
    const result = await client.search({ limit: 1 });
    expect(Array.isArray(result.hits)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it('creates and closes a chat session for an openrouter agent URL', async () => {
    const agentUrl = 'https://openrouter.ai/api/v1/chat/completions';
    const session = await client.chat.createSession({ agentUrl });
    expect(typeof session.sessionId).toBe('string');
    expect(session.sessionId.length).toBeGreaterThan(0);

    await expect(client.chat.endSession(session.sessionId)).resolves.toBeUndefined();
  });

  it('registers an agent and returns registration metadata', async () => {
    const alias = `sdk-integration-test-agent-${Date.now()}`;
    const registration = await client.registerAgent({
      profile: {
        version: '1.0',
        type: ProfileType.AI_AGENT,
        display_name: 'SDK Integration Test Agent',
        alias,
        bio: 'Temporary agent for verifying registry-broker register endpoint.',
        aiAgent: {
          type: AIAgentType.MANUAL,
          capabilities: [AIAgentCapability.TEXT_GENERATION],
          model: 'test-model',
          creator: 'integration-test',
        },
      },
      endpoint: 'https://example.com/agent',
      communicationProtocol: 'a2a',
      registry: 'hashgraph-online',
    });

    expect(registration.success).toBe(true);
    expect(typeof registration.uaid).toBe('string');
    expect(registration.uaid).toContain(alias);
    expect(registration.agent.profile.alias).toBe(alias);
    expect(registration.openConvAI.compatible).toBe(true);
  });

  it('provides protocol metadata, registry search, broadcast, and UAID utilities', async () => {
    const protocols = await client.listProtocols();
    expect(Array.isArray(protocols.protocols)).toBe(true);

    const detection = await client.detectProtocol({ jsonrpc: '2.0', method: 'ping' });
    expect(detection).toHaveProperty('protocol');

    const registrySearch = await client.registrySearchByNamespace('openrouter', 'meta');
    expect(Array.isArray(registrySearch.hits)).toBe(true);

    try {
      const vectorSearch = await client.vectorSearch({ query: 'openrouter' });
      expect(vectorSearch.hits.length).toBeGreaterThanOrEqual(0);
    } catch (error) {
      expect(error).toBeInstanceOf(RegistryBrokerError);
      expect((error as RegistryBrokerError).status).toBe(501);
    }

    const websocketStats = await client.websocketStats();
    expect(typeof websocketStats.clients).toBe('number');

    const metrics = await client.metricsSummary();
    expect(typeof metrics.http.requestsTotal).toBe('number');

    const validation = await client.validateUaid(openRouterUaid);
    expect(validation.valid).toBe(true);

    const connectionStatus = await client.getUaidConnectionStatus(openRouterUaid);
    expect(connectionStatus.adapter).toBe('openrouter-adapter');

    const broadcast = await client.broadcastToUaids([
      openRouterUaid,
    ], 'Respond with ok for integration utilities test.');
    expect(Array.isArray(broadcast.results)).toBe(true);
    expect(broadcast.results.length).toBeGreaterThan(0);

    await expect(client.closeUaidConnection(openRouterUaid)).resolves.toBeUndefined();

    const dashboardStats = await client.dashboardStats();
    expect(Array.isArray(dashboardStats.adapters)).toBe(true);
  });
});
