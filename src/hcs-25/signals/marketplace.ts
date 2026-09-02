import { z } from 'zod';

/**
 * Stored-field schema for ACP/Virtuals marketplace metrics, per the
 * `metadata.metrics` signal document with top-level fallbacks.
 */
export const hcs25AcpMetricsSchema = z
  .object({
    metrics: z
      .object({
        successRate: z.number().nullish(),
        successfulJobCount: z.number().nullish(),
        totalJobCount: z.number().nullish(),
        volume: z.number().nullish(),
        revenue: z.number().nullish(),
        rating: z.number().min(0).max(5).nullish(),
      })
      .passthrough()
      .optional(),
    successRate: z.number().nullish(),
    successfulJobCount: z.number().nullish(),
  })
  .passthrough();

/**
 * Stored-field schema for the ERC-8004 feedback summary stored under
 * `metadata.erc8004FeedbackSummary`.
 */
export const hcs25Erc8004FeedbackSummarySchema = z
  .object({
    averageScore: z.number().min(0).max(100),
    totalFeedbacks: z.number().int().min(0),
    registry: z.string().min(1),
    network: z.string().min(1),
    updatedAt: z.string().min(1).optional(),
  })
  .passthrough();

/**
 * Stored-field schema for the x402 usage summary stored under
 * `metadata.x402UsageSummary`.
 */
export const hcs25X402UsageSummarySchema = z
  .object({
    volume7dUsd: z.number().min(0).nullish(),
    volume24hUsd: z.number().min(0).nullish(),
    inboundTrades7d: z.number().int().min(0).nullish(),
    outboundTrades7d: z.number().int().min(0).nullish(),
  })
  .passthrough();

/**
 * Stored-field schema for the x402 ingestion fields stored directly on
 * `metadata`.
 */
export const hcs25X402UsageFieldsSchema = z
  .object({
    x402UsageStatus: z.enum(['ok', 'missing', 'error']).nullish(),
    x402UsageUpdatedAt: z.string().nullish(),
    x402UsageSource: z.string().nullish(),
    x402UsageSummary: hcs25X402UsageSummarySchema.nullish(),
  })
  .passthrough();

/**
 * Stored-field schema for AgentVerse "insights" indicators and verifier
 * interaction counters, per `metadata.additional`.
 */
export const hcs25AgentverseInsightsSchema = z
  .object({
    agentverseInsightsUpdatedAt: z.string().nullish(),
    agentverseInsightsSources: z.array(z.string()).nullish(),
    agentverseInsightsStatus: z
      .enum(['ok', 'missing', 'upstream-error'])
      .nullish(),
    agentverseInsightsAddress: z.string().nullish(),
    agentverseInsightsContract: z.enum(['mainnet', 'testnet']).nullish(),
    agentverseInsightsRating: z.number().min(0).max(5).nullish(),
    agentverseInsightsReadmeQualityScore: z.number().min(0).max(1).nullish(),
    agentverseInsightsReadmeUniquenessScore: z.number().min(0).max(1).nullish(),
    agentverseInsightsInteractionsScore: z.number().min(0).max(1).nullish(),
    agentverseInsightsAvgResponseTime: z.number().min(0).nullish(),
    agentverseInsightsAsi1TotalInteractions: z.number().int().min(0).nullish(),
    agentverseInsightsAsi1TotalSuccessInteractions: z
      .number()
      .int()
      .min(0)
      .nullish(),
    agentverseInsightsAsi1RecentInteractions: z.number().int().min(0).nullish(),
    agentverseInsightsAsi1RecentSuccessInteractions: z
      .number()
      .int()
      .min(0)
      .nullish(),
    agentverseInsightsVerifierTotalInteractions: z
      .number()
      .int()
      .min(0)
      .nullish(),
    agentverseInsightsVerifierTotalSuccessInteractions: z
      .number()
      .int()
      .min(0)
      .nullish(),
    agentverseInsightsVerifierRecentInteractions: z
      .number()
      .int()
      .min(0)
      .nullish(),
    agentverseInsightsVerifierRecentSuccessInteractions: z
      .number()
      .int()
      .min(0)
      .nullish(),
  })
  .passthrough();

/**
 * Stored-field schema for OSS popularity signals (GitHub stars plus npm/PyPI
 * downloads), per `metadata.additional`.
 */
export const hcs25OssPopularityFieldsSchema = z
  .object({
    githubRepo: z.string().nullish(),
    githubStars: z.number().int().min(0).nullish(),
    githubStarsUpdatedAt: z.string().nullish(),
    packageRegistry: z.enum(['npm', 'pypi']).nullish(),
    packageName: z.string().nullish(),
    packageIdentityUpdatedAt: z.string().nullish(),
    packageRepositoryUpdatedAt: z.string().nullish(),
    packageDownloadCount: z.number().int().min(0).nullish(),
    npmDownloads30d: z.number().int().min(0).nullish(),
    pypiDownloads30d: z.number().int().min(0).nullish(),
    npmDownloadsUpdatedAt: z.string().nullish(),
    pypiDownloadsUpdatedAt: z.string().nullish(),
  })
  .passthrough();
