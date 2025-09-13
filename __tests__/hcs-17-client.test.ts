jest.mock('@hashgraph/sdk', () => {
  class TopicCreateTransactionMock {
    _memo?: string;
    setTopicMemo(m: string) { this._memo = m; return this; }
    setAdminKey() { return this; }
    setSubmitKey() { return this; }
    async execute() { return { getReceipt: async () => ({ topicId: { toString: () => '0.0.12345' } }) }; }
  }
  class TopicMessageSubmitTransactionMock {
    setTopicId() { return this; }
    setMessage() { return this; }
    async execute() { return { getReceipt: async () => ({ status: 'SUCCESS' }) }; }
  }
  return {
    PrivateKey: {
      fromStringED25519: jest.fn(() => ({ publicKey: { toString: () => 'pk' } })),
      fromStringECDSA: jest.fn(() => ({ publicKey: { toString: () => 'pk' } })),
    },
    AccountId: { fromString: (s: string) => ({ toString: () => s }) },
    Client: {
      forTestnet: jest.fn(() => ({ setOperator: jest.fn(), operatorPublicKey: {} })),
      forMainnet: jest.fn(() => ({ setOperator: jest.fn(), operatorPublicKey: {} })),
    },
    TopicCreateTransaction: TopicCreateTransactionMock,
    TopicMessageSubmitTransaction: TopicMessageSubmitTransactionMock,
    TopicId: { fromString: (s: string) => ({ toString: () => s }) },
    PublicKey: { fromString: (s: string) => ({ toString: () => s }) },
    KeyList: class {},
  };
});

jest.mock('../src/services/mirror-node', () => ({
  HederaMirrorNode: jest.fn().mockImplementation(() => ({
    getTopicMessages: jest.fn(async (_tid: string, _opts?: any) => [
      {
        consensus_timestamp: '1',
        sequence_number: 1,
        payer_account_id: '0.0.1000',
        message: Buffer.from(
          JSON.stringify({ p: 'hcs-17', op: 'state_hash', state_hash: 'x', topics: [], account_id: '0.0.0' }),
        ).toString('base64'),
        running_hash: 'rhash',
        running_hash_version: 3,
        topic_id: '0.0.123',
      },
    ]),
  })),
}));

import { HCS17Client } from '../src/hcs-17/sdk';
import type { StateHashMessage } from '../src/hcs-17/types';

describe('HCS-17 Node SDK client', () => {
  const baseConfig = {
    network: 'testnet' as const,
    operatorId: '0.0.5527744',
    operatorKey: '302e020100300506032b657004220420a689b97',
    logLevel: 'debug' as const,
  };

  it('creates a state topic with memo', async () => {
    const client = new HCS17Client(baseConfig);
    const topicId = await client.createStateTopic();
    expect(typeof topicId).toBe('string');
    expect(topicId).toBe('0.0.12345');
  });

  it('submits a valid state hash message', async () => {
    const client = new HCS17Client(baseConfig);
    const message: StateHashMessage = {
      p: 'hcs-17',
      op: 'state_hash',
      state_hash: '0xabc',
      topics: ['0.0.1'],
      account_id: '0.0.2',
      timestamp: new Date().toISOString(),
    };
    const receipt = await client.submitMessage('0.0.123', message);
    expect(receipt).toBeDefined();
  });

  it('computes and publishes a state hash', async () => {
    const client = new HCS17Client(baseConfig);
    const { stateHash, receipt } = await client.computeAndPublish({
      accountId: '0.0.2',
      accountPublicKey: 'pk',
      topics: ['0.0.100', '0.0.200'],
      publishTopicId: '0.0.999',
      memo: 'sync',
    });
    expect(typeof stateHash).toBe('string');
    expect(stateHash.length).toBe(96);
    expect(receipt).toBeDefined();
  });
});
