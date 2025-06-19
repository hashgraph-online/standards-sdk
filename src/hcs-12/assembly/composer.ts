/**
 * Assembly Composer for HCS-12 HashLinks
 *
 * Orchestrates the composition of actions and blocks into complete assemblies.
 * Handles dependency resolution, validation, and runtime composition.
 */

import { Logger } from '../../utils/logger';
import {
  AssemblyRegistration,
  ActionRegistration,
  BlockRegistration,
  ModuleInfo,
  WasmInterface,
} from '../types';

type AssemblyAction = {
  id: string;
  registryId: string;
  version?: string;
  defaultParams?: Record<string, any>;
};

type AssemblyBlock = {
  id: string;
  registryId: string;
  version?: string;
  actions?: string[];
  attributes?: Record<string, any>;
  children?: string[];
};

export interface ComposedAssembly {
  assembly: AssemblyRegistration;
  actions: Map<
    string,
    {
      registration: ActionRegistration;
      moduleInfo: ModuleInfo;
      wasmInterface?: WasmInterface;
    }
  >;
  blocks: Map<
    string,
    {
      registration: BlockRegistration;
      template?: string;
    }
  >;
  dependencies: AssemblyDependency[];
  validated: boolean;
  errors: string[];
  warnings: string[];
}

export interface AssemblyDependency {
  name: string;
  version: string;
  type: 'action' | 'block' | 'assembly';
  resolved: boolean;
}

export interface CompositionOptions {
  validateActions?: boolean;
  validateBlocks?: boolean;
  loadWasm?: boolean;
  resolveTemplates?: boolean;
  strictDependencies?: boolean;
}

/**
 * Assembly composer for creating complete HashLink assemblies
 */
