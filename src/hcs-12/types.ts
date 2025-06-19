/**
 * HCS-12 HashLinks Type Definitions
 *
 * Complete type definitions for the HCS-12 standard including
 * WASM modules, UI blocks, assemblies, and registries.
 */

/**
 * Core WASM module interface that all HashLink actions must implement
 */
export interface WasmInterface {
  /**
   * Returns module metadata in deterministic JSON format
   */
  INFO(): string;

  /**
   * Executes actions that modify state or submit transactions
   */
  POST(
    action: string,
    params: string,
    network: 'mainnet' | 'testnet',
    hashLinkMemo: string,
  ): Promise<string>;

  /**
   * Retrieves information without modifying state
   */
  GET(
    action: string,
    params: string,
    network: 'mainnet' | 'testnet',
  ): Promise<string>;
}

/**
 * Module metadata returned by the INFO method
 */
export interface ModuleInfo {
  name: string;
  version: string;
  hashlinks_version: string;
  creator: string;
  purpose: string;
  actions: ActionDefinition[];
  capabilities: Capability[];
  plugins: PluginDefinition[];
}

/**
 * Defines a single action within a module
 */
export interface ActionDefinition {
  name: string;
  description: string;
  inputs: ParameterDefinition[];
  outputs: ParameterDefinition[];
  required_capabilities: Capability[];
}

/**
 * Parameter definition for action inputs/outputs
 */
export interface ParameterDefinition {
  name: string;
  param_type:
    | 'string'
    | 'number'
    | 'boolean'
    | 'array'
    | 'object'
    | 'network'
    | 'address'
    | 'bigint';
  description: string;
  required: boolean;
  validation?: ValidationRule;
}

/**
 * Validation rules that map 1:1 with Zod API
 */
export interface ValidationRule {
  type?: string;
  required?: string[];
  properties?: Record<string, ValidationRule>;
  pattern?: string;
  minimum?: number;
  maximum?: number;

  regex?: string;
  min?: number;
  max?: number;
  length?: number;
  email?: boolean;
  url?: boolean;
  uuid?: boolean;
  cuid?: boolean;
  cuid2?: boolean;
  ulid?: boolean;
  datetime?: boolean;
  ip?: boolean;
  startsWith?: string;
  endsWith?: string;
  includes?: string;

  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  int?: boolean;
  positive?: boolean;
  nonnegative?: boolean;
  negative?: boolean;
  nonpositive?: boolean;
  multipleOf?: number;
  finite?: boolean;
  safe?: boolean;

  nonempty?: boolean;

  literal?: string | number | boolean;
  enum?: string[];
  nullable?: boolean;
  nullish?: boolean;
  optional?: boolean;

  element?: ParameterDefinition;
  shape?: Record<string, ParameterDefinition>;
  strict?: boolean;
  passthrough?: boolean;
  catchall?: ParameterDefinition;
}

/**
 * Plugin dependency definition
 */
export interface PluginDefinition {
  name: string;
  version: string;
  url: string;
  description: string;
  required: boolean;
}

/**
 * Capability system for permissions and resources
 */
export interface Capability {
  type: 'network' | 'transaction' | 'storage' | 'external_api';
  value:
    | NetworkCapability
    | TransactionCapability
    | StorageCapability
    | ExternalApiCapability;
}

export interface NetworkCapability {
  networks: Array<'mainnet' | 'testnet'>;
  operations: Array<'query' | 'submit'>;
}

export interface TransactionCapability {
  transaction_types: Array<
    'token_transfer' | 'token_create' | 'token_mint' | 'contract_call'
  >;
  max_fee_hbar?: number;
}

export interface StorageCapability {
  storage_types: Array<'hcs' | 'ipfs' | 'arweave'>;
  max_size_bytes?: number;
}

export interface ExternalApiCapability {
  allowed_domains: string[];
  rate_limit?: number;
}

/**
 * Block definition for UI components
 */
export interface BlockDefinition {
  p: 'hcs-12';
  op: 'register' | 'template' | 'pattern';
  id: string;
  registryId: string;
  version: string;
  blockJson?: GutenbergBlockType;
  t_id?: string;
  title?: string;
  description?: string;
  categories?: string[];
  content?: any;
}

/**
 * WordPress Gutenberg block type definition
 */
