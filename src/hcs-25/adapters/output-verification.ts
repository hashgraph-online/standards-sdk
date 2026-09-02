import { clampScore } from '../scoring';
import type {
  Hcs25AdapterDefinition,
  Hcs25NormalizedValue,
  Hcs25Subject,
} from '../types';
import {
  isJsonObject,
  readMetadataRecord,
  readNumber,
  type Hcs25JsonObject,
} from '../signals';
import { clampUnit } from './normalization';

/**
 * Options for the output verification adapter.
 */
export interface Hcs25OutputVerificationAdapterOptions {
  /** Volume cap for the log-scaled coverage component. Default 50. */
  volumeCap?: number;
  /** Multiplier on log10 of the check count. Default 20. */
  volumeScale?: number;
  /** Minimum total checks before the adapter applies. Default 10. */
  minChecks?: number;
  /** Within-adapter weight of the quality component. Default 0.7. */
  qualityWeight?: number;
  /** Within-adapter weight of the coverage component. Default 0.3. */
  coverageWeight?: number;
  /** Per-stake-level multipliers applied to check counts. */
  stakeMultipliers?: Readonly<Record<string, number>>;
}

const MISSING: Hcs25NormalizedValue = { value: 0, status: 'missing' };

const DEFAULT_STAKE_MULTIPLIERS: Readonly<Record<string, number>> = {
  low: 0.5,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Block rate at which the verifier earns full discriminative-power credit.
 */
const DISCRIMINATIVE_POWER_BLOCK_RATE = 0.05;

/**
 * Upper bound on the stake multiplier's influence on quality.
 */
const STAKE_MULTIPLIER_QUALITY_CAP = 1.5;

function computeStakeMultiplier(
  summary: Hcs25JsonObject,
  multipliers: Readonly<Record<string, number>>,
): number {
  const distribution = summary.stakeDistribution;
  if (!isJsonObject(distribution)) {
    return 1;
  }

  let weighted = 0;
  let unweighted = 0;
  for (const level of Object.keys(multipliers)) {
    const levelRecord = distribution[level];
    if (!isJsonObject(levelRecord)) {
      continue;
    }
    const checks = readNumber(levelRecord, 'checks');
    if (checks === null) {
      continue;
    }
    weighted += checks * multipliers[level];
    unweighted += checks;
  }

  if (unweighted <= 0) {
    return 1;
  }

  const ratio = weighted / unweighted;
  return Math.min(3, Math.max(0.5, ratio));
}

function computeQuality(
  summary: Hcs25JsonObject,
  multipliers: Readonly<Record<string, number>>,
): Hcs25NormalizedValue {
  const allowRate = clampUnit(readNumber(summary, 'allowRate') ?? 0);
  const blockRate = clampUnit(readNumber(summary, 'blockRate') ?? 0);
  const avgConfidence = clampUnit(readNumber(summary, 'avgConfidence') ?? 0);

  const baseQuality = allowRate * avgConfidence;
  const discriminativePower = clampUnit(
    blockRate / DISCRIMINATIVE_POWER_BLOCK_RATE,
  );
  const stakeMultiplier = computeStakeMultiplier(summary, multipliers);
  const cappedStakeMultiplier = Math.min(
    stakeMultiplier,
    STAKE_MULTIPLIER_QUALITY_CAP,
  );

  return {
    value: clampScore(
      baseQuality * discriminativePower * cappedStakeMultiplier * 100,
    ),
    status: 'ok',
  };
}

function computeCoverage(
  summary: Hcs25JsonObject,
  volumeCap: number,
  volumeScale: number,
): Hcs25NormalizedValue {
  const totalChecks = readNumber(summary, 'totalChecks');
  if (totalChecks === null) {
    return MISSING;
  }

  const volumeRaw = Math.min(
    volumeCap,
    Math.log10(totalChecks + 1) * volumeScale,
  );
  return {
    value: clampScore(100 * clampUnit(volumeRaw / volumeCap)),
    status: 'ok',
  };
}

/**
 * Creates the `output-verification` adapter: converts per-decision reasoning
 * verification summaries into a stake-weighted quality component and a
 * log-scaled coverage component. It penalizes rubber-stamp verifiers through
 * discriminative power, resists trivial-claim farming through stake
 * weighting, and excludes agents below the minimum check threshold.
 */
export function createOutputVerificationAdapter(
  options: Hcs25OutputVerificationAdapterOptions = {},
): Hcs25AdapterDefinition {
  const volumeCap = options.volumeCap ?? 50;
  const volumeScale = options.volumeScale ?? 20;
  const minChecks = options.minChecks ?? 10;
  const qualityWeight = options.qualityWeight ?? 0.7;
  const coverageWeight = options.coverageWeight ?? 0.3;
  const stakeMultipliers =
    options.stakeMultipliers ?? DEFAULT_STAKE_MULTIPLIERS;

  const hasVerificationHistory = (subject: Hcs25Subject): boolean => {
    const summary = readMetadataRecord(subject, 'outputVerificationSummary');
    if (!summary) {
      return false;
    }
    const totalChecks = readNumber(summary, 'totalChecks');
    return totalChecks !== null && totalChecks >= minChecks;
  };

  return {
    id: 'output-verification',
    weight: 1,
    contributionMode: 'scoped',
    appliesTo: hasVerificationHistory,
    components: [
      {
        name: 'quality',
        weight: qualityWeight,
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const summary = readMetadataRecord(
            subject,
            'outputVerificationSummary',
          );
          return summary ? computeQuality(summary, stakeMultipliers) : MISSING;
        },
      },
      {
        name: 'coverage',
        weight: coverageWeight,
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const summary = readMetadataRecord(
            subject,
            'outputVerificationSummary',
          );
          return summary
            ? computeCoverage(summary, volumeCap, volumeScale)
            : MISSING;
        },
      },
    ],
  };
}
