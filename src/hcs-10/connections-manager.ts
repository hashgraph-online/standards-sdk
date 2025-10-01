import { Logger, LoggerOptions, ILogger } from '../utils/logger';
import { HCS10BaseClient } from './base-client';
import { AIAgentProfile } from '../hcs-11';
import { TransactMessage } from './types';
import { HCSMessageWithCommonFields } from '../services/types';

/**
 * Represents a connection request between agents
 */
export interface ConnectionRequest {
  id: number;
  requesterId: string;
  requesterTopicId: string;
  targetAccountId: string;
  targetTopicId: string;
  operatorId: string;
  sequenceNumber: number;
  created: Date;
  memo?: string;
  status: 'pending' | 'confirmed' | 'rejected';
}

/**
 * Represents an active connection between agents
 */
export interface Connection {
  connectionTopicId: string;
  targetAccountId: string;
  targetAgentName?: string;
  targetInboundTopicId?: string;
  targetOutboundTopicId?: string;
  status: 'pending' | 'established' | 'needs_confirmation' | 'closed';
  isPending: boolean;
  needsConfirmation: boolean;
  memo?: string;
  created: Date;
  lastActivity?: Date;
  profileInfo?: AIAgentProfile;
  connectionRequestId?: number;
  confirmedRequestId?: number;
  requesterOutboundTopicId?: string;
  inboundRequestId?: number;
  closedReason?: string;
  closeMethod?: string;
  uniqueRequestKey?: string;
  originTopicId?: string;
  processed: boolean;
}

/**
 * Options for the connections manager
 */
export interface ConnectionsManagerOptions {
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  filterPendingAccountIds?: string[];
  baseClient: HCS10BaseClient;
  silent?: boolean;
}

/**
 * Defines the interface for a connections manager that handles HCS-10 connections
 * This interface represents the public API of ConnectionsManager
 */
export interface IConnectionsManager {
  /**
   * Fetches and processes connection data using the configured client
   * @param accountId - The account ID to fetch connection data for
   * @returns A promise that resolves to an array of Connection objects
   */
  fetchConnectionData(accountId: string): Promise<Connection[]>;

  /**
   * Process outbound messages to track connection requests and confirmations
   * @param messages - The messages to process
   * @param accountId - The account ID that sent the messages
   * @returns Array of connections after processing
   */
  processOutboundMessages(
    messages: HCSMessageWithCommonFields[],
    accountId: string,
  ): Connection[];

  /**
   * Process inbound messages to track connection requests and confirmations
   * @param messages - The messages to process
   * @returns Array of connections after processing
   */
  processInboundMessages(messages: HCSMessageWithCommonFields[]): Connection[];

  /**
   * Process connection topic messages to update last activity time
   * @param connectionTopicId - The topic ID of the connection
   * @param messages - The messages to process
   * @returns The updated connection or undefined if not found
   */
  processConnectionMessages(
    connectionTopicId: string,
    messages: HCSMessageWithCommonFields[],
  ): Connection | undefined;

  /**
   * Adds or updates profile information for a connection
   * @param accountId - The account ID to add profile info for
   * @param profile - The profile information
   */
  addProfileInfo(accountId: string, profile: AIAgentProfile): void;

  /**
   * Gets all connections
   * @returns Array of all connections that should be visible
   */
  getAllConnections(): Connection[];

  /**
   * Gets all pending connection requests
   * @returns Array of pending connection requests
   */
  getPendingRequests(): Connection[];

  /**
   * Gets all active (established) connections
   * @returns Array of active connections
   */
  getActiveConnections(): Connection[];

  /**
   * Gets all connections needing confirmation
   * @returns Array of connections needing confirmation
   */
  getConnectionsNeedingConfirmation(): Connection[];

  /**
   * Gets a connection by its topic ID
   * @param connectionTopicId - The topic ID to look up
   * @returns The connection with the given topic ID, or undefined if not found
   */
  getConnectionByTopicId(connectionTopicId: string): Connection | undefined;

  /**
   * Gets a connection by account ID
   * @param accountId - The account ID to look up
   * @returns The connection with the given account ID, or undefined if not found
   */
  getConnectionByAccountId(accountId: string): Connection | undefined;

  /**
   * Gets all connections for a specific account ID
   * @param accountId - The account ID to look up
   * @returns Array of connections for the given account ID
   */
  getConnectionsByAccountId(accountId: string): Connection[];

  /**
   * Updates or adds a connection
   * @param connection - The connection to update or add
   */
  updateOrAddConnection(connection: Connection): void;

  /**
   * Clears all tracked connections and requests
   */
  clearAll(): void;

  /**
   * Checks if a given connection request has been processed already
   * This uses a combination of topic ID and request ID to uniquely identify requests
   *
   * @param inboundTopicId - The inbound topic ID where the request was received
   * @param requestId - The sequence number (request ID)
   * @returns True if this specific request has been processed, false otherwise
   */
  isConnectionRequestProcessed(
    inboundTopicId: string,
    requestId: number,
  ): boolean;

