/**
 * HCS-6 Base Client Unit Tests
 *
 * Tests the HCS6BaseClient abstract class methods and functionality
 */

import { HCS6BaseClient } from '../../src/hcs-6/base-client';
import {
  HCS6ClientConfig,
  HCS6Message,
  HCS6Operation,
  HCS6RegisterMessage,
  HCS6RegistryType,
  HCS6TopicRegistrationResponse,
  HCS6RegistryOperationResponse,
  HCS6TopicRegistry,
  HCS6CreateRegistryOptions,
  HCS6RegisterEntryOptions,
  HCS6QueryRegistryOptions,
  HCS6RegistryEntry,
  validateHCS6TTL,
  generateHCS6RegistryMemo,
} from '../../src/hcs-6/types';
import { TransactionReceipt } from '@hashgraph/sdk';
import { Logger } from '../../src/utils/logger';
import { HederaMirrorNode } from '../../src/services/mirror-node';

jest.mock('../../src/services/mirror-node');
jest.mock('../../src/utils/logger');

const MockedMirrorNode = HederaMirrorNode as jest.MockedClass<
  typeof HederaMirrorNode
>;
const MockedLogger = Logger as jest.MockedClass<typeof Logger>;
class TestHCS6Client extends HCS6BaseClient {
  async createRegistry(
    options: HCS6CreateRegistryOptions,
  ): Promise<HCS6TopicRegistrationResponse> {
    return {
      success: true,
      topicId: '0.0.12345',
      transactionId: '0.0.12345@1234567890',
    };
  }

  async registerEntry(
    registryTopicId: string,
    options: HCS6RegisterEntryOptions,
  ): Promise<HCS6RegistryOperationResponse> {
    return {
      success: true,
      receipt: {} as TransactionReceipt,
      sequenceNumber: 1,
    };
  }

  async getRegistry(
    topicId: string,
    options?: HCS6QueryRegistryOptions,
  ): Promise<HCS6TopicRegistry> {
    return {
      topicId,
      registryType: HCS6RegistryType.NON_INDEXED,
      ttl: 86400,
      entries: [],
      latestEntry: undefined,
    };
  }

  async submitMessage(
    topicId: string,
    payload: HCS6Message,
  ): Promise<TransactionReceipt> {
    return {} as TransactionReceipt;
  }

  public testParseRegistryTypeFromMemo(memo: string) {
    return this.parseRegistryTypeFromMemo(memo);
  }

  public testGenerateRegistryMemo(ttl: number) {
    return this.generateRegistryMemo(ttl);
  }

  public testValidateMessage(message: any) {
    return this.validateMessage(message);
  }

  public testCreateRegisterMessage(targetTopicId: string, memo?: string) {
    return this.createRegisterMessage(targetTopicId, memo);
  }

  public testParseRegistryEntries(
    topicId: string,
    messages: any[],
    registryType: HCS6RegistryType,
    ttl: number,
  ) {
    return this.parseRegistryEntries(topicId, messages, registryType, ttl);
  }

  public async testValidateHCS6Topic(topicId: string) {
    return this.validateHCS6Topic(topicId);
  }
}

