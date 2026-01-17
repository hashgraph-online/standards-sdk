/**
 * JSR-compatible entry point for @hol-org/standards-sdk
 * 
 * This version exports the base RegistryBrokerClient without the extended
 * methods that use TypeScript module augmentation (which JSR doesn't support).
 * 
 * For the full SDK with all features (chat, credits, encryption, etc.),
 * install from npm: npm install @hashgraphonline/standards-sdk
 */

// Base client with core methods (no module augmentation)
export {
  RegistryBrokerClient,
  isPendingRegisterAgentResponse,
  isPartialRegisterAgentResponse,
  isSuccessRegisterAgentResponse,
  type InitializedAgentClient,
  type GenerateEncryptionKeyPairOptions,
  type RequestConfig,
} from './services/registry-broker/client/base-client.ts';

export {
  RegistryBrokerError,
  RegistryBrokerParseError,
} from './services/registry-broker/client/errors.ts';

// Types (safe to export)
export type {
  JsonValue,
  JsonObject,
  SearchParams,
  SearchResult,
  RegistryBrokerClientOptions,
  RegisterAgentResponse,
  RegisterAgentPendingResponse,
  RegisterAgentPartialResponse,
  RegisterAgentSuccessResponse,
  AgentFeedbackQuery,
  AgentFeedbackResponse,
  AgentFeedbackEligibilityRequest,
  AgentFeedbackEligibilityResponse,
  AgentFeedbackSubmissionRequest,
  AgentFeedbackSubmissionResponse,
} from './services/registry-broker/types.ts';

// Schemas (useful for validation)
export {
  searchResponseSchema,
  agentFeedbackResponseSchema,
  agentFeedbackEligibilityResponseSchema,
  agentFeedbackSubmissionResponseSchema,
} from './services/registry-broker/schemas.ts';

// Utils
export { Logger, type ILogger } from './utils/logger.ts';
export { sleep } from './utils/sleep.ts';
