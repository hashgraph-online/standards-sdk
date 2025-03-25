import { HederaMirrorNode } from '../services/mirror-node';
import { Logger, LogLevel } from '../utils/logger';
import axios from 'axios';
import { Registration } from './registrations';
import { HCS11Client } from '../hcs-11';
import { AccountResponse, NetworkType } from '../services/types';
import { TopicInfo } from '../services/types';

export interface HCS10Config {
  network: 'mainnet' | 'testnet';
  logLevel?: LogLevel;
  prettyPrint?: boolean;
}

export interface HCSMessage {
  p: 'hcs-10';
  op: 'connection_request' | 'connection_created' | 'message';
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
  }

  abstract getAccountAndSigner(): { accountId: string; signer: any };

  public async getMessages(
    topicId: string
  ): Promise<{ messages: HCSMessage[] }> {
    try {
      const messages = await this.mirrorNode.getTopicMessages(topicId);
      return {
        messages: messages,
      };
    } catch (error: any) {
      if (this.logger) {
        this.logger.error(`Error fetching messages: ${error.message}`);
      }
      return { messages: [] };
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

  public async requestAccount(account: string): Promise<AccountResponse> {
    try {
      return await this.mirrorNode.requestAccount(account);
    } catch (e) {
      this.logger.error('Failed to fetch account', e);
      throw e;
    }
  }

  public async getAccountMemo(accountId: string): Promise<string | null> {
    return await this.mirrorNode.getAccountMemo(accountId);
  }

  public async retrieveProfile(accountId: string): Promise<ProfileResponse> {
    this.logger.info(`Retrieving profile for account: ${accountId}`);

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
      let topicInfo = null;

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

        const cacheKey = `${accountId}-${this.network}`;
        HCS10Cache.getInstance().set(cacheKey, topicInfo);
      }

      return {
        profile,
        topicInfo,
        success: true,
      };
    } catch (error) {
      this.logger.error('Failed to retrieve profile:', error);
      return {
        profile: null,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async retrieveOutboundConnectTopic(accountId: string): Promise<TopicInfo> {
    this.logger.info(`Retrieving topics for account: ${accountId}`);

    try {
      const profileResponse = await this.retrieveProfile(accountId);

      if (!profileResponse?.success) {
        throw new Error(profileResponse.error || 'Failed to retrieve profile');
      }

      const profile = profileResponse.profile;

      if (!profile.inboundTopicId || !profile.outboundTopicId) {
        throw new Error(
          `Invalid HCS-11 profile for HCS-10 agent: missing inboundTopicId or outboundTopicId`
        );
      }

      const topicInfo = {
        inboundTopic: profile.inboundTopicId,
        outboundTopic: profile.outboundTopicId,
        profileTopicId: profile.profileTopicId,
      };

      const cacheKey = `${accountId}-${this.network}`;
      HCS10Cache.getInstance().set(cacheKey, topicInfo);
      return topicInfo;
    } catch (error) {
      this.logger.error('Failed to retrieve topic info:', error);
      throw error;
    }
  }

  public async retrieveOutboundMessages(
    agentAccountId: string
  ): Promise<HCSMessage[]> {
    try {
      const topicInfo = await this.retrieveOutboundConnectTopic(agentAccountId);
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

  async hasConnectionCreated(
    agentAccountId: string,
    connectionId: number
  ): Promise<boolean> {
    try {
      const outBoundTopic = await this.retrieveOutboundConnectTopic(
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

  clearCache(): void {
    HCS10Cache.getInstance().clear();
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
}

export class HCS10Cache {
  private static instance: HCS10Cache;
  private cache: Map<string, TopicInfo>;
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

  set(key: string, value: TopicInfo): void {
    this.cache.set(key, value);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
  }

  get(key: string): TopicInfo | undefined {
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
