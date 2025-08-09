import { proto } from '@hashgraph/proto';
import { AccountId, Long, Transaction } from '@hashgraph/sdk';
import {
  ConsensusCreateTopicData,
  ConsensusSubmitMessageData,
  ConsensusUpdateTopicData,
  ConsensusDeleteTopicData,
} from '../transaction-parser-types';
import { parseKey } from './parser-utils';
import { Buffer } from 'buffer';

export class HCSParser {
  static parseConsensusCreateTopic(
    body: proto.IConsensusCreateTopicTransactionBody,
  ): ConsensusCreateTopicData | undefined {
    if (!body) return undefined;
    const data: ConsensusCreateTopicData = {};
    if (body.memo) {
      data.memo = body.memo;
    }
    data.adminKey = parseKey(body.adminKey);
    data.submitKey = parseKey(body.submitKey);
    if (body.autoRenewPeriod?.seconds) {
      data.autoRenewPeriod = Long.fromValue(
        body.autoRenewPeriod.seconds,
      ).toString();
    }
    if (body.autoRenewAccount) {
      data.autoRenewAccountId = new AccountId(
        body.autoRenewAccount.shardNum ?? 0,
        body.autoRenewAccount.realmNum ?? 0,
        body.autoRenewAccount.accountNum ?? 0,
      ).toString();
    }
    return data;
  }

  static parseConsensusSubmitMessage(
    body: proto.IConsensusSubmitMessageTransactionBody,
  ): ConsensusSubmitMessageData | undefined {
    if (!body) return undefined;
    const data: ConsensusSubmitMessageData = {};
    if (body.topicID) {
      data.topicId = `${body.topicID.shardNum ?? 0}.${
        body.topicID.realmNum ?? 0
      }.${body.topicID.topicNum ?? 0}`;
    }
    if (body.message?.length > 0) {
      const messageBuffer = Buffer.from(body.message);
      const utf8String = messageBuffer.toString('utf8');
      if (
        /[\x00-\x08\x0B\x0E-\x1F\x7F]/.test(utf8String) ||
        utf8String.includes('\uFFFD')
      ) {
        data.message = messageBuffer.toString('base64');
        data.messageEncoding = 'base64';
      } else {
        data.message = utf8String;
        data.messageEncoding = 'utf8';
      }
    }
    if (body.chunkInfo) {
      if (body.chunkInfo.initialTransactionID) {
        const txId = body.chunkInfo.initialTransactionID.accountID;
        const taValidStart =
          body.chunkInfo.initialTransactionID.transactionValidStart;
        if (txId && taValidStart) {
          data.chunkInfoInitialTransactionID = `${txId.shardNum ?? 0}.${
            txId.realmNum ?? 0
          }.${txId.accountNum ?? 0}@${taValidStart.seconds ?? 0}.${
            taValidStart.nanos ?? 0
          }`;
        }
      }
      if (
        body.chunkInfo.number !== undefined &&
        body.chunkInfo.number !== null
      ) {
        data.chunkInfoNumber = body.chunkInfo.number;
      }
      if (body.chunkInfo.total !== undefined && body.chunkInfo.total !== null) {
        data.chunkInfoTotal = body.chunkInfo.total;
      }
    }
    return data;
  }

  static parseConsensusUpdateTopic(
    body: proto.IConsensusUpdateTopicTransactionBody,
  ): ConsensusUpdateTopicData | undefined {
    if (!body) return undefined;
    const data: ConsensusUpdateTopicData = {};
    if (body.topicID) {
      data.topicId = `${body.topicID.shardNum}.${body.topicID.realmNum}.${body.topicID.topicNum}`;
    }
    if (body.memo?.value !== undefined) {
      data.memo = body.memo.value;
    }
    if (body.adminKey === null) {
      data.clearAdminKey = true;
      data.adminKey = undefined;
    } else if (body.adminKey) {
      data.adminKey = parseKey(body.adminKey);
    } else {
      data.adminKey = undefined;
    }
    if (body.submitKey === null) {
      data.clearSubmitKey = true;
      data.submitKey = undefined;
    } else if (body.submitKey) {
      data.submitKey = parseKey(body.submitKey);
    } else {
      data.submitKey = undefined;
    }
    if (body.autoRenewPeriod?.seconds) {
      data.autoRenewPeriod = Long.fromValue(
        body.autoRenewPeriod.seconds,
      ).toString();
    }
    if (body.autoRenewAccount) {
      data.autoRenewAccountId = new AccountId(
        body.autoRenewAccount.shardNum ?? 0,
        body.autoRenewAccount.realmNum ?? 0,
        body.autoRenewAccount.accountNum ?? 0,
      ).toString();
    }
    return data;
  }

  static parseConsensusDeleteTopic(
    body: proto.IConsensusDeleteTopicTransactionBody,
  ): ConsensusDeleteTopicData | undefined {
    if (!body) return undefined;
    const data: ConsensusDeleteTopicData = {};
    if (body.topicID) {
      data.topicId = `${body.topicID.shardNum}.${body.topicID.realmNum ?? 0}.${
        body.topicID.topicNum ?? 0
      }`;
    }
    return data;
  }

  /**
   * Parse HCS transaction from Transaction object with comprehensive extraction
   * This is the unified entry point that handles both protobuf and internal field extraction
   */
  static parseFromTransactionObject(transaction: Transaction): {
    type?: string;
    humanReadableType?: string;
    [key: string]: unknown;
  } {
    try {
      const transactionBody = (transaction as unknown as { _transactionBody?: unknown })._transactionBody as proto.ITransactionBody | undefined;

      if (!transactionBody) {
        return {};
      }

      if (transactionBody.consensusCreateTopic) {
        const consensusCreateTopic = this.parseConsensusCreateTopic(transactionBody.consensusCreateTopic);
        if (consensusCreateTopic) {
          return {
            type: 'TOPICCREATE',
            humanReadableType: 'Topic Create',
            consensusCreateTopic,
          };
        }
      }

      if (transactionBody.consensusSubmitMessage) {
        const consensusSubmitMessage = this.parseConsensusSubmitMessage(transactionBody.consensusSubmitMessage);
        if (consensusSubmitMessage) {
          return {
            type: 'CONSENSUSSUBMITMESSAGE',
            humanReadableType: 'Submit Message',
            consensusSubmitMessage,
          };
        }
      }

      if (transactionBody.consensusUpdateTopic) {
        const consensusUpdateTopic = this.parseConsensusUpdateTopic(transactionBody.consensusUpdateTopic);
        if (consensusUpdateTopic) {
          return {
            type: 'TOPICUPDATE',
            humanReadableType: 'Topic Update',
            consensusUpdateTopic,
          };
        }
      }

      if (transactionBody.consensusDeleteTopic) {
        const consensusDeleteTopic = this.parseConsensusDeleteTopic(transactionBody.consensusDeleteTopic);
        if (consensusDeleteTopic) {
          return {
            type: 'TOPICDELETE',
            humanReadableType: 'Topic Delete',
            consensusDeleteTopic,
          };
        }
      }

      return {};
    } catch (error) {
      return {};
    }
  }
}
