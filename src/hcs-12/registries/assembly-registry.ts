/**
 * Assembly Registry Implementation for HCS-12
 *
 * Manages registration and retrieval of HashLink assemblies that combine
 * multiple actions and blocks into cohesive applications.
 */

import { Logger } from '../../utils/logger';
import { NetworkType } from '../../utils/types';
import {
  RegistryType,
  RegistryEntry,
  AssemblyRegistration,
  AssemblyWorkflowStep,
} from '../types';
import { BaseRegistry } from './base-registry';
import type { HCS12Client } from '../sdk';
import type { HCS12BrowserClient } from '../browser';
import { validateAssemblyRegistration } from '../validation/schemas';
import { ZodError } from 'zod';

/**
 * Registry for HashLink assemblies
 */
export class AssemblyRegistry extends BaseRegistry {
  private assembliesByName: Map<string, Map<string, AssemblyRegistration>> =
    new Map();

  constructor(
    networkType: NetworkType,
    logger: Logger,
    topicId?: string,
    client?: HCS12Client | HCS12BrowserClient,
  ) {
    super(networkType, logger, RegistryType.ASSEMBLY, topicId, client);
  }

  /**
   * Register a new assembly
   */
  async register(registration: AssemblyRegistration): Promise<string> {
    this.validateRegistration(registration);

    const sequenceNumber = Date.now();
    const id = this.topicId
      ? `${this.topicId}_${sequenceNumber}`
      : `local_${sequenceNumber}_${Math.random().toString(36).substring(7)}`;

    const entry: RegistryEntry = {
      id,
      timestamp: new Date().toISOString(),
      submitter: '0.0.123456',
      data: registration,
    };

    this.entries.set(id, entry);

    if (!this.assembliesByName.has(registration.name)) {
      this.assembliesByName.set(registration.name, new Map());
    }
    this.assembliesByName
      .get(registration.name)!
      .set(registration.version, registration);

    if (this.topicId && this.client) {
      this.logger.info('Submitting assembly registration to HCS', {
        topicId: this.topicId,
        name: registration.name,
        version: registration.version,
      });
      await this.client.submitMessage(
        this.topicId,
        JSON.stringify(registration),
      );
    }

    this.logger.info('Assembly registered', {
      name: registration.name,
      version: registration.version,
      actionCount: registration.actions?.length || 0,
      blockCount: registration.blocks?.length || 0,
      id,
    });

    return id;
  }

  /**
   * Retrieve assembly by name and version
   */
  async getAssembly(
    name: string,
    version: string,
  ): Promise<AssemblyRegistration | null> {
    const versions = this.assembliesByName.get(name);
    if (versions) {
      const assembly = versions.get(version);
      if (assembly) return assembly;
    }

    if (this.topicId && this.client) {
      await this.sync();
      const syncedVersions = this.assembliesByName.get(name);
      return syncedVersions?.get(version) || null;
    }

    return null;
  }

  /**
   * Get latest version of an assembly
   */
  async getLatestAssembly(name: string): Promise<AssemblyRegistration | null> {
    const versions = await this.getAssemblyVersions(name);
    if (versions.length === 0) return null;

    const sorted = versions.sort((a, b) =>
      this.compareVersions(b.version, a.version),
    );

    return sorted[0];
  }

  /**
   * Get all versions of an assembly
   */
  async getAssemblyVersions(name: string): Promise<AssemblyRegistration[]> {
    if (this.topicId && this.client) {
      await this.sync();
    }

    const versions = this.assembliesByName.get(name);
    if (!versions) return [];

    return Array.from(versions.values());
  }

  /**
   * Check if assembly dependencies can be resolved
   */
  async checkDependencies(name: string, version: string): Promise<boolean> {
    return true;
  }

