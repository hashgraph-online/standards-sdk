/**
 * AssemblyBuilder utility for creating HCS-12 assembly registrations
 */

import { createHash } from 'crypto';
import { Logger } from '../../utils/logger';
import {
  AssemblyRegistration,
  AssemblyAction,
  AssemblyBlock,
  AssemblyDependency,
  AssemblyWorkflowStep,
} from '../types';

/**
 * Builder for creating assembly registrations with validation
 */
export class AssemblyBuilder {
  private logger: Logger;
  private registration: Partial<AssemblyRegistration>;

  constructor(logger: Logger) {
    this.logger = logger;
    this.registration = {
      p: 'hcs-12',
      op: 'register',
      actions: [],
      blocks: [],
    };
  }

  /**
   * Set assembly name
   */
  setName(name: string): AssemblyBuilder {
    if (!this.isValidAssemblyName(name)) {
      throw new Error('Invalid assembly name format');
    }
    this.registration.name = name;
    return this;
  }

  /**
   * Set assembly version
   */
  setVersion(version: string): AssemblyBuilder {
    if (!this.isValidSemver(version)) {
      throw new Error('Invalid semantic version');
    }
    this.registration.version = version;
    return this;
  }

  /**
   * Set assembly title
   */
  setTitle(title: string): AssemblyBuilder {
    this.registration.title = title;
    return this;
  }

  /**
   * Set assembly category
   */
  setCategory(category: string): AssemblyBuilder {
    this.registration.category = category;
    return this;
  }

  /**
   * Set assembly description
   */
  setDescription(description: string): AssemblyBuilder {
    this.registration.description = description;
    return this;
  }

  /**
   * Set assembly author
   */
  setAuthor(author: string): AssemblyBuilder {
    this.registration.author = author;
    return this;
  }

  /**
   * Set assembly license
   */
  setLicense(license: string): AssemblyBuilder {
    this.registration.license = license;
    return this;
  }

  /**
   * Set assembly icon
   */
  setIcon(icon: string): AssemblyBuilder {
    this.registration.icon = icon;
    return this;
  }

  /**
   * Add keyword for search
   */
  addKeyword(keyword: string): AssemblyBuilder {
    if (!this.registration.keywords) {
      this.registration.keywords = [];
    }
    this.registration.keywords.push(keyword);
    return this;
  }

  /**
   * Add action to assembly
   */
  addAction(action: AssemblyAction): AssemblyBuilder {
    if (!action.id) {
      throw new Error('Action ID is required');
    }
    if (!action.registryId || !this.isValidTopicId(action.registryId)) {
      throw new Error('Invalid registry ID');
    }
    if (action.version && !this.isValidSemver(action.version)) {
      throw new Error('Invalid action version');
    }
    this.registration.actions!.push(action);
    return this;
  }

  /**
   * Add block to assembly
   */
  addBlock(block: AssemblyBlock): AssemblyBuilder {
    if (!block.id) {
      throw new Error('Block ID is required');
    }
    if (!block.registryId || !this.isValidTopicId(block.registryId)) {
      throw new Error('Invalid registry ID');
    }
    if (block.version && !this.isValidSemver(block.version)) {
      throw new Error('Invalid block version');
    }
    this.registration.blocks!.push(block);
    return this;
  }

  /**
   * Add dependency
   */
  addDependency(dependency: AssemblyDependency): AssemblyBuilder {
    if (!this.registration.dependencies) {
      this.registration.dependencies = [];
    }
    this.registration.dependencies.push(dependency);
    return this;
  }

  /**
   * Add workflow step
   */
  addWorkflowStep(step: AssemblyWorkflowStep): AssemblyBuilder {
    if (!this.registration.workflow) {
      this.registration.workflow = [];
    }
    this.registration.workflow.push(step);
    return this;
  }

  /**
   * Build the assembly registration
   */
  build(): AssemblyRegistration {
    this.validate();
    return { ...this.registration } as AssemblyRegistration;
  }

  /**
   * Reset the builder
   */
  reset(): AssemblyBuilder {
    this.registration = {
      p: 'hcs-12',
      op: 'register',
      actions: [],
      blocks: [],
    };
    return this;
  }

