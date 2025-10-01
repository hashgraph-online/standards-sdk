import { buildHcs18DiscoveryMemo, buildHcs18SubmitDiscoveryMessageTx } from '../src/hcs-18/tx';
import { DiscoveryOperation } from '../src/hcs-18/types';
jest.mock('@hashgraph/sdk');

describe('HCS-18 tx builders', () => {
  it('builds discovery memo correctly', () => {
    expect(buildHcs18DiscoveryMemo()).toBe('hcs-18:0');
    expect(buildHcs18DiscoveryMemo(300)).toBe('hcs-18:0:300');
    expect(buildHcs18DiscoveryMemo(0, 'custom')).toBe('custom');
    expect(buildHcs18DiscoveryMemo(undefined, ' custom ')).toBe(' custom ');
  });

  it('builds submit message tx with default memo', () => {
    const { TopicMessageSubmitTransaction } = require('@hashgraph/sdk');
    (TopicMessageSubmitTransaction as unknown as jest.Mock).mockImplementation(
      () => ({
        setTopicId: jest.fn().mockReturnThis(),
        setMessage: jest.fn().mockReturnThis(),
        setTransactionMemo: jest.fn().mockReturnThis(),
      }),
    );
    buildHcs18SubmitDiscoveryMessageTx({
      topicId: '0.0.1',
      message: { p: 'hcs-18', op: DiscoveryOperation.ANNOUNCE, data: {} },
    } as any);
    const inst = (TopicMessageSubmitTransaction as unknown as jest.Mock).mock
      .results[0].value;
    expect(inst.setTransactionMemo).toHaveBeenCalledWith('hcs-18:op:0');
  });
});
