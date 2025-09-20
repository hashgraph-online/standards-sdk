import { TopicCreateTransaction, TopicMessageSubmitTransaction, PublicKey } from '@hashgraph/sdk';
import type {
  DiscoveryMessage,
  AnnounceData,
  ProposeData,
  RespondData,
  CompleteMessage,
  WithdrawMessage,
  AnnounceMessage,
  ProposeMessage,
  RespondMessage,
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

function opCode(op: DiscoveryOperation): number {
  switch (op) {
    case DiscoveryOperation.ANNOUNCE:
      return 0;
    case DiscoveryOperation.PROPOSE:
      return 1;
    case DiscoveryOperation.RESPOND:
      return 2;
    case DiscoveryOperation.COMPLETE:
      return 3;
    case DiscoveryOperation.WITHDRAW:
      return 4;
    default:
      return 0;
  }
}

export function buildHcs18SubmitDiscoveryMessageTx(params: {
  topicId: string;
  message: DiscoveryMessage;
  transactionMemo?: string;
}): TopicMessageSubmitTransaction {
  const memo =
    typeof params.transactionMemo === 'string' && params.transactionMemo.length > 0
      ? params.transactionMemo
      : `hcs-18:op:${opCode(params.message.op)}`;
  return new TopicMessageSubmitTransaction()
    .setTopicId(params.topicId)
    .setMessage(JSON.stringify(params.message))
    .setTransactionMemo(memo);
}

export function buildHcs18AnnounceMessage(data: AnnounceData): AnnounceMessage {
  return { p: 'hcs-18', op: DiscoveryOperation.ANNOUNCE, data } as AnnounceMessage;
}

export function buildHcs18ProposeMessage(data: ProposeData): ProposeMessage {
  return { p: 'hcs-18', op: DiscoveryOperation.PROPOSE, data } as ProposeMessage;
}

export function buildHcs18RespondMessage(data: RespondData): RespondMessage {
  return { p: 'hcs-18', op: DiscoveryOperation.RESPOND, data } as RespondMessage;
}

export function buildHcs18CompleteMessage(data: CompleteMessage['data']): CompleteMessage {
  return { p: 'hcs-18', op: DiscoveryOperation.COMPLETE, data } as CompleteMessage;
}

export function buildHcs18WithdrawMessage(data: WithdrawMessage['data']): WithdrawMessage {
  return { p: 'hcs-18', op: DiscoveryOperation.WITHDRAW, data } as WithdrawMessage;
}
