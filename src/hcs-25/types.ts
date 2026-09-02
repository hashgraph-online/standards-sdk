import { z } from 'zod';

import { isValidSignalId } from './identifiers';

/**
 * JSON-compatible value carried by a trust signal.
 */
export type Hcs25JsonValue =
  | string
  | number
  | boolean
  | null
  | Hcs25JsonValue[]
  | { [key: string]: Hcs25JsonValue };

export const hcs25JsonValueSchema: z.ZodType<Hcs25JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(hcs25JsonValueSchema),
    z.record(z.string(), hcs25JsonValueSchema),
  ]),
);

/**
 * Signal status codes defined by HCS-25.
 */
export const hcs25SignalStatusSchema = z.enum([
  'ok',
  'missing',
  'timeout',
  'error',
  'stale',
]);

export type Hcs25SignalStatus = z.infer<typeof hcs25SignalStatusSchema>;

/**
 * Optional provenance describing where a signal came from.
 */
export const hcs25SignalProvenanceSchema = z
  .object({
    source: z.string().min(1).optional(),
    sourceUrl: z.string().min(1).optional(),
    subjectId: z.string().min(1).optional(),
    fetchedAt: z.string().min(1).optional(),
    params: z.record(z.string(), hcs25JsonValueSchema).optional(),
  })
  .passthrough();

export type Hcs25SignalProvenance = z.infer<typeof hcs25SignalProvenanceSchema>;

/**
 * A single trust signal: a stable identifier-keyed measurement with a status
 * and optional provenance.
 */
export const hcs25SignalSchema = z
  .object({
    status: hcs25SignalStatusSchema,
    value: hcs25JsonValueSchema.optional(),
    fetchedAt: z.string().min(1).optional(),
    provenance: hcs25SignalProvenanceSchema.optional(),
  })
  .passthrough();

export type Hcs25Signal = z.infer<typeof hcs25SignalSchema>;

/**
 * The set of trust signals currently known for a subject, keyed by namespaced
 * signal identifier.
 */
export const hcs25SignalSnapshotSchema = z
  .record(z.string(), hcs25SignalSchema)
  .superRefine((snapshot, ctx) => {
    for (const key of Object.keys(snapshot)) {
      if (!isValidSignalId(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `invalid signal identifier "${key}": signal identifiers must be namespaced, e.g. "provider.metric"`,
        });
      }
    }
  });

export type Hcs25SignalSnapshot = Record<string, Hcs25Signal>;

/**
 * The AI system being scored.
 */
export const hcs25SubjectSchema = z
  .object({
    id: z.string().min(1),
    registry: z.string().min(1).optional(),
    protocol: z.string().min(1).optional(),
    class: z.string().min(1).optional(),
    metadata: z.record(z.string(), hcs25JsonValueSchema).optional(),
  })
  .passthrough();

export type Hcs25Subject = z.infer<typeof hcs25SubjectSchema>;

/**
 * Adapter participation policy in the composite denominator.
 */
export type Hcs25ContributionMode = 'universal' | 'scoped' | 'conditional';

/**
 * Output of an adapter component normalization function.
 */
export interface Hcs25NormalizedValue {
  value: number;
  status: Hcs25SignalStatus;
}

/**
 * Inputs available to adapter normalization functions.
 */
export interface Hcs25NormalizationContext {
  subject: Hcs25Subject;
  snapshot: Hcs25SignalSnapshot;
  config: Hcs25ScoringConfig;
}

/**
 * Applicability constraints shared by adapters.
 */
export interface Hcs25ApplicabilityRule {
  includeRegistries?: readonly string[];
  excludeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

/**
 * A deterministic scoring function that maps one signal into one normalized
 * component.
 */
export interface Hcs25ComponentDefinition {
  name: string;
  weight?: number;
  nonScorableWhenUnavailable?: boolean;
  normalize: (context: Hcs25NormalizationContext) => Hcs25NormalizedValue;
}

/**
 * A trust score adapter: deterministic, CPU-bound, and explainable.
 */
export interface Hcs25AdapterDefinition extends Hcs25ApplicabilityRule {
  id: string;
  weight?: number;
  contributionMode?: Hcs25ContributionMode;
  defaultComponentKey?: string;
  components: readonly Hcs25ComponentDefinition[];
}

/**
 * Scoring configuration as provided by the caller; defaults are resolved by
 * {@link compileScoringConfig}.
 */
export interface Hcs25ScoringConfigInput {
  version: number;
  adapters: readonly Hcs25AdapterDefinition[];
  staleMultiplier?: number;
  roundingDecimals?: number;
  computeConfidence?: boolean;
}

/**
 * Validated scoring configuration with defaults resolved.
 */
export interface Hcs25ScoringConfig {
  version: number;
  adapters: readonly Hcs25AdapterDefinition[];
  staleMultiplier: number;
  roundingDecimals: number;
  computeConfidence: boolean;
}

export const HCS25_DEFAULT_WEIGHT = 1;
export const HCS25_DEFAULT_CONTRIBUTION_MODE: Hcs25ContributionMode =
  'conditional';
export const HCS25_DEFAULT_STALE_MULTIPLIER = 1;
export const HCS25_DEFAULT_ROUNDING_DECIMALS = 2;

/**
 * One normalized component emitted by an adapter.
 */
export interface Hcs25ComponentResult {
  key: string;
  value: number;
  status: Hcs25SignalStatus;
  weight: number;
}

/**
 * Per-adapter scoring breakdown.
 */
export interface Hcs25AdapterScore {
  adapterId: string;
  contributionMode: Hcs25ContributionMode;
  applicable: boolean;
  inDenominator: boolean;
  weight: number;
  components: Hcs25ComponentResult[];
  unavailable: string[];
  total: number;
}

/**
 * The HCS-25 score record emitted for a subject.
 */
export interface Hcs25TrustScoreRecord {
  trustScore: number;
  trustScores: Record<string, number>;
  trustScoreConfigVersion: number;
  trustScoreUpdatedAt: string;
  trustConfidence?: number;
  breakdown: {
    adapters: Hcs25AdapterScore[];
  };
}
