import type { Hcs25JsonValue, Hcs25Subject } from '../types';

/**
 * A JSON object value within subject metadata.
 */
export type Hcs25JsonObject = { [key: string]: Hcs25JsonValue };

/**
 * Narrows a JSON value to a JSON object (excluding arrays and nulls).
 */
export function isJsonObject(
  value: Hcs25JsonValue | undefined,
): value is Hcs25JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a nested JSON object from subject metadata, returning undefined when
 * the key is absent or not an object.
 */
export function readMetadataRecord(
  subject: Hcs25Subject,
  key: string,
): Hcs25JsonObject | undefined {
  const metadata = subject.metadata;
  if (!metadata) {
    return undefined;
  }
  const value = metadata[key];
  return isJsonObject(value) ? value : undefined;
}

/**
 * Reads the `metadata.additional` object used by many catalog signals,
 * defaulting to an empty object.
 */
export function readSubjectAdditional(subject: Hcs25Subject): Hcs25JsonObject {
  return readMetadataRecord(subject, 'additional') ?? {};
}

/**
 * Reads the `metadata.metrics` object used by marketplace signals,
 * defaulting to an empty object.
 */
export function readSubjectMetrics(subject: Hcs25Subject): Hcs25JsonObject {
  return readMetadataRecord(subject, 'metrics') ?? {};
}

/**
 * Reads a finite number from a JSON object, returning null when absent or
 * non-numeric.
 */
export function readNumber(
  record: Hcs25JsonObject,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Reads a non-empty string from a JSON object, returning null when absent.
 */
export function readString(
  record: Hcs25JsonObject,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Reads a boolean from a JSON object, returning null when absent.
 */
export function readBoolean(
  record: Hcs25JsonObject,
  key: string,
): boolean | null {
  const value = record[key];
  return typeof value === 'boolean' ? value : null;
}
