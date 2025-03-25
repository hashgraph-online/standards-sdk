import { PublicKey, Timestamp } from '@hashgraph/sdk';
import axios from 'axios';
import { Logger } from '../utils/logger';
import { HCSMessage } from '../hcs-10/base-client';
import { proto } from '@hashgraph/proto';
import {
  AccountResponse,
  CustomFees,
  HBARPrice,
  NetworkType,
  TopicMessagesResponse,
  TopicResponse,
} from './types';

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
    } catch (error: any) {
      throw new Error(
        `Error fetching public key from Mirror Node: ${error.message}`
      );
    }
  }

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
      } catch (error: any) {
        this.logger.error(
          `Error getting account memo (attempt ${attempt + 1}): ${
            error.message
          }`
        );

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    return null;
  }

  async getTopicInfo(topicId: string): Promise<TopicResponse> {
    try {
      const topicInfoUrl = `${this.baseUrl}/api/v1/topics/${topicId}`;
      const response = await axios.get(topicInfoUrl);
      return response.data;
    } catch (error: any) {
      this.logger.error(`Error retrieving topic information: ${error.message}`);
      throw new Error(`Failed to retrieve topic information: ${error.message}`);
    }
  }

  async getTopicFees(topicId: string): Promise<CustomFees | null> {
    try {
      const topicInfo = await this.getTopicInfo(topicId);
      return topicInfo.custom_fees;
    } catch (error: any) {
      this.logger.error(`Error retrieving topic fees: ${error.message}`);
      return null;
    }
  }

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
    } catch (e) {
      return null;
    }
  }

  async getTopicMessages(topicId: string): Promise<HCSMessage[]> {
    this.logger.info(`Querying messages for topic ${topicId}`);

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
                this.logger.error(`Error decoding message: ${error}`);
                continue;
              }

              let messageJson;
              try {
                messageJson = JSON.parse(messageContent);
              } catch (error) {
                this.logger.error(
                  `Invalid JSON message content: ${messageContent}`
                );
                return;
              }

              messageJson.sequence_number = message.sequence_number;
              messages.push(messageJson);
            } catch (error: any) {
              this.logger.error(`Error processing message: ${error.message}`);
            }
          }
        }

        nextUrl = data.links?.next ? `${this.baseUrl}${data.links.next}` : '';
      } catch (error: any) {
        this.logger.error(`Error querying topic messages: ${error.message}`);
        throw new Error(`Failed to query topic messages: ${error.message}`);
      }
    }

    return messages;
  }

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
    } catch (error: any) {
      this.logger.error(`Failed to fetch account: ${error.message}`);
      throw new Error(`Failed to fetch account: ${error.message}`);
    }
  }

  async checkKeyListAccess(
    keyBytes: Buffer,
    userPublicKey: PublicKey
  ): Promise<boolean> {
    try {
      const key = proto.Key.decode(keyBytes);
      return this.evaluateKeyAccess(key, userPublicKey);
    } catch (error) {
      this.logger.error(
        `Error decoding protobuf key: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }

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
        } catch (err) {
          this.logger.debug(
            `Error in nested key: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }

    return false;
  }

  private compareEd25519Key(
    keyData: Uint8Array,
    userPublicKey: PublicKey
  ): boolean {
    try {
      const decodedKey = PublicKey.fromBytes(Buffer.from(keyData));
      return decodedKey.toString() === userPublicKey.toString();
    } catch (err) {
      return false;
    }
  }
}
