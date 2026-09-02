import { clampScore } from '../scoring';
import type {
  Hcs25AdapterDefinition,
  Hcs25NormalizedValue,
  Hcs25Subject,
} from '../types';
import {
  mapSimpleEvalStatus,
  readNumber,
  readString,
  readSubjectAdditional,
  type Hcs25JsonObject,
} from '../signals';

interface SimpleEvalRead {
  score: number | null;
  statusToken: string | null;
}

function readSimpleEval(
  subject: Hcs25Subject,
  family: 'Math' | 'Science',
): SimpleEvalRead {
  const additional: Hcs25JsonObject = readSubjectAdditional(subject);
  return {
    score:
      readNumber(additional, `a2aSimple${family}Score`) ??
      readNumber(additional, `nandaSimple${family}Score`),
    statusToken:
      readString(additional, `a2aSimple${family}Status`) ??
      readString(additional, `nandaSimple${family}Status`),
  };
}

function normalizeSimpleEval(
  subject: Hcs25Subject,
  family: 'Math' | 'Science',
): Hcs25NormalizedValue {
  const { score, statusToken } = readSimpleEval(subject, family);
  if (statusToken === null && score === null) {
    return { value: 0, status: 'missing' };
  }

  const status = mapSimpleEvalStatus(statusToken);
  if (status !== 'ok') {
    return { value: 0, status };
  }

  return { value: clampScore(score ?? 0), status: 'ok' };
}

/**
 * Creates the `simple-math` adapter: scores baseline arithmetic correctness.
 * Missing, timed-out, or errored evals count as zero so sparse coverage
 * cannot inflate the composite by leaving the denominator.
 */
export function createSimpleMathAdapter(): Hcs25AdapterDefinition {
  return {
    id: 'simple-math',
    weight: 0.5,
    contributionMode: 'scoped',
    defaultComponentKey: 'simple-math.score',
    components: [
      {
        name: 'score',
        normalize: ({ subject }) => normalizeSimpleEval(subject, 'Math'),
      },
    ],
  };
}

/**
 * Creates the `simple-science` adapter: scores baseline multiple-choice
 * science correctness with the same missing-data policy as
 * `simple-math`.
 */
export function createSimpleScienceAdapter(): Hcs25AdapterDefinition {
  return {
    id: 'simple-science',
    weight: 0.5,
    contributionMode: 'scoped',
    defaultComponentKey: 'simple-science.score',
    components: [
      {
        name: 'score',
        normalize: ({ subject }) => normalizeSimpleEval(subject, 'Science'),
      },
    ],
  };
}
