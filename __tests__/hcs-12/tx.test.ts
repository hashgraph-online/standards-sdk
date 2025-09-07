import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  PublicKey,
} from '@hashgraph/sdk';
import {
  Hcs12RegistryType,
  buildHcs12CreateRegistryTopicTx,
  buildHcs12SubmitMessageTx,
  buildHcs12RegisterAssemblyTx,
  buildHcs12AddBlockToAssemblyTx,
  buildHcs12AddActionToAssemblyTx,
  buildHcs12UpdateAssemblyTx,
} from '../../src/hcs-12/tx';
import type {
  ActionRegistration,
  AssemblyRegistration,
  AssemblyAddBlock,
  AssemblyAddAction,
  AssemblyUpdate,
} from '../../src/hcs-12/types';

jest.mock('@hashgraph/sdk', () => ({
  TopicCreateTransaction: jest.fn().mockImplementation(() => ({
    setAdminKey: jest.fn().mockReturnThis(),
    setSubmitKey: jest.fn().mockReturnThis(),
    setTopicMemo: jest.fn().mockReturnThis(),
    freezeWith: jest.fn().mockReturnThis(),
  })),
  TopicMessageSubmitTransaction: jest.fn().mockImplementation(() => ({
    setTopicId: jest.fn().mockReturnThis(),
    setMessage: jest.fn().mockReturnThis(),
    setTransactionMemo: jest.fn().mockReturnThis(),
    freezeWith: jest.fn().mockReturnThis(),
  })),
  PublicKey: {
    fromString: jest.fn().mockReturnValue({}),
  },
  KeyList: jest.fn(),
}));

jest.mock('../../src/common/tx/tx-utils', () => ({
  buildTopicCreateTx: jest.fn(),
  buildMessageTx: jest.fn(),
  MaybeKey: {},
}));

