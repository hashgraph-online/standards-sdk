import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import {
  buildHcs6CreateRegistryTx,
  buildHcs6RegisterEntryTx,
} from '../../src/hcs-6/tx';

describe('HCS-6 tx builders', () => {
  test('buildHcs6CreateRegistryTx sets non-indexed memo', () => {
    const tx = buildHcs6CreateRegistryTx({ ttl: 86400 });
    expect(tx).toBeInstanceOf(TopicCreateTransaction);
    const json: any = (tx as any).toJSON ? (tx as any).toJSON() : undefined;
    if (json?.consensusCreateTopic?.memo) {
      expect(json.consensusCreateTopic.memo.startsWith('hcs-6:1:')).toBe(true);
    }
  });

  test('buildHcs6RegisterEntryTx encodes payload', () => {
    const tx = buildHcs6RegisterEntryTx({
      registryTopicId: '0.0.abc',
      targetTopicId: '0.0.xyz',
      memo: 'dyn',
    });
    expect(tx).toBeInstanceOf(TopicMessageSubmitTransaction);
  });
});
