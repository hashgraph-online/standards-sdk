import { TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { buildMessageTx } from '../common/tx/tx-utils';
import type { BaseMessage, EVMConfig, WASMConfig } from './wasm-bridge';

/**
 * Build a generic HCS-7 message submit transaction.
 */
export function buildHcs7SubmitMessageTx(params: {
  topicId: string;
  message: BaseMessage;
  transactionMemo?: string;
}): TopicMessageSubmitTransaction {
  const payload = {
    p: 'hcs-7',
    ...params.message,
  } as const;
  return buildMessageTx({
    topicId: params.topicId,
    message: JSON.stringify(payload),
    transactionMemo: params.transactionMemo,
  });
}

/**
 * Build an HCS-7 EVM bridge message submit transaction.
 */
export function buildHcs7EvmMessageTx(params: {
  topicId: string;
  config: Omit<EVMConfig, 'p' | 'op'> & { m?: string };
  transactionMemo?: string;
}): TopicMessageSubmitTransaction {
  const payload: EVMConfig = {
    p: 'hcs-7',
    op: 'evm',
    ...params.config,
    m: params.config.m ?? '',
  };
  return buildMessageTx({
    topicId: params.topicId,
    message: JSON.stringify(payload),
    transactionMemo: params.transactionMemo,
  });
}

/**
 * Build an HCS-7 WASM bridge message submit transaction.
 */
export function buildHcs7WasmMessageTx(params: {
  topicId: string;
  config: Omit<WASMConfig, 'p' | 'op'> & { m?: string };
  transactionMemo?: string;
}): TopicMessageSubmitTransaction {
  const payload: WASMConfig = {
    p: 'hcs-7',
    op: 'wasm',
    ...params.config,
    m: params.config.m ?? '',
  };
  return buildMessageTx({
    topicId: params.topicId,
    message: JSON.stringify(payload),
    transactionMemo: params.transactionMemo,
  });
}
