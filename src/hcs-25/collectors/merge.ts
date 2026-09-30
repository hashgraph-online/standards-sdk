import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { isJsonObject } from '../signals';
import type { Hcs25CollectedFields } from './types';

/**
 * Immutably merges collected fields into a subject's metadata, honoring the
 * storage scopes documented by the HCS-25 signal catalog: `root` writes
 * `metadata.<key>`, `metrics` writes `metadata.metrics.<key>`, `additional`
 * writes `metadata.additional.<key>`, and any other scope string merges into
 * the `metadata.<scope>` record (e.g. `outputVerificationSummary`).
 */
export function applyCollectedFields(
  subject: Hcs25Subject,
  fieldsList: readonly Hcs25CollectedFields[],
): Hcs25Subject {
  if (fieldsList.length === 0) {
    return subject;
  }

  const metadata: Record<string, Hcs25JsonValue> = {
    ...(subject.metadata ?? {}),
  };

  for (const fields of fieldsList) {
    if (fields.scope === 'root') {
      for (const [key, value] of Object.entries(fields.values)) {
        metadata[key] = value;
      }
      continue;
    }

    const scopeKey = fields.scope;
    const existing = metadata[scopeKey];
    const record: Record<string, Hcs25JsonValue> = isJsonObject(existing)
      ? { ...existing }
      : {};
    for (const [key, value] of Object.entries(fields.values)) {
      record[key] = value;
    }
    metadata[scopeKey] = record;
  }

  return { ...subject, metadata };
}
