import { PublicKey, Timestamp } from '@hashgraph/sdk';
import axios from 'axios';
import { Logger } from '../utils/logger';
import { HCSMessage } from '../hcs-10/base-client';
import { proto } from '@hashgraph/proto';
import {
  AccountResponse,
  CustomFees,
  HBARPrice,
  TokenInfoResponse,
  TopicMessagesResponse,
  TopicResponse,
} from './types';
import { NetworkType } from '../utils/types';
export class HederaMirrorNode {
  private network: NetworkType;
  private baseUrl: string;
  private logger: Logger;
  private isServerEnvironment: boolean;

  constructor(network: NetworkType, logger: Logger) {
    this.network = network;
    this.baseUrl = this.getMirrorNodeUrl();
    this.logger = logger;
    this.isServerEnvironment = typeof window === 'undefined';
  }

  private getMirrorNodeUrl(): string {
    return this.network === 'mainnet'
      ? 'https://mainnet-public.mirrornode.hedera.com'
      : 'https://testnet.mirrornode.hedera.com';
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Retrieves the public key for a given account ID from the mirror node.
   * @param accountId The ID of the account to retrieve the public key for.
   * @returns A promise that resolves to the public key for the given account.
   * @throws An error if the account ID is invalid or the public key cannot be retrieved.
   */
  async getPublicKey(accountId: string): Promise<PublicKey> {
    this.logger.info(`Getting public key for account ${accountId}`);

    const accountInfo = await this.requestAccount(accountId);

    try {
      if (!accountInfo || !accountInfo.key) {
        throw new Error(
          `Failed to retrieve public key for account ID: ${accountId}`
        );
      }

      return PublicKey.fromString(accountInfo.key.key);
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Error fetching public key from Mirror Node: ${error.message}`;
      this.logger.error(logMessage);
      throw new Error(logMessage);
    }
  }

  /**
   * Retrieves the memo for a given account ID from the mirror node.
   * @param accountId The ID of the account to retrieve the memo for.
   * @returns A promise that resolves to the memo for the given account.
   * @throws An error if the account ID is invalid or the memo cannot be retrieved.
   */
  async getAccountMemo(accountId: string): Promise<string | null> {
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const accountInfoUrl = `${this.baseUrl}/api/v1/accounts/${accountId}`;

        const response = await axios.get(accountInfoUrl);
        const accountInfo = response.data;

        if (accountInfo && accountInfo.memo) {
          return accountInfo.memo;
        }

        this.logger.error(`No memo found for account ${accountId}`);

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (e: any) {
        const error = e as Error;
        const logMessage = `Error getting account memo (attempt ${attempt + 1}): ${error.message}`;
        this.logger.error(logMessage);

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    return null;
  }

  /**
   * Retrieves topic information for a given topic ID from the mirror node.
   * @param topicId The ID of the topic to retrieve information for.
   * @returns A promise that resolves to the topic information.
   * @throws An error if the topic ID is invalid or the information cannot be retrieved.
   */
  async getTopicInfo(topicId: string): Promise<TopicResponse> {
    try {
      const topicInfoUrl = `${this.baseUrl}/api/v1/topics/${topicId}`;
      const response = await axios.get(topicInfoUrl);
      return response.data;
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Error retrieving topic information: ${error.message}`;
      this.logger.error(logMessage);
      throw new Error(logMessage);
    }
  }

  /**
   * Retrieves custom fees for a given topic ID from the mirror node.
   * @param topicId The ID of the topic to retrieve custom fees for.
   * @returns A promise that resolves to the custom fees for the given topic.
   * @throws An error if the topic ID is invalid or the custom fees cannot be retrieved.
   */
  async getTopicFees(topicId: string): Promise<CustomFees | null> {
    try {
      const topicInfo = await this.getTopicInfo(topicId);
      return topicInfo.custom_fees;
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Error retrieving topic fees: ${error.message}`;
      this.logger.error(logMessage);
      return null;
    }
  }

  /**
   * Retrieves the current HBAR price from the mirror node.
   * @param date The date to retrieve the HBAR price for.
   * @returns A promise that resolves to the HBAR price for the given date.
   * @throws An error if the date is invalid or the price cannot be retrieved.
   */
  async getHBARPrice(date: Date): Promise<number | null> {
    try {
      const timestamp = Timestamp.fromDate(date).toString();

      const request = await fetch(
        `https://mainnet-public.mirrornode.hedera.com/api/v1/network/exchangerate?timestamp=${timestamp}`
      );
      const response = (await request.json()) as HBARPrice;

      const usdPrice =
        Number(response?.current_rate?.cent_equivalent) /
        Number(response?.current_rate?.hbar_equivalent) /
        100;

      return usdPrice;
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Error retrieving HBAR price: ${error.message}`;
      this.logger.error(logMessage);
      return null;
    }
  }

  /**
   * Retrieves token information for a given token ID from the mirror node.
   * @param tokenId The ID of the token to retrieve information for.
   * @returns A promise that resolves to the token information.
   * @throws An error if the token ID is invalid or the information cannot be retrieved.
   */
  async getTokenInfo(tokenId: string): Promise<TokenInfoResponse | null> {
    this.logger.debug(`Fetching token info for ${tokenId}`);
    try {
      const tokenInfoUrl = `${this.baseUrl}/api/v1/tokens/${tokenId}`;
      const response = await axios.get<TokenInfoResponse>(tokenInfoUrl);
      if (response.data) {
        this.logger.trace(`Token info found for ${tokenId}:`, response.data);
        return response.data;
      }
      this.logger.warn(`No token info found for ${tokenId}`);
      return null;
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Error fetching token info for ${tokenId}: ${error.message}`;
      this.logger.error(logMessage);

      return null;
    }
  }

