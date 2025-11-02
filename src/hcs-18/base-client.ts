import { Logger, type ILogger } from '../utils/logger';
import { HederaMirrorNode } from '../services/mirror-node';
import type { NetworkType } from '../utils/types';
import type { HCSMessageWithCommonFields } from '../services/types';
import type { TrackedProposal } from './types';

export interface HCS18BaseConfig {
  network: NetworkType;
  logger?: ILogger;
}

export abstract class HCS18BaseClient {
  protected readonly logger: ILogger;
  public readonly mirrorNode: HederaMirrorNode;
  public readonly network: NetworkType;

  constructor(config: HCS18BaseConfig) {
    this.network = config.network;
    this.logger = config.logger || Logger.getInstance({ module: 'HCS-18' });
    this.mirrorNode = new HederaMirrorNode(this.network, this.logger);
  }

  /**
   * Retrieves HCS-18 discovery messages from a topic, filtered to valid operations.
   */
  public async getDiscoveryMessages(
    topicId: string,
    options?: {
      sequenceNumber?: string | number;
      limit?: number;
      order?: 'asc' | 'desc';
    },
  ): Promise<HCSMessageWithCommonFields[]> {
    const validOps = ['announce', 'propose', 'respond', 'complete', 'withdraw'];
    const messages = await this.mirrorNode.getTopicMessages(topicId, options);
    if (!messages) {
      return [];
    }
    return messages.filter(m => m.p === 'hcs-18' && validOps.includes(m.op));
  }

  /**
   * Determines if a proposal has sufficient acceptances to proceed.
   */
  public isProposalReady(proposal: TrackedProposal): boolean {
    const acceptances = Array.from(proposal.responses.values()).filter(
      r => r.decision === 'accept',
    );
    const requiredResponses = proposal.data.members.length - 1;
    return acceptances.length >= requiredResponses;
  }
}