describe('HCS-12 Transaction Builders', () => {
  const mockBuildTopicCreateTx =
    require('../../src/common/tx/tx-utils').buildTopicCreateTx;
  const mockBuildMessageTx =
    require('../../src/common/tx/tx-utils').buildMessageTx;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildHcs12CreateRegistryTopicTx', () => {
    test('should create topic with default memo for action registry', () => {
      const mockTx = new TopicCreateTransaction();
      mockBuildTopicCreateTx.mockReturnValue(mockTx);

      const result = buildHcs12CreateRegistryTopicTx({
        registry: 'action',
        ttl: 86400,
      });

      expect(mockBuildTopicCreateTx).toHaveBeenCalledWith({
        memo: 'hcs-12:1:86400:0',
        adminKey: undefined,
        submitKey: undefined,
        operatorPublicKey: undefined,
      });
      expect(result).toBe(mockTx);
    });

    test('should create topic with default memo for assembly registry', () => {
      const mockTx = new TopicCreateTransaction();
      mockBuildTopicCreateTx.mockReturnValue(mockTx);

      const result = buildHcs12CreateRegistryTopicTx({
        registry: 'assembly',
        ttl: 3600,
      });

      expect(mockBuildTopicCreateTx).toHaveBeenCalledWith({
        memo: 'hcs-12:1:3600:2',
        adminKey: undefined,
        submitKey: undefined,
        operatorPublicKey: undefined,
      });
      expect(result).toBe(mockTx);
    });

    test('should create topic with default memo for hashlinks registry', () => {
      const mockTx = new TopicCreateTransaction();
      mockBuildTopicCreateTx.mockReturnValue(mockTx);

      const result = buildHcs12CreateRegistryTopicTx({
        registry: 'hashlinks',
        ttl: 7200,
      });

      expect(mockBuildTopicCreateTx).toHaveBeenCalledWith({
        memo: 'hcs-12:1:7200:3',
        adminKey: undefined,
        submitKey: undefined,
        operatorPublicKey: undefined,
      });
      expect(result).toBe(mockTx);
    });

    test('should use memo override when provided', () => {
      const mockTx = new TopicCreateTransaction();
      mockBuildTopicCreateTx.mockReturnValue(mockTx);

      const result = buildHcs12CreateRegistryTopicTx({
        registry: 'action',
        ttl: 86400,
        memoOverride: 'custom-memo',
      });

      expect(mockBuildTopicCreateTx).toHaveBeenCalledWith({
        memo: 'custom-memo',
        adminKey: undefined,
        submitKey: undefined,
        operatorPublicKey: undefined,
      });
      expect(result).toBe(mockTx);
    });

    test('should pass keys and operator key to buildTopicCreateTx', () => {
      const mockTx = new TopicCreateTransaction();
      mockBuildTopicCreateTx.mockReturnValue(mockTx);
      const mockAdminKey = {};
      const mockSubmitKey = {};
      const mockOperatorKey = {};

      const result = buildHcs12CreateRegistryTopicTx({
        registry: 'action',
        ttl: 86400,
        adminKey: mockAdminKey,
        submitKey: mockSubmitKey,
        operatorPublicKey: mockOperatorKey as any,
      });

      expect(mockBuildTopicCreateTx).toHaveBeenCalledWith({
        memo: 'hcs-12:1:86400:0',
        adminKey: mockAdminKey,
        submitKey: mockSubmitKey,
        operatorPublicKey: mockOperatorKey,
      });
      expect(result).toBe(mockTx);
    });
  });

  describe('buildHcs12SubmitMessageTx', () => {
    test('should submit string payload directly', () => {
      const mockTx = new TopicMessageSubmitTransaction();
      mockBuildMessageTx.mockReturnValue(mockTx);

      const result = buildHcs12SubmitMessageTx({
        topicId: '0.0.12345',
        payload: 'test message',
      });

      expect(mockBuildMessageTx).toHaveBeenCalledWith({
        topicId: '0.0.12345',
        message: 'test message',
        transactionMemo: undefined,
      });
      expect(result).toBe(mockTx);
    });

    test('should stringify object payload', () => {
      const mockTx = new TopicMessageSubmitTransaction();
      mockBuildMessageTx.mockReturnValue(mockTx);
      const payload = { type: 'test', data: 'value' };

      const result = buildHcs12SubmitMessageTx({
        topicId: '0.0.12345',
        payload,
      });

      expect(mockBuildMessageTx).toHaveBeenCalledWith({
        topicId: '0.0.12345',
        message: JSON.stringify(payload),
        transactionMemo: undefined,
      });
      expect(result).toBe(mockTx);
    });

    test('should use transaction memo when provided', () => {
      const mockTx = new TopicMessageSubmitTransaction();
      mockBuildMessageTx.mockReturnValue(mockTx);

      const result = buildHcs12SubmitMessageTx({
        topicId: '0.0.12345',
        payload: 'test message',
        transactionMemo: 'tx memo',
      });

      expect(mockBuildMessageTx).toHaveBeenCalledWith({
        topicId: '0.0.12345',
        message: 'test message',
        transactionMemo: 'tx memo',
      });
      expect(result).toBe(mockTx);
    });
  });

  describe('buildHcs12RegisterAssemblyTx', () => {
    test('should build registration transaction', () => {
      const mockTx = new TopicMessageSubmitTransaction();
      mockBuildMessageTx.mockReturnValue(mockTx);
      const registration: AssemblyRegistration = {
        op: 'register',
        name: 'test-assembly',
        description: 'Test assembly',
      };

      const result = buildHcs12RegisterAssemblyTx({
        assemblyTopicId: '0.0.12345',
        registration,
      });

      expect(mockBuildMessageTx).toHaveBeenCalledWith({
        topicId: '0.0.12345',
        message: JSON.stringify(registration),
      });
      expect(result).toBe(mockTx);
    });
  });

  describe('buildHcs12AddBlockToAssemblyTx', () => {
    test('should build add block transaction', () => {
      const mockTx = new TopicMessageSubmitTransaction();
      mockBuildMessageTx.mockReturnValue(mockTx);
      const operation: AssemblyAddBlock = {
        op: 'add-block',
        blockId: 'block-123',
        position: { x: 10, y: 20 },
      };

      const result = buildHcs12AddBlockToAssemblyTx({
        assemblyTopicId: '0.0.12345',
        operation,
      });

      expect(mockBuildMessageTx).toHaveBeenCalledWith({
        topicId: '0.0.12345',
        message: JSON.stringify(operation),
      });
      expect(result).toBe(mockTx);
    });
  });

  describe('buildHcs12AddActionToAssemblyTx', () => {
    test('should build add action transaction', () => {
      const mockTx = new TopicMessageSubmitTransaction();
      mockBuildMessageTx.mockReturnValue(mockTx);
      const operation: AssemblyAddAction = {
        op: 'add-action',
        actionId: 'action-123',
        blockId: 'block-456',
      };

      const result = buildHcs12AddActionToAssemblyTx({
        assemblyTopicId: '0.0.12345',
        operation,
      });

      expect(mockBuildMessageTx).toHaveBeenCalledWith({
        topicId: '0.0.12345',
        message: JSON.stringify(operation),
      });
      expect(result).toBe(mockTx);
    });
  });

  describe('buildHcs12UpdateAssemblyTx', () => {
    test('should build update assembly transaction', () => {
      const mockTx = new TopicMessageSubmitTransaction();
      mockBuildMessageTx.mockReturnValue(mockTx);
      const operation: AssemblyUpdate = {
        op: 'update',
        name: 'updated-assembly',
        description: 'Updated description',
      };

      const result = buildHcs12UpdateAssemblyTx({
        assemblyTopicId: '0.0.12345',
        operation,
      });

      expect(mockBuildMessageTx).toHaveBeenCalledWith({
        topicId: '0.0.12345',
        message: JSON.stringify(operation),
      });
      expect(result).toBe(mockTx);
    });
  });
});
