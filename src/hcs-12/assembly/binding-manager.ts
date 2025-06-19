/**
 * Binding Manager for HCS-12 HashLinks
 *
 * Manages action-block bindings, parameter mapping, and validation with support
 * for complex parameter resolution and conditional execution.
 */

import { Logger } from '../../utils/logger';
import { ParameterDefinition } from '../types';
import { BlockState } from '../rendering/block-state-manager';

export interface ParameterMapping {
  source: 'attributes' | 'actionResults' | 'default' | 'literal';
  field?: string;
  value?: string | number | boolean | null;
  type: string;
}

export interface MappingResult {
  isValid: boolean;
  mapping: Record<string, ParameterMapping>;
  errors: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  conditionalExecution?: boolean;
}

export interface ExecutionResult {
  success: boolean;
  data?: string | number | boolean | Record<string, unknown> | unknown[];
  error?: string;
  skipped?: boolean;
  reason?: string;
  transactionId?: string;
}

export interface BlockDefinition {
  name: string;
  attributes: Array<{
    name: string;
    type: string;
    required?: boolean;
    properties?: Record<string, unknown>;
  }>;
}

export interface ActionDefinition {
  name: string;
  parameters: ParameterDefinition[];
}

export interface Binding {
  action: string;
  parameters: Record<string, string>;
  condition?: string;
  trigger?: string;
  validation?: {
    enabled: boolean;
    showErrors: boolean;
  };
  outputAs?: string;
}

export type ActionExecutor = (
  actionId: string,
  parameters: Record<string, any>,
) => Promise<ExecutionResult>;

/**
 * Manager for creating and executing bindings between blocks and actions
 */
export class BindingManager {
  private logger: Logger;

  private readonly validTriggers = new Set([
    'onClick',
    'onSubmit',
    'onChange',
    'onLoad',
  ]);

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Create parameter mapping between block attributes and action parameters
   */
  createParameterMapping(
    blockDefinition: BlockDefinition,
    actionDefinition: ActionDefinition,
    binding: Binding,
  ): MappingResult {
    this.logger.debug('Creating parameter mapping', {
      blockName: blockDefinition.name,
      actionName: actionDefinition.name,
    });

    const mapping: Record<string, ParameterMapping> = {};
    const errors: string[] = [];

    const blockAttributeMap = new Map<string, any>();
    blockDefinition.attributes.forEach(attr => {
      blockAttributeMap.set(attr.name, attr);

      if (attr.properties) {
        this.flattenProperties(attr.properties, attr.name, blockAttributeMap);
      }
    });

    const actionParameterMap = new Map<string, any>();
    actionDefinition.parameters.forEach(param => {
      actionParameterMap.set(param.name, param);
    });

    for (const [paramName, paramValue] of Object.entries(binding.parameters)) {
      const actionParam = actionParameterMap.get(paramName);

      if (!actionParam) {
        errors.push(
          `Parameter "${paramName}" does not exist in action definition`,
        );
        continue;
      }

      if (
        typeof paramValue === 'string' &&
        paramValue.startsWith('{{') &&
        paramValue.endsWith('}}')
      ) {
        const expression = paramValue.slice(2, -2).trim();
        const mappingResult = this.parseParameterExpression(
          expression,
          blockAttributeMap,
          actionParam,
        );

        if (mappingResult.error) {
          errors.push(mappingResult.error);
        } else {
          mapping[paramName] = mappingResult.mapping!;
        }
      } else {
        mapping[paramName] = {
          source: 'literal',
          value: paramValue,
          type: actionParam.param_type,
        };
      }
    }

    for (const param of actionDefinition.parameters) {
      if (!mapping[param.name]) {
        if (param.required) {
          errors.push(`Required parameter "${param.name}" is not mapped`);
        } else if ('default' in param && param.default !== undefined) {
          mapping[param.name] = {
            source: 'default',
            value: param.default as string | number | boolean,
            type: param.param_type || 'string',
          };
        }
      }
    }

    const result: MappingResult = {
      isValid: errors.length === 0,
      mapping,
      errors,
    };

    this.logger.debug('Parameter mapping created', {
      isValid: result.isValid,
      mappingCount: Object.keys(mapping).length,
      errorCount: errors.length,
    });

    return result;
  }

