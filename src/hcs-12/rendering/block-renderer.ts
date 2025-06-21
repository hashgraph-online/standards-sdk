/**
 * Block Renderer for HCS-12 HashLinks
 *
 * Renders Gutenberg blocks with HashLink integration
 */

import { Logger } from '../../utils/logger';
import { GutenbergBridge } from './gutenberg-bridge';
import { TemplateEngine, TemplateContext } from './template-engine';
import { BlockStateManager, BlockState } from './block-state-manager';
import { GutenbergBlockType, ActionRegistration } from '../types';
import { WasmExecutor } from '../wasm/wasm-executor';
import { NetworkType } from '../../utils/types';
import type { ActionRegistry } from '../registries/action-registry';
import type { Assembly } from '../assembly/assembly-engine';

export interface BlockDefinitionWithUI {
  id: string;
  template?: string;
  attributes?: Record<string, any>;
  styles?: string;

  p: 'hcs-12';
  op: 'register' | 'template' | 'pattern';
  name: string;
  version: string;
  blockJson?: GutenbergBlockType;
  t_id?: string;
  title?: string;
  description?: string;
  categories?: string[];
  content?: string | Record<string, any> | any[];
}

export interface RenderOptions {
  container?: string | HTMLElement;
  initialState?: BlockState;
  theme?: 'light' | 'dark';
  responsive?: boolean;
  assembly?: Assembly;
  actionRegistry?: ActionRegistry;
  network?: NetworkType;
}

export interface RenderResult {
  element?: HTMLElement;
  html?: string;
  cleanup?: () => void;
}

/**
 * Renders HashLink blocks to DOM or HTML
 */
export class BlockRenderer {
  private logger: Logger;
  private gutenbergBridge: GutenbergBridge;
  private templateEngine: TemplateEngine;
  private stateManager: BlockStateManager;
  private wasmExecutor?: WasmExecutor;
  private currentBlock?: BlockDefinitionWithUI;
  private currentOptions?: RenderOptions;
  private assembly?: Assembly;
  private actionRegistry?: ActionRegistry;

  constructor(
    logger: Logger,
    gutenbergBridge: GutenbergBridge,
    templateEngine: TemplateEngine,
    stateManager: BlockStateManager,
  ) {
    this.logger = logger;
    this.gutenbergBridge = gutenbergBridge;
    this.templateEngine = templateEngine;
    this.stateManager = stateManager;
  }

  /**
   * Render a block
   */
  async render(
    block: BlockDefinitionWithUI,
    options: RenderOptions = {},
  ): Promise<RenderResult> {
    try {
      // Store current block and options for re-rendering
      this.currentBlock = block;
      this.currentOptions = options;

      // Store assembly and action registry if provided
      if (options.assembly) {
        this.assembly = options.assembly;
      }
      if (options.actionRegistry) {
        this.actionRegistry = options.actionRegistry;
      }

      // Initialize WASM executor if we have network info
      if (options.network && !this.wasmExecutor) {
        this.wasmExecutor = new WasmExecutor(this.logger, options.network);
      }

      if (options.initialState) {
        this.stateManager.setBlockState(block.id, options.initialState);
      }

      let state = this.stateManager.getBlockState(block.id) || {
        attributes: {},
        actionResults: {},
      };
      
      // Ensure state has the correct structure
      if (!state.attributes || typeof state.attributes !== 'object') {
        this.logger.warn('Invalid state structure, fixing...', { state });
        state = {
          attributes: state as any || {},
          actionResults: {}
        };
      }

      // Get action mappings from assembly if available
      let actions = {};
      let attributes = block.attributes || {};

      if (this.assembly) {
        // Find the block in the assembly to get its action mappings
        const assemblyBlock = this.assembly.state?.blocks?.find(
          b => b.block_t_id === block.id || b.block_t_id === block.t_id,
        );

        if (assemblyBlock) {
          actions = assemblyBlock.actions || {};
          // Merge assembly attributes with block attributes
          attributes = {
            ...assemblyBlock.attributes,
            ...attributes,
          };
        }
      }

      // Extract default values from block definition attributes
      const defaultAttributes: Record<string, any> = {};
      if (block.attributes) {
        Object.entries(block.attributes).forEach(([key, attrDef]: [string, any]) => {
          if (attrDef && typeof attrDef === 'object' && 'default' in attrDef) {
            defaultAttributes[key] = attrDef.default;
          }
        });
      }
      
      // Merge attributes, ensuring we only get primitive values
      const mergedAttributes: Record<string, any> = { ...defaultAttributes };
      
      // Add block attributes
      if (attributes && typeof attributes === 'object') {
        Object.entries(attributes).forEach(([key, value]) => {
          if (typeof value !== 'object' || value === null) {
            mergedAttributes[key] = value;
          }
        });
      }
      
      // Add state attributes (these take precedence)
      if (state.attributes && typeof state.attributes === 'object') {
        Object.entries(state.attributes).forEach(([key, value]) => {
          if (typeof value !== 'object' || value === null) {
            mergedAttributes[key] = value;
          }
        });
      }

      // Update state with merged attributes to ensure defaults are persistent
      state.attributes = { ...mergedAttributes };
      this.stateManager.setBlockState(block.id, state);
      
      const templateContext = {
        attributes: mergedAttributes,
        actions,
        blockId: block.id,
        // Don't spread the entire state to avoid conflicts
        actionResults: state.actionResults || {}
      };
      
      this.logger.debug('Template context', {
        blockId: block.id,
        attributes: templateContext.attributes,
        hasActions: !!actions,
        actionKeys: Object.keys(actions),
        rawState: state,
        mergedAttributes: mergedAttributes
      });
      
      console.log('DEBUG: Template context for render', {
        blockId: block.id,
        attributes: templateContext.attributes,
        actionResults: templateContext.actionResults,
        hasInitialState: !!options.initialState,
        initialStateAttributes: options.initialState?.attributes,
        stateFromManager: state
      });

      const html = await this.templateEngine.render(block.template || '', templateContext);

      if (options.container && typeof window !== 'undefined') {
        const container =
          typeof options.container === 'string'
            ? document.querySelector(options.container)
            : options.container;

        if (container instanceof HTMLElement) {
          container.innerHTML = html;

          if (block.styles) {
            this.applyStyles(block.id, block.styles);
          }

          this.setupEventHandlers(container, block.id);

          return {
            element: container,
            html,
            cleanup: () => this.cleanup(block.id),
          };
        }
      }

      return { html };
    } catch (error) {
      this.logger.error('Block render failed', {
        blockId: block.id,
        error,
      });
      throw error;
    }
  }

