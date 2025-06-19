/**
 * Base Registry Abstract Class for HCS-12
 *
 * Provides common functionality for all HCS-12 registry types including
 * action, block, assembly, and hashlinks registries.
 */

import { Logger } from '../../utils/logger';
import { NetworkType } from '../../utils/types';
import {
  RegistryType,
  RegistryEntry,
  RegistryConfig,
  ActionRegistration,
  BlockRegistration,
  AssemblyRegistration,
  HashLinksRegistration,
} from '../types';
import { inscribe, inscribeWithSigner } from '../../inscribe';
import type { HCS12Client } from '../sdk';
import type { HCS12BrowserClient } from '../browser';

/**
 * Abstract base class for all HCS-12 registries
 */
export abstract class BaseRegistry {
  protected logger: Logger;
  protected networkType: NetworkType;
  protected topicId?: string;
  protected registryType: RegistryType;
  protected entries: Map<string, RegistryEntry> = new Map();
  protected client?: HCS12Client | HCS12BrowserClient;
  protected lastSyncTimestamp?: string;

  constructor(
    networkType: NetworkType,
    logger: Logger,
    registryType: RegistryType,
    topicId?: string,
    client?: HCS12Client | HCS12BrowserClient,
  ) {
    this.networkType = networkType;
    this.logger = logger;
    this.registryType = registryType;
    this.topicId = topicId;
    this.client = client;
  }

  /**
   * Submit a registration to the topic
   */
  abstract register(
    data:
      | ActionRegistration
      | BlockRegistration
      | AssemblyRegistration
      | HashLinksRegistration,
  ): Promise<string>;

  /**
   * Retrieve an entry by ID
   */
  async getEntry(id: string): Promise<RegistryEntry | null> {
    const cached = this.entries.get(id);
    if (cached) return cached;

    if (this.topicId && this.client) {
      await this.sync();
      return this.entries.get(id) || null;
    }

    return null;
  }

  /**
   * List all entries with optional filtering
   */
  async listEntries(filter?: {
    submitter?: string;
    afterTimestamp?: string;
    beforeTimestamp?: string;
  }): Promise<RegistryEntry[]> {
    if (this.topicId && this.client) {
      await this.sync();
    }

    const entries = Array.from(this.entries.values());

    if (!filter) return entries;

    return entries.filter(entry => {
      if (filter.submitter && entry.submitter !== filter.submitter) {
        return false;
      }
      if (filter.afterTimestamp && entry.timestamp < filter.afterTimestamp) {
        return false;
      }
      if (filter.beforeTimestamp && entry.timestamp > filter.beforeTimestamp) {
        return false;
      }
      return true;
    });
  }

  /**
   * Sync entries from the network
   */
  async sync(): Promise<void> {
    if (!this.topicId || !this.client) {
      this.logger.warn('Cannot sync without topic ID and client');
      return;
    }

    this.logger.info('Syncing registry entries', {
      topicId: this.topicId,
      registryType: RegistryType[this.registryType],
      lastSync: this.lastSyncTimestamp,
    });

    try {
      const messages = await this.client.mirrorNode.getTopicMessagesByFilter(
        this.topicId,
        {
          startTime: this.lastSyncTimestamp,
          order: 'asc',
          limit: 100,
        },
      );

      for (const msg of messages) {
        try {
          let data: any;
          
          if (msg.p === 'hcs-12') {
            data = {
              p: msg.p,
              op: msg.op,
              name: msg.name,
              version: msg.version,
              data: msg.data,
              t_id: msg.t_id,
              hash: msg.hash,
              wasm_hash: msg.wasm_hash,
              m: msg.m,
              description: msg.description,
              tags: msg.tags,
              actions: msg.actions,
              blocks: msg.blocks,
              author: msg.author,
              category: msg.category,
              featured: msg.featured,
            };
            Object.keys(data).forEach(key => data[key] === undefined && delete data[key]);
          } else if (msg.raw_content) {
            data = JSON.parse(msg.raw_content);
          } else {
            continue;
          }
          
          if (data.p !== 'hcs-12') {
            continue;
          }
          
          const entry: RegistryEntry = {
            id: `${this.topicId}_${msg.sequence_number}`,
            timestamp: msg.consensus_timestamp || new Date().toISOString(),
            submitter: msg.payer || msg.payer_account_id || 'unknown',
            data,
          };
          this.entries.set(entry.id, entry);
        } catch (error) {
          this.logger.warn('Failed to parse registry message', {
            sequenceNumber: msg.sequence_number,
            error,
          });
        }
      }

      if (messages.length > 0) {
        this.lastSyncTimestamp =
          messages[messages.length - 1].consensus_timestamp ||
          new Date().toISOString();
      } else {
        this.lastSyncTimestamp = new Date().toISOString();
      }

      this.logger.info('Registry sync completed', {
        topicId: this.topicId,
        messageCount: messages.length,
        lastSync: this.lastSyncTimestamp,
      });
    } catch (error) {
      this.logger.error('Failed to sync registry', { error });
      throw error;
    }
  }

