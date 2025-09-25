import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  KeyList,
} from '@hashgraph/sdk';
import {
  buildTopicCreateTx,
  buildMessageTx,
  MaybeKey,
} from '../common/tx/tx-utils';

function memoInbound(ttl: number, accountId: string): string {
  return `hcs-10:0:${ttl}:0:${accountId}`;
}
function memoOutbound(ttl: number): string {
  return `hcs-10:0:${ttl}:1`;
}
function memoConnection(
  ttl: number,
  inboundTopicId: string,
  connectionId: number | string,
): string {
  return `hcs-10:1:${ttl}:2:${inboundTopicId}:${connectionId}`;
}
function memoRegistry(ttl: number, metadataTopicId?: string): string {
  return metadataTopicId
    ? `hcs-10:0:${ttl}:3:${metadataTopicId}`
    : `hcs-10:0:${ttl}:3`;
}
function analyticsMemo(opEnum: number, topicTypeEnum: number): string {
  return `hcs-10:op:${opEnum}:${topicTypeEnum}`;
}

export function buildHcs10CreateInboundTopicTx(params: {
  accountId: string;
  ttl: number;
  adminKey?: MaybeKey;
  submitKey?: MaybeKey;
  memoOverride?: string;
  operatorPublicKey?: Parameters<
    typeof buildTopicCreateTx
  >[0]['operatorPublicKey'];
}): TopicCreateTransaction {
  const memo = params.memoOverride ?? memoInbound(params.ttl, params.accountId);
  return buildTopicCreateTx({
    memo,
    adminKey: params.adminKey,
    submitKey: params.submitKey,
    operatorPublicKey: params.operatorPublicKey,
  });
}

export function buildHcs10CreateOutboundTopicTx(params: {
  ttl: number;
  submitKey?: MaybeKey;
  adminKey?: MaybeKey;
  memoOverride?: string;
  operatorPublicKey?: Parameters<
    typeof buildTopicCreateTx
  >[0]['operatorPublicKey'];
}): TopicCreateTransaction {
  const memo = params.memoOverride ?? memoOutbound(params.ttl);
  return buildTopicCreateTx({
    memo,
    adminKey: params.adminKey,
    submitKey: params.submitKey,
    operatorPublicKey: params.operatorPublicKey,
  });
}

export function buildHcs10CreateConnectionTopicTx(params: {
  ttl: number;
  inboundTopicId: string;
  connectionId: number | string;
  adminKey?: MaybeKey;
  submitKey?: MaybeKey;
  memoOverride?: string;
  operatorPublicKey?: Parameters<
    typeof buildTopicCreateTx
  >[0]['operatorPublicKey'];
}): TopicCreateTransaction {
  const memo =
    params.memoOverride ??
    memoConnection(params.ttl, params.inboundTopicId, params.connectionId);
  return buildTopicCreateTx({
    memo,
    adminKey: params.adminKey,
    submitKey: params.submitKey,
    operatorPublicKey: params.operatorPublicKey,
  });
}

export function buildHcs10CreateRegistryTopicTx(params: {
  ttl: number;
  metadataTopicId?: string;
  adminKey?: MaybeKey;
  submitKey?: MaybeKey;
  memoOverride?: string;
  operatorPublicKey?: Parameters<
    typeof buildTopicCreateTx
  >[0]['operatorPublicKey'];
}): TopicCreateTransaction {
  const memo =
    params.memoOverride ?? memoRegistry(params.ttl, params.metadataTopicId);
  return buildTopicCreateTx({
    memo,
    adminKey: params.adminKey,
    submitKey: params.submitKey,
    operatorPublicKey: params.operatorPublicKey,
  });
}

export function buildHcs10SubmitConnectionRequestTx(params: {
  inboundTopicId: string;
  operatorId: string; // format inboundTopicId@accountId or just accountId per upstream usage
  memo?: string;
}): TopicMessageSubmitTransaction {
  const payload = {
    p: 'hcs-10',
    op: 'connection_request',
    operator_id: params.operatorId,
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.inboundTopicId,
    message: JSON.stringify(payload),
    transactionMemo: analyticsMemo(3, 1),
  });
}