  /**
   * Apply block styles
   */
  private applyStyles(blockId: string, styles: string): void {
    if (typeof document === 'undefined') return;

    const styleId = `hashlink-styles-${blockId}`;
    let styleElement = document.getElementById(styleId);

    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    styleElement.textContent = styles;
  }

  /**
   * Setup event handlers for block
   */
  private setupEventHandlers(container: HTMLElement, blockId: string): void {
    this.stateManager.onStateChange(blockId, state => {
      this.updateBlockUI(container, state);
    });

    container.querySelectorAll('[data-action]').forEach(element => {
      element.addEventListener('click', async e => {
        e.preventDefault();
        const actionTopicId = (element as HTMLElement).dataset.action;
        const paramsStr = (element as HTMLElement).dataset.params;
        
        this.logger.debug('Action button clicked', {
          actionTopicId,
          paramsStr,
          hasAction: !!actionTopicId
        });
        
        console.log('DEBUG: Button clicked', {
          actionTopicId,
          paramsStr,
          blockId
        });

        if (actionTopicId) {
          await this.executeAction(blockId, actionTopicId, paramsStr);
        }
      });
    });
  }

  /**
   * Update the block display by re-rendering with new state
   */
  private async updateBlockDisplay(blockId: string, newState: BlockState): Promise<void> {
    try {
      this.logger.debug('updateBlockDisplay called', { blockId, newState });
      console.log('DEBUG: updateBlockDisplay called', { blockId, newState });
      
      // Find the block container
      const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
      console.log('DEBUG: Found block element?', !!blockElement, blockElement);
      
      if (!blockElement || !blockElement.parentElement) {
        this.logger.warn('Block element not found for re-render', { blockId });
        console.log('DEBUG: Block element not found!', {
          blockId,
          hasElement: !!blockElement,
          hasParent: !!blockElement?.parentElement,
          allBlockElements: document.querySelectorAll('[data-block-id]').length
        });
        return;
      }

      const container = blockElement.parentElement;

      // Re-render the block with the updated state
      console.log('DEBUG: Re-render check', {
        hasCurrentBlock: !!this.currentBlock,
        currentBlockId: this.currentBlock?.id,
        matchesBlockId: this.currentBlock?.id === blockId,
        hasOptions: !!this.currentOptions
      });
      
      if (this.currentBlock && this.currentBlock.id === blockId && this.currentOptions) {
        const updatedOptions = {
          ...this.currentOptions,
          container,
          initialState: newState
        };

        console.log('DEBUG: About to re-render with new state', {
          currentState: newState,
          attributes: newState.attributes,
          actionResults: newState.actionResults
        });
        
        const renderResult = await this.render(this.currentBlock, updatedOptions);
        
        console.log('DEBUG: Render completed', {
          hasElement: !!renderResult.element,
          hasHtml: !!renderResult.html
        });

        this.logger.debug('Block re-rendered with updated state', { blockId, newState });
        console.log('DEBUG: Block re-rendered successfully');
      } else {
        console.log('DEBUG: Skipping re-render - conditions not met');
      }
    } catch (error) {
      this.logger.error('Failed to re-render block', { blockId, error: error.message });
      console.error('DEBUG: Re-render failed', error);
    }
  }

