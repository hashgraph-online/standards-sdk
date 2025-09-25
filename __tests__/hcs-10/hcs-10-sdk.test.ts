import { HCS10Client, HCS10BaseClient, ConnectionsManager } from '../../src/hcs-10/sdk';
import {
  HCSClientConfig,
  CreateAgentResponse,
  CreateAccountResponse,
  HandleConnectionRequestResponse,
} from '../../src/hcs-10/types';
import { Logger } from '../../src/utils/logger';
import * as hcs10Tx from '../../src/hcs-10/tx';

jest.mock('@hashgraph/sdk', () => {
  const MockPrivateKey = function (this: any) {
    this.toString = jest.fn().mockReturnValue('mock-private-key');
    this.publicKey = { toString: jest.fn().mockReturnValue('mock-public-key') };
  } as any;

  const PrivateKey = Object.assign(MockPrivateKey, {
    fromString: jest.fn().mockImplementation(() => new (MockPrivateKey as any)()),
    fromStringED25519: jest
      .fn()
      .mockImplementation(() => new (MockPrivateKey as any)()),
    fromStringECDSA: jest
      .fn()
      .mockImplementation(() => new (MockPrivateKey as any)()),
    generateED25519: jest
      .fn()
      .mockImplementation(() => new (MockPrivateKey as any)()),
  });

  const AccountId = {
    fromString: jest.fn().mockImplementation((s: string) => ({
      toString: () => s,
    })),
  } as any;

  const PublicKey = function (this: any, value?: string) {
    this.value = value;
    this.toString = jest.fn().mockReturnValue(value ?? 'mock-public-key');
  } as any;

  PublicKey.fromString = jest.fn().mockImplementation(
    (s: string) => new (PublicKey as any)(s),
  );
  PublicKey.fromBytesED25519 = jest
    .fn()
    .mockImplementation((b: Buffer) => new (PublicKey as any)(b.toString('hex')));
  PublicKey.fromBytesECDSA = jest
    .fn()
    .mockImplementation((b: Buffer) => new (PublicKey as any)(b.toString('hex')));

  const Hbar = function (this: any, amount?: number) {
    this.toString = () => String(amount ?? 0);
  } as any;

  return {
    Client: {
      forTestnet: jest.fn().mockReturnValue({
        setOperator: jest.fn(),
        close: jest.fn(),
        operatorAccountId: { toString: () => '0.0.123' },
      }),
      forMainnet: jest.fn().mockReturnValue({
        setOperator: jest.fn(),
        close: jest.fn(),
        operatorAccountId: { toString: () => '0.0.123' },
      }),
    },
    PrivateKey,
    PublicKey,
    AccountId,
    TopicId: {
      fromString: jest.fn().mockImplementation((s: string) => ({ toString: () => s })),
    },
    Hbar,
    KeyList: function (keys: any[], threshold: number) {
      return { keys, threshold } as any;
    },
    AccountCreateTransaction: jest.fn().mockImplementation(() => ({
      setKeyWithoutAlias: jest.fn().mockReturnThis(),
      setKey: jest.fn().mockReturnThis(),
      setInitialBalance: jest.fn().mockReturnThis(),
      setAccountMemo: jest.fn().mockReturnThis(),
      freezeWith: jest.fn().mockReturnThis(),
      sign: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({
        getReceipt: jest.fn().mockResolvedValue({
          accountId: { toString: () => '0.0.12345' },
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
          topicId: { toString: () => '0.0.67890' },
          status: { toString: jest.fn().mockReturnValue('SUCCESS') },
        }),
      }),
    })),
    TopicMessageSubmitTransaction: jest.fn().mockImplementation(() => {
      let messageBuffer: Uint8Array | null = null;
      const receipt = {
        status: { toString: jest.fn().mockReturnValue('SUCCESS') },
        topicSequenceNumber: { toNumber: () => 1 },
      };
      const executionResult = {
        getReceipt: jest.fn().mockResolvedValue(receipt),
      };
      const tx: any = {
        setTopicId: jest.fn().mockReturnValue(undefined),
      };
      tx.setTopicId = jest.fn().mockReturnValue(tx);
      tx.setMessage = jest.fn().mockImplementation((msg: string | Uint8Array) => {
        messageBuffer =
          typeof msg === 'string' ? Buffer.from(msg) : new Uint8Array(msg);
        return tx;
      });
      tx.getMessage = jest.fn(() => messageBuffer);
      tx.setTransactionMemo = jest.fn().mockReturnValue(tx);
      tx.setMaxTransactionFee = jest.fn().mockReturnValue(tx);
      tx.freezeWith = jest.fn().mockReturnValue(tx);
      tx.sign = jest.fn().mockImplementation(() => ({ execute: jest.fn().mockResolvedValue(executionResult) }));
      tx.execute = jest.fn().mockResolvedValue(executionResult);
      return tx;
    }),
  };
});

