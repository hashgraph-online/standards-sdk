/**
 * HCS-6 Client Unit Tests
 *
 * Tests the HCS6Client class methods with mocked dependencies
 */

import { HCS6Client } from '../../src/hcs-6/sdk';
import { HCS6BaseClient } from '../../src/hcs-6/base-client';
import {
  HCS6Operation,
  HCS6RegistryType,
  HCS6TopicRegistrationResponse,
  HCS6RegistryOperationResponse,
  HCS6CreateRegistryOptions,
  HCS6RegisterEntryOptions,
  HCS6QueryRegistryOptions,
  HCS6CreateHashinalOptions,
} from '../../src/hcs-6/types';
import {
  PrivateKey,
  AccountId,
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TransactionReceipt,
} from '@hashgraph/sdk';
import { HederaMirrorNode } from '../../src/services/mirror-node';
import { Logger } from '../../src/utils/logger';
import { inscribe } from '../../src/inscribe/inscriber';

jest.mock('../../src/services/mirror-node');
jest.mock('../../src/utils/logger');
jest.mock('../../src/inscribe/inscriber');
let mockTopicCreateTransaction: any;
let mockTopicMessageSubmitTransaction: any;

jest.mock('@hashgraph/sdk', () => {
  const actual = jest.requireActual('@hashgraph/sdk');

  return {
    ...actual,
    Client: {
      forMainnet: jest.fn(),
      forTestnet: jest.fn(),
    },
    TopicCreateTransaction: jest.fn().mockImplementation(() => {
      mockTopicCreateTransaction = {
        setTopicMemo: jest.fn().mockReturnThis(),
        setAdminKey: jest.fn().mockReturnThis(),
        setSubmitKey: jest.fn().mockReturnThis(),
        setAutoRenewAccountId: jest.fn().mockReturnThis(),
        setAutoRenewPeriod: jest.fn().mockReturnThis(),
        freezeWith: jest.fn(),
        sign: jest.fn(),
        execute: jest.fn(),
      };
      return mockTopicCreateTransaction;
    }),
    TopicMessageSubmitTransaction: jest.fn().mockImplementation(() => {
      mockTopicMessageSubmitTransaction = {
        setTopicId: jest.fn().mockReturnThis(),
        setMessage: jest.fn().mockReturnThis(),
        execute: jest.fn(),
      };
      return mockTopicMessageSubmitTransaction;
    }),
  };
});

const MockedMirrorNode = HederaMirrorNode as jest.MockedClass<
  typeof HederaMirrorNode
>;
const MockedLogger = Logger as jest.MockedClass<typeof Logger>;
const mockedInscribe = inscribe as jest.MockedFunction<typeof inscribe>;

