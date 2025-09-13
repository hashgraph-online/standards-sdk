/**
 * HCS-6 Browser Client Unit Tests
 *
 * Tests the HCS6BrowserClient class methods and functionality
 */

import { HCS6BrowserClient } from '../../src/hcs-6/browser';
import {
  HCS6Operation,
  HCS6RegistryType,
  HCS6RegisterMessage,
  HCS6CreateRegistryOptions,
  HCS6RegisterEntryOptions,
  HCS6QueryRegistryOptions,
  HCS6CreateHashinalOptions,
} from '../../src/hcs-6/types';
import { Logger } from '../../src/utils/logger';
import { HederaMirrorNode } from '../../src/services/mirror-node';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';
import type { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';

jest.mock('@hashgraph/sdk', () => {
  const mockTransaction = {
    setTopicMemo: jest.fn().mockReturnThis(),
    setTransactionId: jest.fn().mockReturnThis(),
    setSubmitKey: jest.fn().mockReturnThis(),
    setTopicId: jest.fn().mockReturnThis(),
    setMessage: jest.fn().mockReturnThis(),
    freezeWithSigner: jest.fn().mockResolvedValue({
      executeWithSigner: jest.fn().mockResolvedValue({
        transactionId: { toString: () => '0.0.123456@1234567890.123456789' },
        getReceiptWithSigner: jest.fn().mockResolvedValue({
          topicId: { toString: () => '0.0.999999' },
          topicSequenceNumber: 123,
        }),
      }),
    }),
  };

  return {
    TopicCreateTransaction: jest.fn(() => mockTransaction),
    TopicMessageSubmitTransaction: jest.fn(() => mockTransaction),
    TopicId: { fromString: jest.fn(id => ({ toString: () => id })) },
    TransactionId: {
      generate: jest.fn(() => ({
        toString: () => '0.0.123456@1234567890.123456789',
      })),
    },
  };
});

jest.mock('../../src/inscribe/inscriber', () => ({
  inscribeWithSigner: jest.fn().mockResolvedValue({
    confirmed: true,
    result: { jobId: 'job-1' },
    inscription: { topic_id: '0.0.333333' },
  }),
}));

jest.mock('../../src/services/mirror-node');
jest.mock('../../src/utils/logger');

const MockedMirrorNode = HederaMirrorNode as jest.MockedClass<
  typeof HederaMirrorNode
>;
const MockedLogger = Logger as jest.MockedClass<typeof Logger>;

describe('HCS6BrowserClient', () => {
  let client: HCS6BrowserClient;
  let mockMirrorNode: jest.Mocked<HederaMirrorNode>;
  let mockLogger: jest.Mocked<Logger>;
  let mockHwc: jest.Mocked<HashinalsWalletConnectSDK>;
  let mockSigner: jest.Mocked<DAppSigner>;

  const testNetwork = 'testnet' as const;

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

    MockedMirrorNode.mockImplementation(() => mockMirrorNode);

    MockedLogger.getInstance = jest.fn().mockReturnValue(mockLogger);

    mockSigner = {
      getAccountId: jest.fn().mockReturnValue({ toString: () => '0.0.123456' }),
      getAccountKey: jest
        .fn()
        .mockResolvedValue({ toString: () => 'PUBLIC_KEY' } as any),
    } as any;

    mockHwc = {
      getAccountInfo: jest
        .fn()
        .mockReturnValue({ accountId: { toString: () => '0.0.123456' } }),
      createTopic: jest.fn().mockResolvedValue('0.0.999999'),
      submitMessageToTopic: jest.fn().mockResolvedValue({
        transactionId: { toString: () => '0.0.123456@1234567890.123456789' },
        topicId: { toString: () => '0.0.999999' },
        topicSequenceNumber: 123,
      }),
      dAppConnector: { signers: [mockSigner] },
    } as any;

    client = new HCS6BrowserClient({
      network: testNetwork,
      hwc: mockHwc,
      signer: mockSigner,
    });
  });

  describe('Constructor', () => {
    it('should create browser client with provided config', () => {
      expect(client).toBeInstanceOf(HCS6BrowserClient);
      expect(MockedLogger.getInstance).toHaveBeenCalledWith({
        level: 'info',
        module: 'HCS6Client',
        silent: undefined,
      });
      expect(MockedMirrorNode).toHaveBeenCalledWith(
        'testnet',
        mockLogger,
        undefined,
      );
    });
  });

  describe('createRegistry', () => {
    it('should create a new registry via signer', async () => {
      mockMirrorNode.getTopicInfo.mockResolvedValue({
        memo: 'hcs-6:1:86400',
      } as any);
      const options: HCS6CreateRegistryOptions = {
        ttl: 86400,
        submitKey: true,
      };
      const res = await client.createRegistry(options);
      expect(res.success).toBe(true);
      expect(res.topicId).toBe('0.0.999999');
    });
  });

  describe('registerEntry', () => {
    it('should submit register message via signer', async () => {
      mockMirrorNode.getTopicInfo.mockResolvedValue({
        memo: 'hcs-6:1:86400',
      } as any);
      const options: HCS6RegisterEntryOptions = {
        targetTopicId: '0.0.67890',
        memo: 'Test entry',
      };
      const res = await client.registerEntry('0.0.999999', options);
      expect(res.success).toBe(true);
      expect(res.sequenceNumber).toBe(123);
    });
  });

  describe('submitMessage', () => {
    it('should submit message via signer and return receipt', async () => {
      const message: HCS6RegisterMessage = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
        m: 'Test memo',
      };
      const receipt = await client.submitMessage('0.0.999999', message);
      expect((receipt as any).topicSequenceNumber).toBe(123);
    });
  });

  describe('createHashinal', () => {
    it('should inscribe with signer and register in a new registry', async () => {
      mockMirrorNode.getTopicInfo.mockResolvedValue({
        memo: 'hcs-6:1:86400',
      } as any);
      const options: HCS6CreateHashinalOptions = {
        metadata: {
          name: 'Test Hashinal',
          creator: 'alice',
          description: 'demo',
          type: 'image',
        },
        ttl: 86400,
      } as any;
      const res = await client.createHashinal(options);
      expect(res.success).toBe(true);
      expect(res.registryTopicId).toBe('0.0.999999');
      expect(res.inscriptionTopicId).toBe('0.0.333333');
    });
  });

  describe('getRegistry', () => {
    it('should successfully retrieve registry information', async () => {
      const topicId = '0.0.12345';
      const mockTopicInfo = {
        memo: 'hcs-6:1:86400',
      };

      const mockMessages = [
        {
          sequence_number: 1,
          consensus_timestamp: '1234567890.000000001',
          payer_account_id: '0.0.12345',
          message: Buffer.from(
            JSON.stringify({
              p: 'hcs-6',
              op: HCS6Operation.REGISTER,
              t_id: '0.0.67890',
              m: 'Test entry',
            }),
          ).toString('base64'),
        },
      ];

      mockMirrorNode.getTopicInfo.mockResolvedValue(mockTopicInfo);
      mockMirrorNode.getTopicMessages.mockResolvedValue(mockMessages);

      const result = await client.getRegistry(topicId);

      expect(result.topicId).toBe(topicId);
      expect(result.registryType).toBe(HCS6RegistryType.NON_INDEXED);
      expect(result.ttl).toBe(86400);
      expect(result.entries.length).toBe(1);
      expect(result.latestEntry).toBeDefined();
      expect(result.latestEntry?.message.t_id).toBe('0.0.67890');
    });

    it('should handle query options correctly', async () => {
      const topicId = '0.0.12345';
      const mockTopicInfo = {
        memo: 'hcs-6:1:86400',
      };

      const mockMessages = Array.from({ length: 150 }, (_, i) => ({
        sequence_number: i + 1,
        consensus_timestamp: `1234567890.00000000${i}`,
        payer_account_id: '0.0.12345',
        message: Buffer.from(
          JSON.stringify({
            p: 'hcs-6',
            op: HCS6Operation.REGISTER,
            t_id: `0.0.${67890 + i}`,
            m: `Entry ${i}`,
          }),
        ).toString('base64'),
      }));

      mockMirrorNode.getTopicInfo.mockResolvedValue(mockTopicInfo);
      mockMirrorNode.getTopicMessages.mockResolvedValue(mockMessages);

      const options: HCS6QueryRegistryOptions = {
        limit: 50,
        skip: 10,
        order: 'desc',
      };

      await client.getRegistry(topicId, options);

      expect(mockMirrorNode.getTopicMessages).toHaveBeenCalledWith(topicId, {
        sequenceNumber: 'gt:10',
        limit: 50,
        order: 'desc',
      });
    });

    it('should use default query options when not provided', async () => {
      const topicId = '0.0.12345';
      const mockTopicInfo = {
        memo: 'hcs-6:1:86400',
      };

      mockMirrorNode.getTopicInfo.mockResolvedValue(mockTopicInfo);
      mockMirrorNode.getTopicMessages.mockResolvedValue([]);

      await client.getRegistry(topicId);

      expect(mockMirrorNode.getTopicMessages).toHaveBeenCalledWith(topicId, {
        sequenceNumber: undefined,
        limit: 100,
        order: 'asc',
      });
    });

    it('should throw error for invalid HCS-6 memo format', async () => {
      const topicId = '0.0.12345';
      const mockTopicInfo = {
        memo: 'invalid-memo',
      };

      mockMirrorNode.getTopicInfo.mockResolvedValue(mockTopicInfo);

      await expect(client.getRegistry(topicId)).rejects.toThrow(
        'is not an HCS-6 registry (invalid memo format)',
      );
    });

    it('should handle mirror node errors', async () => {
      const topicId = '0.0.12345';
      mockMirrorNode.getTopicInfo.mockRejectedValue(new Error('Network error'));

      await expect(client.getRegistry(topicId)).rejects.toThrow(
        'Network error',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get HCS-6 registry'),
      );
    });

    it('should properly slice messages when limit is applied', async () => {
      const topicId = '0.0.12345';
      const mockTopicInfo = {
        memo: 'hcs-6:1:86400',
      };

      const mockMessages = Array.from({ length: 10 }, (_, i) => ({
        sequence_number: i + 1,
        consensus_timestamp: `1234567890.00000000${i}`,
        payer_account_id: '0.0.12345',
        message: Buffer.from(
          JSON.stringify({
            p: 'hcs-6',
            op: HCS6Operation.REGISTER,
            t_id: `0.0.${67890 + i}`,
            m: `Entry ${i}`,
          }),
        ).toString('base64'),
      }));

      mockMirrorNode.getTopicInfo.mockResolvedValue(mockTopicInfo);
      mockMirrorNode.getTopicMessages.mockResolvedValue(mockMessages);

      const options: HCS6QueryRegistryOptions = {
        limit: 5,
      };

      const result = await client.getRegistry(topicId, options);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Retrieved 10 messages, using 5 after applying limit.',
      );
    });
  });

  describe('validateHCS6Topic', () => {
    it('should validate a valid HCS-6 topic', async () => {
      const topicId = '0.0.12345';
      const mockTopicInfo = {
        memo: 'hcs-6:1:86400',
      };

      mockMirrorNode.getTopicInfo.mockResolvedValue(mockTopicInfo);

      const result = await client.validateHCS6Topic(topicId);
      expect(result).toBe(true);
    });

    it('should reject topic with invalid memo format', async () => {
      const topicId = '0.0.12345';
      const mockTopicInfo = {
        memo: 'invalid-memo',
      };

      mockMirrorNode.getTopicInfo.mockResolvedValue(mockTopicInfo);

      const result = await client.validateHCS6Topic(topicId);
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'not a valid HCS-6 registry (invalid memo format)',
        ),
      );
    });

    it('should reject indexed registry type', async () => {
      const topicId = '0.0.12345';
      const mockTopicInfo = {
        memo: 'hcs-6:0:86400',
      };

      mockMirrorNode.getTopicInfo.mockResolvedValue(mockTopicInfo);

      const result = await client.validateHCS6Topic(topicId);
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('not a valid HCS-6 registry'),
      );
    });

    it('should handle mirror node errors gracefully', async () => {
      const topicId = '0.0.12345';
      mockMirrorNode.getTopicInfo.mockRejectedValue(new Error('Network error'));

      const result = await client.validateHCS6Topic(topicId);
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error validating HCS-6 topic'),
      );
    });
  });

  describe('Browser-specific behavior', () => {
    it('should inherit base client functionality', () => {
      expect(client).toHaveProperty('network');
      expect(client).toHaveProperty('logger');
      expect(client).toHaveProperty('mirrorNode');
    });

    it('should provide read-only operations without wallet', async () => {
      const topicId = '0.0.12345';
      const mockTopicInfo = {
        memo: 'hcs-6:1:86400',
      };

      mockMirrorNode.getTopicInfo.mockResolvedValue(mockTopicInfo);
      mockMirrorNode.getTopicMessages.mockResolvedValue([]);

      await expect(client.getRegistry(topicId)).resolves.toBeDefined();
      await expect(client.validateHCS6Topic(topicId)).resolves.toBe(true);
    });

    it('should restrict write operations without wallet', async () => {
      const localClient = new HCS6BrowserClient({
        network: testNetwork,
        hwc: {
          getAccountInfo: jest.fn().mockReturnValue(undefined),
          dAppConnector: { signers: [] },
        } as any,
      });
      await expect(
        localClient.createRegistry({ ttl: 86400 }),
      ).resolves.toMatchObject({ success: false });
      await expect(
        localClient.registerEntry('0.0.12345', { targetTopicId: '0.0.67890' }),
      ).resolves.toMatchObject({ success: false });
      await expect(
        localClient.submitMessage('0.0.12345', {
          p: 'hcs-6',
          op: HCS6Operation.REGISTER,
          t_id: '0.0.67890',
        } as any),
      ).rejects.toThrow('wallet');
      await expect(
        localClient.createHashinal({
          metadata: {
            name: 'Test',
            creator: 'me',
            description: 'd',
            type: 't',
          },
        } as any),
      ).resolves.toMatchObject({ success: false });
    });
  });
});
