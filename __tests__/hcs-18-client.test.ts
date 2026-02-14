import {
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  type TransactionResponse,
} from '@hashgraph/sdk';
import { HCS18Client } from '../src/hcs-18';

describe('HCS18Client', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(TopicCreateTransaction.prototype, 'execute').mockResolvedValue({
      getReceipt: async () => ({
        topicId: { toString: () => '0.0.999999' },
      }),
    } as unknown as TransactionResponse);
    jest
      .spyOn(TopicMessageSubmitTransaction.prototype, 'execute')
      .mockResolvedValue({
        getReceipt: async () => ({
          topicSequenceNumber: { toNumber: () => 12345 },
        }),
      } as unknown as TransactionResponse);
  });

  it('creates discovery topic with default memo', async () => {
    const setTopicMemoSpy = jest.spyOn(
      TopicCreateTransaction.prototype,
      'setTopicMemo',
    );
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: PrivateKey.generateECDSA(),
    });
    const res = await c.createDiscoveryTopic();
    expect(res.topicId).toBe('0.0.999999');
    expect(setTopicMemoSpy).toHaveBeenCalledWith('hcs-18:0');
  });

  it('creates discovery topic with ttl in memo', async () => {
    const setTopicMemoSpy = jest.spyOn(
      TopicCreateTransaction.prototype,
      'setTopicMemo',
    );
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: PrivateKey.generateECDSA(),
    });
    await c.createDiscoveryTopic({ ttlSeconds: 300 });
    expect(setTopicMemoSpy).toHaveBeenCalledWith('hcs-18:0:300');
  });

  it('announce convenience submits correct message', async () => {
    const setMessageSpy = jest.spyOn(
      TopicMessageSubmitTransaction.prototype,
      'setMessage',
    );
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: PrivateKey.generateECDSA(),
    });
    await c.announce({
      discoveryTopicId: '0.0.999999',
      data: {
        account: '0.0.1001',
        petal: { name: 'P', priority: 500 },
        capabilities: { protocols: ['hcs-18'] },
        valid_for: 1000,
      },
    });
    const message = JSON.parse(setMessageSpy.mock.calls[0][0] as string);
    expect(message.p).toBe('hcs-18');
    expect(message.op).toBe('announce');
    expect(message.data.petal.name).toBe('P');
  });

  it('announce supports memo option', async () => {
    const setMemoSpy = jest.spyOn(
      TopicMessageSubmitTransaction.prototype,
      'setTransactionMemo',
    );
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: PrivateKey.generateECDSA(),
    });
    await c.announce({
      discoveryTopicId: '0.0.999999',
      memo: 'test-memo',
      data: {
        account: '0.0.1001',
        petal: { name: 'P', priority: 500 },
        capabilities: { protocols: ['hcs-18'] },
      },
    });
    expect(setMemoSpy).toHaveBeenCalledWith('test-memo');
  });

  it('createDiscoveryTopic handles missing operator public key', async () => {
    const setTopicMemoSpy = jest.spyOn(
      TopicCreateTransaction.prototype,
      'setTopicMemo',
    );
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: PrivateKey.generateECDSA(),
    });
    const opCtx = (c as any).operatorCtx;
    Object.defineProperty(opCtx, 'operatorKey', {
      get: () => ({
        get publicKey() {
          throw new Error('no key');
        },
      }),
    });
    await c.createDiscoveryTopic();
    expect(setTopicMemoSpy).toHaveBeenCalled();
  });

  it('createDiscoveryTopic throws when no topicId in receipt', async () => {
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: PrivateKey.generateECDSA(),
    });
    jest
      .spyOn(TopicCreateTransaction.prototype, 'execute')
      .mockResolvedValueOnce({
        getReceipt: async () => ({ topicId: undefined }),
      } as unknown as TransactionResponse);
    await expect(c.createDiscoveryTopic()).rejects.toThrow(
      'Failed to create discovery topic',
    );
  });
});
