import { TopicCreateTransaction, TopicMessageSubmitTransaction, PublicKey } from '@hashgraph/sdk';
import type {
  DiscoveryMessage,
  AnnounceData,
  ProposeData,
  RespondData,
  CompleteMessage,
  WithdrawMessage,
} from './types';
import { DiscoveryOperation } from './types';
import type { MaybeKey } from '../common/tx/tx-utils';
import { buildTopicCreateTx } from '../common/tx/tx-utils';

export function buildHcs18DiscoveryMemo(ttlSeconds?: number, memoOverride?: string): string {
  if (memoOverride && memoOverride.trim().length > 0) {
    return memoOverride;
  }
  if (ttlSeconds && ttlSeconds > 0) {
    return `hcs-18:0:${ttlSeconds}`;
  }
  return 'hcs-18:0';
}

export function buildHcs18CreateDiscoveryTopicTx(params: {
  ttlSeconds?: number;
  adminKey?: MaybeKey;
  submitKey?: MaybeKey;
  operatorPublicKey?: PublicKey;
  memoOverride?: string;
}): TopicCreateTransaction {
  const memo = buildHcs18DiscoveryMemo(params.ttlSeconds, params.memoOverride);
  return buildTopicCreateTx({
    memo,
    adminKey: params.adminKey,
    submitKey: params.submitKey,
    operatorPublicKey: params.operatorPublicKey,
  });
}

export function buildHcs18SubmitDiscoveryMessageTx(params: {
  topicId: string;
  message: DiscoveryMessage;
  transactionMemo?: string;
}): TopicMessageSubmitTransaction {
  return new TopicMessageSubmitTransaction()
    .setTopicId(params.topicId)
    .setMessage(JSON.stringify(params.message))
    .setTransactionMemo(params.transactionMemo || '');
}

export function buildHcs18AnnounceMessage(data: AnnounceData): DiscoveryMessage {
  return { p: 'hcs-18', op: DiscoveryOperation.ANNOUNCE, data } as const;
}

export function buildHcs18ProposeMessage(data: ProposeData): DiscoveryMessage {
  return { p: 'hcs-18', op: DiscoveryOperation.PROPOSE, data } as const;
}

export function buildHcs18RespondMessage(data: RespondData): DiscoveryMessage {
  return { p: 'hcs-18', op: DiscoveryOperation.RESPOND, data } as const;
}

export function buildHcs18CompleteMessage(data: CompleteMessage['data']): DiscoveryMessage {
  return { p: 'hcs-18', op: DiscoveryOperation.COMPLETE, data } as const;
}

export function buildHcs18WithdrawMessage(data: WithdrawMessage['data']): DiscoveryMessage {
  return { p: 'hcs-18', op: DiscoveryOperation.WITHDRAW, data } as const;
}
