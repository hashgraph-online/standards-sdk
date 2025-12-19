jest.mock('@hashgraph/sdk', () => ({
  PrivateKey: { fromStringECDSA: jest.fn() },
  Client: {
    forTestnet: jest.fn(() => ({
      setOperator: jest.fn(),
      operatorPublicKey: {},
    })),
    forMainnet: jest.fn(() => ({
      setOperator: jest.fn(),
      operatorPublicKey: {},
    })),
  },
  AccountId: { fromString: (s: string) => ({ toString: () => s }) },
  TopicCreateTransaction: class {
    private _topicId: any;
    setTopicMemo() {
      return this;
    }
    setAdminKey() {
      return this;
    }
    setSubmitKey() {
      return this;
    }
    setAutoRenewAccountId() {
      return this;
    }
    async execute() {
      return {
        getReceipt: async () => ({ topicId: { toString: () => '0.0.topic' } }),
      };
    }
  },
  TopicMessageSubmitTransaction: class {
    setTopicId() {
      return this;
    }
    setMessage() {
      return this;
    }
    async execute() {
      return { getReceipt: async () => ({ status: 'SUCCESS' }) };
    }
  },
  TopicId: { fromString: (s: string) => ({ toString: () => s }) },
  ScheduleSignTransaction: class {
    private _id: string | undefined;
    setScheduleId(id: string) {
      this._id = id;
      return this;
    }
    async freezeWith() {
      return this;
    }
    async sign() {
      return this;
    }
    async execute() {
      return {
        getReceipt: async () => ({ status: 'SUCCESS', scheduleId: this._id }),
      };
    }
  },
}));

jest.mock('../src/services/mirror-node', () => ({
  HederaMirrorNode: class {
    constructor() {}
    async requestAccount() {
      return { key: { _type: 'ECDSA' } } as any;
    }
    async getPublicKey() {
      return { toString: () => 'pub' } as any;
    }
    async getTopicInfo() {
      return { memo: 'test' } as any;
    }
  },
}));

import { HCS16Client } from '../src/hcs-16/sdk';
import { FloraTopicType } from '../src/hcs-16/types';

describe('HCS-16 Node client', () => {
  const cfg = {
    network: 'testnet' as const,
    operatorId: '0.0.op',
    operatorKey: 'k',
  };

  it('creates Flora topic', async () => {
    const c = new HCS16Client(cfg);
    const topicId = await c.createFloraTopic({
      floraAccountId: '0.0.fl',
      topicType: FloraTopicType.STATE,
    });
    expect(topicId).toBe('0.0.topic');
  });

  it('sends flora_created', async () => {
    const c = new HCS16Client(cfg);
    const r = await c.sendFloraCreated({
      topicId: '0.0.t',
      operatorId: 'op@fl',
      floraAccountId: '0.0.fl',
      topics: { communication: '0.0.c', transaction: '0.0.tx', state: '0.0.s' },
    });
    expect(r).toBeDefined();
  });

  it('sends transaction and state_update', async () => {
    const c = new HCS16Client(cfg);
    const rp = await c.sendTransaction({
      topicId: '0.0.t',
      operatorId: 'op@fl',
      scheduleId: '0.0.sch',
      data: 'desc',
    });
    const rs = await c.sendStateUpdate({
      topicId: '0.0.s',
      operatorId: 'op@fl',
      hash: '0xabc',
    });
    expect(rp).toBeDefined();
    expect(rs).toBeDefined();
  });

  it('sends join request/vote/accepted', async () => {
    const c = new HCS16Client(cfg);
    const req = await c.sendFloraJoinRequest({
      topicId: '0.0.comm',
      operatorId: '0.0.op@0.0.fl',
      accountId: '0.0.cand',
      connectionRequestId: 12,
      connectionTopicId: '0.0.conn',
      connectionSeq: 7,
    });
    const vote = await c.sendFloraJoinVote({
      topicId: '0.0.comm',
      operatorId: '0.0.op@0.0.fl',
      accountId: '0.0.cand',
      approve: true,
      connectionRequestId: 12,
      connectionSeq: 7,
    });
    const accepted = await c.sendFloraJoinAccepted({
      topicId: '0.0.state',
      operatorId: '0.0.op@0.0.fl',
      members: ['0.0.a', '0.0.b'],
      epoch: 2,
    });
    expect(req).toBeDefined();
    expect(vote).toBeDefined();
    expect(accepted).toBeDefined();
  });

  it('signs schedule via helper', async () => {
    const c = new HCS16Client(cfg);
    const signer: any = { dummy: true };
    const r = await c.signSchedule({
      scheduleId: '0.0.sch',
      signerKey: signer,
    });
    expect(r).toBeDefined();
  });
});
