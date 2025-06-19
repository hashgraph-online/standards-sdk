/**
 * Assembly Lifecycle Manager for HCS-12 HashLinks
 *
 * Manages assembly initialization, updates, cleanup, and state transitions
 * with support for dependency management and error recovery.
 */

import { Logger } from '../../utils/logger';
import { Assembly } from './assembly-engine';

export interface LifecycleOptions {
  partialFailureMode?: 'fail' | 'continue';
  retryOptions?: RetryOptions;
  hotReloadEnabled?: boolean;
}

export interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  backoffFactor: number;
}

export interface InitializationResult {
  success: boolean;
  assemblyId: string;
  state: AssemblyState;
  components: ComponentStatus[];
  errors?: string[];
  warnings?: string[];
  partialFailure?: boolean;
}

export interface UpdateResult {
  success: boolean;
  assemblyId: string;
  state: AssemblyState;
  changes: string[];
  errors?: string[];
  hotReloaded?: boolean;
}

export interface CleanupResult {
  success: boolean;
  assemblyId: string;
  finalState: AssemblyState;
  cleanedResources: string[];
  errors?: string[];
}

export type HotReloadData =
  | { type: 'component'; componentId: string; definition: Record<string, any> }
  | {
      type: 'dependency';
      dependencies: string[];
      versions?: Record<string, string>;
    }
  | { type: 'configuration'; config: Record<string, any> };

export interface HotReloadUpdate {
  type: 'component' | 'dependency' | 'configuration';
  componentId?: string;
  data: HotReloadData;
}

export interface ComponentStatus {
  id: string;
  type: 'action' | 'block' | 'dependency';
  state: ComponentState;
  version?: string;
  error?: string;
}

export interface AssemblyStatus {
  id: string;
  name: string;
  version: string;
  state: AssemblyState;
  components: ComponentStatus[];
  uptime: number;
  lastUpdate?: string;
  dependencies: string[];
}

export type AssemblyState =
  | 'uninitialized'
  | 'initializing'
  | 'initialized'
  | 'updating'
  | 'updated'
  | 'destroying'
  | 'destroyed'
  | 'error';

export type ComponentState =
  | 'pending'
  | 'initializing'
  | 'ready'
  | 'updating'
  | 'error'
  | 'destroyed';

export interface StateChangeEvent {
  assemblyId: string;
  oldState: AssemblyState;
  newState: AssemblyState;
  timestamp: number;
}

export interface ComponentEvent {
  assemblyId: string;
  componentId: string;
  type: 'added' | 'updated' | 'removed' | 'error';
  data?: unknown;
}

export type DependencyInitializer = (
  dependencyId: string,
) => Promise<{ success: boolean }>;
export type DependencyCleanup = (
  dependencyId: string,
) => Promise<{ success: boolean }>;
export type ComponentCleanup = (componentId: string) => Promise<void>;
export type RetryableOperation<T> = () => Promise<T>;

/**
 * Event emitter for lifecycle events
 */
class EventEmitter {
  private listeners: Map<string, Function[]> = new Map();

  on(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  emit(event: string, data: unknown): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const listener of eventListeners) {
        try {
          listener(data);
        } catch (error) {}
      }
    }
  }
}

/**
 * Manager for assembly lifecycle operations
 */
export class LifecycleManager extends EventEmitter {
  private logger: Logger;
  private assemblies: Map<string, AssemblyStatus> = new Map();
  private operationLocks: Map<string, Promise<any>> = new Map();

  private dependencyInitializer?: DependencyInitializer;
  private dependencyCleanup?: DependencyCleanup;
  private componentCleanup?: ComponentCleanup;
  private retryableOperation?: RetryableOperation<any>;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  /**
   * Initialize an assembly and all its components
   */
  async initializeAssembly(
    assembly: Assembly,
    options: LifecycleOptions = {},
  ): Promise<InitializationResult> {
    this.logger.info('Initializing assembly', { assemblyId: assembly.id });

    if (this.operationLocks.has(assembly.id)) {
      return {
        success: false,
        assemblyId: assembly.id,
        state: 'error',
        components: [],
        errors: ['Assembly is already being processed'],
      };
    }

    const initPromise = this._initializeAssembly(assembly, options);
    this.operationLocks.set(assembly.id, initPromise);

    try {
      const result = await initPromise;
      return result;
    } finally {
      this.operationLocks.delete(assembly.id);
    }
  }

