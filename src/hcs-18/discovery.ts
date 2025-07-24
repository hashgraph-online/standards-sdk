import {
  TopicId,
  AccountId,
  Client,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import { HCS10BaseClient } from '../hcs-10/base-client';
import { HederaMirrorNode } from '../services/mirror-node';
import { Logger } from '../utils/logger';
import type { NetworkType } from '../utils/types';
import {
  DiscoveryConfig,
  DiscoveryState,
  DiscoveryMessage,
  DiscoveryOperation,
  AnnounceMessage,
  ProposeMessage,
  RespondMessage,
  CompleteMessage,
  WithdrawMessage,
  TrackedAnnouncement,
  TrackedProposal,
  FloraFormation,
  DiscoveryEvent,
  DiscoveryError,
  DiscoveryErrorCodes,
  AnnounceData,
  ProposeData,
  RespondData,
} from './types';
import { FloraAccountManager } from '../hcs-16/flora-account-manager';
import { PublicKey } from '@hashgraph/sdk';

/**
 * HCS-18 Flora Discovery Service
 */
export class FloraDiscovery {
  private state: DiscoveryState = DiscoveryState.IDLE;
  private config: DiscoveryConfig;
  private mirrorNode: HederaMirrorNode;
  private logger: Logger;
  private client?: Client;
  private floraClient?: FloraAccountManager;

  private lastSequenceNumber = 0;
  private announcements = new Map<number, TrackedAnnouncement>();
  private proposals = new Map<number, TrackedProposal>();
  private formations = new Map<number, FloraFormation>();
  private myAnnouncementSeq?: number;
  private eventEmitter?: (event: DiscoveryEvent) => void;
  private floraCreationInProgress = new Set<number>(); // Track proposals being processed

  constructor(
    config: DiscoveryConfig,
    baseClient: HCS10BaseClient,
    client?: Client,
    logger?: Logger,
  ) {
    this.config = config;
    this.mirrorNode = baseClient.mirrorNode;
    this.logger = logger || new Logger({ module: 'FloraDiscovery' });
    this.client = client;
    this.eventEmitter = config.onDiscoveryEvent;

    if (client) {
      this.floraClient = new FloraAccountManager(
        client,
        baseClient.network as NetworkType,
        this.logger,
      );
    }
  }

  /**
   * Start discovery service
   */
  async startDiscovery(): Promise<void> {
    if (this.state !== DiscoveryState.IDLE) {
      throw new DiscoveryError(
        'Discovery already started',
        DiscoveryErrorCodes.ALREADY_IN_DISCOVERY,
      );
    }

    this.logger.info('Starting Flora discovery');
    await this.syncDiscoveryTopic();
    this.state = DiscoveryState.ANNOUNCED;
  }

  /**
   * Announce Petal availability
   */
  async announceAvailability(validFor = 10000): Promise<number> {
    if (!this.client) {
      throw new DiscoveryError(
        'Client required for announcements',
        DiscoveryErrorCodes.INVALID_STATE,
      );
    }

    const message: AnnounceMessage = {
      p: 'hcs-18',
      op: DiscoveryOperation.ANNOUNCE,
      data: {
        account: this.config.accountId,
        petal: {
          name: this.config.petalName,
          priority: this.config.priority,
        },
        capabilities: this.config.capabilities,
        valid_for: validFor,
      },
    };

    const sequenceNumber = await this.sendDiscoveryMessage(message);
    this.myAnnouncementSeq = sequenceNumber;
    this.state = DiscoveryState.ANNOUNCED;

    this.emitEvent({
      type: 'announcement_received',
      sequenceNumber,
      timestamp: new Date(),
      data: message.data,
    });

    return sequenceNumber;
  }

  /**
   * Propose Flora formation
   */
  async proposeFloraFormation(
    memberAccounts: string[],
    config: {
      name: string;
      threshold: number;
      purpose?: string;
    },
  ): Promise<number> {
    if (!this.client) {
      throw new DiscoveryError(
        'Client required for proposals',
        DiscoveryErrorCodes.INVALID_STATE,
      );
    }

    const members = memberAccounts.map(account => {
      const announcement = Array.from(this.announcements.values()).find(
        a => a.account === account,
      );
      return {
        account,
        announce_seq: announcement?.sequenceNumber,
        priority: announcement?.data.petal.priority || 500,
      };
    });

    const proposeData: ProposeData = {
      proposer: this.config.accountId,
      members,
      config,
    };

    const message: ProposeMessage = {
      p: 'hcs-18',
      op: DiscoveryOperation.PROPOSE,
      data: proposeData,
    };

    const sequenceNumber = await this.sendDiscoveryMessage(message);
    this.state = DiscoveryState.PROPOSING;

    this.emitEvent({
      type: 'proposal_received',
      sequenceNumber,
      timestamp: new Date(),
      data: proposeData,
    });

    return sequenceNumber;
  }

  /**
   * Respond to Flora proposal
   */
  async respondToProposal(
    proposalSeq: number,
    decision: 'accept' | 'reject',
    reason?: string,
  ): Promise<void> {
    if (!this.client) {
      throw new DiscoveryError(
        'Client required for responses',
        DiscoveryErrorCodes.INVALID_STATE,
      );
    }

    await this.syncDiscoveryTopic();

    const proposal = this.proposals.get(proposalSeq);
    if (!proposal) {
      throw new DiscoveryError(
        `Proposal ${proposalSeq} not found`,
        DiscoveryErrorCodes.INVALID_MESSAGE,
      );
    }

    const responseData: RespondData = {
      responder: this.config.accountId,
      proposal_seq: proposalSeq,
      decision,
      reason,
    };

    const message: RespondMessage = {
      p: 'hcs-18',
      op: DiscoveryOperation.RESPOND,
      data: responseData,
    };

    await this.sendDiscoveryMessage(message);

    this.emitEvent({
      type: 'response_received',
      sequenceNumber: proposalSeq,
      timestamp: new Date(),
      data: responseData,
    });

    if (decision === 'accept') {
      this.state = DiscoveryState.FORMING;
    }
  }

  /**
   * Find compatible Petals for Flora formation
   */
  findCompatiblePetals(
    filters: {
      protocols?: string[];
      minPriority?: number;
      maxMembers?: number;
      resourceRequirements?: {
        compute?: 'high' | 'medium' | 'low';
        storage?: 'high' | 'medium' | 'low';
        bandwidth?: 'high' | 'medium' | 'low';
      };
    } = {},
  ): TrackedAnnouncement[] {
    const candidates = Array.from(this.announcements.values())
      .filter(announcement => {
        if (announcement.account === this.config.accountId) {
          return false;
        }

        if (filters.protocols?.length) {
          const hasCompatibleProtocol = filters.protocols.some(protocol =>
            announcement.data.capabilities.protocols.includes(protocol),
          );
          if (!hasCompatibleProtocol) return false;
        }

        if (
          filters.minPriority &&
          announcement.data.petal.priority < filters.minPriority
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) => b.data.petal.priority - a.data.petal.priority);

    return filters.maxMembers
      ? candidates.slice(0, filters.maxMembers)
      : candidates;
  }

  /**
   * Get current discovery state
   */
  getState(): DiscoveryState {
    return this.state;
  }

  /**
   * Get tracked announcements
   */
  getAnnouncements(): Map<number, TrackedAnnouncement> {
    return new Map(this.announcements);
  }

  /**
   * Get tracked proposals
   */
  getProposals(): Map<number, TrackedProposal> {
    return new Map(this.proposals);
  }

  /**
   * Get Flora formations
   */
  getFormations(): Map<number, FloraFormation> {
    return new Map(this.formations);
  }

  /**
   * Complete Flora formation (called by proposer)
   */
  async completeFloraFormation(
    proposalSeq: number,
    floraAccountId: string,
    topics: {
      communication: string;
      transaction: string;
      state: string;
    },
  ): Promise<void> {
    if (!this.client) {
      throw new DiscoveryError(
        'Client required for completion',
        DiscoveryErrorCodes.INVALID_STATE,
      );
    }

    const proposal = this.proposals.get(proposalSeq);
    if (!proposal) {
      throw new DiscoveryError(
        `Proposal ${proposalSeq} not found`,
        DiscoveryErrorCodes.INVALID_MESSAGE,
      );
    }

    const message: CompleteMessage = {
      p: 'hcs-18',
      op: DiscoveryOperation.COMPLETE,
      data: {
        proposer: this.config.accountId,
        proposal_seq: proposalSeq,
        flora_account: floraAccountId,
        topics,
      },
    };

    await this.sendDiscoveryMessage(message);

    const formation: FloraFormation = {
      proposalSeq,
      floraAccountId,
      topics,
      members: proposal.data.members.map(m => ({
        account: m.account,
        priority: m.priority,
      })),
      threshold: proposal.data.config.threshold,
      createdAt: new Date(),
    };

    this.formations.set(proposalSeq, formation);
    this.state = DiscoveryState.ACTIVE;

    this.emitEvent({
      type: 'formation_complete',
      sequenceNumber: proposalSeq,
      timestamp: new Date(),
      data: formation,
    });
  }

  /**
   * Withdraw from discovery
   */
  async withdraw(reason?: string): Promise<void> {
    if (!this.client || !this.myAnnouncementSeq) {
      throw new DiscoveryError(
        'No active announcement to withdraw',
        DiscoveryErrorCodes.INVALID_STATE,
      );
    }

    const message: WithdrawMessage = {
      p: 'hcs-18',
      op: DiscoveryOperation.WITHDRAW,
      data: {
        account: this.config.accountId,
        announce_seq: this.myAnnouncementSeq,
        reason,
      },
    };

    await this.sendDiscoveryMessage(message);
    this.state = DiscoveryState.WITHDRAWN;

    this.emitEvent({
      type: 'withdrawal_received',
      timestamp: new Date(),
      data: message.data,
    });
  }

  /**
   * Sync discovery topic and process messages
   */
  private async syncDiscoveryTopic(): Promise<void> {
    try {
      const messages = await this.mirrorNode.getTopicMessages(
        this.config.discoveryTopicId.toString(),
        {
          sequenceNumber: this.lastSequenceNumber + 1,
        },
      );

      for (const message of messages) {
        try {
          if (message.p !== 'hcs-18') {
            continue;
          }

          const discoveryMessage = message as unknown as DiscoveryMessage;
          await this.processDiscoveryMessage(
            discoveryMessage,
            message.sequence_number!,
          );
          this.lastSequenceNumber = message.sequence_number!;
        } catch (error) {
          if (error instanceof DiscoveryError && error.code === DiscoveryErrorCodes.FLORA_CREATION_FAILED) {
            return;
          }
        }
      }

    } catch (error) {
      this.logger.error('Failed to sync discovery topic', error);
    }
  }

  /**
   * Process discovered messages
   */
  private async processDiscoveryMessage(
    message: DiscoveryMessage,
    sequenceNumber: number,
  ): Promise<void> {
    switch (message.op) {
      case DiscoveryOperation.ANNOUNCE:
        await this.handleAnnouncement(
          message as AnnounceMessage,
          sequenceNumber,
        );
        break;
      case DiscoveryOperation.PROPOSE:
        await this.handleProposal(message as ProposeMessage, sequenceNumber);
        break;
      case DiscoveryOperation.RESPOND:
        await this.handleResponse(message as RespondMessage, sequenceNumber);
        break;
      case DiscoveryOperation.COMPLETE:
        await this.handleCompletion(message as CompleteMessage, sequenceNumber);
        break;
      case DiscoveryOperation.WITHDRAW:
        await this.handleWithdrawal(message as WithdrawMessage, sequenceNumber);
        break;
    }
  }

  /**
   * Handle announcement message
   */
  private async handleAnnouncement(
    message: AnnounceMessage,
    sequenceNumber: number,
  ): Promise<void> {
    const announcement: TrackedAnnouncement = {
      account: message.data.account,
      sequenceNumber,
      consensusTimestamp: new Date().toISOString(),
      data: message.data,
    };

    this.announcements.set(sequenceNumber, announcement);

    if (message.data.account === this.config.accountId) {
      return;
    }

    this.emitEvent({
      type: 'announcement_received',
      sequenceNumber,
      timestamp: new Date(),
      data: message.data,
    });
  }

  /**
   * Handle proposal message
   */
  private async handleProposal(
    message: ProposeMessage,
    sequenceNumber: number,
  ): Promise<void> {
    const proposal: TrackedProposal = {
      sequenceNumber,
      consensusTimestamp: new Date().toISOString(),
      proposer: message.data.proposer,
      data: message.data,
      responses: new Map(),
    };

    this.proposals.set(sequenceNumber, proposal);

    if (this.config.autoAcceptFilter?.(proposal)) {
      await this.respondToProposal(sequenceNumber, 'accept');
    }

    const isIncluded = message.data.members.some(
      m => m.account === this.config.accountId,
    );

    if (isIncluded) {
      this.emitEvent({
        type: 'proposal_received',
        sequenceNumber,
        timestamp: new Date(),
        data: message.data,
      });
    }
  }

  /**
   * Handle response message
   */
  private async handleResponse(
    message: RespondMessage,
    sequenceNumber: number,
  ): Promise<void> {
    const proposal = this.proposals.get(message.data.proposal_seq);
    if (proposal) {
      proposal.responses.set(message.data.responder, message.data);

      if (this.isProposalReady(proposal)) {
        if (
          proposal.data.proposer === this.config.accountId &&
          this.floraClient &&
          !this.floraCreationInProgress.has(message.data.proposal_seq)
        ) {
          this.floraCreationInProgress.add(message.data.proposal_seq);
          try {
            await this.createFloraFromProposal(proposal);
          } finally {
            this.floraCreationInProgress.delete(message.data.proposal_seq);
          }
        }
      }
    }

    this.emitEvent({
      type: 'response_received',
      sequenceNumber,
      timestamp: new Date(),
      data: message.data,
    });
  }

  /**
   * Handle completion message
   */
  private async handleCompletion(
    message: CompleteMessage,
    sequenceNumber: number,
  ): Promise<void> {
    const formation: FloraFormation = {
      proposalSeq: message.data.proposal_seq,
      floraAccountId: message.data.flora_account,
      topics: message.data.topics,
      members: [],
      threshold: 0,
      createdAt: new Date(),
    };

    if (this.isPartOfFormation(formation)) {
      this.state = DiscoveryState.ACTIVE;
    }

    this.formations.set(message.data.proposal_seq, formation);

    this.emitEvent({
      type: 'formation_complete',
      sequenceNumber,
      timestamp: new Date(),
      data: formation,
    });
  }

  /**
   * Handle withdrawal message
   */
  private async handleWithdrawal(
    message: WithdrawMessage,
    sequenceNumber: number,
  ): Promise<void> {
    this.announcements.delete(message.data.announce_seq);

    this.emitEvent({
      type: 'withdrawal_received',
      sequenceNumber,
      timestamp: new Date(),
      data: message.data,
    });
  }

  /**
   * Check if proposal has enough responses
   */
  private isProposalReady(proposal: TrackedProposal): boolean {
    const acceptances = Array.from(proposal.responses.values()).filter(
      r => r.decision === 'accept',
    );

    const requiredResponses = proposal.data.members.length - 1;
    return acceptances.length >= requiredResponses;
  }

  /**
   * Check if we're part of a Flora formation
   */
  private isPartOfFormation(formation: FloraFormation): boolean {
    return formation.members.some(m => m.account === this.config.accountId);
  }

  /**
   * Create Flora from accepted proposal
   */
  private async createFloraFromProposal(
    proposal: TrackedProposal,
  ): Promise<void> {
    if (!this.floraClient) {
      throw new DiscoveryError(
        'Flora client not available',
        DiscoveryErrorCodes.FLORA_CREATION_FAILED,
      );
    }

    try {
      const memberPubKeys = await Promise.all(
        proposal.data.members.map(async m => {
          const accountInfo = await this.mirrorNode.requestAccount(m.account);
          const privateKey = this.config.memberPrivateKeys?.get(m.account);
          return {
            accountId: m.account,
            publicKey: PublicKey.fromString(accountInfo.key.key),
            privateKey, // Include private key if available
          };
        }),
      );

      // Ensure at least the first member has a private key for profile creation
      if (!memberPubKeys[0].privateKey) {
        throw new DiscoveryError(
          'First member must have private key for Flora profile creation',
          DiscoveryErrorCodes.FLORA_CREATION_FAILED,
        );
      }

      const floraResult = await this.floraClient.createFlora({
        members: memberPubKeys,
        threshold: proposal.data.config.threshold,
        initialBalance: 10,
        displayName: proposal.data.config.name,
      });

      await this.completeFloraFormation(
        proposal.sequenceNumber,
        floraResult.floraAccountId.toString(),
        {
          communication: floraResult.topics.communication.toString(),
          transaction: floraResult.topics.transaction.toString(),
          state: floraResult.topics.state.toString(),
        },
      );
    } catch (error) {
      this.logger.error('Failed to create Flora', { error: error instanceof Error ? error.message : error });
      return;
    }
  }

  /**
   * Send message to discovery topic
   */
  private async sendDiscoveryMessage(
    message: DiscoveryMessage,
  ): Promise<number> {
    if (!this.client) {
      throw new DiscoveryError(
        'Client required for sending messages',
        DiscoveryErrorCodes.INVALID_STATE,
      );
    }

    const payload = JSON.stringify(message);

    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(this.config.discoveryTopicId)
      .setMessage(payload);

    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    return receipt.topicSequenceNumber.toNumber();
  }

  /**
   * Emit discovery event
   */
  private emitEvent(event: DiscoveryEvent): void {
    if (this.eventEmitter) {
      this.eventEmitter(event);
    }
  }
}

export { FloraDiscovery as HCS18Discovery };
