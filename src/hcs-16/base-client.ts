import { HederaMirrorNode } from '../services/mirror-node';
import { KeyList, TopicCreateTransaction, PublicKey } from '@hashgraph/sdk';
import { buildHcs16CreateFloraTopicTx } from './tx';
import { Logger, ILogger } from '../utils/logger';
import { NetworkType } from '../utils/types';
import { FloraTopicType, FloraMessage, FloraOperation } from './types';
import type { HCSMessageWithCommonFields } from '../services/types';

/**
 * Base client for HCS‑16 functionality. Provides logging, mirror‑node access,
 * memo helpers, and light message utilities shared by Node and Browser clients.
 */
export class HCS16BaseClient {
  protected readonly network: NetworkType;
  public mirrorNode: HederaMirrorNode;
  protected readonly logger: ILogger;

  constructor(params: {
    network: NetworkType;
    logger?: ILogger;
    mirrorNodeUrl?: string;
  }) {
    this.network = params.network;
    this.logger =
      params.logger || new Logger({ level: 'info', module: 'HCS-16' });
    this.mirrorNode = new HederaMirrorNode(this.network, this.logger, {
      customUrl: params.mirrorNodeUrl,
    });
  }

  async assembleKeyList(params: {
    members: string[];
    threshold: number;
  }): Promise<KeyList> {
    const keys: PublicKey[] = [];
    for (const accountId of params.members) {
      const pub = await this.mirrorNode.getPublicKey(accountId);
      keys.push(pub);
    }
    return new KeyList(keys, params.threshold);
  }

  async assembleSubmitKeyList(members: string[]): Promise<KeyList> {
    const keys: PublicKey[] = [];
    for (const accountId of members) {
      const pub = await this.mirrorNode.getPublicKey(accountId);
      keys.push(pub);
    }
    return new KeyList(keys, 1);
  }

  buildFloraTopicCreateTxs(params: {
    floraAccountId: string;
    keyList: KeyList;
    submitList: KeyList;
    autoRenewAccountId?: string;
  }): {
    communication: TopicCreateTransaction;
    transaction: TopicCreateTransaction;
    state: TopicCreateTransaction;
  } {
    const communication = buildHcs16CreateFloraTopicTx({
      floraAccountId: params.floraAccountId,
      topicType: FloraTopicType.COMMUNICATION,
      adminKey: params.keyList,
      submitKey: params.submitList,
      autoRenewAccountId: params.autoRenewAccountId,
    });
    const transaction = buildHcs16CreateFloraTopicTx({
      floraAccountId: params.floraAccountId,
      topicType: FloraTopicType.TRANSACTION,
      adminKey: params.keyList,
      submitKey: params.submitList,
      autoRenewAccountId: params.autoRenewAccountId,
    });
    const state = buildHcs16CreateFloraTopicTx({
      floraAccountId: params.floraAccountId,
      topicType: FloraTopicType.STATE,
      adminKey: params.keyList,
      submitKey: params.submitList,
      autoRenewAccountId: params.autoRenewAccountId,
    });
    return { communication, transaction, state };
  }

  /**
   * Parse an HCS‑16 Flora topic memo of the form `hcs-16:<floraAccountId>:<topicType>`.
   */
  parseTopicMemo(memo: string): {
    protocol: 'hcs-16';
    floraAccountId: string;
    topicType: FloraTopicType;
  } | null {
    const match = memo.match(/^hcs-16:([0-9.]+):(\d)$/);
    if (!match) {
      return null;
    }
    return {
      protocol: 'hcs-16',
      floraAccountId: match[1],
      topicType: Number(match[2]) as FloraTopicType,
    };
  }

  /**
   * Build a Flora message envelope by merging an operation body into the HCS‑16 envelope.
   */
  protected createFloraMessage(
    op: FloraOperation,
    operatorId: string,
    body?: Record<string, unknown>,
  ): FloraMessage {
    const payload: FloraMessage = {
      p: 'hcs-16',
      op,
      operator_id: operatorId,
      ...(body || {}),
    } as FloraMessage;
    return payload;
  }

  /**
   * Fetch recent HCS‑16 messages from a topic via Mirror Node.
   */
  async getRecentMessages(
    topicId: string,
    options?: {
      limit?: number;
      order?: 'asc' | 'desc';
      opFilter?: FloraOperation | string;
    },
  ): Promise<
    Array<{
      message: FloraMessage;
      consensus_timestamp?: string;
      sequence_number: number;
      payer?: string;
    }>
  > {
    const limit = options?.limit ?? 25;
    const order = options?.order ?? 'desc';
    const items: HCSMessageWithCommonFields[] =
      await this.mirrorNode.getTopicMessages(topicId, { limit, order });

    const results: Array<{
      message: FloraMessage;
      consensus_timestamp?: string;
      sequence_number: number;
      payer?: string;
    }> = [];

    for (const raw of items) {
      if (raw.p !== 'hcs-16') {
        continue;
      }

      const {
        consensus_timestamp,
        sequence_number,
        running_hash,
        running_hash_version,
        topic_id,
        payer,
        created,
        chunk_info,
        ...payload
      } = raw as unknown as Record<string, unknown>;

      const op = payload.op as FloraOperation | string | undefined;
      const operatorId = payload.operator_id as string | undefined;

      if (options?.opFilter && op !== options.opFilter) {
        continue;
      }
      if (typeof operatorId !== 'string') {
        continue;
      }

      const message = payload as unknown as FloraMessage;

      results.push({
        message,
        consensus_timestamp: consensus_timestamp as string | undefined,
        sequence_number: Number(sequence_number),
        payer: payer as string | undefined,
      });
    }
    return results;
  }

  /**
   * Return the latest valid HCS‑16 message on a topic, if any.
   */
  async getLatestMessage(
    topicId: string,
    opFilter?: FloraOperation | string,
  ): Promise<
    | (FloraMessage & { consensus_timestamp?: string; sequence_number: number })
    | null
  > {
    const items = await this.getRecentMessages(topicId, {
      limit: 1,
      order: 'desc',
      opFilter,
    });
    if (items.length === 0) {
      return null;
    }
    const first = items[0];
    return Object.assign({}, first.message, {
      consensus_timestamp: first.consensus_timestamp,
      sequence_number: first.sequence_number,
    });
  }
}
