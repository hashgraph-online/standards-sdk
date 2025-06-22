/**
 * HCS-20 Points Indexer for state calculation
 * Handles async processing of HCS messages to build points state.
 * With larger topics, we do not recommend using this indexer, and
 * instead utilizing more scalable, database or redis based solutions.
 */

import { Logger } from '../utils/logger';
import { HederaMirrorNode } from '../services';
import { NetworkType } from '../utils/types';
import {
  PointsState,
  PointsInfo,
  HCS20Message,
  HCS20DeployMessage,
  HCS20MintMessage,
  HCS20TransferMessage,
  HCS20BurnMessage,
  HCS20_CONSTANTS,
} from './types';

/**
 * HCS-20 Points Indexer for processing and maintaining points state
 */
export class HCS20PointsIndexer {
  private logger: Logger;
  private mirrorNode: HederaMirrorNode;
  private state: PointsState;
  private isProcessing: boolean = false;
  private lastIndexedSequence: Map<string, number> = new Map();

  constructor(network: NetworkType, logger?: Logger, mirrorNodeUrl?: string) {
    this.logger =
      logger ||
      new Logger({
        level: 'info',
        module: 'HCS20PointsIndexer',
      });
    this.mirrorNode = new HederaMirrorNode(network, this.logger, {
      customUrl: mirrorNodeUrl,
    });
    this.state = this.initializeState();
  }