  /**
   * Validate binding configuration
   */
  validateBinding(
    actionDefinition: ActionDefinition,
    binding: Binding,
  ): ValidationResult {
    this.logger.debug('Validating binding', {
      actionName: actionDefinition.name,
    });

    const errors: string[] = [];
    let conditionalExecution = false;

    const validParamNames = new Set(
      actionDefinition.parameters.map(p => p.name),
    );
    for (const paramName of Object.keys(binding.parameters)) {
      if (!validParamNames.has(paramName)) {
        errors.push(
          `Parameter "${paramName}" does not exist in action definition`,
        );
      }
    }

    if (binding.trigger && !this.validTriggers.has(binding.trigger)) {
      const validTriggerList = Array.from(this.validTriggers).join(', ');
      errors.push(
        `Invalid trigger type "${binding.trigger}". Must be one of: ${validTriggerList}`,
      );
    }

    if (binding.condition) {
      conditionalExecution = true;
    }

    const result: ValidationResult = {
      isValid: errors.length === 0,
      errors,
      conditionalExecution,
    };

    this.logger.debug('Binding validation completed', {
      isValid: result.isValid,
      errorCount: errors.length,
      conditionalExecution,
    });

    return result;
  }

  /**
   * Resolve parameters from block state using parameter mapping
   */
  resolveParameters(
    blockState: BlockState,
    parameterMapping: Record<string, ParameterMapping>,
  ): Record<string, any> {
    this.logger.debug('Resolving parameters', {
      mappingCount: Object.keys(parameterMapping).length,
    });

    const resolved: Record<string, any> = {};

    for (const [paramName, mapping] of Object.entries(parameterMapping)) {
      let value: unknown;

      switch (mapping.source) {
        case 'attributes':
          if (mapping.field) {
            value = this.getNestedValue(blockState.attributes, mapping.field);
          }
          break;

        case 'actionResults':
          if (mapping.field && blockState.actionResults) {
            value = this.getNestedValue(
              blockState.actionResults,
              mapping.field,
            );
          }
          break;

        case 'default':
        case 'literal':
          value = mapping.value;
          break;

        default:
          this.logger.warn('Unknown parameter mapping source', {
            source: mapping.source,
          });
          continue;
      }

      if (value !== undefined) {
        resolved[paramName] = this.convertValueType(value, mapping.type);
      } else {
        resolved[paramName] = undefined;
      }
    }

    this.logger.debug('Parameters resolved', {
      resolvedCount: Object.keys(resolved).length,
    });

    return resolved;
  }

