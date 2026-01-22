import { jest } from '@jest/globals';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  RegistryBrokerParseError,
  isPendingRegisterAgentResponse,
  isPartialRegisterAgentResponse,
  isSuccessRegisterAgentResponse,
} from '../../src/services/registry-broker';
import { PrivateKey } from '@hashgraph/sdk';
import type {
  AgentAuthConfig,
  RegisterAgentResponse,
  RegistrationProgressRecord,
  ChatHistoryEntry,
} from '../../src/services/registry-broker';

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
  encryption: null,
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
  rawResponse: {
    status: 200,
    headers: {
      'x-payment-status': 'SETTLED',
    },
  },
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

const mockAdditionalRegistryCatalog = {
  registries: [
    {
      id: 'erc-8004',
      label: 'ERC-8004',
      networks: [
        {
          key: 'erc-8004:ethereum-sepolia',
          networkId: 'ethereum-sepolia',
          name: 'Ethereum Sepolia',
          label: 'Ethereum Sepolia',
          chainId: 11155111,
          estimatedCredits: 10.25,
          creditMode: 'gas',
        },
      ],
    },
  ],
};

const pendingRegisterResponse = {
  success: true,
  status: 'pending' as const,
  message:
    'Primary registry published. Additional registries are being processed in the background.',
  uaid: 'uaid:aid:pending;uid=agent-pending;registry=hashgraph-online;proto=a2a;nativeId=agent-pending',
  agentId: 'agent-pending',
  registry: 'hashgraph-online',
  attemptId: 'attempt-pending',
  agent: {
    id: 'agent-pending',
    name: 'Pending Agent',
    type: 'ai_agent',
    endpoint: 'https://pending.example.com/a2a',
    capabilities: ['text_generation'],
    registry: 'hashgraph-online',
    protocol: 'a2a',
    profile: JSON.parse(JSON.stringify(baseProfile)) as typeof baseProfile,
    nativeId: 'agent-pending',
  },
  profile: {
    tId: '0.0.6000',
    sizeBytes: 512,
  },
  profileRegistry: null,
  hcs10Registry: {
    status: 'created',
    uaid: 'uaid:aid:pending;uid=agent-pending;registry=hashgraph-online;proto=a2a;nativeId=agent-pending',
    transactionId: '0.0.5005@123',
    consensusTimestamp: '1700000000.123456789',
    registryTopicId: '0.0.5005',
    topicSequenceNumber: 42,
    payloadHash: 'payload123',
    profileReference: 'hcs-11:hcs://1/0.0.6000',
    tId: '0.0.6000',
    profileSizeBytes: 512,
  },
  credits: {
    base: 100,
    additional: 10.1016,
    total: 110.1016,
  },
  additionalRegistries: [
    {
      registry: 'erc-8004',
      registryKey: 'erc-8004:ethereum-sepolia',
      networkId: 'ethereum-sepolia',
      networkName: 'Ethereum Sepolia',
      chainId: 11155111,
      status: 'pending' as const,
    },
  ],
  additionalRegistryCredits: [
    {
      registry: 'erc-8004',
      registryKey: 'erc-8004:ethereum-sepolia',
      networkId: 'ethereum-sepolia',
      networkName: 'Ethereum Sepolia',
      chainId: 11155111,
      status: 'pending' as const,
      estimatedCredits: 10.1016,
    },
  ],
} satisfies RegisterAgentResponse;

const registrationProgressCompleted: RegistrationProgressRecord = {
  attemptId: 'attempt-pending',
  mode: 'register',
  status: 'completed',
  uaid: 'uaid:aid:pending;uid=agent-pending;registry=hashgraph-online;proto=a2a;nativeId=agent-pending',
  agentId: 'agent-pending',
  registryNamespace: 'hashgraph-online',
  accountId: '0.0.1234',
  startedAt: '2025-01-01T00:00:00.000Z',
  completedAt: '2025-01-01T00:00:30.000Z',
  primary: {
    status: 'completed',
    finishedAt: '2025-01-01T00:00:30.000Z',
  },
  additionalRegistries: {
    'erc-8004:ethereum-sepolia': {
      registryId: 'erc-8004',
      registryKey: 'erc-8004:ethereum-sepolia',
      networkId: 'ethereum-sepolia',
      networkName: 'Ethereum Sepolia',
      chainId: 11155111,
      label: 'Ethereum Sepolia',
      status: 'completed',
      credits: 10.1016,
      agentId: '11155111:820',
      agentUri: 'ipfs://agent-pending',
      metadata: {
        registryKey: 'erc-8004:ethereum-sepolia',
      },
      lastUpdated: '2025-01-01T00:00:30.000Z',
    },
  },
};

