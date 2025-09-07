import {
  HCS10Client,
  HCS10BaseClient,
  ConnectionsManager,
} from '../../src/hcs-10/sdk';
import {
  HCSClientConfig,
  CreateAgentResponse,
  CreateAccountResponse,
  HandleConnectionRequestResponse,
} from '../../src/hcs-10/types';
import { Logger } from '../../src/utils/logger';

jest.mock('@hashgraph/sdk', () => ({
  Client: {
    forTestnet: jest.fn().mockReturnValue({
      setOperator: jest.fn(),
      close: jest.fn(),
    }),
    forMainnet: jest.fn().mockReturnValue({
      setOperator: jest.fn(),
      close: jest.fn(),
    }),
  },
  PrivateKey: {
    fromString: jest.fn().mockReturnValue({
      publicKey: { toString: jest.fn().mockReturnValue('mock-public-key') },
    }),
  },
  AccountCreateTransaction: jest.fn().mockImplementation(() => ({
    setKey: jest.fn().mockReturnThis(),
    setInitialBalance: jest.fn().mockReturnThis(),
    setAccountMemo: jest.fn().mockReturnThis(),
    freezeWith: jest.fn().mockReturnThis(),
    sign: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({
      getReceipt: jest.fn().mockResolvedValue({
        accountId: '0.0.12345',
        status: { toString: jest.fn().mockReturnValue('SUCCESS') },
      }),
    }),
  })),
  TopicCreateTransaction: jest.fn().mockImplementation(() => ({
    setSubmitKey: jest.fn().mockReturnThis(),
    setAdminKey: jest.fn().mockReturnThis(),
    setTopicMemo: jest.fn().mockReturnThis(),
    setAutoRenewPeriod: jest.fn().mockReturnThis(),
    setAutoRenewAccountId: jest.fn().mockReturnThis(),
    freezeWith: jest.fn().mockReturnThis(),
    sign: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({
      getReceipt: jest.fn().mockResolvedValue({
        topicId: '0.0.67890',
        status: { toString: jest.fn().mockReturnValue('SUCCESS') },
      }),
    }),
  })),
  TopicMessageSubmitTransaction: jest.fn().mockImplementation(() => ({
    setTopicId: jest.fn().mockReturnThis(),
    setMessage: jest.fn().mockReturnThis(),
    freezeWith: jest.fn().mockReturnThis(),
    sign: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({
      getReceipt: jest.fn().mockResolvedValue({
        status: { toString: jest.fn().mockReturnValue('SUCCESS') },
      }),
    }),
  })),
}));

jest.mock('@kiloscribe/inscription-sdk', () => ({
  InscriptionSDK: jest.fn().mockImplementation(() => ({
    inscribeAndExecute: jest.fn().mockResolvedValue({
      success: true,
      inscriptionId: 'test-inscription-id',
    }),
  })),
}));

jest.mock('../../src/services/mirror-node', () => ({
  HederaMirrorNode: jest.fn().mockImplementation(() => ({
    requestAccount: jest.fn().mockResolvedValue({
      account: '0.0.123',
      key: { _type: 'ED25519', key: 'mock-key' },
    }),
  })),
}));

jest.mock('../../src/utils/logger', () => ({
  Logger: {
    getInstance: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
    }),
  },
}));

