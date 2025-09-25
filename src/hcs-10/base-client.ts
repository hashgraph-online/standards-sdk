import { Logger, LogLevel, ILogger } from '../utils/logger';
import { Registration } from './registrations';
import { HCS11Client } from '../hcs-11/client';
import {
  AccountResponse,
  HCSMessageWithCommonFields,
  TopicResponse,
} from '../services/types';
import { TopicInfo } from '../services/types';
import {
  TransactionReceipt,
  PrivateKey,
  PublicKey,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import { NetworkType } from '../utils/types';
import { HederaMirrorNode, MirrorNodeConfig } from '../services';
import {
  WaitForConnectionConfirmationResponse,
  TransactMessage,
} from './types';
import {
  buildHcs10SubmitConnectionRequestTx,
  buildHcs10OutboundConnectionRequestRecordTx,
  buildHcs10OutboundConnectionCreatedRecordTx,
} from './tx';
import { HRLResolver } from '../utils/hrl-resolver';

export enum Hcs10MemoType {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
  CONNECTION = 'connection',
  REGISTRY = 'registry',
}

/**
 * Configuration for HCS-10 client.
 *
 * @example
 * // Using default Hedera mirror nodes
 * const config = {
 *   network: 'testnet',
 *   logLevel: 'info'
 * };
 *
 * @example
 * // Using HGraph custom mirror node provider
 * const config = {
 *   network: 'mainnet',
 *   logLevel: 'info',
 *   mirrorNode: {
 *     customUrl: 'https://mainnet.hedera.api.hgraph.dev/v1/<API-KEY>',
 *     apiKey: 'your-hgraph-api-key'
 *   }
 * };
 *
 * @example
 * // Using custom mirror node with headers
 * const config = {
 *   network: 'testnet',
 *   mirrorNode: {
 *     customUrl: 'https://custom-mirror.example.com',
 *     apiKey: 'your-api-key',
 *     headers: {
 *       'X-Custom-Header': 'value'
 *     }
 *   }
 * };
 */
export interface HCS10Config {
  /** The Hedera network to connect to */
  network: 'mainnet' | 'testnet';
  /** Log level for the client */
  logLevel?: LogLevel;
  /** Whether to pretty print logs */
  prettyPrint?: boolean;
  /** Fee amount for transactions that require fees */
  feeAmount?: number;
  /** Custom mirror node configuration */
  mirrorNode?: MirrorNodeConfig;
  /** Whether to run logger in silent mode */
  silent?: boolean;
  /** The key type to use for the operator */
  keyType?: 'ed25519' | 'ecdsa';
}

export interface ProfileResponse {
  profile: any;
  topicInfo?: TopicInfo;
  success: boolean;
  error?: string;
}

export abstract class HCS10BaseClient extends Registration {
  protected logger: ILogger;
  protected feeAmount: number;
  public mirrorNode: HederaMirrorNode;
  public network: string;

  protected operatorId: string;

  constructor(config: HCS10Config) {
    super();
    this.network = config.network;
    this.logger = Logger.getInstance({
      level: config.logLevel || 'info',
      module: 'HCS10-BaseClient',
      prettyPrint: config.prettyPrint,
      silent: config.silent,
    });
    this.mirrorNode = new HederaMirrorNode(
      config.network as NetworkType,
      this.logger,
      config.mirrorNode,
    );
    this.feeAmount = config.feeAmount || 0.001;
  }

  abstract submitPayload(
    topicOrTransaction: string | TopicMessageSubmitTransaction,
    payload?: object | string,
    submitKey?: PrivateKey,
    requiresFee?: boolean,
  ): Promise<TransactionReceipt>;

  abstract getAccountAndSigner(): { accountId: string; signer: any };

  /**
   * Updates the mirror node configuration.
   * @param config The new mirror node configuration.
   */
  public configureMirrorNode(config: MirrorNodeConfig): void {
    this.mirrorNode.configureMirrorNode(config);
    this.logger.info('Mirror node configuration updated');
  }

  public extractTopicFromOperatorId(operatorId: string): string {
    if (!operatorId) {
      return '';
    }
    const parts = operatorId.split('@');
    if (parts.length > 0) {
      return parts[0];
    }
    return '';
  }

  public extractAccountFromOperatorId(operatorId: string): string {
    if (!operatorId) {
      return '';
    }
    const parts = operatorId.split('@');
    if (parts.length > 1) {
      return parts[1];
    }
    return '';
  }

  /**
   * Get a stream of messages from a connection topic
   * @param topicId The connection topic ID to get messages from
   * @param options Optional filtering options for messages
   * @returns A stream of filtered messages valid for connection topics
   */
  public async getMessageStream(
    topicId: string,
    options?: {
      sequenceNumber?: string | number;
      limit?: number;
      order?: 'asc' | 'desc';
    },
  ): Promise<{ messages: HCSMessageWithCommonFields[] }> {
    try {
      const messages = await this.mirrorNode.getTopicMessages(topicId, options);
      const validOps = ['message', 'close_connection', 'transaction'];

      const filteredMessages = messages.filter(msg => {
        if (msg.p !== 'hcs-10' || !validOps.includes(msg.op)) {
          return false;
        }

        if (msg.op === 'message' || msg.op === 'close_connection') {
          if (!msg.operator_id) {
            return false;
          }

          if (!this.isValidOperatorId(msg.operator_id)) {
            return false;
          }

          if (msg.op === 'message' && !msg.data) {
            return false;
          }
        }

        if (msg.op === 'transaction') {
          if (!msg.operator_id || !msg.schedule_id) {
            return false;
          }

          if (!this.isValidOperatorId(msg.operator_id)) {
            return false;
          }
        }

        return true;
      });

      return {
        messages: filteredMessages,
      };
    } catch (error: any) {
      if (this.logger) {
        this.logger.error(`Error fetching messages: ${error.message}`);
      }
      return { messages: [] };
    }
  }

  /**
   * Public method to retrieve topic information using the internal mirror node client.
   *
   * @param topicId The ID of the topic to query.
   * @returns Topic information or null if not found or an error occurs.
   */
  async getPublicTopicInfo(topicId: string): Promise<TopicResponse | null> {
    try {
      return await this.mirrorNode.getTopicInfo(topicId);
    } catch (error) {
      this.logger.error(
        `Error getting public topic info for ${topicId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Checks if a user can submit to a topic and determines if a fee is required
   * @param topicId The topic ID to check
   * @param userAccountId The account ID of the user attempting to submit
   * @returns Object with canSubmit, requiresFee, and optional reason
   */
  public async canSubmitToTopic(
    topicId: string,
    userAccountId: string,
  ): Promise<{ canSubmit: boolean; requiresFee: boolean; reason?: string }> {
    try {
      const topicInfo = await this.mirrorNode.getTopicInfo(topicId);

      if (!topicInfo) {
        return {
          canSubmit: false,
          requiresFee: false,
          reason: 'Topic does not exist',
        };
      }

      if (!topicInfo.submit_key?.key) {
        return { canSubmit: true, requiresFee: false };
      }

      try {
        const userPublicKey = await this.mirrorNode.getPublicKey(userAccountId);

        if (topicInfo.submit_key._type === 'ProtobufEncoded') {
          const keyBytes = Buffer.from(topicInfo.submit_key.key, 'hex');
          const hasAccess = await this.mirrorNode.checkKeyListAccess(
            keyBytes,
            userPublicKey,
          );

          if (hasAccess) {
            return { canSubmit: true, requiresFee: false };
          }
        } else {
          const topicSubmitKey = PublicKey.fromString(topicInfo.submit_key.key);
          if (userPublicKey.toString() === topicSubmitKey.toString()) {
            return { canSubmit: true, requiresFee: false };
          }
        }
      } catch (error) {
        this.logger.error(
          `Key validation error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      if (
        topicInfo.fee_schedule_key?.key &&
        topicInfo.custom_fees?.fixed_fees?.length > 0
      ) {
        return {
          canSubmit: true,
          requiresFee: true,
          reason: 'Requires fee payment via HIP-991',
        };
      }

      return {
        canSubmit: false,
        requiresFee: false,
        reason: 'User does not have submit permission for this topic',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Topic submission validation error: ${errorMessage}`);
      return {
        canSubmit: false,
        requiresFee: false,
        reason: `Error: ${errorMessage}`,
      };
    }
  }

  /**
   * Get all messages from a topic
   * @param topicId The topic ID to get messages from
   * @param options Optional filtering options for messages
   * @returns All messages from the topic
   */
  public async getMessages(
    topicId: string,
    options?: {
      sequenceNumber?: string | number;
      limit?: number;
      order?: 'asc' | 'desc';
    },
  ): Promise<{ messages: HCSMessageWithCommonFields[] }> {
    try {
      const messages = await this.mirrorNode.getTopicMessages(topicId, options);

      const validatedMessages = messages.filter(msg => {
        if (msg.p !== 'hcs-10') {
          return false;
        }

        if (msg.op === 'message') {
          if (!msg.data) {
            return false;
          }

          if (msg.operator_id) {
            if (!this.isValidOperatorId(msg.operator_id)) {
              return false;
            }
          }
        }

        return true;
      });

      return {
        messages: validatedMessages,
      };
    } catch (error: any) {
      if (this.logger) {
        this.logger.error(`Error fetching messages: ${error.message}`);
      }
      return { messages: [] };
    }
  }

  /**
   * Requests an account from the mirror node
   * @param account The account ID to request
   * @returns The account response
   */
  public async requestAccount(account: string): Promise<AccountResponse> {
    try {
      if (!account) {
        throw new Error('Account ID is required');
      }
      return await this.mirrorNode.requestAccount(account);
    } catch (e) {
      this.logger.error('Failed to fetch account', e);
      throw e;
    }
  }

  /**
   * Retrieves the memo for an account
   * @param accountId The account ID to retrieve the memo for
   * @returns The memo
   */
  public async getAccountMemo(accountId: string): Promise<string | null> {
    return await this.mirrorNode.getAccountMemo(accountId);
  }

  /**
   * Retrieves the profile for an account
   * @param accountId The account ID to retrieve the profile for
   * @param disableCache Whether to disable caching of the result
   * @param retryOptions Optional retry configuration
   * @returns The profile
   */
  public async retrieveProfile(
    accountId: string,
    disableCache?: boolean,
    retryOptions?: {
      maxRetries?: number;
      retryDelay?: number;
    },
  ): Promise<ProfileResponse> {
    const maxRetries = retryOptions?.maxRetries ?? 0;
    const retryDelay = retryOptions?.retryDelay ?? 3000;
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      this.logger.debug(
        `Retrieving profile for account: ${accountId}${retryCount > 0 ? ` (attempt ${retryCount + 1}/${maxRetries + 1})` : ''}`,
      );

      const cacheKey = `${accountId}-${this.network}`;

      if (!disableCache && retryCount === 0) {
        const cachedProfileResponse = HCS10Cache.getInstance().get(cacheKey);
        if (cachedProfileResponse) {
          this.logger.debug(`Cache hit for profile: ${accountId}`);
          return cachedProfileResponse;
        }
      }

      try {
        const hcs11Client = new HCS11Client({
          network: this.network as 'mainnet' | 'testnet',
          auth: {
            operatorId: '0.0.0',
          },
          logLevel: this.logger.getLevel(),
        });

        const profileResult = await hcs11Client.fetchProfileByAccountId(
          accountId,
          this.network,
        );

        if (!profileResult?.success) {
          if (retryCount < maxRetries) {
            this.logger.info(
              `Profile not found for account ${accountId}, retrying in ${retryDelay}ms... (${profileResult?.error})`,
            );
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }

          this.logger.error(
            `Failed to retrieve profile for account ID: ${accountId}`,
            profileResult?.error,
          );
          return {
            profile: null,
            success: false,
            error:
              profileResult?.error ||
              `Failed to retrieve profile for account ID: ${accountId}`,
          };
        }

        const profile = profileResult?.profile;
        let topicInfo: TopicInfo | null = null;

        if (
          profileResult?.topicInfo?.inboundTopic &&
          profileResult?.topicInfo?.outboundTopic &&
          profileResult?.topicInfo?.profileTopicId
        ) {
          topicInfo = {
            inboundTopic: profileResult.topicInfo.inboundTopic,
            outboundTopic: profileResult.topicInfo.outboundTopic,
            profileTopicId: profileResult.topicInfo.profileTopicId,
          };
        }

        const responseToCache: ProfileResponse = {
          profile,
          topicInfo,
          success: true,
        };
        HCS10Cache.getInstance().set(cacheKey, responseToCache);
        return responseToCache;
      } catch (e: any) {
        if (retryCount < maxRetries) {
          this.logger.info(
            `Error retrieving profile for account ${accountId}, retrying in ${retryDelay}ms... (${e.message})`,
          );
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }

        const error = e as Error;
        const logMessage = `Failed to retrieve profile: ${error.message}`;
        this.logger.error(logMessage);
        return {
          profile: null,
          success: false,
          error: logMessage,
        };
      }
    }

    return {
      profile: null,
      success: false,
      error: 'Unexpected error in profile retrieval',
    };
  }

  /**
   * @deprecated Use retrieveCommunicationTopics instead
   * @param accountId The account ID to retrieve the outbound connect topic for
   * @returns {TopicInfo} Topic Info from target profile.
   */
  public async retrieveOutboundConnectTopic(
    accountId: string,
  ): Promise<TopicInfo> {
    return await this.retrieveCommunicationTopics(accountId, true);
  }

  /**
   * Retrieves the communication topics for an account
   * @param accountId The account ID to retrieve the communication topics for
   * @param disableCache Whether to disable caching of the result
   * @param retryOptions Optional retry configuration
   * @returns {TopicInfo} Topic Info from target profile.
   */
  public async retrieveCommunicationTopics(
    accountId: string,
    disableCache?: boolean,
    retryOptions?: {
      maxRetries?: number;
      retryDelay?: number;
    },
  ): Promise<TopicInfo> {
    try {
      const profileResponse = await this.retrieveProfile(
        accountId,
        disableCache,
        retryOptions,
      );

      if (!profileResponse?.success) {
        throw new Error(profileResponse.error || 'Failed to retrieve profile');
      }

      const profile = profileResponse.profile;

      if (!profile) {
        throw new Error(
          `Profile is null or undefined for account ${accountId}`,
        );
      }

      if (!profile.inboundTopicId || !profile.outboundTopicId) {
        throw new Error(
          `Invalid HCS-11 profile for HCS-10 agent: missing inboundTopicId or outboundTopicId`,
        );
      }

      if (!profileResponse.topicInfo) {
        throw new Error(
          `TopicInfo is missing in the profile for account ${accountId}`,
        );
      }

      return profileResponse.topicInfo;
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Failed to retrieve topic info: ${error.message}`;
      this.logger.error(logMessage);
      throw error;
    }
  }

  /**
   * Retrieves outbound messages for an agent
   * @param agentAccountId The account ID of the agent
   * @param options Optional filtering options for messages
   * @returns The outbound messages
   */
  public async retrieveOutboundMessages(
    agentAccountId: string,
    options?: {
      sequenceNumber?: string | number;
      limit?: number;
      order?: 'asc' | 'desc';
    },
  ): Promise<HCSMessageWithCommonFields[]> {
    try {
      const topicInfo = await this.retrieveCommunicationTopics(agentAccountId);
      if (!topicInfo) {
        this.logger.warn(
          `No outbound connect topic found for agentAccountId: ${agentAccountId}`,
        );
        return [];
      }
      const response = await this.getMessages(topicInfo.outboundTopic, options);
      return response.messages.filter(
        msg =>
          msg.p === 'hcs-10' &&
          (msg.op === 'connection_request' ||
            msg.op === 'connection_created' ||
            msg.op === 'message'),
      );
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Failed to retrieve outbound messages: ${error.message}`;
      this.logger.error(logMessage);
      return [];
    }
  }

  /**
   * Checks if a connection has been created for an agent
   * @param agentAccountId The account ID of the agent
   * @param connectionId The ID of the connection
   * @returns True if the connection has been created, false otherwise
   */
  public async hasConnectionCreated(
    agentAccountId: string,
    connectionId: number,
  ): Promise<boolean> {
    try {
      const outBoundTopic =
        await this.retrieveCommunicationTopics(agentAccountId);
      const messages = await this.retrieveOutboundMessages(
        outBoundTopic.outboundTopic,
      );
      return messages.some(
        msg =>
          msg.op === 'connection_created' && msg.connection_id === connectionId,
      );
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Failed to check connection created: ${error.message}`;
      this.logger.error(logMessage);
      return false;
    }
  }

  /**
   * Gets message content, resolving any HRL references if needed
   * @param data The data string that may contain an HRL reference
   * @param forceRaw Whether to force returning raw binary data
   * @returns The resolved content
   */
  async getMessageContent(
    data: string,
    forceRaw = false,
  ): Promise<string | ArrayBuffer> {
    if (!data.match(/^hcs:\/\/(\d+)\/([0-9]+\.[0-9]+\.[0-9]+)$/)) {
      return data;
    }

    try {
      const resolver = new HRLResolver(this.logger.getLevel());

      if (!resolver.isValidHRL(data)) {
        return data;
      }

      const result = await resolver.resolveHRL(data, {
        network: this.network as 'mainnet' | 'testnet',
        returnRaw: forceRaw,
      });

      return result.content;
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Error resolving HRL reference: ${error.message}`;
      this.logger.error(logMessage);
      throw new Error(logMessage);
    }
  }

  /**
   * Gets message content with its content type, resolving any HRL references if needed
   * @param data The data string that may contain an HRL reference
   * @param forceRaw Whether to force returning raw binary data
   * @returns The resolved content along with content type information
   */
  async getMessageContentWithType(
    data: string,
    forceRaw = false,
  ): Promise<{
    content: string | ArrayBuffer;
    contentType: string;
    isBinary: boolean;
  }> {
    if (!data.match(/^hcs:\/\/(\d+)\/([0-9]+\.[0-9]+\.[0-9]+)$/)) {
      return {
        content: data,
        contentType: 'text/plain',
        isBinary: false,
      };
    }

    try {
      const resolver = new HRLResolver(this.logger.getLevel());

      return await resolver.getContentWithType(data, {
        network: this.network as 'mainnet' | 'testnet',
        returnRaw: forceRaw,
      });
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Error resolving HRL reference with type: ${error.message}`;
      this.logger.error(logMessage);
      throw new Error(logMessage);
    }
  }

  /**
   * Submits a connection request to an inbound topic
   * @param inboundTopicId The ID of the inbound topic
   * @param memo An optional memo for the message
   * @returns The transaction receipt
   */
  async submitConnectionRequest(
    inboundTopicId: string,
    memo: string,
  ): Promise<TransactionReceipt> {
    const accountResponse = this.getAccountAndSigner();
    if (!accountResponse?.accountId) {
      throw new Error('Operator account ID is not set');
    }
    const operatorId = await this.getOperatorId();
    const accountId = accountResponse.accountId;

    const submissionCheck = await this.canSubmitToTopic(
      inboundTopicId,
      accountId,
    );

    if (!submissionCheck?.canSubmit) {
      throw new Error(`Cannot submit to topic: ${submissionCheck.reason}`);
    }

    const inboundAccountOwner =
      await this.retrieveInboundAccountId(inboundTopicId);

    if (!inboundAccountOwner) {
      throw new Error('Failed to retrieve topic info account ID');
    }

    const requiresFee = submissionCheck.requiresFee;

    const connectionRequestTx = buildHcs10SubmitConnectionRequestTx({
      inboundTopicId,
      operatorId,
      memo,
    });

    const response = await this.submitPayload(
      connectionRequestTx,
      undefined,
      undefined,
      requiresFee,
    );

    this.logger.info(
      `Submitted connection request to topic ID: ${inboundTopicId}`,
    );

    const outboundTopic = await this.retrieveCommunicationTopics(accountId);

    if (!outboundTopic) {
      throw new Error('Failed to retrieve outbound topic');
    }

    const responseSequenceNumber = response.topicSequenceNumber?.toNumber();

    if (!responseSequenceNumber) {
      throw new Error('Failed to get response sequence number');
    }

    const requestorOperatorId = `${inboundTopicId}@${inboundAccountOwner}`;

    const outboundRecordTx = buildHcs10OutboundConnectionRequestRecordTx({
      outboundTopicId: outboundTopic.outboundTopic,
      operatorId: requestorOperatorId,
      connectionRequestId: responseSequenceNumber,
      memo,
    });

    await this.submitPayload(outboundRecordTx);

    return response;
  }

  /**
   * Records an outbound connection confirmation
   * @param outboundTopicId The ID of the outbound topic
   * @param connectionRequestId The ID of the connection request
   * @param confirmedRequestId The ID of the confirmed request
   * @param connectionTopicId The ID of the connection topic
   * @param operatorId The operator ID of the original message sender.
   * @param memo An optional memo for the message
   */
  public async recordOutboundConnectionConfirmation({
    outboundTopicId,
    requestorOutboundTopicId,
    connectionRequestId,
    confirmedRequestId,
    connectionTopicId,
    operatorId,
    memo,
  }: {
    outboundTopicId: string;
    requestorOutboundTopicId: string;
    connectionRequestId: number;
    confirmedRequestId: number;
    connectionTopicId: string;
    operatorId: string;
    memo: string;
  }): Promise<TransactionReceipt> {
    const transaction = buildHcs10OutboundConnectionCreatedRecordTx({
      outboundTopicId,
      requestorOutboundTopicId,
      connectionTopicId,
      confirmedRequestId,
      connectionRequestId,
      operatorId,
      memo,
    });
    return await this.submitPayload(transaction);
  }

  /**
   * Waits for confirmation of a connection request
   * @param inboundTopicId Inbound topic ID
   * @param connectionRequestId Connection request ID
   * @param maxAttempts Maximum number of attempts
   * @param delayMs Delay between attempts in milliseconds
   * @returns Connection confirmation details
   */
  async waitForConnectionConfirmation(
    inboundTopicId: string,
    connectionRequestId: number,
    maxAttempts = 60,
    delayMs = 2000,
    recordConfirmation = true,
  ): Promise<WaitForConnectionConfirmationResponse> {
    this.logger.info(
      `Waiting for connection confirmation on inbound topic ${inboundTopicId} for request ID ${connectionRequestId}`,
    );

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      this.logger.info(
        `Attempt ${attempt + 1}/${maxAttempts} to find connection confirmation`,
      );

      const messages = await this.mirrorNode.getTopicMessages(inboundTopicId, {
        order: 'desc',
        limit: 100,
      });

      const connectionCreatedMessages = messages.filter(
        m => m.op === 'connection_created',
      );

      this.logger.info(
        `Found ${connectionCreatedMessages.length} connection_created messages`,
      );

      if (connectionCreatedMessages.length > 0) {
        for (const message of connectionCreatedMessages) {
          if (Number(message.connection_id) === Number(connectionRequestId)) {
            const confirmationResult = {
              connectionTopicId: message.connection_topic_id,
              sequence_number: Number(message.sequence_number),
              confirmedBy: message.operator_id,
              memo: message.m,
            };

            const confirmedByAccountId = this.extractAccountFromOperatorId(
              confirmationResult.confirmedBy,
            );

            const account = this.getAccountAndSigner();
            const confirmedByConnectionTopics =
              await this.retrieveCommunicationTopics(confirmedByAccountId);

            const agentConnectionTopics =
              await this.retrieveCommunicationTopics(account.accountId);

            this.logger.info(
              'Connection confirmation found',
              confirmationResult,
            );

            if (recordConfirmation) {
              await this.recordOutboundConnectionConfirmation({
                requestorOutboundTopicId:
                  confirmedByConnectionTopics.outboundTopic,
                outboundTopicId: agentConnectionTopics.outboundTopic,
                connectionRequestId,
                confirmedRequestId: confirmationResult.sequence_number,
                connectionTopicId: confirmationResult.connectionTopicId,
                operatorId: confirmationResult.confirmedBy,
                memo: confirmationResult.memo || 'Connection confirmed',
              });
            }

            return confirmationResult;
          }
        }
      }

      if (attempt < maxAttempts - 1) {
        this.logger.info(
          `No matching confirmation found, waiting ${delayMs}ms before retrying...`,
        );
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    throw new Error(
      `Connection confirmation not found after ${maxAttempts} attempts for request ID ${connectionRequestId}`,
    );
  }

  /**
   * Retrieves the operator ID for the current agent
   * @param disableCache Whether to disable caching of the result
   * @returns The operator ID
   */
  public async getOperatorId(disableCache?: boolean): Promise<string> {
    if (this.operatorId && !disableCache) {
      return this.operatorId;
    }

    const accountResponse = this.getAccountAndSigner();

    if (!accountResponse?.accountId) {
      throw new Error('Operator ID not found');
    }

    const profile = await this.retrieveProfile(accountResponse.accountId);

    if (!profile?.success) {
      throw new Error('Failed to retrieve profile');
    }

    if (!profile?.topicInfo?.inboundTopic) {
      throw new Error('Failed to retrieve inbound topic');
    }

    const operatorId = `${profile.topicInfo?.inboundTopic}@${accountResponse.accountId}`;
    this.operatorId = operatorId;
    return operatorId;
  }

  /**
   * Retrieves the account ID of the owner of an inbound topic
   * @param inboundTopicId The ID of the inbound topic
   * @returns The account ID of the owner of the inbound topic
   */
  public async retrieveInboundAccountId(
    inboundTopicId: string,
  ): Promise<string> {
    const topicInfo = await this.mirrorNode.getTopicInfo(inboundTopicId);

    if (!topicInfo?.memo) {
      throw new Error('Failed to retrieve topic info');
    }

    const topicInfoMemo = topicInfo.memo.toString();
    const topicInfoParts = topicInfoMemo.split(':');
    const inboundAccountOwner = topicInfoParts?.[4];

    if (!inboundAccountOwner) {
      throw new Error('Failed to retrieve topic info account ID');
    }

    return inboundAccountOwner;
  }

  public clearCache(): void {
    HCS10Cache.getInstance().clear();
  }

  /**
   * Generates a standard HCS-10 memo string.
   * @param type The type of topic memo ('inbound', 'outbound', 'connection').
   * @param options Configuration options for the memo.
   * @returns The formatted memo string.
   * @protected
   */
  protected _generateHcs10Memo(
    type: Hcs10MemoType,
    options: {
      ttl?: number;
      accountId?: string;
      inboundTopicId?: string;
      connectionId?: number;
    },
  ): string {
    const ttl = options.ttl ?? 60;

    switch (type) {
      case Hcs10MemoType.INBOUND:
        if (!options.accountId) {
          throw new Error('accountId is required for inbound memo');
        }
        return `hcs-10:0:${ttl}:0:${options.accountId}`;
      case Hcs10MemoType.OUTBOUND:
        return `hcs-10:0:${ttl}:1`;
      case Hcs10MemoType.CONNECTION:
        if (!options.inboundTopicId || options.connectionId === undefined) {
          throw new Error(
            'inboundTopicId and connectionId are required for connection memo',
          );
        }
        return `hcs-10:1:${ttl}:2:${options.inboundTopicId}:${options.connectionId}`;
      default:
        throw new Error(`Invalid HCS-10 memo type: ${type}`);
    }
  }

  /**
   * Reads a topic's memo and determines its HCS-10 type
   * @param topicId The topic ID to check
   * @returns The HCS-10 memo type or null if not an HCS-10 topic
   */
  public async getTopicMemoType(
    topicId: string,
  ): Promise<Hcs10MemoType | null> {
    try {
      const topicInfo = await this.mirrorNode.getTopicInfo(topicId);

      if (!topicInfo?.memo) {
        this.logger.debug(`No memo found for topic ${topicId}`);
        return null;
      }

      const memo = topicInfo.memo.toString();

      if (!memo.startsWith('hcs-10:')) {
        this.logger.debug(`Topic ${topicId} is not an HCS-10 topic`);
        return null;
      }

      const parts = memo.split(':');
      if (parts.length < 4) {
        this.logger.warn(
          `Invalid HCS-10 memo format for topic ${topicId}: ${memo}`,
        );
        return null;
      }

      const typeEnum = parts[3];

      switch (typeEnum) {
        case '0':
          return Hcs10MemoType.INBOUND;
        case '1':
          return Hcs10MemoType.OUTBOUND;
        case '2':
          return Hcs10MemoType.CONNECTION;
        case '3':
          return Hcs10MemoType.REGISTRY;
        default:
          this.logger.warn(
            `Unknown HCS-10 type enum: ${typeEnum} for topic ${topicId}`,
          );
          return null;
      }
    } catch (error) {
      this.logger.error(`Error getting topic memo type for ${topicId}:`, error);
      return null;
    }
  }

  protected async checkRegistrationStatus(
    transactionId: string,
    network: string,
    baseUrl: string,
  ): Promise<{ status: 'pending' | 'success' | 'failed' }> {
    try {
      const response = await fetch(`${baseUrl}/api/request-confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Network': network,
        },
        body: JSON.stringify({ transaction_id: transactionId }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to confirm registration: ${response.statusText}`,
        );
      }

      return await response.json();
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Error checking registration status: ${error.message}`;
      this.logger.error(logMessage);
      throw error;
    }
  }

  /**
   * Validates if an operator_id follows the correct format (agentTopicId@accountId)
   * @param operatorId The operator ID to validate
   * @returns True if the format is valid, false otherwise
   */
  protected isValidOperatorId(operatorId: string): boolean {
    if (!operatorId) {
      return false;
    }

    const parts = operatorId.split('@');

    if (parts.length !== 2) {
      return false;
    }

    const agentTopicId = parts[0];
    const accountId = parts[1];

    if (!agentTopicId) {
      return false;
    }

    if (!accountId) {
      return false;
    }

    const hederaIdPattern = /^[0-9]+\.[0-9]+\.[0-9]+$/;

    if (!hederaIdPattern.test(accountId)) {
      return false;
    }

    if (!hederaIdPattern.test(agentTopicId)) {
      return false;
    }

    return true;
  }

  /**
   * Retrieves all transaction requests from a topic
   * @param topicId The topic ID to retrieve transactions from
   * @param options Optional filtering and retrieval options
   * @returns Array of transaction requests sorted by timestamp (newest first)
   */
  public async getTransactionRequests(
    topicId: string,
    options?: {
      limit?: number;
      sequenceNumber?: string | number;
      order?: 'asc' | 'desc';
    },
  ): Promise<TransactMessage[]> {
    this.logger.debug(`Retrieving transaction requests from topic ${topicId}`);

    const { messages } = await this.getMessageStream(topicId, {
      limit: options?.limit,
      sequenceNumber: options?.sequenceNumber,
      order: options?.order || 'desc',
    });

    const transactOperations = (
      messages
        .filter(m => m.op === 'transaction' && m.schedule_id)
        .map(m => ({
          operator_id: m.operator_id || '',
          schedule_id: m.schedule_id || '',
          data: m.data || '',
          memo: m.m,
          sequence_number: Number(m.sequence_number),
        })) as unknown as TransactMessage[]
    ).sort((a, b) => {
      if (a.sequence_number && b.sequence_number) {
        return b.sequence_number - a.sequence_number;
      }
      return 0;
    });

    const result = options?.limit
      ? transactOperations.slice(0, options.limit)
      : transactOperations;

    return result;
  }

  /**
   * Gets the HCS-10 transaction memo for analytics based on the operation type
   * @param payload The operation payload
   * @returns The transaction memo in format hcs-10:op:{operation_enum}:{topic_type_enum}
   */
  protected getHcs10TransactionMemo(payload: object | string): string | null {
    if (typeof payload !== 'object' || !('op' in payload)) {
      return null;
    }

    const typedPayload = payload as HCSMessageWithCommonFields;
    const operation = typedPayload.op;
    let operationEnum: string;
    let topicTypeEnum: string;

    switch (operation) {
      case 'register':
        operationEnum = '0';
        topicTypeEnum = '0';
        break;
      case 'delete':
        operationEnum = '1';
        topicTypeEnum = '0';
        break;
      case 'migrate':
        operationEnum = '2';
        topicTypeEnum = '0';
        break;
      case 'connection_request':
        operationEnum = '3';
        topicTypeEnum = typedPayload.outbound_topic_id ? '2' : '1';
        break;
      case 'connection_created':
        operationEnum = '4';
        topicTypeEnum = typedPayload.outbound_topic_id ? '2' : '1';
        break;
      case 'connection_closed':
        operationEnum = '5';
        topicTypeEnum = typedPayload.outbound_topic_id ? '2' : '3';
        break;
      case 'message':
        operationEnum = '6';
        topicTypeEnum = '3';
        break;
      case 'close_connection':
        operationEnum = '5';
        topicTypeEnum = '3';
        break;
      case 'transaction':
        operationEnum = '6';
        topicTypeEnum = '3';
        break;
      default:
        operationEnum = '6';
        topicTypeEnum = '3';
    }

    return `hcs-10:op:${operationEnum}:${topicTypeEnum}`;
  }
}

export class HCS10Cache {
  private static instance: HCS10Cache;
  private cache: Map<string, ProfileResponse>;
  private cacheExpiry: Map<string, number>;
  private readonly CACHE_TTL = 3600000;

  private constructor() {
    this.cache = new Map();
    this.cacheExpiry = new Map();
  }

  static getInstance(): HCS10Cache {
    if (!HCS10Cache.instance) {
      HCS10Cache.instance = new HCS10Cache();
    }
    return HCS10Cache.instance;
  }

  set(key: string, value: ProfileResponse): void {
    this.cache.set(key, value);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
  }

  get(key: string): ProfileResponse | undefined {
    const expiry = this.cacheExpiry.get(key);
    if (expiry && expiry > Date.now()) {
      return this.cache.get(key);
    }
    if (expiry) {
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
    }
    return undefined;
  }

  clear(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }
}
