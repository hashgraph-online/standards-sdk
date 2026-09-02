import { describe, expect, test } from '@jest/globals';

import type { Hcs25Subject } from '../../src/hcs-25/types';
import { computeTrustScore } from '../../src/hcs-25/scoring';
import {
  createOssPopularityAdapter,
  createSimpleMathAdapter,
  createSimpleScienceAdapter,
} from '../../src/hcs-25/adapters';

type AdapterDefinition = Parameters<
  typeof computeTrustScore
>[0]['config']['adapters'][number];

function scoreOne(
  adapter: AdapterDefinition,
  subject: Hcs25Subject,
): ReturnType<typeof computeTrustScore> {
  return computeTrustScore({
    subject,
    snapshot: {},
    config: { version: 1, adapters: [adapter] },
  });
}

describe('HCS-25 OSS popularity adapter', () => {
  const ossSubject: Hcs25Subject = {
    id: 'agent:mcp',
    metadata: {
      additional: {
        githubRepo: 'octocat/hello',
        githubStars: 1200,
        npmDownloads30d: 4500,
      },
    },
  };

  test('log-scales stars and downloads into components', () => {
    const result = scoreOne(createOssPopularityAdapter(), ossSubject);

    expect(result.trustScores['oss-popularity.githubStars']).toBeCloseTo(
      (100 * Math.log1p(1200)) / Math.log1p(5000),
      2,
    );
    expect(result.trustScores['oss-popularity.downloads']).toBeCloseTo(
      (100 * Math.log1p(4500)) / Math.log1p(100000),
      2,
    );
  });

  test('blends components with the default 0.6/0.4 weighting', () => {
    const result = scoreOne(createOssPopularityAdapter(), ossSubject);
    const adapterScore = result.breakdown.adapters[0];

    expect(adapterScore?.total).toBeCloseTo(
      0.6 * (result.trustScores['oss-popularity.githubStars'] ?? 0) +
        0.4 * (result.trustScores['oss-popularity.downloads'] ?? 0),
      2,
    );
  });

  test('prefers npm downloads and falls back through pypi and legacy counts', () => {
    const npm = scoreOne(createOssPopularityAdapter(), ossSubject);
    const pypiOnly = scoreOne(createOssPopularityAdapter(), {
      id: 'agent:mcp',
      metadata: {
        additional: { githubStars: 0, pypiDownloads30d: 900 },
      },
    });
    const legacyOnly = scoreOne(createOssPopularityAdapter(), {
      id: 'agent:mcp',
      metadata: {
        additional: { githubStars: 0, packageDownloadCount: 900 },
      },
    });

    expect(pypiOnly.trustScores['oss-popularity.downloads']).toBeCloseTo(
      (100 * Math.log1p(900)) / Math.log1p(100000),
      2,
    );
    expect(legacyOnly.trustScores['oss-popularity.downloads']).toBeCloseTo(
      pypiOnly.trustScores['oss-popularity.downloads'] ?? 0,
      2,
    );
    expect(npm.trustScores['oss-popularity.downloads']).toBeCloseTo(
      (100 * Math.log1p(4500)) / Math.log1p(100000),
      2,
    );
  });

  test('defaults to scoped contribution at weight 0.7 and gates on artifacts', () => {
    const adapter = createOssPopularityAdapter();
    expect(adapter.contributionMode).toBe('scoped');
    expect(adapter.weight).toBe(0.7);

    const result = scoreOne(adapter, { id: 'agent:plain', metadata: {} });
    expect(result.breakdown.adapters[0]?.applicable).toBe(false);
  });
});

describe('HCS-25 simple eval adapters', () => {
  function evalSubject(fields: Record<string, unknown>): Hcs25Subject {
    return { id: 'agent:a', metadata: { additional: fields } };
  }

  test('simple-math scores stored eval results with status mapping', () => {
    const correct = scoreOne(
      createSimpleMathAdapter(),
      evalSubject({ a2aSimpleMathScore: 100, a2aSimpleMathStatus: 'correct' }),
    );
    expect(correct.trustScores['simple-math.score']).toBe(100);

    const wrong = scoreOne(
      createSimpleMathAdapter(),
      evalSubject({ a2aSimpleMathScore: 0, a2aSimpleMathStatus: 'wrong' }),
    );
    expect(wrong.trustScores['simple-math.score']).toBe(0);

    const timedOut = scoreOne(
      createSimpleMathAdapter(),
      evalSubject({ a2aSimpleMathStatus: 'timeout' }),
    );
    expect(timedOut.trustScores['simple-math.score']).toBe(0);
    expect(timedOut.breakdown.adapters[0]?.components[0]?.status).toBe(
      'timeout',
    );
  });

  test('simple-math falls back to nanda fields and penalizes missingness', () => {
    const nanda = scoreOne(
      createSimpleMathAdapter(),
      evalSubject({
        nandaSimpleMathScore: 100,
        nandaSimpleMathStatus: 'correct',
      }),
    );
    expect(nanda.trustScores['simple-math.score']).toBe(100);

    const adapter = createSimpleMathAdapter();
    expect(adapter.contributionMode).toBe('scoped');
    expect(adapter.weight).toBe(0.5);

    const empty = scoreOne(adapter, { id: 'agent:a', metadata: {} });
    expect(empty.trustScores['simple-math.score']).toBe(0);
    expect(empty.breakdown.adapters[0]?.inDenominator).toBe(true);
  });

  test('simple-science reads the shared science fields', () => {
    const correct = scoreOne(
      createSimpleScienceAdapter(),
      evalSubject({
        a2aSimpleScienceScore: 100,
        a2aSimpleScienceStatus: 'correct',
      }),
    );
    expect(correct.trustScores['simple-science.score']).toBe(100);

    const adapter = createSimpleScienceAdapter();
    expect(adapter.contributionMode).toBe('scoped');
    expect(adapter.weight).toBe(0.5);
  });

  test('clamps stored eval scores into range', () => {
    const overflowing = scoreOne(
      createSimpleMathAdapter(),
      evalSubject({ a2aSimpleMathScore: 250, a2aSimpleMathStatus: 'correct' }),
    );
    expect(overflowing.trustScores['simple-math.score']).toBe(100);
  });
});
