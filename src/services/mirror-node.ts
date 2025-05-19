import { PublicKey, Timestamp, AccountId } from '@hashgraph/sdk';
import axios, { AxiosRequestConfig } from 'axios';
import { Logger } from '../utils/logger';
import { HCSMessage } from '../hcs-10/base-client';
import { proto } from '@hashgraph/proto';
import {
  AccountResponse,
  CustomFees,
  HBARPrice,
  ScheduleInfo,
  TokenInfoResponse,
  TopicMessagesResponse,
  TopicResponse,
  Transaction as HederaTransaction,
  AccountTokenBalance,
  AccountTokensResponse,
  NftDetail,
  AccountNftsResponse,
  ContractCallQueryResponse,
} from './types';
import { NetworkType } from '../utils/types';

/**
 * Configuration for retry attempts.
 */
export interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
}

export class HederaMirrorNode {
  private network: NetworkType;
  private baseUrl: string;
  private logger: Logger;
  private isServerEnvironment: boolean;

  private maxRetries: number = 3;
  private initialDelayMs: number = 1000;
  private maxDelayMs: number = 30000;
  private backoffFactor: number = 2;

  constructor(network: NetworkType, logger: Logger) {
    this.network = network;
    this.baseUrl = this.getMirrorNodeUrl();
    this.logger = logger;
    this.isServerEnvironment = typeof window === 'undefined';
  }

