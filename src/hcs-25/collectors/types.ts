import type {
  Hcs25ApplicabilityRule,
  Hcs25JsonValue,
  Hcs25Signal,
  Hcs25SignalProvenance,
  Hcs25SignalSnapshot,
  Hcs25SignalStatus,
  Hcs25Subject,
} from '../types';

/**
 * Minimal fetch surface required by signal adapters. Compatible with the
 * global `fetch`; tests inject a mock implementation.
 */
export type Hcs25Fetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText?: string;
  json: () => Promise<unknown>;
  text?: () => Promise<string>;
}>;

/**
 * A block of collected fields and where they are stored on the subject
 * record. `root` writes `metadata.<key>`, `metrics` writes
 * `metadata.metrics.<key>`, `additional` writes `metadata.additional.<key>`,
 * and any other scope string writes into the `metadata.<scope>` record,
 * matching the storage locations published in the HCS-25 signal catalog.
 */
export interface Hcs25CollectedFields {
  scope: 'root' | 'metrics' | 'additional' | (string & {});
  values: Record<string, Hcs25JsonValue>;
}

/**
 * One collected signal: its identifier, status code, optional raw value,
 * the stored fields it produced, and provenance.
 */
export interface Hcs25SignalAdapterResult {
  signalId: string;
  status: Hcs25SignalStatus;
  value?: Hcs25JsonValue;
  fields?: readonly Hcs25CollectedFields[];
  provenance?: Hcs25SignalProvenance;
}

/**
 * Inputs passed to a signal adapter's `collect` method.
 */
export interface Hcs25CollectContext {
  subject: Hcs25Subject;
  fetch: Hcs25Fetch;
  timeoutMs: number;
  now: Date;
  signal?: AbortSignal;
  /**
   * When true, adapters bypass their freshness/refresh gating and collect
   * unconditionally (matching Registry Broker's `force` refresh option).
   */
  force?: boolean;
}

/**
 * A signal adapter: performs I/O to collect or refresh trust signals for a
 * subject and writes them into the subject's signal snapshot. Signal
 * adapters are expected to fail gracefully; the collection runner converts
 * thrown errors into `timeout`/`error` signal statuses.
 */
export interface Hcs25SignalAdapter extends Hcs25ApplicabilityRule {
  /** Stable, hyphen-namespaced adapter identifier. */
  id: string;
  /** Signal identifiers this adapter may produce. */
  produces: readonly string[];
  /** Per-adapter timeout override in milliseconds. */
  timeoutMs?: number;
  collect: (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ) => Promise<readonly Hcs25SignalAdapterResult[]>;
}

/**
 * Per-adapter diagnostics emitted by {@link collectHcs25Signals}.
 */
export interface Hcs25SignalAdapterRunReport {
  adapterId: string;
  applicable: boolean;
  signalIds: string[];
  status: 'ok' | 'missing' | 'timeout' | 'error';
  error?: string;
}

/**
 * The outcome of a collection run: the subject enriched with stored fields,
 * the signal snapshot for provenance/status, and per-adapter diagnostics.
 */
export interface Hcs25SignalCollection {
  subject: Hcs25Subject;
  snapshot: Hcs25SignalSnapshot;
  results: readonly Hcs25SignalAdapterRunReport[];
}

/**
 * Options for {@link collectHcs25Signals}.
 */
export interface Hcs25CollectSignalsOptions {
  adapters: readonly Hcs25SignalAdapter[];
  /** Fetch implementation; defaults to `globalThis.fetch`. */
  fetch?: Hcs25Fetch;
  /** Default per-adapter timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
  /**
   * Freshness policy in milliseconds. Signals whose `fetchedAt` (or
   * provenance `fetchedAt`) is older than this window are marked `stale`,
   * and carried-over `previousSnapshot` entries older than the window are
   * marked `stale` as well.
   */
  staleAfterMs?: number;
  /** A previously stored snapshot to carry forward unrefreshed signals. */
  previousSnapshot?: Hcs25SignalSnapshot;
  /** Bypass adapter freshness gating and collect unconditionally. */
  force?: boolean;
  /** Clock override for deterministic tests. */
  now?: Date;
}

export type { Hcs25Signal, Hcs25SignalSnapshot, Hcs25SignalStatus };
