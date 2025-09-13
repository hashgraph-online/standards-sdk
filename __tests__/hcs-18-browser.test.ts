import { HCS18BrowserClient } from '../src/hcs-18';

describe('HCS18BrowserClient', () => {
  const hwc = {
    submitMessageToTopic: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('announce submits correct payload', async () => {
    const b = new HCS18BrowserClient({ network: 'testnet', hwc });
    await b.announce({
      discoveryTopicId: '0.0.1',
      data: { account: '0.0.1001', petal: { name: 'P', priority: 500 }, capabilities: { protocols: ['hcs-18'] } },
    });
    const payload = JSON.parse(hwc.submitMessageToTopic.mock.calls[0][1]);
    expect(payload.p).toBe('hcs-18');
    expect(payload.op).toBe('announce');
  });

  it('propose/respond/complete/withdraw submit correct ops', async () => {
    const b = new HCS18BrowserClient({ network: 'testnet', hwc });
    await b.propose({ discoveryTopicId: '0.0.1', data: { proposer: '0.0.1001', members: [], config: { name: 'X', threshold: 1 } } });
    await b.respond({ discoveryTopicId: '0.0.1', data: { responder: '0.0.1001', proposal_seq: 1, decision: 'accept' } });
    await b.complete({ discoveryTopicId: '0.0.1', data: { proposer: '0.0.1001', proposal_seq: 1, flora_account: '0.0.9', topics: { communication: '0.0.2', transaction: '0.0.3', state: '0.0.4' } } });
    await b.withdraw({ discoveryTopicId: '0.0.1', data: { account: '0.0.1001', announce_seq: 1 } });
    const ops = hwc.submitMessageToTopic.mock.calls.map((c: any) => JSON.parse(c[1]).op);
    expect(ops).toEqual(['propose', 'respond', 'complete', 'withdraw']);
  });
});