  /**
   * Retrieves messages for a given topic ID from the mirror node.
   * @param topicId The ID of the topic to retrieve messages for.
   * @returns A promise that resolves to the messages for the given topic.
   * @throws An error if the topic ID is invalid or the messages cannot be retrieved.
   */
  async getTopicMessages(topicId: string): Promise<HCSMessage[]> {
    this.logger.trace(`Querying messages for topic ${topicId}`);

    let nextUrl = `${this.baseUrl}/api/v1/topics/${topicId}/messages`;
    const messages: HCSMessage[] = [];

    while (nextUrl) {
      try {
        const response = await axios.get<TopicMessagesResponse>(nextUrl);
        const data = response.data;

        if (data.messages && data.messages.length > 0) {
          for (const message of data.messages) {
            try {
              if (!message.message) {
                continue;
              }

              let messageContent: string;
              try {
                if (this.isServerEnvironment) {
                  messageContent = Buffer.from(
                    message.message,
                    'base64'
                  ).toString('utf-8');
                } else {
                  messageContent = new TextDecoder().decode(
                    Uint8Array.from(atob(message.message), (c) =>
                      c.charCodeAt(0)
                    )
                  );
                }
              } catch (error) {
                const logMessage = `Error decoding message: ${error}`;
                this.logger.error(logMessage);
                continue;
              }

              let messageJson;
              try {
                messageJson = JSON.parse(messageContent);
              } catch (error) {
                const logMessage = `Invalid JSON message content: ${messageContent}`;
                this.logger.error(logMessage);
                return;
              }

              messageJson.sequence_number = message.sequence_number;
              messages.push({
                ...messageJson,
                consensus_timestamp: message.consensus_timestamp,
                sequence_number: message.sequence_number,
                created: new Date(Number(message.consensus_timestamp) * 1000),
              });
            } catch (error: any) {
              const logMessage = `Error processing message: ${error.message}`;
              this.logger.error(logMessage);
            }
          }
        }

        nextUrl = data.links?.next ? `${this.baseUrl}${data.links.next}` : '';
      } catch (e: any) {
        const error = e as Error;
        const logMessage = `Error querying topic messages: ${error.message} on ${topicId}`;
        this.logger.error(logMessage);
        throw new Error(logMessage);
      }
    }

    return messages;
  }

