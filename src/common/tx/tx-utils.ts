import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  PublicKey,
  KeyList,
  TopicId,
} from '@hashgraph/sdk';

export type MaybeKey = boolean | string | PublicKey | KeyList | undefined;

export function encodeHcs2RegistryMemo(
  indexedFlag: 0 | 1,
  ttl: number,
): string {
  return `hcs-2:${indexedFlag}:${ttl}`;
}

export function buildTopicCreateTx(params: {
  memo: string;
  adminKey?: MaybeKey;
  submitKey?: MaybeKey;
  operatorPublicKey?: PublicKey;
}): TopicCreateTransaction {
  const { memo, adminKey, submitKey, operatorPublicKey } = params;
  const tx = new TopicCreateTransaction().setTopicMemo(memo);

  const coerceKey = (k?: MaybeKey): PublicKey | KeyList | undefined => {
    if (!k) return undefined;
    if (k instanceof PublicKey || k instanceof KeyList) return k;
    if (typeof k === 'boolean') {
      return k ? operatorPublicKey : undefined;
    }
    if (typeof k === 'string') {
      try {
        return PublicKey.fromString(k);
      } catch {
        return undefined;
      }
    }
    return undefined;
  };

  const admin = coerceKey(adminKey);
  if (admin) {
    tx.setAdminKey(admin);
  }

  const submit = coerceKey(submitKey);
  if (submit) {
    tx.setSubmitKey(submit);
  }

  return tx;
}

export function buildMessageTx(params: {
  topicId: string;
  message: string | Uint8Array;
  transactionMemo?: string;
}): TopicMessageSubmitTransaction {
  const tx = new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(params.topicId))
    .setMessage(params.message);
  if (params.transactionMemo) {
    tx.setTransactionMemo(params.transactionMemo);
  }
  return tx;
}
