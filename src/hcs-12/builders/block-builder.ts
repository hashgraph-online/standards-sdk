/**
 * BlockBuilder utility for creating HCS-12 block registrations
 */

import { Logger } from '../../utils/logger';
import {
  BlockRegistration,
  BlockStyle,
  BlockAttribute,
  BlockSupport,
  BlockCategory,
} from '../types';

/**
 * Builder for creating block registrations with validation
 */
export class BlockBuilder {
  private logger: Logger;
  private registration: Partial<BlockRegistration>;

  constructor(logger: Logger) {
    this.logger = logger;
    this.registration = {
      p: 'hcs-12',
      op: 'register',
    };
  }

  /**
   * Set HCS-1 topic ID for script storage
   */
  setTopicId(topicId: string): BlockBuilder {
    if (!this.isValidTopicId(topicId)) {
      throw new Error('Invalid topic ID format');
    }
    this.registration.t_id = topicId;
    return this;
  }

  /**
   * Set block name (namespace/block-name format)
   */
  setName(name: string): BlockBuilder {
    if (!this.isValidBlockName(name)) {
      throw new Error('Invalid block name format');
    }
    this.registration.name = name;
    return this;
  }

  /**
   * Set block title
   */
  setTitle(title: string): BlockBuilder {
    this.registration.title = title;
    return this;
  }

  /**
   * Set block category
   */
  setCategory(category: BlockCategory): BlockBuilder {
    const validCategories: BlockCategory[] = [
      'common',
      'formatting',
      'layout',
      'widgets',
      'embed',
      'interactive',
    ];
    if (!validCategories.includes(category)) {
      throw new Error('Invalid block category');
    }
    this.registration.category = category;
    return this;
  }

  /**
   * Set block description
   */
  setDescription(description: string): BlockBuilder {
    this.registration.description = description;
    return this;
  }

  /**
   * Set block icon
   */
  setIcon(icon: string): BlockBuilder {
    if (!this.isValidIcon(icon)) {
      throw new Error('Invalid icon format');
    }
    this.registration.icon = icon;
    return this;
  }

  /**
   * Add keyword for search
   */
  addKeyword(keyword: string): BlockBuilder {
    if (!this.registration.keywords) {
      this.registration.keywords = [];
    }
    this.registration.keywords.push(keyword);
    return this;
  }

  /**
   * Set parent block for inheritance
   */
  setParent(parent: string): BlockBuilder {
    if (!this.isValidBlockName(parent)) {
      throw new Error('Invalid parent block name');
    }
    this.registration.parent = parent;
    return this;
  }

  /**
   * Add block style variation
   */
  addStyle(style: BlockStyle): BlockBuilder {
    if (!this.registration.styles) {
      this.registration.styles = [];
    }
    this.registration.styles.push(style);
    return this;
  }

  /**
   * Add block attribute
   */
  addAttribute(name: string, attribute: BlockAttribute): BlockBuilder {
    const validTypes = ['string', 'number', 'boolean', 'object', 'array'];
    if (!validTypes.includes(attribute.type)) {
      throw new Error('Invalid attribute type');
    }

    if (!this.registration.attributes) {
      this.registration.attributes = {};
    }
    this.registration.attributes[name] = attribute;
    return this;
  }

  /**
   * Set block supports configuration
   */
  setSupports(supports: BlockSupport): BlockBuilder {
    this.registration.supports = supports;
    return this;
  }

  /**
   * Build the block registration
   */
  build(): BlockRegistration {
    this.validate();
    return { ...this.registration } as BlockRegistration;
  }

  /**
   * Reset the builder
   */
  reset(): BlockBuilder {
    this.registration = {
      p: 'hcs-12',
      op: 'register',
    };
    return this;
  }

  /**
   * Create a button block configuration
   */
  createButtonBlock(
    name: string,
    title: string,
    topicId: string,
  ): BlockRegistration {
    return this.reset()
      .setTopicId(topicId)
      .setName(name)
      .setTitle(title)
      .setCategory('widgets')
      .setDescription('A button that executes HashLink actions')
      .setIcon('dashicon:button')
      .addAttribute('label', {
        type: 'string',
        default: 'Click me',
      })
      .addAttribute('action', {
        type: 'string',
        required: true,
        source: 'hashlink-action',
      })
      .addAttribute('params', {
        type: 'object',
        default: {},
      })
      .setSupports({
        align: true,
        customClassName: true,
      })
      .build();
  }

  /**
   * Create a container block configuration
   */
  createContainerBlock(
    name: string,
    title: string,
    topicId: string,
  ): BlockRegistration {
    return this.reset()
      .setTopicId(topicId)
      .setName(name)
      .setTitle(title)
      .setCategory('layout')
      .setDescription('A container for other blocks')
      .setIcon('dashicon:editor-table')
      .setSupports({
        align: true,
        anchor: true,
        customClassName: true,
        inserter: true,
        multiple: true,
      })
      .build();
  }

  /**
   * Check if registration is complete
   */
  isComplete(registration: Partial<BlockRegistration>): boolean {
    return !!(
      registration.p === 'hcs-12' &&
      registration.op === 'register' &&
      registration.t_id &&
      registration.name &&
      registration.title &&
      registration.category
    );
  }

  /**
   * Validate the current registration
   */
  private validate(): void {
    if (!this.registration.t_id) {
      throw new Error('Topic ID is required');
    }
    if (!this.registration.name) {
      throw new Error('Block name is required');
    }
    if (!this.registration.title) {
      throw new Error('Block title is required');
    }
    if (!this.registration.category) {
      throw new Error('Block category is required');
    }
  }

  /**
   * Validate topic ID format
   */
  private isValidTopicId(topicId: string): boolean {
    return /^\d+\.\d+\.\d+$/.test(topicId);
  }

  /**
   * Validate block name format
   */
  private isValidBlockName(name: string): boolean {
    return /^[a-z0-9-]+\/[a-z0-9-]+$/.test(name);
  }

  /**
   * Validate icon format
   */
  private isValidIcon(icon: string): boolean {
    return /^(dashicon:[a-z0-9-]+|svg:.+)$/.test(icon);
  }
}
