jest.mock('@hashgraph/sdk', () => {
  class TopicCreateTransactionMock {
    setTopicMemo() {
      return this;
    }
    freezeWithSigner = jest.fn(async (_signer: any) => this);
    executeWithSigner = jest.fn(async (_signer: any) => ({
      getReceiptWithSigner: async () => ({
        topicId: { toString: () => '0.0.222' },
      }),
      transactionId: { toString: () => 'tx-create' },
    }));
  }
  class TopicMessageSubmitTransactionMock {
    setTopicId() {
      return this;
    }
    setMessage() {
      return this;
    }
    freezeWithSigner = jest.fn(async (_signer: any) => this);
    executeWithSigner = jest.fn(async (_signer: any) => ({
      getReceiptWithSigner: async () => ({}),
      transactionId: { toString: () => 'tx-submit' },
    }));
  }
  return {
    TopicCreateTransaction: TopicCreateTransactionMock,
    TopicMessageSubmitTransaction: TopicMessageSubmitTransactionMock,
    TopicId: { fromString: (s: string) => ({ toString: () => s }) },
  };
});

jest.mock('../src/services/mirror-node', () => ({
  HederaMirrorNode: jest.fn().mockImplementation(() => ({
    getTopicMessages: jest.fn(async (_tid: string) => [
      {
        p: 'hcs-17',
        op: 'state_hash',
        running_hash: 'rhash',
        sequence_number: 1,
      },
    ]),
  })),
}));

import { HCS17BrowserClient } from '../src/hcs-17/browser';

describe('HCS-17 Browser client', () => {
  const signer: any = { getAccountId: () => ({ toString: () => '0.0.1' }) };

  it('creates a state topic via wallet', async () => {
    const client = new HCS17BrowserClient({ network: 'testnet', signer });
    const topicId = await client.createStateTopic();
    expect(topicId).toBe('0.0.222');
  });

  it('submits a state hash message via wallet', async () => {
    const client = new HCS17BrowserClient({ network: 'testnet', signer });
    const res = await client.submitMessage('0.0.222', {
      p: 'hcs-17',
      op: 'state_hash',
      state_hash: 'x',
      topics: [],
      account_id: '0.0.1',
      timestamp: new Date().toISOString(),
    });
    expect(typeof res).toBe('object');
  });

  it('computes and publishes a state hash via wallet', async () => {
    const client = new HCS17BrowserClient({ network: 'testnet', signer });
    const res = await client.computeAndPublish({
      accountId: '0.0.1',
      accountPublicKey: 'pk',
      topics: ['0.0.t1', '0.0.t2'],
      publishTopicId: '0.0.pub',
    });
    expect(typeof res.stateHash).toBe('string');
    expect(res.stateHash.length).toBe(96);
  });
});
