import { z } from 'zod';

import type { Hcs25SignalStatus } from '../types';

/**
 * Status tokens emitted by simple eval runners, per the HCS-25 simple-evals
 * methodology.
 */
export type Hcs25SimpleEvalStatus =
  | 'correct'
  | 'wrong'
  | 'unparseable'
  | 'timeout'
  | 'missing'
  | 'empty'
  | 'skipped'
  | 'upstream-error'
  | 'error';

/**
 * A graded simple-eval outcome. Scores are binary per the methodology.
 */
export interface Hcs25SimpleEvalGrade {
  status: Hcs25SimpleEvalStatus;
  score: number;
}

const SIMPLE_EVAL_GRADE_CORRECT: Hcs25SimpleEvalGrade = {
  status: 'correct',
  score: 100,
};

const SIMPLE_EVAL_GRADE_WRONG: Hcs25SimpleEvalGrade = {
  status: 'wrong',
  score: 0,
};

const SIMPLE_EVAL_GRADE_UNPARSEABLE: Hcs25SimpleEvalGrade = {
  status: 'unparseable',
  score: 0,
};

/**
 * Maps a simple-eval status token onto an HCS-25 signal status code.
 * Substantive outcomes stay `ok` because the stored score carries the value;
 * skipped runs are treated as missing.
 */
export function mapSimpleEvalStatus(token: string | null): Hcs25SignalStatus {
  switch (token) {
    case 'timeout':
      return 'timeout';
    case 'missing':
    case 'skipped':
      return 'missing';
    case 'upstream-error':
    case 'error':
      return 'error';
    default:
      return 'ok';
  }
}

/**
 * Grades a SimpleMath response by extracting the first numeric token and
 * comparing it against the expected answer.
 */
export function gradeSimpleMathResponse(
  response: string,
  expected: number,
): Hcs25SimpleEvalGrade {
  const match = response.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return SIMPLE_EVAL_GRADE_UNPARSEABLE;
  }

  const value = Number.parseFloat(match[0]);
  return value === expected
    ? SIMPLE_EVAL_GRADE_CORRECT
    : SIMPLE_EVAL_GRADE_WRONG;
}

const SCIENCE_CHOICE_LETTERS = ['A', 'B', 'C', 'D'] as const;

/**
 * Grades a SimpleScience response by extracting a standalone `A|B|C|D`
 * token, falling back to full option-text matching when options are
 * provided.
 */
export function gradeSimpleScienceResponse(
  response: string,
  correctChoice: (typeof SCIENCE_CHOICE_LETTERS)[number],
  options?: readonly string[],
): Hcs25SimpleEvalGrade {
  const letterMatch = response.match(/\b([A-Da-d])\b/);
  if (letterMatch) {
    return letterMatch[1].toUpperCase() === correctChoice
      ? SIMPLE_EVAL_GRADE_CORRECT
      : SIMPLE_EVAL_GRADE_WRONG;
  }

  if (options) {
    const normalized = response.toLowerCase();
    const matchedIndex = options.findIndex(
      option => option.length > 0 && normalized.includes(option.toLowerCase()),
    );
    if (matchedIndex >= 0) {
      return SCIENCE_CHOICE_LETTERS[matchedIndex] === correctChoice
        ? SIMPLE_EVAL_GRADE_CORRECT
        : SIMPLE_EVAL_GRADE_WRONG;
    }
  }

  return SIMPLE_EVAL_GRADE_UNPARSEABLE;
}

/**
 * A generated SimpleMath question with its stable identifier and expected
 * answer.
 */
export interface Hcs25SimpleMathQuestion {
  questionId: string;
  prompt: string;
  expected: number;
}

function randomInt(
  rng: () => number,
  minInclusive: number,
  maxInclusive: number,
): number {
  const span = maxInclusive - minInclusive + 1;
  return minInclusive + Math.floor(rng() * span);
}

/**
 * Generates a random SimpleMath question. Operand ranges follow the
 * methodology: addition uses two integers in 10–100, subtraction subtracts
 * 1–50 from 10–100, and multiplication uses small integers in 2–12. Pass a
 * seeded rng for deterministic generation.
 */
export function generateSimpleMathQuestion(
  rng: () => number = Math.random,
): Hcs25SimpleMathQuestion {
  const operations = ['add', 'sub', 'mul'] as const;
  const operation =
    operations[Math.floor(rng() * operations.length) % operations.length];

  let left: number;
  let right: number;
  let expected: number;
  let expression: string;

  if (operation === 'add') {
    left = randomInt(rng, 10, 100);
    right = randomInt(rng, 10, 100);
    expected = left + right;
    expression = `${left}+${right}`;
  } else if (operation === 'sub') {
    left = randomInt(rng, 10, 100);
    right = randomInt(rng, 1, 50);
    expected = left - right;
    expression = `${left}-${right}`;
  } else {
    left = randomInt(rng, 2, 12);
    right = randomInt(rng, 2, 12);
    expected = left * right;
    expression = `${left}x${right}`;
  }

  const operator = operation === 'add' ? '+' : operation === 'sub' ? '−' : '×';

  return {
    questionId: `math:${operation}:${expression}`,
    prompt: `Answer with just the number.\n\nWhat is ${left} ${operator} ${right}?`,
    expected,
  };
}

