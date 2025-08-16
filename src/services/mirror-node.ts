import { PublicKey, Timestamp, AccountId } from '@hashgraph/sdk';
import axios, { AxiosRequestConfig } from 'axios';
import { Logger, ILogger } from '../utils/logger';
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
  TokenAirdrop,
  TokenAirdropsResponse,
  Block,
  BlocksResponse,
  ContractResult,
  ContractResultsResponse,
  ContractLog,
  ContractLogsResponse,
  ContractAction,
  ContractActionsResponse,
  ContractEntity,
  ContractsResponse,
  ContractState,
  ContractStateResponse,
  NftInfo,
  NftsResponse,
  NetworkInfo,
  NetworkFees,
  NetworkSupply,
  NetworkStake,
  OpcodesResponse,
  HCSMessageWithCommonFields,
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

/**
 * Configuration for custom mirror node providers.
 *
 * @example
 * // Using HGraph with API key in URL
 * const config = {
 *   customUrl: 'https://mainnet.hedera.api.hgraph.dev/v1/<API-KEY>',
 *   apiKey: 'your-api-key-here'
 * };
 *
 * @example
 * // Using custom provider with API key in headers
 * const config = {
 *   customUrl: 'https://custom-mirror-node.com',
 *   apiKey: 'your-api-key',
 *   headers: {
 *     'X-Custom-Header': 'value'
 *   }
 * };
 */
export interface MirrorNodeConfig {
  /** Custom mirror node URL. Can include <API-KEY> placeholder for URL-based API keys. */
  customUrl?: string;
  /** API key for authentication. Will be used in both Authorization header and URL replacement. */
  apiKey?: string;
  /** Additional custom headers to include with requests. */
  headers?: Record<string, string>;
}

export class HederaMirrorNode {
  private network: NetworkType;
  private baseUrl: string;
  private logger: ILogger;
  private isServerEnvironment: boolean;
  private apiKey?: string;
  private customHeaders: Record<string, string>;

  private maxRetries: number = 5;
  private initialDelayMs: number = 2000;
  private maxDelayMs: number = 30000;
  private backoffFactor: number = 2;

