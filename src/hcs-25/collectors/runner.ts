import { isValidAdapterId, isValidSignalId } from '../identifiers';
import type {
  Hcs25ApplicabilityRule,
  Hcs25Signal,
  Hcs25SignalSnapshot,
  Hcs25SignalStatus,
  Hcs25Subject,
} from '../types';
import { applyCollectedFields } from './merge';
import {
  Hcs25CollectorTimeoutError,
  isTimeoutError,
  resolveFetch,
} from './http';
import type {
  Hcs25CollectSignalsOptions,
  Hcs25CollectedFields,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
  Hcs25SignalAdapterRunReport,
  Hcs25SignalCollection,
} from './types';

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Evaluates signal-adapter applicability using the same rule shape as trust
 * score adapters: registry include/exclude lists plus an optional
 * `appliesTo` predicate.
 */
export function isSignalAdapterApplicable(
  rule: Hcs25ApplicabilityRule,
  subject: Hcs25Subject,
): boolean {
  if (rule.includeRegistries) {
    if (
      subject.registry === undefined ||
      !rule.includeRegistries.includes(subject.registry)
    ) {
      return false;
    }
  }
  if (
    rule.excludeRegistries &&
    subject.registry !== undefined &&
    rule.excludeRegistries.includes(subject.registry)
  ) {
    return false;
  }
  if (rule.appliesTo && !rule.appliesTo(subject)) {
    return false;
  }
  return true;
}

function validateSignalAdapter(adapter: Hcs25SignalAdapter): void {
  if (!isValidAdapterId(adapter.id)) {
    throw new TypeError(
      `invalid signal adapter id "${String(adapter.id)}": identifiers must match ^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$`,
    );
  }
  if (!Array.isArray(adapter.produces) || adapter.produces.length === 0) {
    throw new TypeError(
      `signal adapter "${adapter.id}" must declare at least one produced signalId`,
    );
  }
  for (const signalId of adapter.produces) {
    if (!isValidSignalId(signalId)) {
      throw new TypeError(
        `signal adapter "${adapter.id}" declares invalid signalId "${String(signalId)}"`,
      );
    }
  }
  if (typeof adapter.collect !== 'function') {
    throw new TypeError(
      `signal adapter "${adapter.id}" must declare a collect function`,
    );
  }
}

function isStale(
  fetchedAt: string | undefined,
  staleAfterMs: number,
  now: Date,
): boolean {
  if (!fetchedAt) {
    return false;
  }
  const fetchedMs = Date.parse(fetchedAt);
  if (Number.isNaN(fetchedMs)) {
    return false;
  }
  return now.getTime() - fetchedMs > staleAfterMs;
}

function applyFreshness(
  result: Hcs25SignalAdapterResult,
  staleAfterMs: number | undefined,
  now: Date,
): Hcs25SignalAdapterResult {
  if (staleAfterMs === undefined || result.status !== 'ok') {
    return result;
  }
  const fetchedAt = result.provenance?.fetchedAt;
  if (!isStale(fetchedAt, staleAfterMs, now)) {
    return result;
  }
  return {
    ...result,
    status: 'stale',
    fields: markStatusFieldsStale(result.fields),
  };
}

/**
 * When a collected signal is stale, its stored `*Status` fields are rewritten
 * to `stale` so scoring adapters emit `status:'stale'` and the staleness
 * multiplier applies (per HCS-25 missing/stale rules).
 */
function markStatusFieldsStale(
  fields: readonly Hcs25CollectedFields[] | undefined,
): readonly Hcs25CollectedFields[] | undefined {
  if (!fields) {
    return fields;
  }
  return fields.map(block => {
    const values = { ...block.values };
    for (const key of Object.keys(values)) {
      if (key.endsWith('Status') && typeof values[key] === 'string') {
        values[key] = 'stale';
      }
    }
    return { ...block, values };
  });
}

function toSignal(result: Hcs25SignalAdapterResult, now: Date): Hcs25Signal {
  return {
    status: result.status,
    value: result.value,
    fetchedAt: result.provenance?.fetchedAt ?? now.toISOString(),
    provenance: result.provenance,
  };
}

