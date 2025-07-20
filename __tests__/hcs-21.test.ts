/**
 * HCS-21 Petal Account Manager Tests
 *
 * Tests for creating and managing Petal accounts that share keys with base accounts
 */

import {
  Client,
  PrivateKey,
  PublicKey,
  AccountId,
  Hbar,
  AccountCreateTransaction,
  AccountUpdateTransaction,
  AccountInfoQuery,
} from '@hashgraph/sdk';
import { PetalAccountManager } from '../src/hcs-21/petal-account-manager';
import { PetalAccountError } from '../src/hcs-21/types';
import { Logger } from '../src/utils/logger';

const mockClient = {
  close: jest.fn(),
} as any;

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as any;

const mockPublicKey = {
  toString: jest.fn().mockReturnValue('mock-public-key'),
  toEvmAddress: jest.fn().mockReturnValue('0x1234567890'),
} as any;

const mockPrivateKey = {
  publicKey: mockPublicKey,
  toString: jest.fn().mockReturnValue('mock-private-key'),
} as any;

const mockAccountId = {
  toString: jest.fn().mockReturnValue('0.0.12345'),
} as any;

jest.mock('@hashgraph/sdk', () => ({
  Client: jest.fn(),
  PrivateKey: {
    generateECDSA: jest.fn(() => mockPrivateKey),
    fromStringED25519: jest.fn(),
  },
  PublicKey: jest.fn(),
  AccountId: {
    fromString: jest.fn(() => mockAccountId),
  },
  Hbar: jest.fn((amount) => ({ amount })),
  AccountCreateTransaction: jest.fn(),
  AccountUpdateTransaction: jest.fn(),
  AccountInfoQuery: jest.fn(),
  TopicCreateTransaction: jest.fn(),
}));

