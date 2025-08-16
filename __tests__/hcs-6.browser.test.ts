/**
 * HCS-6 Browser Client Unit Tests
 *
 * Tests the HCS6BrowserClient class methods and functionality
 */

import { HCS6BrowserClient } from '../src/hcs-6/browser';
import {
  HCS6Operation,
  HCS6RegistryType,
  HCS6RegisterMessage,
  HCS6CreateRegistryOptions,
  HCS6RegisterEntryOptions,
  HCS6QueryRegistryOptions,
  HCS6CreateHashinalOptions,
} from '../src/hcs-6/types';
import { Logger } from '../src/utils/logger';
import { HederaMirrorNode } from '../src/services/mirror-node';

jest.mock('../src/services/mirror-node');
jest.mock('../src/utils/logger');

const MockedMirrorNode = HederaMirrorNode as jest.MockedClass<
  typeof HederaMirrorNode
>;
const MockedLogger = Logger as jest.MockedClass<typeof Logger>;

describe('HCS6BrowserClient', () => {
  let client: HCS6BrowserClient;
  let mockMirrorNode: jest.Mocked<HederaMirrorNode>;
  let mockLogger: jest.Mocked<Logger>;

  const testConfig = {
    operatorId: '0.0.12345',
    operatorKey: 'mock-key',
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

    MockedMirrorNode.mockImplementation(() => mockMirrorNode);

    MockedLogger.getInstance = jest.fn().mockReturnValue(mockLogger);

    client = new HCS6BrowserClient(testConfig);
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

    it('should create browser client with custom logger level', () => {
      const configWithLogLevel = {
        ...testConfig,
        logLevel: 'debug' as const,
      };

      const debugClient = new HCS6BrowserClient(configWithLogLevel);
      expect(MockedLogger.getInstance).toHaveBeenCalledWith({
        level: 'debug',
        module: 'HCS6Client',
        silent: undefined,
      });
    });
  });

  describe('createRegistry', () => {
    it('should throw error indicating wallet integration required', async () => {
      const options: HCS6CreateRegistryOptions = {
        ttl: 86400,
      };

      await expect(client.createRegistry(options)).rejects.toThrow(
        'Browser client requires wallet integration for registry creation',
      );
    });
  });

  describe('registerEntry', () => {
    it('should throw error indicating wallet integration required', async () => {
      const options: HCS6RegisterEntryOptions = {
        targetTopicId: '0.0.12345',
        memo: 'Test entry',
      };

      await expect(client.registerEntry('0.0.98765', options)).rejects.toThrow(
        'Browser client requires wallet integration for entry registration',
      );
    });
  });

  describe('submitMessage', () => {
    it('should throw error indicating wallet integration required', async () => {
      const message: HCS6RegisterMessage = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
        m: 'Test memo',
      };

      await expect(client.submitMessage('0.0.98765', message)).rejects.toThrow(
        'Browser client requires wallet integration for message submission',
      );
    });
  });

  describe('createHashinal', () => {
    it('should throw error indicating wallet integration required', async () => {
      const options: HCS6CreateHashinalOptions = {
        metadata: { name: 'Test Hashinal' },
        ttl: 86400,
      };

      await expect(client.createHashinal(options)).rejects.toThrow(
        'Browser client requires wallet integration for hashinal creation',
      );
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
      const writeOperations = [
        () => client.createRegistry({ ttl: 86400 }),
        () => client.registerEntry('0.0.12345', { targetTopicId: '0.0.67890' }),
        () =>
          client.submitMessage('0.0.12345', {
            p: 'hcs-6',
            op: HCS6Operation.REGISTER,
            t_id: '0.0.67890',
          }),
        () => client.createHashinal({ metadata: { name: 'Test' } }),
      ];

      for (const operation of writeOperations) {
        await expect(operation()).rejects.toThrow('wallet integration');
      }
    });
  });
});