function summarizeStatuses(
  counts: Map<Hcs25SignalStatus, number>,
): Hcs25SignalAdapterRunReport['status'] {
  if (counts.has('error')) {
    return 'error';
  }
  if (counts.has('timeout')) {
    return 'timeout';
  }
  if (counts.size === 0) {
    return 'missing';
  }
  if ((counts.get('ok') ?? 0) > 0 || counts.has('stale')) {
    return 'ok';
  }
  return 'missing';
}

/**
 * Runs signal adapters for a subject: checks applicability, enforces
 * per-adapter time budgets, classifies failures into HCS-25 status codes,
 * marks stale signals per the configured freshness policy, merges collected
 * fields onto the subject record, and emits the signal snapshot.
 *
 * Carried-over `previousSnapshot` entries are preserved; when `staleAfterMs`
 * is configured, entries (new or carried) whose `fetchedAt` exceeds the
 * freshness window are marked `stale`.
 */
export async function collectHcs25Signals(
  subject: Hcs25Subject,
  options: Hcs25CollectSignalsOptions,
): Promise<Hcs25SignalCollection> {
  const fetch = resolveFetch(options.fetch);
  const now = options.now ?? new Date();
  const snapshot: Hcs25SignalSnapshot = { ...(options.previousSnapshot ?? {}) };
  const collectedFields: Hcs25CollectedFields[] = [];
  const results: Hcs25SignalAdapterRunReport[] = [];

  for (const adapter of options.adapters) {
    validateSignalAdapter(adapter);

    if (!isSignalAdapterApplicable(adapter, subject)) {
      results.push({
        adapterId: adapter.id,
        applicable: false,
        signalIds: [],
        status: 'missing',
      });
      continue;
    }

    const timeoutMs =
      adapter.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let adapterResults: readonly Hcs25SignalAdapterResult[];
    let runStatus: Hcs25SignalAdapterRunReport['status'] | undefined;
    let runError: string | undefined;

    try {
      adapterResults = await Promise.race([
        adapter.collect(subject, {
          subject,
          fetch,
          timeoutMs,
          now,
          signal: controller.signal,
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Hcs25CollectorTimeoutError());
          }, timeoutMs + 1);
        }),
      ]);
      clearTimeout(timer);
      if (adapterResults.length === 0) {
        adapterResults = adapter.produces.map(signalId => ({
          signalId,
          status: 'missing' as const,
        }));
      }
    } catch (error) {
      const status: Hcs25SignalStatus = isTimeoutError(error)
        ? 'timeout'
        : 'error';
      runStatus = status;
      runError = error instanceof Error ? error.message : String(error);
      adapterResults = adapter.produces.map(signalId => ({
        signalId,
        status,
      }));
    }

    const emitted = new Set<string>();
    const statusCounts = new Map<Hcs25SignalStatus, number>();
    for (const raw of adapterResults) {
      if (!isValidSignalId(raw.signalId)) {
        continue;
      }
      const result = applyFreshness(raw, options.staleAfterMs, now);
      emitted.add(result.signalId);
      statusCounts.set(
        result.status,
        (statusCounts.get(result.status) ?? 0) + 1,
      );
      snapshot[result.signalId] = toSignal(result, now);
      if (result.fields) {
        collectedFields.push(...result.fields);
      }
    }

    results.push({
      adapterId: adapter.id,
      applicable: true,
      signalIds: [...emitted],
      status: runStatus ?? summarizeStatuses(statusCounts),
      error: runError,
    });
  }

  if (options.staleAfterMs !== undefined) {
    for (const [signalId, signal] of Object.entries(snapshot)) {
      if (
        signal.status === 'ok' &&
        isStale(signal.fetchedAt, options.staleAfterMs, now)
      ) {
        snapshot[signalId] = { ...signal, status: 'stale' };
      }
    }
  }

  return {
    subject: applyCollectedFields(subject, collectedFields),
    snapshot,
    results,
  };
}