jest.mock('@kiloscribe/inscription-sdk', () => ({
  InscriptionSDK: jest.fn().mockImplementation(() => ({
    inscribeAndExecute: jest.fn().mockResolvedValue({
      success: true,
      inscriptionId: 'test-inscription-id',
    }),
  })),
}));

jest.mock('../../src/hcs-10/tx', () => {
  const actual = jest.requireActual('../../src/hcs-10/tx');
  return {
    ...actual,
    buildHcs10CreateInboundTopicTx: jest.fn(
      actual.buildHcs10CreateInboundTopicTx,
    ),
    buildHcs10CreateOutboundTopicTx: jest.fn(
      actual.buildHcs10CreateOutboundTopicTx,
    ),
    buildHcs10CreateConnectionTopicTx: jest.fn(
      actual.buildHcs10CreateConnectionTopicTx,
    ),
    buildHcs10CreateRegistryTopicTx: jest.fn(
      actual.buildHcs10CreateRegistryTopicTx,
    ),
    buildHcs10RegistryRegisterTx: jest.fn(actual.buildHcs10RegistryRegisterTx),
    buildHcs10ConfirmConnectionTx: jest.fn(
      actual.buildHcs10ConfirmConnectionTx,
    ),
    buildHcs10SendMessageTx: jest.fn(actual.buildHcs10SendMessageTx),
    buildHcs10SubmitConnectionRequestTx: jest.fn(
      actual.buildHcs10SubmitConnectionRequestTx,
    ),
    buildHcs10OutboundConnectionRequestRecordTx: jest.fn(
      actual.buildHcs10OutboundConnectionRequestRecordTx,
    ),
    buildHcs10OutboundConnectionCreatedRecordTx: jest.fn(
      actual.buildHcs10OutboundConnectionCreatedRecordTx,
    ),
  };
});

