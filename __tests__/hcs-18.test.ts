/**
 * HCS-18 Client Convenience Tests (folded discovery)
 */

import { Client, TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { HCS18Client } from '../src/hcs-18';
import { DiscoveryOperation } from '../src/hcs-18';

jest.mock('@hashgraph/sdk');

describe('HCS-18 Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (Client.forName as unknown as jest.Mock) = jest
      .fn()
      .mockReturnValue(new Client());

    (TopicMessageSubmitTransaction as unknown as jest.Mock).mockImplementation(
      () => ({
        setTopicId: jest.fn().mockReturnThis(),
        setMessage: jest.fn().mockReturnThis(),
        setTransactionMemo: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          getReceipt: jest.fn().mockResolvedValue({
            topicSequenceNumber: { toNumber: () => 43210 },
          }),
        }),
      }),
    );
  });

  it('propose convenience submits correct message', async () => {
    const c = new HCS18Client({ network: 'testnet', operatorId: '0.0.1001', operatorKey: '302e...' });
    await c.propose({
      discoveryTopicId: '0.0.999999',
      data: {
        proposer: '0.0.1001',
        members: [
          { account: '0.0.2002', priority: 700, announce_seq: 111 },
          { account: '0.0.3003', priority: 500, announce_seq: 222 },
        ],
        config: { name: 'X', threshold: 2 },
      },
    });
    const inst = (TopicMessageSubmitTransaction as jest.Mock).mock.results[0].value;
    const payload = JSON.parse(inst.setMessage.mock.calls[0][0]);
    expect(payload.p).toBe('hcs-18');
    expect(payload.op).toBe(DiscoveryOperation.PROPOSE);
    expect(payload.data.proposer).toBe('0.0.1001');
    expect(payload.data.members).toHaveLength(2);
  });

  it('respond convenience submits correct message', async () => {
    const c = new HCS18Client({ network: 'testnet', operatorId: '0.0.1001', operatorKey: '302e...' });
    await c.respond({
      discoveryTopicId: '0.0.999999',
      data: { responder: '0.0.1001', proposal_seq: 12345, decision: 'accept' },
    });
    const inst = (TopicMessageSubmitTransaction as jest.Mock).mock.results[0].value;
    const payload = JSON.parse(inst.setMessage.mock.calls[0][0]);
    expect(payload.p).toBe('hcs-18');
    expect(payload.op).toBe(DiscoveryOperation.RESPOND);
    expect(payload.data.proposal_seq).toBe(12345);
    expect(payload.data.decision).toBe('accept');
  });

  it('complete convenience submits correct message', async () => {
    const c = new HCS18Client({ network: 'testnet', operatorId: '0.0.1001', operatorKey: '302e...' });
    await c.complete({
      discoveryTopicId: '0.0.999999',
      data: {
        proposer: '0.0.1001',
        proposal_seq: 12345,
        flora_account: '0.0.789012',
        topics: { communication: '0.0.1', transaction: '0.0.2', state: '0.0.3' },
      },
    });
    const inst = (TopicMessageSubmitTransaction as jest.Mock).mock.results[0].value;
    const payload = JSON.parse(inst.setMessage.mock.calls[0][0]);
    expect(payload.p).toBe('hcs-18');
    expect(payload.op).toBe(DiscoveryOperation.COMPLETE);
    expect(payload.data.flora_account).toBe('0.0.789012');
    expect(payload.data.topics.communication).toBe('0.0.1');
  });

  it('withdraw convenience submits correct message', async () => {
    const c = new HCS18Client({ network: 'testnet', operatorId: '0.0.1001', operatorKey: '302e...' });
    await c.withdraw({
      discoveryTopicId: '0.0.999999',
      data: { account: '0.0.1001', announce_seq: 10000, reason: 'maintenance' },
    });
    const inst = (TopicMessageSubmitTransaction as jest.Mock).mock.results[0].value;
    const payload = JSON.parse(inst.setMessage.mock.calls[0][0]);
    expect(payload.p).toBe('hcs-18');
    expect(payload.op).toBe(DiscoveryOperation.WITHDRAW);
    expect(payload.data.announce_seq).toBe(10000);
    expect(payload.data.reason).toBe('maintenance');
  });
});
