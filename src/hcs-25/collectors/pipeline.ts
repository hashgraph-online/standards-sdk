import { computeTrustScore } from '../scoring';
import type {
  Hcs25ScoringConfigInput,
  Hcs25Subject,
  Hcs25TrustScoreRecord,
} from '../types';
import { collectHcs25Signals } from './runner';
import type {
  Hcs25CollectSignalsOptions,
  Hcs25SignalCollection,
} from './types';

export interface Hcs25CollectAndScoreOptions
  extends Hcs25CollectSignalsOptions {
  /** Scoring configuration (adapters, weights, modes) per HCS-25. */
  config: Hcs25ScoringConfigInput;
}

export interface Hcs25CollectAndScoreResult {
  /** The collection outcome: enriched subject + signal snapshot. */
  collection: Hcs25SignalCollection;
  /** The computed trust score record for the enriched subject. */
  record: Hcs25TrustScoreRecord;
}

/**
 * End-to-end HCS-25 pipeline: collects trust signals via signal adapters,
 * merges the stored fields onto the subject, then computes the composite AI
 * Trust Score with the provided scoring configuration.
 */
export async function collectAndScoreTrustScore(
  subject: Hcs25Subject,
  options: Hcs25CollectAndScoreOptions,
): Promise<Hcs25CollectAndScoreResult> {
  const { config, ...collectOptions } = options;
  const collection = await collectHcs25Signals(subject, collectOptions);
  const record = computeTrustScore({
    subject: collection.subject,
    snapshot: collection.snapshot,
    config,
    now: collectOptions.now,
  });
  return { collection, record };
}