describe('PetalAccountManager', () => {
  let manager: PetalAccountManager;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DISABLE_LOGS = 'true';
    manager = new PetalAccountManager(mockClient);
  });

  describe('createBaseAccount', () => {
    it('should create a base account with ECDSA key and EVM alias', async () => {
      const mockReceipt = {
        accountId: mockAccountId,
      };

      const mockTransactionResponse = {
        getReceipt: jest.fn().mockResolvedValue(mockReceipt),
        transactionId: { toString: () => 'mock-tx-id' },
      };

      const mockTransaction = {
        setKey: jest.fn().mockReturnThis(),
        setAlias: jest.fn().mockReturnThis(),
        setInitialBalance: jest.fn().mockReturnThis(),
        setMaxAutomaticTokenAssociations: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(mockTransactionResponse),
      };

      (AccountCreateTransaction as jest.MockedClass<typeof AccountCreateTransaction>).mockImplementation(() => mockTransaction as any);

      const result = await manager.createBaseAccount({
        initialBalance: 10,
        maxAutomaticTokenAssociations: 10,
      });

      expect(mockTransaction.setKey).toHaveBeenCalledWith(mockPublicKey);
      expect(mockTransaction.setAlias).toHaveBeenCalledWith('0x1234567890');
      expect(mockTransaction.setInitialBalance).toHaveBeenCalled();
      expect(mockTransaction.setMaxAutomaticTokenAssociations).toHaveBeenCalledWith(10);
      expect(mockTransaction.execute).toHaveBeenCalledWith(mockClient);

      expect(result).toEqual({
        accountId: mockAccountId,
        publicKey: mockPublicKey,
        evmAddress: '0x1234567890',
        transactionId: 'mock-tx-id',
        privateKey: mockPrivateKey,
      });

    });

    it('should throw error if account creation fails', async () => {
      const mockReceipt = {
        accountId: null as any,
      };

      const mockTransactionResponse = {
        getReceipt: jest.fn().mockResolvedValue(mockReceipt),
      };

      const mockTransaction = {
        setKey: jest.fn().mockReturnThis(),
        setAlias: jest.fn().mockReturnThis(),
        setInitialBalance: jest.fn().mockReturnThis(),
        setMaxAutomaticTokenAssociations: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(mockTransactionResponse),
      };

      (AccountCreateTransaction as jest.MockedClass<typeof AccountCreateTransaction>).mockImplementation(() => mockTransaction as any);

      await expect(
        manager.createBaseAccount({ initialBalance: 1 })
      ).rejects.toThrow(PetalAccountError);
    });
  });

  describe('createPetalAccount', () => {
    it('should create a petal account with shared key', async () => {
      const mockReceipt = {
        accountId: mockAccountId,
      };

      const mockTransactionResponse = {
        getReceipt: jest.fn().mockResolvedValue(mockReceipt),
        transactionId: { toString: () => 'mock-tx-id-2' },
      };

      const mockTransaction = {
        setKey: jest.fn().mockReturnThis(),
        setInitialBalance: jest.fn().mockReturnThis(),
        setMaxAutomaticTokenAssociations: jest.fn().mockReturnThis(),
        setAccountMemo: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(mockTransactionResponse),
      };

      (AccountCreateTransaction as jest.MockedClass<typeof AccountCreateTransaction>).mockImplementation(() => mockTransaction as any);

      const config = {
        sharedPrivateKey: mockPrivateKey,
        initialBalance: 5,
        maxAutomaticTokenAssociations: 20,
        memo: 'test-memo',
      };

      const result = await manager.createPetalAccount(config);

      expect(mockTransaction.setKey).toHaveBeenCalledWith(mockPublicKey);
      expect(mockTransaction.setInitialBalance).toHaveBeenCalled();
      expect(mockTransaction.setMaxAutomaticTokenAssociations).toHaveBeenCalledWith(20);
      expect(mockTransaction.setAccountMemo).toHaveBeenCalledWith('test-memo');

      expect(result).toEqual({
        accountId: mockAccountId,
        publicKey: mockPublicKey,
        transactionId: 'mock-tx-id-2',
      });
    });

    it('should use default values when optional parameters are not provided', async () => {
      const mockReceipt = {
        accountId: mockAccountId,
      };

      const mockTransactionResponse = {
        getReceipt: jest.fn().mockResolvedValue(mockReceipt),
        transactionId: { toString: () => 'mock-tx-id-3' },
      };

      const mockTransaction = {
        setKey: jest.fn().mockReturnThis(),
        setInitialBalance: jest.fn().mockReturnThis(),
        setMaxAutomaticTokenAssociations: jest.fn().mockReturnThis(),
        setAccountMemo: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(mockTransactionResponse),
      };

      (AccountCreateTransaction as jest.MockedClass<typeof AccountCreateTransaction>).mockImplementation(() => mockTransaction as any);

      const config = {
        sharedPrivateKey: mockPrivateKey,
      };

      await manager.createPetalAccount(config);

      expect(mockTransaction.setMaxAutomaticTokenAssociations).toHaveBeenCalledWith(-1);
      expect(mockTransaction.setAccountMemo).not.toHaveBeenCalled();
    });
  });

  describe('updateAccountMemo', () => {
    it('should update account memo with HCS-11 profile reference', async () => {
      const mockReceipt = {};

      const mockTransactionResponse = {
        getReceipt: jest.fn().mockResolvedValue(mockReceipt),
      };

      const mockTransaction = {
        setAccountId: jest.fn().mockReturnThis(),
        setAccountMemo: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(mockTransactionResponse),
      };

      (AccountUpdateTransaction as jest.MockedClass<typeof AccountUpdateTransaction>).mockImplementation(() => mockTransaction as any);

      await manager.updateAccountMemo('0.0.12345', 'hcs://1/0.0.8768762');

      expect(mockTransaction.setAccountId).toHaveBeenCalledWith('0.0.12345');
      expect(mockTransaction.setAccountMemo).toHaveBeenCalledWith('hcs-11:hcs://1/0.0.8768762');
      expect(mockTransaction.execute).toHaveBeenCalledWith(mockClient);
    });
  });

  describe('parseProfileReference', () => {
    it('should parse HCS-11 profile reference with HRL', () => {
      const memo = 'hcs-11:hcs://1/0.0.8768762';
      const result = manager.parseProfileReference(memo);

      expect(result).toEqual({
        protocol: 'hcs-11',
        resourceLocator: 'hcs://1/0.0.8768762',
        baseAccount: '0.0.8768762',
      });
    });

    it('should parse HCS-11 profile reference without HRL', () => {
      const memo = 'hcs-11:some-other-reference';
      const result = manager.parseProfileReference(memo);

      expect(result).toEqual({
        protocol: 'hcs-11',
        resourceLocator: 'some-other-reference',
        baseAccount: undefined,
      });
    });

    it('should return null for invalid memo format', () => {
      const memo = 'invalid-memo-format';
      const result = manager.parseProfileReference(memo);

      expect(result).toBeNull();
    });

    it('should return null for non-HCS-11 memo', () => {
      const memo = 'hcs-10:some-reference';
      const result = manager.parseProfileReference(memo);

      expect(result).toBeNull();
    });
  });

  describe('createPetalBouquet', () => {
    it('should create multiple petal accounts', async () => {
      const mockAccountIds = [
        { toString: () => '0.0.1001' },
        { toString: () => '0.0.1002' },
        { toString: () => '0.0.1003' },
      ];

      let callCount = 0;

      const mockTransactionGenerator = () => {
        const currentId = mockAccountIds[callCount++];
        return {
          setKey: jest.fn().mockReturnThis(),
          setInitialBalance: jest.fn().mockReturnThis(),
          setMaxAutomaticTokenAssociations: jest.fn().mockReturnThis(),
          setAccountMemo: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({
            getReceipt: jest.fn().mockResolvedValue({
              accountId: currentId,
            }),
            transactionId: { toString: () => `mock-tx-id-${callCount}` },
          }),
        };
      };

      (AccountCreateTransaction as jest.MockedClass<typeof AccountCreateTransaction>).mockImplementation(() => mockTransactionGenerator() as any);

      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any, delay: any) => {
        if (typeof callback === 'function') {
          callback();
        }
        return 1 as any;
      });

      const results = await manager.createPetalBouquet(mockPrivateKey, 3, {
        initialBalance: 2,
        maxAutomaticTokenAssociations: 5,
        memoPrefix: 'petal',
      });

      expect(results).toHaveLength(3);
      expect(results[0].accountId.toString()).toBe('0.0.1001');
      expect(results[1].accountId.toString()).toBe('0.0.1002');
      expect(results[2].accountId.toString()).toBe('0.0.1003');
    });
  });

  describe('verifySharedKey', () => {
    it('should return true when accounts share the same key', async () => {
      const mockKey = { toString: () => 'shared-key' };
      const mockAccountInfo = { key: mockKey };

      const mockQuery = {
        setAccountId: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(mockAccountInfo),
      };

      (AccountInfoQuery as jest.MockedClass<typeof AccountInfoQuery>).mockImplementation(() => mockQuery as any);

      const result = await manager.verifySharedKey('0.0.1001', '0.0.1002');

      expect(result).toBe(true);
      expect(mockQuery.setAccountId).toHaveBeenCalledWith('0.0.1001');
      expect(mockQuery.setAccountId).toHaveBeenCalledWith('0.0.1002');
    });

    it('should return false when accounts have different keys', async () => {
      let callCount = 0;
      const mockQuery = {
        setAccountId: jest.fn().mockReturnThis(),
        execute: jest.fn().mockImplementation(() => {
          const key = callCount++ === 0 ? 'key-1' : 'key-2';
          return Promise.resolve({ key: { toString: () => key } });
        }),
      };

      (AccountInfoQuery as jest.MockedClass<typeof AccountInfoQuery>).mockImplementation(() => mockQuery as any);

      const result = await manager.verifySharedKey('0.0.1001', '0.0.1002');

      expect(result).toBe(false);
    });

    it('should return false when query fails', async () => {
      const mockQuery = {
        setAccountId: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValue(new Error('Query failed')),
      };

      (AccountInfoQuery as jest.MockedClass<typeof AccountInfoQuery>).mockImplementation(() => mockQuery as any);

      const result = await manager.verifySharedKey('0.0.1001', '0.0.1002');

      expect(result).toBe(false);
    });
  });

  describe('findPetalsByPublicKey', () => {
    it('should find petal relationships and identify base account', async () => {
      const mockPublicKey = {
        toString: () => 'shared-public-key',
      } as any;

      const accountInfos = [
        {
          key: { toString: () => 'shared-public-key' },
          contractAccountId: '0x1234',
          accountMemo: 'hcs-11:hcs://1/0.0.8768762',
        },
        {
          key: { toString: () => 'shared-public-key' },
          contractAccountId: null,
          accountMemo: 'hcs-11:profile-reference',
        },
        {
          key: { toString: () => 'different-key' },
          contractAccountId: null,
          accountMemo: '',
        },
      ];

      let callCount = 0;
      const mockQuery = {
        setAccountId: jest.fn().mockReturnThis(),
        execute: jest.fn().mockImplementation(() => {
          return Promise.resolve(accountInfos[callCount++]);
        }),
      };

      (AccountInfoQuery as jest.MockedClass<typeof AccountInfoQuery>).mockImplementation(() => mockQuery as any);

      const knownAccountIds = ['0.0.1001', '0.0.1002', '0.0.1003'];
      const results = await manager.findPetalsByPublicKey(mockPublicKey, knownAccountIds);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        petalAccountId: '0.0.1001',
        baseAccountId: '0.0.1001',
        sharedPublicKey: mockPublicKey,
        profileTopicId: 'hcs://1/0.0.8768762',
      });
      expect(results[1]).toEqual({
        petalAccountId: '0.0.1002',
        baseAccountId: '0.0.1001',
        sharedPublicKey: mockPublicKey,
        profileTopicId: 'profile-reference',
      });
    });

    it('should handle accounts without profile references', async () => {
      const mockPublicKey = {
        toString: () => 'shared-public-key',
      } as any;

      const mockQuery = {
        setAccountId: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          key: { toString: () => 'shared-public-key' },
          contractAccountId: null,
          accountMemo: '',
        }),
      };

      (AccountInfoQuery as jest.MockedClass<typeof AccountInfoQuery>).mockImplementation(() => mockQuery as any);

      const results = await manager.findPetalsByPublicKey(mockPublicKey, ['0.0.1001']);

      expect(results).toHaveLength(1);
      expect(results[0].profileTopicId).toBeUndefined();
    });
  });
});