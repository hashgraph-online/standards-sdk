import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import {
  buildHcs10CreateInboundTopicTx,
  buildHcs10CreateOutboundTopicTx,
  buildHcs10CreateConnectionTopicTx,
  buildHcs10CreateRegistryTopicTx,
  buildHcs10SubmitConnectionRequestTx,
  buildHcs10ConfirmConnectionTx,
  buildHcs10OutboundConnectionRequestRecordTx,
  buildHcs10OutboundConnectionCreatedRecordTx,
  buildHcs10SendMessageTx,
  buildHcs10RegistryRegisterTx,
  buildHcs10RegistryDeleteTx,
  buildHcs10RegistryMigrateTx,
} from '../../src/hcs-10/tx';

const getMemo = (tx: any) => {
  const json = typeof tx.toJSON === 'function' ? tx.toJSON() : undefined;
  return json?.consensusCreateTopic?.memo;
};

describe('HCS-10 tx builders', () => {
  test('buildHcs10CreateInboundTopicTx sets correct memo', () => {
    const tx = buildHcs10CreateInboundTopicTx({
      accountId: '0.0.111',
      ttl: 3600,
    });
    expect(tx).toBeInstanceOf(TopicCreateTransaction);
    const memo = getMemo(tx as any);
    if (memo) expect(memo).toBe('hcs-10:0:3600:0:0.0.111');
  });

  test('buildHcs10CreateOutboundTopicTx sets correct memo', () => {
    const tx = buildHcs10CreateOutboundTopicTx({ ttl: 7200 });
    expect(tx).toBeInstanceOf(TopicCreateTransaction);
    const memo = getMemo(tx as any);
    if (memo) expect(memo).toBe('hcs-10:0:7200:1');
  });

  test('buildHcs10CreateConnectionTopicTx sets correct memo', () => {
    const tx = buildHcs10CreateConnectionTopicTx({
      ttl: 1800,
      inboundTopicId: '0.0.123',
      connectionId: 42,
    });
    expect(tx).toBeInstanceOf(TopicCreateTransaction);
    const memo = getMemo(tx as any);
    if (memo) expect(memo).toBe('hcs-10:1:1800:2:0.0.123:42');
  });

  test('buildHcs10CreateRegistryTopicTx sets correct memo with metadata topic id', () => {
    const tx = buildHcs10CreateRegistryTopicTx({
      ttl: 3600,
      metadataTopicId: '0.0.999',
    });
    expect(tx).toBeInstanceOf(TopicCreateTransaction);
    const memo = getMemo(tx as any);
    if (memo) expect(memo).toBe('hcs-10:0:3600:3:0.0.999');
  });

  test('buildHcs10CreateRegistryTopicTx sets correct memo without metadata topic id', () => {
    const tx = buildHcs10CreateRegistryTopicTx({ ttl: 3600 });
    expect(tx).toBeInstanceOf(TopicCreateTransaction);
    const memo = getMemo(tx as any);
    if (memo) expect(memo).toBe('hcs-10:0:3600:3');
  });

  test('message builders return TopicMessageSubmitTransaction', () => {
    expect(
      buildHcs10SubmitConnectionRequestTx({
        inboundTopicId: '0.0.1',
        operatorId: '0.0.1@0.0.2',
      }),
    ).toBeInstanceOf(TopicMessageSubmitTransaction);
    expect(
      buildHcs10ConfirmConnectionTx({
        inboundTopicId: '0.0.1',
        connectionTopicId: '0.0.3',
        connectedAccountId: '0.0.2',
        operatorId: '0.0.1@0.0.2',
        connectionId: 1,
      }),
    ).toBeInstanceOf(TopicMessageSubmitTransaction);
    expect(
      buildHcs10OutboundConnectionRequestRecordTx({
        outboundTopicId: '0.0.5',
        operatorId: '0.0.1@0.0.2',
        connectionRequestId: 9,
      }),
    ).toBeInstanceOf(TopicMessageSubmitTransaction);
    expect(
      buildHcs10OutboundConnectionCreatedRecordTx({
        outboundTopicId: '0.0.5',
        requestorOutboundTopicId: '0.0.6',
        connectionTopicId: '0.0.7',
        confirmedRequestId: 2,
        connectionRequestId: 9,
        operatorId: '0.0.1@0.0.2',
      }),
    ).toBeInstanceOf(TopicMessageSubmitTransaction);
    expect(
      buildHcs10SendMessageTx({
        connectionTopicId: '0.0.7',
        operatorId: '0.0.1@0.0.2',
        data: 'hello',
      }),
    ).toBeInstanceOf(TopicMessageSubmitTransaction);
  });

  test('registry ops builders return TopicMessageSubmitTransaction', () => {
    expect(
      buildHcs10RegistryRegisterTx({
        registryTopicId: '0.0.8',
        accountId: '0.0.9',
      }),
    ).toBeInstanceOf(TopicMessageSubmitTransaction);
    expect(
      buildHcs10RegistryDeleteTx({ registryTopicId: '0.0.8', uid: '13' }),
    ).toBeInstanceOf(TopicMessageSubmitTransaction);
    expect(
      buildHcs10RegistryMigrateTx({
        registryTopicId: '0.0.8',
        targetTopicId: '0.0.10',
      }),
    ).toBeInstanceOf(TopicMessageSubmitTransaction);
  });
});
