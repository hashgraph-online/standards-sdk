import {
  buildHcs18DiscoveryMemo,
  buildHcs18SubmitDiscoveryMessageTx,
} from '../src/hcs-18/tx';
import { DiscoveryOperation } from '../src/hcs-18/types';

describe('HCS-18 tx builders', () => {
  it('builds discovery memo correctly', () => {
    expect(buildHcs18DiscoveryMemo()).toBe('hcs-18:0');
    expect(buildHcs18DiscoveryMemo(300)).toBe('hcs-18:0:300');
    expect(buildHcs18DiscoveryMemo(0, 'custom')).toBe('custom');
    expect(buildHcs18DiscoveryMemo(undefined, ' custom ')).toBe(' custom ');
  });

  it('builds submit message tx with default memo', () => {
    const tx = buildHcs18SubmitDiscoveryMessageTx({
      topicId: '0.0.1',
      message: { p: 'hcs-18', op: DiscoveryOperation.ANNOUNCE, data: {} },
    } as any);
    expect(tx.transactionMemo).toBe('hcs-18:op:0');
  });
});
