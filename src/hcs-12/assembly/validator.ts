/**
 * Assembly Validator for HCS-12 HashLinks
 *
 * Provides comprehensive validation for assembly definitions, ensuring
 * they meet structural, semantic, and security requirements.
 */

import { Logger } from '../../utils/logger';
import {
  AssemblyRegistration,
  AssemblyWorkflowStep,
  ModuleInfo,
  ActionDefinition,
  ValidationRule,
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

export interface AssemblyValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  recommendations: ValidationRecommendation[];
  score: number;
  metadata: AssemblyValidationMetadata;
}

export interface ValidationError {
  code: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  field?: string;
  suggestions?: string[];
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  impact: 'performance' | 'usability' | 'maintainability' | 'security';
}

export interface ValidationRecommendation {
  code: string;
  message: string;
  category:
    | 'best-practice'
    | 'optimization'
    | 'accessibility'
    | 'documentation';
  priority: 'high' | 'medium' | 'low';
}

export interface AssemblyValidationMetadata {
  complexity: 'simple' | 'moderate' | 'complex';
  actionCount: number;
  blockCount: number;
  estimatedLoadTime: number;
  securityRisk: 'low' | 'medium' | 'high';
}

export interface ValidationOptions {
  strictMode?: boolean;
  checkPerformance?: boolean;
  validateSecurity?: boolean;
  checkAccessibility?: boolean;
  requireDocumentation?: boolean;
  maxComplexity?: number;
  allowExperimentalFeatures?: boolean;
}

/**
 * Comprehensive validator for assembly definitions
 */
export class AssemblyValidator {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Validate an assembly registration
   */
  async validate(
    assembly: AssemblyRegistration,
    options: ValidationOptions = {},
  ): Promise<AssemblyValidationResult> {
    this.logger.info('Starting assembly validation', {
      assembly: assembly.name,
      version: assembly.version,
      strictMode: options.strictMode,
    });

    const result: AssemblyValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      recommendations: [],
      score: 100,
      metadata: {
        complexity: 'simple',
        actionCount: 0,
        blockCount: 0,
        estimatedLoadTime: 0,
        securityRisk: 'low',
      },
    };

    try {
      this.validateStructure(assembly, result, options);
      this.validateMetadata(assembly, result, options);
      this.validateActions(assembly, result, options);
      this.validateBlocks(assembly, result, options);
      this.validateWorkflow(assembly, result, options);

      if (options.checkPerformance) {
        this.validatePerformance(assembly, result, options);
      }

      if (options.validateSecurity) {
        this.validateSecurity(assembly, result, options);
      }

      if (options.checkAccessibility) {
        this.validateAccessibility(assembly, result, options);
      }

      this.calculateMetadata(assembly, result);
      this.calculateScore(result);

      result.isValid =
        result.errors.filter(
          e => e.severity === 'critical' || e.severity === 'high',
        ).length === 0;

      this.logger.info('Assembly validation completed', {
        assembly: assembly.name,
        isValid: result.isValid,
        score: result.score,
        errors: result.errors.length,
        warnings: result.warnings.length,
      });
    } catch (error) {
      this.logger.error('Assembly validation failed', { error });
      result.errors.push({
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'critical',
      });
      result.isValid = false;
      result.score = 0;
    }

