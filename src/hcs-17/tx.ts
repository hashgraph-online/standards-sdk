import {
  PublicKey,
  KeyList,
  TopicMessageSubmitTransaction,
  TopicCreateTransaction,
} from '@hashgraph/sdk';
import { buildTopicCreateTx, buildMessageTx } from '../common/tx/tx-utils';
import { generateHCS17Memo, StateHashMessage } from './types';

/**
 * Build a TopicCreateTransaction for HCS‑17 state topics.
 */
export function buildHcs17CreateTopicTx(params: {
  ttl: number;
  adminKey?: boolean | string | PublicKey | KeyList;
  submitKey?: boolean | string | PublicKey | KeyList;
  operatorPublicKey?: PublicKey;
}): TopicCreateTransaction {
  const memo = generateHCS17Memo(params.ttl);
  return buildTopicCreateTx({
    memo,
    adminKey: params.adminKey,
    submitKey: params.submitKey,
    operatorPublicKey: params.operatorPublicKey,
  });
}

/**
 * Build a TopicMessageSubmitTransaction for HCS‑17 messages.
 */
/**
 * Build a TopicMessageSubmitTransaction for HCS‑17 messages.
 */
export function buildHcs17MessageTx(params: {
  topicId: string;
  stateHash: string;
  accountId: string;
  topics: string[];
  memo?: string;
  epoch?: number;
  timestamp?: string;
  transactionMemo?: string;
}): TopicMessageSubmitTransaction {
  const payload: StateHashMessage = {
    p: 'hcs-17',
    op: 'state_hash',
    state_hash: params.stateHash,
    topics: params.topics,
    account_id: params.accountId,
    epoch: params.epoch,
    timestamp: params.timestamp ?? new Date().toISOString(),
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.topicId,
    message: JSON.stringify(payload),
    transactionMemo: params.transactionMemo,
  });
}
