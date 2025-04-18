import { Logger, LogLevel } from '../utils/logger';
import { Registration } from './registrations';
import { HCS11Client } from '../hcs-11/client';
import { AccountResponse, TopicResponse } from '../services/types';
import { TopicInfo } from '../services/types';
import { TransactionReceipt, PrivateKey, PublicKey } from '@hashgraph/sdk';
import axios from 'axios';
import { NetworkType } from '../utils/types';
import { HederaMirrorNode } from '../services';

export enum Hcs10MemoType {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
  CONNECTION = 'connection',
}

export interface HCS10Config {
  network: 'mainnet' | 'testnet';
  logLevel?: LogLevel;
  prettyPrint?: boolean;
  feeAmount?: number;
}

export interface HCSMessage {
  p: 'hcs-10';
  op:
    | 'connection_request'
    | 'connection_created'
    | 'message'
    | 'close_connection';
  data: string;
  created?: Date;
  consensus_timestamp?: string;
  m?: string;
  payer: string;
  outbound_topic_id?: string;
  connection_request_id?: number;
  confirmed_request_id?: number;
  connection_topic_id?: string;
  connected_account_id?: string;
  requesting_account_id?: string;
  connection_id?: number;
  sequence_number: number;
  operator_id?: string;
  reason?: string;
  close_method?: string;
}

export interface ProfileResponse {
  profile: any;
  topicInfo?: TopicInfo;
  success: boolean;
  error?: string;
}

export abstract class HCS10BaseClient extends Registration {
  protected network: string;
  protected logger: Logger;
  protected mirrorNode: HederaMirrorNode;
  protected feeAmount: number;

  protected operatorId: string;

  constructor(config: HCS10Config) {
    super();
    this.network = config.network;
    this.logger = Logger.getInstance({
      level: config.logLevel || 'info',
      module: 'HCS10-BaseClient',
      prettyPrint: config.prettyPrint,
    });
    this.mirrorNode = new HederaMirrorNode(
      config.network as NetworkType,
      this.logger
    );
    this.feeAmount = config.feeAmount || 0.001;
  }

  abstract submitPayload(
    topicId: string,
    payload: object | string,
    submitKey?: PrivateKey,
    requiresFee?: boolean
  ): Promise<TransactionReceipt>;

