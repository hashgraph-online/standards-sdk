import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  PublicKey,
  KeyList,
} from '@hashgraph/sdk';
import {
  buildTopicCreateTx,
  buildMessageTx,
  MaybeKey,
} from '../common/tx/tx-utils';
import type {
  ActionRegistration,
  AssemblyRegistration,
  AssemblyAddBlock,
  AssemblyAddAction,
  AssemblyUpdate,
} from './types';

export type Hcs12RegistryType = 'action' | 'assembly' | 'hashlinks';

function memoForHcs12(registry: Hcs12RegistryType, ttl: number): string {
  const typeMap: Record<Hcs12RegistryType, number> = {
    action: 0,
    assembly: 2,
    hashlinks: 3,
  };
  const typeEnum = typeMap[registry];
  return `hcs-12:1:${ttl}:${typeEnum}`;
}

export function buildHcs12CreateRegistryTopicTx(params: {
  registry: Hcs12RegistryType;
  ttl: number;
  adminKey?: MaybeKey;
  submitKey?: MaybeKey;
  memoOverride?: string;
  operatorPublicKey?: PublicKey;
}): TopicCreateTransaction {
  const memo = params.memoOverride ?? memoForHcs12(params.registry, params.ttl);
  return buildTopicCreateTx({
    memo,
    adminKey: params.adminKey,
    submitKey: params.submitKey,
    operatorPublicKey: params.operatorPublicKey,
  });
}

export function buildHcs12SubmitMessageTx(params: {
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

export function buildHcs12RegisterAssemblyTx(params: {
  assemblyTopicId: string;
  registration: AssemblyRegistration;
}): TopicMessageSubmitTransaction {
  return buildMessageTx({
    topicId: params.assemblyTopicId,
    message: JSON.stringify(params.registration),
  });
}

export function buildHcs12AddBlockToAssemblyTx(params: {
  assemblyTopicId: string;
  operation: AssemblyAddBlock;
}): TopicMessageSubmitTransaction {
  return buildMessageTx({
    topicId: params.assemblyTopicId,
    message: JSON.stringify(params.operation),
  });
}

export function buildHcs12AddActionToAssemblyTx(params: {
  assemblyTopicId: string;
  operation: AssemblyAddAction;
}): TopicMessageSubmitTransaction {
  return buildMessageTx({
    topicId: params.assemblyTopicId,
    message: JSON.stringify(params.operation),
  });
}

export function buildHcs12UpdateAssemblyTx(params: {
  assemblyTopicId: string;
  operation: AssemblyUpdate;
}): TopicMessageSubmitTransaction {
  return buildMessageTx({
    topicId: params.assemblyTopicId,
    message: JSON.stringify(params.operation),
  });
}