jest.mock('../../src/services/mirror-node', () => ({
  HederaMirrorNode: jest.fn().mockImplementation(() => ({
    requestAccount: jest.fn().mockResolvedValue({
      account: '0.0.123',
      key: { _type: 'ED25519', key: 'mock-key' },
    }),
    getPublicKey: jest.fn().mockResolvedValue({ toString: () => 'pk' }),
    getTopicMessages: jest.fn().mockResolvedValue([]),
    getTopicInfo: jest.fn().mockResolvedValue({ memo: 'hcs-10:0:60:1' }),
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

const mockedTx = hcs10Tx as jest.Mocked<typeof hcs10Tx>;

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
      expect(Logger.getInstance).toHaveBeenCalled();
      const calls = (Logger.getInstance as jest.Mock).mock.calls;
      expect(calls.some(args => args?.[0]?.module === 'HCS-SDK')).toBe(true);
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
      const result = await client.createAccount(100);
      expect(result).toMatchObject({
        accountId: expect.any(String),
        privateKey: expect.any(String),
      });
    });

    test('should handle account creation errors', async () => {
      const mockAccountCreate =
        require('@hashgraph/sdk').AccountCreateTransaction;
      mockAccountCreate.mockImplementationOnce(() => ({
        setKeyWithoutAlias: jest.fn().mockReturnThis(),
        setInitialBalance: jest.fn().mockReturnThis(),
        setAccountMemo: jest.fn().mockReturnThis(),
        freezeWith: jest.fn().mockReturnThis(),
        sign: jest.fn().mockReturnThis(),
        execute: jest
          .fn()
          .mockRejectedValue(new Error('Account creation failed')),
      }));

      await expect(client.createAccount()).rejects.toThrow(
        'Account creation failed',
      );
    });
  });

  describe('createAgent', () => {
    beforeEach(() => {
      jest
        .spyOn(HCS10Client.prototype as any, '_createEntityTopics')
        .mockImplementation(async (_ttl: number, existing: any) => ({
          inboundTopicId: '0.0.100',
          outboundTopicId: '0.0.200',
          pfpTopicId: existing?.pfpTopicId || '',
          profileTopicId: existing?.profileTopicId || '',
        }));
      jest
        .spyOn(HCS10Client.prototype as any, 'storeHCS11Profile')
        .mockResolvedValue({
          profileTopicId: '0.0.300',
          success: true,
          transactionId: 'tx',
        });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('should create agent with valid parameters', async () => {
      const builder = {
        build: () => ({
          name: 'Test Agent',
          bio: 'A test agent',
          alias: 'test-agent',
          capabilities: ['chat'],
          inboundTopicType: 0,
        }),
      } as any;

      const result = await client.createAgent(builder);

      expect(result).toMatchObject({
        inboundTopicId: '0.0.100',
        outboundTopicId: '0.0.200',
        profileTopicId: '0.0.300',
      });
    });

    test('should handle agent creation with existing profile picture topic', async () => {
      const builder = {
        build: () => ({
          name: 'Test Agent',
          bio: 'A test agent',
          alias: 'test-agent',
          capabilities: ['chat'],
          inboundTopicType: 0,
          existingPfpTopicId: '0.0.99999',
        }),
      } as any;

      const result = await client.createAgent(builder);
      expect(result.pfpTopicId).toBe('0.0.99999');
    });
  });

  describe('handleConnectionRequest', () => {
    test('should handle connection request successfully', async () => {
      const createTopicSpy = jest.spyOn(client as any, 'createTopic');
      jest
        .spyOn(client, 'confirmConnection')
        .mockResolvedValue(42);
      jest
        .spyOn(client, 'retrieveCommunicationTopics')
        .mockResolvedValue({ inboundTopic: '0.0.100', outboundTopic: '0.0.200' } as any);
      jest
        .spyOn((client as any).mirrorNode, 'getPublicKey')
        .mockResolvedValue({ toString: () => 'pk' } as any);

      const result = await client.handleConnectionRequest(
        '0.0.100',
        '0.0.22222',
        7,
      );

      expect(createTopicSpy).not.toHaveBeenCalled();

      expect(result).toMatchObject({
        connectionTopicId: '0.0.67890',
        confirmedConnectionSequenceNumber: 42,
        operatorId: expect.stringContaining('0.0.100@'),
      });
    });
  });

  describe('waitForConnectionConfirmation', () => {
    test('should wait for connection confirmation', async () => {
      jest
        .spyOn((client as any).mirrorNode, 'getTopicMessages')
        .mockResolvedValue([
          {
            op: 'connection_created',
            connection_id: 7,
            connection_topic_id: '0.0.55555',
            operator_id: '0.0.100@0.0.22222',
            m: 'ok',
            sequence_number: 3,
          },
        ]);

      jest
        .spyOn(client, 'retrieveCommunicationTopics')
        .mockResolvedValue({ inboundTopic: '0.0.100', outboundTopic: '0.0.200' } as any);

      const result = await client.waitForConnectionConfirmation('0.0.100', 7, 1, 1, false);

      expect(result).toMatchObject({
        connectionTopicId: '0.0.55555',
        confirmedBy: '0.0.100@0.0.22222',
        sequence_number: 3,
      });
    });

    test('should handle not found after attempts', async () => {
      jest
        .spyOn((client as any).mirrorNode, 'getTopicMessages')
        .mockResolvedValue([]);
      await expect(
        client.waitForConnectionConfirmation('0.0.100', 123, 1, 1),
      ).rejects.toThrow('Connection confirmation not found after 1 attempts');
    });
  });


  describe('transaction builder integration', () => {
    beforeEach(() => {
      (client as any).ensureInitialized = jest.fn().mockResolvedValue(undefined);
      (client as any).operatorCtx = {
        ensureInitialized: jest.fn().mockResolvedValue(undefined),
        operatorKey: {
          publicKey: { toString: () => 'mock-public-key' },
        },
      };
      (client as any).client = {
        operatorAccountId: { toString: () => '0.0.123' },
        operatorPublicKey: { toString: () => 'mock-public-key' },
      };
      (client as any).submitPayload = jest.fn().mockResolvedValue({
        topicSequenceNumber: { toNumber: () => 1 },
      });
      (client as any).canSubmitToTopic = jest
        .fn()
        .mockResolvedValue({ canSubmit: true, requiresFee: false });
      (client as any).getOperatorId = jest
        .fn()
        .mockResolvedValue('0.0.100@0.0.200');
      (client as any).retrieveInboundAccountId = jest
        .fn()
        .mockResolvedValue('0.0.300');
      (client as any).retrieveCommunicationTopics = jest
        .fn()
        .mockResolvedValue({ outboundTopic: '0.0.400' });
      (client as any).getAccountAndSigner = jest
        .fn()
        .mockReturnValue({ accountId: '0.0.500', signer: {} });
      (client as any).inscribeFile = jest.fn();
    });

    test('createRegistryTopic proxies parameters to builder', async () => {
      await client.createRegistryTopic({
        ttl: 120,
        adminKey: true,
        submitKey: 'public-key-string',
      });

      expect(mockedTx.buildHcs10CreateRegistryTopicTx).toHaveBeenCalledWith(
        expect.objectContaining({
          ttl: 120,
          adminKey: true,
          submitKey: 'public-key-string',
        }),
      );
    });

    test('registerAgent routes payload through registry builder', async () => {
      await client.registerAgent(
        '0.0.registry',
        '0.0.account',
        '0.0.inbound',
        'memo-text',
      );

      expect(mockedTx.buildHcs10RegistryRegisterTx).toHaveBeenCalledWith({
        registryTopicId: '0.0.registry',
        accountId: '0.0.account',
        inboundTopicId: '0.0.inbound',
        memo: 'memo-text',
      });
    });

    test('confirmConnection uses connection confirmation builder', async () => {
      await client.confirmConnection(
        '0.0.inbound',
        '0.0.connection',
        '0.0.connected',
        7,
        'confirm memo',
      );

      expect(mockedTx.buildHcs10ConfirmConnectionTx).toHaveBeenCalledWith({
        inboundTopicId: '0.0.inbound',
        connectionTopicId: '0.0.connection',
        connectedAccountId: '0.0.connected',
        operatorId: '0.0.100@0.0.200',
        connectionId: 7,
        memo: 'confirm memo',
      });
    });

    test('sendMessage leverages message builder for submission', async () => {
      await client.sendMessage('0.0.connection', 'payload-data', 'memo');

      expect(mockedTx.buildHcs10SendMessageTx).toHaveBeenCalledWith({
        connectionTopicId: '0.0.connection',
        operatorId: '0.0.100@0.0.200',
        data: 'payload-data',
        memo: 'memo',
      });
    });

    test('submitConnectionRequest utilizes request builders', async () => {
      await client.submitConnectionRequest('0.0.inbound', 'hello');

      expect(mockedTx.buildHcs10SubmitConnectionRequestTx).toHaveBeenCalledWith({
        inboundTopicId: '0.0.inbound',
        operatorId: '0.0.100@0.0.200',
        memo: 'hello',
      });

      expect(
        mockedTx.buildHcs10OutboundConnectionRequestRecordTx,
      ).toHaveBeenCalledWith({
        outboundTopicId: '0.0.400',
        operatorId: '0.0.inbound@0.0.300',
        connectionRequestId: 1,
        memo: 'hello',
      });
    });

    test('recordOutboundConnectionConfirmation uses outbound confirmation builder', async () => {
      await client.recordOutboundConnectionConfirmation({
        outboundTopicId: '0.0.400',
        requestorOutboundTopicId: '0.0.401',
        connectionRequestId: 2,
        confirmedRequestId: 3,
        connectionTopicId: '0.0.402',
        operatorId: '0.0.100@0.0.200',
        memo: 'done',
      });

      expect(
        mockedTx.buildHcs10OutboundConnectionCreatedRecordTx,
      ).toHaveBeenCalledWith({
        outboundTopicId: '0.0.400',
        requestorOutboundTopicId: '0.0.401',
        connectionTopicId: '0.0.402',
        confirmedRequestId: 3,
        connectionRequestId: 2,
        operatorId: '0.0.100@0.0.200',
        memo: 'done',
      });
    });
  });


  describe('error handling', () => {
    test('should surface network errors', () => {
      const mockClient = require('@hashgraph/sdk').Client;
      mockClient.forTestnet.mockReturnValueOnce({
        setOperator: jest.fn().mockImplementation(() => {
          throw new Error('Network connection failed');
        }),
        close: jest.fn(),
      });

      expect(() => new HCS10Client(mockConfig)).toThrow('Network connection failed');
    });
  });


  describe('progress callbacks', () => {
    beforeEach(() => {
      jest
        .spyOn(HCS10Client.prototype as any, '_createEntityTopics')
        .mockResolvedValue({
          inboundTopicId: '0.0.100',
          outboundTopicId: '0.0.200',
          pfpTopicId: '',
          profileTopicId: '',
        });
      jest
        .spyOn(HCS10Client.prototype as any, 'storeHCS11Profile')
        .mockResolvedValue({ profileTopicId: '0.0.300', success: true, transactionId: 'tx' });
    });

    test('should call progress callback during agent creation', async () => {
      const progressCallback = jest.fn();
      const builder = { build: () => ({ inboundTopicType: 0 }) } as any;
      await client.createAgent(builder, 60, undefined, progressCallback);
      expect(progressCallback).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    test('should expose underlying client close', async () => {
      const closeSpy = jest.spyOn(client.getClient(), 'close');
      await client.getClient().close();
      expect(closeSpy).toHaveBeenCalled();
    });
  });
});


describe('ConnectionsManager', () => {
  let connectionsManager: ConnectionsManager;

  beforeEach(() => {
    const baseClient = {} as any; // minimal stub; API checked via class methods below
    connectionsManager = new ConnectionsManager({
      logLevel: 'info',
      baseClient,
      silent: true,
    } as any);
  });

  test('should initialize connections manager', () => {
    expect(connectionsManager).toBeInstanceOf(ConnectionsManager);
  });

  test('should expose connection management API', () => {
    expect(typeof connectionsManager.fetchConnectionData).toBe('function');
    expect(typeof connectionsManager.processOutboundMessages).toBe('function');
    expect(typeof connectionsManager.processInboundMessages).toBe('function');
    expect(typeof connectionsManager.getAllConnections).toBe('function');
    expect(typeof connectionsManager.getActiveConnections).toBe('function');
    expect(typeof connectionsManager.getConnectionsNeedingConfirmation).toBe('function');
    expect(typeof connectionsManager.getConnectionByTopicId).toBe('function');
    expect(typeof connectionsManager.getConnectionsByAccountId).toBe('function');
    expect(typeof connectionsManager.addProfileInfo).toBe('function');
    expect(typeof connectionsManager.updateOrAddConnection).toBe('function');
    expect(typeof connectionsManager.clearAll).toBe('function');
    expect(typeof connectionsManager.isConnectionRequestProcessed).toBe('function');
    expect(typeof connectionsManager.markConnectionRequestProcessed).toBe('function');
    expect(typeof connectionsManager.getPendingTransactions).toBe('function');
    expect(typeof connectionsManager.getScheduledTransactionStatus).toBe('function');
    expect(typeof connectionsManager.getLastOperatorActivity).toBe('function');
  });
});