export function buildHcs10ConfirmConnectionTx(params: {
  inboundTopicId: string;
  connectionTopicId: string;
  connectedAccountId: string;
  operatorId: string; // inboundTopicId@accountId of confirmer
  connectionId: number;
  memo?: string;
}): TopicMessageSubmitTransaction {
  const payload = {
    p: 'hcs-10',
    op: 'connection_created',
    connection_topic_id: params.connectionTopicId,
    connected_account_id: params.connectedAccountId,
    operator_id: params.operatorId,
    connection_id: params.connectionId,
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.inboundTopicId,
    message: JSON.stringify(payload),
    transactionMemo: analyticsMemo(4, 1),
  });
}

export function buildHcs10OutboundConnectionRequestRecordTx(params: {
  outboundTopicId: string;
  operatorId: string; // target inboundTopicId@accountId as per spec text
  connectionRequestId: number;
  memo?: string;
}): TopicMessageSubmitTransaction {
  const payload = {
    p: 'hcs-10',
    op: 'connection_request',
    operator_id: params.operatorId,
    outbound_topic_id: params.outboundTopicId,
    connection_request_id: params.connectionRequestId,
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.outboundTopicId,
    message: JSON.stringify(payload),
    transactionMemo: analyticsMemo(3, 2),
  });
}

export function buildHcs10OutboundConnectionCreatedRecordTx(params: {
  outboundTopicId: string;
  requestorOutboundTopicId: string;
  connectionTopicId: string;
  confirmedRequestId: number;
  connectionRequestId: number;
  operatorId: string; // inboundTopicId@accountId of confirmer
  memo?: string;
}): TopicMessageSubmitTransaction {
  const payload = {
    p: 'hcs-10',
    op: 'connection_created',
    connection_topic_id: params.connectionTopicId,
    outbound_topic_id: params.outboundTopicId,
    requestor_outbound_topic_id: params.requestorOutboundTopicId,
    confirmed_request_id: params.confirmedRequestId,
    connection_request_id: params.connectionRequestId,
    operator_id: params.operatorId,
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.outboundTopicId,
    message: JSON.stringify(payload),
    transactionMemo: analyticsMemo(4, 2),
  });
}

export function buildHcs10SendMessageTx(params: {
  connectionTopicId: string;
  operatorId: string;
  data: string;
  memo?: string;
}): TopicMessageSubmitTransaction {
  const payload = {
    p: 'hcs-10',
    op: 'message',
    operator_id: params.operatorId,
    data: params.data,
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.connectionTopicId,
    message: JSON.stringify(payload),
    transactionMemo: analyticsMemo(6, 3),
  });
}

export function buildHcs10RegistryRegisterTx(params: {
  registryTopicId: string;
  accountId: string;
  inboundTopicId?: string;
  memo?: string;
}): TopicMessageSubmitTransaction {
  const payload = {
    p: 'hcs-10',
    op: 'register',
    account_id: params.accountId,
    ...(params.inboundTopicId
      ? { inbound_topic_id: params.inboundTopicId }
      : {}),
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.registryTopicId,
    message: JSON.stringify(payload),
    transactionMemo: analyticsMemo(0, 0),
  });
}

export function buildHcs10RegistryDeleteTx(params: {
  registryTopicId: string;
  uid: string;
  memo?: string;
}): TopicMessageSubmitTransaction {
  const payload = {
    p: 'hcs-10',
    op: 'delete',
    uid: params.uid,
    m: params.memo,
  } as const;
  return buildMessageTx({
    topicId: params.registryTopicId,
    message: JSON.stringify(payload),
    transactionMemo: analyticsMemo(1, 0),
  });
}

export function buildHcs10RegistryMigrateTx(params: {
  registryTopicId: string;
  targetTopicId: string;
  memo?: string;
}): TopicMessageSubmitTransaction {
  const payload = {
    p: 'hcs-10',
    op: 'migrate',
    t_id: params.targetTopicId,
    m: params.memo,
  } as const;
  return buildMessageTx({
    topicId: params.registryTopicId,
    message: JSON.stringify(payload),
    transactionMemo: analyticsMemo(2, 0),
  });
}
