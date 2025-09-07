import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import {
  buildTopicCreateTx,
  buildMessageTx,
  MaybeKey,
} from '../common/tx/tx-utils';
import type { HCS6RegisterMessage } from './types';
import { HCS6Operation } from './types';

function encodeHcs6NonIndexedMemo(ttl: number): string {
  return `hcs-6:1:${ttl}`;
}

export function buildHcs6CreateRegistryTx(params: {
  ttl: number;
  submitKey?: MaybeKey;
  adminKey?: MaybeKey;
  memoOverride?: string;
  operatorPublicKey?: Parameters<
    typeof buildTopicCreateTx
  >[0]['operatorPublicKey'];
}): TopicCreateTransaction {
  const memo = params.memoOverride ?? encodeHcs6NonIndexedMemo(params.ttl);
  return buildTopicCreateTx({
    memo,
    submitKey: params.submitKey,
    adminKey: params.adminKey,
    operatorPublicKey: params.operatorPublicKey,
  });
}

export function buildHcs6RegisterEntryTx(params: {
  registryTopicId: string;
  targetTopicId: string;
  memo?: string;
  analyticsMemo?: string;
}): TopicMessageSubmitTransaction {
  const payload: HCS6RegisterMessage = {
    p: 'hcs-6',
    op: HCS6Operation.REGISTER,
    t_id: params.targetTopicId,
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.registryTopicId,
    message: JSON.stringify(payload),
    transactionMemo: params.analyticsMemo,
  });
}
