/**
 * Block Renderer for HCS-12 HashLinks
 *
 * Renders Gutenberg blocks with HashLink integration
 */

import { Logger } from '../../utils/logger';
import { GutenbergBridge } from './gutenberg-bridge';
import { TemplateEngine, TemplateContext } from './template-engine';
import { BlockStateManager, BlockState } from './block-state-manager';
import { GutenbergBlockType } from '../types';

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
      if (options.initialState) {
        this.stateManager.setBlockState(block.id, options.initialState);
      }

      const state = this.stateManager.getBlockState(block.id) || {};

      const html = await this.templateEngine.render(block.template || '', {
        ...block.attributes,
        ...state,
        blockId: block.id,
      });

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
      element.addEventListener('click', e => {
        e.preventDefault();
        const action = (element as HTMLElement).dataset.action;
        if (action) {
          this.stateManager.sendMessage(blockId, 'action', { action });
        }
      });
    });
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
