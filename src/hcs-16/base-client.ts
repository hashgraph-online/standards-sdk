import { HederaMirrorNode } from '../services/mirror-node';
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
  protected readonly mirrorNode: HederaMirrorNode;
  protected readonly logger: ILogger;

  constructor(params: { network: NetworkType; logger?: ILogger; mirrorNodeUrl?: string }) {
    this.network = params.network;
    this.logger = params.logger || new Logger({ level: 'info', module: 'HCS-16' });
    this.mirrorNode = new HederaMirrorNode(this.network, this.logger, {
      customUrl: params.mirrorNodeUrl,
    });
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
  protected createFloraMessage(op: string, operatorId: string, body?: Record<string, unknown>): FloraMessage {
    const payload: FloraMessage = {
      p: 'hcs-16',
      op: op as any,
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
    options?: { limit?: number; order?: 'asc' | 'desc'; opFilter?: FloraOperation | string },
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
    const items: HCSMessageWithCommonFields[] = await this.mirrorNode.getTopicMessages(
      topicId,
      { limit, order },
    );

    const results: Array<{
      message: FloraMessage;
      consensus_timestamp?: string;
      sequence_number: number;
      payer?: string;
    }> = [];

    for (const m of items) {
      if (m.p !== 'hcs-16') {
        continue;
      }
      if (options?.opFilter && m.op !== options.opFilter) {
        continue;
      }
      if (typeof m.operator_id !== 'string') {
        continue;
      }
      const envelope: FloraMessage = {
        p: 'hcs-16',
        op: m.op as FloraOperation,
        operator_id: m.operator_id,
        m: m.m,
      } as FloraMessage;
      results.push({
        message: envelope,
        consensus_timestamp: m.consensus_timestamp,
        sequence_number: Number(m.sequence_number),
        payer: m.payer,
      });
    }
    return results;
  }

  /**
   * Return the latest valid HCS‑16 message on a topic, if any.
   */
  async getLatestMessage(topicId: string, opFilter?: FloraOperation | string): Promise<
    | (FloraMessage & { consensus_timestamp?: string; sequence_number: number })
    | null
  > {
    const items = await this.getRecentMessages(topicId, { limit: 1, order: 'desc', opFilter });
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
