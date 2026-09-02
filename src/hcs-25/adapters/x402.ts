import type {
  Hcs25AdapterDefinition,
  Hcs25NormalizedValue,
  Hcs25Subject,
} from '../types';
import { readMetadataRecord, readNumber } from '../signals';
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
          return volume === null
            ? MISSING
            : { value: logScale(volume, volumeCapUsd), status: 'ok' };
        },
      },
      {
        name: 'trades7d',
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const summary = readMetadataRecord(subject, 'x402UsageSummary');
          if (!summary) {
            return MISSING;
          }
          const inbound = readNumber(summary, 'inboundTrades7d') ?? 0;
          const outbound = readNumber(summary, 'outboundTrades7d') ?? 0;
          return {
            value: logScale(inbound + outbound, tradesCap),
            status: 'ok',
          };
        },
      },
    ],
  };
}
