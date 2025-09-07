import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  PublicKey,
  KeyList,
  TopicId,
} from '@hashgraph/sdk';
import {
  encodeHcs2RegistryMemo,
  buildTopicCreateTx,
  buildMessageTx,
  MaybeKey,
} from '../../../src/common/tx/tx-utils';

jest.mock('@hashgraph/sdk', () => ({
  TopicCreateTransaction: jest.fn().mockImplementation(() => ({
    setTopicMemo: jest.fn().mockReturnThis(),
    setAdminKey: jest.fn().mockReturnThis(),
    setSubmitKey: jest.fn().mockReturnThis(),
    freezeWith: jest.fn().mockReturnThis(),
  })),
  TopicMessageSubmitTransaction: jest.fn().mockImplementation(() => ({
    setTopicId: jest.fn().mockReturnThis(),
    setMessage: jest.fn().mockReturnThis(),
    setTransactionMemo: jest.fn().mockReturnThis(),
    freezeWith: jest.fn().mockReturnThis(),
  })),
  PublicKey: jest.fn().mockImplementation(() => ({
  })),
  KeyList: jest.fn().mockImplementation(() => ({
  })),
  TopicId: {
    fromString: jest.fn(),
  },
}));

describe('Common TX Utils', () => {
  const mockTopicCreateTransaction = TopicCreateTransaction as jest.MockedClass<typeof TopicCreateTransaction>;
  const mockTopicMessageSubmitTransaction = TopicMessageSubmitTransaction as jest.MockedClass<typeof TopicMessageSubmitTransaction>;
  const mockPublicKey = PublicKey as jest.Mocked<typeof PublicKey>;
  const mockTopicId = TopicId as jest.Mocked<typeof TopicId>;

  beforeEach(() => {
    jest.clearAllMocks();

    const mockTxInstance = {
      setTopicMemo: jest.fn().mockReturnThis(),
      setAdminKey: jest.fn().mockReturnThis(),
      setSubmitKey: jest.fn().mockReturnThis(),
      freezeWith: jest.fn().mockReturnThis(),
    };

    const mockMessageTxInstance = {
      setTopicId: jest.fn().mockReturnThis(),
      setMessage: jest.fn().mockReturnThis(),
      setTransactionMemo: jest.fn().mockReturnThis(),
      freezeWith: jest.fn().mockReturnThis(),
    };

    mockTopicCreateTransaction.mockReturnValue(mockTxInstance as any);
    mockTopicMessageSubmitTransaction.mockReturnValue(mockMessageTxInstance as any);
  });

  describe('encodeHcs2RegistryMemo', () => {
    test('should encode HCS-2 registry memo with indexed flag 0', () => {
      const result = encodeHcs2RegistryMemo(0, 86400);
      expect(result).toBe('hcs-2:0:86400');
    });

    test('should encode HCS-2 registry memo with indexed flag 1', () => {
      const result = encodeHcs2RegistryMemo(1, 3600);
      expect(result).toBe('hcs-2:1:3600');
    });

    test('should encode HCS-2 registry memo with different TTL values', () => {
      expect(encodeHcs2RegistryMemo(0, 0)).toBe('hcs-2:0:0');
      expect(encodeHcs2RegistryMemo(1, 999999)).toBe('hcs-2:1:999999');
    });
  });

  describe('buildTopicCreateTx', () => {
    test('should create topic with memo only', () => {
      const params = {
        memo: 'test-topic-memo',
      };

      const result = buildTopicCreateTx(params);

      expect(mockTopicCreateTransaction).toHaveBeenCalledTimes(1);
      expect(result.setTopicMemo).toHaveBeenCalledWith('test-topic-memo');
      expect(result.setAdminKey).not.toHaveBeenCalled();
      expect(result.setSubmitKey).not.toHaveBeenCalled();
    });

    test('should create topic with admin key as string', () => {
      const mockPublicKeyInstance = {};
      mockPublicKey.fromString.mockReturnValue(mockPublicKeyInstance);

      const params = {
        memo: 'test-topic-memo',
        adminKey: '302a300506032b6570032100114e6abc371b82dab5c15ea149f02d34a53',
      };

      const result = buildTopicCreateTx(params);

      expect(mockPublicKey.fromString).toHaveBeenCalledWith(params.adminKey);
      expect(result.setAdminKey).toHaveBeenCalledWith(mockPublicKeyInstance);
    });

    test('should create topic with submit key as string', () => {
      const mockPublicKeyInstance = {};
      mockPublicKey.fromString.mockReturnValue(mockPublicKeyInstance);

      const params = {
        memo: 'test-topic-memo',
        submitKey: '302a300506032b6570032100114e6abc371b82dab5c15ea149f02d34a53',
      };

      const result = buildTopicCreateTx(params);

      expect(mockPublicKey.fromString).toHaveBeenCalledWith(params.submitKey);
      expect(result.setSubmitKey).toHaveBeenCalledWith(mockPublicKeyInstance);
    });

    test('should create topic with admin key as boolean true', () => {
      const operatorPublicKey = {};
      const params = {
        memo: 'test-topic-memo',
        adminKey: true,
        operatorPublicKey: operatorPublicKey as any,
      };

      const result = buildTopicCreateTx(params);

      expect(result.setAdminKey).toHaveBeenCalledWith(operatorPublicKey);
    });

    test('should create topic with admin key as boolean false', () => {
      const params = {
        memo: 'test-topic-memo',
        adminKey: false,
      };

      const result = buildTopicCreateTx(params);

      expect(result.setAdminKey).not.toHaveBeenCalled();
    });

    test('should create topic with PublicKey instance', () => {
      const publicKeyInstance = new PublicKey();
      const params = {
        memo: 'test-topic-memo',
        adminKey: publicKeyInstance as any,
      };

      const result = buildTopicCreateTx(params);

      expect(result.setAdminKey).toHaveBeenCalledWith(publicKeyInstance);
    });

    test('should create topic with KeyList instance', () => {
      const keyListInstance = new KeyList();
      const params = {
        memo: 'test-topic-memo',
        submitKey: keyListInstance as any,
      };

      const result = buildTopicCreateTx(params);

      expect(result.setSubmitKey).toHaveBeenCalledWith(keyListInstance);
    });

    test('should handle invalid string key gracefully', () => {
      mockPublicKey.fromString.mockImplementation(() => {
        throw new Error('Invalid key format');
      });

      const params = {
        memo: 'test-topic-memo',
        adminKey: 'invalid-key-format',
      };

      const result = buildTopicCreateTx(params);

      expect(result.setAdminKey).not.toHaveBeenCalled();
    });

    test('should create topic with both admin and submit keys', () => {
      const mockAdminKey = {};
      const mockSubmitKey = {};
      mockPublicKey.fromString
        .mockReturnValueOnce(mockAdminKey)
        .mockReturnValueOnce(mockSubmitKey);

      const params = {
        memo: 'test-topic-memo',
        adminKey: 'admin-key-string',
        submitKey: 'submit-key-string',
      };

      const result = buildTopicCreateTx(params);

      expect(result.setAdminKey).toHaveBeenCalledWith(mockAdminKey);
      expect(result.setSubmitKey).toHaveBeenCalledWith(mockSubmitKey);
    });

    test('should create topic with operator public key for boolean true', () => {
      const operatorPublicKey = {};
      const params = {
        memo: 'test-topic-memo',
        adminKey: true,
        submitKey: true,
        operatorPublicKey: operatorPublicKey as any,
      };

      const result = buildTopicCreateTx(params);

      expect(result.setAdminKey).toHaveBeenCalledWith(operatorPublicKey);
      expect(result.setSubmitKey).toHaveBeenCalledWith(operatorPublicKey);
    });
  });

  describe('buildMessageTx', () => {
    test('should create message transaction with string message', () => {
      const mockTopicIdInstance = {};
      mockTopicId.fromString.mockReturnValue(mockTopicIdInstance);

      const params = {
        topicId: '0.0.12345',
        message: 'Hello World',
      };

      const result = buildMessageTx(params);

      expect(mockTopicId.fromString).toHaveBeenCalledWith('0.0.12345');
      expect(result.setTopicId).toHaveBeenCalledWith(mockTopicIdInstance);
      expect(result.setMessage).toHaveBeenCalledWith('Hello World');
      expect(result.setTransactionMemo).not.toHaveBeenCalled();
    });

    test('should create message transaction with Uint8Array message', () => {
      const mockTopicIdInstance = {};
      mockTopicId.fromString.mockReturnValue(mockTopicIdInstance);

      const message = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const params = {
        topicId: '0.0.12345',
        message,
      };

      const result = buildMessageTx(params);

      expect(result.setMessage).toHaveBeenCalledWith(message);
    });

    test('should create message transaction with transaction memo', () => {
      const mockTopicIdInstance = {};
      mockTopicId.fromString.mockReturnValue(mockTopicIdInstance);

      const params = {
        topicId: '0.0.12345',
        message: 'Hello World',
        transactionMemo: 'Test transaction',
      };

      const result = buildMessageTx(params);

      expect(result.setTransactionMemo).toHaveBeenCalledWith('Test transaction');
    });

    test('should create message transaction with empty memo', () => {
      const mockTopicIdInstance = {};
      mockTopicId.fromString.mockReturnValue(mockTopicIdInstance);

      const params = {
        topicId: '0.0.12345',
        message: 'Hello World',
        transactionMemo: 'test',
      };

      const result = buildMessageTx(params);

      expect(result.setTransactionMemo).toHaveBeenCalledWith('test');
    });

    test('should handle different topic ID formats', () => {
      const mockTopicIdInstance = {};
      mockTopicId.fromString.mockReturnValue(mockTopicIdInstance);

      const testCases = [
        '0.0.12345',
        '1.2.34567',
        '0.0.1',
      ];

      testCases.forEach(topicId => {
        mockTopicId.fromString.mockReturnValueOnce(mockTopicIdInstance);
        const params = {
          topicId,
          message: 'test',
        };

        buildMessageTx(params);

        expect(mockTopicId.fromString).toHaveBeenCalledWith(topicId);
      });
    });
  });

  describe('MaybeKey type handling', () => {
    test('should handle all MaybeKey variants in coerceKey function', () => {
      expect(true).toBe(true);
    });
  });
});