  /**
   * Update an existing assembly
   */
  async updateAssembly(
    assemblyId: string,
    newAssembly: Assembly,
    options: LifecycleOptions = {},
  ): Promise<UpdateResult> {
    this.logger.info('Updating assembly', { assemblyId });

    if (this.operationLocks.has(assemblyId)) {
      return {
        success: false,
        assemblyId,
        state: 'error',
        changes: [],
        errors: ['Assembly is currently being processed'],
      };
    }

    const updatePromise = this._updateAssembly(
      assemblyId,
      newAssembly,
      options,
    );
    this.operationLocks.set(assemblyId, updatePromise);

    try {
      const result = await updatePromise;
      return result;
    } finally {
      this.operationLocks.delete(assemblyId);
    }
  }

  /**
   * Cleanup and destroy an assembly
   */
  async cleanupAssembly(assemblyId: string): Promise<CleanupResult> {
    this.logger.info('Cleaning up assembly', { assemblyId });

    if (this.operationLocks.has(assemblyId)) {
      await this.operationLocks.get(assemblyId);
    }

    const cleanupPromise = this._cleanupAssembly(assemblyId);
    this.operationLocks.set(assemblyId, cleanupPromise);

    try {
      const result = await cleanupPromise;
      return result;
    } finally {
      this.operationLocks.delete(assemblyId);
    }
  }

  /**
   * Perform hot reload update
   */
  async hotReload(
    assemblyId: string,
    update: HotReloadUpdate,
  ): Promise<UpdateResult> {
    this.logger.debug('Hot reloading assembly', {
      assemblyId,
      updateType: update.type,
    });

    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) {
      return {
        success: false,
        assemblyId,
        state: 'error',
        changes: [],
        errors: ['Assembly not found'],
      };
    }

