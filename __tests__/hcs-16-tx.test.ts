import {
  buildHcs16FloraCreatedTx,
  buildHcs16TransactionTx,
  buildHcs16StateUpdateTx,
  buildHcs16FloraJoinRequestTx,
  buildHcs16FloraJoinVoteTx,
  buildHcs16FloraJoinAcceptedTx,
} from '../src/hcs-16/tx';

jest.mock('@hashgraph/sdk', () => ({
  TopicMessageSubmitTransaction: class {
    private _topicId: any;
    private _message: any;
    setTopicId(id: any) {
      this._topicId = id;
      return this;
    }
    setMessage(m: any) {
      this._message = m;
      return this;
    }
  },
  TopicCreateTransaction: class {
    private _topicMemo: any;
    setTopicMemo(m: any) {
      this._topicMemo = m;
      return this;
    }
    setAdminKey() {
      return this;
    }
    setSubmitKey() {
      return this;
    }
    setFeeScheduleKey() {
      return this;
    }
    setCustomFees() {
      return this;
    }
    setAutoRenewAccountId() {
      return this;
    }
  },
  AccountCreateTransaction: class {},
  TopicId: { fromString: (s: string) => ({ toString: () => s }) },
}));

describe('HCS-16 tx builders', () => {
  it('builds flora_created payload', () => {
    const tx: any = buildHcs16FloraCreatedTx({
      topicId: '0.0.1',
      operatorId: '0.0.op@0.0.flora',
      floraAccountId: '0.0.flora',
      topics: { communication: '0.0.c', transaction: '0.0.t', state: '0.0.s' },
    });
    const s = JSON.stringify({
      p: 'hcs-16',
      op: 'flora_created',
      operator_id: '0.0.op@0.0.flora',
      flora_account_id: '0.0.flora',
      topics: { communication: '0.0.c', transaction: '0.0.t', state: '0.0.s' },
    });
    expect(tx._message).toBe(s);
    expect(tx._topicId.toString()).toBe('0.0.1');
  });

  it('builds transaction payload', () => {
    const tx: any = buildHcs16TransactionTx({
      topicId: '0.0.tx',
      operatorId: '0.0.op@0.0.flora',
      scheduleId: '0.0.sch',
      data: 'desc',
    });
    const parsed = JSON.parse(tx._message);
    expect(parsed).toMatchObject({
      p: 'hcs-16',
      op: 'transaction',
      operator_id: '0.0.op@0.0.flora',
      schedule_id: '0.0.sch',
      data: 'desc',
      m: 'desc',
    });
  });

  it('builds state_update payload', () => {
    const tx: any = buildHcs16StateUpdateTx({
      topicId: '0.0.state',
      operatorId: '0.0.op@0.0.flora',
      hash: '0xabc',
      epoch: 42,
    });
    const parsed = JSON.parse(tx._message);
    expect(parsed).toMatchObject({
      p: 'hcs-16',
      op: 'state_update',
      operator_id: '0.0.op@0.0.flora',
      epoch: 42,
    });
    expect(parsed.hash).toBe('0xabc');
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('builds join_request payload', () => {
    const tx: any = buildHcs16FloraJoinRequestTx({
      topicId: '0.0.comm',
      operatorId: '0.0.op@0.0.flora',
      candidateAccountId: '0.0.cand',
    });
    const payload = JSON.parse(tx._message);
    expect(payload).toMatchObject({
      p: 'hcs-16',
      op: 'flora_join_request',
      candidate_account_id: '0.0.cand',
    });
  });

  it('builds join_vote payload', () => {
    const tx: any = buildHcs16FloraJoinVoteTx({
      topicId: '0.0.comm',
      operatorId: '0.0.op@0.0.flora',
      candidateAccountId: '0.0.cand',
      approve: true,
    });
    const payload = JSON.parse(tx._message);
    expect(payload).toMatchObject({
      p: 'hcs-16',
      op: 'flora_join_vote',
      candidate_account_id: '0.0.cand',
      approve: true,
    });
  });

  it('builds join_accepted payload', () => {
    const tx: any = buildHcs16FloraJoinAcceptedTx({
      topicId: '0.0.state',
      operatorId: '0.0.op@0.0.flora',
      members: ['0.0.a', '0.0.b'],
      epoch: 7,
    });
    const payload = JSON.parse(tx._message);
    expect(payload).toMatchObject({
      p: 'hcs-16',
      op: 'flora_join_accepted',
      members: ['0.0.a', '0.0.b'],
      epoch: 7,
    });
  });

  it('builds Flora topic memo correctly', () => {
    const { buildHcs16CreateFloraTopicTx } = require('../src/hcs-16/tx');
    const tx: any = buildHcs16CreateFloraTopicTx({
      floraAccountId: '0.0.fl',
      topicType: 2,
    });
    expect(tx._topicMemo).toBe('hcs-16:0.0.fl:2');
  });
});