  /**
   * Get the registry topic memo format
   */
  getTopicMemo(): string {
    const indexed = 1;
    const ttl = 60;
    const type = this.registryType;
    return `hcs-12:${indexed}:${ttl}:${type}`;
  }

  /**
   * Create a new registry topic
   */
  async createRegistryTopic(): Promise<string> {
    if (!this.client) {
      throw new Error('Client required to create topic');
    }

    const topicId = await this.client.createRegistryTopic(this.registryType);
    this.topicId = topicId;

    return topicId;
  }

  /**
   * Get registry configuration
   */
  getConfig(): RegistryConfig {
    return {
      type: this.registryType,
      indexed: false,
      ttl: 60,
      topicId: this.topicId,
      memo: this.getTopicMemo(),
    };
  }

  /**
   * Store large content via HCS-1 inscription
   */
  protected async inscribeContent(
    content: Buffer | string,
    mimeType: string,
    metadata?: Record<string, any>,
  ): Promise<string> {
    if (!this.client) {
      throw new Error('Client required for inscription');
    }

    const buffer = typeof content === 'string' ? Buffer.from(content) : content;

    this.logger.info('Inscribing content via HCS-1', {
      size: buffer.length,
      mimeType,
      registryType: RegistryType[this.registryType],
    });

    let response;

    if ('getOperatorAccountId' in this.client) {
      response = await inscribe(
        {
          type: 'buffer',
          buffer,
          fileName:
            mimeType === 'application/octet-stream' &&
            metadata?.fileType === 'wasm'
              ? `${metadata?.name || 'content'}.wasm`
              : metadata?.name || 'content',
          mimeType,
        },
        {
          accountId: this.client.getOperatorAccountId(),
          privateKey: this.client.getOperatorPrivateKey(),
          network: this.networkType as 'mainnet' | 'testnet',
        },
        {
          mode: 'file',
          metadata,
          waitForConfirmation: true,
        },
      );
    } else {
      const { accountId, signer } = await (
        this.client as HCS12BrowserClient
      ).getAccountAndSigner();
      response = await inscribeWithSigner(
        {
          type: 'buffer',
          buffer,
          fileName:
            mimeType === 'application/octet-stream' &&
            metadata?.fileType === 'wasm'
              ? `${metadata?.name || 'content'}.wasm`
              : metadata?.name || 'content',
          mimeType,
        },
        signer,
        {
          mode: 'file',
          metadata,
          waitForConfirmation: true,
        },
      );
    }

    if (!response.confirmed) {
      throw new Error('Failed to inscribe content');
    }

    const topicId = response.inscription.topic_id;
    if (!topicId) {
      throw new Error('No topic ID in inscription response');
    }

    this.logger.info('Content inscribed successfully', {
      topicId,
    });
    return topicId;
  }

  /**
   * Validate common registration fields
   */
  protected validateBaseRegistration(
    data:
      | ActionRegistration
      | BlockRegistration
      | AssemblyRegistration
      | HashLinksRegistration,
  ): void {
    if (!data.p || data.p !== 'hcs-12') {
      throw new Error('Invalid protocol identifier');
    }

    if (!data.op || data.op !== 'register') {
      throw new Error('Invalid operation');
    }
  }

  /**
   * Clear local cache
   */
  clearCache(): void {
    this.entries.clear();
    this.lastSyncTimestamp = undefined;
    this.logger.info('Registry cache cleared', {
      registryType: RegistryType[this.registryType],
    });
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    entryCount: number;
    lastSync?: string;
    topicId?: string;
    registryType: string;
  } {
    return {
      entryCount: this.entries.size,
      lastSync: this.lastSyncTimestamp,
      topicId: this.topicId,
      registryType: RegistryType[this.registryType],
    };
  }
}