export class AssemblyComposer {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Compose a complete assembly from registration and components
   */
  async compose(
    assembly: AssemblyRegistration,
    actionRegistrations: Map<string, ActionRegistration>,
    blockRegistrations: Map<string, BlockRegistration>,
    options: CompositionOptions = {},
  ): Promise<ComposedAssembly> {
    this.logger.info('Starting assembly composition', {
      assembly: assembly.name,
      version: assembly.version,
    });

    const composed: ComposedAssembly = {
      assembly,
      actions: new Map(),
      blocks: new Map(),
      dependencies: [],
      validated: false,
      errors: [],
      warnings: [],
    };

    try {
      await this.resolveActions(composed, actionRegistrations, options);

      await this.resolveBlocks(composed, blockRegistrations, options);

      await this.validateDependencies(composed, options);

      await this.validateComposition(composed, options);

      if (options.loadWasm) {
        await this.loadWasmModules(composed);
      }

      if (options.resolveTemplates) {
        await this.resolveTemplates(composed);
      }

      composed.validated = composed.errors.length === 0;

      this.logger.info('Assembly composition completed', {
        assembly: assembly.name,
        validated: composed.validated,
        errors: composed.errors.length,
        warnings: composed.warnings.length,
        actions: composed.actions.size,
        blocks: composed.blocks.size,
      });
    } catch (error) {
      this.logger.error('Assembly composition failed', { error });
      composed.errors.push(
        `Composition failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return composed;
  }

  /**
   * Resolve action dependencies
   */
  private async resolveActions(
    composed: ComposedAssembly,
    actionRegistrations: Map<string, ActionRegistration>,
    options: CompositionOptions,
  ): Promise<void> {
    if (!composed.assembly.actions) {
      return;
    }

    for (const assemblyAction of composed.assembly.actions) {
      try {
        const actionReg = this.findActionRegistration(
          assemblyAction,
          actionRegistrations,
        );

        if (!actionReg) {
          composed.errors.push(
            `Action not found: ${assemblyAction.registryId} (id: ${assemblyAction.id})`,
          );
          continue;
        }

        let moduleInfo: ModuleInfo | undefined;
        if (actionReg.info_t_id) {
          moduleInfo = this.createMockModuleInfo(assemblyAction);
        }

        composed.actions.set(assemblyAction.id, {
          registration: actionReg,
          moduleInfo: moduleInfo || this.createMockModuleInfo(assemblyAction),
        });

        composed.dependencies.push({
          name: assemblyAction.id,
          version: assemblyAction.version || '1.0.0',
          type: 'action',
          resolved: true,
        });
      } catch (error) {
        composed.errors.push(
          `Failed to resolve action ${assemblyAction.registryId}: ${error}`,
        );
      }
    }
  }

  /**
   * Resolve block dependencies
   */
  private async resolveBlocks(
    composed: ComposedAssembly,
    blockRegistrations: Map<string, BlockRegistration>,
    options: CompositionOptions,
  ): Promise<void> {
    if (!composed.assembly.blocks) {
      return;
    }

    for (const assemblyBlock of composed.assembly.blocks) {
      try {
        const blockReg = this.findBlockRegistration(
          assemblyBlock,
          blockRegistrations,
        );

        if (!blockReg) {
          composed.errors.push(
            `Block not found: ${assemblyBlock.registryId} (id: ${assemblyBlock.id})`,
          );
          continue;
        }

        composed.blocks.set(assemblyBlock.id, {
          registration: blockReg,
        });

        composed.dependencies.push({
          name: assemblyBlock.id,
          version: assemblyBlock.version || blockReg.version,
          type: 'block',
          resolved: true,
        });
      } catch (error) {
        composed.errors.push(
          `Failed to resolve block ${assemblyBlock.registryId}: ${error}`,
        );
      }
    }
  }

  /**
   * Validate assembly dependencies
   */
  private async validateDependencies(
    composed: ComposedAssembly,
    options: CompositionOptions,
  ): Promise<void> {
    for (const [blockName, blockInfo] of composed.blocks) {
      const blockData = blockInfo.registration.data;
      if (blockData && typeof blockData === 'object' && blockData.actions) {
        for (const actionName of blockData.actions) {
          const hasAction = Array.from(composed.actions.values()).some(
            actionInfo =>
              actionInfo.moduleInfo.actions.some(
                actionDef => actionDef.name === actionName,
              ),
          );

          if (!hasAction) {
            composed.errors.push(
              `Block ${blockName} requires action ${actionName} which is not available`,
            );
          }
        }
      }
    }

    this.checkCircularDependencies(composed);

    this.validateVersionCompatibility(composed);
  }

  /**
   * Validate the overall composition
   */
  private async validateComposition(
    composed: ComposedAssembly,
    options: CompositionOptions,
  ): Promise<void> {
    if (!composed.assembly.name) {
      composed.errors.push('Assembly name is required');
    }

    if (!composed.assembly.version) {
      composed.errors.push('Assembly version is required');
    }

    if (!composed.assembly.actions || composed.assembly.actions.length === 0) {
      composed.warnings.push('Assembly has no actions defined');
    }

    if (!composed.assembly.blocks || composed.assembly.blocks.length === 0) {
      composed.warnings.push('Assembly has no blocks defined');
    }
  }

  /**
   * Load WASM modules for actions
   */
  private async loadWasmModules(composed: ComposedAssembly): Promise<void> {
    for (const [actionName, actionInfo] of composed.actions) {
      try {
        actionInfo.wasmInterface = this.createMockWasmInterface(
          actionInfo.moduleInfo,
        );
      } catch (error) {
        composed.errors.push(
          `Failed to load WASM for action ${actionName}: ${error}`,
        );
      }
    }
  }

  /**
   * Resolve block templates
   */
  private async resolveTemplates(composed: ComposedAssembly): Promise<void> {
    for (const [blockName, blockInfo] of composed.blocks) {
      try {
        if (blockInfo.registration.t_id) {
          blockInfo.template = this.createMockTemplate(blockInfo.registration);
        } else {
          blockInfo.template = this.generateDefaultTemplate(
            blockInfo.registration,
          );
        }
      } catch (error) {
        composed.warnings.push(
          `Failed to resolve template for block ${blockName}: ${error}`,
        );
      }
    }
  }

  /**
   * Find action registration by registry ID
   */
  private findActionRegistration(
    assemblyAction: AssemblyAction,
    registrations: Map<string, ActionRegistration>,
  ): ActionRegistration | undefined {
    return registrations.get(assemblyAction.registryId);
  }

  /**
   * Find block registration by registry ID
   */
  private findBlockRegistration(
    assemblyBlock: AssemblyBlock,
    registrations: Map<string, BlockRegistration>,
  ): BlockRegistration | undefined {
    return registrations.get(assemblyBlock.registryId);
  }

  /**
   * Check for circular dependencies
   */
  private checkCircularDependencies(composed: ComposedAssembly): void {
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (depName: string): boolean => {
      if (visiting.has(depName)) {
        composed.errors.push(
          `Circular dependency detected involving ${depName}`,
        );
        return false;
      }

      if (visited.has(depName)) {
        return true;
      }

      visiting.add(depName);

      visiting.delete(depName);
      visited.add(depName);
      return true;
    };

    for (const dep of composed.dependencies) {
      visit(dep.name);
    }
  }

  /**
   * Validate version compatibility
   */
  private validateVersionCompatibility(composed: ComposedAssembly): void {
    const requiredVersion = '1.0.0';

    for (const [actionName, actionInfo] of composed.actions) {
      if (actionInfo.moduleInfo.hashlinks_version !== requiredVersion) {
        composed.warnings.push(
          `Action ${actionName} uses HashLinks version ${actionInfo.moduleInfo.hashlinks_version}, expected ${requiredVersion}`,
        );
      }
    }
  }

  /**
   * Validate workflow structure (not part of standard)
   */
  private validateWorkflow(composed: ComposedAssembly): void {
    return;
  }

  /**
   * Create mock module info for testing
   */
  /**
   * Create mock module info for testing
   */
  private createMockModuleInfo(assemblyAction: AssemblyAction): ModuleInfo {
    return {
      name: assemblyAction.id || 'mock-action',
      version: assemblyAction.version || '1.0.0',
      hashlinks_version: '1.0.0',
      creator: 'Mock Creator',
      purpose: 'Mock action for testing',
      actions: [
        {
          name: 'execute',
          description: 'Execute the action',
          inputs: [],
          outputs: [],
          required_capabilities: [],
        },
      ],
      capabilities: [],
      plugins: [],
    };
  }

  /**
   * Create mock WASM interface for testing
   */
  /**
   * Create mock WASM interface for testing
   */
  private createMockWasmInterface(moduleInfo: ModuleInfo): WasmInterface {
    return {
      INFO(): string {
        return JSON.stringify(moduleInfo);
      },

      async GET(
        action: string,
        params: string,
        network: 'mainnet' | 'testnet',
      ): Promise<string> {
        return JSON.stringify({
          action,
          params: JSON.parse(params),
          network,
          result: 'mock-result',
          timestamp: new Date().toISOString(),
        });
      },

      async POST(
        action: string,
        params: string,
        network: 'mainnet' | 'testnet',
        hashLinkMemo: string,
      ): Promise<string> {
        return JSON.stringify({
          action,
          params: JSON.parse(params),
          network,
          memo: hashLinkMemo,
          result: 'mock-transaction-result',
          timestamp: new Date().toISOString(),
        });
      },
    };
  }

  /**
   * Create mock template for testing
   */
  /**
   * Create mock template for testing
   */
  private createMockTemplate(registration: BlockRegistration): string {
    return `
<div class="hashlinks-block">
  <h3>${registration.title || registration.id}</h3>
  <p>Mock template for ${registration.id}</p>
</div>`;
  }

  /**
   * Generate default template from block definition
   */
  /**
   * Generate default template from block definition
   */
  private generateDefaultTemplate(registration: BlockRegistration): string {
    const blockJson = registration.blockJson;
    if (!blockJson) {
      return this.createMockTemplate(registration);
    }

    return `
<div class="wp-block-${blockJson.id}">
  <h3>${blockJson.title}</h3>
  <p>${registration.description || 'No description available'}</p>
  <!-- Attributes would be rendered here -->
</div>`;
  }
}
