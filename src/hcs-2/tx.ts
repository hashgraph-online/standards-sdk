import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import {
  encodeHcs2RegistryMemo,
  buildTopicCreateTx,
  buildMessageTx,
  MaybeKey,
} from '../common/tx/tx-utils';
import {
  HCS2Operation,
  HCS2RegistryType,
  HCS2RegisterMessage,
  HCS2UpdateMessage,
  HCS2DeleteMessage,
  HCS2MigrateMessage,
} from './types';

export function buildHcs2CreateRegistryTx(params: {
  registryType: HCS2RegistryType;
  ttl: number;
  adminKey?: MaybeKey;
  submitKey?: MaybeKey;
  memoOverride?: string;
  operatorPublicKey?: Parameters<
    typeof buildTopicCreateTx
  >[0]['operatorPublicKey'];
}): TopicCreateTransaction {
  const memo =
    params.memoOverride ??
    encodeHcs2RegistryMemo(params.registryType, params.ttl);
  return buildTopicCreateTx({
    memo,
    adminKey: params.adminKey,
    submitKey: params.submitKey,
    operatorPublicKey: params.operatorPublicKey,
  });
}

export function buildHcs2RegisterTx(params: {
  registryTopicId: string;
  targetTopicId: string;
  metadata?: string;
  memo?: string;
  analyticsMemo?: string;
}): TopicMessageSubmitTransaction {
  const payload: HCS2RegisterMessage = {
    p: 'hcs-2',
    op: HCS2Operation.REGISTER,
    t_id: params.targetTopicId,
    metadata: params.metadata,
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.registryTopicId,
    message: JSON.stringify(payload),
    transactionMemo: params.analyticsMemo,
  });
}

export function buildHcs2UpdateTx(params: {
  registryTopicId: string;
  uid: string;
  targetTopicId: string;
  metadata?: string;
  memo?: string;
  analyticsMemo?: string;
}): TopicMessageSubmitTransaction {
  const payload: HCS2UpdateMessage = {
    p: 'hcs-2',
    op: HCS2Operation.UPDATE,
    uid: params.uid,
    t_id: params.targetTopicId,
    metadata: params.metadata,
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.registryTopicId,
    message: JSON.stringify(payload),
    transactionMemo: params.analyticsMemo,
  });
}

export function buildHcs2DeleteTx(params: {
  registryTopicId: string;
  uid: string;
  memo?: string;
  analyticsMemo?: string;
}): TopicMessageSubmitTransaction {
  const payload: HCS2DeleteMessage = {
    p: 'hcs-2',
    op: HCS2Operation.DELETE,
    uid: params.uid,
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.registryTopicId,
    message: JSON.stringify(payload),
    transactionMemo: params.analyticsMemo,
  });
}

export function buildHcs2MigrateTx(params: {
  registryTopicId: string;
  targetTopicId: string;
  metadata?: string;
  memo?: string;
  analyticsMemo?: string;
}): TopicMessageSubmitTransaction {
  const payload: HCS2MigrateMessage = {
    p: 'hcs-2',
    op: HCS2Operation.MIGRATE,
    t_id: params.targetTopicId,
    metadata: params.metadata,
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.registryTopicId,
    message: JSON.stringify(payload),
    transactionMemo: params.analyticsMemo,
  });
}