const registrationProgressFailed: RegistrationProgressRecord = {
  ...registrationProgressCompleted,
  status: 'failed',
  primary: {
    status: 'failed',
    error: 'registry_failure',
  },
  additionalRegistries: {
    'erc-8004:ethereum-sepolia': {
      ...registrationProgressCompleted.additionalRegistries[
        'erc-8004:ethereum-sepolia'
      ],
      status: 'failed',
      error: 'network_error',
    },
  },
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
  const createResponse = (
    overrides: Partial<FetchResponse>,
  ): FetchResponse => ({
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

  it('exposes the full RegistryBrokerClient surface', () => {
    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const requiredClientMethods = [
      'search',
      'stats',
      'registries',
      'popularSearches',
      'listProtocols',
      'detectProtocol',
      'vectorSearch',
      'facets',
      'resolveUaid',
      'registerAgent',
      'updateAgent',
      'validateUaid',
      'dashboardStats',
      'adapters',
      'adaptersDetailed',
      'adapterRegistryCategories',
      'adapterRegistryAdapters',
      'purchaseCreditsWithHbar',
      'getX402Minimums',
      'buyCreditsWithX402',
      'generateEncryptionKeyPair',
      'createLedgerChallenge',
      'verifyLedgerChallenge',
      'authenticateWithLedger',
      'fetchHistorySnapshot',
      'attachDecryptedHistory',
    ] as const;

    const missingClientMethods = requiredClientMethods.filter(
      methodName => typeof (client as any)[methodName] !== 'function',
    );
    expect(missingClientMethods).toEqual([]);

    expect(typeof client.chat).toBe('object');
    const requiredChatMethods = [
      'start',
      'createSession',
      'sendMessage',
      'getHistory',
    ] as const;
    const missingChatMethods = requiredChatMethods.filter(
      methodName => typeof (client.chat as any)[methodName] !== 'function',
    );
    expect(missingChatMethods).toEqual([]);

    expect(typeof client.encryption).toBe('object');
    const requiredEncryptionMethods = [
      'registerKey',
      'ensureAgentKey',
    ] as const;
    const missingEncryptionMethods = requiredEncryptionMethods.filter(
      methodName =>
        typeof (client.encryption as any)[methodName] !== 'function',
    );
    expect(missingEncryptionMethods).toEqual([]);
  });

  it('normalises base URL and appends version suffix', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => mockSearchResponse,
      }) as unknown as Response,
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

  it('normalises base URL ending with /api to include version suffix', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => mockSearchResponse,
      }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com/api/',
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
      createResponse({
        json: async () => quoteNeedsCredits,
      }) as unknown as Response,
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

  it('fetches the additional registry catalog', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => mockAdditionalRegistryCatalog,
      }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const catalog = await client.getAdditionalRegistries();

    expect(catalog.registries).toHaveLength(1);
    expect(catalog.registries[0]?.id).toBe('erc-8004');
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/register/additional-registries',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('parses pending register response and exposes type guards', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => pendingRegisterResponse,
      }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const result = await client.registerAgent({ profile: baseProfile });

    expect(isPendingRegisterAgentResponse(result)).toBe(true);
    expect(isSuccessRegisterAgentResponse(result)).toBe(false);
    expect(result.attemptId).toBe('attempt-pending');
  });

  it('retrieves registration progress records', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => ({ progress: registrationProgressCompleted }),
      }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const progress = await client.getRegistrationProgress('attempt-pending');

    expect(progress).not.toBeNull();
    expect(progress?.status).toBe('completed');
  });

  it('waits for registration completion until progress resolves', async () => {
    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const progressSequence: Array<RegistrationProgressRecord | null> = [
      null,
      {
        ...registrationProgressCompleted,
        status: 'pending',
        completedAt: undefined,
        primary: { status: 'pending' },
      },
      registrationProgressCompleted,
    ];

    const getSpy = jest
      .spyOn(client, 'getRegistrationProgress')
      .mockImplementation(
        async () => progressSequence.shift() ?? registrationProgressCompleted,
      );
    const delaySpy = jest
      .spyOn(
        client as unknown as {
          delay: (ms: number, signal?: AbortSignal) => Promise<void>;
        },
        'delay',
      )
      .mockResolvedValue(undefined);

    const result = await client.waitForRegistrationCompletion(
      'attempt-pending',
      { intervalMs: 5, timeoutMs: 500, throwOnFailure: false },
    );

    expect(result.status).toBe('completed');
    expect(getSpy).toHaveBeenCalled();

    delaySpy.mockRestore();
    getSpy.mockRestore();
  });

  it('throws when registration completion fails and throwOnFailure is enabled', async () => {
    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    jest
      .spyOn(client, 'getRegistrationProgress')
      .mockResolvedValue(registrationProgressFailed);
    jest
      .spyOn(
        client as unknown as {
          delay: (ms: number, signal?: AbortSignal) => Promise<void>;
        },
        'delay',
      )
      .mockResolvedValue(undefined);

    await expect(
      client.waitForRegistrationCompletion('attempt-pending', {
        intervalMs: 5,
        timeoutMs: 500,
        throwOnFailure: true,
      }),
    ).rejects.toBeInstanceOf(RegistryBrokerError);
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
    internal.ensureCreditsForRegistration = jest
      .fn()
      .mockResolvedValue(undefined);
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
      request: (
        path: string,
        config: Record<string, unknown>,
      ) => Promise<Response>;
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

  it('auto registers encryption keys when configured on the client', async () => {
    const originalEnv = process.env.AUTO_KEY;
    process.env.AUTO_KEY = `0x${'11'.repeat(32)}`;
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        status: 201,
        json: async () => ({
          id: 'enc-1',
          keyType: 'secp256k1',
          publicKey: 'mock-public',
          uaid: 'uaid:auto',
          ledgerAccountId: null,
          ledgerNetwork: null,
          userId: null,
          email: null,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        }),
      }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
      encryption: {
        autoRegister: {
          uaid: 'uaid:auto',
          envVar: 'AUTO_KEY',
        },
      },
    });

    await client.encryptionReady();

    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/encryption/keys',
      expect.objectContaining({ method: 'POST' }),
    );
    const requestInit = fetchImplementation.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(requestInit.body as string);
    expect(payload.uaid).toBe('uaid:auto');
    expect(typeof payload.publicKey).toBe('string');

    if (originalEnv === undefined) {
      delete process.env.AUTO_KEY;
    } else {
      process.env.AUTO_KEY = originalEnv;
    }
  });

  it('ensures an agent encryption key via helper', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        status: 201,
        json: async () => ({
          id: 'enc-helper-1',
          keyType: 'secp256k1',
          publicKey: 'helper-public',
          uaid: 'uaid:helper',
          ledgerAccountId: null,
          ledgerNetwork: null,
          userId: null,
          email: null,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        }),
      }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const keySpy = jest
      .spyOn(client, 'generateEncryptionKeyPair')
      .mockResolvedValue({
        privateKey: '11'.repeat(32),
        publicKey: '22'.repeat(33),
        envVar: 'RB_ENCRYPTION_PRIVATE_KEY',
      });

    const result = await client.encryption.ensureAgentKey({
      uaid: 'uaid:helper',
      generateIfMissing: true,
    });

    expect(result.publicKey).toBe('22'.repeat(33));
    expect(keySpy).toHaveBeenCalled();
    keySpy.mockRestore();
  });

  it('supports chat session flow and endSession', async () => {
    fetchImplementation
      .mockResolvedValueOnce(
        createResponse({
          json: async () => mockSessionResponse,
        }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => mockMessageResponse,
        }) as unknown as Response,
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
    expect(message.rawResponse).toEqual(mockMessageResponse.rawResponse);

    await expect(client.chat.endSession('session-1')).resolves.toBeUndefined();

    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/api/v1/chat/session',
      expect.objectContaining({ method: 'POST' }),
    );
    const sessionRequestInit = fetchImplementation.mock
      .calls[0][1] as RequestInit;
    expect(JSON.parse(sessionRequestInit.body as string)).toEqual({
      agentUrl: 'https://demo.agent',
      auth: { type: 'bearer', token: 'user-key' },
    });
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/api/v1/chat/message',
      expect.objectContaining({ method: 'POST' }),
    );
    const messageRequestInit = fetchImplementation.mock
      .calls[1][1] as RequestInit;
    expect(JSON.parse(messageRequestInit.body as string)).toEqual({
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
      createResponse({
        json: async () => mockHistorySnapshot,
      }) as unknown as Response,
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

  it('decrypts chat history when requested and context is available', async () => {
    const cipherEntry = {
      messageId: 'm-enc',
      role: 'user' as const,
      content: '[ciphertext]',
      timestamp: '2025-01-01T00:00:00.000Z',
      cipherEnvelope: {
        algorithm: 'aes-256-gcm',
        ciphertext: Buffer.from('cipher').toString('base64'),
        nonce: Buffer.alloc(12).toString('base64'),
        recipients: [
          {
            uaid: 'uaid:demo',
            encryptedShare: Buffer.from('share').toString('base64'),
          },
        ],
      },
    } satisfies ChatHistoryEntry;

    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => ({
          ...mockHistorySnapshot,
          sessionId: 'session-enc',
          history: [cipherEntry],
        }),
      }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const decryptSpy = jest
      .spyOn(client.encryption, 'decryptCipherEnvelope')
      .mockReturnValue('hello world');

    (
      client as unknown as { conversationContexts: Map<string, unknown> }
    ).conversationContexts?.set('session-enc', [
      {
        sessionId: 'session-enc',
        sharedSecret: Buffer.from('shared'),
        identity: { uaid: 'uaid:demo' },
      },
    ]);

    const snapshot = await client.chat.getHistory('session-enc', {
      decrypt: true,
    });

    expect(snapshot.decryptedHistory?.[0]?.plaintext).toBe('hello world');
    decryptSpy.mockRestore();
  });

  it('encrypts cipher envelopes without embedding the raw shared secret', () => {
    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const sharedSecret = Buffer.alloc(32, 7);
    const plaintext = 'secret message';

    const envelope = client.encryption.encryptCipherEnvelope({
      plaintext,
      sessionId: 'session-enc',
      sharedSecret,
      recipients: [{ uaid: 'uaid:demo' }],
    });

    expect(envelope.recipients).toHaveLength(1);
    const encodedSecret = sharedSecret.toString('base64');
    expect(envelope.recipients[0]?.encryptedShare).not.toBe(encodedSecret);

    const roundTrip = client.encryption.decryptCipherEnvelope({
      envelope,
      sharedSecret,
    });
    expect(roundTrip).toBe(plaintext);
  });

  it('initializes an agent client and ensures encryption keys automatically', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        status: 201,
        json: async () => ({
          id: 'enc-init',
          keyType: 'secp256k1',
          publicKey: 'init-public',
          uaid: 'uaid:init',
          ledgerAccountId: null,
          ledgerNetwork: null,
          userId: null,
          email: null,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        }),
      }) as unknown as Response,
    );

    const keySpy = jest
      .spyOn(RegistryBrokerClient.prototype, 'generateEncryptionKeyPair')
      .mockResolvedValue({
        privateKey: '11'.repeat(32),
        publicKey: '22'.repeat(33),
        envVar: 'RB_ENCRYPTION_PRIVATE_KEY',
      });

    const result = await RegistryBrokerClient.initializeAgent({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
      uaid: 'uaid:init',
      defaultHeaders: { 'x-ledger-api-key': 'demo-ledger-key' },
    });

    expect(result.client).toBeInstanceOf(RegistryBrokerClient);
    expect(result.encryption?.publicKey).toBe('22'.repeat(33));
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/encryption/keys',
      expect.objectContaining({ method: 'POST' }),
    );

    keySpy.mockRestore();
  });

  it('compacts chat history via API', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => mockCompactionResponse,
      }) as unknown as Response,
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
        createResponse({
          json: async () => purchaseResponse,
        }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => extendedSession,
        }) as unknown as Response,
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

  it('falls back to plaintext conversations when encryption is preferred but unavailable', async () => {
    fetchImplementation
      .mockResolvedValueOnce(
        createResponse({
          json: async () => mockSessionResponse,
        }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => mockMessageResponse,
        }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => mockHistorySnapshot,
        }) as unknown as Response,
      );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const handle = await client.chat.startConversation({
      uaid: 'uaid:aid:demo',
      encryption: { preference: 'preferred' },
    });

    expect(handle.mode).toBe('plaintext');
    await handle.send({ plaintext: 'Hi there' });
    const history = await handle.fetchHistory({ decrypt: true });
    expect(history[0]?.plaintext).toBe('Hello there');
  });

  it('throws when encrypted conversations are required but unavailable', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => mockSessionResponse,
      }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    await expect(
      client.chat.startConversation({
        uaid: 'uaid:aid:demo',
        encryption: { preference: 'required' },
      }),
    ).rejects.toThrow('Encryption is not enabled for this session');
  });

  it('defaults to production registry broker base URL', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => mockSearchResponse,
      }) as unknown as Response,
    );

    const client = new RegistryBrokerClient({ fetchImplementation });

    await client.search({ limit: 1 });

    const [targetUrl] = fetchImplementation.mock.calls[0];
    expect(targetUrl).toBe('https://hol.org/registry/api/v1/search?limit=1');
  });

  it('builds search queries with optional filters', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => mockSearchResponse,
      }) as unknown as Response,
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
        createResponse({
          json: async () => mockStatsResponse,
        }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => mockRegistriesResponse,
        }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => mockPopularResponse,
        }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => mockResolveResponse,
        }) as unknown as Response,
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

    await expect(client.stats()).rejects.toBeInstanceOf(
      RegistryBrokerParseError,
    );
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
describe('authenticateWithLedgerCredentials', () => {
  const createLedgerVerification = (
    accountId = '0.0.1234',
    network = 'hedera:testnet',
  ) => ({
    key: 'ledger-key',
    apiKey: {
      id: 'ledger-api-key',
      prefix: 'led',
      lastFour: '1234',
      createdAt: new Date().toISOString(),
      ownerType: 'ledger' as const,
    },
    accountId,
    network,
  });

  it('wraps Hedera private keys and stores the account header', async () => {
    const client = new RegistryBrokerClient({
      baseUrl: 'https://hol.org/registry/api/v1',
    });
    const mockVerification = createLedgerVerification();
    const spy = jest
      .spyOn(client, 'authenticateWithLedger')
      .mockResolvedValue(mockVerification as any);
    const hederaPrivateKey = PrivateKey.generateED25519().toString();

    const result = await client.authenticateWithLedgerCredentials({
      accountId: '0.0.1234',
      network: 'hedera:testnet',
      hederaPrivateKey,
      label: 'test',
      expiresInMinutes: 5,
    });

    expect(result).toEqual(mockVerification);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: '0.0.1234',
        network: 'hedera:testnet',
        signer: expect.any(Object),
        expiresInMinutes: 5,
      }),
    );
    expect(client.getDefaultHeaders()['x-account-id']).toBe('0.0.1234');
    spy.mockRestore();
  });

  it('supports EVM private keys and respects setAccountHeader=false', async () => {
    const client = new RegistryBrokerClient({
      baseUrl: 'https://hol.org/registry/api/v1',
    });
    const mockVerification = createLedgerVerification('0x1234', 'eip155:84532');
    const spy = jest
      .spyOn(client, 'authenticateWithLedger')
      .mockResolvedValue(mockVerification as any);
    const evmPrivateKey =
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    await client.authenticateWithLedgerCredentials({
      accountId: '0x1234',
      network: 'eip155:84532',
      evmPrivateKey,
      setAccountHeader: false,
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: '0x1234',
        network: 'eip155:84532',
        sign: expect.any(Function),
      }),
    );
    expect(client.getDefaultHeaders()['x-account-id']).toBeUndefined();
    spy.mockRestore();
  });

  it('throws when credential type does not match the network', async () => {
    const client = new RegistryBrokerClient({
      baseUrl: 'https://hol.org/registry/api/v1',
    });
    await expect(
      client.authenticateWithLedgerCredentials({
        accountId: '0.0.1234',
        network: 'eip155:84532',
        hederaPrivateKey: PrivateKey.generateED25519().toString(),
      }),
    ).rejects.toThrow(
      'hederaPrivateKey can only be used with hedera:mainnet or hedera:testnet networks.',
    );
    await expect(
      client.authenticateWithLedgerCredentials({
        accountId: '0xabc',
        network: 'hedera:testnet',
        evmPrivateKey:
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
    ).rejects.toThrow(
      'evmPrivateKey can only be used with CAIP-2 EVM networks (eip155:<chainId>).',
    );
  });
});
