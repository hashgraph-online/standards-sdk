import {
  PublicKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import {
  buildTopicCreateTx,
  buildMessageTx,
  MaybeKey,
} from '../common/tx/tx-utils';
import { HCS21TopicType, PackageDeclaration } from './types';

export function buildHcs21RegistryMemo(params: {
  ttl: number;
  indexed?: 0 | 1;
}): string {
  const indexed = params.indexed ?? 0;
  return `hcs-21:${indexed}:${params.ttl}:${HCS21TopicType.REGISTRY}`;
}

export function buildHcs21CreateRegistryTx(params: {
  ttl: number;
  indexed?: 0 | 1;
  adminKey?: MaybeKey;
  submitKey?: MaybeKey;
  operatorPublicKey?: PublicKey;
}): TopicCreateTransaction {
  const memo = buildHcs21RegistryMemo({
    ttl: params.ttl,
    indexed: params.indexed,
  });
  return buildTopicCreateTx({
    memo,
    adminKey: params.adminKey,
    submitKey: params.submitKey,
    operatorPublicKey: params.operatorPublicKey,
  });
}

export function buildHcs21MessageTx(params: {
  topicId: string;
  declaration: PackageDeclaration;
  transactionMemo?: string;
}): TopicMessageSubmitTransaction {
  return buildMessageTx({
    topicId: params.topicId,
    message: JSON.stringify(params.declaration),
    transactionMemo: params.transactionMemo,
  });
}
