import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicUpdateTransaction,
  AccountCreateTransaction,
  AccountUpdateTransaction,
  ScheduleCreateTransaction,
  Hbar,
  PublicKey,
  KeyList,
  AccountId,
  CustomFixedFee,
  TokenId,
} from '@hashgraph/sdk';
import {
  buildTopicCreateTx,
  buildMessageTx,
  type MaybeKey,
} from '../common/tx/tx-utils';
import { FloraOperation, FloraTopicType, type FloraMessage } from './types';

export const HCS16_FLORA_ACCOUNT_CREATE_TRANSACTION_MEMO =
  'hcs-16:op:flora_account_create';
export const HCS17_STATE_HASH_TRANSACTION_MEMO = 'hcs-17:op:6:2';
export const HCS16_ACCOUNT_KEY_UPDATE_TRANSACTION_MEMO =
  'hcs-16:op:account_key_update';
export const HCS16_TOPIC_KEY_UPDATE_TRANSACTION_MEMO =
  'hcs-16:op:topic_key_update';

function normalizeTransactionMemo(
  value: string | undefined,
  fallback: string,
): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

function encodeHcs16FloraMemo(params: {
  floraAccountId: string;
  topicType: FloraTopicType;
}): string {
  return `hcs-16:${params.floraAccountId}:${params.topicType}`;
}

function encodeHcs16TopicCreateTransactionMemo(
  topicType: FloraTopicType,
): string {
  return `hcs-16:op:topic_create:${topicType}`;
}

const HCS16_OPERATION_ENUM_BY_OP: Record<FloraOperation, number> = {
  [FloraOperation.FLORA_CREATED]: 0,
  [FloraOperation.TRANSACTION]: 1,
  [FloraOperation.STATE_UPDATE]: 2,
  [FloraOperation.FLORA_JOIN_REQUEST]: 3,
  [FloraOperation.FLORA_JOIN_VOTE]: 4,
  [FloraOperation.FLORA_JOIN_ACCEPTED]: 5,
};

const HCS16_TOPIC_TYPE_BY_OP: Record<FloraOperation, FloraTopicType> = {
  [FloraOperation.FLORA_CREATED]: FloraTopicType.COMMUNICATION,
  [FloraOperation.TRANSACTION]: FloraTopicType.TRANSACTION,
  [FloraOperation.STATE_UPDATE]: FloraTopicType.STATE,
  [FloraOperation.FLORA_JOIN_REQUEST]: FloraTopicType.COMMUNICATION,
  [FloraOperation.FLORA_JOIN_VOTE]: FloraTopicType.COMMUNICATION,
  [FloraOperation.FLORA_JOIN_ACCEPTED]: FloraTopicType.STATE,
};

function encodeHcs16MessageSubmitTransactionMemo(op: FloraOperation): string {
  return `hcs-16:op:${HCS16_OPERATION_ENUM_BY_OP[op]}:${HCS16_TOPIC_TYPE_BY_OP[op]}`;
}

/**
 * Build a TopicCreateTransaction for HCS‑16 Flora topics (communication/transaction/state).
 */
export function buildHcs16CreateFloraTopicTx(params: {
  floraAccountId: string;
  topicType: FloraTopicType;
  adminKey?: MaybeKey;
  submitKey?: MaybeKey;
  operatorPublicKey?: PublicKey;
  autoRenewAccountId?: string;
  transactionMemo?: string;
}): TopicCreateTransaction {
  const memo = encodeHcs16FloraMemo({
    floraAccountId: params.floraAccountId,
    topicType: params.topicType,
  });
  const tx = buildTopicCreateTx({
    memo,
    adminKey: params.adminKey,
    submitKey: params.submitKey,
    operatorPublicKey: params.operatorPublicKey,
  });
  tx.setTransactionMemo(
    normalizeTransactionMemo(
      params.transactionMemo,
      encodeHcs16TopicCreateTransactionMemo(params.topicType),
    ),
  );
  if (params.autoRenewAccountId) {
    tx.setAutoRenewAccountId(AccountId.fromString(params.autoRenewAccountId));
  }
  return tx;
}

/**
 * Build a TopicCreateTransaction for a generic HCS‑16 transaction topic with HIP‑991 fees.
 */
