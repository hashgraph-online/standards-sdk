import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  PublicKey,
} from '@hashgraph/sdk';
import {
  buildMessageTx,
  buildTopicCreateTx,
  MaybeKey,
} from '../common/tx/tx-utils';
import {
  HCS7ConfigType,
  HCS7EvmConfigMessage,
  HCS7Message,
  HCS7Operation,
  HCS7RegisterConfigInput,
  HCS7WasmConfigMessage,
} from './types';

export function buildHcs7CreateRegistryTx(params: {
  ttl: number;
  submitKey?: MaybeKey;
  adminKey?: MaybeKey;
  operatorPublicKey?: PublicKey;
}): TopicCreateTransaction {
  const memo = `hcs-7:indexed:${params.ttl}`;
  return buildTopicCreateTx({
    memo,
    submitKey: params.submitKey,
    adminKey: params.adminKey,
    operatorPublicKey: params.operatorPublicKey,
  });
}

export function buildHcs7SubmitMessageTx(params: {
  topicId: string;
  message: HCS7Message;
  transactionMemo?: string;
}): TopicMessageSubmitTransaction {
  const payload = {
    p: 'hcs-7',
    ...params.message,
  } as HCS7Message;
  return buildMessageTx({
    topicId: params.topicId,
    message: JSON.stringify(payload),
    transactionMemo: params.transactionMemo,
  });
}

export function buildHcs7EvmMessageTx(params: {
  topicId: string;
  config: HCS7RegisterConfigInput & { type: HCS7ConfigType.EVM; memo?: string };
  transactionMemo?: string;
}): TopicMessageSubmitTransaction {
  const payload: HCS7EvmConfigMessage = {
    p: 'hcs-7',
    op: HCS7Operation.REGISTER_CONFIG,
    t: HCS7ConfigType.EVM,
    c: {
      contractAddress: params.config.contractAddress,
      abi: params.config.abi,
    },
    m: params.config.memo ?? '',
  };
  return buildHcs7SubmitMessageTx({
    topicId: params.topicId,
    message: payload,
    transactionMemo: params.transactionMemo,
  });
}

export function buildHcs7WasmMessageTx(params: {
  topicId: string;
  config: HCS7RegisterConfigInput & {
    type: HCS7ConfigType.WASM;
    memo?: string;
  };
  transactionMemo?: string;
}): TopicMessageSubmitTransaction {
  const payload: HCS7WasmConfigMessage = {
    p: 'hcs-7',
    op: HCS7Operation.REGISTER_CONFIG,
    t: HCS7ConfigType.WASM,
    c: {
      wasmTopicId: params.config.wasmTopicId,
      inputType: params.config.inputType,
      outputType: params.config.outputType,
    },
    m: params.config.memo ?? '',
  };
  return buildHcs7SubmitMessageTx({
    topicId: params.topicId,
    message: payload,
    transactionMemo: params.transactionMemo,
  });
}
