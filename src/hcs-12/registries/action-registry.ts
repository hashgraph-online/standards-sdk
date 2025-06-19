/**
 * Action Registry Implementation for HCS-12
 *
 * Manages registration and retrieval of HashLink WASM actions.
 */

import { Logger } from '../../utils/logger';
import { NetworkType } from '../../utils/types';
import {
  RegistryType,
  RegistryEntry,
  ActionRegistration,
  ModuleInfo,
  SourceVerification,
} from '../types';
import { BaseRegistry } from './base-registry';
import { retrieveInscription } from '../../inscribe';
import { createHash } from 'crypto';
import type { HCS12Client } from '../sdk';
import type { HCS12BrowserClient } from '../browser';
import {
  validateActionRegistration,
  safeValidate,
  actionRegistrationSchema,
} from '../validation/schemas';
import { ZodError } from 'zod';

/**
 * Registry for HashLink WASM actions
 */
export class ActionRegistry extends BaseRegistry {
  private actionsByHash: Map<string, ActionRegistration> = new Map();

  constructor(
    networkType: NetworkType,
    logger: Logger,
    topicId?: string,
    client?: HCS12Client | HCS12BrowserClient,
  ) {
    super(networkType, logger, RegistryType.ACTION, topicId, client);
  }

  /**
   * Register a WASM module with its binary via HCS-1
   */
  async registerWithWasm(
    wasmBinary: Buffer,
    moduleInfo: ModuleInfo,
    sourceVerification?: SourceVerification,
  ): Promise<ActionRegistration> {
    const wasmHash = createHash('sha256').update(wasmBinary).digest('hex');
    const infoString = JSON.stringify(moduleInfo);
    const infoHash = createHash('sha256').update(infoString).digest('hex');

    const wasmTopicId = await this.inscribeContent(
      wasmBinary,
      'application/octet-stream',
      {
        name: moduleInfo.name,
        version: moduleInfo.version,
        hash: wasmHash,
        fileType: 'wasm',
      },
    );

    let infoTopicId: string | undefined;
    if (Buffer.byteLength(infoString, 'utf8') > 1024) {
      infoTopicId = await this.inscribeContent(infoString, 'application/json', {
        name: `${moduleInfo.name}-info`,
        version: moduleInfo.version,
      });
    }

    const registration: ActionRegistration = {
      p: 'hcs-12',
      op: 'register',
      t_id: wasmTopicId,
      hash: infoHash,
      wasm_hash: wasmHash,
      info_t_id: infoTopicId,
      source_verification: sourceVerification,
      m: `${moduleInfo.name} v${moduleInfo.version}`,
    };

    await this.register(registration);
    return registration;
  }

  /**
   * Register a new WASM action
   */
  async register(registration: ActionRegistration): Promise<string> {
    this.validateRegistration(registration);

    const sequenceNumber = Date.now();
    const id = this.topicId
      ? `${this.topicId}_${sequenceNumber}`
      : `local_${sequenceNumber}`;

    const entry: RegistryEntry = {
      id,
      timestamp: new Date().toISOString(),
      submitter: '0.0.123456',
      data: registration,
    };

    this.entries.set(id, entry);
    this.actionsByHash.set(registration.hash, registration);

    if (this.topicId && this.client) {
      this.logger.info('Submitting action registration to HCS', {
        topicId: this.topicId,
        hash: registration.hash,
        wasmHash: registration.wasm_hash,
      });
      await this.client.submitMessage(
        this.topicId,
        JSON.stringify(registration),
      );
    }

    this.logger.info('Action registered', {
      hash: registration.hash,
      id,
      hasSourceVerification: !!registration.source_verification,
    });

    return id;
  }

  /**
   * Retrieve action by hash
   */
  async getAction(hash: string): Promise<ActionRegistration | null> {
    const cached = this.actionsByHash.get(hash);
    if (cached) return cached;

    if (this.topicId && this.client) {
      await this.sync();
      return this.actionsByHash.get(hash) || null;
    }

    return null;
  }

