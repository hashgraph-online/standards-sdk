import type { Hcs25AdapterDefinition } from '../types';
import { createAcpAdapter } from './acp';
import {
  createAgentverseInsightsAdapter,
  createAgentverseVerifierAdapter,
} from './agentverse';
import { createAvailabilityAdapter } from './availability';
import { createConnectivityAdapter } from './connectivity';
import { createErc8004FeedbackAdapter } from './erc8004-feedback';
import { createEthosAdapter } from './ethos';
import {
  createChatbotArenaAdapter,
  createHuggingFaceModelIndexAdapter,
  createModelTierAdapter,
  createOpenLlmLeaderboardAdapter,
  createOpenRouterEvalsAdapter,
} from './model-evals';
import { createOutputVerificationAdapter } from './output-verification';
import { createOssPopularityAdapter } from './oss-popularity';
import {
  createSimpleMathAdapter,
  createSimpleScienceAdapter,
} from './simple-evals';
import { createX402Adapter } from './x402';

export * from './normalization';
export * from './availability';
export * from './ethos';
export * from './acp';
export * from './erc8004-feedback';
export * from './x402';
export * from './oss-popularity';
export * from './simple-evals';
export * from './agentverse';
export * from './model-evals';
export * from './output-verification';
export * from './connectivity';

/**
 * Creates the full HCS-25 adapter catalog documented in the specification,
 * with the suggested contribution modes and weights from Appendix A. Every
 * adapter is created with default options; compose
 * `compileScoringConfig` over the result to score a subject.
 */
export function createHcs25AdapterCatalog(): Hcs25AdapterDefinition[] {
  return [
    createAvailabilityAdapter(),
    createEthosAdapter(),
    createAcpAdapter(),
    createErc8004FeedbackAdapter(),
    createX402Adapter(),
    createOssPopularityAdapter(),
    createSimpleMathAdapter(),
    createSimpleScienceAdapter(),
    createAgentverseInsightsAdapter(),
    createAgentverseVerifierAdapter(),
    createOpenRouterEvalsAdapter(),
    createChatbotArenaAdapter(),
    createHuggingFaceModelIndexAdapter(),
    createOpenLlmLeaderboardAdapter(),
    createModelTierAdapter(),
    createOutputVerificationAdapter(),
    createConnectivityAdapter(),
  ];
}