describe('HCS6BaseClient', () => {
  let client: TestHCS6Client;
  let mockMirrorNode: jest.Mocked<HederaMirrorNode>;
  let mockLogger: jest.Mocked<Logger>;

  const testConfig: HCS6ClientConfig = {
    operatorId: '0.0.12345',
    operatorKey: 'mock-key',
    network: 'testnet',
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

    client = new TestHCS6Client(testConfig);
  });

  describe('Constructor', () => {
    it('should create client with provided config', () => {
      expect(client).toBeInstanceOf(HCS6BaseClient);
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

    it('should create client with custom logger', () => {
      const customLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      } as any;

      const configWithLogger: HCS6ClientConfig = {
        ...testConfig,
        logger: customLogger,
      };

      jest.clearAllMocks();

      const clientWithLogger = new TestHCS6Client(configWithLogger);
      expect(MockedLogger.getInstance).not.toHaveBeenCalled();
      expect(clientWithLogger).toBeInstanceOf(HCS6BaseClient);
    });

    it('should create client with custom mirror node URL', () => {
      const configWithUrl: HCS6ClientConfig = {
        ...testConfig,
        mirrorNodeUrl: 'https://custom.mirror.node',
      };

      const clientWithUrl = new TestHCS6Client(configWithUrl);
      expect(MockedMirrorNode).toHaveBeenCalledWith('testnet', mockLogger, {
        customUrl: 'https://custom.mirror.node',
      });
    });

    it('should create client with silent logging', () => {
      const configWithSilent: HCS6ClientConfig = {
        ...testConfig,
        silent: true,
        logLevel: 'debug',
      };

      const silentClient = new TestHCS6Client(configWithSilent);
      expect(MockedLogger.getInstance).toHaveBeenCalledWith({
        level: 'debug',
        module: 'HCS6Client',
        silent: true,
      });
    });
  });

  describe('parseRegistryTypeFromMemo', () => {
    it('should parse valid HCS-6 memo format', () => {
      const result = client.testParseRegistryTypeFromMemo('hcs-6:1:86400');
      expect(result).toEqual({
        registryType: HCS6RegistryType.NON_INDEXED,
        ttl: 86400,
      });
    });

    it('should parse minimum TTL correctly', () => {
      const result = client.testParseRegistryTypeFromMemo('hcs-6:1:3600');
      expect(result).toEqual({
        registryType: HCS6RegistryType.NON_INDEXED,
        ttl: 3600,
      });
    });

    it('should return undefined for invalid memo format', () => {
      const invalidMemos = [
        'invalid-format',
        'hcs-6:0:86400',
        'hcs-6:2:86400',
        'hcs-6:1:3599',
        'hcs-6:1:0',
        'hcs-6:1:',
        'hcs-6::86400',
        'hcs-2:1:86400',
        '',
      ];

      invalidMemos.forEach(memo => {
        const result = client.testParseRegistryTypeFromMemo(memo);
        expect(result).toBeUndefined();
      });
    });

    it('should handle parsing errors gracefully', () => {
      const result = client.testParseRegistryTypeFromMemo('hcs-6:abc:def');
      expect(result).toBeUndefined();
    });
  });

  describe('generateRegistryMemo', () => {
    it('should generate correct memo format', () => {
      expect(client.testGenerateRegistryMemo(86400)).toBe('hcs-6:1:86400');
      expect(client.testGenerateRegistryMemo(3600)).toBe('hcs-6:1:3600');
      expect(client.testGenerateRegistryMemo(604800)).toBe('hcs-6:1:604800');
    });

    it('should throw error for invalid TTL', () => {
      expect(() => client.testGenerateRegistryMemo(3599)).toThrow(
        'TTL must be at least 3600 seconds',
      );
      expect(() => client.testGenerateRegistryMemo(0)).toThrow(
        'TTL must be at least 3600 seconds',
      );
      expect(() => client.testGenerateRegistryMemo(-1)).toThrow(
        'TTL must be at least 3600 seconds',
      );
    });
  });

  describe('validateMessage', () => {
    it('should validate a valid register message', () => {
      const validMessage: HCS6RegisterMessage = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
        m: 'Test memo',
      };

      const result = client.testValidateMessage(validMessage);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate a register message without optional memo', () => {
      const validMessage: HCS6RegisterMessage = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
      };

      const result = client.testValidateMessage(validMessage);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject messages with invalid protocol', () => {
      const invalidMessage = {
        p: 'wrong-protocol',
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
      };

      const result = client.testValidateMessage(invalidMessage);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'p: Invalid literal value, expected "hcs-6"',
      );
    });

    it('should reject messages with invalid operation', () => {
      const invalidMessage = {
        p: 'hcs-6',
        op: 'invalid-op',
        t_id: '0.0.12345',
      };

      const result = client.testValidateMessage(invalidMessage);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('op: Invalid discriminator value');
    });

    it('should reject register messages without t_id', () => {
      const invalidMessage = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
      };

      const result = client.testValidateMessage(invalidMessage);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('t_id: Required');
    });

    it('should reject messages with invalid topic ID format', () => {
      const invalidMessage = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        t_id: 'invalid-format',
      };

      const result = client.testValidateMessage(invalidMessage);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain(
        't_id: Topic ID must be in Hedera format',
      );
    });

    it('should reject messages with memo exceeding 500 characters', () => {
      const invalidMessage = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
        m: 'a'.repeat(501),
      };

      const result = client.testValidateMessage(invalidMessage);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('m: Memo must not exceed 500 characters');
    });

    it('should handle unexpected validation errors', () => {
      const result = client.testValidateMessage(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('createRegisterMessage', () => {
    it('should create a register message with memo', () => {
      const message = client.testCreateRegisterMessage(
        '0.0.12345',
        'Test memo',
      );
      expect(message).toEqual({
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
        m: 'Test memo',
      });
    });

    it('should create a register message without memo', () => {
      const message = client.testCreateRegisterMessage('0.0.12345');
      expect(message).toEqual({
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
        m: undefined,
      });
    });
  });

  describe('parseRegistryEntries', () => {
    const topicId = '0.0.12345';
    const registryType = HCS6RegistryType.NON_INDEXED;
    const ttl = 86400;

    it('should parse valid messages into registry entries', () => {
      const messages = [
        {
          sequence_number: 1,
          consensus_timestamp: '1234567890.000000001',
          payer_account_id: '0.0.12345',
          message: Buffer.from(
            JSON.stringify({
              p: 'hcs-6',
              op: HCS6Operation.REGISTER,
              t_id: '0.0.67890',
              m: 'First entry',
            }),
          ).toString('base64'),
        },
        {
          sequence_number: 2,
          consensus_timestamp: '1234567890.000000002',
          payer_account_id: '0.0.12345',
          message: Buffer.from(
            JSON.stringify({
              p: 'hcs-6',
              op: HCS6Operation.REGISTER,
              t_id: '0.0.67891',
              m: 'Second entry',
            }),
          ).toString('base64'),
        },
      ];

      const result = client.testParseRegistryEntries(
        topicId,
        messages,
        registryType,
        ttl,
      );

      expect(result.topicId).toBe(topicId);
      expect(result.registryType).toBe(registryType);
      expect(result.ttl).toBe(ttl);
      expect(result.entries.length).toBe(1);
      expect(result.latestEntry).toBeDefined();
      expect(result.latestEntry?.message.t_id).toBe('0.0.67891');
      expect(result.latestEntry?.message.m).toBe('Second entry');
    });

    it('should handle messages without message property', () => {
      const messages = [
        {
          sequence_number: 1,
          consensus_timestamp: '1234567890.000000001',
          payer_account_id: '0.0.12345',
        },
      ];

      const result = client.testParseRegistryEntries(
        topicId,
        messages,
        registryType,
        ttl,
      );

      expect(result.entries.length).toBe(0);
      expect(result.latestEntry).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("Message is missing 'message' property"),
      );
    });

    it('should handle invalid JSON in messages', () => {
      const messages = [
        {
          sequence_number: 1,
          consensus_timestamp: '1234567890.000000001',
          payer_account_id: '0.0.12345',
          message: Buffer.from('invalid json').toString('base64'),
        },
      ];

      const result = client.testParseRegistryEntries(
        topicId,
        messages,
        registryType,
        ttl,
      );

      expect(result.entries.length).toBe(0);
      expect(result.latestEntry).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error parsing HCS-6 message'),
      );
    });

    it('should skip invalid HCS-6 messages', () => {
      const messages = [
        {
          sequence_number: 1,
          consensus_timestamp: '1234567890.000000001',
          payer_account_id: '0.0.12345',
          message: Buffer.from(
            JSON.stringify({
              p: 'wrong-protocol',
              op: HCS6Operation.REGISTER,
              t_id: '0.0.67890',
            }),
          ).toString('base64'),
        },
      ];

      const result = client.testParseRegistryEntries(
        topicId,
        messages,
        registryType,
        ttl,
      );

      expect(result.entries.length).toBe(0);
      expect(result.latestEntry).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid HCS-6 message'),
      );
    });

    it('should handle empty message array', () => {
      const result = client.testParseRegistryEntries(
        topicId,
        [],
        registryType,
        ttl,
      );

      expect(result.entries.length).toBe(0);
      expect(result.latestEntry).toBeUndefined();
    });

    it('should determine latest entry correctly', () => {
      const messages = [
        {
          sequence_number: 2,
          consensus_timestamp: '1234567890.000000002',
          payer_account_id: '0.0.12345',
          message: Buffer.from(
            JSON.stringify({
              p: 'hcs-6',
              op: HCS6Operation.REGISTER,
              t_id: '0.0.67891',
              m: 'Newer entry',
            }),
          ).toString('base64'),
        },
        {
          sequence_number: 1,
          consensus_timestamp: '1234567890.000000001',
          payer_account_id: '0.0.12345',
          message: Buffer.from(
            JSON.stringify({
              p: 'hcs-6',
              op: HCS6Operation.REGISTER,
              t_id: '0.0.67890',
              m: 'Older entry',
            }),
          ).toString('base64'),
        },
      ];

      const result = client.testParseRegistryEntries(
        topicId,
        messages,
        registryType,
        ttl,
      );

      expect(result.latestEntry?.message.m).toBe('Newer entry');
      expect(result.latestEntry?.timestamp).toBe('1234567890.000000002');
    });
  });

  describe('validateHCS6Topic', () => {
    it('should validate a valid HCS-6 topic', async () => {
      mockMirrorNode.getTopicInfo.mockResolvedValue({
        memo: 'hcs-6:1:86400',
      });

      const result = await client.testValidateHCS6Topic('0.0.12345');
      expect(result).toBe(true);
    });

    it('should reject topic with invalid memo format', async () => {
      mockMirrorNode.getTopicInfo.mockResolvedValue({
        memo: 'invalid-memo',
      });

      const result = await client.testValidateHCS6Topic('0.0.12345');
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'not a valid HCS-6 registry (invalid memo format)',
        ),
      );
    });

    it('should reject indexed registry type', async () => {
      mockMirrorNode.getTopicInfo.mockResolvedValue({
        memo: 'hcs-6:0:86400',
      });

      const result = await client.testValidateHCS6Topic('0.0.12345');
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('not a valid HCS-6 registry'),
      );
    });

    it('should handle mirror node errors', async () => {
      mockMirrorNode.getTopicInfo.mockRejectedValue(new Error('Network error'));

      const result = await client.testValidateHCS6Topic('0.0.12345');
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error validating HCS-6 topic'),
      );
    });
  });
});