  /**
   * Initialize empty state
   */
  private initializeState(): PointsState {
    return {
      deployedPoints: new Map(),
      balances: new Map(),
      transactions: [],
      lastProcessedSequence: 0,
      lastProcessedTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Get current state snapshot
   */
  getState(): PointsState {
    return {
      ...this.state,
      deployedPoints: new Map(this.state.deployedPoints),
      balances: new Map(this.state.balances),
      transactions: [...this.state.transactions],
    };
  }

  /**
   * Get points info for a specific tick
   */
  getPointsInfo(tick: string): PointsInfo | undefined {
    return this.state.deployedPoints.get(this.normalizeTick(tick));
  }

  /**
   * Get balance for an account and tick
   */
  getBalance(tick: string, accountId: string): string {
    const normalizedTick = this.normalizeTick(tick);
    const tickBalances = this.state.balances.get(normalizedTick);
    if (!tickBalances) return '0';
    const balance = tickBalances.get(accountId);
    return balance?.balance || '0';
  }

  /**
   * Start indexing process
   */
  async startIndexing(options?: {
    publicTopicId?: string;
    registryTopicId?: string;
    privateTopics?: string[];
    pollInterval?: number;
  }): Promise<void> {
    if (this.isProcessing) {
      this.logger.warn('Indexing already in progress');
      return;
    }

    this.isProcessing = true;
    const publicTopicId =
      options?.publicTopicId || HCS20_CONSTANTS.PUBLIC_TOPIC_ID;
    const registryTopicId =
      options?.registryTopicId || HCS20_CONSTANTS.REGISTRY_TOPIC_ID;
    const pollInterval = options?.pollInterval || 30000;

    await this.indexTopics(
      publicTopicId,
      registryTopicId,
      options?.privateTopics,
    );

    const pollTopics = async () => {
      if (!this.isProcessing) return;
      try {
        await this.indexTopics(
          publicTopicId,
          registryTopicId,
          options?.privateTopics,
        );
      } catch (error) {
        this.logger.error('Polling error:', error);
      }
      if (this.isProcessing) {
        setTimeout(pollTopics, pollInterval);
      }
    };

    setTimeout(pollTopics, pollInterval);
  }

  /**
   * Index topics once and wait for completion
   */
  async indexOnce(options?: {
    publicTopicId?: string;
    registryTopicId?: string;
    privateTopics?: string[];
  }): Promise<void> {
    const publicTopicId =
      options?.publicTopicId || HCS20_CONSTANTS.PUBLIC_TOPIC_ID;
    const registryTopicId =
      options?.registryTopicId || HCS20_CONSTANTS.REGISTRY_TOPIC_ID;

    await this.indexTopics(
      publicTopicId,
      registryTopicId,
      options?.privateTopics,
    );
  }

  /**
   * Stop indexing process
   */
  stopIndexing(): void {
    this.isProcessing = false;
    this.logger.info('Indexing stopped');
  }

  /**
   * Index topics and update state
   */
  private async indexTopics(
    publicTopicId: string,
    registryTopicId: string,
    privateTopics?: string[],
  ): Promise<void> {
    this.logger.debug('Starting indexing cycle');
    await this.indexTopic(publicTopicId, false);
    const registeredTopics = await this.getRegisteredTopics(registryTopicId);
    const topicsToIndex = [...registeredTopics, ...(privateTopics || [])];
    for (const topicId of topicsToIndex) {
      await this.indexTopic(topicId, true);
    }

    this.logger.debug('Indexing cycle complete');
  }

  /**
   * Get registered topics from registry
   */
  private async getRegisteredTopics(
    registryTopicId: string,
  ): Promise<string[]> {
    const topics: string[] = [];
    try {
      const messages = await this.mirrorNode.getTopicMessages(registryTopicId, {
        limit: 100,
        order: 'asc',
      });

      for (const msg of messages) {
        try {
          const msgData = (msg as any).data || msg;
          if (
            msgData &&
            typeof msgData === 'object' &&
            msgData.p === 'hcs-20' &&
            msgData.op === 'register' &&
            msgData.t_id
          ) {
            topics.push(msgData.t_id);
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      this.logger.error('Failed to fetch registry messages:', error);
    }
    return topics;
  }

  /**
   * Index a single topic
   */
  private async indexTopic(topicId: string, isPrivate: boolean): Promise<void> {
    try {
      const lastSequence = this.lastIndexedSequence.get(topicId);
      this.logger.debug(
        `Indexing topic ${topicId}, starting from sequence ${lastSequence || 0}`,
      );

      const messages = await this.mirrorNode.getTopicMessages(topicId, {
        sequenceNumber: lastSequence ? lastSequence + 1 : undefined,
        limit: 1000,
        order: 'asc',
      });

      this.logger.debug(
        `Fetched ${messages.length} messages from topic ${topicId}`,
      );

      let maxSequence = lastSequence || 0;

      for (const msg of messages) {
        try {
          const messageData = msg as any;
          if (!messageData.p || messageData.p !== 'hcs-20') continue;

          const parsedMsg = messageData as HCS20Message;
          const sequenceNumber = messageData.sequence_number || 0;

          this.logger.debug(
            `Found HCS-20 message: op=${parsedMsg.op}, sequence=${sequenceNumber}`,
          );

          if (sequenceNumber > maxSequence) {
            maxSequence = sequenceNumber;
          }
          const topicMessage = {
            consensus_timestamp: messageData.consensus_timestamp || '',
            sequence_number: sequenceNumber,
            payer_account_id: messageData.payer_account_id || '',
            transaction_id: messageData.transaction_id || '',
          };
          this.processMessage(parsedMsg, topicMessage, topicId, isPrivate);

          this.state.lastProcessedSequence++;
          this.state.lastProcessedTimestamp =
            messageData.consensus_timestamp || '';
        } catch (error) {
          this.logger.debug(`Failed to process message: ${error}`);
          continue;
        }
      }
      if (maxSequence > (lastSequence || 0)) {
        this.lastIndexedSequence.set(topicId, maxSequence);
      }
    } catch (error) {
      this.logger.error(`Failed to index topic ${topicId}:`, error);
    }
  }

  /**
   * Process a single message
   */
  private processMessage(
    msg: HCS20Message,
    hcsMsg: any,
    topicId: string,
    isPrivate: boolean,
  ): void {
    switch (msg.op) {
      case 'deploy':
        this.processDeployMessage(msg, hcsMsg, topicId, isPrivate);
        break;
      case 'mint':
        this.processMintMessage(msg, hcsMsg, topicId, isPrivate);
        break;
      case 'transfer':
        this.processTransferMessage(msg, hcsMsg, topicId, isPrivate);
        break;
      case 'burn':
        this.processBurnMessage(msg, hcsMsg, topicId, isPrivate);
        break;
    }
  }

  /**
   * Process deploy message
   */
  private processDeployMessage(
    msg: HCS20DeployMessage,
    hcsMsg: any,
    topicId: string,
    isPrivate: boolean,
  ): void {
    const normalizedTick = this.normalizeTick(msg.tick);
    if (this.state.deployedPoints.has(normalizedTick)) {
      return;
    }
    const pointsInfo: PointsInfo = {
      name: msg.name,
      tick: normalizedTick,
      maxSupply: msg.max,
      limitPerMint: msg.lim,
      metadata: msg.metadata,
      topicId,
      deployerAccountId: hcsMsg.payer_account_id,
      currentSupply: '0',
      deploymentTimestamp: hcsMsg.consensus_timestamp,
      isPrivate,
    };

    this.state.deployedPoints.set(normalizedTick, pointsInfo);
    this.logger.info(`Deployed points: ${normalizedTick}`);
  }

  /**
   * Process mint message
   */
  private processMintMessage(
    msg: HCS20MintMessage,
    hcsMsg: any,
    topicId: string,
    isPrivate: boolean,
  ): void {
    const normalizedTick = this.normalizeTick(msg.tick);
    const pointsInfo = this.state.deployedPoints.get(normalizedTick);

    if (!pointsInfo) return;
    const mintAmount = BigInt(msg.amt);
    const currentSupply = BigInt(pointsInfo.currentSupply);
    const maxSupply = BigInt(pointsInfo.maxSupply);

    if (currentSupply + mintAmount > maxSupply) return;

    if (pointsInfo.limitPerMint && mintAmount > BigInt(pointsInfo.limitPerMint))
      return;
    pointsInfo.currentSupply = (currentSupply + mintAmount).toString();
    let tickBalances = this.state.balances.get(normalizedTick);
    if (!tickBalances) {
      tickBalances = new Map();
      this.state.balances.set(normalizedTick, tickBalances);
    }

    const currentBalance = tickBalances.get(msg.to);
    const newBalance = currentBalance
      ? (BigInt(currentBalance.balance) + mintAmount).toString()
      : msg.amt;

    tickBalances.set(msg.to, {
      tick: normalizedTick,
      accountId: msg.to,
      balance: newBalance,
      lastUpdated: hcsMsg.consensus_timestamp,
    });
    this.state.transactions.push({
      id: hcsMsg.transaction_id || `${topicId}-${hcsMsg.sequence_number}`,
      operation: 'mint',
      tick: normalizedTick,
      amount: msg.amt,
      to: msg.to,
      timestamp: hcsMsg.consensus_timestamp,
      sequenceNumber: hcsMsg.sequence_number,
      topicId,
      transactionId: hcsMsg.transaction_id || '',
      memo: msg.m,
    });
  }

  /**
   * Process transfer message
   */
  private processTransferMessage(
    msg: HCS20TransferMessage,
    hcsMsg: any,
    topicId: string,
    isPrivate: boolean,
  ): void {
    const normalizedTick = this.normalizeTick(msg.tick);
    const tickBalances = this.state.balances.get(normalizedTick);

    if (!tickBalances) return;
    if (!isPrivate && hcsMsg.payer_account_id !== msg.from) return;

    const senderBalance = tickBalances.get(msg.from);
    if (!senderBalance || BigInt(senderBalance.balance) < BigInt(msg.amt))
      return;
    const transferAmount = BigInt(msg.amt);

    senderBalance.balance = (
      BigInt(senderBalance.balance) - transferAmount
    ).toString();
    senderBalance.lastUpdated = hcsMsg.consensus_timestamp;

    const receiverBalance = tickBalances.get(msg.to);
    if (receiverBalance) {
      receiverBalance.balance = (
        BigInt(receiverBalance.balance) + transferAmount
      ).toString();
      receiverBalance.lastUpdated = hcsMsg.consensus_timestamp;
    } else {
      tickBalances.set(msg.to, {
        tick: normalizedTick,
        accountId: msg.to,
        balance: msg.amt,
        lastUpdated: hcsMsg.consensus_timestamp,
      });
    }
    this.state.transactions.push({
      id: hcsMsg.transaction_id || `${topicId}-${hcsMsg.sequence_number}`,
      operation: 'transfer',
      tick: normalizedTick,
      amount: msg.amt,
      from: msg.from,
      to: msg.to,
      timestamp: hcsMsg.consensus_timestamp,
      sequenceNumber: hcsMsg.sequence_number,
      topicId,
      transactionId: hcsMsg.transaction_id || '',
      memo: msg.m,
    });
  }

  /**
   * Process burn message
   */
  private processBurnMessage(
    msg: HCS20BurnMessage,
    hcsMsg: any,
    topicId: string,
    isPrivate: boolean,
  ): void {
    const normalizedTick = this.normalizeTick(msg.tick);
    const pointsInfo = this.state.deployedPoints.get(normalizedTick);
    const tickBalances = this.state.balances.get(normalizedTick);

    if (!pointsInfo || !tickBalances) return;
    if (!isPrivate && hcsMsg.payer_account_id !== msg.from) return;

    const accountBalance = tickBalances.get(msg.from);
    if (!accountBalance || BigInt(accountBalance.balance) < BigInt(msg.amt))
      return;
    const burnAmount = BigInt(msg.amt);

    accountBalance.balance = (
      BigInt(accountBalance.balance) - burnAmount
    ).toString();
    accountBalance.lastUpdated = hcsMsg.consensus_timestamp;

    pointsInfo.currentSupply = (
      BigInt(pointsInfo.currentSupply) - burnAmount
    ).toString();
    this.state.transactions.push({
      id: hcsMsg.transaction_id || `${topicId}-${hcsMsg.sequence_number}`,
      operation: 'burn',
      tick: normalizedTick,
      amount: msg.amt,
      from: msg.from,
      timestamp: hcsMsg.consensus_timestamp,
      sequenceNumber: hcsMsg.sequence_number,
      topicId,
      transactionId: hcsMsg.transaction_id || '',
      memo: msg.m,
    });
  }

  /**
   * Normalize tick to lowercase and trim
   */
  private normalizeTick(tick: string): string {
    return tick.toLowerCase().trim();
  }
}