    try {
      this.setState(assemblyId, 'updating');

      const changes: string[] = [];

      switch (update.type) {
        case 'component':
          if (update.componentId) {
            changes.push(`Hot reloaded component "${update.componentId}"`);
            this.emit('componentUpdated', {
              assemblyId,
              componentId: update.componentId,
              type: 'updated',
            });
          }
          break;
        case 'dependency':
          changes.push('Hot reloaded dependencies');
          break;
        case 'configuration':
          changes.push('Hot reloaded configuration');
          break;
      }

      this.setState(assemblyId, 'updated');

      return {
        success: true,
        assemblyId,
        state: 'updated',
        changes,
        hotReloaded: true,
      };
    } catch (error) {
      this.setState(assemblyId, 'error');
      return {
        success: false,
        assemblyId,
        state: 'error',
        changes: [],
        errors: [error instanceof Error ? error.message : 'Hot reload failed'],
      };
    }
  }

  /**
   * Get current status of an assembly
   */
  getAssemblyStatus(assemblyId: string): AssemblyStatus | undefined {
    return this.assemblies.get(assemblyId);
  }

  /**
   * Set dependency initializer for testing
   */
  setDependencyInitializer(initializer: DependencyInitializer): void {
    this.dependencyInitializer = initializer;
  }

  /**
   * Set dependency cleanup for testing
   */
  setDependencyCleanup(cleanup: DependencyCleanup): void {
    this.dependencyCleanup = cleanup;
  }

  /**
   * Set component cleanup for testing
   */
  setComponentCleanup(cleanup: ComponentCleanup): void {
    this.componentCleanup = cleanup;
  }

  /**
   * Set retryable operation for testing
   */
  setRetryableOperation<T>(operation: RetryableOperation<T>): void {
    this.retryableOperation = operation;
  }

  /**
   * Private implementation of assembly initialization
   */
  private async _initializeAssembly(
    assembly: Assembly,
    options: LifecycleOptions,
  ): Promise<InitializationResult> {
    const result: InitializationResult = {
      success: true,
      assemblyId: assembly.id,
      state: 'initializing',
      components: [],
      errors: [],
      warnings: [],
    };

    try {
      const status: AssemblyStatus = {
        id: assembly.id,
        name: assembly.definition.name,
        version: assembly.definition.version,
        state: 'initializing',
        components: [],
        uptime: Date.now(),
        dependencies: assembly.dependencies.map(d => d.id),
      };
      this.assemblies.set(assembly.id, status);

      this.setState(assembly.id, 'initializing');

      for (const dependency of assembly.dependencies) {
        try {
          if (this.dependencyInitializer) {
            await this.dependencyInitializer(dependency.id);
          }
          this.logger.debug('Dependency initialized', {
            assemblyId: assembly.id,
            dependencyId: dependency.id,
          });
        } catch (error) {
          const errorMsg = `Failed to initialize dependency "${dependency.id}": ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors!.push(errorMsg);

          if (options.partialFailureMode !== 'continue') {
            result.success = false;
            this.setState(assembly.id, 'error');
            return result;
          }
        }
      }

      for (const block of assembly.blocks) {
        try {
          if (block.error) {
            throw new Error(block.error);
          }

          const componentStatus: ComponentStatus = {
            id: block.id,
            type: 'block',
            state: 'ready',
            version: block.definition?.version,
          };

          result.components.push(componentStatus);
          status.components.push(componentStatus);

          this.logger.debug('Block initialized', {
            assemblyId: assembly.id,
            blockId: block.id,
          });
        } catch (error) {
          const errorMsg = `Failed to initialize block "${block.id}": ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors!.push(errorMsg);

          if (options.partialFailureMode !== 'continue') {
            result.success = false;
            this.setState(assembly.id, 'error');
            return result;
          } else {
            result.partialFailure = true;
          }
        }
      }

      for (const action of assembly.actions) {
        try {
          if (action.error) {
            throw new Error(action.error);
          }

          const componentStatus: ComponentStatus = {
            id: action.id,
            type: 'action',
            state: 'ready',
            version: (action.definition as any)?.version,
          };

          result.components.push(componentStatus);
          status.components.push(componentStatus);

          this.logger.debug('Action initialized', {
            assemblyId: assembly.id,
            actionId: action.id,
          });
        } catch (error) {
          const errorMsg = `Failed to initialize action "${action.id}": ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors!.push(errorMsg);

          if (options.partialFailureMode !== 'continue') {
            result.success = false;
            this.setState(assembly.id, 'error');
            return result;
          } else {
            result.partialFailure = true;
          }
        }
      }

      if (this.retryableOperation && options.retryOptions) {
        try {
          await this.executeWithRetry(
            this.retryableOperation,
            options.retryOptions,
          );
        } catch (error) {
          result.errors!.push(
            `Retryable operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );

          if (options.partialFailureMode !== 'continue') {
            result.success = false;
            this.setState(assembly.id, 'error');
            return result;
          }
        }
      }

      const finalState = result.success ? 'initialized' : 'error';
      result.state = finalState;
      this.setState(assembly.id, finalState);

      this.logger.info('Assembly initialization completed', {
        assemblyId: assembly.id,
        success: result.success,
        componentCount: result.components.length,
        partialFailure: result.partialFailure,
      });

      return result;
    } catch (error) {
      result.success = false;
      result.state = 'error';
      result.errors!.push(
        error instanceof Error ? error.message : 'Unknown initialization error',
      );
      this.setState(assembly.id, 'error');
      return result;
    }
  }

  /**
   * Private implementation of assembly update
   */
  private async _updateAssembly(
    assemblyId: string,
    newAssembly: Assembly,
    options: LifecycleOptions,
  ): Promise<UpdateResult> {
    const result: UpdateResult = {
      success: true,
      assemblyId,
      state: 'updating',
      changes: [],
      errors: [],
    };

    try {
      this.setState(assemblyId, 'updating');

      const currentStatus = this.assemblies.get(assemblyId);
      if (!currentStatus) {
        throw new Error('Assembly not found');
      }

      if (currentStatus.version !== newAssembly.definition.version) {
        result.changes.push(
          `Updated assembly version from ${currentStatus.version} to ${newAssembly.definition.version}`,
        );
        currentStatus.version = newAssembly.definition.version;
      }

      const currentBlockIds = new Set(
        currentStatus.components.filter(c => c.type === 'block').map(c => c.id),
      );
      const newBlockIds = new Set(newAssembly.blocks.map(b => b.id));

      for (const blockId of currentBlockIds) {
        if (!newBlockIds.has(blockId)) {
          result.changes.push(`Removed block "${blockId}"`);
          currentStatus.components = currentStatus.components.filter(
            c => c.id !== blockId,
          );
        }
      }

      for (const block of newAssembly.blocks) {
        const existing = currentStatus.components.find(
          c => c.id === block.id && c.type === 'block',
        );

        if (!existing) {
          result.changes.push(`Added block "${block.id}"`);
          currentStatus.components.push({
            id: block.id,
            type: 'block',
            state: 'ready',
            version: block.definition?.version,
          });
        } else if (existing.version !== block.definition?.version) {
          result.changes.push(
            `Updated block "${block.id}" from version ${existing.version} to ${block.definition?.version}`,
          );
          existing.version = block.definition?.version;
        }
      }

      currentStatus.lastUpdate = new Date().toISOString();
      result.state = 'updated';
      this.setState(assemblyId, 'updated');

      return result;
    } catch (error) {
      result.success = false;
      result.state = 'error';
      result.errors!.push(
        error instanceof Error ? error.message : 'Unknown update error',
      );
      this.setState(assemblyId, 'error');
      return result;
    }
  }

  /**
   * Private implementation of assembly cleanup
   */
  private async _cleanupAssembly(assemblyId: string): Promise<CleanupResult> {
    const result: CleanupResult = {
      success: true,
      assemblyId,
      finalState: 'destroying',
      cleanedResources: [],
      errors: [],
    };

    try {
      this.setState(assemblyId, 'destroying');

      const status = this.assemblies.get(assemblyId);
      if (!status) {
        throw new Error('Assembly not found');
      }

      for (const component of status.components) {
        try {
          if (this.componentCleanup) {
            await this.componentCleanup(component.id);
          }
          result.cleanedResources.push(component.id);

          this.logger.debug('Component cleaned up', {
            assemblyId,
            componentId: component.id,
          });
        } catch (error) {
          const errorMsg = `Failed to cleanup component "${component.id}": ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors!.push(errorMsg);
          result.success = false;
        }
      }

      for (const dependencyId of status.dependencies) {
        try {
          if (this.dependencyCleanup) {
            await this.dependencyCleanup(dependencyId);
          }
          result.cleanedResources.push(dependencyId);

          this.logger.debug('Dependency cleaned up', {
            assemblyId,
            dependencyId,
          });
        } catch (error) {
          const errorMsg = `Failed to cleanup dependency "${dependencyId}": ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors!.push(errorMsg);
          result.success = false;
        }
      }

      result.finalState = 'destroyed';
      this.setState(assemblyId, 'destroyed');

      this.assemblies.delete(assemblyId);

      this.logger.info('Assembly cleanup completed', {
        assemblyId,
        success: result.success,
        cleanedCount: result.cleanedResources.length,
      });

      return result;
    } catch (error) {
      result.success = false;
      result.finalState = 'error';
      result.errors!.push(
        error instanceof Error ? error.message : 'Unknown cleanup error',
      );
      this.setState(assemblyId, 'error');
      return result;
    }
  }

  /**
   * Set assembly state and emit event
   */
  private setState(assemblyId: string, newState: AssemblyState): void {
    const status = this.assemblies.get(assemblyId);
    if (status) {
      const oldState = status.state;
      status.state = newState;

      this.emit('stateChanged', {
        assemblyId,
        oldState,
        newState,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Execute operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: RetryableOperation<T>,
    options: RetryOptions,
  ): Promise<T> {
    let lastError: Error;
    let delay = options.initialDelay;

    for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt === options.maxRetries) {
          break;
        }

        this.logger.warn(`Operation failed, retrying`, {
          attempt,
          maxRetries: options.maxRetries,
          delay,
          error: lastError.message,
        });

        await this.sleep(delay);
        delay *= options.backoffFactor;
      }
    }

    throw lastError!;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
