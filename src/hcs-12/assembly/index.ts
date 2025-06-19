/**
 * HCS-12 Assembly Module
 *
 * Provides assembly composition and management capabilities for HashLinks.
 */

export * from './assembly-engine';

export {
  BindingManager,
  type ParameterMapping,
  type MappingResult,
  type Binding,
  type ActionExecutor,
} from './binding-manager';

export { LayoutEngine } from './layout-engine';

export * from './lifecycle-manager';
