import { describe, expect, test } from '@jest/globals';

import {
  SIMPLE_SCIENCE_QUESTION_BANK,
  generateSimpleMathQuestion,
  gradeSimpleMathResponse,
  gradeSimpleScienceResponse,
  mapSimpleEvalStatus,
  sampleSimpleScienceQuestion,
} from '../../src/hcs-25/signals/simple-evals';

function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe('HCS-25 simple eval grading', () => {
  test('grades math responses by first numeric token', () => {
    expect(gradeSimpleMathResponse('95', 95)).toEqual({
      status: 'correct',
      score: 100,
    });
    expect(gradeSimpleMathResponse('The answer is 95.', 95)).toEqual({
      status: 'correct',
      score: 100,
    });
    expect(gradeSimpleMathResponse('94', 95)).toEqual({
      status: 'wrong',
      score: 0,
    });
    expect(gradeSimpleMathResponse('no numbers here', 95)).toEqual({
      status: 'unparseable',
      score: 0,
    });
  });

  test('grades science responses by standalone letter with option fallback', () => {
    expect(gradeSimpleScienceResponse('B', 'B')).toEqual({
      status: 'correct',
      score: 100,
    });
    expect(gradeSimpleScienceResponse('I choose C', 'C')).toEqual({
      status: 'correct',
      score: 100,
    });
    expect(gradeSimpleScienceResponse('A', 'B')).toEqual({
      status: 'wrong',
      score: 0,
    });
    expect(
      gradeSimpleScienceResponse('Carbon dioxide', 'B', [
        'Oxygen',
        'Carbon dioxide',
        'Nitrogen',
        'Helium',
      ]),
    ).toEqual({ status: 'correct', score: 100 });
    expect(gradeSimpleScienceResponse('maybe helium?', 'B')).toEqual({
      status: 'unparseable',
      score: 0,
    });
  });

  test('maps eval status tokens onto HCS-25 signal status codes', () => {
    expect(mapSimpleEvalStatus('correct')).toBe('ok');
    expect(mapSimpleEvalStatus('wrong')).toBe('ok');
    expect(mapSimpleEvalStatus('unparseable')).toBe('ok');
    expect(mapSimpleEvalStatus('empty')).toBe('ok');
    expect(mapSimpleEvalStatus('timeout')).toBe('timeout');
    expect(mapSimpleEvalStatus('missing')).toBe('missing');
    expect(mapSimpleEvalStatus('skipped')).toBe('missing');
    expect(mapSimpleEvalStatus('upstream-error')).toBe('error');
    expect(mapSimpleEvalStatus('error')).toBe('error');
  });
});

describe('HCS-25 simple eval question generation', () => {
  test('generates deterministic arithmetic questions from a seeded rng', () => {
    const first = generateSimpleMathQuestion(seededRng(7));
    const second = generateSimpleMathQuestion(seededRng(7));

    expect(second).toEqual(first);
    expect(first.prompt).toContain('Answer with just the number.');
    expect(first.questionId).toMatch(/^math:(add|sub|mul):/);
    expect(first.expected).toBeGreaterThan(0);
  });

  test('records operation and operands in the question id', () => {
    const question = generateSimpleMathQuestion(() => 0);
    expect(question.questionId).toMatch(/^math:(add|sub|mul):-?\d+/);
  });

  test('exposes a curated science bank with unique ids and four options', () => {
    expect(SIMPLE_SCIENCE_QUESTION_BANK.length).toBeGreaterThanOrEqual(5);

    const ids = new Set(
      SIMPLE_SCIENCE_QUESTION_BANK.map(question => question.questionId),
    );
    expect(ids.size).toBe(SIMPLE_SCIENCE_QUESTION_BANK.length);

    for (const question of SIMPLE_SCIENCE_QUESTION_BANK) {
      expect(question.options).toHaveLength(4);
      expect(question.prompt).toContain('Answer with just A, B, C, or D.');
      expect(['A', 'B', 'C', 'D']).toContain(question.correctChoice);
    }
  });

  test('samples science questions deterministically from a seeded rng', () => {
    const first = sampleSimpleScienceQuestion(seededRng(11));
    const second = sampleSimpleScienceQuestion(seededRng(11));
    expect(second).toEqual(first);
  });
});