describe('HCS6Client', () => {
  let client: HCS6Client;
  let mockMirrorNode: jest.Mocked<HederaMirrorNode>;
  let mockLogger: jest.Mocked<Logger>;
  let mockOperatorKey: PrivateKey;
  let mockOperatorId: AccountId;

  const testConfig = {
    operatorId: '0.0.12345',
    operatorKey:
      '302e020100300506032b657004220420db484b828e64b2d8f12ce84c173a3766fb7dfd3551d8ff6041b18f2a7e4329b',
    network: 'testnet' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    mockMirrorNode = {
      getTopicInfo: jest.fn(),
      getTopicMessages: jest.fn(),
    } as any;

    mockOperatorKey = PrivateKey.generateED25519();
    mockOperatorId = AccountId.fromString(testConfig.operatorId);

    const mockClientInstance = {
      setOperator: jest.fn(),
    } as any;

    (Client.forMainnet as jest.Mock).mockReturnValue(mockClientInstance);
    (Client.forTestnet as jest.Mock).mockReturnValue(mockClientInstance);

    MockedMirrorNode.mockImplementation(() => mockMirrorNode);

    MockedLogger.getInstance = jest.fn().mockReturnValue(mockLogger);

    client = new HCS6Client(testConfig);
  });

  describe('Constructor', () => {
    it('should create client with string operator ID and key', () => {
      expect(client).toBeInstanceOf(HCS6Client);
      expect(client).toBeInstanceOf(HCS6BaseClient);
    });

    it('should create client with AccountId and PrivateKey instances', () => {
      const configWithInstances = {
        operatorId: mockOperatorId,
        operatorKey: mockOperatorKey,
        network: 'testnet' as const,
      };

      const clientWithInstances = new HCS6Client(configWithInstances);
      expect(clientWithInstances).toBeInstanceOf(HCS6Client);
      clientWithInstances.close();
    });

    it('should detect ED25519 key type automatically', () => {
      const ed25519Key = PrivateKey.generateED25519();
      const config = {
        operatorId: testConfig.operatorId,
        operatorKey: ed25519Key.toString(),
        network: 'testnet' as const,
      };

      const ed25519Client = new HCS6Client(config);
      expect(ed25519Client.getKeyType()).toBe('ed25519');
      ed25519Client.close();
    });

    it('should use explicit key type when provided', () => {
      const ecdsaKey = PrivateKey.generateECDSA();
      const config = {
        operatorId: testConfig.operatorId,
        operatorKey: ecdsaKey.toStringRaw(),
        network: 'testnet' as const,
        keyType: 'ecdsa' as const,
      };

      const ecdsaClient = new HCS6Client(config);
      expect(ecdsaClient.getKeyType()).toBe('ecdsa');
      ecdsaClient.close();
    });
  });

  describe('createRegistry', () => {
    beforeEach(() => {
      mockTopicCreateTransaction = {
        setTopicMemo: jest.fn().mockReturnThis(),
        setAdminKey: jest.fn().mockReturnThis(),
        setSubmitKey: jest.fn().mockReturnThis(),
        freezeWith: jest.fn(),
      };
      (TopicCreateTransaction as jest.Mock).mockReturnValue(
        mockTopicCreateTransaction,
      );
    });

    it('should create registry with default TTL', async () => {
      const mockFrozenTx = {
        sign: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn().mockResolvedValue({
          getReceipt: jest.fn().mockResolvedValue({
            topicId: { toString: () => '0.0.12345' },
          }),
          transactionId: { toString: () => '0.0.12345@1234567890' },
        }),
      };

      mockTopicCreateTransaction.freezeWith.mockResolvedValue(mockFrozenTx);

      const options: HCS6CreateRegistryOptions = {};
      const result = await client.createRegistry(options);

      expect(result.success).toBe(true);
      expect(result.topicId).toBe('0.0.12345');
      expect(result.transactionId).toBe('0.0.12345@1234567890');
      expect(mockTopicCreateTransaction.setTopicMemo).toHaveBeenCalledWith(
        'hcs-6:1:86400',
      );
    });

    it('should create registry with custom TTL and keys', async () => {
      const customKey = PrivateKey.generateED25519();

      const mockFrozenTx = {
        sign: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn().mockResolvedValue({
          getReceipt: jest.fn().mockResolvedValue({
            topicId: { toString: () => '0.0.12346' },
          }),
          transactionId: { toString: () => '0.0.12346@1234567890' },
        }),
      };

      mockTopicCreateTransaction.freezeWith.mockResolvedValue(mockFrozenTx);

      const options: HCS6CreateRegistryOptions = {
        ttl: 7200,
        adminKey: customKey,
        submitKey: customKey,
      };

      const result = await client.createRegistry(options);

      expect(result.success).toBe(true);
      expect(result.topicId).toBe('0.0.12346');
      expect(mockTopicCreateTransaction.setTopicMemo).toHaveBeenCalledWith(
        'hcs-6:1:7200',
      );
      expect(mockTopicCreateTransaction.setSubmitKey).toHaveBeenCalled();
    });

    it('should reject registry creation with invalid TTL', async () => {
      const options: HCS6CreateRegistryOptions = {
        ttl: 3599,
      };

      const result = await client.createRegistry(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('TTL must be at least 3600 seconds');
    });

    it('should handle transaction execution errors', async () => {
      const mockFrozenTx = {
        sign: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn().mockRejectedValue(new Error('Transaction failed')),
      };

      mockTopicCreateTransaction.freezeWith.mockResolvedValue(mockFrozenTx);

      const options: HCS6CreateRegistryOptions = {};
      const result = await client.createRegistry(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create HCS-6 registry');
    });
  });

  describe('registerEntry', () => {
    beforeEach(() => {
      mockMirrorNode.getTopicInfo.mockResolvedValue({ memo: 'hcs-6:1:86400' });
      mockTopicMessageSubmitTransaction = {
        setTopicId: jest.fn().mockReturnThis(),
        setMessage: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          getReceipt: jest
            .fn()
            .mockResolvedValue({ topicSequenceNumber: { low: 1 } }),
        }),
      };
      (TopicMessageSubmitTransaction as jest.Mock).mockReturnValue(
        mockTopicMessageSubmitTransaction as any,
      );
    });

    it('should register entry successfully', async () => {
      const options: HCS6RegisterEntryOptions = {
        targetTopicId: '0.0.12345',
        memo: 'Test entry',
      };

      const result = await client.registerEntry('0.0.98765', options);

      expect(result.success).toBe(true);
      expect(result.sequenceNumber).toBe(1);
    });

    it('should handle registration errors gracefully', async () => {
      (TopicMessageSubmitTransaction as jest.Mock).mockReturnValue({
        setTopicId: jest.fn().mockReturnThis(),
        setMessage: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValue(new Error('Submit failed')),
      } as any);

      const options: HCS6RegisterEntryOptions = { targetTopicId: '0.0.12345' };
      const result = await client.registerEntry('0.0.98765', options);
      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('Submit failed');
    });

    it('should handle submitMessage errors', async () => {
      (TopicMessageSubmitTransaction as jest.Mock).mockReturnValue({
        setTopicId: jest.fn().mockReturnThis(),
        setMessage: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValue(new Error('Submit failed')),
      } as any);
      const options: HCS6RegisterEntryOptions = { targetTopicId: '0.0.12345' };
      const result = await client.registerEntry('0.0.98765', options);
      expect(result.success).toBe(false);
    });
  });

  describe('getRegistry', () => {
    it('should get registry successfully', async () => {
      const mockTopicInfo = {
        memo: 'hcs-6:1:86400',
      };

      const payload = {
        p: 'hcs-6' as const,
        op: HCS6Operation.REGISTER,
        t_id: '0.0.67890',
        m: 'Test memo',
      };
      const mockMessages = [
        {
          sequence_number: 1,
          consensus_timestamp: '1234567890.000000000',
          payer_account_id: '0.0.12345',
          message: Buffer.from(JSON.stringify(payload)).toString('base64'),
        },
      ];

      mockMirrorNode.getTopicInfo.mockResolvedValue(mockTopicInfo);
      mockMirrorNode.getTopicMessages.mockResolvedValue(mockMessages);

      const options: HCS6QueryRegistryOptions = {
        limit: 10,
        order: 'asc',
      };

      const result = await client.getRegistry('0.0.98765', options);

      expect(result.topicId).toBe('0.0.98765');
      expect(result.registryType).toBe(HCS6RegistryType.NON_INDEXED);
      expect(result.ttl).toBe(86400);
      expect(result.entries.length).toBe(1);
      expect(result.latestEntry).toBeDefined();
      expect(result.entries[0].message.p).toBe('hcs-6');
      expect(result.entries[0].message.op).toBe(HCS6Operation.REGISTER);
    });

    it('should handle invalid topic memo', async () => {
      mockMirrorNode.getTopicInfo.mockResolvedValue({
        memo: 'invalid-memo',
      });

      await expect(client.getRegistry('0.0.98765')).rejects.toThrow(
        'not an HCS-6 registry',
      );
    });

    it('should handle empty messages', async () => {
      const mockTopicInfo = {
        memo: 'hcs-6:1:86400',
      };

      mockMirrorNode.getTopicInfo.mockResolvedValue(mockTopicInfo);
      mockMirrorNode.getTopicMessages.mockResolvedValue([]);

      const result = await client.getRegistry('0.0.98765');

      expect(result.entries.length).toBe(0);
      expect(result.latestEntry).toBeUndefined();
    });

    it('should handle invalid messages gracefully', async () => {
      const mockTopicInfo = {
        memo: 'hcs-6:1:86400',
      };

      const badPayload = { op: 'invalid-op' } as any;
      const mockMessages = [
        {
          sequence_number: 1,
          consensus_timestamp: '1234567890.000000000',
          payer_account_id: '0.0.12345',
          message: Buffer.from(JSON.stringify(badPayload)).toString('base64'),
        },
      ];

      mockMirrorNode.getTopicInfo.mockResolvedValue(mockTopicInfo);
      mockMirrorNode.getTopicMessages.mockResolvedValue(mockMessages);

      const result = await client.getRegistry('0.0.98765');

      expect(result.entries.length).toBe(0);
      expect(result.latestEntry).toBeUndefined();
    });
  });

  describe.skip('submitMessageWithKey', () => {
    beforeEach(() => {
      mockTopicMessageSubmitTransaction = {
        setTopicId: jest.fn().mockReturnThis(),
        setMessage: jest.fn().mockReturnThis(),
        execute: jest.fn(),
      };
      (TopicMessageSubmitTransaction as jest.Mock).mockReturnValue(
        mockTopicMessageSubmitTransaction,
      );
    });

    it('should submit message successfully', async () => {
      const mockReceipt: TransactionReceipt = {} as any;

      mockTopicMessageSubmitTransaction.execute.mockResolvedValue({
        getReceipt: jest.fn().mockResolvedValue(mockReceipt),
      });

      const message = {
        p: 'hcs-6' as const,
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
        m: 'Test memo',
      };

      const result = await (client as any).submitMessageWithKey('0.0.98765', message);

      expect(result).toBe(mockReceipt);
    });

    it('should reject invalid message', async () => {
      const invalidMessage = {
        p: 'invalid-protocol' as any,
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
      };

      await expect(
        (client as any).submitMessageWithKey('0.0.98765', invalidMessage),
      ).rejects.toThrow('Invalid HCS-6 message');
    });

    it('should handle transaction execution errors', async () => {
      mockTopicMessageSubmitTransaction.execute.mockRejectedValue(
        new Error('Transaction failed'),
      );

      const message = {
        p: 'hcs-6' as const,
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
      };

      await expect(
        (client as any).submitMessageWithKey('0.0.98765', message),
      ).rejects.toThrow('Transaction failed');
  });
  });

  describe.skip('createHashinal', () => {
    it('should create hashinal successfully', async () => {
      jest.spyOn(client as any, 'validateHCS6Topic').mockResolvedValue(true);

      const mockRegistryResponse: HCS6TopicRegistrationResponse = {
        success: true,
        topicId: '0.0.98765',
        transactionId: '0.0.98765@1234567890',
      };

      jest
        .spyOn(client, 'createRegistry')
        .mockResolvedValue(mockRegistryResponse);

      const mockInscriptionResponse = {
        confirmed: true,
        inscription: {
          topic_id: '0.0.12345',
        },
      };

      mockedInscribe.mockResolvedValue(mockInscriptionResponse);

      const mockRegisterResponse: HCS6RegistryOperationResponse = {
        success: true,
        receipt: {} as TransactionReceipt,
        sequenceNumber: 1,
      };

      jest
        .spyOn(client as any, 'registerEntryWithKey')
        .mockResolvedValue(mockRegisterResponse);

      const options: HCS6CreateHashinalOptions = {
        metadata: { name: 'Test Hashinal', creator: '0x123' },
        memo: 'Test hashinal creation',
        ttl: 86400,
        inscriptionOptions: {
          mode: 'hashinal',
        },
      };

      const result = await client.createHashinal(options);

      expect(result.success).toBe(true);
      expect(result.registryTopicId).toBe('0.0.98765');
      expect(result.inscriptionTopicId).toBe('0.0.12345');
      expect(result.transactionId).toBe('0.0.98765@1234567890');
    });

    it('should handle registry creation failure', async () => {
      const mockRegistryResponse: HCS6TopicRegistrationResponse = {
        success: false,
        error: 'Failed to create registry',
      };

      jest
        .spyOn(client, 'createRegistry')
        .mockResolvedValue(mockRegistryResponse);

      const options: HCS6CreateHashinalOptions = {
        metadata: { name: 'Test Hashinal' },
      };

      const result = await client.createHashinal(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create HCS-6 registry');
    });

    it('should handle inscription failure', async () => {
      const mockRegistryResponse: HCS6TopicRegistrationResponse = {
        success: true,
        topicId: '0.0.98765',
        transactionId: '0.0.98765@1234567890',
      };

      jest
        .spyOn(client, 'createRegistry')
        .mockResolvedValue(mockRegistryResponse);

      const mockInscriptionResponse = {
        confirmed: false,
      };

      mockedInscribe.mockResolvedValue(mockInscriptionResponse);

      const options: HCS6CreateHashinalOptions = {
        metadata: { name: 'Test Hashinal' },
        inscriptionOptions: {
          mode: 'hashinal',
        },
      };

      const result = await client.createHashinal(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to inscribe metadata');
    });

    it('should handle registration failure', async () => {
      const mockRegistryResponse: HCS6TopicRegistrationResponse = {
        success: true,
        topicId: '0.0.98765',
        transactionId: '0.0.98765@1234567890',
      };

      jest
        .spyOn(client, 'createRegistry')
        .mockResolvedValue(mockRegistryResponse);

      const mockInscriptionResponse = {
        confirmed: true,
        inscription: {
          topic_id: '0.0.12345',
        },
      };

      mockedInscribe.mockResolvedValue(mockInscriptionResponse);

      const mockRegisterResponse: HCS6RegistryOperationResponse = {
        success: false,
        error: 'Failed to register',
      };

      jest
        .spyOn(client as any, 'registerEntryWithKey')
        .mockResolvedValue(mockRegisterResponse);

      const options: HCS6CreateHashinalOptions = {
        metadata: { name: 'Test Hashinal' },
        inscriptionOptions: {
          mode: 'hashinal',
        },
      };

      const result = await client.createHashinal(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to register in HCS-6');
    });
  });

  describe('Utility Methods', () => {

    it('should get key type', () => {
      expect(client.getKeyType()).toBeDefined();
      expect(['ed25519', 'ecdsa']).toContain(client.getKeyType());
    });

    it('placeholder to keep parity with SDK surface', () => {
      expect(client.getKeyType()).toBeDefined();
    });

    it('should close client without errors', () => {
      expect(() => client.close()).not.toThrow();
    });
  });
});
