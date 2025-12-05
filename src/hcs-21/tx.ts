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
import {
  HCS21TopicType,
  AdapterDeclaration,
  HCS21MetadataPointerPattern,
  HCS21_SAFE_MESSAGE_BYTES,
  HCS21_MAX_MESSAGE_BYTES,
} from './types';
import { HCS21ValidationError } from './errors';

export function buildHcs21RegistryMemo(params: {
  ttl: number;
  indexed?: 0 | 1;
  type?: HCS21TopicType;
  metaTopicId?: string;
}): string {
  const indexed = params.indexed ?? 0;
  const topicType = params.type ?? HCS21TopicType.ADAPTER_REGISTRY;

  if (
    params.metaTopicId &&
    !HCS21MetadataPointerPattern.test(params.metaTopicId)
  ) {
    throw new HCS21ValidationError(
      'Meta value must be a short pointer (topic ID, HRL, IPFS, Arweave, OCI, or HTTPS)',
      'invalid_payload',
    );
  }

  const metaSegment = params.metaTopicId ? `:${params.metaTopicId}` : '';
  return `hcs-21:${indexed}:${params.ttl}:${topicType}${metaSegment}`;
}

export function buildHcs21CreateRegistryTx(params: {
  ttl: number;
  indexed?: 0 | 1;
  type?: HCS21TopicType;
  metaTopicId?: string;
  adminKey?: MaybeKey;
  submitKey?: MaybeKey;
  operatorPublicKey?: PublicKey;
}): TopicCreateTransaction {
  const memo = buildHcs21RegistryMemo({
    ttl: params.ttl,
    indexed: params.indexed,
    type: params.type,
    metaTopicId: params.metaTopicId,
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
  declaration: AdapterDeclaration;
  transactionMemo?: string;
}): TopicMessageSubmitTransaction {
  const json = JSON.stringify(params.declaration);
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > HCS21_SAFE_MESSAGE_BYTES) {
    throw new HCS21ValidationError(
      `HCS-21 payload exceeds safe limit of ${HCS21_SAFE_MESSAGE_BYTES} bytes (${bytes}); Hedera cap is ${HCS21_MAX_MESSAGE_BYTES}`,
      'size_exceeded',
    );
  }
  return buildMessageTx({
    topicId: params.topicId,
    message: JSON.stringify(params.declaration),
    transactionMemo: params.transactionMemo,
  });
}
