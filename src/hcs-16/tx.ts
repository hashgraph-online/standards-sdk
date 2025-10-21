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
import * as Hashgraph from '@hashgraph/sdk';
import {
  buildTopicCreateTx,
  buildMessageTx,
  type MaybeKey,
} from '../common/tx/tx-utils';
import { buildHcs17MessageTx } from '../hcs-17/tx';
import {
  FloraOperation,
  FloraTopicType,
  FloraOperationCode,
  type FloraMessage,
} from './types';
import { OpMemoParamsSchema } from './schemas';

function encodeHcs16FloraMemo(params: {
  floraAccountId: string;
  topicType: FloraTopicType;
}): string {
  return `hcs-16:${params.floraAccountId}:${params.topicType}`;
}

const HCS17_STATE_HASH_MEMO = `hcs-17:op:${FloraOperationCode.STATE_HASH}:${FloraTopicType.STATE}`;

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
}): ScheduleCreateTransaction {
  const inner = new AccountUpdateTransaction()
    .setAccountId(AccountId.fromString(params.floraAccountId))
    .setKey(params.newKeyList);
  if (params.memo) {
    inner.setTransactionMemo(params.memo);
  }
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
}): ScheduleCreateTransaction {
  const inner = new TopicUpdateTransaction().setTopicId(params.topicId);
  if (params.adminKey) {
    inner.setAdminKey(params.adminKey);
  }
  if (params.submitKey) {
    inner.setSubmitKey(params.submitKey);
  }
  if (params.memo) {
    inner.setTransactionMemo(params.memo);
  }
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
  opCode?: FloraOperationCode;
  topicTypeHint?: FloraTopicType;
}): TopicMessageSubmitTransaction {
  const payload: FloraMessage = {
    p: 'hcs-16',
    op: params.op,
    operator_id: params.operatorId,
    ...(params.body || {}),
  } as FloraMessage;

  let transactionMemo: string | undefined;
  const parsed = OpMemoParamsSchema.safeParse({
    opCode: params.opCode,
    topicTypeHint: params.topicTypeHint,
  });
  if (
    parsed.success &&
    parsed.data.opCode !== undefined &&
    parsed.data.topicTypeHint !== undefined
  ) {
    transactionMemo = encodeHcs16OpMemo(
      parsed.data.opCode,
      parsed.data.topicTypeHint,
    );
  }

  return buildMessageTx({
    topicId: params.topicId,
    message: JSON.stringify(payload),
    transactionMemo,
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
    opCode: FloraOperationCode.FLORA_CREATED,
    topicTypeHint: FloraTopicType.COMMUNICATION,
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
    opCode: FloraOperationCode.TRANSACTION,
    topicTypeHint: FloraTopicType.TRANSACTION,
    body: {
      schedule_id: params.scheduleId,
      data: params.data,
      m: params.data,
    },
  });
}

/**
 * Build HCS‑16 state_update message.
 */
export function buildHcs16StateUpdateTx(params: {
  topicId: string;
  operatorId: string;
  hash: string;
  epoch?: number;
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.STATE_UPDATE,
    opCode: FloraOperationCode.STATE_UPDATE,
    topicTypeHint: FloraTopicType.STATE,
    body: {
      hash: params.hash,
      epoch: params.epoch,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Build HCS-17 state_hash message for Flora state commitments.
 */
export function buildHcs16StateHashTx(params: {
  topicId: string;
  stateHash: string;
  accountId: string;
  topics: string[];
  memo?: string;
}): TopicMessageSubmitTransaction {
  return buildHcs17MessageTx({
    topicId: params.topicId,
    stateHash: params.stateHash,
    accountId: params.accountId,
    topics: params.topics,
    memo: params.memo,
    transactionMemo: HCS17_STATE_HASH_MEMO,
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
  memo?: string;
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.FLORA_JOIN_REQUEST,
    opCode: FloraOperationCode.FLORA_JOIN_REQUEST,
    topicTypeHint: FloraTopicType.COMMUNICATION,
    body: {
      account_id: params.accountId,
      connection_request_id: params.connectionRequestId,
      connection_topic_id: params.connectionTopicId,
      connection_seq: params.connectionSeq,
      ...(params.memo ? { m: params.memo } : {}),
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
  memo?: string;
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.FLORA_JOIN_VOTE,
    opCode: FloraOperationCode.FLORA_JOIN_VOTE,
    topicTypeHint: FloraTopicType.COMMUNICATION,
    body: {
      account_id: params.accountId,
      approve: params.approve,
      connection_request_id: params.connectionRequestId,
      connection_seq: params.connectionSeq,
      ...(params.memo ? { m: params.memo } : {}),
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
  epoch: number;
  memo?: string;
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.FLORA_JOIN_ACCEPTED,
    opCode: FloraOperationCode.FLORA_JOIN_ACCEPTED,
    topicTypeHint: FloraTopicType.STATE,
    body: {
      members: params.members,
      epoch: params.epoch,
      ...(params.memo ? { m: params.memo } : {}),
    },
  });
}

/** Encode recommended op memo hcs-16:op:<opEnum>:<topicType> */
function encodeHcs16OpMemo(
  opCode: FloraOperationCode,
  topicType: FloraTopicType,
): string {
  return `hcs-16:op:${opCode}:${topicType}`;
}

/** Schedule delete of a Flora account (AccountDeleteTransaction). */
export function buildHcs16ScheduleAccountDeleteTx(params: {
  floraAccountId: string;
  transferAccountId: string;
  memo?: string;
}): ScheduleCreateTransaction {
  // Use real AccountDeleteTransaction; access via namespace import to avoid typing gaps in some SDK versions
  const DeleteCtor = (Hashgraph as any).AccountDeleteTransaction;
  if (!DeleteCtor) {
    throw new Error(
      'AccountDeleteTransaction is not available in @hashgraph/sdk',
    );
  }
  const inner = new DeleteCtor();
  inner.setAccountId(AccountId.fromString(params.floraAccountId));
  inner.setTransferAccountId(AccountId.fromString(params.transferAccountId));
  if (params.memo) {
    inner.setTransactionMemo(params.memo);
  }
  return new ScheduleCreateTransaction().setScheduledTransaction(inner);
}

/** Build an AccountUpdateTransaction for updating Flora memo to reference an HCS-11 profile */
export function buildHcs16UpdateFloraMemoToProfileTx(params: {
  floraAccountId: string;
  profileResource: string;
}): AccountUpdateTransaction {
  return new AccountUpdateTransaction()
    .setAccountId(params.floraAccountId)
    .setAccountMemo(`hcs-11:${params.profileResource}`);
}