/**
 * A curated SimpleScience multiple-choice question with exactly four
 * options and one unambiguous correct choice.
 */
export interface Hcs25SimpleScienceQuestion {
  questionId: string;
  prompt: string;
  options: readonly [string, string, string, string];
  correctChoice: (typeof SCIENCE_CHOICE_LETTERS)[number];
}

function sciencePrompt(stem: string, options: readonly string[]): string {
  const lines = options.map(
    (option, index) => `${SCIENCE_CHOICE_LETTERS[index]}) ${option}`,
  );
  return `Answer with just A, B, C, or D.\n\n${stem}\n${lines.join('\n')}`;
}

function scienceQuestion(
  questionId: string,
  stem: string,
  options: readonly string[],
  correctIndex: number,
): Hcs25SimpleScienceQuestion {
  return {
    questionId,
    prompt: sciencePrompt(stem, options),
    options: [options[0], options[1], options[2], options[3]],
    correctChoice: SCIENCE_CHOICE_LETTERS[correctIndex],
  };
}

/**
 * A small curated bank of basic science facts spanning chemistry, biology,
 * physics, and earth science, per the methodology.
 */
export const SIMPLE_SCIENCE_QUESTION_BANK: readonly Hcs25SimpleScienceQuestion[] =
  [
    scienceQuestion(
      'science:photosynthesis-gas',
      'Which gas do plants primarily absorb during photosynthesis?',
      ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Helium'],
      1,
    ),
    scienceQuestion(
      'science:water-formula',
      'What is the chemical formula for water?',
      ['HO', 'H2O2', 'H2O', 'O2H'],
      2,
    ),
    scienceQuestion(
      'science:blood-pump',
      'Which organ pumps blood through the human body?',
      ['Liver', 'Heart', 'Lungs', 'Kidneys'],
      1,
    ),
    scienceQuestion(
      'science:vacuum-speed',
      'Which of these travels fastest in a vacuum?',
      ['Sound', 'Water waves', 'Wind', 'Light'],
      3,
    ),
    scienceQuestion(
      'science:red-planet',
      'Which planet is known as the Red Planet?',
      ['Mars', 'Venus', 'Jupiter', 'Mercury'],
      0,
    ),
    scienceQuestion(
      'science:boiling-point',
      'At what temperature does water boil at sea level, in Celsius?',
      ['50°C', '100°C', '150°C', '200°C'],
      1,
    ),
    scienceQuestion(
      'science:photosynthesis-energy',
      'What is the primary source of energy for photosynthesis?',
      ['Sunlight', 'Moonlight', 'Lightning', 'Starlight'],
      0,
    ),
    scienceQuestion(
      'science:atom-charge',
      'What is the electrical charge of a proton?',
      ['Negative', 'Neutral', 'Positive', 'Variable'],
      2,
    ),
  ];

/**
 * Samples a random science question from the curated bank. Pass a seeded rng
 * for deterministic sampling.
 */
export function sampleSimpleScienceQuestion(
  rng: () => number = Math.random,
): Hcs25SimpleScienceQuestion {
  const index =
    Math.floor(rng() * SIMPLE_SCIENCE_QUESTION_BANK.length) %
    SIMPLE_SCIENCE_QUESTION_BANK.length;
  return SIMPLE_SCIENCE_QUESTION_BANK[index];
}

/**
 * Stored-field schema for the shared A2A/NANDA simple-eval signal family.
 * Field names follow the `a2aSimple*` / `nandaSimple*` conventions.
 */
export const hcs25SimpleEvalFieldsSchema = z
  .object({
    a2aSimpleMathScore: z.number().nullish(),
    a2aSimpleMathStatus: z.string().nullish(),
    a2aSimpleMathQuestionId: z.string().nullish(),
    a2aSimpleMathSessionId: z.string().nullish(),
    a2aSimpleMathResponse: z.string().nullish(),
    a2aSimpleMathError: z.string().nullish(),
    a2aSimpleMathUpdatedAt: z.string().nullish(),
    a2aSimpleScienceScore: z.number().nullish(),
    a2aSimpleScienceStatus: z.string().nullish(),
    a2aSimpleScienceQuestionId: z.string().nullish(),
    a2aSimpleScienceSessionId: z.string().nullish(),
    a2aSimpleScienceResponse: z.string().nullish(),
    a2aSimpleScienceError: z.string().nullish(),
    a2aSimpleScienceUpdatedAt: z.string().nullish(),
    nandaSimpleMathScore: z.number().nullish(),
    nandaSimpleMathStatus: z.string().nullish(),
    nandaSimpleMathQuestionId: z.string().nullish(),
    nandaSimpleMathResponse: z.string().nullish(),
    nandaSimpleMathError: z.string().nullish(),
    nandaSimpleMathUpdatedAt: z.string().nullish(),
    nandaSimpleScienceScore: z.number().nullish(),
    nandaSimpleScienceStatus: z.string().nullish(),
    nandaSimpleScienceQuestionId: z.string().nullish(),
    nandaSimpleScienceResponse: z.string().nullish(),
    nandaSimpleScienceError: z.string().nullish(),
    nandaSimpleScienceUpdatedAt: z.string().nullish(),
  })
  .passthrough();
