import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { isJsonObject } from '../signals';

/**
 * Reads an ISO-8601/epoch timestamp field into milliseconds, or null.
 */
export function parseTimestampMs(value: unknown): number | null {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

/**
 * Options for {@link shouldRefreshStoredFields}.
 */
export interface Hcs25FreshnessGate {
  /**
   * Metadata scope holding the fields: `root` reads `metadata.<key>`
   * directly; any other value reads `metadata.<scope>.<key>`.
   */
  scope?: 'root' | (string & {});
  /** Field storing the last refresh timestamp. Default `updatedAt`. */
  updatedAtKey?: string;
  /** Field storing the last status (`ok` vs failure states). */
  statusKey?: string;
  /** TTL applied when the stored status is `ok`. */
  ttlMs: number;
  /** TTL applied for non-`ok` statuses (default: same as `ttlMs`). */
  failureTtlMs?: number;
  /** Clock for the comparison. */
  now?: Date;
  /** When true, always refresh (equivalent to `context.force`). */
  force?: boolean;
}

function readField(subject: Hcs25Subject, scope: string, key: string): unknown {
  const metadata = subject.metadata ?? {};
  if (scope === 'root') {
    return (metadata as Record<string, Hcs25JsonValue>)[key];
  }
  const record = metadata[scope];
  if (!isJsonObject(record)) {
    return undefined;
  }
  return (record as Record<string, Hcs25JsonValue>)[key];
}

/**
 * Production-style refresh gating (Registry Broker): a signal with a stored
 * `ok` status is refreshed once `ttlMs` has elapsed since its stored
 * timestamp; failures use `failureTtlMs` so transiently missing/erroring
 * sources re-check sooner. Returns false when the stored fields are still
 * fresh and the adapter may skip collection entirely.
 */
export function shouldRefreshStoredFields(
  subject: Hcs25Subject,
  options: Hcs25FreshnessGate,
): boolean {
  if (options.force) {
    return true;
  }
  const scope = options.scope ?? 'root';
  const updatedAt = parseTimestampMs(
    readField(subject, scope, options.updatedAtKey ?? 'updatedAt'),
  );
  if (updatedAt === null) {
    return true;
  }
  const status = readField(subject, scope, options.statusKey ?? 'status');
  const normalizedStatus = typeof status === 'string' ? status.trim() : '';
  if (!normalizedStatus) {
    return true;
  }
  const ttl =
    normalizedStatus === 'ok'
      ? options.ttlMs
      : (options.failureTtlMs ?? options.ttlMs);
  const now = options.now ?? new Date();
  return now.getTime() - updatedAt >= ttl;
}
