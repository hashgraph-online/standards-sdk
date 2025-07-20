/**
 * HCS-22 Flora Account Manager Tests
 *
 * Tests for creating and managing Flora (multi-signature) accounts with collaborative governance
 */

import {
  Client,
  PrivateKey,
  PublicKey,
  AccountId,
  TopicId,
  Hbar,
  KeyList,
  AccountCreateTransaction,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import { FloraAccountManager } from '../src/hcs-22/flora-account-manager';
import {
  FloraConfig,
  FloraMember,
  FloraCreationResult,
  FloraMessage,
  FloraOperation,
} from '../src/hcs-22/types';
import { Logger } from '../src/utils/logger';
import { HCS11Client } from '../src/hcs-11/client';

const mockClient = {
  close: jest.fn(),
} as any;

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as any;

jest.mock('@hashgraph/sdk');
jest.mock('../src/hcs-11/client');

describe('FloraAccountManager', () => {
  let manager: FloraAccountManager;

  const mockMembers: FloraMember[] = [
    {
      accountId: '0.0.1001',
      publicKey: { toString: () => 'key1' } as any,
      weight: 1,
    },
    {
      accountId: '0.0.1002',
      publicKey: { toString: () => 'key2' } as any,
      weight: 1,
    },
    {
      accountId: '0.0.1003',
      publicKey: { toString: () => 'key3' } as any,
      weight: 1,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new FloraAccountManager(mockClient, mockLogger);
  });

  describe('constructor', () => {
    it('should create an instance with client and logger', () => {
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(FloraAccountManager);
    });
  });

  describe('createFlora', () => {
    it('should create a Flora account with required components', async () => {
      const mockAccountId = { toString: () => '0.0.9999' } as any;
      const mockTopicIds = {
        communication: { toString: () => '0.0.8001' } as any,
        transaction: { toString: () => '0.0.8002' } as any,
        state: { toString: () => '0.0.8003' } as any,
      };

             const mockKeyList = {
         toString: () => 'mock-keylist',
         setThreshold: jest.fn().mockReturnThis(),
         push: jest.fn(),
       } as any;

       // Mock KeyList.of for createFlora
       (KeyList.of as jest.Mock).mockReturnValue(mockKeyList);

       // Mock KeyList constructor for buildKeyList
       (KeyList as jest.MockedClass<typeof KeyList>).mockImplementation(() => mockKeyList);

      // Mock account creation
      const mockAccountTransaction = {
        setKey: jest.fn().mockReturnThis(),
        setInitialBalance: jest.fn().mockReturnThis(),
        setMaxAutomaticTokenAssociations: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          getReceipt: jest.fn().mockResolvedValue({
            accountId: mockAccountId,
          }),
          transactionId: { toString: () => 'account-tx-id' },
        }),
      };

      (AccountCreateTransaction as jest.MockedClass<typeof AccountCreateTransaction>).mockImplementation(() => mockAccountTransaction as any);

             // Mock topic creation
       let topicCallCount = 0;
       const mockTopicTransaction = {
         setTopicMemo: jest.fn().mockReturnThis(),
         setAdminKey: jest.fn().mockReturnThis(),
         setSubmitKey: jest.fn().mockReturnThis(),
         execute: jest.fn().mockImplementation(() => {
           const topicIds = ['0.0.8001', '0.0.8002', '0.0.8003'];
           const topicId = { toString: () => topicIds[topicCallCount++] };
           return Promise.resolve({
             getReceipt: jest.fn().mockResolvedValue({
               topicId,
             }),
           });
         }),
       };

      (TopicCreateTransaction as jest.MockedClass<typeof TopicCreateTransaction>).mockImplementation(() => mockTopicTransaction as any);
      (Hbar as jest.MockedClass<typeof Hbar>).mockImplementation((amount) => ({ amount }) as any);

      const config: FloraConfig = {
        displayName: 'Test Flora',
        members: mockMembers,
        threshold: 2,
        initialBalance: 10,
        maxAutomaticTokenAssociations: 100,
      };

      const result = await manager.createFlora(config);

      expect(result).toBeDefined();
      expect(result.floraAccountId).toBeDefined();
      expect(result.topics).toBeDefined();
      expect(result.keyList).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith('Flora created successfully', expect.any(Object));
    });

    it('should handle Flora creation errors', async () => {
      const mockTransaction = {
        setKey: jest.fn().mockReturnThis(),
        setInitialBalance: jest.fn().mockReturnThis(),
        setMaxAutomaticTokenAssociations: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValue(new Error('Account creation failed')),
      };

      (AccountCreateTransaction as jest.MockedClass<typeof AccountCreateTransaction>).mockImplementation(() => mockTransaction as any);

      const config: FloraConfig = {
        displayName: 'Test Flora',
        members: mockMembers,
        threshold: 2,
      };

      await expect(manager.createFlora(config)).rejects.toThrow('Account creation failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to create Flora', expect.any(Error));
    });
  });

  describe('buildKeyList', () => {
    it('should create a KeyList with proper threshold', async () => {
      const mockKeyList = {
        setThreshold: jest.fn().mockReturnThis(),
        push: jest.fn(),
      };

      (KeyList as jest.MockedClass<typeof KeyList>).mockImplementation(() => mockKeyList as any);

      const result = await (manager as any).buildKeyList(mockMembers, 2);

      expect(mockKeyList.setThreshold).toHaveBeenCalledWith(2);
      expect(mockKeyList.push).toHaveBeenCalledTimes(3);
      expect(result).toBe(mockKeyList);
    });
  });

  describe('createTopic method exists', () => {
    it('should be callable without errors', () => {
      expect(typeof (manager as any).createTopic).toBe('function');
    });
  });

  describe('Helper methods', () => {
    it('should have required private methods available', () => {
      const privateMethods = [
        'buildKeyList',
        'createFloraAccount',
        'createFloraTopics',
        'createTopic'
      ];

      privateMethods.forEach(method => {
        expect(typeof (manager as any)[method]).toBe('function');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle KeyList creation errors', async () => {
      (KeyList as jest.MockedClass<typeof KeyList>).mockImplementation(() => {
        throw new Error('KeyList creation failed');
      });

      await expect(
        (manager as any).buildKeyList(mockMembers, 2)
      ).rejects.toThrow('KeyList creation failed');
    });

    it('should handle empty member arrays', async () => {
      const mockKeyList = {
        setThreshold: jest.fn().mockReturnThis(),
        push: jest.fn(),
      };

      (KeyList as jest.MockedClass<typeof KeyList>).mockImplementation(() => mockKeyList as any);

      const result = await (manager as any).buildKeyList([], 1);

      expect(mockKeyList.setThreshold).toHaveBeenCalledWith(1);
      expect(mockKeyList.push).not.toHaveBeenCalled();
      expect(result).toBe(mockKeyList);
    });
  });

    describe('Topic Management', () => {
    it('should handle topic creation with proper memo', async () => {
      const mockTopicId = { toString: () => '0.0.8001' } as any;
      const mockTransaction = {
        setTopicMemo: jest.fn().mockReturnThis(),
        setAdminKey: jest.fn().mockReturnThis(),
        setSubmitKey: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          getReceipt: jest.fn().mockResolvedValue({
            topicId: mockTopicId,
          }),
        }),
      };

      (TopicCreateTransaction as jest.MockedClass<typeof TopicCreateTransaction>).mockImplementation(() => mockTransaction as any);

      const mockFloraAccountId = { toString: () => '0.0.9999' } as any;
      const mockAdminKey = { toString: () => 'admin-key' } as any;
      const mockSubmitKey = { toString: () => 'submit-key' } as any;

      const result = await (manager as any).createTopic(
        mockFloraAccountId,
        0, // FloraTopicType.COMMUNICATION
        mockAdminKey,
        mockSubmitKey
      );

      expect(mockTransaction.setTopicMemo).toHaveBeenCalledWith('hcs-22:0.0.9999:0');
      expect(mockTransaction.setAdminKey).toHaveBeenCalledWith(mockAdminKey);
      expect(mockTransaction.setSubmitKey).toHaveBeenCalledWith(mockSubmitKey);
      expect(result).toEqual(mockTopicId);
    });
  });
});