/**
 * HCS-18 Client Convenience Tests (folded discovery)
 */

import {
  PrivateKey,
  TopicMessageSubmitTransaction,
  type TransactionResponse,
} from '@hashgraph/sdk';
import { HCS18Client } from '../src/hcs-18';
import { DiscoveryOperation } from '../src/hcs-18';

describe('HCS-18 Client', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest
      .spyOn(TopicMessageSubmitTransaction.prototype, 'execute')
      .mockResolvedValue({
        getReceipt: async () => ({
          topicSequenceNumber: { toNumber: () => 43210 },
        }),
      } as unknown as TransactionResponse);
  });

  it('propose convenience submits correct message', async () => {
    const setMessageSpy = jest.spyOn(
      TopicMessageSubmitTransaction.prototype,
      'setMessage',
    );
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: PrivateKey.generateECDSA(),
    });
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
    const payload = JSON.parse(setMessageSpy.mock.calls[0][0] as string);
    expect(payload.p).toBe('hcs-18');
    expect(payload.op).toBe(DiscoveryOperation.PROPOSE);
    expect(payload.data.proposer).toBe('0.0.1001');
    expect(payload.data.members).toHaveLength(2);
  });

  it('respond convenience submits correct message', async () => {
    const setMessageSpy = jest.spyOn(
      TopicMessageSubmitTransaction.prototype,
      'setMessage',
    );
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: PrivateKey.generateECDSA(),
    });
    await c.respond({
      discoveryTopicId: '0.0.999999',
      data: { responder: '0.0.1001', proposal_seq: 12345, decision: 'accept' },
    });
    const payload = JSON.parse(setMessageSpy.mock.calls[0][0] as string);
    expect(payload.p).toBe('hcs-18');
    expect(payload.op).toBe(DiscoveryOperation.RESPOND);
    expect(payload.data.proposal_seq).toBe(12345);
    expect(payload.data.decision).toBe('accept');
  });

  it('complete convenience submits correct message', async () => {
    const setMessageSpy = jest.spyOn(
      TopicMessageSubmitTransaction.prototype,
      'setMessage',
    );
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: PrivateKey.generateECDSA(),
    });
    await c.complete({
      discoveryTopicId: '0.0.999999',
      data: {
        proposer: '0.0.1001',
        proposal_seq: 12345,
        flora_account: '0.0.789012',
        topics: {
          communication: '0.0.1',
          transaction: '0.0.2',
          state: '0.0.3',
        },
      },
    });
    const payload = JSON.parse(setMessageSpy.mock.calls[0][0] as string);
    expect(payload.p).toBe('hcs-18');
    expect(payload.op).toBe(DiscoveryOperation.COMPLETE);
    expect(payload.data.flora_account).toBe('0.0.789012');
    expect(payload.data.topics.communication).toBe('0.0.1');
  });

  it('withdraw convenience submits correct message', async () => {
    const setMessageSpy = jest.spyOn(
      TopicMessageSubmitTransaction.prototype,
      'setMessage',
    );
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: PrivateKey.generateECDSA(),
    });
    await c.withdraw({
      discoveryTopicId: '0.0.999999',
      data: { account: '0.0.1001', announce_seq: 10000, reason: 'maintenance' },
    });
    const payload = JSON.parse(setMessageSpy.mock.calls[0][0] as string);
    expect(payload.p).toBe('hcs-18');
    expect(payload.op).toBe(DiscoveryOperation.WITHDRAW);
    expect(payload.data.announce_seq).toBe(10000);
    expect(payload.data.reason).toBe('maintenance');
  });
});
