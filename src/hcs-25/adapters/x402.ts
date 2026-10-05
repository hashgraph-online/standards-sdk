import type {
  Hcs25AdapterDefinition,
  Hcs25NormalizedValue,
  Hcs25Subject,
} from '../types';
import { readMetadataRecord, readNumber, readString } from '../signals';
import { logScale } from './normalization';

/**
 * Options for the x402 usage adapter.
 */
export interface Hcs25X402AdapterOptions {
  /** 7-day USD volume cap for log scaling. Default 10000. */
  volumeCapUsd?: number;
  /** 7-day trade count cap for log scaling. Default 500. */
  tradesCap?: number;
}

const MISSING: Hcs25NormalizedValue = { value: 0, status: 'missing' };

/**
 * Reads `x402UsageStatus` and wraps a computed value: `stale` keeps the
 * value with a stale status (the scoring layer applies the stale
 * multiplier); `timeout`/`error` surface as those statuses when no value
 * exists.
 */
function x402Status(
  subject: Hcs25Subject,
  value: number | null,
  compute: () => number,
): Hcs25NormalizedValue {
  const status =
    subject.metadata !== undefined
      ? readString(subject.metadata, 'x402UsageStatus')
      : null;
  if (value === null) {
    if (status === 'timeout' || status === 'error') {
      return { value: 0, status };
    }
    return MISSING;
  }
  return { value: compute(), status: status === 'stale' ? 'stale' : 'ok' };
}

/**
 * Creates the `x402` adapter: converts onchain x402 usage (USD volume plus
 * trade counts) into bounded trust components using log scaling. It only
 * applies to subjects carrying x402 payment configuration or a stored usage
 * summary.
 */
export function createX402Adapter(
  options: Hcs25X402AdapterOptions = {},
): Hcs25AdapterDefinition {
  const volumeCapUsd = options.volumeCapUsd ?? 10000;
  const tradesCap = options.tradesCap ?? 500;

  const hasX402Configuration = (subject: Hcs25Subject): boolean =>
    readMetadataRecord(subject, 'x402UsageSummary') !== undefined ||
    (subject.metadata !== undefined && subject.metadata.payTo !== undefined);

  return {
    id: 'x402',
    weight: 1,
    contributionMode: 'scoped',
    appliesTo: hasX402Configuration,
    components: [
      {
        name: 'volume7d',
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const summary = readMetadataRecord(subject, 'x402UsageSummary');
          const volume = summary ? readNumber(summary, 'volume7dUsd') : null;
          return x402Status(subject, volume, () =>
            logScale(volume ?? 0, volumeCapUsd),
          );
        },
      },
      {
        name: 'trades7d',
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const summary = readMetadataRecord(subject, 'x402UsageSummary');
          if (!summary) {
            return x402Status(subject, null, () => 0);
          }
          const inbound = readNumber(summary, 'inboundTrades7d') ?? 0;
          const outbound = readNumber(summary, 'outboundTrades7d') ?? 0;
          return x402Status(subject, inbound + outbound, () =>
            logScale(inbound + outbound, tradesCap),
          );
        },
      },
    ],
  };
}