  /**
   * Requests account information for a given account ID from the mirror node.
   * @param accountId The ID of the account to retrieve information for.
   * @returns A promise that resolves to the account information.
   * @throws An error if the account ID is invalid or the information cannot be retrieved.
   */
  async requestAccount(accountId: string): Promise<AccountResponse> {
    try {
      const accountInfoUrl = `${this.baseUrl}/api/v1/accounts/${accountId}`;
      const response = await axios.get(accountInfoUrl);
      if (!response.data) {
        throw new Error(
          `Failed to make request to mirror node for account: ${accountId}`
        );
      }
      return response.data;
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Failed to fetch account: ${error.message}`;
      this.logger.error(logMessage);
      throw new Error(logMessage);
    }
  }

  /**
   * Checks if a user has access to a given key list.
   * @param keyBytes The key list to check access for.
   * @param userPublicKey The public key of the user to check access for.
   * @returns A promise that resolves to true if the user has access, false otherwise.
   */
  async checkKeyListAccess(
    keyBytes: Buffer,
    userPublicKey: PublicKey
  ): Promise<boolean> {
    try {
      const key = proto.Key.decode(keyBytes);
      return this.evaluateKeyAccess(key, userPublicKey);
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Error decoding protobuf key: ${error.message}`;
      this.logger.error(logMessage);
      throw new Error(logMessage);
    }
  }

  /**
   * Evaluates the access of a given key to a user's public key.
   * @param key The key to evaluate access for.
   * @param userPublicKey The public key of the user to evaluate access for.
   * @returns A promise that resolves to true if the key has access, false otherwise.
   */
  private async evaluateKeyAccess(
    key: proto.IKey,
    userPublicKey: PublicKey
  ): Promise<boolean> {
    if (key.ed25519) {
      return this.compareEd25519Key(key.ed25519, userPublicKey);
    }

    if (key.keyList) {
      return this.evaluateKeyList(key.keyList, userPublicKey);
    }

    if (key.thresholdKey && key.thresholdKey.keys) {
      return this.evaluateKeyList(key.thresholdKey.keys, userPublicKey);
    }

    return false;
  }

  /**
   * Evaluates the access of a given key list to a user's public key.
   * @param keyList The key list to evaluate access for.
   * @param userPublicKey The public key of the user to evaluate access for.
   * @returns A promise that resolves to true if the key list has access, false otherwise.
   */
  private async evaluateKeyList(
    keyList: proto.IKeyList,
    userPublicKey: PublicKey
  ): Promise<boolean> {
    const keys = keyList.keys || [];

    for (const listKey of keys) {
      if (!listKey) continue;

      if (listKey.ed25519) {
        if (this.compareEd25519Key(listKey.ed25519, userPublicKey)) {
          return true;
        }
      } else if (listKey.keyList || listKey.thresholdKey) {
        try {
          const nestedKeyBytes = proto.Key.encode({
            ...(listKey.keyList ? { keyList: listKey.keyList } : {}),
            ...(listKey.thresholdKey
              ? { thresholdKey: listKey.thresholdKey }
              : {}),
          }).finish();

          const hasNestedAccess = await this.checkKeyListAccess(
            Buffer.from(nestedKeyBytes),
            userPublicKey
          );

          if (hasNestedAccess) {
            return true;
          }
        } catch (e: any) {
          const error = e as Error;
          const logMessage = `Error in nested key: ${error.message}`;
          this.logger.debug(logMessage);
        }
      }
    }

    return false;
  }

  /**
   * Compares an Ed25519 key with a user's public key.
   * @param keyData The Ed25519 key data to compare.
   * @param userPublicKey The public key of the user to compare with.
   * @returns A boolean indicating whether the key matches the user's public key.
   */
  private compareEd25519Key(
    keyData: Uint8Array,
    userPublicKey: PublicKey
  ): boolean {
    try {
      const decodedKey = PublicKey.fromBytes(Buffer.from(keyData));
      return decodedKey.toString() === userPublicKey.toString();
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Error comparing Ed25519 key: ${error.message}`;
      this.logger.debug(logMessage);
      return false;
    }
  }
}