export interface GutenbergBlockType {
  apiVersion: number;
  name: string;
  title: string;
  category: string;
  icon?: string | BlockIcon;
  description?: string;
  keywords?: string[];
  textdomain?: string;
  attributes: Record<string, AttributeDefinition>;
  provides?: Record<string, any>;
  usesContext?: string[];
  supports: BlockSupports;
  actions?: string[];
  parent?: string | string[];
}

export interface BlockIcon {
  src: string;
  background?: string;
  foreground?: string;
}

export interface AttributeDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  default?: any;
  enum?: string[];
  source?: string;
}

export interface BlockAttribute {
  type: string;
  label?: string;
  help?: string;
  required?: boolean;
  default?: any;
  enum?: string[];
  source?: string;
}

export interface BlockStyle {
  name: string;
  label: string;
  isDefault?: boolean;
}

export type BlockCategory =
  | 'common'
  | 'formatting'
  | 'layout'
  | 'widgets'
  | 'embed'
  | 'interactive';

export interface BlockSupports {
  align?: boolean | string[];
  anchor?: boolean;
  customClassName?: boolean;
  html?: boolean;
  spacing?: {
    margin?: boolean;
    padding?: boolean;
  };
  [key: string]: any;
}

export interface BlockSupport extends BlockSupports {}

export interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  transactionId?: string;
  executionTime?: number;
}

export interface HCS12ValidationError {
  field?: string;
  message: string;
  code?: string;
}

/**
 * Assembly action reference
 */
export interface AssemblyAction {
  id: string;
  registryId: string;
  version?: string;
  defaultParams?: Record<string, any>;
  hash?: string;
  alias?: string;
}

/**
 * Assembly block reference
 */
export interface AssemblyBlock {
  id: string;
  registryId: string;
  version?: string;
  actions?: string[];
  attributes?: Record<string, any>;
  children?: string[];
  name?: string;
  config?: Record<string, any>;
}

/**
 * Assembly dependency
 */
export interface AssemblyDependency {
  name: string;
  version: string;
  registry?: string;
}

/**
 * Assembly definition for composing actions and blocks
 */
/**
 * HashLinks directory registration
 */
export interface HashLinksRegistration {
  p: 'hcs-12';
  op: 'register';
  t_id: string;
  name: string;
  description?: string;
  tags?: string[];
  category?: string;
  featured?: boolean;
  icon?: string;
  author?: string;
  website?: string;
}

/**
 * Assembly definition for composing actions and blocks
 */
export interface AssemblyDefinition {
  p: 'hcs-12';
  op: 'register';
  name: string;
  version: string;
  description?: string;
  tags?: string[];

  actions?: Array<{
    id: string;
    registryId: string;
    version?: string;
    defaultParams?: Record<string, any>;
  }>;

  blocks?: Array<{
    id: string;
    registryId: string;
    version?: string;
    actions?: string[];
    attributes?: Record<string, any>;
    children?: string[];
    bindings?: Array<{
      action: string;
      parameters: Record<string, any>;
    }>;
  }>;

  layout?: {
    type: 'vertical' | 'horizontal' | 'grid';
    responsive?: boolean;
    containerClass?: string;
  };

  source_verification?: {
    source_t_id: string;
    source_hash: string;
    description?: string;
  };
  t_id?: string;
}

/**
 * Registry message types
 */
export interface ActionRegistration {
  p: 'hcs-12';
  op: 'register';
  t_id: string;
  hash: string;
  wasm_hash: string;
  info_t_id?: string;
  source_verification?: SourceVerification;
  previous_version?: string;
  migration_notes?: string;
  validation_rules?: Record<string, ValidationRule>;
  m?: string;
}

export interface BlockRegistration {
  p: 'hcs-12';
  op: 'register' | 'template';
  name: string;
  version: string;
  data?: GutenbergBlockType | string;
  t_id?: string;
  id?: string;
  title?: string;
  category?: string;
  description?: string;
  icon?: string;
  keywords?: string[];
  parent?: string | string[];
  styles?: string[];
  attributes?: Record<string, AttributeDefinition>;
  supports?: BlockSupports;
  blockJson?: GutenbergBlockType;
  definition?: {
    attributes?: Record<string, any>;
  };
}