describe('HCS10Client', () => {
  let client: HCS10Client;
  let mockConfig: HCSClientConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      network: 'testnet',
      operatorId: '0.0.123',
      operatorPrivateKey: '302e020100300506032b657004220420mock-private-key',
      logLevel: 'info' as const,
    };

    client = new HCS10Client(mockConfig);
  });

  describe('constructor', () => {
    test('should initialize with valid config', () => {
      expect(client).toBeInstanceOf(HCS10Client);
    });

    test('should set up logger correctly', () => {
      expect(Logger.getInstance).toHaveBeenCalledWith({
        level: 'info',
        module: 'HCS10Client',
      });
    });

    test('should handle missing logLevel', () => {
      const configWithoutLog = { ...mockConfig };
      delete configWithoutLog.logLevel;

      const clientWithoutLog = new HCS10Client(configWithoutLog);
      expect(clientWithoutLog).toBeInstanceOf(HCS10Client);
    });
  });

  describe('createAccount', () => {
    test('should create account successfully', async () => {
      const result = await client.createAccount({
        initialBalance: 100,
        accountMemo: 'Test account',
      });

      expect(result).toMatchObject({
        success: true,
        accountId: expect.any(String),
      });
    });

    test('should handle account creation errors', async () => {
      const mockAccountCreate =
        require('@hashgraph/sdk').AccountCreateTransaction;
      mockAccountCreate.mockImplementationOnce(() => ({
        setKey: jest.fn().mockReturnThis(),
        setInitialBalance: jest.fn().mockReturnThis(),
        setAccountMemo: jest.fn().mockReturnThis(),
        freezeWith: jest.fn().mockReturnThis(),
        sign: jest.fn().mockReturnThis(),
        execute: jest
          .fn()
          .mockRejectedValue(new Error('Account creation failed')),
      }));

      await expect(client.createAccount({})).rejects.toThrow(
        'Account creation failed',
      );
    });
  });

  describe('createAgent', () => {
    test('should create agent with valid parameters', async () => {
      const agentBuilder = {
        name: 'Test Agent',
        bio: 'A test agent',
        alias: 'test-agent',
        capabilities: ['chat'],
        profilePicture: Buffer.from('fake-image'),
      };

      const result = await client.createAgent(agentBuilder);

      expect(result).toMatchObject({
        success: true,
        agentId: expect.any(String),
        inboundTopicId: expect.any(String),
        outboundTopicId: expect.any(String),
      });
    });

    test('should handle agent creation without profile picture', async () => {
      const agentBuilder = {
        name: 'Test Agent',
        bio: 'A test agent',
        alias: 'test-agent',
        capabilities: ['chat'],
      };

      const result = await client.createAgent(agentBuilder);

      expect(result).toMatchObject({
        success: true,
        agentId: expect.any(String),
      });
      expect(result.pfpTopicId).toBeUndefined();
    });

    test('should handle agent creation with existing profile picture topic', async () => {
      const agentBuilder = {
        name: 'Test Agent',
        bio: 'A test agent',
        alias: 'test-agent',
        capabilities: ['chat'],
        profilePictureTopicId: '0.0.99999',
      };

      const result = await client.createAgent(agentBuilder);

      expect(result).toMatchObject({
        success: true,
        pfpTopicId: '0.0.99999',
      });
    });
  });

  describe('handleConnectionRequest', () => {
    test('should handle connection request successfully', async () => {
      const connectionRequest = {
        fromAgentId: '0.0.11111',
        toAgentId: '0.0.22222',
        message: 'Connection request',
      };

      const result = await client.handleConnectionRequest(connectionRequest);

      expect(result).toMatchObject({
        success: true,
        connectionId: expect.any(String),
      });
    });

    test('should validate required parameters', async () => {
      const invalidRequest = {
        fromAgentId: '',
        toAgentId: '0.0.22222',
      };

      await expect(
        client.handleConnectionRequest(invalidRequest as any),
      ).rejects.toThrow();
    });
  });

  describe('waitForConnectionConfirmation', () => {
    test('should wait for connection confirmation', async () => {
      const connectionId = 'test-connection-id';

      const result = await client.waitForConnectionConfirmation(connectionId);

      expect(result).toMatchObject({
        success: true,
        confirmed: true,
      });
    });

    test('should handle timeout', async () => {
      const connectionId = 'test-connection-id';

      jest.useFakeTimers();

      const promise = client.waitForConnectionConfirmation(connectionId, 1000);

      jest.advanceTimersByTime(1500);

      await expect(promise).rejects.toThrow('Connection confirmation timeout');

      jest.useRealTimers();
    });
  });

  describe('getAgentConfig', () => {
    test('should return agent configuration', async () => {
      const agentId = '0.0.12345';

      const config = await client.getAgentConfig(agentId);

      expect(config).toMatchObject({
        accountId: expect.any(String),
        inboundTopicId: expect.any(String),
        outboundTopicId: expect.any(String),
      });
    });
  });

  describe('error handling', () => {
    test('should handle network errors gracefully', async () => {
      const mockClient = require('@hashgraph/sdk').Client;
      mockClient.forTestnet.mockReturnValueOnce({
        setOperator: jest.fn().mockImplementation(() => {
          throw new Error('Network connection failed');
        }),
        close: jest.fn(),
      });

      const failingClient = new HCS10Client(mockConfig);

      await expect(failingClient.createAccount({})).rejects.toThrow(
        'Network connection failed',
      );
    });

    test('should handle invalid configuration', () => {
      const invalidConfig = {
        network: 'invalid-network' as any,
        operatorId: 'invalid-id',
        operatorPrivateKey: 'invalid-key',
      };

      expect(() => new HCS10Client(invalidConfig)).toThrow();
    });
  });

  describe('utility methods', () => {
    test('should validate account IDs', () => {
      expect(client['isValidAccountId']('0.0.12345')).toBe(true);
      expect(client['isValidAccountId']('invalid')).toBe(false);
      expect(client['isValidAccountId']('')).toBe(false);
    });

    test('should validate topic IDs', () => {
      expect(client['isValidTopicId']('0.0.12345')).toBe(true);
      expect(client['isValidTopicId']('invalid')).toBe(false);
      expect(client['isValidTopicId']('')).toBe(false);
    });

    test('should generate random aliases', () => {
      const alias1 = client['generateRandomAlias']();
      const alias2 = client['generateRandomAlias']();

      expect(alias1).toMatch(/^hcs10-agent-[a-z0-9]+$/);
      expect(alias2).toMatch(/^hcs10-agent-[a-z0-9]+$/);
      expect(alias1).not.toBe(alias2);
    });
  });

  describe('progress callbacks', () => {
    test('should call progress callback during agent creation', async () => {
      const progressCallback = jest.fn();

      const agentBuilder = {
        name: 'Test Agent',
        bio: 'A test agent',
        alias: 'test-agent',
        capabilities: ['chat'],
      };

      await client.createAgent(agentBuilder, { progressCallback });

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: expect.any(String),
          message: expect.any(String),
        }),
      );
    });

    test('should handle progress callback errors gracefully', async () => {
      const failingCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback failed');
      });

      const agentBuilder = {
        name: 'Test Agent',
        bio: 'A test agent',
        alias: 'test-agent',
        capabilities: ['chat'],
      };

      const result = await client.createAgent(agentBuilder, {
        progressCallback: failingCallback,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('cleanup', () => {
    test('should close client connection', async () => {
      await client.close();

      expect(require('@hashgraph/sdk').Client.forTestnet).toHaveBeenCalled();
    });

    test('should handle close errors gracefully', async () => {
      const mockClient = require('@hashgraph/sdk').Client;
      const mockClientInstance = {
        setOperator: jest.fn(),
        close: jest.fn().mockRejectedValue(new Error('Close failed')),
      };
      mockClient.forTestnet.mockReturnValue(mockClientInstance);

      const newClient = new HCS10Client(mockConfig);

      await expect(newClient.close()).resolves.not.toThrow();
    });
  });
});

describe('HCS10BaseClient', () => {
  let baseClient: HCS10BaseClient;

  beforeEach(() => {
    baseClient = new HCS10BaseClient({
      network: 'testnet',
      logLevel: 'info',
    });
  });

  test('should initialize with config', () => {
    expect(baseClient).toBeInstanceOf(HCS10BaseClient);
  });

  test('should have required methods', () => {
    expect(typeof baseClient.submitPayload).toBe('function');
    expect(typeof baseClient.getAccountAndSigner).toBe('function');
    expect(typeof baseClient.extractTopicFromOperatorId).toBe('function');
  });
});

describe('ConnectionsManager', () => {
  let connectionsManager: ConnectionsManager;

  beforeEach(() => {
    connectionsManager = new ConnectionsManager({
      network: 'testnet',
      logLevel: 'info',
    });
  });

  test('should initialize connections manager', () => {
    expect(connectionsManager).toBeInstanceOf(ConnectionsManager);
  });

  test('should have connection management methods', () => {
    expect(typeof connectionsManager['addConnection']).toBe('function');
    expect(typeof connectionsManager['removeConnection']).toBe('function');
    expect(typeof connectionsManager['getConnection']).toBe('function');
  });
});
