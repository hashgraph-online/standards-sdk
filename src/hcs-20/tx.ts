import { TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { buildMessageTx } from '../common/tx/tx-utils';
import type {
  HCS20DeployMessage,
  HCS20MintMessage,
  HCS20TransferMessage,
  HCS20BurnMessage,
  HCS20RegisterMessage,
} from './types';

export function buildHcs20SubmitMessageTx(params: {
  topicId: string;
  payload: object | string;
  transactionMemo?: string;
}): TopicMessageSubmitTransaction {
  const msg =
    typeof params.payload === 'string'
      ? params.payload
      : JSON.stringify(params.payload);
  return buildMessageTx({
    topicId: params.topicId,
    message: msg,
    transactionMemo: params.transactionMemo,
  });
}

export function buildHcs20DeployTx(params: {
  topicId: string;
  name: string;
  tick: string;
  max: string;
  lim?: string;
  metadata?: string;
  memo?: string;
}): TopicMessageSubmitTransaction {
  const payload: HCS20DeployMessage = {
    p: 'hcs-20',
    op: 'deploy',
    name: params.name,
    tick: params.tick.toLowerCase().trim(),
    max: params.max,
    lim: params.lim,
    metadata: params.metadata,
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.topicId,
    message: JSON.stringify(payload),
  });
}

export function buildHcs20MintTx(params: {
  topicId: string;
  tick: string;
  amt: string;
  to: string;
  memo?: string;
}): TopicMessageSubmitTransaction {
  const payload: HCS20MintMessage = {
    p: 'hcs-20',
    op: 'mint',
    tick: params.tick.toLowerCase().trim(),
    amt: params.amt,
    to: params.to,
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.topicId,
    message: JSON.stringify(payload),
  });
}

export function buildHcs20TransferTx(params: {
  topicId: string;
  tick: string;
  amt: string;
  from: string;
  to: string;
  memo?: string;
}): TopicMessageSubmitTransaction {
  const payload: HCS20TransferMessage = {
    p: 'hcs-20',
    op: 'transfer',
    tick: params.tick.toLowerCase().trim(),
    amt: params.amt,
    from: params.from,
    to: params.to,
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.topicId,
    message: JSON.stringify(payload),
  });
}

export function buildHcs20BurnTx(params: {
  topicId: string;
  tick: string;
  amt: string;
  from: string;
  memo?: string;
}): TopicMessageSubmitTransaction {
  const payload: HCS20BurnMessage = {
    p: 'hcs-20',
    op: 'burn',
    tick: params.tick.toLowerCase().trim(),
    amt: params.amt,
    from: params.from,
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.topicId,
    message: JSON.stringify(payload),
  });
}

export function buildHcs20RegisterTx(params: {
  registryTopicId: string;
  name: string;
  topicId: string;
  isPrivate: boolean;
  metadata?: string;
  memo?: string;
}): TopicMessageSubmitTransaction {
  const payload: HCS20RegisterMessage = {
    p: 'hcs-20',
    op: 'register',
    name: params.name,
    metadata: params.metadata,
    private: params.isPrivate,
    t_id: params.topicId,
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.registryTopicId,
    message: JSON.stringify(payload),
  });
}
