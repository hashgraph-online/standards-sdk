import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  Client,
} from '@hashgraph/sdk';
import { HCS18Client } from '../src/hcs-18';

jest.mock('@hashgraph/sdk', () => {
  class AccountId {
    constructor(value: string) {
      this.value = String(value);
    }
    value: string;
    static fromString(value: string) {
      return new AccountId(value);
    }
    toString() {
      return this.value;
    }
  }

  class PublicKey {
    constructor(value = 'mock-public-key') {
      this.value = String(value);
    }
    value: string;
    toString() {
      return this.value;
    }
  }

  class PrivateKey {
    constructor(value = 'mock-private-key') {
      this.value = String(value);
      this.publicKey = new PublicKey('mock-public-key');
    }
    value: string;
    publicKey: PublicKey;
    static fromStringED25519(value: string) {
      return new PrivateKey(value);
    }
    static fromStringECDSA(value: string) {
      return new PrivateKey(value);
    }
  }

  class Client {
    static forName = jest.fn(() => new Client());
    static forMainnet = jest.fn(() => new Client());
    static forTestnet = jest.fn(() => new Client());
    setOperator = jest.fn().mockReturnThis();
  }

  return {
    AccountId,
    Client,
    PrivateKey,
    PublicKey,
    TopicCreateTransaction: jest.fn(),
    TopicMessageSubmitTransaction: jest.fn(),
  };
});

describe('HCS18Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (Client.forName as unknown as jest.Mock) = jest
      .fn()
      .mockReturnValue(new Client());

    (TopicCreateTransaction as unknown as jest.Mock).mockImplementation(() => ({
      setTopicMemo: jest.fn().mockReturnThis(),
      setAdminKey: jest.fn().mockReturnThis(),
      setSubmitKey: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({
        getReceipt: jest.fn().mockResolvedValue({
          topicId: { toString: () => '0.0.999999' },
        }),
      }),
    }));

    (TopicMessageSubmitTransaction as unknown as jest.Mock).mockImplementation(
      () => ({
        setTopicId: jest.fn().mockReturnThis(),
        setMessage: jest.fn().mockReturnThis(),
        setTransactionMemo: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          getReceipt: jest.fn().mockResolvedValue({
            topicSequenceNumber: { toNumber: () => 12345 },
          }),
        }),
      }),
    );
  });

  it('creates discovery topic with default memo', async () => {
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: '302e...',
    });
    const res = await c.createDiscoveryTopic();
    expect(res.topicId).toBe('0.0.999999');
    const inst = (TopicCreateTransaction as unknown as jest.Mock).mock
      .results[0].value;
    expect(inst.setTopicMemo).toHaveBeenCalledWith('hcs-18:0');
  });

  it('creates discovery topic with ttl in memo', async () => {
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: '302e...',
    });
    await c.createDiscoveryTopic({ ttlSeconds: 300 });
    const inst = (TopicCreateTransaction as unknown as jest.Mock).mock
      .results[0].value;
    expect(inst.setTopicMemo).toHaveBeenCalledWith('hcs-18:0:300');
  });

  it('announce convenience submits correct message', async () => {
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: '302e...',
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
    const mockInstance = (TopicMessageSubmitTransaction as jest.Mock).mock
      .results[0].value;
    const setMessageCall = mockInstance.setMessage.mock.calls[0];
    const message = JSON.parse(setMessageCall[0]);
    expect(message.p).toBe('hcs-18');
    expect(message.op).toBe('announce');
    expect(message.data.petal.name).toBe('P');
  });

  it('announce supports memo option', async () => {
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: '302e...',
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
    const mockInstance = (
      TopicMessageSubmitTransaction as jest.Mock
    ).mock.results.pop().value;
    expect(mockInstance.setTransactionMemo).toHaveBeenCalledWith('test-memo');
  });

  it('createDiscoveryTopic handles missing operator public key', async () => {
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: '302e...',
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
    const inst = (
      TopicCreateTransaction as unknown as jest.Mock
    ).mock.results.pop().value;
    expect(inst.setTopicMemo).toHaveBeenCalled();
  });

  it('createDiscoveryTopic throws when no topicId in receipt', async () => {
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: '302e...',
    });
    (TopicCreateTransaction as unknown as jest.Mock).mockImplementationOnce(
      () => ({
        setTopicMemo: jest.fn().mockReturnThis(),
        setAdminKey: jest.fn().mockReturnThis(),
        setSubmitKey: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          getReceipt: jest.fn().mockResolvedValue({ topicId: undefined }),
        }),
      }),
    );
    await expect(c.createDiscoveryTopic()).rejects.toThrow(
      'Failed to create discovery topic',
    );
  });
});
