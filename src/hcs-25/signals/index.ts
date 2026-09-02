export * from './metadata';
export * from './simple-evals';
export * from './marketplace';
export * from './operational';
export * from './model-evals';

/**
 * Documentation for one published signal family: where it is stored on the
 * subject record and which fields it reads.
 */
export interface Hcs25SignalFamilyDoc {
  storage: string;
  fields: readonly string[];
}

/**
 * The published HCS-25 signal catalog for this SDK: every signal family
 * documented under the specification's per-signal catalog, mapped to its
 * storage location and stored fields.
 */
export const HCS25_SIGNAL_CATALOG: Readonly<
  Record<string, Hcs25SignalFamilyDoc>
> = {
  availability: {
    storage: 'metadata',
    fields: [
      'availabilityScore',
      'availabilityCheckedAt',
      'availabilityLatencyMs',
      'availabilityReason',
      'availabilitySource',
      'metrics.isOnline',
      'metrics.minsFromLastOnline',
      'metrics.lastActiveAt',
    ],
  },
  ethos: {
    storage: 'metadata',
    fields: [
      'ethosUserkey',
      'ethosScore',
      'ethosScoreStatus',
      'ethosScoreUpdatedAt',
      'ethosSources',
      'ethosComposite',
    ],
  },
  acp: {
    storage: 'metadata.metrics',
    fields: [
      'metrics.successRate',
      'metrics.successfulJobCount',
      'metrics.totalJobCount',
      'metrics.volume',
      'metrics.revenue',
      'metrics.rating',
      'successRate',
      'successfulJobCount',
    ],
  },
  'erc8004-feedback': {
    storage: 'metadata.erc8004FeedbackSummary',
    fields: [
      'averageScore',
      'totalFeedbacks',
      'registry',
      'network',
      'updatedAt',
    ],
  },
  x402: {
    storage: 'metadata.x402UsageSummary',
    fields: [
      'x402UsageStatus',
      'x402UsageUpdatedAt',
      'x402UsageSource',
      'volume7dUsd',
      'volume24hUsd',
      'inboundTrades7d',
      'outboundTrades7d',
    ],
  },
  'oss-popularity': {
    storage: 'metadata.additional',
    fields: [
      'githubRepo',
      'githubStars',
      'githubStarsUpdatedAt',
      'packageRegistry',
      'packageName',
      'packageDownloadCount',
      'npmDownloads30d',
      'pypiDownloads30d',
    ],
  },
  'agentverse-insights': {
    storage: 'metadata.additional',
    fields: [
      'agentverseInsightsRating',
      'agentverseInsightsReadmeQualityScore',
      'agentverseInsightsReadmeUniquenessScore',
      'agentverseInsightsInteractionsScore',
      'agentverseInsightsAvgResponseTime',
      'agentverseInsightsVerifierTotalInteractions',
      'agentverseInsightsVerifierTotalSuccessInteractions',
      'agentverseInsightsVerifierRecentInteractions',
      'agentverseInsightsVerifierRecentSuccessInteractions',
    ],
  },
  'agentverse-simple-evals': {
    storage: 'metadata.additional',
    fields: [
      'a2aSimpleMathScore',
      'a2aSimpleMathStatus',
      'a2aSimpleMathSessionId',
      'a2aSimpleScienceScore',
      'a2aSimpleScienceStatus',
      'a2aSimpleScienceSessionId',
    ],
  },
  'a2a-simple-evals': {
    storage: 'metadata.additional',
    fields: [
      'a2aSimpleMathScore',
      'a2aSimpleMathStatus',
      'a2aSimpleMathQuestionId',
      'a2aSimpleMathUpdatedAt',
      'a2aSimpleScienceScore',
      'a2aSimpleScienceStatus',
      'a2aSimpleScienceQuestionId',
      'a2aSimpleScienceUpdatedAt',
    ],
  },
  'nanda-simple-evals': {
    storage: 'metadata.additional',
    fields: [
      'nandaSimpleMathScore',
      'nandaSimpleMathStatus',
      'nandaSimpleMathQuestionId',
      'nandaSimpleMathUpdatedAt',
      'nandaSimpleScienceScore',
      'nandaSimpleScienceStatus',
      'nandaSimpleScienceQuestionId',
      'nandaSimpleScienceUpdatedAt',
    ],
  },
  'simple-evals': {
    storage: 'metadata.additional',
    fields: [
      'questionId',
      'expected',
      'response',
      'status',
      'score',
      'sessionId',
    ],
  },
  'openrouter-evals': {
    storage: 'metadata.additional',
    fields: [
      'openrouterEvalScore',
      'openrouterEvalStatus',
      'openrouterEvalUpdatedAt',
      'openrouterEvalSources',
      'openrouterEvalMetricsCount',
      'openrouterEvalCategoryCount',
      'openrouterEvalCoverageWeight',
      'openrouterEvalCategories',
    ],
  },
  'chatbot-arena': {
    storage: 'metadata.additional',
    fields: [
      'chatbotArenaEvalScore',
      'chatbotArenaEvalElo',
      'chatbotArenaEvalVotes',
      'chatbotArenaEvalStatus',
      'chatbotArenaEvalUpdatedAt',
      'chatbotArenaEvalSources',
    ],
  },
  'huggingface-model-index': {
    storage: 'metadata.additional',
    fields: [
      'huggingFaceModelId',
      'openrouterHuggingFaceId',
      'huggingFaceEvalScore',
      'huggingFaceSignalScore',
      'huggingFaceEvalMetricsCount',
      'huggingFaceDownloads',
      'huggingFaceLikes',
      'huggingFaceEvalMode',
      'huggingFaceEvalStatus',
      'huggingFaceEvalUpdatedAt',
      'huggingFaceEvalSources',
    ],
  },
  'openllm-leaderboard': {
    storage: 'metadata.additional',
    fields: [
      'openLlmEvalScore',
      'openLlmEvalMetricsCount',
      'openLlmEvalStatus',
      'openLlmEvalUpdatedAt',
      'openLlmEvalSources',
      'openrouterHuggingFaceId',
    ],
  },
  'output-verification': {
    storage: 'metadata.outputVerificationSummary',
    fields: [
      'allowRate',
      'blockRate',
      'uncertainRate',
      'avgConfidence',
      'totalChecks',
      'stakeDistribution',
      'windowDays',
      'providers',
      'updatedAt',
    ],
  },
};
