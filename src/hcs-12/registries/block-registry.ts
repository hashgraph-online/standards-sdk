/**
 * Block Registry Implementation for HCS-12
 *
 * Manages registration and retrieval of Gutenberg block definitions
 * for building HashLink user interfaces.
 */

import { Logger } from '../../utils/logger';
import { NetworkType } from '../../utils/types';
import {
  RegistryType,
  RegistryEntry,
  BlockRegistration,
  BlockAttribute,
  BlockSupport,
} from '../types';
import { BaseRegistry } from './base-registry';
import type { HCS12Client } from '../sdk';
import type { HCS12BrowserClient } from '../browser';
import { validateBlockRegistration } from '../validation/schemas';
import { ZodError } from 'zod';
import { inscribe } from '../../inscribe/inscriber';
import { InscriptionSDK } from '@kiloscribe/inscription-sdk';

/**
 * Registry for Gutenberg block definitions
 */
export class BlockRegistry extends BaseRegistry {
  private blocksByName: Map<string, BlockRegistration> = new Map();

  constructor(
    networkType: NetworkType,
    logger: Logger,
    topicId?: string,
    client?: HCS12Client | HCS12BrowserClient,
  ) {
    super(networkType, logger, RegistryType.BLOCK, topicId, client);
  }

  /**
   * Register a new block definition
   */
  async register(registration: BlockRegistration): Promise<string> {
    this.validateRegistration(registration);

    let finalRegistration = { ...registration };
    if (registration.data && typeof registration.data === 'object') {
      const dataString = JSON.stringify(registration.data);
      const dataSize = Buffer.from(dataString).length;

      if (dataSize > 1000) {
        this.logger.info('Block data exceeds 1KB, inscribing via HCS-1', {
          name: registration.name,
          dataSize,
        });

        if (this.client && 'inscribeFile' in this.client) {
          try {
            const fileName = `block-${registration.name}-${registration.version}.json`;
            const buffer = Buffer.from(dataString);

            const inscriptionResult = await (this.client as any).inscribeFile(
              buffer,
              fileName,
            );

            if (inscriptionResult?.topic_id) {
              finalRegistration.data = `hcs://1/${inscriptionResult.topic_id}`;
              this.logger.info('Block data inscribed', {
                name: registration.name,
                topicId: inscriptionResult.topic_id,
              });
            }
          } catch (error) {
            this.logger.error('Failed to inscribe block data', error);
            throw new Error(
              `Failed to inscribe large block data: ${error.message}`,
            );
          }
        } else {
          this.logger.warn(
            'Large block data detected but inscription not available',
          );
        }
      }
    }

    const sequenceNumber = Date.now();
    const id = this.topicId
      ? `${this.topicId}_${sequenceNumber}`
      : `local_${sequenceNumber}_${Math.random().toString(36).substring(7)}`;

    const entry: RegistryEntry = {
      id,
      timestamp: new Date().toISOString(),
      submitter: '0.0.123456',
      data: finalRegistration,
    };

    this.entries.set(id, entry);
    this.blocksByName.set(finalRegistration.name, finalRegistration);

    if (this.topicId && this.client) {
      this.logger.info('Submitting block registration to HCS', {
        topicId: this.topicId,
        name: finalRegistration.name,
      });
      await this.client.submitMessage(
        this.topicId,
        JSON.stringify(finalRegistration),
      );
    }

    this.logger.info('Block registered', {
      name: finalRegistration.name,
      id,
    });

    return id;
  }

  /**
   * Retrieve block by name
   */
  async getBlock(name: string): Promise<BlockRegistration | null> {
    const cached = this.blocksByName.get(name);
    if (cached) return cached;

    if (this.topicId && this.client) {
      await this.sync();
      return this.blocksByName.get(name) || null;
    }

    return null;
  }

  /**
   * Retrieve block render script
   */
  async getBlockScript(name: string): Promise<Uint8Array | null> {
    const block = await this.getBlock(name);
    if (!block) return null;

    this.logger.warn(
      'HCS-1 integration not yet implemented for fetching block script',
      {
        topicId: block.t_id,
      },
    );

    return new Uint8Array(0);
  }

  /**
   * Search blocks by criteria
   */
  async searchBlocks(criteria: {
    category?: string;
    keyword?: string;
    supportsAlign?: boolean;
    supportsAnchor?: boolean;
    supportsHtml?: boolean;
    creator?: string;
    afterTimestamp?: string;
    beforeTimestamp?: string;
  }): Promise<BlockRegistration[]> {
    const entries = await this.listEntries({
      submitter: criteria.creator,
      afterTimestamp: criteria.afterTimestamp,
      beforeTimestamp: criteria.beforeTimestamp,
    });

    return entries
      .map(entry => entry.data as BlockRegistration)
      .filter(block => {
        if (criteria.keyword) {
          const keyword = criteria.keyword.toLowerCase();
          const inName = block.name.toLowerCase().includes(keyword);

          let inData = false;
          if (block.data && typeof block.data === 'object') {
            const blockData = block.data as any;
            const inKeywords = blockData.keywords?.some((k: string) =>
              k.toLowerCase().includes(keyword),
            );
            const inTitle = blockData.title?.toLowerCase().includes(keyword);
            const inDescription = blockData.description
              ?.toLowerCase()
              .includes(keyword);
            inData = inKeywords || inTitle || inDescription;
          }

          if (!inName && !inData) {
            return false;
          }
        }

        if (criteria.category && block.data && typeof block.data === 'object') {
          const blockData = block.data as any;
          if (blockData.category !== criteria.category) {
            return false;
          }
        }

        if (block.data && typeof block.data === 'object') {
          const blockData = block.data as any;
          if (blockData.supports) {
            if (
              criteria.supportsAlign !== undefined &&
              blockData.supports.align !== criteria.supportsAlign
            ) {
              return false;
            }
            if (
              criteria.supportsAnchor !== undefined &&
              blockData.supports.anchor !== criteria.supportsAnchor
            ) {
              return false;
            }
            if (
              criteria.supportsHtml !== undefined &&
              blockData.supports.html !== criteria.supportsHtml
            ) {
              return false;
            }
          }
        }

        return true;
      });
  }

  /**
   * Get blocks by creator
   */
  async listByCreator(creator: string): Promise<BlockRegistration[]> {
    return this.searchBlocks({ creator });
  }

  /**
   * Get block variations
   */
  async getBlockVariations(baseName: string): Promise<BlockRegistration[]> {
    const entries = await this.listEntries();

    return entries
      .map(entry => entry.data as BlockRegistration)
      .filter(block => {
        if (block.data && typeof block.data === 'object') {
          const blockData = block.data as any;
          return blockData.parent === baseName;
        }
        return false;
      });
  }

  /**
   * Validate block registration using Zod schema
   */
  private validateRegistration(registration: BlockRegistration): void {
    try {
      validateBlockRegistration(registration);
    } catch (error) {
      if (error instanceof ZodError) {
        const firstError = error.errors[0];
        throw new Error(
          `Validation failed: ${firstError.path.join('.')} - ${firstError.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Override sync to handle block-specific processing
   */
  async sync(): Promise<void> {
    await super.sync();

    this.blocksByName.clear();
    for (const entry of this.entries.values()) {
      const block = entry.data as BlockRegistration;
      this.blocksByName.set(block.name, block);
    }
  }

  /**
   * Override clear cache to also clear block name index
   */
  clearCache(): void {
    super.clearCache();
    this.blocksByName.clear();
  }
}
