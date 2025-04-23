import { Logger, LoggerOptions } from '../utils/logger';
import { HCSMessage, HCS10BaseClient } from './base-client';
import { AIAgentProfile } from '../hcs-11';

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
}

/**
 * Options for the connections manager
 */
export interface ConnectionsManagerOptions {
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  filterPendingAccountIds?: string[];
  baseClient: HCS10BaseClient;
}

/**
 * ConnectionsManager provides a unified way to track and manage HCS-10 connections
 * across different applications. It works with both frontend and backend implementations.
 */
export class ConnectionsManager {
  private logger: Logger;
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
    };
    this.logger = new Logger(loggerOptions);

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
      const topicInfo = await this.baseClient.retrieveCommunicationTopics(
        accountId
      );

      const [outboundMessagesResult, inboundMessagesResult] = await Promise.all(
        [
          this.baseClient.getMessages(topicInfo.outboundTopic),
          this.baseClient.getMessages(topicInfo.inboundTopic),
        ]
      );

      this.processOutboundMessages(
        outboundMessagesResult.messages || [],
        accountId
      );
      this.processInboundMessages(
        inboundMessagesResult.messages || [],
        accountId
      );

      await this.checkTargetInboundTopicsForConfirmations();
      await this.fetchProfilesForConnections(accountId);
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
      (conn) => conn.isPending && conn.targetInboundTopicId
    );

    if (pendingConnections.length === 0) {
      return;
    }

    const pendingRequestsByTarget = new Map<string, Connection[]>();

    pendingConnections.forEach((conn) => {
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
          const targetMessagesResult = await this.baseClient.getMessages(
            targetInboundTopicId
          );
          const targetMessages = targetMessagesResult.messages || [];

          let confirmedAny = false;

          for (const conn of requests) {
            const requestId = conn.connectionRequestId;
            if (!requestId) {
              continue;
            }

            const confirmationMsg = targetMessages.find(
              (msg) =>
                msg.op === 'connection_created' &&
                msg.connection_id === requestId &&
                msg.connection_topic_id
            );

            if (confirmationMsg?.connection_topic_id) {
              confirmedAny = true;

              const connectionTopicId = confirmationMsg.connection_topic_id;

              let pendingKey = conn.connectionTopicId;
              if (!pendingKey.startsWith('req-') && conn.uniqueRequestKey) {
                pendingKey = conn.uniqueRequestKey;
              }

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
              };

              this.connections.set(connectionTopicId, newConnection);

              if (pendingKey && pendingKey !== connectionTopicId) {
                this.connections.delete(pendingKey);
              }

              this.logger.debug(
                `Confirmed connection in target inbound topic: ${connectionTopicId}`
              );
            }
          }

          if (confirmedAny || attempt === MAX_FETCH_ATTEMPTS) {
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, FETCH_DELAY_MS));
        } catch (error) {
          this.logger.debug(
            `Error fetching target inbound topic ${targetInboundTopicId}:`,
            error
          );
          if (attempt === MAX_FETCH_ATTEMPTS) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, FETCH_DELAY_MS));
        }
      }
    }
  }

  /**
   * Fetches profiles for all connected accounts
   * @param accountId - The account ID making the request
   */
  private async fetchProfilesForConnections(accountId: string): Promise<void> {
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
      async (targetId) => {
        try {
          const profileResponse = await this.baseClient.retrieveProfile(
            targetId
          );
          if (profileResponse.success && profileResponse.profile) {
            this.addProfileInfo(targetId, profileResponse.profile);

            this.updatePendingConnectionsWithProfileInfo(
              targetId,
              profileResponse.profile
            );
          }
        } catch (error) {
          this.logger.debug(`Failed to fetch profile for ${targetId}:`, error);
        }
      }
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
    profile: AIAgentProfile
  ): void {
    const pendingConnections = Array.from(this.connections.values()).filter(
      (conn) =>
        conn.targetAccountId === accountId &&
        (conn.isPending || conn.needsConfirmation) &&
        !conn.targetInboundTopicId
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

    const activityPromises = activeConnections.map(async (connection) => {
      try {
        const messagesResult = await this.baseClient.getMessages(
          connection.connectionTopicId
        );
        if (messagesResult?.messages?.length > 0) {
          this.processConnectionMessages(
            connection.connectionTopicId,
            messagesResult.messages
          );
        }
      } catch (error) {
        this.logger.debug(
          `Failed to fetch activity for ${connection.connectionTopicId}:`,
          error
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
    messages: HCSMessage[],
    accountId: string
  ): Connection[] {
    if (!messages || messages.length === 0) {
      return Array.from(this.connections.values());
    }

    const requestMessages = messages.filter(
      (msg) => msg.op === 'connection_request' && msg.connection_request_id
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
          `Filtering out outbound request to account: ${targetAccountId}`
        );
        continue;
      }

      const isAlreadyConfirmed = Array.from(this.connections.values()).some(
        (conn) => conn.connectionRequestId === requestId && !conn.isPending
      );

      const pendingKey = `req-${requestId}:${operatorId}`;

      if (!isAlreadyConfirmed && !this.pendingRequests.has(pendingKey)) {
        this.pendingRequests.set(pendingKey, {
          id: requestId,
          requesterId: accountId,
          requesterTopicId: msg.outbound_topic_id || '',
          targetAccountId,
          targetTopicId: targetInboundTopicId,
          operatorId,
          sequenceNumber: msg.sequence_number,
          created: msg.created || new Date(),
          memo: msg.m,
          status: 'pending',
        });

        if (!this.connections.has(pendingKey)) {
          this.connections.set(pendingKey, {
            connectionTopicId: pendingKey,
            targetAccountId,
            targetInboundTopicId,
            status: 'pending',
            isPending: true,
            needsConfirmation: false,
            created: msg.created || new Date(),
            connectionRequestId: requestId,
            uniqueRequestKey: pendingKey,
          });
        }
      }
    }

    const confirmationMessages = messages.filter(
      (msg) =>
        msg.op === 'connection_created' &&
        msg.connection_topic_id &&
        msg.connection_request_id
    );

    for (const msg of confirmationMessages) {
      const requestId = msg.connection_request_id!;
      const connectionTopicId = msg.connection_topic_id!;
      const targetAccountId = this.baseClient.extractAccountFromOperatorId(
        msg.operator_id || ''
      );

      if (this.shouldFilterAccount(targetAccountId)) {
        this.logger.debug(
          `Filtering out outbound confirmation to account: ${targetAccountId}`
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

      const existingConnections = Array.from(this.connections.entries()).filter(
        ([_, conn]) => conn.connectionRequestId === requestId
      );

      for (const [key, _] of existingConnections) {
        if (key !== connectionTopicId) {
          this.connections.delete(key);
        }
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
        });
      }
    }

    const closedMessages = messages.filter(
      (msg) =>
        (msg.op as string) === 'connection_closed' ||
        (msg.op === 'close_connection' && msg.connection_topic_id)
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
        });
      }
    }

    return Array.from(this.connections.values()).filter(
      (conn) =>
        conn.status === 'established' ||
        conn.status === 'closed' ||
        !this.filterPendingAccountIds.has(conn.targetAccountId)
    );
  }

  /**
   * Process inbound messages to track connection requests and confirmations
   * @param messages - The messages to process
   * @param accountId - The account ID that received the messages
   * @returns Array of connections after processing
   */
  processInboundMessages(
    messages: HCSMessage[],
    accountId: string
  ): Connection[] {
    if (!messages || messages.length === 0) {
      return Array.from(this.connections.values());
    }

    const requestMessages = messages.filter(
      (msg) => msg.op === 'connection_request' && msg.sequence_number
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
          `Filtering out request from account: ${requestorAccountId}`
        );
        continue;
      }

      const isAlreadyConfirmed = messages.some(
        (confirmMsg) =>
          confirmMsg.op === 'connection_created' &&
          confirmMsg.connection_id === sequenceNumber
      );

      if (!isAlreadyConfirmed) {
        const needsConfirmKey = `inb-${sequenceNumber}:${operatorId}`;

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
          });
        }
      }
    }

    const confirmationMessages = messages.filter(
      (msg) =>
        msg.op === 'connection_created' &&
        msg.connection_topic_id &&
        msg.connection_id
    );

    for (const msg of confirmationMessages) {
      const sequenceNumber = msg.connection_id!;
      const connectionTopicId = msg.connection_topic_id!;
      const connectedAccountId = msg.connected_account_id || '';

      if (this.shouldFilterAccount(connectedAccountId)) {
        this.logger.debug(
          `Filtering out confirmation for account: ${connectedAccountId}`
        );
        continue;
      }

      const needsConfirmKey = `inb-${sequenceNumber}:${msg.operator_id}`;

      if (this.connections.has(needsConfirmKey)) {
        this.connections.delete(needsConfirmKey);
      }

      const existingConnections = Array.from(this.connections.entries()).filter(
        ([_, conn]) => conn.inboundRequestId === sequenceNumber
      );

      for (const [key, _] of existingConnections) {
        if (key !== connectionTopicId) {
          this.connections.delete(key);
        }
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
        });
      }
    }

    return Array.from(this.connections.values()).filter(
      (conn) =>
        conn.status === 'established' ||
        conn.status === 'closed' ||
        !this.filterPendingAccountIds.has(conn.targetAccountId)
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
    messages: HCSMessage[]
  ): Connection | undefined {
    if (
      !messages ||
      messages.length === 0 ||
      !this.connections.has(connectionTopicId)
    ) {
      return this.connections.get(connectionTopicId);
    }

    const latestMessage = messages
      .filter((m) => m.created)
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

    const closeMessage = messages.find((msg) => msg.op === 'close_connection');
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
  addProfileInfo(accountId: string, profile: any): void {
    this.profileCache.set(accountId, profile);

    const matchingConnections = Array.from(this.connections.values()).filter(
      (conn) => conn.targetAccountId === accountId
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
    return Array.from(this.connections.values()).filter(
      (conn) =>
        conn.status === 'established' ||
        conn.status === 'closed' ||
        !this.filterPendingAccountIds.has(conn.targetAccountId) ||
        this.hasEstablishedConnectionWithAccount(conn.targetAccountId)
    );
  }

  /**
   * Gets all pending connection requests
   * @returns Array of pending connection requests
   */
  getPendingRequests(): Connection[] {
    return Array.from(this.connections.values()).filter((conn) => {
      return (
        conn.isPending &&
        (!this.filterPendingAccountIds.has(conn.targetAccountId) ||
          this.hasEstablishedConnectionWithAccount(conn.targetAccountId))
      );
    });
  }

  /**
   * Helper method to check if there's an established connection with an account
   * @param accountId - The account ID to check
   * @returns True if there's an established connection, false otherwise
   */
  private hasEstablishedConnectionWithAccount(accountId: string): boolean {
    return Array.from(this.connections.values()).some(
      (conn) =>
        conn.targetAccountId === accountId && conn.status === 'established'
    );
  }

  /**
   * Gets all active (established) connections
   * @returns Array of active connections
   */
  getActiveConnections(): Connection[] {
    return Array.from(this.connections.values()).filter(
      (conn) => conn.status === 'established'
    );
  }

  /**
   * Gets all connections needing confirmation
   * @returns Array of connections needing confirmation
   */
  getConnectionsNeedingConfirmation(): Connection[] {
    return Array.from(this.connections.values()).filter(
      (conn) =>
        conn.needsConfirmation &&
        (!this.filterPendingAccountIds.has(conn.targetAccountId) ||
          this.hasEstablishedConnectionWithAccount(conn.targetAccountId))
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
      (conn) =>
        conn.targetAccountId === accountId && conn.status === 'established'
    );
  }

  /**
   * Gets all connections for a specific account ID
   * @param accountId - The account ID to look up
   * @returns Array of connections for the given account ID
   */
  getConnectionsByAccountId(accountId: string): Connection[] {
    return Array.from(this.connections.values()).filter(
      (conn) => conn.targetAccountId === accountId
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
}