    return result;
  }

  /**
   * Validate assembly structure
   */
  private validateStructure(
    assembly: AssemblyRegistration,
    result: AssemblyValidationResult,
    options: ValidationOptions,
  ): void {
    if (!assembly.p || assembly.p !== 'hcs-12') {
      result.errors.push({
        code: 'INVALID_PROTOCOL',
        message: 'Assembly must specify protocol as "hcs-12"',
        severity: 'critical',
        field: 'p',
      });
    }

    if (!assembly.op || assembly.op !== 'register') {
      result.errors.push({
        code: 'INVALID_OPERATION',
        message: 'Assembly must specify operation as "register"',
        severity: 'critical',
        field: 'op',
      });
    }

    if (!assembly.name) {
      result.errors.push({
        code: 'MISSING_NAME',
        message: 'Assembly name is required',
        severity: 'critical',
        field: 'name',
        suggestions: [
          'Provide a descriptive name following kebab-case convention',
        ],
      });
    } else if (!/^[a-z0-9-]+$/.test(assembly.name)) {
      result.errors.push({
        code: 'INVALID_NAME_FORMAT',
        message:
          'Assembly name must contain only lowercase letters, numbers, and hyphens',
        severity: 'high',
        field: 'name',
        suggestions: ['Use kebab-case format (e.g., "my-assembly-name")'],
      });
    }

    if (!assembly.version) {
      result.errors.push({
        code: 'MISSING_VERSION',
        message: 'Assembly version is required',
        severity: 'critical',
        field: 'version',
        suggestions: ['Use semantic versioning (e.g., "1.0.0")'],
      });
    } else if (
      !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(
        assembly.version,
      )
    ) {
      result.errors.push({
        code: 'INVALID_VERSION_FORMAT',
        message: 'Assembly version must follow semantic versioning',
        severity: 'high',
        field: 'version',
        suggestions: ['Use format: MAJOR.MINOR.PATCH (e.g., "1.0.0")'],
      });
    }
  }

  /**
   * Validate assembly metadata
   */
  private validateMetadata(
    assembly: AssemblyRegistration,
    result: AssemblyValidationResult,
    options: ValidationOptions,
  ): void {
    if (!assembly.description) {
      result.warnings.push({
        code: 'MISSING_DESCRIPTION',
        message: 'Assembly should have a description explaining its purpose',
        field: 'description',
        impact: 'usability',
      });
    } else if (assembly.description.length < 20) {
      result.recommendations.push({
        code: 'SHORT_DESCRIPTION',
        message: 'Consider providing a more detailed description',
        category: 'documentation',
        priority: 'medium',
      });
    }

    if (options.requireDocumentation && !assembly.tags?.length) {
      result.warnings.push({
        code: 'MISSING_TAGS',
        message: 'Assembly should include tags for searchability',
        field: 'tags',
        impact: 'usability',
      });
    }
  }

  /**
   * Validate assembly actions
   */
  private validateActions(
    assembly: AssemblyRegistration,
    result: AssemblyValidationResult,
    options: ValidationOptions,
  ): void {
    if (!assembly.actions || assembly.actions.length === 0) {
      result.warnings.push({
        code: 'NO_ACTIONS',
        message: 'Assembly has no actions defined',
        impact: 'usability',
      });
      return;
    }

    const ids = new Set<string>();
    const registryIds = new Set<string>();

    for (let i = 0; i < assembly.actions.length; i++) {
      const action = assembly.actions[i];
      const fieldPrefix = `actions[${i}]`;

      if (!action.registryId) {
        result.errors.push({
          code: 'MISSING_ACTION_REGISTRY_ID',
          message: `Action ${i} is missing registryId`,
          severity: 'critical',
          field: `${fieldPrefix}.registryId`,
        });
      } else if (registryIds.has(action.registryId)) {
        result.errors.push({
          code: 'DUPLICATE_ACTION_REGISTRY_ID',
          message: `Action ${i} has duplicate registryId`,
          severity: 'high',
          field: `${fieldPrefix}.registryId`,
        });
      } else {
        registryIds.add(action.registryId);
      }

      if (!action.id) {
        result.errors.push({
          code: 'MISSING_ACTION_ID',
          message: `Action ${i} is missing id`,
          severity: 'critical',
          field: `${fieldPrefix}.id`,
        });
      } else if (ids.has(action.id)) {
        result.errors.push({
          code: 'DUPLICATE_ACTION_ID',
          message: `Action ${i} has duplicate id: ${action.id}`,
          severity: 'high',
          field: `${fieldPrefix}.id`,
        });
      } else {
        ids.add(action.id);
      }

      if (
        action.version &&
        !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(
          action.version,
        )
      ) {
        result.errors.push({
          code: 'INVALID_ACTION_VERSION',
          message: `Action ${i} has invalid version format`,
          severity: 'medium',
          field: `${fieldPrefix}.version`,
          suggestions: ['Use semantic versioning format'],
        });
      }
    }

    if (assembly.actions.length > 10) {
      result.warnings.push({
        code: 'MANY_ACTIONS',
        message:
          'Assembly has many actions, consider splitting into multiple assemblies',
        impact: 'performance',
      });
    }
  }

  /**
   * Validate assembly blocks
   */
  private validateBlocks(
    assembly: AssemblyRegistration,
    result: AssemblyValidationResult,
    options: ValidationOptions,
  ): void {
    if (!assembly.blocks || assembly.blocks.length === 0) {
      result.warnings.push({
        code: 'NO_BLOCKS',
        message: 'Assembly has no blocks defined',
        impact: 'usability',
      });
      return;
    }

    const blockIds = new Set<string>();
    const blockRegistryIds = new Set<string>();

    for (let i = 0; i < assembly.blocks.length; i++) {
      const block = assembly.blocks[i];
      const fieldPrefix = `blocks[${i}]`;

      if (!block.registryId) {
        result.errors.push({
          code: 'MISSING_BLOCK_REGISTRY_ID',
          message: `Block ${i} is missing registryId`,
          severity: 'critical',
          field: `${fieldPrefix}.registryId`,
        });
      } else if (blockRegistryIds.has(block.registryId)) {
        result.errors.push({
          code: 'DUPLICATE_BLOCK_REGISTRY_ID',
          message: `Block ${i} has duplicate registryId`,
          severity: 'high',
          field: `${fieldPrefix}.registryId`,
        });
      } else {
        blockRegistryIds.add(block.registryId);
      }

      if (!block.id) {
        result.errors.push({
          code: 'MISSING_BLOCK_ID',
          message: `Block ${i} is missing id`,
          severity: 'critical',
          field: `${fieldPrefix}.id`,
        });
      } else if (blockIds.has(block.id)) {
        result.errors.push({
          code: 'DUPLICATE_BLOCK_ID',
          message: `Block ${i} has duplicate id: ${block.id}`,
          severity: 'high',
          field: `${fieldPrefix}.id`,
        });
      } else {
        blockIds.add(block.id);
      }

      if (
        block.version &&
        !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(
          block.version,
        )
      ) {
        result.errors.push({
          code: 'INVALID_BLOCK_VERSION',
          message: `Block ${i} has invalid version format`,
          severity: 'medium',
          field: `${fieldPrefix}.version`,
          suggestions: ['Use semantic versioning format'],
        });
      }

      if (block.attributes && typeof block.attributes !== 'object') {
        result.errors.push({
          code: 'INVALID_BLOCK_ATTRIBUTES',
          message: `Block ${i} has invalid attributes format`,
          severity: 'medium',
          field: `${fieldPrefix}.attributes`,
          suggestions: ['Attributes must be an object'],
        });
      }
    }

    if (assembly.blocks.length > 20) {
      result.warnings.push({
        code: 'MANY_BLOCKS',
        message: 'Assembly has many blocks, consider optimizing the UI design',
        impact: 'performance',
      });
    }
  }

  /**
   * Validate assembly workflow (not part of HCS-12 standard)
   */
  private validateWorkflow(
    assembly: AssemblyRegistration,
    result: AssemblyValidationResult,
    options: ValidationOptions,
  ): void {
    return;

    const stepIds = new Set<string>();
    const duplicateIds = new Set<string>();

    for (const step of assembly.workflow) {
      if (!step.id) {
        result.errors.push({
          code: 'MISSING_WORKFLOW_STEP_ID',
          message: 'Workflow step is missing ID',
          severity: 'high',
          field: 'workflow',
        });
        continue;
      }

      if (stepIds.has(step.id)) {
        duplicateIds.add(step.id);
        result.errors.push({
          code: 'DUPLICATE_WORKFLOW_STEP_ID',
          message: `Workflow step ID "${step.id}" is duplicated`,
          severity: 'high',
          field: 'workflow',
        });
      } else {
        stepIds.add(step.id);
      }
    }

    for (let i = 0; i < assembly.workflow.length; i++) {
      const step = assembly.workflow[i];
      const fieldPrefix = `workflow[${i}]`;

      if (!step.type || !['action', 'block'].includes(step.type)) {
        result.errors.push({
          code: 'INVALID_WORKFLOW_STEP_TYPE',
          message: `Workflow step ${step.id} has invalid type`,
          severity: 'high',
          field: `${fieldPrefix}.type`,
          suggestions: ['Type must be either "action" or "block"'],
        });
      }

      if (step.type === 'action' && step.action) {
        if (!step.action.hash) {
          result.errors.push({
            code: 'MISSING_WORKFLOW_ACTION_HASH',
            message: `Workflow step ${step.id} action is missing hash`,
            severity: 'high',
            field: `${fieldPrefix}.action.hash`,
          });
        }
      } else if (step.type === 'block') {
        if (!step.block) {
          result.errors.push({
            code: 'MISSING_WORKFLOW_BLOCK_NAME',
            message: `Workflow step ${step.id} is missing block property`,
            severity: 'high',
            field: `${fieldPrefix}.block`,
          });
        } else if (!step.block.name) {
          result.errors.push({
            code: 'MISSING_WORKFLOW_BLOCK_NAME',
            message: `Workflow step ${step.id} block is missing name`,
            severity: 'high',
            field: `${fieldPrefix}.block.name`,
          });
        }
      }

      if (step.next) {
        for (const nextId of step.next) {
          if (!stepIds.has(nextId)) {
            result.errors.push({
              code: 'INVALID_WORKFLOW_NEXT_REFERENCE',
              message: `Workflow step ${step.id} references non-existent step: ${nextId}`,
              severity: 'high',
              field: `${fieldPrefix}.next`,
            });
          }
        }
      }
    }

    if (assembly.workflow.length > 50) {
      result.warnings.push({
        code: 'COMPLEX_WORKFLOW',
        message: 'Workflow is very complex, consider breaking it down',
        impact: 'maintainability',
      });
    }

    const reachableSteps = new Set<string>();
    const queue = [assembly.workflow[0]?.id].filter(Boolean);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (reachableSteps.has(currentId)) continue;

      reachableSteps.add(currentId);
      const step = assembly.workflow.find(s => s.id === currentId);
      if (step?.next) {
        queue.push(...step.next);
      }
    }

    for (const step of assembly.workflow) {
      if (step.id && !reachableSteps.has(step.id)) {
        result.warnings.push({
          code: 'UNREACHABLE_WORKFLOW_STEP',
          message: `Workflow step ${step.id} is unreachable`,
          impact: 'maintainability',
        });
      }
    }
  }

  /**
   * Validate assembly performance characteristics
   */
  private validatePerformance(
    assembly: AssemblyRegistration,
    result: AssemblyValidationResult,
    options: ValidationOptions,
  ): void {
    const actionCount = assembly.actions?.length || 0;
    const blockCount = assembly.blocks?.length || 0;
    const estimatedLoadTime = actionCount * 100 + blockCount * 50;
    result.metadata.estimatedLoadTime = estimatedLoadTime;

    if (estimatedLoadTime > 1500) {
      result.warnings.push({
        code: 'SLOW_LOAD_TIME',
        message: 'Assembly may have slow load time due to complexity',
        impact: 'performance',
      });
    }

    if (actionCount > 5 && blockCount > 10) {
      result.recommendations.push({
        code: 'OPTIMIZE_COMPONENTS',
        message:
          'Consider reducing the number of actions and blocks for better performance',
        category: 'optimization',
        priority: 'medium',
      });
    }
  }

  /**
   * Validate assembly security aspects
   */
  private validateSecurity(
    assembly: AssemblyRegistration,
    result: AssemblyValidationResult,
    options: ValidationOptions,
  ): void {
    let riskScore = 0;

    if (assembly.actions && assembly.actions.length > 5) {
      riskScore += 1;
      result.recommendations.push({
        code: 'REVIEW_ACTION_PERMISSIONS',
        message: 'Review permissions for all actions to ensure least privilege',
        category: 'best-practice',
        priority: 'high',
      });
    }

    if (riskScore >= 2) {
      result.metadata.securityRisk = 'high';
    } else if (riskScore >= 1) {
      result.metadata.securityRisk = 'medium';
    } else {
      result.metadata.securityRisk = 'low';
    }
  }

  /**
   * Validate assembly accessibility
   */
  private validateAccessibility(
    assembly: AssemblyRegistration,
    result: AssemblyValidationResult,
    options: ValidationOptions,
  ): void {
    if (!assembly.title) {
      result.recommendations.push({
        code: 'ADD_TITLE_FOR_ACCESSIBILITY',
        message: 'Add a title for better accessibility',
        category: 'accessibility',
        priority: 'medium',
      });
    }

    if (!assembly.description) {
      result.recommendations.push({
        code: 'ADD_DESCRIPTION_FOR_ACCESSIBILITY',
        message: 'Add a description for better accessibility',
        category: 'accessibility',
        priority: 'medium',
      });
    }

    if (assembly.blocks && assembly.blocks.length > 0) {
      result.recommendations.push({
        code: 'REVIEW_BLOCK_ACCESSIBILITY',
        message: 'Review block implementations for accessibility compliance',
        category: 'accessibility',
        priority: 'low',
      });
    }
  }

  /**
   * Calculate assembly metadata
   */
  private calculateMetadata(
    assembly: AssemblyRegistration,
    result: AssemblyValidationResult,
  ): void {
    result.metadata.actionCount = assembly.actions?.length || 0;
    result.metadata.blockCount = assembly.blocks?.length || 0;

    const totalComponents =
      result.metadata.actionCount +
      result.metadata.blockCount +
      result.metadata.blockCount;

    if (totalComponents <= 5) {
      result.metadata.complexity = 'simple';
    } else if (totalComponents <= 15) {
      result.metadata.complexity = 'moderate';
    } else {
      result.metadata.complexity = 'complex';
    }
  }

  /**
   * Calculate overall quality score
   */
  private calculateScore(result: AssemblyValidationResult): void {
    let score = 100;

    for (const error of result.errors) {
      switch (error.severity) {
        case 'critical':
          score -= 25;
          break;
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 10;
          break;
        case 'low':
          score -= 5;
          break;
      }
    }

    score -= result.warnings.length * 2;

    if (
      result.recommendations.filter(r => r.category === 'documentation')
        .length === 0
    ) {
      score += 5;
    }

    if (result.metadata.complexity === 'simple') {
      score += 5;
    }

    result.score = Math.max(0, Math.min(100, score));
  }
}