  /**
   * Create dashboard assembly template
   */
  createDashboardAssembly(
    name: string,
    version: string,
    title: string,
  ): AssemblyRegistration {
    return this.reset()
      .setName(name)
      .setVersion(version)
      .setTitle(title)
      .setCategory('productivity')
      .setDescription(
        'A dashboard assembly for data visualization and analytics',
      )
      .addBlock({
        name: 'hashlinks/header',
        version: '1.0.0',
        config: { title },
      })
      .addBlock({
        name: 'hashlinks/chart',
        version: '1.0.0',
        config: { type: 'line' },
      })
      .addBlock({
        name: 'hashlinks/data-table',
        version: '1.0.0',
      })
      .addAction({
        hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        alias: 'fetch-data',
      })
      .build();
  }

  /**
   * Create form assembly template
   */
  createFormAssembly(
    name: string,
    version: string,
    title: string,
  ): AssemblyRegistration {
    return this.reset()
      .setName(name)
      .setVersion(version)
      .setTitle(title)
      .setCategory('interactive')
      .setDescription(
        'An interactive form assembly with validation and submission',
      )
      .addBlock({
        name: 'hashlinks/form-container',
        version: '1.0.0',
      })
      .addBlock({
        name: 'hashlinks/input-field',
        version: '1.0.0',
      })
      .addBlock({
        name: 'hashlinks/submit-button',
        version: '1.0.0',
      })
      .addWorkflowStep({
        id: 'display-form',
        type: 'block',
        block: {
          name: 'hashlinks/form-container',
          version: '1.0.0',
        },
        next: ['validate'],
      })
      .addWorkflowStep({
        id: 'validate',
        type: 'action',
        action: {
          hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        },
        next: ['submit', 'show-errors'],
      })
      .addWorkflowStep({
        id: 'submit',
        type: 'action',
        action: {
          hash: 'b1b2b3b4b5b6b7b8b9b0b1b2b3b4b5b6b7b8b9b0b1b2b3b4b5b6b7b8b9b0b1b2',
        },
      })
      .addWorkflowStep({
        id: 'show-errors',
        type: 'block',
        block: {
          name: 'hashlinks/error-message',
          version: '1.0.0',
        },
      })
      .build();
  }

  /**
   * Calculate assembly hash
   */
  async calculateAssemblyHash(assembly: AssemblyRegistration): Promise<string> {
    const hash = createHash('sha256');

    const data = {
      name: assembly.name,
      version: assembly.version,
      actions: assembly.actions?.map(a => ({
        hash: a.hash,
        version: a.version,
      })),
      blocks: assembly.blocks?.map(b => ({ name: b.name, version: b.version })),
    };

    hash.update(JSON.stringify(data, Object.keys(data).sort()));
    return hash.digest('hex');
  }

  /**
   * Check if assembly is complete
   */
  isComplete(assembly: Partial<AssemblyRegistration>): boolean {
    return !!(
      assembly.p === 'hcs-12' &&
      assembly.op === 'register' &&
      assembly.name &&
      assembly.version &&
      assembly.title &&
      assembly.category &&
      Array.isArray(assembly.actions) &&
      Array.isArray(assembly.blocks)
    );
  }

  /**
   * Validate the current registration
   */
  private validate(): void {
    if (!this.registration.name) {
      throw new Error('Assembly name is required');
    }
    if (!this.registration.version) {
      throw new Error('Assembly version is required');
    }
  }

  /**
   * Validate workflow structure
   */
  private validateWorkflow(workflow: AssemblyWorkflowStep[]): void {
    const stepIds = new Set(workflow.map(step => step.id));

    for (const step of workflow) {
      if (step.next) {
        for (const nextId of step.next) {
          if (!stepIds.has(nextId)) {
            throw new Error(`Workflow references non-existent step: ${nextId}`);
          }
        }
      }
    }
  }

  /**
   * Validate assembly name format
   */
  private isValidAssemblyName(name: string): boolean {
    return /^[a-z0-9-]+$/.test(name);
  }

  /**
   * Validate semantic version
   */
  private isValidSemver(version: string): boolean {
    return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(version);
  }

  /**
   * Validate hash format
   */
  private isValidTopicId(topicId: string): boolean {
    return /^0\.0\.\d+$/.test(topicId);
  }

  private isValidHash(hash: string): boolean {
    return /^[a-f0-9]{64}$/.test(hash);
  }

  /**
   * Validate block name format
   */
  private isValidBlockName(name: string): boolean {
    return /^[a-z0-9-]+\/[a-z0-9-]+$/.test(name);
  }
}
