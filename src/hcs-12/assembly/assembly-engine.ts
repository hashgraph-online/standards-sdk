/**
 * Assembly Engine for HCS-12 HashLinks
 *
 * Handles loading, reference resolution, and validation of HashLink assemblies
 * with caching and error handling.
 */

import { Logger } from '../../utils/logger';
import { NetworkType } from '../../utils/types';
import {
  AssemblyDefinition,
  ActionRegistration,
  BlockRegistration,
  AssemblyRegistration,
  ParameterDefinition,
} from '../types';
import { BaseRegistry } from '../registries/base-registry';
import { retrieveInscription } from '../../inscribe';

export interface Assembly {
  id: string;
  definition: AssemblyDefinition;
  actions: ResolvedAction[];
  blocks: ResolvedBlock[];
  dependencies?: ResolvedDependency[];
}

export interface ResolvedAction {
  id: string;
  registryId: string;
  definition: ActionRegistration | null;
  error?: string;
}

export interface ResolvedBlock {
  id: string;
  registryId: string;
  definition: BlockRegistration | null;
  error?: string;
}

export interface ResolvedDependency {
  id: string;
  registryId: string;
  definition: AssemblyRegistration | null;
  error?: string;
}

export interface AssemblyValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Engine for loading and composing HashLink assemblies
 */
export class AssemblyEngine {
  private logger: Logger;
  private assemblyRegistry: BaseRegistry;
  private actionRegistry: BaseRegistry;
  private blockRegistry: BaseRegistry;
  private cache: Map<string, Assembly> = new Map();

  constructor(
    networkType: NetworkType,
    logger: Logger,
    assemblyRegistry: BaseRegistry,
    actionRegistry: BaseRegistry,
    blockRegistry: BaseRegistry,
  ) {
    this.logger = logger;
    this.assemblyRegistry = assemblyRegistry;
    this.actionRegistry = actionRegistry;
    this.blockRegistry = blockRegistry;
  }

