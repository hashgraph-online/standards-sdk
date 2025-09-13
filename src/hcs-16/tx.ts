import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  AccountCreateTransaction,
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

function encodeHcs16FloraMemo(params: {
  floraAccountId: string;
  topicType: FloraTopicType;
}): string {
  return `hcs-16:${params.floraAccountId}:${params.topicType}`;
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
    (tx as any).setFeeExemptKeyList(params.feeExemptKeys);
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
 * Build a TopicMessageSubmitTransaction for generic HCS‑16 messages.
 * Body fields are merged into the envelope `{ p: 'hcs-16', op, operator_id }`.
 */
export function buildHcs16MessageTx(params: {
  topicId: string;
  operatorId: string;
  op: FloraOperation | string;
  body?: Record<string, unknown>;
  analyticsMemo?: string;
}): TopicMessageSubmitTransaction {
  const payload: FloraMessage = {
    p: 'hcs-16',
    op: params.op as FloraOperation,
    operator_id: params.operatorId,
    ...(params.body || {}),
  } as FloraMessage;

  return buildMessageTx({
    topicId: params.topicId,
    message: JSON.stringify(payload),
    transactionMemo: params.analyticsMemo,
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
  analyticsMemo?: string;
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.FLORA_CREATED,
    body: {
      flora_account_id: params.floraAccountId,
      topics: params.topics,
    },
    analyticsMemo: params.analyticsMemo,
  });
}

/**
 * Build HCS‑16 tx_proposal message.
 */
export function buildHcs16TxProposalTx(params: {
  topicId: string;
  operatorId: string;
  scheduledTxId: string;
  description?: string;
  analyticsMemo?: string;
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.TX_PROPOSAL,
    body: {
      scheduled_tx_id: params.scheduledTxId,
      description: params.description,
      m: params.description,
    },
    analyticsMemo: params.analyticsMemo,
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
  analyticsMemo?: string;
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.STATE_UPDATE,
    body: {
      hash: params.hash,
      epoch: params.epoch,
      timestamp: new Date().toISOString(),
    },
    analyticsMemo: params.analyticsMemo,
  });
}

/**
 * Build HCS‑16 credit_purchase message.
 */
/** credit_purchase is not part of HCS-16 specification; intentionally omitted. */

/**
 * Build HCS‑16 flora_create_request message.
 */
export function buildHcs16FloraCreateRequestTx(params: {
  topicId: string;
  operatorId: string;
  members: string[];
  threshold: number;
  seedHbar?: number;
  analyticsMemo?: string;
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.FLORA_CREATE_REQUEST,
    body: {
      members: params.members,
      threshold: params.threshold,
      seed_hbar: params.seedHbar,
    },
    analyticsMemo: params.analyticsMemo,
  });
}

/**
 * Build HCS‑16 flora_create_accepted message.
 */
export function buildHcs16FloraCreateAcceptedTx(params: {
  topicId: string;
  operatorId: string;
  analyticsMemo?: string;
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.FLORA_CREATE_ACCEPTED,
    analyticsMemo: params.analyticsMemo,
  });
}

/**
 * Build HCS‑16 flora_join_request message.
 */
export function buildHcs16FloraJoinRequestTx(params: {
  topicId: string;
  operatorId: string;
  candidateAccountId: string;
  analyticsMemo?: string;
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.FLORA_JOIN_REQUEST,
    body: {
      candidate_account_id: params.candidateAccountId,
    },
    analyticsMemo: params.analyticsMemo,
  });
}

/**
 * Build HCS‑16 flora_join_vote message.
 */
export function buildHcs16FloraJoinVoteTx(params: {
  topicId: string;
  operatorId: string;
  candidateAccountId: string;
  approve: boolean;
  analyticsMemo?: string;
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.FLORA_JOIN_VOTE,
    body: {
      candidate_account_id: params.candidateAccountId,
      approve: params.approve,
    },
    analyticsMemo: params.analyticsMemo,
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
  analyticsMemo?: string;
}): TopicMessageSubmitTransaction {
  return buildHcs16MessageTx({
    topicId: params.topicId,
    operatorId: params.operatorId,
    op: FloraOperation.FLORA_JOIN_ACCEPTED,
    body: {
      members: params.members,
      epoch: params.epoch,
    },
    analyticsMemo: params.analyticsMemo,
  });
}