  constructor(
    network: NetworkType,
    logger?: ILogger,
    config?: MirrorNodeConfig,
  ) {
    this.network = network;
    this.apiKey = config?.apiKey;
    this.customHeaders = config?.headers || {};
    this.baseUrl = config?.customUrl || this.getMirrorNodeUrl();
    this.logger =
      logger ||
      new Logger({
        level: 'debug',
        module: 'MirrorNode',
      });
    this.isServerEnvironment = typeof window === 'undefined';

    if (config?.customUrl) {
      this.logger.info(`Using custom mirror node URL: ${config.customUrl}`);
    }
    if (config?.apiKey) {
      this.logger.info('Using API key for mirror node requests');
    }
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
      `Retry configuration updated: maxRetries=${this.maxRetries}, initialDelayMs=${this.initialDelayMs}, maxDelayMs=${this.maxDelayMs}, backoffFactor=${this.backoffFactor}`,
    );
  }

  /**
   * Updates the mirror node configuration.
   * @param config The new mirror node configuration.
   */
  public configureMirrorNode(config: MirrorNodeConfig): void {
    if (config.customUrl) {
      this.baseUrl = config.customUrl;
      this.logger.info(`Updated mirror node URL: ${config.customUrl}`);
    }
    if (config.apiKey) {
      this.apiKey = config.apiKey;
      this.logger.info('Updated API key for mirror node requests');
    }
    if (config.headers) {
      this.customHeaders = { ...this.customHeaders, ...config.headers };
      this.logger.info('Updated custom headers for mirror node requests');
    }
  }

  /**
   * Constructs a full URL for API requests, handling custom providers with API keys in the path.
   * @param endpoint The API endpoint (e.g., '/api/v1/accounts/0.0.123')
   * @returns The full URL for the request
   */
  private constructUrl(endpoint: string): string {
    if (this.baseUrl.includes('<API-KEY>') && this.apiKey) {
      const baseUrlWithKey = this.baseUrl.replace('<API-KEY>', this.apiKey);
      return endpoint.startsWith('/')
        ? `${baseUrlWithKey}${endpoint}`
        : `${baseUrlWithKey}/${endpoint}`;
    }
    return endpoint.startsWith('/')
      ? `${this.baseUrl}${endpoint}`
      : `${this.baseUrl}/${endpoint}`;
  }

  /**
   * Returns the base URL for the Hedera mirror node based on the network type
   * @returns The mirror node base URL
   * @private
   */
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
          `Failed to retrieve public key for account ID: ${accountId}`,
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

    try {
      const accountInfo = await this._requestWithRetry<AccountResponse>(
        `/api/v1/accounts/${accountId}`,
      );

      if (accountInfo?.memo) {
        return accountInfo.memo;
      }
      this.logger.warn(`No memo found for account ${accountId}`);
      return null;
    } catch (e: any) {
      const error = e as Error;
      this.logger.error(
        `Failed to get account memo for ${accountId} after retries: ${error.message}`,
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
      this.logger.debug(`Fetching topic info for ${topicId}`);
      const data = await this._requestWithRetry<TopicResponse>(
        `/api/v1/topics/${topicId}`,
      );
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
      this.logger.debug(`Fetching HBAR price for timestamp ${timestamp}`);

      const response = await this._requestWithRetry<HBARPrice>(
        `/api/v1/network/exchangerate?timestamp=${timestamp}`,
      );

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
      const data = await this._requestWithRetry<TokenInfoResponse>(
        `/api/v1/tokens/${tokenId}`,
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
   * Retrieves messages for a given topic ID from the mirror node. Supports filtering by sequence number
   * based on the OpenAPI specification.
   * @param topicId The ID of the topic to retrieve messages for.
   * @param options Optional filtering parameters.
   * @returns A promise that resolves to the messages for the given topic.
   */
  async getTopicMessages(
    topicId: string,
    options?: {
      sequenceNumber?: string | number;
      limit?: number;
      order?: 'asc' | 'desc';
    },
  ): Promise<HCSMessageWithCommonFields[]> {
    this.logger.trace(
      `Querying messages for topic ${topicId}${options ? ' with filters' : ''}`,
    );

    let endpoint = `/api/v1/topics/${topicId}/messages`;
    const params = new URLSearchParams();

    if (options) {
      if (options.sequenceNumber !== undefined) {
        const seqNum =
          typeof options.sequenceNumber === 'number'
            ? options.sequenceNumber.toString()
            : options.sequenceNumber;

        if (!seqNum.match(/^(gt|gte|lt|lte|eq|ne):/)) {
          params.append('sequencenumber', `gt:${seqNum}`);
        } else {
          params.append('sequencenumber', seqNum);
        }
      }

      if (options.limit) {
        params.append('limit', options.limit.toString());
      }

      if (options.order) {
        params.append('order', options.order);
      }
    }

    const queryString = params.toString();
    if (queryString) {
      endpoint += `?${queryString}`;
    }

    const messages: HCSMessageWithCommonFields[] = [];
    let nextEndpoint = endpoint;

    while (nextEndpoint) {
      try {
        const data =
          await this._requestWithRetry<TopicMessagesResponse>(nextEndpoint);

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
                    'base64',
                  ).toString('utf-8');
                } else {
                  messageContent = new TextDecoder().decode(
                    Uint8Array.from(atob(message.message), c =>
                      c.charCodeAt(0),
                    ),
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

        nextEndpoint = data.links?.next || '';
      } catch (e: any) {
        const error = e as Error;
        const logMessage = `Error querying topic messages for topic ${topicId} (endpoint: ${nextEndpoint}) after retries: ${error.message}`;
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
      this.logger.debug(`Requesting account info for ${accountId}`);
      const data = await this._requestWithRetry<AccountResponse>(
        `/api/v1/accounts/${accountId}`,
      );
      if (!data) {
        throw new Error(
          `No data received from mirror node for account: ${accountId}`,
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
    userPublicKey: PublicKey,
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
    userPublicKey: PublicKey,
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
    userPublicKey: PublicKey,
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
            userPublicKey,
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
    userPublicKey: PublicKey,
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
        `Getting information for scheduled transaction ${scheduleId}`,
      );

      const data = await this._requestWithRetry<ScheduleInfo>(
        `/api/v1/schedules/${scheduleId}`,
      );

      if (data) {
        return data;
      }

      this.logger.warn(
        `No schedule info found for ${scheduleId} after retries.`,
      );
      return null;
    } catch (error: any) {
      this.logger.error(
        `Error fetching schedule info for ${scheduleId} after retries: ${error.message}`,
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
        `Checking status of scheduled transaction ${scheduleId}`,
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
        `Error checking scheduled transaction status: ${error}`,
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
    transactionIdOrHash: string,
  ): Promise<HederaTransaction | null> {
    this.logger.info(
      `Getting transaction details for ID/hash: ${transactionIdOrHash}`,
    );

    try {
      const response = await this._requestWithRetry<{
        transactions: HederaTransaction[];
      }>(`/api/v1/transactions/${transactionIdOrHash}`);

      if (response?.transactions?.length > 0) {
        this.logger.trace(
          `Transaction details found for ${transactionIdOrHash}:`,
          response.transactions[0],
        );
        return response.transactions[0];
      }

      this.logger.warn(
        `No transaction details found for ${transactionIdOrHash} or unexpected response structure.`,
      );
      return null;
    } catch (e: any) {
      const error = e as Error;
      this.logger.error(
        `Failed to get transaction details for ${transactionIdOrHash} after retries: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Private helper to make GET requests with retry logic using Axios.
   */
  private async _requestWithRetry<T>(
    endpoint: string,
    axiosConfig?: AxiosRequestConfig,
  ): Promise<T> {
    let attempt = 0;
    let delay = this.initialDelayMs;
    const url = this.constructUrl(endpoint);

    const config: AxiosRequestConfig = {
      ...axiosConfig,
      headers: {
        ...this.customHeaders,
        ...axiosConfig?.headers,
      },
    };

    if (this.apiKey) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${this.apiKey}`,
        'X-API-Key': this.apiKey,
      };
    }

    while (attempt < this.maxRetries) {
      try {
        const response = await axios.get<T>(url, config);
        return response.data;
      } catch (error: any) {
        attempt++;
        const isLastAttempt = attempt >= this.maxRetries;
        const statusCode = error.response?.status;

        if (
          statusCode &&
          statusCode > 404 &&
          statusCode < 500 &&
          statusCode !== 429
        ) {
          this.logger.error(
            `Client error for ${url} (status ${statusCode}): ${error.message}. Not retrying.`,
          );
          throw error;
        }

        if (isLastAttempt) {
          this.logger.error(
            `Max retries (${this.maxRetries}) reached for ${url}. Last error: ${error.message}`,
          );
          throw error;
        }

        this.logger.warn(
          `Attempt ${attempt}/${this.maxRetries} failed for ${url}: ${error.message}. Retrying in ${delay}ms...`,
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * this.backoffFactor, this.maxDelayMs);
      }
    }

    throw new Error(
      `Failed to fetch data from ${url} after ${this.maxRetries} attempts.`,
    );
  }

  /**
   * Private helper to make fetch requests with retry logic.
   */
  private async _fetchWithRetry<T>(
    url: string,
    fetchOptions?: RequestInit,
  ): Promise<T> {
    let attempt = 0;
    let delay = this.initialDelayMs;

    const headers: Record<string, string> = {
      ...this.customHeaders,
    };

    if (fetchOptions?.headers) {
      if (fetchOptions.headers instanceof Headers) {
        fetchOptions.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(fetchOptions.headers)) {
        fetchOptions.headers.forEach(([key, value]) => {
          headers[key] = value;
        });
      } else {
        Object.assign(headers, fetchOptions.headers);
      }
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      headers['X-API-Key'] = this.apiKey;
    }

    const options: RequestInit = {
      ...fetchOptions,
      headers,
    };

    while (attempt < this.maxRetries) {
      try {
        const request = await fetch(url, options);
        if (!request.ok) {
          if (
            request.status >= 400 &&
            request.status < 500 &&
            request.status !== 429
          ) {
            this.logger.error(
              `Client error for ${url} (status ${request.status}): ${request.statusText}. Not retrying.`,
            );
            throw new Error(
              `Fetch failed with status ${request.status}: ${request.statusText} for URL: ${url}`,
            );
          }
          throw new Error(
            `Fetch failed with status ${request.status}: ${request.statusText} for URL: ${url}`,
          );
        }
        const response = (await request.json()) as T;
        return response;
      } catch (error: any) {
        attempt++;
        if (attempt >= this.maxRetries) {
          this.logger.error(
            `Max retries (${this.maxRetries}) reached for ${url}. Last error: ${error.message}`,
          );
          throw error;
        }
        this.logger.warn(
          `Attempt ${attempt}/${this.maxRetries} failed for ${url}: ${error.message}. Retrying in ${delay}ms...`,
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * this.backoffFactor, this.maxDelayMs);
      }
    }
    throw new Error(
      `Failed to fetch data from ${url} after ${this.maxRetries} attempts.`,
    );
  }

  /**
   * Retrieves the numerical balance (in HBAR) for a given account ID.
   * @param accountId The ID of the account.
   * @returns A promise that resolves to the HBAR balance or null if an error occurs.
   */
  async getAccountBalance(accountId: string): Promise<number | null> {
    this.logger.info(`Getting balance for account ${accountId}`);
    try {
      const accountInfo = await this.requestAccount(accountId);
      if (accountInfo && accountInfo.balance) {
        const hbarBalance = accountInfo.balance.balance / 100_000_000;
        return hbarBalance;
      }
      this.logger.warn(
        `Could not retrieve balance for account ${accountId} from account info.`,
      );
      return null;
    } catch (error: any) {
      this.logger.error(
        `Error fetching numerical balance for account ${accountId}: ${error.message}`,
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
    },
  ): Promise<HCSMessageWithCommonFields[] | null> {
    this.logger.trace(
      `Querying messages for topic ${topicId} with filters: ${JSON.stringify(
        options,
      )}`,
    );

    let nextUrl = `/api/v1/topics/${topicId}/messages`;
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

    const messages: HCSMessageWithCommonFields[] = [];
    let pagesFetched = 0;
    const maxPages = 10;

    try {
      while (nextUrl && pagesFetched < maxPages) {
        pagesFetched++;
        const data =
          await this._requestWithRetry<TopicMessagesResponse>(nextUrl);

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
                  'base64',
                ).toString('utf-8');
              } else {
                messageContent = new TextDecoder().decode(
                  Uint8Array.from(atob(message.message), c => c.charCodeAt(0)),
                );
              }
              let messageJson = {};
              try {
                messageJson = JSON.parse(messageContent);
              } catch (parseError) {
                this.logger.debug(
                  `Message content is not valid JSON, using raw: ${messageContent}`,
                );
                messageJson = { raw_content: messageContent };
              }

              const parsedContent = messageJson as any;

              const hcsMsg: HCSMessageWithCommonFields = {
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
                      1_000_000,
                ),
                payer: message.payer_account_id,
              };

              messages.push(hcsMsg);
            } catch (error: any) {
              this.logger.error(
                `Error processing individual message: ${error.message}`,
              );
            }
          }
        }
        if (options?.limit && messages.length >= options.limit) break;
        nextUrl = data.links?.next ? `${data.links.next}` : '';
      }
      return messages;
    } catch (e: any) {
      const error = e as Error;
      this.logger.error(
        `Error querying filtered topic messages for ${topicId}: ${error.message}`,
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
    limit: number = 100,
  ): Promise<AccountTokenBalance[] | null> {
    this.logger.info(`Getting tokens for account ${accountId}`);
    let allTokens: AccountTokenBalance[] = [];
    let endpoint = `/api/v1/accounts/${accountId}/tokens?limit=${limit}`;

    try {
      for (let i = 0; i < 10 && endpoint; i++) {
        const response =
          await this._requestWithRetry<AccountTokensResponse>(endpoint);
        if (response && response.tokens) {
          allTokens = allTokens.concat(response.tokens);
        }
        endpoint = response.links?.next || '';
        if (!endpoint || (limit && allTokens.length >= limit)) {
          if (limit && allTokens.length > limit) {
            allTokens = allTokens.slice(0, limit);
          }
          break;
        }
      }
      return allTokens;
    } catch (error: any) {
      this.logger.error(
        `Error fetching tokens for account ${accountId}: ${error.message}`,
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
    timestamp: string,
  ): Promise<HederaTransaction[]> {
    this.logger.info(`Getting transaction by timestamp: ${timestamp}`);

    try {
      const response = await this._requestWithRetry<{
        transactions: HederaTransaction[];
      }>(`/api/v1/transactions?timestamp=${timestamp}&limit=1`);

      return response.transactions;
    } catch (error: unknown) {
      this.logger.error(
        `Error fetching transaction by timestamp ${timestamp}: ${error}`,
      );
      return [];
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
    limit: number = 100,
  ): Promise<NftDetail[] | null> {
    this.logger.info(
      `Getting NFTs for account ${accountId}${
        tokenId ? ` for token ${tokenId}` : ''
      }`,
    );
    let allNfts: NftDetail[] = [];
    let endpoint = `/api/v1/accounts/${accountId}/nfts?limit=${limit}`;
    if (tokenId) {
      endpoint += `&token.id=${tokenId}`;
    }

    try {
      for (let i = 0; i < 10 && endpoint; i++) {
        const response =
          await this._requestWithRetry<AccountNftsResponse>(endpoint);
        if (response && response.nfts) {
          const nftsWithUri = response.nfts.map(nft => {
            let tokenUri: string | undefined = undefined;
            if (nft.metadata) {
              try {
                if (this.isServerEnvironment) {
                  tokenUri = Buffer.from(nft.metadata, 'base64').toString(
                    'utf-8',
                  );
                } else {
                  tokenUri = new TextDecoder().decode(
                    Uint8Array.from(atob(nft.metadata), c => c.charCodeAt(0)),
                  );
                }
              } catch (e) {
                this.logger.warn(
                  `Failed to decode metadata for NFT ${nft.token_id} SN ${
                    nft.serial_number
                  }: ${(e as Error).message}`,
                );
              }
            }
            return { ...nft, token_uri: tokenUri };
          });
          allNfts = allNfts.concat(nftsWithUri);
        }
        endpoint = response.links?.next || '';
        if (!endpoint) break;
      }
      return allNfts;
    } catch (error: any) {
      this.logger.error(
        `Error fetching NFTs for account ${accountId}: ${error.message}`,
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
    serialNumber: number,
  ): Promise<NftDetail | null> {
    this.logger.info(
      `Validating ownership of NFT ${tokenId} SN ${serialNumber} for account ${accountId}`,
    );
    try {
      const nfts = await this.getAccountNfts(accountId, tokenId);
      if (nfts) {
        const foundNft = nfts.find(
          nft => nft.token_id === tokenId && nft.serial_number === serialNumber,
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
    },
  ): Promise<ContractCallQueryResponse | null> {
    this.logger.info(
      `Reading smart contract ${contractIdOrAddress} with selector ${functionSelector}`,
    );

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

    Object.keys(body).forEach(key => {
      const K = key as keyof typeof body;
      if (body[K] === undefined) {
        delete body[K];
      }
    });

    try {
      const url = this.constructUrl('/api/v1/contracts/call');
      const response = await this._fetchWithRetry<ContractCallQueryResponse>(
        url,
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
      return response;
    } catch (error: any) {
      this.logger.error(
        `Error reading smart contract ${contractIdOrAddress}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Retrieves outstanding token airdrops sent by an account.
   * @param accountId The ID of the account that sent the airdrops.
   * @param options Optional parameters for filtering airdrops.
   * @returns A promise that resolves to an array of TokenAirdrop or null.
   */
  async getOutstandingTokenAirdrops(
    accountId: string,
    options?: {
      limit?: number;
      order?: 'asc' | 'desc';
      receiverId?: string;
      serialNumber?: string;
      tokenId?: string;
    },
  ): Promise<TokenAirdrop[] | null> {
    this.logger.info(
      `Getting outstanding token airdrops sent by account ${accountId}`,
    );
    let endpoint = `/api/v1/accounts/${accountId}/airdrops/outstanding`;
    const params = new URLSearchParams();

    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    if (options?.order) {
      params.append('order', options.order);
    }
    if (options?.receiverId) {
      params.append('receiver.id', options.receiverId);
    }
    if (options?.serialNumber) {
      params.append('serialnumber', options.serialNumber);
    }
    if (options?.tokenId) {
      params.append('token.id', options.tokenId);
    }

    const queryString = params.toString();
    if (queryString) {
      endpoint += `?${queryString}`;
    }

    try {
      const response =
        await this._requestWithRetry<TokenAirdropsResponse>(endpoint);
      return response.airdrops || [];
    } catch (error: any) {
      this.logger.error(
        `Error fetching outstanding token airdrops for account ${accountId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Retrieves pending token airdrops received by an account.
   * @param accountId The ID of the account that received the airdrops.
   * @param options Optional parameters for filtering airdrops.
   * @returns A promise that resolves to an array of TokenAirdrop or null.
   */
  async getPendingTokenAirdrops(
    accountId: string,
    options?: {
      limit?: number;
      order?: 'asc' | 'desc';
      senderId?: string;
      serialNumber?: string;
      tokenId?: string;
    },
  ): Promise<TokenAirdrop[] | null> {
    this.logger.info(
      `Getting pending token airdrops received by account ${accountId}`,
    );
    let endpoint = `/api/v1/accounts/${accountId}/airdrops/pending`;
    const params = new URLSearchParams();

    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    if (options?.order) {
      params.append('order', options.order);
    }
    if (options?.senderId) {
      params.append('sender.id', options.senderId);
    }
    if (options?.serialNumber) {
      params.append('serialnumber', options.serialNumber);
    }
    if (options?.tokenId) {
      params.append('token.id', options.tokenId);
    }

    const queryString = params.toString();
    if (queryString) {
      endpoint += `?${queryString}`;
    }

    try {
      const response =
        await this._requestWithRetry<TokenAirdropsResponse>(endpoint);
      return response.airdrops || [];
    } catch (error: any) {
      this.logger.error(
        `Error fetching pending token airdrops for account ${accountId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Retrieves blocks from the network.
   * @param options Optional parameters for filtering blocks.
   * @returns A promise that resolves to an array of Block or null.
   */
  async getBlocks(options?: {
    limit?: number;
    order?: 'asc' | 'desc';
    timestamp?: string;
    blockNumber?: string;
  }): Promise<Block[] | null> {
    this.logger.info('Getting blocks from the network');
    let endpoint = `/api/v1/blocks`;
    const params = new URLSearchParams();

    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    if (options?.order) {
      params.append('order', options.order);
    }
    if (options?.timestamp) {
      params.append('timestamp', options.timestamp);
    }
    if (options?.blockNumber) {
      params.append('block.number', options.blockNumber);
    }

    const queryString = params.toString();
    if (queryString) {
      endpoint += `?${queryString}`;
    }

    try {
      const response = await this._requestWithRetry<BlocksResponse>(endpoint);
      return response.blocks || [];
    } catch (error: any) {
      this.logger.error(`Error fetching blocks: ${error.message}`);
      return null;
    }
  }

  /**
   * Retrieves a specific block by number or hash.
   * @param blockNumberOrHash The block number or hash.
   * @returns A promise that resolves to a Block or null.
   */
  async getBlock(blockNumberOrHash: string): Promise<Block | null> {
    this.logger.info(`Getting block ${blockNumberOrHash}`);
    try {
      const response = await this._requestWithRetry<Block>(
        `/api/v1/blocks/${blockNumberOrHash}`,
      );
      return response;
    } catch (error: any) {
      this.logger.error(
        `Error fetching block ${blockNumberOrHash}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Retrieves contract entities from the network.
   * @param options Optional parameters for filtering contracts.
   * @returns A promise that resolves to an array of ContractEntity or null.
   */
  async getContracts(options?: {
    contractId?: string;
    limit?: number;
    order?: 'asc' | 'desc';
  }): Promise<ContractEntity[] | null> {
    this.logger.info('Getting contracts from the network');
    let url = `/api/v1/contracts`;
    const params = new URLSearchParams();

    if (options?.contractId) {
      params.append('contract.id', options.contractId);
    }
    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    if (options?.order) {
      params.append('order', options.order);
    }

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    try {
      const response = await this._requestWithRetry<ContractsResponse>(url);
      return response.contracts || [];
    } catch (error: any) {
      this.logger.error(`Error fetching contracts: ${error.message}`);
      return null;
    }
  }

  /**
   * Retrieves a specific contract by ID or address.
   * @param contractIdOrAddress The contract ID or EVM address.
   * @param timestamp Optional timestamp for historical data.
   * @returns A promise that resolves to a ContractEntity or null.
   */
  async getContract(
    contractIdOrAddress: string,
    timestamp?: string,
  ): Promise<ContractEntity | null> {
    this.logger.info(`Getting contract ${contractIdOrAddress}`);
    let url = `/api/v1/contracts/${contractIdOrAddress}`;

    if (timestamp) {
      url += `?timestamp=${timestamp}`;
    }

    try {
      const response = await this._requestWithRetry<ContractEntity>(url);
      return response;
    } catch (error: any) {
      this.logger.error(
        `Error fetching contract ${contractIdOrAddress}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Retrieves contract results from the network.
   * @param options Optional parameters for filtering contract results.
   * @returns A promise that resolves to an array of ContractResult or null.
   */
  async getContractResults(options?: {
    from?: string;
    blockHash?: string;
    blockNumber?: string;
    internal?: boolean;
    limit?: number;
    order?: 'asc' | 'desc';
    timestamp?: string;
    transactionIndex?: number;
  }): Promise<ContractResult[] | null> {
    this.logger.info('Getting contract results from the network');
    let url = `/api/v1/contracts/results`;
    const params = new URLSearchParams();

    if (options?.from) {
      params.append('from', options.from);
    }
    if (options?.blockHash) {
      params.append('block.hash', options.blockHash);
    }
    if (options?.blockNumber) {
      params.append('block.number', options.blockNumber);
    }
    if (options?.internal !== undefined) {
      params.append('internal', options.internal.toString());
    }
    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    if (options?.order) {
      params.append('order', options.order);
    }
    if (options?.timestamp) {
      params.append('timestamp', options.timestamp);
    }
    if (options?.transactionIndex) {
      params.append('transaction.index', options.transactionIndex.toString());
    }

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    try {
      const response =
        await this._requestWithRetry<ContractResultsResponse>(url);
      return response.results || [];
    } catch (error: any) {
      this.logger.error(`Error fetching contract results: ${error.message}`);
      return null;
    }
  }

  /**
   * Retrieves a specific contract result by transaction ID or hash.
   * @param transactionIdOrHash The transaction ID or hash.
   * @param nonce Optional nonce filter.
   * @returns A promise that resolves to a ContractResult or null.
   */
  async getContractResult(
    transactionIdOrHash: string,
    nonce?: number,
  ): Promise<ContractResult | null> {
    this.logger.info(`Getting contract result for ${transactionIdOrHash}`);
    let url = `/api/v1/contracts/results/${transactionIdOrHash}`;

    if (nonce !== undefined) {
      url += `?nonce=${nonce}`;
    }

    try {
      const response = await this._requestWithRetry<ContractResult>(url);
      return response;
    } catch (error: any) {
      this.logger.error(
        `Error fetching contract result for ${transactionIdOrHash}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Retrieves contract results for a specific contract.
   * @param contractIdOrAddress The contract ID or EVM address.
   * @param options Optional parameters for filtering.
   * @returns A promise that resolves to an array of ContractResult or null.
   */
  async getContractResultsByContract(
    contractIdOrAddress: string,
    options?: {
      blockHash?: string;
      blockNumber?: string;
      from?: string;
      internal?: boolean;
      limit?: number;
      order?: 'asc' | 'desc';
      timestamp?: string;
      transactionIndex?: number;
    },
  ): Promise<ContractResult[] | null> {
    this.logger.info(
      `Getting contract results for contract ${contractIdOrAddress}`,
    );
    let url = `/api/v1/contracts/${contractIdOrAddress}/results`;
    const params = new URLSearchParams();

    if (options?.blockHash) {
      params.append('block.hash', options.blockHash);
    }
    if (options?.blockNumber) {
      params.append('block.number', options.blockNumber);
    }
    if (options?.from) {
      params.append('from', options.from);
    }
    if (options?.internal !== undefined) {
      params.append('internal', options.internal.toString());
    }
    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    if (options?.order) {
      params.append('order', options.order);
    }
    if (options?.timestamp) {
      params.append('timestamp', options.timestamp);
    }
    if (options?.transactionIndex) {
      params.append('transaction.index', options.transactionIndex.toString());
    }

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    try {
      const response =
        await this._requestWithRetry<ContractResultsResponse>(url);
      return response.results || [];
    } catch (error: any) {
      this.logger.error(
        `Error fetching contract results for ${contractIdOrAddress}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Retrieves contract state for a specific contract.
   * @param contractIdOrAddress The contract ID or EVM address.
   * @param options Optional parameters for filtering.
   * @returns A promise that resolves to an array of ContractState or null.
   */
  async getContractState(
    contractIdOrAddress: string,
    options?: {
      limit?: number;
      order?: 'asc' | 'desc';
      slot?: string;
      timestamp?: string;
    },
  ): Promise<ContractState[] | null> {
    this.logger.info(`Getting contract state for ${contractIdOrAddress}`);
    let url = `/api/v1/contracts/${contractIdOrAddress}/state`;
    const params = new URLSearchParams();

    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    if (options?.order) {
      params.append('order', options.order);
    }
    if (options?.slot) {
      params.append('slot', options.slot);
    }
    if (options?.timestamp) {
      params.append('timestamp', options.timestamp);
    }

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    try {
      const response = await this._requestWithRetry<ContractStateResponse>(url);
      return response.state || [];
    } catch (error: any) {
      this.logger.error(
        `Error fetching contract state for ${contractIdOrAddress}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Retrieves contract actions for a specific transaction.
   * @param transactionIdOrHash The transaction ID or hash.
   * @param options Optional parameters for filtering.
   * @returns A promise that resolves to an array of ContractAction or null.
   */
  async getContractActions(
    transactionIdOrHash: string,
    options?: {
      index?: string;
      limit?: number;
      order?: 'asc' | 'desc';
    },
  ): Promise<ContractAction[] | null> {
    this.logger.info(`Getting contract actions for ${transactionIdOrHash}`);
    let url = `/api/v1/contracts/results/${transactionIdOrHash}/actions`;
    const params = new URLSearchParams();

    if (options?.index) {
      params.append('index', options.index);
    }
    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    if (options?.order) {
      params.append('order', options.order);
    }

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    try {
      const response =
        await this._requestWithRetry<ContractActionsResponse>(url);
      return response.actions || [];
    } catch (error: any) {
      this.logger.error(
        `Error fetching contract actions for ${transactionIdOrHash}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Retrieves contract logs from the network.
   * @param options Optional parameters for filtering logs.
   * @returns A promise that resolves to an array of ContractLog or null.
   */
  async getContractLogs(options?: {
    index?: string;
    limit?: number;
    order?: 'asc' | 'desc';
    timestamp?: string;
    topic0?: string;
    topic1?: string;
    topic2?: string;
    topic3?: string;
    transactionHash?: string;
  }): Promise<ContractLog[] | null> {
    this.logger.info('Getting contract logs from the network');
    let url = `/api/v1/contracts/results/logs`;
    const params = new URLSearchParams();

    if (options?.index) {
      params.append('index', options.index);
    }
    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    if (options?.order) {
      params.append('order', options.order);
    }
    if (options?.timestamp) {
      params.append('timestamp', options.timestamp);
    }
    if (options?.topic0) {
      params.append('topic0', options.topic0);
    }
    if (options?.topic1) {
      params.append('topic1', options.topic1);
    }
    if (options?.topic2) {
      params.append('topic2', options.topic2);
    }
    if (options?.topic3) {
      params.append('topic3', options.topic3);
    }
    if (options?.transactionHash) {
      params.append('transaction.hash', options.transactionHash);
    }

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    try {
      const response = await this._requestWithRetry<ContractLogsResponse>(url);
      return response.logs || [];
    } catch (error: any) {
      this.logger.error(`Error fetching contract logs: ${error.message}`);
      return null;
    }
  }

  /**
   * Retrieves contract logs for a specific contract.
   * @param contractIdOrAddress The contract ID or EVM address.
   * @param options Optional parameters for filtering logs.
   * @returns A promise that resolves to an array of ContractLog or null.
   */
  async getContractLogsByContract(
    contractIdOrAddress: string,
    options?: {
      index?: string;
      limit?: number;
      order?: 'asc' | 'desc';
      timestamp?: string;
      topic0?: string;
      topic1?: string;
      topic2?: string;
      topic3?: string;
    },
  ): Promise<ContractLog[] | null> {
    this.logger.info(
      `Getting contract logs for contract ${contractIdOrAddress}`,
    );
    let url = `/api/v1/contracts/${contractIdOrAddress}/results/logs`;
    const params = new URLSearchParams();

    if (options?.index) {
      params.append('index', options.index);
    }
    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    if (options?.order) {
      params.append('order', options.order);
    }
    if (options?.timestamp) {
      params.append('timestamp', options.timestamp);
    }
    if (options?.topic0) {
      params.append('topic0', options.topic0);
    }
    if (options?.topic1) {
      params.append('topic1', options.topic1);
    }
    if (options?.topic2) {
      params.append('topic2', options.topic2);
    }
    if (options?.topic3) {
      params.append('topic3', options.topic3);
    }

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    try {
      const response = await this._requestWithRetry<ContractLogsResponse>(url);
      return response.logs || [];
    } catch (error: any) {
      this.logger.error(
        `Error fetching contract logs for ${contractIdOrAddress}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Retrieves NFT information by token ID and serial number.
   * @param tokenId The token ID.
   * @param serialNumber The serial number of the NFT.
   * @returns A promise that resolves to an NftInfo or null.
   */
  async getNftInfo(
    tokenId: string,
    serialNumber: number,
  ): Promise<NftInfo | null> {
    this.logger.info(`Getting NFT info for ${tokenId}/${serialNumber}`);
    const url = `/api/v1/tokens/${tokenId}/nfts/${serialNumber}`;

    try {
      const response = await this._requestWithRetry<NftInfo>(url);
      return response;
    } catch (error: any) {
      this.logger.error(
        `Error fetching NFT info for ${tokenId}/${serialNumber}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Retrieves NFTs for a specific token.
   * @param tokenId The token ID.
   * @param options Optional parameters for filtering NFTs.
   * @returns A promise that resolves to an array of NftInfo or null.
   */
  async getNftsByToken(
    tokenId: string,
    options?: {
      accountId?: string;
      limit?: number;
      order?: 'asc' | 'desc';
      serialNumber?: string;
    },
  ): Promise<NftInfo[] | null> {
    this.logger.info(`Getting NFTs for token ${tokenId}`);
    let url = `/api/v1/tokens/${tokenId}/nfts`;
    const params = new URLSearchParams();

    if (options?.accountId) {
      params.append('account.id', options.accountId);
    }
    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    if (options?.order) {
      params.append('order', options.order);
    }
    if (options?.serialNumber) {
      params.append('serialnumber', options.serialNumber);
    }

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    try {
      const response = await this._requestWithRetry<NftsResponse>(url);
      return response.nfts || [];
    } catch (error: any) {
      this.logger.error(
        `Error fetching NFTs for token ${tokenId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Retrieves network information.
   * @returns A promise that resolves to NetworkInfo or null.
   */
  async getNetworkInfo(): Promise<NetworkInfo | null> {
    this.logger.info('Getting network information');
    const url = `/api/v1/network/nodes`;

    try {
      const response = await this._requestWithRetry<NetworkInfo>(url);
      return response;
    } catch (error: any) {
      this.logger.error(`Error fetching network info: ${error.message}`);
      return null;
    }
  }

  /**
   * Retrieves network fees.
   * @param timestamp Optional timestamp for historical fees.
   * @returns A promise that resolves to NetworkFees or null.
   */
  async getNetworkFees(timestamp?: string): Promise<NetworkFees | null> {
    this.logger.info('Getting network fees');
    let url = `/api/v1/network/fees`;

    if (timestamp) {
      url += `?timestamp=${timestamp}`;
    }

    try {
      const response = await this._requestWithRetry<NetworkFees>(url);
      return response;
    } catch (error: any) {
      this.logger.error(`Error fetching network fees: ${error.message}`);
      return null;
    }
  }

  /**
   * Retrieves network supply information.
   * @param timestamp Optional timestamp for historical supply data.
   * @returns A promise that resolves to NetworkSupply or null.
   */
  async getNetworkSupply(timestamp?: string): Promise<NetworkSupply | null> {
    this.logger.info('Getting network supply');
    let url = `/api/v1/network/supply`;

    if (timestamp) {
      url += `?timestamp=${timestamp}`;
    }

    try {
      const response = await this._requestWithRetry<NetworkSupply>(url);
      return response;
    } catch (error: any) {
      this.logger.error(`Error fetching network supply: ${error.message}`);
      return null;
    }
  }

  /**
   * Retrieves network stake information.
   * @param timestamp Optional timestamp for historical stake data.
   * @returns A promise that resolves to NetworkStake or null.
   */
  async getNetworkStake(timestamp?: string): Promise<NetworkStake | null> {
    this.logger.info('Getting network stake');
    let url = `/api/v1/network/stake`;

    if (timestamp) {
      url += `?timestamp=${timestamp}`;
    }

    try {
      const response = await this._requestWithRetry<NetworkStake>(url);
      return response;
    } catch (error: any) {
      this.logger.error(`Error fetching network stake: ${error.message}`);
      return null;
    }
  }

  /**
   * Retrieves opcode traces for a specific transaction.
   * @param transactionIdOrHash The transaction ID or hash.
   * @param options Optional parameters for trace details.
   * @returns A promise that resolves to an OpcodesResponse or null.
   */
  async getOpcodeTraces(
    transactionIdOrHash: string,
    options?: {
      stack?: boolean;
      memory?: boolean;
      storage?: boolean;
    },
  ): Promise<OpcodesResponse | null> {
    this.logger.info(`Getting opcode traces for ${transactionIdOrHash}`);
    let url = `/api/v1/contracts/results/${transactionIdOrHash}/opcodes`;
    const params = new URLSearchParams();

    if (options?.stack !== undefined) {
      params.append('stack', options.stack.toString());
    }
    if (options?.memory !== undefined) {
      params.append('memory', options.memory.toString());
    }
    if (options?.storage !== undefined) {
      params.append('storage', options.storage.toString());
    }

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    try {
      const response = await this._requestWithRetry<OpcodesResponse>(url);
      return response;
    } catch (error: any) {
      this.logger.error(
        `Error fetching opcode traces for ${transactionIdOrHash}: ${error.message}`,
      );
      return null;
    }
  }
}