  /**
   * Marks a specific connection request as processed
   *
   * @param inboundTopicId - The inbound topic ID where the request was received
   * @param requestId - The sequence number (request ID)
   * @returns True if a matching connection was found and marked, false otherwise
   */
  markConnectionRequestProcessed(
    inboundTopicId: string,
    requestId: number,
  ): boolean;

  /**
   * Gets pending transactions from a specific connection
   * @param connectionTopicId - The connection topic ID to check for transactions
   * @param options - Optional filtering and retrieval options
   * @returns Array of pending transaction messages sorted by timestamp (newest first)
   */
  getPendingTransactions(
    connectionTopicId: string,
    options?: {
      limit?: number;
      sequenceNumber?: string | number;
      order?: 'asc' | 'desc';
    },
  ): Promise<TransactMessage[]>;

  /**
   * Gets the status of a scheduled transaction
   * @param scheduleId - The schedule ID to check
   * @returns Status of the scheduled transaction
   */
  getScheduledTransactionStatus(scheduleId: string): Promise<{
    executed: boolean;
    executedTimestamp?: string;
    deleted: boolean;
    expirationTime?: string;
  }>;

  /**
   * Gets the timestamp of the last message sent by the specified operator on the connection topic
   * @param connectionTopicId - The topic ID to check
   * @param operatorAccountId - The account ID of the operator
   * @returns The timestamp of the last message or undefined if no messages found
   */
  getLastOperatorActivity(
    connectionTopicId: string,
    operatorAccountId: string,
  ): Promise<Date | undefined>;
}

/**
 * ConnectionsManager provides a unified way to track and manage HCS-10 connections
 * across different applications. It works with both frontend and backend implementations.
 */
export class ConnectionsManager implements IConnectionsManager {
  private logger: ILogger;
  private connections: Map<string, Connection> = new Map();
  private pendingRequests: Map<string, ConnectionRequest> = new Map();
  private profileCache: Map<string, AIAgentProfile> = new Map();
  private filterPendingAccountIds: Set<string> = new Set();
  private baseClient: HCS10BaseClient;

  /**
   * Creates a new ConnectionsManager instance
   */
  constructor(options: ConnectionsManagerOptions) {
    const loggerOptions: LoggerOptions = {
      module: 'ConnectionsManager',
      level: options?.logLevel || 'info',
      prettyPrint: true,
      silent: options?.silent,
    };
    this.logger = Logger.getInstance(loggerOptions);

    if (options?.filterPendingAccountIds) {
      this.filterPendingAccountIds = new Set(options.filterPendingAccountIds);
    }

    if (!options.baseClient) {
      throw new Error('ConnectionsManager requires a baseClient to operate');
    }

    this.baseClient = options.baseClient;
  }

  /**
   * Fetches and processes connection data using the configured client
   * @param accountId - The account ID to fetch connection data for
   * @returns A promise that resolves to an array of Connection objects
   */
  async fetchConnectionData(accountId: string): Promise<Connection[]> {
    try {
      const topicInfo =
        await this.baseClient.retrieveCommunicationTopics(accountId);

      const isValidTopicId = (topicId: string): boolean => {
        return Boolean(topicId) && !topicId.includes(':');
      };

      if (
        !isValidTopicId(topicInfo?.inboundTopic) ||
        !isValidTopicId(topicInfo?.outboundTopic)
      ) {
        this.logger.warn(
          'Invalid topic IDs detected in retrieved communication topics',
        );
        return this.getAllConnections();
      }

      const [outboundMessagesResult, inboundMessagesResult] = await Promise.all(
        [
          this.baseClient.getMessages(topicInfo?.outboundTopic),
          this.baseClient.getMessages(topicInfo?.inboundTopic),
        ],
      );

      this.processOutboundMessages(
        outboundMessagesResult.messages || [],
        accountId,
      );
      this.processInboundMessages(inboundMessagesResult.messages || []);

      const pendingCount = Array.from(this.connections.values()).filter(
        conn => conn.status === 'pending' || conn.isPending,
      ).length;
      this.logger.debug(
        `Processed ${
          outboundMessagesResult.messages?.length || 0
        } outbound and ${
          inboundMessagesResult.messages?.length || 0
        } inbound messages. Found ${pendingCount} pending connections.`,
      );

      await this.checkTargetInboundTopicsForConfirmations();
      await this.checkOutboundRequestsForConfirmations();
      await this.fetchProfilesForConnections();
      await this.fetchConnectionActivity();

      return this.getAllConnections();
    } catch (error) {
      this.logger.error('Error fetching connection data:', error);
      return this.getAllConnections();
    }
  }