  /**
   * Configures the retry mechanism for API requests.
   * @param config The retry configuration.
   */
  public configureRetry(config: RetryConfig): void {
    this.maxRetries = config.maxRetries ?? this.maxRetries;
    this.initialDelayMs = config.initialDelayMs ?? this.initialDelayMs;
    this.maxDelayMs = config.maxDelayMs ?? this.maxDelayMs;
    this.backoffFactor = config.backoffFactor ?? this.backoffFactor;
    this.logger.info(
      `Retry configuration updated: maxRetries=${this.maxRetries}, initialDelayMs=${this.initialDelayMs}, maxDelayMs=${this.maxDelayMs}, backoffFactor=${this.backoffFactor}`
    );
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
    this.logger.info(`Getting account memo for account ID: ${accountId}`);
    const accountInfoUrl = `${this.baseUrl}/api/v1/accounts/${accountId}`;

    try {
      const accountInfo = await this._requestWithRetry<AccountResponse>(
        accountInfoUrl
      );

      if (accountInfo && accountInfo.memo) {
        return accountInfo.memo;
      }
      this.logger.warn(`No memo found for account ${accountId}`);
      return null;
    } catch (e: any) {
      const error = e as Error;
      this.logger.error(
        `Failed to get account memo for ${accountId} after retries: ${error.message}`
      );
      return null;
    }
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
      this.logger.debug(`Fetching topic info from ${topicInfoUrl}`);
      const data = await this._requestWithRetry<TopicResponse>(topicInfoUrl);
      return data;
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Error retrieving topic information for ${topicId} after retries: ${error.message}`;
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
      const url = `https://mainnet-public.mirrornode.hedera.com/api/v1/network/exchangerate?timestamp=${timestamp}`;
      this.logger.debug(`Fetching HBAR price from ${url}`);

      const response = await this._fetchWithRetry<HBARPrice>(url);

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
      const data = await this._requestWithRetry<TokenInfoResponse>(
        tokenInfoUrl
      );
      if (data) {
        this.logger.trace(`Token info found for ${tokenId}:`, data);
        return data;
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
        const data = await this._requestWithRetry<TopicMessagesResponse>(
          nextUrl
        );

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
                continue;
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
        const logMessage = `Error querying topic messages for topic ${topicId} (URL: ${nextUrl}) after retries: ${error.message}`;
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
      this.logger.debug(`Requesting account info from ${accountInfoUrl}`);
      const data = await this._requestWithRetry<AccountResponse>(
        accountInfoUrl
      );
      if (!data) {
        throw new Error(
          `No data received from mirror node for account: ${accountId}`
        );
      }
      return data;
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Failed to fetch account ${accountId} after retries: ${error.message}`;
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

  /**
   * Retrieves information about a scheduled transaction
   * @param scheduleId The ID of the scheduled transaction
   * @returns A promise that resolves to the scheduled transaction information
   */
  async getScheduleInfo(scheduleId: string): Promise<ScheduleInfo | null> {
    try {
      this.logger.info(
        `Getting information for scheduled transaction ${scheduleId}`
      );

      const url = `${this.baseUrl}/api/v1/schedules/${scheduleId}`;
      const data = await this._requestWithRetry<ScheduleInfo>(url);

      if (data) {
        return data;
      }

      this.logger.warn(
        `No schedule info found for ${scheduleId} after retries.`
      );
      return null;
    } catch (error: any) {
      this.logger.error(
        `Error fetching schedule info for ${scheduleId} after retries: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Checks the status of a scheduled transaction
   * @param scheduleId The schedule ID to check
   * @returns Status of the scheduled transaction
   */
  public async getScheduledTransactionStatus(scheduleId: string): Promise<{
    executed: boolean;
    executedDate?: Date;
    deleted: boolean;
  }> {
    try {
      this.logger.info(
        `Checking status of scheduled transaction ${scheduleId}`
      );

      const scheduleInfo = await this.getScheduleInfo(scheduleId);

      if (!scheduleInfo) {
        throw new Error(`Schedule ${scheduleId} not found`);
      }

      return {
        executed: Boolean(scheduleInfo.executed_timestamp),
        executedDate: scheduleInfo.executed_timestamp
          ? new Date(Number(scheduleInfo.executed_timestamp) * 1000)
          : undefined,
        deleted: scheduleInfo.deleted || false,
      };
    } catch (error) {
      this.logger.error(
        `Error checking scheduled transaction status: ${error}`
      );
      throw error;
    }
  }

  /**
   * Retrieves details for a given transaction ID or hash from the mirror node.
   * @param transactionIdOrHash The ID or hash of the transaction.
   * @returns A promise that resolves to the transaction details.
   * @throws An error if the transaction ID/hash is invalid or details cannot be retrieved.
   */
  async getTransaction(
    transactionIdOrHash: string
  ): Promise<HederaTransaction | null> {
    this.logger.info(
      `Getting transaction details for ID/hash: ${transactionIdOrHash}`
    );
    const endpoint = transactionIdOrHash.includes('-')
      ? `transactions/${transactionIdOrHash}`
      : `transactions/${transactionIdOrHash}`;

    const transactionDetailsUrl = `${this.baseUrl}/api/v1/${endpoint}`;

    try {
      const response = await this._requestWithRetry<{
        transactions: HederaTransaction[];
      }>(transactionDetailsUrl);

      if (response?.transactions?.length > 0) {
        this.logger.trace(
          `Transaction details found for ${transactionIdOrHash}:`,
          response.transactions[0]
        );
        return response.transactions[0];
      }

      this.logger.warn(
        `No transaction details found for ${transactionIdOrHash} or unexpected response structure.`
      );
      return null;
    } catch (e: any) {
      const error = e as Error;
      this.logger.error(
        `Failed to get transaction details for ${transactionIdOrHash} after retries: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Private helper to make GET requests with retry logic using Axios.
   */
  private async _requestWithRetry<T>(
    url: string,
    axiosConfig?: AxiosRequestConfig
  ): Promise<T> {
    let attempt = 0;
    let delay = this.initialDelayMs;

    while (attempt < this.maxRetries) {
      try {
        const response = await axios.get<T>(url, axiosConfig);
        return response.data;
      } catch (error: any) {
        attempt++;
        const isLastAttempt = attempt >= this.maxRetries;
        const statusCode = error.response?.status;

        if (
          statusCode &&
          statusCode >= 400 &&
          statusCode < 500 &&
          statusCode !== 429
        ) {
          this.logger.error(
            `Client error for ${url} (status ${statusCode}): ${error.message}. Not retrying.`
          );
          throw error;
        }

        if (isLastAttempt) {
          this.logger.error(
            `Max retries (${this.maxRetries}) reached for ${url}. Last error: ${error.message}`
          );
          throw error;
        }

        this.logger.warn(
          `Attempt ${attempt}/${this.maxRetries} failed for ${url}: ${error.message}. Retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * this.backoffFactor, this.maxDelayMs);
      }
    }

    throw new Error(
      `Failed to fetch data from ${url} after ${this.maxRetries} attempts.`
    );
  }

  /**
   * Private helper to make fetch requests with retry logic.
   */
  private async _fetchWithRetry<T>(
    url: string,
    fetchOptions?: RequestInit
  ): Promise<T> {
    let attempt = 0;
    let delay = this.initialDelayMs;

    while (attempt < this.maxRetries) {
      try {
        const request = await fetch(url, fetchOptions);
        if (!request.ok) {
          if (
            request.status >= 400 &&
            request.status < 500 &&
            request.status !== 429
          ) {
            this.logger.error(
              `Client error for ${url} (status ${request.status}): ${request.statusText}. Not retrying.`
            );
            throw new Error(
              `Fetch failed with status ${request.status}: ${request.statusText} for URL: ${url}`
            );
          }
          throw new Error(
            `Fetch failed with status ${request.status}: ${request.statusText} for URL: ${url}`
          );
        }
        const response = (await request.json()) as T;
        return response;
      } catch (error: any) {
        attempt++;
        if (attempt >= this.maxRetries) {
          this.logger.error(
            `Max retries (${this.maxRetries}) reached for ${url}. Last error: ${error.message}`
          );
          throw error;
        }
        this.logger.warn(
          `Attempt ${attempt}/${this.maxRetries} failed for ${url}: ${error.message}. Retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * this.backoffFactor, this.maxDelayMs);
      }
    }
    throw new Error(
      `Failed to fetch data from ${url} after ${this.maxRetries} attempts.`
    );
  }

  /**
   * Retrieves the numerical balance (in HBAR) for a given account ID.
   * @param accountId The ID of the account.
   * @returns A promise that resolves to the HBAR balance or null if an error occurs.
   */
  async getAccountBalanceNumerical(accountId: string): Promise<number | null> {
    this.logger.info(`Getting numerical balance for account ${accountId}`);
    try {
      const accountInfo = await this.requestAccount(accountId);
      if (accountInfo && accountInfo.balance) {
        const hbarBalance = accountInfo.balance.balance / 100_000_000;
        return hbarBalance;
      }
      this.logger.warn(
        `Could not retrieve balance for account ${accountId} from account info.`
      );
      return null;
    } catch (error: any) {
      this.logger.error(
        `Error fetching numerical balance for account ${accountId}: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Retrieves messages for a given topic ID with optional filters.
   * @param topicId The ID of the topic.
   * @param sequenceNumber Filter by sequence number (e.g., "gt:10", "lte:20").
   * @param startTime Filter by consensus timestamp (e.g., "gt:1629400000.000000000").
   * @param endTime Filter by consensus timestamp (e.g., "lt:1629500000.000000000").
   * @param limit The maximum number of messages to return.
   * @returns A promise that resolves to an array of HCSMessages or null.
   */
  async getTopicMessagesByFilter(
    topicId: string,
    options?: {
      sequenceNumber?: string;
      startTime?: string;
      endTime?: string;
      limit?: number;
      order?: 'asc' | 'desc';
    }
  ): Promise<HCSMessage[] | null> {
    this.logger.trace(
      `Querying messages for topic ${topicId} with filters: ${JSON.stringify(
        options
      )}`
    );

    let nextUrl = `${this.baseUrl}/api/v1/topics/${topicId}/messages`;
    const params = new URLSearchParams();

    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    if (options?.sequenceNumber) {
      params.append('sequencenumber', options.sequenceNumber);
    }
    if (options?.startTime) {
      params.append('timestamp', `gte:${options.startTime}`);
    }
    if (options?.endTime) {
      params.append('timestamp', `lt:${options.endTime}`);
    }
    if (options?.order) {
      params.append('order', options.order);
    }

    const queryString = params.toString();
    if (queryString) {
      nextUrl += `?${queryString}`;
    }

    const messages: HCSMessage[] = [];
    let pagesFetched = 0;
    const maxPages = 10;

    try {
      while (nextUrl && pagesFetched < maxPages) {
        pagesFetched++;
        const data = await this._requestWithRetry<TopicMessagesResponse>(
          nextUrl
        );

        if (data.messages && data.messages.length > 0) {
          for (const message of data.messages) {
            try {
              if (!message.message) {
                continue;
              }
              let messageContent: string;
              if (this.isServerEnvironment) {
                messageContent = Buffer.from(
                  message.message,
                  'base64'
                ).toString('utf-8');
              } else {
                messageContent = new TextDecoder().decode(
                  Uint8Array.from(atob(message.message), (c) => c.charCodeAt(0))
                );
              }
              let messageJson = {};
              try {
                messageJson = JSON.parse(messageContent);
              } catch (parseError) {
                this.logger.debug(
                  `Message content is not valid JSON, using raw: ${messageContent}`
                );
                messageJson = { raw_content: messageContent };
              }

              const parsedContent = messageJson as any;

              const hcsMsg: HCSMessage = {
                ...parsedContent,
                consensus_timestamp: message.consensus_timestamp,
                sequence_number: message.sequence_number,
                payer_account_id: message.payer_account_id,
                topic_id: message.topic_id,
                running_hash: message.running_hash,
                running_hash_version: message.running_hash_version,
                chunk_info: message.chunk_info,
                created: new Date(
                  Number(message.consensus_timestamp.split('.')[0]) * 1000 +
                    Number(message.consensus_timestamp.split('.')[1] || 0) /
                      1_000_000
                ),
                payer: message.payer_account_id,
              };

              messages.push(hcsMsg);
            } catch (error: any) {
              this.logger.error(
                `Error processing individual message: ${error.message}`
              );
            }
          }
        }
        if (options?.limit && messages.length >= options.limit) break;
        nextUrl = data.links?.next ? `${this.baseUrl}${data.links.next}` : '';
      }
      return messages;
    } catch (e: any) {
      const error = e as Error;
      this.logger.error(
        `Error querying filtered topic messages for ${topicId}: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Retrieves token balances for a given account ID.
   * @param accountId The ID of the account.
   * @param limit The maximum number of tokens to return.
   * @returns A promise that resolves to an array of AccountTokenBalance or null.
   */
  async getAccountTokens(
    accountId: string,
    limit: number = 100
  ): Promise<AccountTokenBalance[] | null> {
    this.logger.info(`Getting tokens for account ${accountId}`);
    let allTokens: AccountTokenBalance[] = [];
    let url = `${this.baseUrl}/api/v1/accounts/${accountId}/tokens?limit=${limit}`;

    try {
      for (let i = 0; i < 10 && url; i++) {
        const response = await this._requestWithRetry<AccountTokensResponse>(
          url
        );
        if (response && response.tokens) {
          allTokens = allTokens.concat(response.tokens);
        }
        url = response.links?.next
          ? `${this.baseUrl}${response.links.next}`
          : '';
        if (!url || (limit && allTokens.length >= limit)) {
          if (limit && allTokens.length > limit) {
            allTokens = allTokens.slice(0, limit);
          }
          break;
        }
      }
      return allTokens;
    } catch (error: any) {
      this.logger.error(
        `Error fetching tokens for account ${accountId}: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Retrieves transaction details by consensus timestamp.
   * @param timestamp The consensus timestamp of the transaction (e.g., "1629400000.000000000").
   * @returns A promise that resolves to the transaction details or null.
   */
  async getTransactionByTimestamp(
    timestamp: string
  ): Promise<HederaTransaction | null> {
    this.logger.info(`Getting transaction by timestamp: ${timestamp}`);
    const url = `${this.baseUrl}/api/v1/transactions?timestamp=${timestamp}&limit=1`;

    try {
      const response = await this._requestWithRetry<{
        transactions: HederaTransaction[];
      }>(url);

      if (
        response &&
        response.transactions &&
        response.transactions.length > 0
      ) {
        const specificTransactionId = response.transactions[0].transaction_id;
        this.logger.debug(
          `Transaction found by timestamp, fetching full details for ID: ${specificTransactionId}`
        );
        return this.getTransaction(specificTransactionId);
      }
      this.logger.warn(`No transaction found for timestamp: ${timestamp}`);
      return null;
    } catch (error: any) {
      this.logger.error(
        `Error fetching transaction by timestamp ${timestamp}: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Retrieves NFTs for a given account ID, optionally filtered by token ID.
   * @param accountId The ID of the account.
   * @param tokenId Optional ID of the token to filter NFTs by.
   * @param limit The maximum number of NFTs to return per page (API has its own max).
   * @returns A promise that resolves to an array of NftDetail or null.
   */
  async getAccountNfts(
    accountId: string,
    tokenId?: string,
    limit: number = 100
  ): Promise<NftDetail[] | null> {
    this.logger.info(
      `Getting NFTs for account ${accountId}${
        tokenId ? ` for token ${tokenId}` : ''
      }`
    );
    let allNfts: NftDetail[] = [];
    let url = `${this.baseUrl}/api/v1/accounts/${accountId}/nfts?limit=${limit}`;
    if (tokenId) {
      url += `&token.id=${tokenId}`;
    }

    try {
      for (let i = 0; i < 10 && url; i++) {
        const response = await this._requestWithRetry<AccountNftsResponse>(url);
        if (response && response.nfts) {
          const nftsWithUri = response.nfts.map((nft) => {
            let tokenUri: string | undefined = undefined;
            if (nft.metadata) {
              try {
                if (this.isServerEnvironment) {
                  tokenUri = Buffer.from(nft.metadata, 'base64').toString(
                    'utf-8'
                  );
                } else {
                  tokenUri = new TextDecoder().decode(
                    Uint8Array.from(atob(nft.metadata), (c) => c.charCodeAt(0))
                  );
                }
              } catch (e) {
                this.logger.warn(
                  `Failed to decode metadata for NFT ${nft.token_id} SN ${
                    nft.serial_number
                  }: ${(e as Error).message}`
                );
              }
            }
            return { ...nft, token_uri: tokenUri };
          });
          allNfts = allNfts.concat(nftsWithUri);
        }
        url = response.links?.next
          ? `${this.baseUrl}${response.links.next}`
          : '';
        if (!url) break;
      }
      return allNfts;
    } catch (error: any) {
      this.logger.error(
        `Error fetching NFTs for account ${accountId}: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Validates NFT ownership by checking if a specific serial number of a token ID exists for an account.
   * @param accountId The ID of the account.
   * @param tokenId The ID of the NFT's token.
   * @param serialNumber The serial number of the NFT.
   * @returns A promise that resolves to the NftDetail if owned, or null otherwise.
   */
  async validateNFTOwnership(
    accountId: string,
    tokenId: string,
    serialNumber: number
  ): Promise<NftDetail | null> {
    this.logger.info(
      `Validating ownership of NFT ${tokenId} SN ${serialNumber} for account ${accountId}`
    );
    try {
      const nfts = await this.getAccountNfts(accountId, tokenId);
      if (nfts) {
        const foundNft = nfts.find(
          (nft) =>
            nft.token_id === tokenId && nft.serial_number === serialNumber
        );
        return foundNft || null;
      }
      return null;
    } catch (error: any) {
      this.logger.error(`Error validating NFT ownership: ${error.message}`);
      return null;
    }
  }

  /**
   * Performs a read-only query against a smart contract (eth_call like).
   * @param contractIdOrAddress The contract ID (e.g., "0.0.123") or EVM address (e.g., "0x...").
   * @param functionSelector The function selector and encoded parameters (e.g., "0xabcdef12...").
   * @param payerAccountId The account ID of the payer (not strictly payer for read-only, but often required as 'from').
   * @param estimate Whether this is an estimate call. Mirror node might not support this directly in /contracts/call for true estimation.
   * @param block Block parameter, e.g., "latest", "pending", or block number.
   * @param value The value in tinybars to send with the call (for payable view/pure functions, usually 0).
   * @returns A promise that resolves to the contract call query response or null.
   */
  async readSmartContractQuery(
    contractIdOrAddress: string,
    functionSelector: string,
    payerAccountId: string,
    options?: {
      estimate?: boolean;
      block?: string;
      value?: number;
      gas?: number;
      gasPrice?: number;
    }
  ): Promise<ContractCallQueryResponse | null> {
    this.logger.info(
      `Reading smart contract ${contractIdOrAddress} with selector ${functionSelector}`
    );
    const url = `${this.baseUrl}/api/v1/contracts/call`;

    const toAddress = contractIdOrAddress.startsWith('0x')
      ? contractIdOrAddress
      : `0x${AccountId.fromString(contractIdOrAddress).toSolidityAddress()}`;
    const fromAddress = payerAccountId.startsWith('0x')
      ? payerAccountId
      : `0x${AccountId.fromString(payerAccountId).toSolidityAddress()}`;

    const body: any = {
      block: options?.block || 'latest',
      data: functionSelector,
      estimate: options?.estimate || false,
      from: fromAddress,
      to: toAddress,
      gas: options?.gas,
      gasPrice: options?.gasPrice,
      value: options?.value || 0,
    };

    Object.keys(body).forEach((key) => {
      const K = key as keyof typeof body;
      if (body[K] === undefined) {
        delete body[K];
      }
    });

    try {
      const response = await this._fetchWithRetry<ContractCallQueryResponse>(
        url,
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      return response;
    } catch (error: any) {
      this.logger.error(
        `Error reading smart contract ${contractIdOrAddress}: ${error.message}`
      );
      return null;
    }
  }
}