export interface AssemblyRegistration {
  p: 'hcs-12';
  op: 'register';
  t_id?: string;
  name: string;
  version: string;
  title?: string;
  category?: string;
  description?: string;
  tags?: string[];
  author?: string;
  license?: string;
  icon?: string;
  keywords?: string[];
  dependencies?: AssemblyDependency[];
  workflow?: AssemblyWorkflowStep[];

  actions?: Array<{
    id: string;
    registryId: string;
    version?: string;
    defaultParams?: Record<string, any>;
  }>;

  blocks?: Array<{
    id: string;
    registryId: string;
    version?: string;
    actions?: string[];
    attributes?: Record<string, any>;
    children?: string[];
  }>;

  layout?: {
    type: 'vertical' | 'horizontal' | 'grid';
    responsive?: boolean;
    containerClass?: string;
  };

  source_verification?: {
    source_t_id: string;
    source_hash: string;
    description?: string;
  };
  m?: string;
}

export interface AssemblyWorkflowStep {
  id: string;
  type: 'action' | 'block' | 'condition';
  action?: {
    id?: string;
    registryId?: string;
    hash?: string;
  };
  block?: {
    id?: string;
    registryId?: string;
    version?: string;
    name?: string;
  };
  next?: string[];
}

/**
 * Source verification for transparency
 */
export interface SourceVerification {
  source_t_id: string;
  source_hash: string;
  compiler_version: string;
  cargo_version: string;
  target: string;
  profile: string;
  build_flags: string[];
  lockfile_hash: string;
  source_structure: SourceStructure;
}

export interface SourceStructure {
  format: 'tar.gz' | 'zip' | 'car';
  root_manifest: string;
  includes_lockfile: boolean;
  workspace_members?: string[];
}

/**
 * HCS-10 Integration types
 */
export interface HashLinkReference {
  parseFromMessage(data: string): string | null;
  formatHashLinkUrl(assemblyId: string): string;
}

/**
 * Registry types enum
 */
export enum RegistryType {
  ACTION = 0,
  BLOCK = 1,
  ASSEMBLY = 2,
  HASHLINKS = 3,
}

/**
 * Common registry entry interface
 */
export interface RegistryEntry {
  id: string;
  timestamp: string;
  submitter: string;
  data: any;
}

/**
 * Registry configuration
 */
export interface RegistryConfig {
  type: RegistryType;
  indexed: boolean;
  ttl: number;
  topicId?: string;
  memo?: string;
}

/**
 * Security features for HashLinks
 */
export interface SecurityFeature {
  type: 'permission' | 'signature' | 'hash' | 'encryption';
  enabled: boolean;
  config?: any;
}

/**
 * Composition definition for assemblies
 */
export interface CompositionDefinition {
  actions: string[];
  blocks: string[];
  mappings: ActionMapping[];
  triggers?: EventTrigger[];
}

/**
 * Action to block parameter mapping
 */
export interface ActionMapping {
  actionId: string;
  blockId: string;
  parameterMappings: Record<string, string>;
}

/**
 * Event trigger configuration
 */
export interface EventTrigger {
  event: string;
  action: string;
  conditions?: Record<string, any>;
}

/**
 * Layout type for assembly composition
 */
export type LayoutType = 'vertical' | 'horizontal' | 'grid' | 'custom';

/**
 * Registry definition
 */
export interface RegistryDefinition {
  name: string;
  type: 'action' | 'block' | 'assembly';
  topicId: string;
  config: RegistryConfig;
}

/**
 * Registry manager interface
 */
export interface RegistryManager<T> {
  register(item: T): Promise<string>;
  get(id: string): Promise<T | null>;
  list(filters?: any): Promise<T[]>;
  update(id: string, item: T): Promise<void>;
}

/**
 * Register payload for actions
 */
export interface RegisterPayload {
  action: ActionRegistration;
  topicId: string;
}

/**
 * Template payload for blocks
 */
export interface TemplatePayload {
  block: BlockRegistration;
  template: string;
}

/**
 * Pattern payload for blocks
 */
export interface PatternPayload {
  name: string;
  pattern: any;
  category?: string;
}

/**
 * Compose payload for assemblies
 */
export interface ComposePayload {
  assembly: AssemblyDefinition;
  composition: CompositionDefinition;
}

/**
 * Full registry definition
 */
export interface FullRegistryDefinition extends RegistryDefinition {
  status: 'active' | 'deprecated' | 'disabled';
  created: Date;
  updated: Date;
}