  /**
   * Checks target agent inbound topics to find confirmations for pending requests
   * that might not be visible in our local messages
   */
  private async checkTargetInboundTopicsForConfirmations(): Promise<void> {
    const pendingConnections = Array.from(this.connections.values()).filter(
      conn =>
        (conn.isPending || conn.status === 'pending') &&
        conn.targetInboundTopicId,
    );

    if (pendingConnections.length === 0) {
      return;
    }

    const pendingRequestsByTarget = new Map<string, Connection[]>();

    pendingConnections.forEach(conn => {
      if (conn.targetInboundTopicId) {
        const requests =
          pendingRequestsByTarget.get(conn.targetInboundTopicId) || [];
        requests.push(conn);
        pendingRequestsByTarget.set(conn.targetInboundTopicId, requests);
      }
    });

    const MAX_FETCH_ATTEMPTS = 2;
    const FETCH_DELAY_MS = 500;

    for (const [
      targetInboundTopicId,
      requests,
    ] of pendingRequestsByTarget.entries()) {
      for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
        try {
          const targetMessagesResult =
            await this.baseClient.getMessages(targetInboundTopicId);
          const targetMessages = targetMessagesResult.messages || [];

          let confirmedAny = false;

          for (const conn of requests) {
            const requestId = conn.connectionRequestId;
            if (!requestId) {
              continue;
            }

            const confirmationMsg = targetMessages.find(msg => {
              if (msg.op !== 'connection_created' || !msg.connection_topic_id) {
                return false;
              }

              if (msg.connection_id !== requestId) {
                return false;
              }

              if (conn.uniqueRequestKey) {
                const keyParts = conn.uniqueRequestKey.split(':');
                if (keyParts.length > 1) {
                  const operatorIdPart = keyParts[1];

                  if (msg.operator_id && msg.operator_id === operatorIdPart) {
                    return true;
                  }

                  if (msg.connected_account_id === conn.targetAccountId) {
                    return true;
                  }
                }
              }

              return true;
            });

            if (confirmationMsg?.connection_topic_id) {
              confirmedAny = true;

              const connectionTopicId = confirmationMsg.connection_topic_id;

              let pendingKey = conn.uniqueRequestKey;

              const newConnection: Connection = {
                connectionTopicId,
                targetAccountId: conn.targetAccountId,
                targetAgentName: conn.targetAgentName,
                targetInboundTopicId: conn.targetInboundTopicId,
                status: 'established',
                isPending: false,
                needsConfirmation: false,
                created: new Date(confirmationMsg.created || conn.created),
                profileInfo: conn.profileInfo,
                connectionRequestId: requestId,
                uniqueRequestKey: conn.uniqueRequestKey,
                originTopicId: conn.originTopicId,
                processed: conn.processed,
                memo: conn.memo,
              };

              this.connections.set(connectionTopicId, newConnection);

              if (pendingKey) {
                this.connections.delete(pendingKey);
              }

              this.logger.debug(
                `Confirmed connection in target inbound topic: ${connectionTopicId}`,
              );
            }
          }

          if (confirmedAny || attempt === MAX_FETCH_ATTEMPTS) {
            break;
          }

          await new Promise(resolve => setTimeout(resolve, FETCH_DELAY_MS));
        } catch (error) {
          this.logger.debug(
            `Error fetching target inbound topic ${targetInboundTopicId}:`,
            error,
          );
          if (attempt === MAX_FETCH_ATTEMPTS) {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, FETCH_DELAY_MS));
        }
      }
    }
  }

  /**
   * Checks target agents' inbound topics for confirmations of our outbound connection requests
   * This complements checkTargetInboundTopicsForConfirmations by looking for confirmations
   * that might have been sent to the target agent's inbound topic rather than our own
   */
  private async checkOutboundRequestsForConfirmations(): Promise<void> {
    const allConnections = Array.from(this.connections.values());
    this.logger.info(`Total connections in map: ${allConnections.length}`);

    const pendingByStatus = allConnections.filter(
      conn => conn.status === 'pending',
    );
    this.logger.info(
      `Connections with status='pending': ${pendingByStatus.length}`,
    );

    const pendingConnections = allConnections.filter(
      conn => conn.status === 'pending',
    );

    if (!Boolean(pendingConnections?.length)) {
      this.logger.info('No pending connections found');
      return;
    }

    for (const conn of pendingConnections) {
      this.logger.debug(
        `Processing pending connection: ${conn.connectionTopicId}`,
      );

      if (!conn.targetAccountId) {
        this.logger.debug(
          `Skipping connection ${conn.connectionTopicId} - no targetAccountId`,
        );
        continue;
      }

      let targetInboundTopicId = conn.targetInboundTopicId;
      if (!targetInboundTopicId) {
        try {
          const profileResponse = await this.baseClient.retrieveProfile(
            conn.targetAccountId,
          );
          if (profileResponse?.profile?.inboundTopicId) {
            targetInboundTopicId = profileResponse.profile.inboundTopicId;
            this.connections.set(conn.connectionTopicId, {
              ...conn,
              targetInboundTopicId,
            });
            this.logger.debug(
              `Updated connection ${conn.connectionTopicId} with inbound topic ID: ${targetInboundTopicId}`,
            );
          } else {
            this.logger.debug(
              `Couldn't get inbound topic ID for account ${conn.targetAccountId}`,
            );
            continue;
          }
        } catch (error) {
          this.logger.debug(
            `Error fetching profile for ${conn.targetAccountId}: ${error}`,
          );
          continue;
        }
      }

      if (!targetInboundTopicId || targetInboundTopicId.includes(':')) {
        this.logger.debug(
          `Skipping invalid inbound topic format: ${targetInboundTopicId}`,
        );
        continue;
      }

      const requestId = conn.connectionRequestId || conn.inboundRequestId;
      if (!requestId) {
        this.logger.debug(
          `Skipping connection ${conn.connectionTopicId} - no request ID`,
        );
        continue;
      }

      try {
        this.logger.debug(
          `Checking for confirmations on topic ${targetInboundTopicId} for request ID ${requestId}`,
        );
        const targetMessagesResult =
          await this.baseClient.getMessages(targetInboundTopicId);
        const targetMessages = targetMessagesResult.messages || [];

        const confirmationMsg = targetMessages.find(
          msg =>
            msg.op === 'connection_created' &&
            msg.connection_id === requestId &&
            msg.connection_topic_id,
        );

        if (confirmationMsg?.connection_topic_id) {
          const connectionTopicId = confirmationMsg.connection_topic_id;
          this.logger.info(
            `Found confirmation for request #${requestId} to ${conn.targetAccountId} on their inbound topic`,
          );

          const newConnection: Connection = {
            connectionTopicId,
            targetAccountId: conn.targetAccountId,
            targetAgentName: conn.targetAgentName,
            targetInboundTopicId: conn.targetInboundTopicId,
            targetOutboundTopicId: conn.targetOutboundTopicId,
            status: 'established',
            isPending: false,
            needsConfirmation: false,
            created: new Date(confirmationMsg.created || conn.created),
            lastActivity: new Date(confirmationMsg.created || conn.created),
            profileInfo: conn.profileInfo,
            connectionRequestId: conn.connectionRequestId,
            confirmedRequestId: conn.confirmedRequestId,
            requesterOutboundTopicId: conn.requesterOutboundTopicId,
            inboundRequestId: conn.inboundRequestId,
            closedReason: conn.closedReason,
            closeMethod: conn.closeMethod,
            uniqueRequestKey: conn.uniqueRequestKey,
            originTopicId: conn.originTopicId,
            processed: conn.processed,
            memo: conn.memo,
          };

          this.connections.set(connectionTopicId, newConnection);

          if (conn.connectionTopicId) {
            this.connections.delete(conn.connectionTopicId);
          }
        } else {
          this.logger.debug(
            `No confirmation found for request ID ${requestId} on topic ${targetInboundTopicId}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Error checking for confirmations on target inbound topic for ${conn.targetAccountId}: ${error}`,
        );
      }
    }
  }

  /**
   * Fetches profiles for all connected accounts
   * @param accountId - The account ID making the request
   */
  private async fetchProfilesForConnections(): Promise<void> {
    const targetAccountIds = new Set<string>();

    for (const connection of this.connections.values()) {
      if (
        connection.targetAccountId &&
        !this.profileCache.has(connection.targetAccountId)
      ) {
        targetAccountIds.add(connection.targetAccountId);
      }
    }

    const accountIdPromises = Array.from(targetAccountIds).map(
      async targetId => {
        try {
          const profileResponse =
            await this.baseClient.retrieveProfile(targetId);
          if (profileResponse.success && profileResponse.profile) {
            this.addProfileInfo(targetId, profileResponse.profile);

            this.updatePendingConnectionsWithProfileInfo(
              targetId,
              profileResponse.profile,
            );
          }
        } catch (error) {
          this.logger.debug(`Failed to fetch profile for ${targetId}:`, error);
        }
      },
    );

    await Promise.allSettled(accountIdPromises);
  }

  /**
   * Updates pending connections with inbound topic IDs from profile info
   * @param accountId - The account ID to update connections for
   * @param profile - The profile containing the inbound topic ID
   */
  private updatePendingConnectionsWithProfileInfo(
    accountId: string,
    profile: AIAgentProfile,
  ): void {
    const pendingConnections = Array.from(this.connections.values()).filter(
      conn =>
        conn.targetAccountId === accountId &&
        (conn.isPending || conn.needsConfirmation) &&
        !conn.targetInboundTopicId,
    );

    if (pendingConnections.length > 0 && profile.inboundTopicId) {
      for (const conn of pendingConnections) {
        const updatedConn = {
          ...conn,
          targetInboundTopicId: profile.inboundTopicId,
        };
        this.connections.set(conn.connectionTopicId, updatedConn);
      }
    }
  }

  /**
   * Fetches activity from active connection topics
   * Updates the lastActivity timestamp for each connection based on latest messages
   * @returns Promise that resolves when all activity has been fetched
   */
  private async fetchConnectionActivity(): Promise<void> {
    const activeConnections = this.getActiveConnections();

    const validConnections = activeConnections.filter(connection => {
      const topicId = connection.connectionTopicId;

      if (!topicId || topicId.includes(':') || !topicId.match(/^0\.0\.\d+$/)) {
        this.logger.debug(
          `Skipping activity fetch for invalid topic ID format: ${topicId}`,
        );
        return false;
      }
      return true;
    });

    const activityPromises = validConnections.map(async connection => {
      try {
        const topicId = connection.connectionTopicId;
        const messagesResult = await this.baseClient.getMessages(topicId);

        if (messagesResult?.messages?.length > 0) {
          this.processConnectionMessages(topicId, messagesResult.messages);
        }
      } catch (error) {
        this.logger.debug(
          `Failed to fetch activity for ${connection.connectionTopicId}:`,
          error,
        );
      }
    });

    await Promise.allSettled(activityPromises);
  }

  /**
   * Checks if an account should be filtered, taking into account existing established connections
   * @param accountId - The account ID to check
   * @returns True if the account should be filtered, false otherwise
   */
  private shouldFilterAccount(accountId: string): boolean {
    if (!this.filterPendingAccountIds.has(accountId)) {
      return false;
    }

    if (this.hasEstablishedConnectionWithAccount(accountId)) {
      return false;
    }

    return true;
  }

  /**
   * Process outbound messages to track connection requests and confirmations
   * @param messages - The messages to process
   * @param accountId - The account ID that sent the messages
   * @returns Array of connections after processing
   */
  processOutboundMessages(
    messages: HCSMessageWithCommonFields[],
    accountId: string,
  ): Connection[] {
    if (!Boolean(messages?.length)) {
      return Array.from(this.connections.values());
    }

    const requestMessages = messages.filter(
      msg => msg.op === 'connection_request' && msg.connection_request_id,
    );

    for (const msg of requestMessages) {
      const requestId = msg.connection_request_id!;
      const operatorId = msg.operator_id || '';
      const targetAccountId =
        this.baseClient.extractAccountFromOperatorId(operatorId);
      const targetInboundTopicId =
        this.baseClient.extractTopicFromOperatorId(operatorId);

      if (this.shouldFilterAccount(targetAccountId)) {
        this.logger.debug(
          `Filtering out outbound request to account: ${targetAccountId}`,
        );
        continue;
      }

      const isAlreadyConfirmed = Array.from(this.connections.values()).some(
        conn =>
          conn.connectionRequestId === requestId &&
          !conn.isPending &&
          conn.targetAccountId === targetAccountId,
      );

      const pendingKey = `req-${requestId}:${operatorId}`;

      if (!isAlreadyConfirmed && !this.pendingRequests.has(pendingKey)) {
        const pendingRequest = {
          id: requestId,
          requesterId: accountId,
          requesterTopicId: msg.outbound_topic_id || '',
          targetAccountId,
          targetTopicId: targetInboundTopicId,
          operatorId,
          sequenceNumber: msg.sequence_number,
          created: msg.created || new Date(),
          memo: msg.m,
          status: 'pending' as 'pending' | 'confirmed' | 'rejected',
        };

        this.pendingRequests.set(pendingKey, pendingRequest);

        if (!this.connections.has(pendingKey)) {
          const pendingConnection = {
            connectionTopicId: pendingKey,
            targetAccountId,
            targetInboundTopicId,
            status: 'pending' as
              | 'pending'
              | 'established'
              | 'needs_confirmation'
              | 'closed',
            isPending: true,
            needsConfirmation: false,
            created: msg.created || new Date(),
            connectionRequestId: requestId,
            uniqueRequestKey: pendingKey,
            originTopicId: msg.outbound_topic_id || '',
            processed: false,
            memo: msg.m,
          };

          this.connections.set(pendingKey, pendingConnection);
        }
      }
    }

    const confirmationMessages = messages.filter(
      msg =>
        msg.op === 'connection_created' &&
        msg.connection_topic_id &&
        msg.connection_request_id,
    );

    for (const msg of confirmationMessages) {
      const requestId = msg.connection_request_id!;
      const connectionTopicId = msg.connection_topic_id!;
      const targetAccountId = this.baseClient.extractAccountFromOperatorId(
        msg.operator_id || '',
      );

      if (this.shouldFilterAccount(targetAccountId)) {
        this.logger.debug(
          `Filtering out outbound confirmation to account: ${targetAccountId}`,
        );
        continue;
      }

      const pendingKey = `req-${requestId}:${msg.operator_id}`;

      const pendingRequest = this.pendingRequests.get(pendingKey);
      if (pendingRequest) {
        pendingRequest.status = 'confirmed';
      }

      if (this.connections.has(pendingKey)) {
        this.connections.delete(pendingKey);
      }

      if (!this.connections.has(connectionTopicId)) {
        this.connections.set(connectionTopicId, {
          connectionTopicId,
          targetAccountId,
          status: 'established',
          isPending: false,
          needsConfirmation: false,
          created: msg.created || new Date(),
          connectionRequestId: requestId,
          confirmedRequestId: msg.confirmed_request_id,
          requesterOutboundTopicId: msg.outbound_topic_id,
          uniqueRequestKey: pendingKey,
          originTopicId: msg.outbound_topic_id || '',
          processed: false,
          memo: msg.m,
        });
      } else {
        const conn = this.connections.get(connectionTopicId)!;
        this.connections.set(connectionTopicId, {
          ...conn,
          status: 'established',
          isPending: false,
          needsConfirmation: false,
          connectionRequestId: requestId,
          confirmedRequestId: msg.confirmed_request_id,
          requesterOutboundTopicId: msg.outbound_topic_id,
          uniqueRequestKey: pendingKey,
          originTopicId: msg.outbound_topic_id || '',
          processed: false,
          memo: msg.m,
        });
      }
    }

    const closedMessages = messages.filter(
      msg =>
        (msg.op as string) === 'connection_closed' ||
        (msg.op === 'close_connection' && msg.connection_topic_id),
    );

    for (const msg of closedMessages) {
      const connectionTopicId = msg.connection_topic_id!;

      if (this.connections.has(connectionTopicId)) {
        const conn = this.connections.get(connectionTopicId)!;
        if (
          this.shouldFilterAccount(conn.targetAccountId) &&
          conn.status !== 'established'
        ) {
          continue;
        }

        const uniqueKey =
          msg.connection_request_id && msg.operator_id
            ? `req-${msg.connection_request_id}:${msg.operator_id}`
            : undefined;

        this.connections.set(connectionTopicId, {
          ...conn,
          status: 'closed',
          isPending: false,
          needsConfirmation: false,
          lastActivity: msg.created || new Date(),
          closedReason: msg.reason,
          closeMethod: msg.close_method,
          uniqueRequestKey: uniqueKey,
          originTopicId: conn.originTopicId,
          processed: false,
          memo: msg.m,
        });
      }
    }

    return Array.from(this.connections.values()).filter(
      conn =>
        conn.status === 'established' ||
        conn.status === 'closed' ||
        !this.filterPendingAccountIds.has(conn.targetAccountId),
    );
  }

  /**
   * Process inbound messages to track connection requests and confirmations
   * @param messages - The messages to process
   * @returns Array of connections after processing
   */
  processInboundMessages(messages: HCSMessageWithCommonFields[]): Connection[] {
    if (!Boolean(messages?.length)) {
      return Array.from(this.connections.values());
    }

    const requestMessages = messages.filter(
      msg => msg.op === 'connection_request' && msg.sequence_number,
    );

    const confirmationMessages = messages.filter(
      msg =>
        msg.op === 'connection_created' &&
        msg.connection_topic_id &&
        msg.connection_id,
    );

    for (const msg of requestMessages) {
      const sequenceNumber = msg.sequence_number;
      const operatorId = msg.operator_id || '';
      const requestorAccountId =
        this.baseClient.extractAccountFromOperatorId(operatorId);
      const requestorTopicId =
        this.baseClient.extractTopicFromOperatorId(operatorId);

      if (this.shouldFilterAccount(requestorAccountId)) {
        this.logger.debug(
          `Filtering out request from account: ${requestorAccountId}`,
        );
        continue;
      }

      const needsConfirmKey = `inb-${sequenceNumber}:${operatorId}`;

      const hasCreated = confirmationMessages.some(
        m => m.connection_id === sequenceNumber,
      );

      if (hasCreated) {
        this.logger.debug(
          `Skipping request from ${requestorAccountId} as it has already been confirmed`,
        );
        continue;
      }

      if (!this.connections.has(needsConfirmKey)) {
        this.connections.set(needsConfirmKey, {
          connectionTopicId: needsConfirmKey,
          targetAccountId: requestorAccountId,
          targetInboundTopicId: requestorTopicId,
          status: 'needs_confirmation',
          isPending: false,
          needsConfirmation: true,
          created: msg.created || new Date(),
          inboundRequestId: sequenceNumber,
          uniqueRequestKey: needsConfirmKey,
          originTopicId: requestorTopicId,
          processed: false,
          memo: msg.m,
        });
      }
    }

    for (const msg of confirmationMessages) {
      const sequenceNumber = msg.connection_id!;
      const connectionTopicId = msg.connection_topic_id!;
      const connectedAccountId = msg.connected_account_id || '';
      const operatorId = msg.operator_id || '';

      if (this.shouldFilterAccount(connectedAccountId)) {
        this.logger.debug(
          `Filtering out confirmation for account: ${connectedAccountId}`,
        );
        continue;
      }

      const needsConfirmKey = `inb-${sequenceNumber}:${operatorId}`;

      if (this.connections.has(needsConfirmKey)) {
        this.connections.delete(needsConfirmKey);
      }

      if (!this.connections.has(connectionTopicId)) {
        this.connections.set(connectionTopicId, {
          connectionTopicId,
          targetAccountId: connectedAccountId,
          status: 'established',
          isPending: false,
          needsConfirmation: false,
          created: msg.created || new Date(),
          inboundRequestId: sequenceNumber,
          uniqueRequestKey: needsConfirmKey,
          originTopicId: msg.connection_topic_id,
          processed: false,
          memo: msg.m,
        });
      } else {
        const conn = this.connections.get(connectionTopicId)!;
        this.connections.set(connectionTopicId, {
          ...conn,
          status: 'established',
          isPending: false,
          needsConfirmation: false,
          inboundRequestId: sequenceNumber,
          uniqueRequestKey: needsConfirmKey,
          originTopicId: msg.connection_topic_id,
          processed: false,
          memo: msg.m,
        });
      }
    }

    return Array.from(this.connections.values()).filter(
      conn =>
        conn.status === 'established' ||
        conn.status === 'closed' ||
        !this.filterPendingAccountIds.has(conn.targetAccountId),
    );
  }

  /**
   * Process connection topic messages to update last activity time
   * @param connectionTopicId - The topic ID of the connection
   * @param messages - The messages to process
   * @returns The updated connection or undefined if not found
   */
  processConnectionMessages(
    connectionTopicId: string,
    messages: HCSMessageWithCommonFields[],
  ): Connection | undefined {
    if (
      !messages ||
      messages.length === 0 ||
      !this.connections.has(connectionTopicId)
    ) {
      return this.connections.get(connectionTopicId);
    }

    const latestMessage = messages
      .filter(m => m.created)
      .sort((a, b) => {
        const dateA = a.created ? new Date(a.created).getTime() : 0;
        const dateB = b.created ? new Date(b.created).getTime() : 0;
        return dateB - dateA;
      })[0];

    if (latestMessage?.created) {
      const conn = this.connections.get(connectionTopicId)!;
      this.connections.set(connectionTopicId, {
        ...conn,
        lastActivity: latestMessage.created,
      });
    }

    const closeMessage = messages.find(msg => msg.op === 'close_connection');
    if (closeMessage) {
      const conn = this.connections.get(connectionTopicId)!;
      this.connections.set(connectionTopicId, {
        ...conn,
        status: 'closed',
        lastActivity: closeMessage.created || new Date(),
        closedReason: closeMessage.reason,
        closeMethod: 'explicit',
      });
    }

    return this.connections.get(connectionTopicId);
  }

  /**
   * Adds or updates profile information for a connection
   * @param accountId - The account ID to add profile info for
   * @param profile - The profile information
   */
  addProfileInfo(accountId: string, profile: AIAgentProfile): void {
    this.profileCache.set(accountId, profile);

    const matchingConnections = Array.from(this.connections.values()).filter(
      conn => conn.targetAccountId === accountId,
    );

    for (const conn of matchingConnections) {
      this.connections.set(conn.connectionTopicId, {
        ...conn,
        profileInfo: profile,
        targetAgentName: profile.display_name,
        targetInboundTopicId: profile.inboundTopicId,
        targetOutboundTopicId: profile.outboundTopicId,
      });
    }
  }

  /**
   * Gets all connections
   * @returns Array of all connections that should be visible
   */
  getAllConnections(): Connection[] {
    const connections = Array.from(this.connections.values()).filter(
      conn =>
        conn.status === 'established' ||
        conn.status === 'closed' ||
        !this.filterPendingAccountIds.has(conn.targetAccountId),
    );
    return connections;
  }

  /**
   * Gets all pending connection requests
   * @returns Array of pending connection requests
   */
  getPendingRequests(): Connection[] {
    const pendingConnections = Array.from(this.connections.values()).filter(
      conn => {
        return (
          conn.isPending &&
          !this.filterPendingAccountIds.has(conn.targetAccountId)
        );
      },
    );

    return pendingConnections;
  }

  /**
   * Helper method to check if there's an established connection with an account
   * @param accountId - The account ID to check
   * @returns True if there's an established connection, false otherwise
   */
  private hasEstablishedConnectionWithAccount(accountId: string): boolean {
    return Array.from(this.connections.values()).some(
      conn =>
        conn.targetAccountId === accountId && conn.status === 'established',
    );
  }

  /**
   * Gets all active (established) connections
   * @returns Array of active connections
   */
  getActiveConnections(): Connection[] {
    return Array.from(this.connections.values()).filter(
      conn => conn.status === 'established',
    );
  }

  /**
   * Gets all connections needing confirmation
   * @returns Array of connections needing confirmation
   */
  getConnectionsNeedingConfirmation(): Connection[] {
    return Array.from(this.connections.values()).filter(
      conn =>
        conn.needsConfirmation &&
        !this.filterPendingAccountIds.has(conn.targetAccountId),
    );
  }

  /**
   * Gets a connection by its topic ID
   * @param connectionTopicId - The topic ID to look up
   * @returns The connection with the given topic ID, or undefined if not found
   */
  getConnectionByTopicId(connectionTopicId: string): Connection | undefined {
    return this.connections.get(connectionTopicId);
  }

  /**
   * Gets a connection by account ID
   * @param accountId - The account ID to look up
   * @returns The connection with the given account ID, or undefined if not found
   */
  getConnectionByAccountId(accountId: string): Connection | undefined {
    return Array.from(this.connections.values()).find(
      conn =>
        conn.targetAccountId === accountId && conn.status === 'established',
    );
  }

  /**
   * Gets all connections for a specific account ID
   * @param accountId - The account ID to look up
   * @returns Array of connections for the given account ID
   */
  getConnectionsByAccountId(accountId: string): Connection[] {
    return Array.from(this.connections.values()).filter(
      conn => conn.targetAccountId === accountId,
    );
  }

  /**
   * Updates or adds a connection
   * @param connection - The connection to update or add
   */
  updateOrAddConnection(connection: Connection): void {
    this.connections.set(connection.connectionTopicId, connection);
  }

  /**
   * Clears all tracked connections and requests
   */
  clearAll(): void {
    this.connections.clear();
    this.pendingRequests.clear();
  }

  /**
   * Checks if a given connection request has been processed already
   * This uses a combination of topic ID and request ID to uniquely identify requests
   *
   * @param inboundTopicId - The inbound topic ID where the request was received
   * @param requestId - The sequence number (request ID)
   * @returns True if this specific request has been processed, false otherwise
   */
  isConnectionRequestProcessed(
    inboundTopicId: string,
    requestId: number,
  ): boolean {
    for (const conn of this.connections.values()) {
      if (
        conn.originTopicId === inboundTopicId &&
        conn.inboundRequestId === requestId &&
        conn.processed
      ) {
        return true;
      }

      if (
        conn.originTopicId === inboundTopicId &&
        conn.connectionRequestId === requestId &&
        conn.processed
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Marks a specific connection request as processed
   *
   * @param inboundTopicId - The inbound topic ID where the request was received
   * @param requestId - The sequence number (request ID)
   * @returns True if a matching connection was found and marked, false otherwise
   */
  markConnectionRequestProcessed(
    inboundTopicId: string,
    requestId: number,
  ): boolean {
    let found = false;

    for (const [key, conn] of this.connections.entries()) {
      if (
        conn.originTopicId === inboundTopicId &&
        conn.inboundRequestId === requestId
      ) {
        this.connections.set(key, {
          ...conn,
          processed: true,
        });
        found = true;
        this.logger.debug(
          `Marked inbound connection request #${requestId} on topic ${inboundTopicId} as processed`,
        );
      }

      if (
        conn.originTopicId === inboundTopicId &&
        conn.connectionRequestId === requestId
      ) {
        this.connections.set(key, {
          ...conn,
          processed: true,
        });
        found = true;
        this.logger.debug(
          `Marked outbound connection request #${requestId} on topic ${inboundTopicId} as processed`,
        );
      }
    }

    return found;
  }

  /**
   * Gets pending transactions from a specific connection
   * @param connectionTopicId - The connection topic ID to check for transactions
   * @param options - Optional filtering and retrieval options
   * @returns Array of pending transaction messages sorted by timestamp (newest first)
   */
  async getPendingTransactions(
    connectionTopicId: string,
    options?: {
      limit?: number;
      sequenceNumber?: string | number;
      order?: 'asc' | 'desc';
    },
  ): Promise<TransactMessage[]> {
    try {
      const transactMessages = await this.baseClient.getTransactionRequests(
        connectionTopicId,
        options ? { ...options } : undefined,
      );

      const pendingTransactions: TransactMessage[] = [];

      for (const transaction of transactMessages) {
        try {
          const status =
            await this.baseClient.mirrorNode.getScheduledTransactionStatus(
              transaction.schedule_id,
            );

          if (!status.executed && !status.deleted) {
            pendingTransactions.push(transaction);
          }
        } catch (error) {
          this.logger.error(`Error checking transaction status: ${error}`);
          pendingTransactions.push(transaction);
        }
      }

      return pendingTransactions;
    } catch (error) {
      this.logger.error(`Error getting pending transactions: ${error}`);
      return [];
    }
  }

  /**
   * Gets the status of a scheduled transaction
   * @param scheduleId - The schedule ID to check
   * @returns Status of the scheduled transaction
   */
  getScheduledTransactionStatus(scheduleId: string): Promise<{
    executed: boolean;
    executedTimestamp?: string;
    deleted: boolean;
    expirationTime?: string;
  }> {
    return this.baseClient.mirrorNode.getScheduledTransactionStatus(scheduleId);
  }

  /**
   * Gets the timestamp of the last message sent by the specified operator on the connection topic
   * @param connectionTopicId - The topic ID to check
   * @param operatorAccountId - The account ID of the operator
   * @returns The timestamp of the last message or undefined if no messages found
   */
  async getLastOperatorActivity(
    connectionTopicId: string,
    operatorAccountId: string,
  ): Promise<Date | undefined> {
    try {
      const messages =
        await this.baseClient.getMessageStream(connectionTopicId);

      const filteredMessages = messages.messages.filter(
        msg =>
          msg.operator_id &&
          msg.operator_id.includes(operatorAccountId) &&
          msg.created,
      );

      if (filteredMessages.length === 0) {
        return undefined;
      }

      filteredMessages.sort(
        (a, b) => b.created!.getTime() - a.created!.getTime(),
      );

      return filteredMessages[0].created;
    } catch (error) {
      this.logger.error(`Error getting last operator activity: ${error}`);
      return undefined;
    }
  }
}
