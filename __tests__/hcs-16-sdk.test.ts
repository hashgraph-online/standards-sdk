jest.mock('@hashgraph/sdk', () => ({
  PrivateKey: { fromStringECDSA: jest.fn() },
  Client: {
    forTestnet: jest.fn(() => ({ setOperator: jest.fn(), operatorPublicKey: {} })),
    forMainnet: jest.fn(() => ({ setOperator: jest.fn(), operatorPublicKey: {} })),
  },
  AccountId: { fromString: (s: string) => ({ toString: () => s }) },
  TopicCreateTransaction: class {
    private _topicId: any;
    setTopicMemo() { return this; }
    setAdminKey() { return this; }
    setSubmitKey() { return this; }
    setAutoRenewAccountId() { return this; }
    async execute() { return { getReceipt: async () => ({ topicId: { toString: () => '0.0.topic' } }) }; }
  },
  TopicMessageSubmitTransaction: class {
    setTopicId() { return this; }
    setMessage() { return this; }
    async execute() { return { getReceipt: async () => ({ status: 'SUCCESS' }) }; }
  },
}));

import { HCS16Client } from '../src/hcs-16/sdk';
import { FloraTopicType } from '../src/hcs-16/types';

describe('HCS-16 Node client', () => {
  const cfg = { network: 'testnet' as const, operatorId: '0.0.op', operatorKey: 'k' };

  it('creates Flora topic', async () => {
    const c = new HCS16Client(cfg);
    const topicId = await c.createFloraTopic({ floraAccountId: '0.0.fl', topicType: FloraTopicType.STATE });
    expect(topicId).toBe('0.0.topic');
  });

  it('sends flora_created', async () => {
    const c = new HCS16Client(cfg);
    const r = await c.sendFloraCreated({ topicId: '0.0.t', operatorId: 'op@fl', floraAccountId: '0.0.fl', topics: { communication: '0.0.c', transaction: '0.0.tx', state: '0.0.s' } });
    expect(r).toBeDefined();
  });

  it('sends tx_proposal and state_update', async () => {
    const c = new HCS16Client(cfg);
    const rp = await c.sendTxProposal({ topicId: '0.0.t', operatorId: 'op@fl', scheduledTxId: '0.0.sch', description: 'desc' });
    const rs = await c.sendStateUpdate({ topicId: '0.0.s', operatorId: 'op@fl', hash: '0xabc' });
    expect(rp).toBeDefined();
    expect(rs).toBeDefined();
  });
});