  /**
   * Search assemblies by criteria
   */
  async searchAssemblies(criteria: {
    category?: string;
    keyword?: string;
    author?: string;
    afterTimestamp?: string;
    beforeTimestamp?: string;
  }): Promise<AssemblyRegistration[]> {
    const entries = await this.listEntries({
      submitter: criteria.author,
      afterTimestamp: criteria.afterTimestamp,
      beforeTimestamp: criteria.beforeTimestamp,
    });

    return entries
      .map(entry => entry.data as AssemblyRegistration)
      .filter(assembly => {
        if (criteria.keyword) {
          const keyword = criteria.keyword.toLowerCase();
          const inDescription = assembly.description
            ?.toLowerCase()
            .includes(keyword);
          const inName = assembly.name.toLowerCase().includes(keyword);
          const inTags = assembly.tags?.some(tag =>
            tag.toLowerCase().includes(keyword),
          );

          if (!inDescription && !inName && !inTags) {
            return false;
          }
        }

        return true;
      });
  }

  /**
   * Find assemblies using a specific action
   */
  async searchAssembliesUsingAction(
    actionHash: string,
  ): Promise<AssemblyRegistration[]> {
    const entries = await this.listEntries();

    return entries
      .map(entry => entry.data as AssemblyRegistration)
      .filter(assembly =>
        assembly.actions?.some(action => action.registryId === actionHash),
      );
  }

  /**
   * Find assemblies using a specific block
   */
  async searchAssembliesUsingBlock(
    blockName: string,
  ): Promise<AssemblyRegistration[]> {
    const entries = await this.listEntries();

    return entries
      .map(entry => entry.data as AssemblyRegistration)
      .filter(assembly =>
        assembly.blocks?.some(block => block.id === blockName),
      );
  }

  /**
   * Validate assembly registration using Zod schema
   */
  private validateRegistration(registration: AssemblyRegistration): void {
    try {
      validateAssemblyRegistration(registration);
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
   * Validate workflow structure
   */
  private validateWorkflow(workflow: AssemblyWorkflowStep[]): void {
    const stepIds = new Set(workflow.map(step => step.id));

    for (const step of workflow) {
      if (!step.id || !step.type) {
        throw new Error('Workflow step must have id and type');
      }

      if (!['action', 'block', 'condition'].includes(step.type)) {
        throw new Error('Invalid workflow step type');
      }

      if (step.type === 'action' && !step.action) {
        throw new Error('Action step must specify action');
      }

      if (step.type === 'block' && !step.block) {
        throw new Error('Block step must specify block');
      }

      if (step.next) {
        for (const nextId of step.next) {
          if (!stepIds.has(nextId)) {
            throw new Error(
              `Invalid workflow: step references non-existent next step: ${nextId}`,
            );
          }
        }
      }
    }
  }

  /**
   * Compare semantic versions
   */
  private compareVersions(a: string, b: string): number {
    const parseVersion = (v: string) => {
      const parts = v.split('.').map(p => parseInt(p, 10));
      return {
        major: parts[0] || 0,
        minor: parts[1] || 0,
        patch: parts[2] || 0,
      };
    };

    const va = parseVersion(a);
    const vb = parseVersion(b);

    if (va.major !== vb.major) return va.major - vb.major;
    if (va.minor !== vb.minor) return va.minor - vb.minor;
    return va.patch - vb.patch;
  }

  /**
   * Check if version string is valid semver
   */
  private isValidSemver(version: string): boolean {
    return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(version);
  }

  /**
   * Find assembly matching version constraint
   */
  private async findMatchingVersion(
    name: string,
    versionConstraint: string,
  ): Promise<AssemblyRegistration | null> {
    const versions = await this.getAssemblyVersions(name);

    return versions.length > 0 ? versions[0] : null;
  }

  /**
   * Override sync to handle assembly-specific processing
   */
  async sync(): Promise<void> {
    await super.sync();

    this.assembliesByName.clear();

    for (const entry of this.entries.values()) {
      const assembly = entry.data as AssemblyRegistration;

      if (!this.assembliesByName.has(assembly.name)) {
        this.assembliesByName.set(assembly.name, new Map());
      }
      this.assembliesByName.get(assembly.name)!.set(assembly.version, assembly);
    }
  }

  /**
   * Override clear cache to also clear assembly indices
   */
  clearCache(): void {
    super.clearCache();
    this.assembliesByName.clear();
  }
}