  abstract getAccountAndSigner(): { accountId: string; signer: any };

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
   * @returns A stream of filtered messages valid for connection topics
   */
  public async getMessageStream(
    topicId: string
  ): Promise<{ messages: HCSMessage[] }> {
    try {
      const messages = await this.mirrorNode.getTopicMessages(topicId);
      const validOps = ['message', 'close_connection'];

      const filteredMessages = messages.filter((msg) => {
        if (msg.p !== 'hcs-10' || !validOps.includes(msg.op)) {
          return false;
        }

        if (msg.op === 'message') {
          if (!msg.data) {
            return false;
          }

          if (!msg.operator_id) {
            return false;
          }

          if (!this.isValidOperatorId(msg.operator_id)) {
            return false;
          }
        }

        if (msg.op === 'close_connection') {
          if (!msg.operator_id) {
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
        error
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
    userAccountId: string
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
            userPublicKey
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
          }`
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
   * @returns All messages from the topic
   */
  public async getMessages(
    topicId: string
  ): Promise<{ messages: HCSMessage[] }> {
    try {
      const messages = await this.mirrorNode.getTopicMessages(topicId);

      const validatedMessages = messages.filter((msg) => {
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
   * @returns The profile
   */
  public async retrieveProfile(
    accountId: string,
    disableCache?: boolean
  ): Promise<ProfileResponse> {
    this.logger.debug(`Retrieving profile for account: ${accountId}`);

    const cacheKey = `${accountId}-${this.network}`;

    if (!disableCache) {
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
          operatorId: '0.0.0', // Read-only operations only
        },
        logLevel: 'info',
      });

      const profileResult = await hcs11Client.fetchProfileByAccountId(
        accountId,
        this.network
      );

      if (!profileResult?.success) {
        this.logger.error(
          `Failed to retrieve profile for account ID: ${accountId}`,
          profileResult?.error
        );
        return {
          profile: null,
          success: false,
          error:
            profileResult?.error ||
            `Failed to retrieve profile for account ID: ${accountId}`,
        };
      }

      const profile = profileResult.profile;
      let topicInfo: TopicInfo | null = null;

      if (
        profileResult.topicInfo?.inboundTopic &&
        profileResult.topicInfo?.outboundTopic &&
        profileResult.topicInfo?.profileTopicId
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
    } catch (error) {
      this.logger.error('Failed to retrieve profile:', error);
      return {
        profile: null,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * @deprecated Use retrieveCommunicationTopics instead
   * @param accountId The account ID to retrieve the outbound connect topic for
   * @returns {TopicInfo} Topic Info from target profile.
   */
  public async retrieveOutboundConnectTopic(
    accountId: string
  ): Promise<TopicInfo> {
    return await this.retrieveCommunicationTopics(accountId, true);
  }

  /**
   * Retrieves the communication topics for an account
   * @param accountId The account ID to retrieve the communication topics for
   * @param disableCache Whether to disable caching of the result
   * @returns {TopicInfo} Topic Info from target profile.
   */
  public async retrieveCommunicationTopics(
    accountId: string,
    disableCache?: boolean
  ): Promise<TopicInfo> {
    this.logger.info(`Retrieving topics for account: ${accountId}`);
    const cacheKey = `${accountId}-${this.network}`;

    try {
      const profileResponse = await this.retrieveProfile(
        accountId,
        disableCache
      );

      if (!profileResponse?.success) {
        throw new Error(profileResponse.error || 'Failed to retrieve profile');
      }

      const profile = profileResponse.profile;

      if (!profile.inboundTopicId || !profile.outboundTopicId) {
        throw new Error(
          `Invalid HCS-11 profile for HCS-10 agent: missing inboundTopicId or outboundTopicId`
        );
      }

      if (!profileResponse.topicInfo) {
        throw new Error(
          `TopicInfo is missing in the profile for account ${accountId}`
        );
      }

      return profileResponse.topicInfo;
    } catch (error) {
      this.logger.error('Failed to retrieve topic info:', error);
      throw error;
    }
  }

  /**
   * Retrieves outbound messages for an agent
   * @param agentAccountId The account ID of the agent
   * @returns The outbound messages
   */
  public async retrieveOutboundMessages(
    agentAccountId: string
  ): Promise<HCSMessage[]> {
    try {
      const topicInfo = await this.retrieveCommunicationTopics(agentAccountId);
      if (!topicInfo) {
        this.logger.warn(
          `No outbound connect topic found for agentAccountId: ${agentAccountId}`
        );
        return [];
      }
      const response = await this.getMessages(topicInfo.outboundTopic);
      return response.messages.filter(
        (msg) =>
          msg.p === 'hcs-10' &&
          (msg.op === 'connection_request' ||
            msg.op === 'connection_created' ||
            msg.op === 'message')
      );
    } catch (error) {
      this.logger.error('Failed to retrieve outbound messages:', error);
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
    connectionId: number
  ): Promise<boolean> {
    try {
      const outBoundTopic = await this.retrieveCommunicationTopics(
        agentAccountId
      );
      const messages = await this.retrieveOutboundMessages(
        outBoundTopic.outboundTopic
      );
      return messages.some(
        (msg) =>
          msg.op === 'connection_created' && msg.connection_id === connectionId
      );
    } catch (error) {
      this.logger.error('Failed to check connection created:', error);
      return false;
    }
  }

  /**
   * Gets message content, resolving any HRL references if needed
   * @param data The message data which might be an HRL reference
   * @returns The resolved content
   */
  async getMessageContent(data: string): Promise<string> {
    const hrlPattern = /^hcs:\/\/(\d+)\/([0-9.]+)$/;
    const match = data.match(hrlPattern);

    if (!match) {
      return data;
    }

    const [_, standard, topicId] = match;

    this.logger.info(
      `Resolving HRL reference: standard=${standard}, topicId=${topicId}`
    );

    try {
      const cdnUrl = `https://kiloscribe.com/api/inscription-cdn/${topicId}?network=${this.network}`;
      const response = await axios.get(cdnUrl);

      if (!response.data) {
        throw new Error(`Failed to fetch content from topic: ${topicId}`);
      }

      return (
        response.data.content ||
        response.data.text ||
        JSON.stringify(response.data)
      );
    } catch (error) {
      this.logger.error(
        `Error resolving HRL reference: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      throw new Error(
        `Failed to resolve HRL reference: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
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
    memo: string
  ): Promise<TransactionReceipt> {
    const accountResponse = this.getAccountAndSigner();
    if (!accountResponse?.accountId) {
      throw new Error('Operator account ID is not set');
    }
    const operatorId = await this.getOperatorId();
    const accountId = accountResponse.accountId;

    const submissionCheck = await this.canSubmitToTopic(
      inboundTopicId,
      accountId
    );

    if (!submissionCheck?.canSubmit) {
      throw new Error(`Cannot submit to topic: ${submissionCheck.reason}`);
    }

    const inboundAccountOwner = await this.retrieveInboundAccountId(
      inboundTopicId
    );

    if (!inboundAccountOwner) {
      throw new Error('Failed to retrieve topic info account ID');
    }

    const connectionRequestMessage = {
      p: 'hcs-10',
      op: 'connection_request',
      operator_id: operatorId,
      m: memo,
    };

    const requiresFee = submissionCheck.requiresFee;
    const response = await this.submitPayload(
      inboundTopicId,
      connectionRequestMessage,
      undefined,
      requiresFee
    );

    this.logger.info(
      `Submitted connection request to topic ID: ${inboundTopicId}`
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

    await this.submitPayload(outboundTopic.outboundTopic, {
      ...connectionRequestMessage,
      outbound_topic_id: outboundTopic.outboundTopic,
      connection_request_id: responseSequenceNumber,
      operator_id: requestorOperatorId,
    });

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
    const payload = {
      p: 'hcs-10',
      op: 'connection_created',
      connection_topic_id: connectionTopicId,
      outbound_topic_id: outboundTopicId,
      requestor_outbound_topic_id: requestorOutboundTopicId,
      confirmed_request_id: confirmedRequestId,
      connection_request_id: connectionRequestId,
      operator_id: operatorId,
      m: memo,
    };
    return await this.submitPayload(outboundTopicId, payload);
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

    if (!accountResponse.accountId) {
      throw new Error('Operator ID not found');
    }

    const profile = await this.retrieveProfile(accountResponse.accountId);

    if (!profile.success) {
      throw new Error('Failed to retrieve profile');
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
    inboundTopicId: string
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
    }
  ): string {
    const ttl = options.ttl ?? 60; // Default TTL to 60 if not provided

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
            'inboundTopicId and connectionId are required for connection memo'
          );
        }
        return `hcs-10:1:${ttl}:2:${options.inboundTopicId}:${options.connectionId}`;
      default:
        throw new Error(`Invalid HCS-10 memo type: ${type}`);
    }
  }

  protected async checkRegistrationStatus(
    transactionId: string,
    network: string,
    baseUrl: string
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
          `Failed to confirm registration: ${response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      this.logger.error(`Error checking registration status: ${error}`);
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
