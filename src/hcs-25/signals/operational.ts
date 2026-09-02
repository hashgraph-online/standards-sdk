import { z } from 'zod';

import { hcs25JsonValueSchema } from '../types';

/**
 * Stored-field schema for availability/reachability signals, per
 * `subject.metadata` with optional ecosystem-native recency fields under
 * `metrics`.
 */
export const hcs25AvailabilityFieldsSchema = z
  .object({
    availabilityScore: z.number().nullish(),
    availabilityCheckedAt: z.string().nullish(),
    availabilityLatencyMs: z.number().nullish(),
    availabilityReason: z.string().nullish(),
    availabilitySource: z.string().nullish(),
    metrics: z
      .object({
        isOnline: z.boolean().nullish(),
        minsFromLastOnline: z.number().nullish(),
        lastActiveAt: z.string().nullish(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const ethosSourceKindSchema = z.enum(['explicit', 'x', 'address']);
const ethosSignalStatusSchema = z.enum(['ok', 'missing', 'error']);

/**
 * Stored-field schema for Ethos reputation signals, per `subject.metadata`,
 * including the per-source records used for the weighted composite.
 */
export const hcs25EthosFieldsSchema = z
  .object({
    ethosUserkey: z.string().min(1).nullish(),
    ethosScore: z.number().nullish(),
    ethosScoreStatus: ethosSignalStatusSchema.nullish(),
    ethosScoreUpdatedAt: z.string().nullish(),
    ethosSources: z
      .array(
        z
          .object({
            userkey: z.string().min(1),
            kind: ethosSourceKindSchema,
            weight: z.number().nullish(),
            status: ethosSignalStatusSchema,
            score: z.number().nullish(),
            updatedAt: z.string().nullish(),
          })
          .passthrough(),
      )
      .nullish(),
    ethosComposite: z
      .object({
        version: z.number(),
        score: z.number().nullish(),
        updatedAt: z.string().nullish(),
        weights: hcs25JsonValueSchema.nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

const outputVerificationStakeLevelSchema = z
  .object({
    checks: z.number().int().min(0),
    allowRate: z.number().min(0).max(1).nullish(),
    avgConfidence: z.number().min(0).max(1).nullish(),
  })
  .passthrough();

const outputVerificationProviderSchema = z
  .object({
    id: z.string().min(1),
    signerAddress: z.string().nullish(),
    methodologyUrl: z.string().nullish(),
    checksContributed: z.number().int().min(0).nullish(),
  })
  .passthrough();

/**
 * Stored-field schema for the output verification summary stored under
 * `metadata.outputVerificationSummary`, covering rates, confidence, stake
 * distribution, and provider provenance.
 */
export const hcs25OutputVerificationSummarySchema = z
  .object({
    allowRate: z.number().min(0).max(1),
    blockRate: z.number().min(0).max(1),
    uncertainRate: z.number().min(0).max(1).nullish(),
    avgConfidence: z.number().min(0).max(1),
    totalChecks: z.number().int().min(0),
    stakeDistribution: z
      .object({
        low: outputVerificationStakeLevelSchema.nullish(),
        medium: outputVerificationStakeLevelSchema.nullish(),
        high: outputVerificationStakeLevelSchema.nullish(),
        critical: outputVerificationStakeLevelSchema.nullish(),
      })
      .passthrough()
      .nullish(),
    windowDays: z.number().min(0).nullish(),
    providers: z.array(outputVerificationProviderSchema).nullish(),
    updatedAt: z.string().nullish(),
  })
  .passthrough();