export function buildHcs16CreateTransactionTopicTx(params: {
  memo: string;
  adminKey?: KeyList | PublicKey;
  submitKey?: KeyList | PublicKey;
  feeScheduleKey?: KeyList | PublicKey;
  customFees?: Array<{
    amount: number;
    feeCollectorAccountId: string;
    denominatingTokenId?: string;
  }>;
  feeExemptKeys?: PublicKey[];
}): TopicCreateTransaction {
  const tx = new TopicCreateTransaction().setTopicMemo(params.memo);
  if (params.adminKey) {
    tx.setAdminKey(params.adminKey);
  }
  if (params.submitKey) {
    tx.setSubmitKey(params.submitKey);
  }
  if (params.feeScheduleKey) {
    tx.setFeeScheduleKey(params.feeScheduleKey);
  }
  if (params.customFees && params.customFees.length > 0) {
    const fees = params.customFees.map(fee => {
      const cf = new CustomFixedFee()
        .setAmount(fee.amount)
        .setFeeCollectorAccountId(
          AccountId.fromString(fee.feeCollectorAccountId),
        );
      if (fee.denominatingTokenId) {
        cf.setDenominatingTokenId(TokenId.fromString(fee.denominatingTokenId));
      }
      return cf;
    });
    tx.setCustomFees(fees);
  }
  if (params.feeExemptKeys && params.feeExemptKeys.length > 0) {
    throw new Error('feeExemptKeys not supported by installed @hashgraph/sdk');
  }
  return tx;
}

/**
 * Build an AccountCreateTransaction for a Flora account given a KeyList and optional params.
 */
export function buildHcs16CreateAccountTx(params: {
  keyList: KeyList;
  initialBalanceHbar?: number;
  maxAutomaticTokenAssociations?: number;
  transactionMemo?: string;
}): AccountCreateTransaction {
  const tx = new AccountCreateTransaction().setKey(params.keyList);
  const initial =
    typeof params.initialBalanceHbar === 'number'
      ? params.initialBalanceHbar
      : 1;
  tx.setInitialBalance(new Hbar(initial));
  const maxAssoc =
    typeof params.maxAutomaticTokenAssociations === 'number'
      ? params.maxAutomaticTokenAssociations
      : -1;
  tx.setMaxAutomaticTokenAssociations(maxAssoc);
  tx.setTransactionMemo(
    normalizeTransactionMemo(
      params.transactionMemo,
      HCS16_FLORA_ACCOUNT_CREATE_TRANSACTION_MEMO,
    ),
  );
  return tx;
}

/**
 * Build a ScheduleCreateTransaction that wraps an AccountUpdateTransaction to rotate the Flora account KeyList.
 * Members will sign this scheduled transaction until threshold is reached and it executes.
 */
export function buildHcs16ScheduleAccountKeyUpdateTx(params: {
  floraAccountId: string;
  newKeyList: KeyList;
  memo?: string;
  transactionMemo?: string;
}): ScheduleCreateTransaction {
  const inner = new AccountUpdateTransaction()
    .setAccountId(AccountId.fromString(params.floraAccountId))
    .setKey(params.newKeyList);
  inner.setTransactionMemo(
    normalizeTransactionMemo(
      params.transactionMemo ?? params.memo,
      HCS16_ACCOUNT_KEY_UPDATE_TRANSACTION_MEMO,
    ),
  );
  return new ScheduleCreateTransaction().setScheduledTransaction(inner);
}

/**
 * Build a ScheduleCreateTransaction that wraps a TopicUpdateTransaction to rotate topic admin/submit keys.
 * Repeat for CTopic, TTopic, and STopic as needed for membership changes.
 */
export function buildHcs16ScheduleTopicKeyUpdateTx(params: {
  topicId: string;
  adminKey?: KeyList | PublicKey;
  submitKey?: KeyList | PublicKey;
  memo?: string;
  transactionMemo?: string;
}): ScheduleCreateTransaction {
  const inner = new TopicUpdateTransaction().setTopicId(params.topicId);
  if (params.adminKey) {
    inner.setAdminKey(params.adminKey);
  }
  if (params.submitKey) {
    inner.setSubmitKey(params.submitKey);
  }
  inner.setTransactionMemo(
    normalizeTransactionMemo(
      params.transactionMemo ?? params.memo,
      HCS16_TOPIC_KEY_UPDATE_TRANSACTION_MEMO,
    ),
  );
  return new ScheduleCreateTransaction().setScheduledTransaction(inner);
}