  /**
   * Execute a WASM action
   */
  private async executeAction(
    blockId: string,
    actionTopicId: string,
    paramsStr?: string,
  ): Promise<void> {
    try {
      this.logger.debug('Executing action', { blockId, actionTopicId });

      // Parse params
      let params = {};
      if (paramsStr) {
        try {
          params = JSON.parse(paramsStr);
        } catch (e) {
          this.logger.warn('Failed to parse action params', { paramsStr });
        }
      }

      // Get current state
      const currentState = this.stateManager.getBlockState(blockId) || {
        attributes: {},
        actionResults: {},
      };
      
      console.log('DEBUG: Current state before WASM execution', {
        blockId,
        currentState,
        params,
        stateAttributes: currentState.attributes
      });

      // If we have WASM executor and action registry, execute the action
      if (this.wasmExecutor && this.actionRegistry) {
        // Look up the action by topic ID
        this.logger.debug('Looking up action in registry', { actionTopicId });
        console.log('DEBUG: Looking up action in registry', { actionTopicId });
        
        const action =
          await this.actionRegistry.getActionByTopicId(actionTopicId);
        
        this.logger.debug('Action lookup result', { 
          found: !!action,
          actionTopicId,
          actionData: action
        });
        console.log('DEBUG: Action lookup result', { 
          found: !!action,
          actionTopicId,
          actionData: action
        });
        
        if (!action) {
          throw new Error(`Action not found: ${actionTopicId}`);
        }

        // Execute the WASM - pass all button params and current state
        this.logger.debug('Executing WASM', {
          actionData: action,
          params,
          state: currentState.attributes
        });
        console.log('DEBUG: About to execute WASM', {
          actionData: action,
          params,
          state: currentState.attributes
        });
        
        const result = await this.wasmExecutor.execute(action, {
          method: 'POST',
          params,
          state: currentState.attributes,
        });
        
        this.logger.debug('WASM execution result', { result });
        console.log('DEBUG: WASM execution result', { result });

        if (result.success && result.data) {
          const operation = (params as any).operation || 'default';
          
          // The WASM returns a nested structure, extract the actual data
          let wasmData = result.data;
          if (wasmData.success && wasmData.data) {
            // WASM returned {success: true, data: {count: X}, message: "..."}
            wasmData = wasmData.data;
          }
          
          console.log('DEBUG: Extracted WASM data', { wasmData });
          
          const newState = {
            ...currentState,
            attributes: {
              ...currentState.attributes,
              ...wasmData,
            },
            actionResults: {
              ...currentState.actionResults,
              [operation]: wasmData,
            },
          };

          this.stateManager.updateBlockState(blockId, newState);
          
          // Re-render the block with updated state
          await this.updateBlockDisplay(blockId, newState);
        } else {
          this.logger.error('Action execution failed', { result });
        }
      } else {
        // Fallback: just send the message for external handling
        this.stateManager.sendMessage(blockId, 'action', {
          action: actionTopicId,
          params,
        });
      }
    } catch (error) {
      this.logger.error('Failed to execute action', {
        blockId,
        actionTopicId,
        error: error.message,
      });

      // Still send the message so external handlers can process it
      this.stateManager.sendMessage(blockId, 'action-error', {
        action: actionTopicId,
        error: error.message,
      });
    }
  }

  /**
   * Update block UI on state change
   */
  private updateBlockUI(container: HTMLElement, state: BlockState): void {
    Object.entries(state).forEach(([key, value]) => {
      const elements = container.querySelectorAll(`[data-bind="${key}"]`);
      elements.forEach(element => {
        if (element instanceof HTMLElement) {
          element.textContent = String(value);
        }
      });
    });
  }

  /**
   * Cleanup block resources
   */
  private cleanup(blockId: string): void {
    const styleElement = document.getElementById(`hashlink-styles-${blockId}`);
    if (styleElement) {
      styleElement.remove();
    }

    this.stateManager.removeBlockState(blockId);
  }
}