  /**
   * Execute binding with conditional logic and error handling
   */
  async executeBinding(
    binding: Binding,
    blockState: BlockState,
    parameterMapping: Record<string, ParameterMapping>,
    actionExecutor: ActionExecutor,
  ): Promise<ExecutionResult> {
    this.logger.debug('Executing binding', { action: binding.action });

    try {
      if (binding.condition) {
        const conditionMet = this.evaluateCondition(
          binding.condition,
          blockState,
        );
        if (!conditionMet) {
          this.logger.debug('Binding condition not met, skipping execution', {
            action: binding.action,
            condition: binding.condition,
          });

          return {
            success: true,
            skipped: true,
            reason: 'Condition not met',
          };
        }
      }

      const resolvedParameters = this.resolveParameters(
        blockState,
        parameterMapping,
      );

      const result = await actionExecutor(binding.action, resolvedParameters);

      this.logger.debug('Binding executed successfully', {
        action: binding.action,
        success: result.success,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Binding execution failed', {
        action: binding.action,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Parse parameter expression from template string
   */
  private parseParameterExpression(
    expression: string,
    blockAttributeMap: Map<string, any>,
    actionParam: ParameterDefinition,
  ): { mapping?: ParameterMapping; error?: string } {
    const parts = expression.split('.');

    if (parts.length < 2) {
      return { error: `Invalid parameter expression: ${expression}` };
    }

    const source = parts[0];
    const fieldPath = parts.slice(1).join('.');

    if (source === 'attributes') {
      let blockAttribute = blockAttributeMap.get(fieldPath);

      if (!blockAttribute && parts.length === 2) {
        const attributeName = parts[1];
        blockAttribute = blockAttributeMap.get(attributeName);
      }

      if (!blockAttribute) {
        return {
          error: `Attribute "${fieldPath}" not found in block definition`,
        };
      }

      if (blockAttribute.type !== actionParam.param_type) {
        const compatibleTypes = this.getCompatibleTypes(actionParam.param_type);
        if (!compatibleTypes.includes(blockAttribute.type)) {
          return {
            error: `Parameter "${actionParam.name}" expects ${actionParam.param_type} but receives ${blockAttribute.type} from "${expression}"`,
          };
        }
      }

      return {
        mapping: {
          source: 'attributes',
          field: fieldPath,
          type: blockAttribute.type,
        },
      };
    } else if (source === 'actionResults') {
      return {
        mapping: {
          source: 'actionResults',
          field: fieldPath,
          type: actionParam.param_type,
        },
      };
    }

    return { error: `Unsupported parameter source: ${source}` };
  }

  /**
   * Flatten nested properties for attribute mapping
   */
  private flattenProperties(
    properties: Record<string, unknown>,
    prefix: string,
    map: Map<string, any>,
  ): void {
    for (const [key, value] of Object.entries(properties)) {
      const fullKey = `${prefix}.${key}`;

      if (value && typeof value === 'object' && (value as any).properties) {
        this.flattenProperties((value as any).properties, fullKey, map);
      } else {
        map.set(fullKey, value);
      }
    }
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: unknown, path: string): unknown {
    return path.split('.').reduce((current, key) => {
      if (current && typeof current === 'object' && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  /**
   * Convert value to target type
   */
  private convertValueType(value: unknown, targetType: string): unknown {
    if (value === undefined || value === null) {
      return value;
    }

    switch (targetType) {
      case 'number':
        return typeof value === 'number' ? value : Number(value);
      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') return value.toLowerCase() === 'true';
        return Boolean(value);
      case 'string':
        return typeof value === 'string' ? value : String(value);
      default:
        return value;
    }
  }

  /**
   * Get compatible types for type conversion
   */
  private getCompatibleTypes(targetType: string): string[] {
    return [targetType];
  }

  /**
   * Evaluate condition expression against block state
   */
  private evaluateCondition(
    condition: string,
    blockState: BlockState,
  ): boolean {
    try {
      let evaluatedCondition = condition;

      const attributePattern = /\{\{attributes\.([^}]+)\}\}/g;
      let match;
      while ((match = attributePattern.exec(condition)) !== null) {
        const fieldPath = match[1];
        const value = this.getNestedValue(blockState.attributes, fieldPath);
        evaluatedCondition = evaluatedCondition.replace(
          match[0],
          String(value),
        );
      }

      const resultPattern = /\{\{actionResults\.([^}]+)\}\}/g;
      let resultMatch;
      while (
        (resultMatch = resultPattern.exec(condition)) !== null &&
        blockState.actionResults
      ) {
        const fieldPath = resultMatch[1];
        const value = this.getNestedValue(blockState.actionResults, fieldPath);
        evaluatedCondition = evaluatedCondition.replace(
          resultMatch[0],
          String(value),
        );
      }

      if (this.isSafeCondition(evaluatedCondition)) {
        const result = Function(
          '"use strict"; return (' + evaluatedCondition + ')',
        )();
        return result;
      }
      this.logger.warn('Unsafe condition expression, defaulting to false', {
        condition,
        evaluatedCondition,
      });
      return false;
    } catch (error) {
      this.logger.warn('Error evaluating condition, defaulting to false', {
        condition,
        error,
      });
      return false;
    }
  }

  /**
   * Check if condition expression is safe to evaluate
   */
  private isSafeCondition(condition: string): boolean {
    const allowedPattern = /^[\s\d<>=!&|()+-/*.]+$/;
    const disallowedPatterns = [
      /function/i,
      /eval/i,
      /constructor/i,
      /prototype/i,
      /\[/,
      /\]/,
      /this/i,
      /window/i,
      /global/i,
      /process/i,
    ];

    if (!allowedPattern.test(condition)) {
      return false;
    }

    for (const pattern of disallowedPatterns) {
      if (pattern.test(condition)) {
        return false;
      }
    }

    return true;
  }
}