/**
 * Build a TopicMessageSubmitTransaction for generic HCS‑16 messages.
 * Body fields are merged into the envelope `{ p: 'hcs-16', op, operator_id }`.
 */
export function buildHcs16MessageTx(params: {
  topicId: string;
  operatorId: string;
  op: FloraOperation;
  body?: Record<string, unknown>;
  transactionMemo?: string;
}): TopicMessageSubmitTransaction {
  const payload: FloraMessage = {
    p: 'hcs-16',
    op: params.op,
    operator_id: params.operatorId,
    ...(params.body || {}),
  } as FloraMessage;

  return buildMessageTx({
    topicId: params.topicId,
    message: JSON.stringify(payload),
    transactionMemo: normalizeTransactionMemo(
      params.transactionMemo,
      encodeHcs16MessageSubmitTransactionMemo(params.op),
    ),
  });
}

/**
 * Build HCS‑16 flora_created message.
 */
export function buildHcs16FloraCreatedTx(params: {
  topicId: string;
  operatorId: string;
  floraAccountId: string;
  topics: { communication: string; transaction: string; state: string };
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.FLORA_CREATED,
    body: {
      flora_account_id: params.floraAccountId,
      topics: params.topics,
    },
  });
}

/**
 * Build HCS‑16 transaction message.
 */
export function buildHcs16TransactionTx(params: {
  topicId: string;
  operatorId: string;
  scheduleId: string;
  data?: string;
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.TRANSACTION,
    body: {
      schedule_id: params.scheduleId,
      data: params.data,
      m: params.data,
    },
  });
}

/**
 * Build HCS‑17 state_hash message for Flora STopic state updates.
 */
export function buildHcs16StateUpdateTx(params: {
  topicId: string;
  operatorId: string;
  hash: string;
  epoch?: number;
  accountId?: string;
  topics?: string[];
  memo?: string;
  transactionMemo?: string;
}): TopicMessageSubmitTransaction {
  const payload = {
    p: 'hcs-17',
    op: 'state_hash',
    state_hash: params.hash,
    topics: params.topics ?? [],
    account_id: params.accountId ?? params.operatorId,
    epoch: params.epoch,
    timestamp: new Date().toISOString(),
    m: params.memo,
  };
  return buildMessageTx({
    topicId: params.topicId,
    message: JSON.stringify(payload),
    transactionMemo: normalizeTransactionMemo(
      params.transactionMemo,
      HCS17_STATE_HASH_TRANSACTION_MEMO,
    ),
  });
}

/**
 * Build HCS‑16 flora_join_request message.
 */
export function buildHcs16FloraJoinRequestTx(params: {
  topicId: string;
  operatorId: string;
  accountId: string;
  connectionRequestId: number;
  connectionTopicId: string;
  connectionSeq: number;
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.FLORA_JOIN_REQUEST,
    body: {
      account_id: params.accountId,
      connection_request_id: params.connectionRequestId,
      connection_topic_id: params.connectionTopicId,
      connection_seq: params.connectionSeq,
    },
  });
}

/**
 * Build HCS‑16 flora_join_vote message.
 */
export function buildHcs16FloraJoinVoteTx(params: {
  topicId: string;
  operatorId: string;
  accountId: string;
  approve: boolean;
  connectionRequestId: number;
  connectionSeq: number;
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.FLORA_JOIN_VOTE,
    body: {
      account_id: params.accountId,
      approve: params.approve,
      connection_request_id: params.connectionRequestId,
      connection_seq: params.connectionSeq,
    },
  });
}

/**
 * Build HCS‑16 flora_join_accepted message.
 */
export function buildHcs16FloraJoinAcceptedTx(params: {
  topicId: string;
  operatorId: string;
  members: string[];
  epoch?: number;
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.FLORA_JOIN_ACCEPTED,
    body: {
      members: params.members,
      epoch: params.epoch,
    },
  });
}