  /**
   * Retrieve action info by hash
   */
  async getActionInfo(hash: string): Promise<ModuleInfo | null> {
    const action = await this.getAction(hash);
    if (!action) return null;

    try {
      let infoString: string;

      if (action.info_t_id) {
        if (!this.client) {
          this.logger.error('Client not initialized - cannot fetch INFO');
          return null;
        }

        let inscription;

        if ('getOperatorAccountId' in this.client) {
          inscription = await retrieveInscription(action.info_t_id, {
            accountId: this.client.getOperatorAccountId(),
            privateKey: this.client.getOperatorPrivateKey(),
            network: this.networkType as 'mainnet' | 'testnet',
          });
        } else {
          const { accountId } = await (
            this.client as HCS12BrowserClient
          ).getAccountAndSigner();
          inscription = await retrieveInscription(action.info_t_id, {
            accountId,
            network: this.networkType as 'mainnet' | 'testnet',
          });
        }

        if (!inscription.content) {
          this.logger.error('No content in inscription response');
          return null;
        }
        infoString =
          typeof inscription.content === 'string'
            ? inscription.content
            : Buffer.from(inscription.content).toString('utf8');
      } else {
        this.logger.warn('Inline INFO storage not yet implemented');
        return null;
      }

      const moduleInfo = JSON.parse(infoString) as ModuleInfo;
      const computedHash = createHash('sha256')
        .update(infoString)
        .digest('hex');

      if (computedHash !== action.hash) {
        this.logger.error('INFO hash mismatch', {
          expected: action.hash,
          computed: computedHash,
        });
        throw new Error('Module info verification failed');
      }

      return moduleInfo;
    } catch (error) {
      this.logger.error('Failed to fetch action INFO', {
        hash,
        error,
      });
      return null;
    }
  }

  /**
   * Retrieve action WASM binary
   */
  async getActionWasm(hash: string): Promise<Uint8Array | null> {
    const action = await this.getAction(hash);
    if (!action) return null;

    if (!this.client) {
      this.logger.error('Client not initialized - cannot fetch WASM');
      return null;
    }

    try {
      let inscription;

      if ('getOperatorAccountId' in this.client) {
        inscription = await retrieveInscription(action.t_id, {
          accountId: this.client.getOperatorAccountId(),
          privateKey: this.client.getOperatorPrivateKey(),
          network: this.networkType as 'mainnet' | 'testnet',
        });
      } else {
        const { accountId } = await (
          this.client as HCS12BrowserClient
        ).getAccountAndSigner();
        inscription = await retrieveInscription(action.t_id, {
          accountId,
          network: this.networkType as 'mainnet' | 'testnet',
        });
      }

      if (!inscription.content) {
        this.logger.error('No content in inscription response');
        return null;
      }

      const wasmBuffer =
        typeof inscription.content === 'string'
          ? Buffer.from(inscription.content, 'base64')
          : Buffer.from(inscription.content);

      const computedHash = createHash('sha256')
        .update(wasmBuffer)
        .digest('hex');

      if (computedHash !== action.wasm_hash) {
        this.logger.error('WASM hash mismatch', {
          expected: action.wasm_hash,
          computed: computedHash,
        });
        throw new Error('WASM binary verification failed');
      }

      return new Uint8Array(wasmBuffer);
    } catch (error) {
      this.logger.error('Failed to fetch WASM from HCS-1', {
        topicId: action.t_id,
        error,
      });
      return null;
    }
  }

  /**
   * Search actions by criteria
   */
  async searchActions(criteria: {
    creator?: string;
    capability?: string;
    afterTimestamp?: string;
    beforeTimestamp?: string;
    hasSourceVerification?: boolean;
  }): Promise<ActionRegistration[]> {
    const entries = await this.listEntries({
      submitter: criteria.creator,
      afterTimestamp: criteria.afterTimestamp,
      beforeTimestamp: criteria.beforeTimestamp,
    });

    return entries
      .map(entry => entry.data as ActionRegistration)
      .filter(action => {
        if (criteria.hasSourceVerification !== undefined) {
          const hasVerification = !!action.source_verification;
          if (hasVerification !== criteria.hasSourceVerification) return false;
        }

        return true;
      });
  }

  /**
   * Get actions by version chain
   */
  async getVersionChain(latestHash: string): Promise<ActionRegistration[]> {
    const chain: ActionRegistration[] = [];
    let currentHash: string | undefined = latestHash;

    while (currentHash) {
      const action = await this.getAction(currentHash);
      if (!action) break;

      chain.push(action);

      currentHash = undefined;
    }

    return chain;
  }

  /**
   * Validate action registration using Zod schema
   */
  private validateRegistration(registration: ActionRegistration): void {
    try {
      validateActionRegistration(registration);
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
   * Override sync to handle action-specific processing
   */
  async sync(): Promise<void> {
    await super.sync();

    this.actionsByHash.clear();
    for (const entry of this.entries.values()) {
      const action = entry.data as ActionRegistration;
      this.actionsByHash.set(action.hash, action);
    }
  }

  /**
   * Override clear cache to also clear action hash index
   */
  clearCache(): void {
    super.clearCache();
    this.actionsByHash.clear();
  }
}
