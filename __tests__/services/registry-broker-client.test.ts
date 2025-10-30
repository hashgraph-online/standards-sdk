import { jest } from '@jest/globals';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  RegistryBrokerParseError,
} from '../../src/services/registry-broker';
import type { AgentAuthConfig } from '../../src/services/registry-broker';

const mockSearchResponse = {
  hits: [
    {
      id: 'agent-1',
      uaid: 'uaid:aid:example;uid=agent-1;registry=demo;proto=demo;nativeId=agent-1',
      registry: 'demo',
      name: 'Demo Agent',
      description: 'Example agent',
      capabilities: [0],
      endpoints: {
        primary: 'https://demo.agent/tasks/send',
      },
      metadata: {
        protocol: 'demo',
      },
      profile: {
        version: '1.0',
        type: 1,
        display_name: 'Demo Agent',
        aiAgent: {
          type: 1,
          creator: 'demo',
          model: 'demo-model',
          capabilities: [0],
        },
        uaid: 'uaid:aid:example;uid=agent-1;registry=demo;proto=demo;nativeId=agent-1',
      },
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      lastSeen: '2025-01-01T00:00:00.000Z',
      lastIndexed: '2025-01-01T00:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  limit: 1,
};

const mockSessionResponse = {
  sessionId: 'session-1',
  uaid: null,
  agent: {
    name: 'Demo Agent',
    description: 'Example agent',
    capabilities: {},
    skills: [],
  },
  history: [],
  historyTtlSeconds: 900,
};

const mockHistorySnapshot = {
  sessionId: 'session-1',
  history: [
    {
      messageId: 'm-1',
      role: 'user' as const,
      content: 'Hello there',
      timestamp: '2025-01-01T00:00:00.000Z',
    },
  ],
  historyTtlSeconds: 900,
};

const mockCompactionResponse = {
  sessionId: 'session-1',
  summaryEntry: {
    messageId: 'summary-1',
    role: 'agent' as const,
    content: 'Summary text',
    timestamp: '2025-01-01T00:05:00.000Z',
    metadata: { summary: true },
  },
  preservedEntries: [
    {
      messageId: 'm-2',
      role: 'user' as const,
      content: 'Recent entry',
      timestamp: '2025-01-01T00:04:00.000Z',
    },
  ],
  history: [
    {
      messageId: 'summary-1',
      role: 'agent' as const,
      content: 'Summary text',
      timestamp: '2025-01-01T00:05:00.000Z',
      metadata: { summary: true },
    },
  ],
  historyTtlSeconds: 900,
  creditsDebited: 3,
  metadata: {
    summarizedEntries: 5,
    preservedEntries: 1,
  },
};

const baseProfile = {
  version: '1.0',
  type: 1,
  display_name: 'Demo Agent',
  aiAgent: {
    type: 1,
    capabilities: [0],
    model: 'demo-model',
  },
};

const mockRegisterResponse = {
  success: true,
  status: 'created' as const,
  uaid: 'uaid:test',
  agentId: 'agent-xyz',
  message: 'Agent registered successfully',
  agent: {
    id: 'agent-xyz',
    name: 'Demo Agent',
    type: 'AI_AGENT',
    capabilities: [],
    registry: 'hashgraph-online',
    protocol: 'a2a',
    profile: baseProfile,
    nativeId: 'demo-native',
    metadata: {},
  },
  openConvAI: { compatible: true },
  profile: { tId: '0.0.inline', sizeBytes: 512 },
};

const quoteNeedsCredits = {
  accountId: '0.0.1234',
  registry: 'hashgraph-online',
  protocol: 'a2a',
  requiredCredits: 120,
  availableCredits: 20,
  shortfallCredits: 100,
  creditsPerHbar: 100,
  estimatedHbar: 1,
};

const purchaseResponse = {
  success: true,
  purchaser: '0.0.1234',
  credits: 100,
  hbarAmount: 1,
  transactionId: '0.0.1234@567',
  consensusTimestamp: '1700000000.123456789',
};

const mockMessageResponse = {
  sessionId: 'session-1',
  uaid: null,
  message: 'Hello',
  timestamp: '2025-01-01T00:00:00.000Z',
};

const mockStatsResponse = {
  totalAgents: 1,
  registries: {
    demo: 1,
  },
  capabilities: {
    text_generation: 1,
  },
  lastUpdate: '2025-01-01T00:00:00.000Z',
  status: 'operational',
};

const mockRegistriesResponse = {
  registries: ['demo', 'openrouter'],
};

const mockPopularResponse = {
  searches: ['demo'],
};

const mockResolveResponse = {
  agent: mockSearchResponse.hits[0],
};

type FetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  headers?: Headers;
};

describe('RegistryBrokerClient', () => {
  const createResponse = (overrides: Partial<FetchResponse>): FetchResponse => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => mockSearchResponse,
    text: async () => JSON.stringify(mockSearchResponse),
    headers: new Headers({ 'content-type': 'application/json' }),
    ...overrides,
  });

  let fetchImplementation: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchImplementation = jest.fn();
  });

  it('normalises base URL and appends version suffix', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({ json: async () => mockSearchResponse }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    await client.search({ limit: 1 });

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [targetUrl] = fetchImplementation.mock.calls[0];
    expect(targetUrl).toBe('https://api.example.com/api/v1/search?limit=1');
  });

  it('throws RegistryBrokerError on non-OK response', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        json: async () => ({ error: 'boom' }),
      }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    await expect(client.search({ limit: 1 })).rejects.toBeInstanceOf(
      RegistryBrokerError,
    );
  });

  it('handles error body parsing failures gracefully', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: async () => {
          throw new Error('bad-json');
        },
      }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    await expect(client.search({ limit: 1 })).rejects.toMatchObject({
      body: {
        parseError: expect.stringContaining('Error: bad-json'),
      },
    });
  });

  it('falls back when text body extraction fails', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => {
          throw new Error('bad-text');
        },
      }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    await expect(client.search({ limit: 1 })).rejects.toMatchObject({
      body: {
        parseError: 'Error: bad-text',
      },
    });
  });

  it('retrieves a registration quote', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({ json: async () => quoteNeedsCredits }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const quote = await client.getRegistrationQuote({ profile: baseProfile });

    expect(quote.requiredCredits).toBe(120);
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/register/quote',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('automatically purchases credits when autoTopUp is provided', async () => {
    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const internal = client as unknown as {
      ensureCreditsForRegistration: jest.Mock;
      performRegisterAgent: jest.Mock;
    };

    const autoTopUp = {
      accountId: '0.0.1234',
      privateKey: '302e020100300506032b657004220420demo',
    };

    const ensureSpy = jest.fn().mockResolvedValue(undefined);
    const insufficientError = new RegistryBrokerError(
      'Insufficient credits for registration',
      {
        status: 402,
        statusText: 'Payment Required',
        body: { shortfallCredits: 25 },
      },
    );
    const performSpy = jest
      .fn()
      .mockRejectedValueOnce(insufficientError)
      .mockResolvedValueOnce(mockRegisterResponse as any);

    internal.ensureCreditsForRegistration = ensureSpy;
    internal.performRegisterAgent = performSpy;

    const result = await client.registerAgent(
      { profile: baseProfile },
      {
        autoTopUp,
      },
    );

    expect(result.agentId).toBe('agent-xyz');
    expect(ensureSpy).toHaveBeenCalledTimes(2);
    expect(ensureSpy).toHaveBeenNthCalledWith(
      1,
      { profile: baseProfile },
      expect.objectContaining(autoTopUp),
    );
    expect(performSpy).toHaveBeenCalledTimes(2);
    const [firstEnsureOrder] = ensureSpy.mock.invocationCallOrder;
    const [firstPerformOrder] = performSpy.mock.invocationCallOrder;
    expect(firstEnsureOrder).toBeLessThan(firstPerformOrder);
  });

  it('purchases at least one credit when the shortfall is fractional', async () => {
    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const autoTopUp = {
      accountId: '0.0.1234',
      privateKey: '302e020100300506032b657004220420demo',
    };

    const fractionalQuote = {
      ...quoteNeedsCredits,
      shortfallCredits: 0.04,
      creditsPerHbar: 25,
    };
    const settledQuote = {
      ...quoteNeedsCredits,
      shortfallCredits: 0,
      availableCredits: 101,
    };

    const quoteSpy = jest
      .spyOn(client, 'getRegistrationQuote')
      .mockResolvedValueOnce(fractionalQuote as any)
      .mockResolvedValueOnce(settledQuote as any);

    const purchaseSpy = jest
      .spyOn(client, 'purchaseCreditsWithHbar')
      .mockResolvedValue(purchaseResponse as any);

    const internal = client as unknown as {
      performRegisterAgent: jest.Mock;
    };

    internal.performRegisterAgent = jest
      .fn()
      .mockResolvedValue(mockRegisterResponse as any);

    await client.registerAgent(
      { profile: baseProfile },
      {
        autoTopUp,
      },
    );

    expect(purchaseSpy).toHaveBeenCalledTimes(1);
    const expectedHbarAmount =
      Math.ceil((1 / fractionalQuote.creditsPerHbar) * 1e8) / 1e8;
    expect(purchaseSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: autoTopUp.accountId,
        hbarAmount: expectedHbarAmount,
      }),
    );

    purchaseSpy.mockRestore();
    quoteSpy.mockRestore();
  });

  it('applies default registration auto top-up when options are omitted', async () => {
    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
      registrationAutoTopUp: {
        accountId: '0.0.1234',
        privateKey: '302e020100300506032b657004220420demo',
      },
    });

    const internal = client as unknown as {
      ensureCreditsForRegistration: jest.Mock;
      performRegisterAgent: jest.Mock;
    };
    internal.ensureCreditsForRegistration = jest.fn().mockResolvedValue(undefined);
    internal.performRegisterAgent = jest
      .fn()
      .mockResolvedValue(mockRegisterResponse as any);

    await client.registerAgent({ profile: baseProfile });

    expect(internal.ensureCreditsForRegistration).toHaveBeenCalledWith(
      { profile: baseProfile },
      expect.objectContaining({ accountId: '0.0.1234' }),
    );
    expect(internal.performRegisterAgent).toHaveBeenCalledTimes(1);
  });

  it('allows internal request helper to return the raw response', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({}) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const internal = client as unknown as {
      request: (path: string, config: Record<string, unknown>) => Promise<Response>;
    };

    const response = await internal.request('/health', { method: 'GET' });
    expect(response.status).toBe(200);
  });

  it('throws RegistryBrokerParseError when schema validation fails', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({ json: async () => ({}) }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    await expect(client.search({ limit: 1 })).rejects.toBeInstanceOf(
      RegistryBrokerParseError,
    );
  });

  it('supports chat session flow and endSession', async () => {
    fetchImplementation
      .mockResolvedValueOnce(
        createResponse({ json: async () => mockSessionResponse }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        createResponse({ json: async () => mockMessageResponse }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        createResponse({
          status: 204,
          ok: true,
          json: async () => undefined,
          text: async () => '',
        }) as unknown as Response,
      );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const auth: AgentAuthConfig = { type: 'bearer', token: 'user-key' };
    const session = await client.chat.createSession({
      agentUrl: 'https://demo.agent',
      auth,
    });
    expect(session.sessionId).toBe('session-1');

    const message = await client.chat.sendMessage({
      agentUrl: 'https://demo.agent',
      sessionId: 'session-1',
      message: 'Hi',
      auth,
    });
    expect(message.message).toBe('Hello');

    await expect(client.chat.endSession('session-1')).resolves.toBeUndefined();

    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/api/v1/chat/session',
      expect.objectContaining({ method: 'POST' }),
    );
    const sessionRequestInit = fetchImplementation.mock.calls[0][1] as RequestInit;
    expect(
      JSON.parse(sessionRequestInit.body as string),
    ).toEqual({
      agentUrl: 'https://demo.agent',
      auth: { type: 'bearer', token: 'user-key' },
    });
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/api/v1/chat/message',
      expect.objectContaining({ method: 'POST' }),
    );
    const messageRequestInit = fetchImplementation.mock.calls[1][1] as RequestInit;
    expect(
      JSON.parse(messageRequestInit.body as string),
    ).toEqual({
      agentUrl: 'https://demo.agent',
      auth: { type: 'bearer', token: 'user-key' },
      message: 'Hi',
      sessionId: 'session-1',
    });
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      3,
      'https://api.example.com/api/v1/chat/session/session-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('retrieves chat history snapshot for a session', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({ json: async () => mockHistorySnapshot }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const snapshot = await client.chat.getHistory('session-1');

    expect(snapshot.historyTtlSeconds).toBe(900);
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/chat/session/session-1/history',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('compacts chat history via API', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({ json: async () => mockCompactionResponse }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const response = await client.chat.compactHistory({
      sessionId: 'session-1',
      preserveEntries: 2,
    });

    expect(response.summaryEntry.content).toBe('Summary text');
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/chat/session/session-1/compact',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('auto tops up chat history and retries the session once', async () => {
    const extendedSession = { ...mockSessionResponse, historyTtlSeconds: 7200 };
    fetchImplementation
      .mockResolvedValueOnce(
        createResponse({
          ok: false,
          status: 402,
          statusText: 'Payment Required',
          json: async () => ({
            error: 'Insufficient credits for extended chat history',
          }),
        }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        createResponse({ json: async () => purchaseResponse }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        createResponse({ json: async () => extendedSession }) as unknown as Response,
      );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
      historyAutoTopUp: {
        accountId: '0.0.9999',
        privateKey: '302e020100300506032b657004220420history',
        hbarAmount: 0.5,
      },
    });

    const session = await client.chat.createSession({
      agentUrl: 'https://demo.agent',
      auth: { type: 'bearer', token: 'user-key' },
      historyTtlSeconds: 7200,
    });

    expect(session.historyTtlSeconds).toBe(7200);
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/api/v1/chat/session',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/api/v1/credits/purchase',
      expect.objectContaining({ method: 'POST' }),
    );
    const purchaseInit = fetchImplementation.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(purchaseInit.body as string).hbarAmount).toBe(0.5);
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      3,
      'https://api.example.com/api/v1/chat/session',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('defaults to production registry broker base URL', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({ json: async () => mockSearchResponse }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({ fetchImplementation });

    await client.search({ limit: 1 });

    const [targetUrl] = fetchImplementation.mock.calls[0];
    expect(targetUrl).toBe(
      'https://registry.hashgraphonline.com/api/v1/search?limit=1',
    );
  });

  it('builds search queries with optional filters', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({ json: async () => mockSearchResponse }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImplementation,
    });

    await client.search({
      q: 'demo',
      page: 2,
      limit: 5,
      registry: 'demo',
      minTrust: 50,
      capabilities: ['text_generation', 'knowledge_retrieval'],
    });

    const [targetUrl] = fetchImplementation.mock.calls[0];
    expect(targetUrl).toBe(
      'https://api.example.com/api/v1/search?q=demo&page=2&limit=5&registry=demo&minTrust=50&capabilities=text_generation&capabilities=knowledge_retrieval',
    );
  });

  it('retrieves stats, registries, popular searches, and resolves UAIDs', async () => {
    fetchImplementation
      .mockResolvedValueOnce(
        createResponse({ json: async () => mockStatsResponse }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        createResponse({ json: async () => mockRegistriesResponse }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        createResponse({ json: async () => mockPopularResponse }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        createResponse({ json: async () => mockResolveResponse }) as unknown as Response,
      );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const stats = await client.stats();
    expect(stats.totalAgents).toBe(1);

    const registries = await client.registries();
    expect(registries.registries).toContain('demo');

    const popular = await client.popularSearches();
    expect(popular.searches[0]).toBe('demo');

    const resolved = await client.resolveUaid('uaid:aid:example;uid=agent-1');
    expect(resolved.agent.id).toBe('agent-1');
  });

  it('throws parse error when non-JSON payload is returned', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'not-json',
      }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    await expect(client.stats()).rejects.toBeInstanceOf(RegistryBrokerParseError);
  });

  it('requires a fetch implementation when none is available globally', () => {
    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: undefined,
      writable: true,
    });

    try {
      expect(() => new RegistryBrokerClient()).toThrow(
        'A fetch implementation is required for RegistryBrokerClient',
      );
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
        writable: true,
      });
    }
  });
});
