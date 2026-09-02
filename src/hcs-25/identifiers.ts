/**
 * HCS-25 identifier namespacing rules.
 *
 * @see https://github.com/hiero-ledger/hiero-consensus-specifications/blob/main/docs/standards/hcs-25.md
 */

/**
 * Adapter identifier pattern: hyphen-separated segments, where each segment
 * starts with a lowercase letter and continues with lowercase letters or
 * digits (`segment "-" segment`).
 */
const HCS25_ADAPTER_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/;

/**
 * Signal identifier pattern: dot-separated segments (at least two), where each
 * segment starts with a lowercase letter and continues with lowercase letters,
 * digits, underscores, or hyphens.
 */
const HCS25_SIGNAL_ID_PATTERN = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/;

/**
 * Component key pattern: ASCII, dot-separated, no whitespace. Lowercase is
 * recommended but uppercase segments are accepted.
 */
const HCS25_COMPONENT_KEY_PATTERN = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/i;

/**
 * Component name pattern: one or more dot-separated key segments, so names
 * like `jobs.successRate` produce namespaced component keys such as
 * `acp.jobs.successRate`.
 */
const HCS25_COMPONENT_NAME_PATTERN = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/i;

/**
 * Checks whether an adapter identifier satisfies HCS-25 namespacing.
 */
export function isValidAdapterId(adapterId: string): boolean {
  return HCS25_ADAPTER_ID_PATTERN.test(adapterId);
}

/**
 * Checks whether a signal identifier satisfies HCS-25 namespacing.
 */
export function isValidSignalId(signalId: string): boolean {
  return HCS25_SIGNAL_ID_PATTERN.test(signalId);
}

/**
 * Checks whether a component key satisfies HCS-25 key rules (ASCII, no
 * whitespace, dot-separated namespaces).
 */
export function isValidComponentKey(componentKey: string): boolean {
  return HCS25_COMPONENT_KEY_PATTERN.test(componentKey);
}

/**
 * Checks whether a component name forms valid key segments when prefixed
 * with an adapter identifier.
 */
export function isValidComponentName(componentName: string): boolean {
  return HCS25_COMPONENT_NAME_PATTERN.test(componentName);
}
