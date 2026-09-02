import {
  isValidAdapterId,
  isValidComponentKey,
  isValidComponentName,
} from './identifiers';
import {
  HCS25_DEFAULT_CONTRIBUTION_MODE,
  HCS25_DEFAULT_ROUNDING_DECIMALS,
  HCS25_DEFAULT_STALE_MULTIPLIER,
  HCS25_DEFAULT_WEIGHT,
  hcs25SignalSnapshotSchema,
  hcs25SubjectSchema,
} from './types';
import type {
  Hcs25AdapterDefinition,
  Hcs25AdapterScore,
  Hcs25ComponentResult,
  Hcs25ContributionMode,
  Hcs25NormalizedValue,
  Hcs25ScoringConfig,
  Hcs25ScoringConfigInput,
  Hcs25SignalSnapshot,
  Hcs25Subject,
  Hcs25TrustScoreRecord,
} from './types';

/**
 * Clamps a finite component value into the HCS-25 range [0, 100].
 */
export function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Rounds a value to a stable decimal precision (default 2, per HCS-25).
 */
export function roundScore(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Validates an adapter set and resolves configuration defaults. The returned
 * configuration is safe to pass to {@link computeTrustScore}.
 */
export function compileScoringConfig(
  input: Hcs25ScoringConfigInput,
): Hcs25ScoringConfig {
  if (!Number.isInteger(input.version) || input.version < 0) {
    throw new TypeError(
      'trustScoreConfigVersion must be a non-negative integer',
    );
  }

  if (!Array.isArray(input.adapters) || input.adapters.length === 0) {
    throw new TypeError('at least one trust adapter is required');
  }

  const seenAdapterIds = new Set<string>();
  for (const adapter of input.adapters) {
    validateAdapter(adapter, seenAdapterIds);
    seenAdapterIds.add(adapter.id);
  }

  const staleMultiplier =
    input.staleMultiplier ?? HCS25_DEFAULT_STALE_MULTIPLIER;
  if (
    !Number.isFinite(staleMultiplier) ||
    staleMultiplier < 0 ||
    staleMultiplier > 1
  ) {
    throw new TypeError('staleMultiplier must be a number in [0, 1]');
  }

  const roundingDecimals =
    input.roundingDecimals ?? HCS25_DEFAULT_ROUNDING_DECIMALS;
  if (
    !Number.isInteger(roundingDecimals) ||
    roundingDecimals < 0 ||
    roundingDecimals > 6
  ) {
    throw new TypeError('roundingDecimals must be an integer in [0, 6]');
  }

  return {
    version: input.version,
    adapters: input.adapters,
    staleMultiplier,
    roundingDecimals,
    computeConfidence: input.computeConfidence ?? false,
  };
}

function validateAdapter(
  adapter: Hcs25AdapterDefinition,
  seenAdapterIds: Set<string>,
): void {
  if (typeof adapter.id !== 'string' || !isValidAdapterId(adapter.id)) {
    throw new TypeError(
      `invalid adapterId "${String(adapter.id)}": adapter identifiers must match ^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$`,
    );
  }

  if (seenAdapterIds.has(adapter.id)) {
    throw new TypeError(
      `duplicate adapterId "${adapter.id}": adapter identifiers must be unique within a configuration`,
    );
  }

  if (
    adapter.weight !== undefined &&
    (!Number.isFinite(adapter.weight) || adapter.weight < 0)
  ) {
    throw new TypeError(
      `adapter "${adapter.id}" weight must be a finite non-negative number`,
    );
  }

  if (!Array.isArray(adapter.components) || adapter.components.length === 0) {
    throw new TypeError(
      `adapter "${adapter.id}" must declare at least one component`,
    );
  }

  if (
    adapter.defaultComponentKey !== undefined &&
    !isValidComponentKey(adapter.defaultComponentKey)
  ) {
    throw new TypeError(
      `adapter "${adapter.id}" defaultComponentKey must be a valid component key`,
    );
  }

  for (const component of adapter.components) {
    if (
      typeof component.name !== 'string' ||
      !isValidComponentName(component.name)
    ) {
      throw new TypeError(
        `adapter "${adapter.id}" component name "${String(component.name)}" is not a valid component key segment`,
      );
    }

    if (
      component.weight !== undefined &&
      (!Number.isFinite(component.weight) || component.weight < 0)
    ) {
      throw new TypeError(
        `adapter "${adapter.id}" component "${component.name}" weight must be a finite non-negative number`,
      );
    }

    if (typeof component.normalize !== 'function') {
      throw new TypeError(
        `adapter "${adapter.id}" component "${component.name}" must declare a normalize function`,
      );
    }
  }
}

/**
 * Evaluates adapter applicability against a subject using registry
 * include/exclude lists and the optional appliesTo predicate.
 */
export function isAdapterApplicable(
  adapter: Hcs25AdapterDefinition,
  subject: Hcs25Subject,
): boolean {
  if (adapter.includeRegistries) {
    if (
      subject.registry === undefined ||
      !adapter.includeRegistries.includes(subject.registry)
    ) {
      return false;
    }
  }

  if (
    adapter.excludeRegistries &&
    subject.registry !== undefined &&
    adapter.excludeRegistries.includes(subject.registry)
  ) {
    return false;
  }

  if (adapter.appliesTo && !adapter.appliesTo(subject)) {
    return false;
  }

  return true;
}

export interface Hcs25ComputeTrustScoreInput {
  subject: Hcs25Subject;
  snapshot: Hcs25SignalSnapshot;
  config: Hcs25ScoringConfigInput;
  now?: Date;
}

/**
 * Computes the composite AI Trust Score for a subject from a signal snapshot
 * and scoring configuration, following HCS-25 normalization, missing/stale
 * handling, applicability, and weighted-aggregation rules.
 */
export function computeTrustScore(
  input: Hcs25ComputeTrustScoreInput,
): Hcs25TrustScoreRecord {
  const config = compileScoringConfig(input.config);
  const subject = hcs25SubjectSchema.parse(input.subject);
  const snapshot = hcs25SignalSnapshotSchema.parse(input.snapshot);
  const context = { subject, snapshot, config };

  const adapterScores: Hcs25AdapterScore[] = [];
  const trustScores: Record<string, number> = {};

  for (const adapter of config.adapters) {
    const adapterScore = scoreAdapter(adapter, subject, context, config);
    adapterScores.push(adapterScore);

    if (adapterScore.applicable) {
      for (const component of adapterScore.components) {
        trustScores[component.key] = component.value;
      }
    }
  }

  const denominator = adapterScores.filter(score => score.inDenominator);
  const totalWeight = denominator.reduce((sum, score) => sum + score.weight, 0);
  const weightedSum = denominator.reduce(
    (sum, score) => sum + score.total * score.weight,
    0,
  );
  const total =
    totalWeight > 0
      ? roundScore(weightedSum / totalWeight, config.roundingDecimals)
      : 0;

  trustScores.total = total;

  const record: Hcs25TrustScoreRecord = {
    trustScore: total,
    trustScores,
    trustScoreConfigVersion: config.version,
    trustScoreUpdatedAt: (input.now ?? new Date()).toISOString(),
    breakdown: { adapters: adapterScores },
  };

  if (config.computeConfidence) {
    record.trustConfidence = computeConfidence(denominator, totalWeight);
  }

  return record;
}

function scoreAdapter(
  adapter: Hcs25AdapterDefinition,
  subject: Hcs25Subject,
  context: {
    subject: Hcs25Subject;
    snapshot: Hcs25SignalSnapshot;
    config: Hcs25ScoringConfig;
  },
  config: Hcs25ScoringConfig,
): Hcs25AdapterScore {
  const weight = adapter.weight ?? HCS25_DEFAULT_WEIGHT;
  const contributionMode: Hcs25ContributionMode =
    adapter.contributionMode ?? HCS25_DEFAULT_CONTRIBUTION_MODE;
  const applicable = isAdapterApplicable(adapter, subject);

  const components: Hcs25ComponentResult[] = [];
  const unavailable: string[] = [];

  if (applicable) {
    for (const component of adapter.components) {
      const key = `${adapter.id}.${component.name}`;
      const normalized = normalizeComponent(component.normalize(context));

      if (normalized === null) {
        if (component.nonScorableWhenUnavailable) {
          unavailable.push(key);
        } else {
          components.push({
            key,
            value: 0,
            status: 'missing',
            weight: resolveWeight(component.weight),
          });
        }
        continue;
      }

      const value =
        normalized.status === 'stale'
          ? clampScore(normalized.value * config.staleMultiplier)
          : clampScore(normalized.value);

      components.push({
        key,
        value,
        status: normalized.status,
        weight: resolveWeight(component.weight),
      });
    }

    if (
      components.length === 0 &&
      contributionMode !== HCS25_DEFAULT_CONTRIBUTION_MODE
    ) {
      const defaultKey = adapter.defaultComponentKey ?? `${adapter.id}.score`;
      components.push({
        key: defaultKey,
        value: 0,
        status: 'missing',
        weight: HCS25_DEFAULT_WEIGHT,
      });
    }
  }

  let inDenominator = false;
  if (applicable) {
    inDenominator =
      contributionMode === 'conditional' ? components.length > 0 : true;
    if (weight === 0) {
      inDenominator = false;
    }
  }

  return {
    adapterId: adapter.id,
    contributionMode,
    applicable,
    inDenominator,
    weight,
    components,
    unavailable,
    total: adapterTotal(components, config.roundingDecimals),
  };
}

function normalizeComponent(
  normalized: Hcs25NormalizedValue,
): Hcs25NormalizedValue | null {
  if (!Number.isFinite(normalized.value)) {
    return null;
  }

  if (
    normalized.status === 'missing' ||
    normalized.status === 'timeout' ||
    normalized.status === 'error'
  ) {
    return null;
  }

  return normalized;
}

function resolveWeight(weight: number | undefined): number {
  return weight ?? HCS25_DEFAULT_WEIGHT;
}

function adapterTotal(
  components: Hcs25ComponentResult[],
  roundingDecimals: number,
): number {
  if (components.length === 0) {
    return 0;
  }

  let weightedSum = 0;
  let totalWeight = 0;
  for (const component of components) {
    weightedSum += component.value * component.weight;
    totalWeight += component.weight;
  }

  const mean = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return roundScore(clampScore(mean), roundingDecimals);
}

function computeConfidence(
  denominator: Hcs25AdapterScore[],
  totalWeight: number,
): number {
  if (totalWeight <= 0) {
    return 0;
  }

  let weightedSum = 0;
  for (const adapter of denominator) {
    const okCount = adapter.components.filter(
      component => component.status === 'ok',
    ).length;
    const adapterConfidence =
      adapter.components.length > 0 ? okCount / adapter.components.length : 0;
    weightedSum += adapter.weight * adapterConfidence;
  }

  return roundScore(weightedSum / totalWeight, 4);
}