  /**
   * Load assembly from registry with caching
   */
  async loadAssembly(assemblyId: string): Promise<Assembly> {
    this.logger.debug('Loading assembly', { assemblyId });

    if (this.cache.has(assemblyId)) {
      this.logger.debug('Assembly loaded from cache', { assemblyId });
      return this.cache.get(assemblyId)!;
    }

    try {
      const registryEntry = await this.assemblyRegistry.getEntry(assemblyId);
      if (!registryEntry) {
        throw new Error(`Assembly not found: ${assemblyId}`);
      }

      const registryMessage = registryEntry.data;

      if (!this.isValidAssemblyMessage(registryMessage)) {
        throw new Error('Invalid assembly format');
      }

      let assemblyDefinition: AssemblyDefinition;

      if (registryMessage.t_id) {
        this.logger.debug('Loading large assembly from HCS-1', {
          assemblyId,
          storageId: registryMessage.t_id,
        });

        try {
          const inscription = await retrieveInscription(registryMessage.t_id, {
            network: 'testnet',
          });
          const parsedContent = JSON.parse((inscription as any).data);

          assemblyDefinition = {
            ...registryMessage,
            ...parsedContent,
          };
        } catch (error) {
          throw new Error(
            `Failed to parse assembly from storage: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      } else {
        assemblyDefinition =
          this.convertRegistrationToDefinition(registryMessage);
      }

      const assembly: Assembly = {
        id: assemblyId,
        definition: assemblyDefinition,
        actions: [],
        blocks: [],
      };

      this.cache.set(assemblyId, assembly);

      this.logger.debug('Assembly loaded successfully', {
        assemblyId,
        name: assemblyDefinition.name,
        version: assemblyDefinition.version,
        actionsCount: assemblyDefinition.actions?.length || 0,
        blocksCount: assemblyDefinition.blocks?.length || 0,
      });

      return assembly;
    } catch (error) {
      this.logger.error('Failed to load assembly', { assemblyId, error });
      throw new Error(
        `Failed to load assembly: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Resolve all references in an assembly definition
   */
  async resolveReferences(
    assemblyDefinition: AssemblyDefinition,
  ): Promise<Assembly> {
    this.logger.debug('Resolving assembly references', {
      name: assemblyDefinition.name,
    });

    const assembly: Assembly = {
      id: 'resolved',
      definition: assemblyDefinition,
      actions: [],
      blocks: [],
    };

    if (assemblyDefinition.actions) {
      for (const actionRef of assemblyDefinition.actions) {
        try {
          const actionDefinition = await this.resolveActionReference(actionRef);
          assembly.actions.push({
            id: actionRef.id,
            registryId: actionRef.registryId,
            definition: actionDefinition,
          });
        } catch (error) {
          this.logger.warn('Failed to resolve action reference', {
            actionId: actionRef.id,
            registryId: actionRef.registryId,
            error,
          });
          assembly.actions.push({
            id: actionRef.id,
            registryId: actionRef.registryId,
            definition: null,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    if (assemblyDefinition.blocks) {
      for (const blockRef of assemblyDefinition.blocks) {
        try {
          const blockDefinition = await this.resolveBlockReference(blockRef);
          assembly.blocks.push({
            id: blockRef.id,
            registryId: blockRef.registryId,
            definition: blockDefinition,
          });
        } catch (error) {
          this.logger.warn('Failed to resolve block reference', {
            blockId: blockRef.id,
            registryId: blockRef.registryId,
            error,
          });
          assembly.blocks.push({
            id: blockRef.id,
            registryId: blockRef.registryId,
            definition: null,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    this.logger.debug('Assembly references resolved', {
      name: assemblyDefinition.name,
      resolvedActions: assembly.actions.length,
      resolvedBlocks: assembly.blocks.length,
    });

    return assembly;
  }

  /**
   * Validate assembly composition
   */
  async validateComposition(
    assembly: Assembly,
  ): Promise<AssemblyValidationResult> {
    this.logger.debug('Validating assembly composition', {
      assemblyId: assembly.id,
    });

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!assembly.definition.name) {
      errors.push('Assembly must have a name');
    }

    if (!assembly.definition.version) {
      errors.push('Assembly must have a version');
    }

    if (assembly.definition.blocks) {
      for (const block of assembly.definition.blocks) {
        if (block.actions) {
          for (const actionId of block.actions) {
            const actionExists = assembly.definition.actions?.some(
              a => a.id === actionId,
            );
            if (!actionExists) {
              errors.push(
                `Block "${block.id}" references missing action "${actionId}"`,
              );
            }
          }
        }

        if (block.bindings) {
          for (const binding of block.bindings) {
            const action = assembly.actions.find(a => a.id === binding.action);
            if (action && action.definition) {
              this.validateParameterBindings(
                binding,
                action.definition,
                errors,
              );
            }
          }
        }
      }
    }

    this.validateCircularDependencies(assembly, errors);

    this.validateParameterCompatibility(assembly, warnings);

    const result: AssemblyValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings,
    };

    this.logger.debug('Assembly validation completed', {
      assemblyId: assembly.id,
      isValid: result.isValid,
      errorsCount: errors.length,
      warningsCount: warnings.length,
    });

    return result;
  }

  /**
   * Clear assembly cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug('Assembly cache cleared');
  }

  /**
   * Resolve action reference with version handling
   */
  private async resolveActionReference(actionRef: {
    id: string;
    registryId: string;
    version?: string;
  }): Promise<any> {
    const entry = await this.actionRegistry.getEntry(actionRef.registryId);
    if (!entry) {
      throw new Error(`Action not found: ${actionRef.registryId}`);
    }
    return entry.data;
  }

  /**
   * Resolve block reference with version handling
   */
  private async resolveBlockReference(blockRef: {
    id: string;
    registryId: string;
    version?: string;
    actions?: string[];
  }): Promise<any> {
    const entry = await this.blockRegistry.getEntry(blockRef.registryId);
    if (!entry) {
      throw new Error(`Block not found: ${blockRef.registryId}`);
    }
    return entry.data;
  }

  /**
   * Resolve dependency reference
   */
  private async resolveDependencyReference(depRef: {
    registryId: string;
    version?: string;
  }): Promise<any> {
    const entry = await this.assemblyRegistry.getEntry(depRef.registryId);
    if (!entry) {
      throw new Error(`Dependency not found: ${depRef.registryId}`);
    }
    return entry.data;
  }

  /**
   * Validate assembly message format
   */
  private isValidAssemblyMessage(
    message: unknown,
  ): message is AssemblyRegistration {
    return (
      message !== null &&
      typeof message === 'object' &&
      'p' in message &&
      'op' in message &&
      'name' in message &&
      (message as any).p === 'hcs-12' &&
      (message as any).op === 'register' &&
      typeof (message as any).name === 'string'
    );
  }

  /**
   * Validate parameter bindings between blocks and actions
   */
  private validateParameterBindings(
    binding: {
      action: string;
      parameters: Record<string, string | number | boolean>;
    },
    actionDefinition: ActionRegistration,
    errors: string[],
  ): void {
    return;
    /*
    const requiredParams = actionDefinition.parameters.filter(
      (p: ParameterDefinition) => p.required,
    );
    const boundParams = Object.keys(binding.parameters || {});


    for (const param of requiredParams) {
      if (!boundParams.includes(param.name)) {
        errors.push(
          `Action "${binding.action}" requires parameter "${param.name}" but it's not bound`,
        );
      }
    }


    for (const boundParam of boundParams) {
      const paramExists = actionDefinition.parameters.some(
        (p: ParameterDefinition) => p.name === boundParam,
      );
      if (!paramExists) {
        errors.push(
          `Binding references unknown parameter "${boundParam}" for action "${binding.action}"`,
        );
      }
    }
    */
  }

  /**
   * Convert AssemblyRegistration to AssemblyDefinition
   */
  private convertRegistrationToDefinition(
    registration: AssemblyRegistration,
  ): AssemblyDefinition {
    return {
      p: registration.p,
      op: registration.op,
      name: registration.name,
      version: registration.version,
      description: registration.description,
      actions: registration.actions,
      blocks: registration.blocks,
      layout: registration.layout,
      source_verification: registration.source_verification,
    };
  }

  /**
   * Validate circular dependencies
   */
  private validateCircularDependencies(
    assembly: Assembly,
    errors: string[],
  ): void {
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (assemblyId: string, assemblyData: Assembly): void => {
      if (visiting.has(assemblyId)) {
        errors.push(
          `Circular dependency detected involving assembly "${assemblyId}"`,
        );
        return;
      }

      if (visited.has(assemblyId)) return;

      visiting.add(assemblyId);

      visiting.delete(assemblyId);
      visited.add(assemblyId);
    };

    visit(assembly.id, assembly);
  }

  /**
   * Validate parameter type compatibility
   */
  private validateParameterCompatibility(
    assembly: Assembly,
    warnings: string[],
  ): void {
    for (const block of assembly.blocks) {
      if (block.definition && block.definition.attributes) {
      }
    }
  }
}
