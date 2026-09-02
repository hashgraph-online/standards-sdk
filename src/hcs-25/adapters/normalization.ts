import { clampScore } from '../scoring';

/**
 * Clamps a value into the unit interval `[0, 1]`.
 */
export function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Normalizes a ratio that implementations may store either as `0..1` or as
 * `0..100`. Values above one are treated as percent scale.
 */
export function normalizeRatio(value: number): number {
  return clampUnit(value > 1 ? value / 100 : value);
}

/**
 * Log-scales a raw count into `[0, 100]` using `log1p` against a cap, per
 * the HCS-25 recommended log-scaling pattern.
 */
export function logScale(value: number, cap: number): number {
  if (cap <= 0) {
    return 0;
  }
  return clampScore(
    100 * clampUnit(Math.log1p(Math.max(0, value)) / Math.log1p(cap)),
  );
}

/**
 * Computes the arithmetic mean of the provided values, returning null when
 * none are present.
 */
export function meanOfPresent(
  values: readonly (number | null)[],
): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return null;
  }
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}
