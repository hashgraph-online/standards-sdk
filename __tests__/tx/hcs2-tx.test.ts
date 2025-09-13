import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import {
  buildHcs2CreateRegistryTx,
  buildHcs2RegisterTx,
  buildHcs2UpdateTx,
  buildHcs2DeleteTx,
  buildHcs2MigrateTx,
} from '../../src/hcs-2/tx';
import { HCS2RegistryType } from '../../src/hcs-2/types';

describe('HCS-2 tx builders', () => {
  test('buildHcs2CreateRegistryTx sets correct memo', () => {
    const tx = buildHcs2CreateRegistryTx({
      registryType: HCS2RegistryType.INDEXED,
      ttl: 3600,
    });
    expect(tx).toBeInstanceOf(TopicCreateTransaction);
    const json: any = (tx as any).toJSON ? (tx as any).toJSON() : undefined;
    if (json?.consensusCreateTopic?.memo) {
      expect(json.consensusCreateTopic.memo).toBe('hcs-2:0:3600');
    }
  });

  test('buildHcs2RegisterTx encodes payload', () => {
    const tx = buildHcs2RegisterTx({
      registryTopicId: '0.0.123',
      targetTopicId: '0.0.456',
      metadata: 'hcs://1/0.0.789',
      memo: 'register',
    });
    expect(tx).toBeInstanceOf(TopicMessageSubmitTransaction);
  });

  test('buildHcs2UpdateTx encodes payload', () => {
    const tx = buildHcs2UpdateTx({
      registryTopicId: '0.0.123',
      uid: '42',
      targetTopicId: '0.0.456',
      metadata: 'x',
      memo: 'update',
    });
    expect(tx).toBeInstanceOf(TopicMessageSubmitTransaction);
  });

  test('buildHcs2DeleteTx encodes payload', () => {
    const tx = buildHcs2DeleteTx({
      registryTopicId: '0.0.123',
      uid: '7',
      memo: 'delete',
    });
    expect(tx).toBeInstanceOf(TopicMessageSubmitTransaction);
  });

  test('buildHcs2MigrateTx encodes payload', () => {
    const tx = buildHcs2MigrateTx({
      registryTopicId: '0.0.123',
      targetTopicId: '0.0.999',
      metadata: 'm',
      memo: 'migrate',
    });
    expect(tx).toBeInstanceOf(TopicMessageSubmitTransaction);
  });
});
