import { HCS16BaseClient } from '../src/hcs-16/base-client';
import { FloraOperation } from '../src/hcs-16/types';

describe('HCS-16 Base Client', () => {
  it('parseTopicMemo parses valid memo', () => {
    const base = new HCS16BaseClient({ network: 'testnet' });
    const parsed = base.parseTopicMemo('hcs-16:0.0.12345:2');
    expect(parsed).toEqual({ protocol: 'hcs-16', floraAccountId: '0.0.12345', topicType: 2 });
  });

  it('parseTopicMemo returns null for invalid memo', () => {
    const base = new HCS16BaseClient({ network: 'testnet' });
    expect(base.parseTopicMemo('bad')).toBeNull();
  });

  it('getRecentMessages filters and maps envelopes', async () => {
    const base = new HCS16BaseClient({ network: 'testnet' });
    (base as any).mirrorNode = {
      getTopicMessages: jest.fn().mockResolvedValue([
        { p: 'hcs-16', op: 'flora_created', operator_id: 'op@fl', consensus_timestamp: '1', sequence_number: 7, payer: '0.0.p' },
        { p: 'hcs-99', op: 'ignore', operator_id: 'x' },
      ]),
    };
    const msgs = await base.getRecentMessages('0.0.topic', { limit: 1, order: 'desc' });
    expect(msgs.length).toBe(1);
    expect(msgs[0].message).toEqual({ p: 'hcs-16', op: FloraOperation.FLORA_CREATED, operator_id: 'op@fl' });
    expect(msgs[0].sequence_number).toBe(7);
    expect(msgs[0].payer).toBe('0.0.p');
  });

  it('getLatestMessage returns latest with consensus and seq', async () => {
    const base = new HCS16BaseClient({ network: 'testnet' });
    (base as any).mirrorNode = {
      getTopicMessages: jest.fn().mockResolvedValue([
        { p: 'hcs-16', op: 'flora_created', operator_id: 'op@fl', consensus_timestamp: '2', sequence_number: 9 },
      ]),
    };
    const latest = await base.getLatestMessage('0.0.topic');
    expect(latest?.op).toBe(FloraOperation.FLORA_CREATED);
    expect(latest?.consensus_timestamp).toBe('2');
    expect(latest?.sequence_number).toBe(9);
  });
});

