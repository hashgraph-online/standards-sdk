import { describe, expect, test } from '@jest/globals';

import { computeTrustScore } from '../../src/hcs-25/scoring';
import {
  createAvailabilityAdapter,
  createConnectivityAdapter,
  createEthosAdapter,
  createSimpleMathAdapter,
  createX402Adapter,
} from '../../src/hcs-25/adapters';
import { SIMPLE_SCIENCE_QUESTION_BANK } from '../../src/hcs-25/signals/simple-evals';
import type {
  Hcs25ComponentDefinition,
  Hcs25Subject,
} from '../../src/hcs-25/types';
import {
  applyCollectedFields,
  collectAndScoreTrustScore,
  collectHcs25Signals,
  createAvailabilitySignalAdapter,
  createErc8004SignalAdapter,
  createEthosSignalAdapter,
  createHcs25SignalAdapters,
  createHuggingFaceSignalAdapter,
  createOnchainErc8004FeedbackSource,
  createSimpleEvalsSignalAdapter,
  createX402SignalAdapter,
  Hcs25CollectorHttpError,
  isTimeoutError,
  requestJson,
  type Hcs25Fetch,
  type Hcs25SignalAdapter,
} from '../../src/hcs-25/collectors';

const okResponse = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => data,
});

const fetchReturning = (data: unknown): Hcs25Fetch => {
  return async () => okResponse(data);
};

const fetchWithStatus = (status: number): Hcs25Fetch => {
  return async () => ({
    ok: false,
    status,
    json: async () => ({}),
  });
};

const baseSubject: Hcs25Subject = {
  id: 'agent:test',
  registry: 'hashgraph-online',
  protocol: 'a2a',
};

describe('applyCollectedFields', () => {
  test('merges root/metrics/additional/summary scopes and preserves existing metadata', () => {
    const subject: Hcs25Subject = {
      id: 's1',
      metadata: {
        keep: 'me',
        metrics: { existing: 1 },
        additional: { other: 'x' },
      },
    };
    const merged = applyCollectedFields(subject, [
      { scope: 'root', values: { availabilityScore: 1 } },
      { scope: 'metrics', values: { isOnline: true } },
      { scope: 'additional', values: { ethosScore: 1500 } },
      { scope: 'x402UsageSummary', values: { volume7dUsd: 5 } },
    ]);
    const metadata = merged.metadata as Record<string, unknown>;
    expect(metadata.keep).toBe('me');
    expect(metadata.availabilityScore).toBe(1);
    expect(metadata.metrics).toEqual({ existing: 1, isOnline: true });
    expect(metadata.additional).toEqual({ other: 'x', ethosScore: 1500 });
    expect(metadata.x402UsageSummary).toEqual({ volume7dUsd: 5 });
    // original subject untouched
    expect(
      (subject.metadata!.metrics as Record<string, unknown>).isOnline,
    ).toBe(undefined);
  });
});

describe('requestJson', () => {
  test('returns parsed JSON on 2xx', async () => {
    const data = await requestJson<{ hello: string }>('https://example.com/x', {
      fetch: fetchReturning({ hello: 'world' }),
    });
    expect(data.hello).toBe('world');
  });

  test('throws Hcs25CollectorHttpError on non-2xx', async () => {
    await expect(
      requestJson('https://example.com/x', { fetch: fetchWithStatus(503) }),
    ).rejects.toBeInstanceOf(Hcs25CollectorHttpError);
  });

  test('times out when fetch never resolves', async () => {
    const never: Hcs25Fetch = () => new Promise(() => {});
    await expect(
      requestJson('https://example.com/x', { fetch: never, timeoutMs: 5 }),
    ).rejects.toBeInstanceOf(Error);
  });
});

describe('collectHcs25Signals runner', () => {
  const recordingAdapter = (
    results: Parameters<Hcs25SignalAdapter['collect']>[1] extends never
      ? never
      : Awaited<ReturnType<Hcs25SignalAdapter['collect']>>,
    extra: Partial<Hcs25SignalAdapter> = {},
  ): Hcs25SignalAdapter => ({
    id: 'test-adapter',
    produces: ['test.metric'],
    collect: async () => results,
    ...extra,
  });

  test('merges collected fields and records snapshot + report', async () => {
    const adapter = recordingAdapter([
      {
        signalId: 'test.metric',
        status: 'ok',
        value: 42,
        fields: [{ scope: 'root', values: { someField: 7 } }],
        provenance: { source: 'test', fetchedAt: '2026-01-01T00:00:00Z' },
      },
    ]);
    const out = await collectHcs25Signals(baseSubject, {
      adapters: [adapter],
      fetch: fetchReturning({}),
      now: new Date('2026-01-01T00:00:01Z'),
    });
    expect(out.snapshot['test.metric'].status).toBe('ok');
    expect(out.snapshot['test.metric'].value).toBe(42);
    expect(out.subject.metadata?.someField).toBe(7);
    expect(out.results[0].applicable).toBe(true);
    expect(out.results[0].status).toBe('ok');
  });

  test('skips inapplicable adapters', async () => {
    const adapter = recordingAdapter([], {
      includeRegistries: ['other-registry'],
    });
    const out = await collectHcs25Signals(baseSubject, {
      adapters: [adapter],
      fetch: fetchReturning({}),
    });
    expect(out.results[0].applicable).toBe(false);
    expect(out.snapshot['test.metric']).toBeUndefined();
  });

  test('emits missing placeholders when collect returns []', async () => {
    const adapter = recordingAdapter([], {
      produces: ['test.a', 'test.b'],
    });
    const out = await collectHcs25Signals(baseSubject, {
      adapters: [adapter],
      fetch: fetchReturning({}),
    });
    expect(out.snapshot['test.a'].status).toBe('missing');
    expect(out.snapshot['test.b'].status).toBe('missing');
    expect(out.results[0].status).toBe('missing');
  });

  test('converts thrown errors to error status', async () => {
    const adapter: Hcs25SignalAdapter = {
      id: 'boom',
      produces: ['boom.signal'],
      collect: async () => {
        throw new Error('kaboom');
      },
    };
    const out = await collectHcs25Signals(baseSubject, {
      adapters: [adapter],
      fetch: fetchReturning({}),
    });
    expect(out.snapshot['boom.signal'].status).toBe('error');
    expect(out.results[0].status).toBe('error');
    expect(out.results[0].error).toContain('kaboom');
  });

  test('converts timeouts to timeout status and aborts', async () => {
    let aborted = false;
    const adapter: Hcs25SignalAdapter = {
      id: 'slow',
      produces: ['slow.signal'],
      timeoutMs: 5,
      collect: async (_subject, context) => {
        context.signal?.addEventListener('abort', () => {
          aborted = true;
        });
        await new Promise(resolve => setTimeout(resolve, 100));
        return [];
      },
    };
    const out = await collectHcs25Signals(baseSubject, {
      adapters: [adapter],
      fetch: fetchReturning({}),
    });
    expect(out.snapshot['slow.signal'].status).toBe('timeout');
    expect(out.results[0].status).toBe('timeout');
    expect(aborted).toBe(true);
  });

  test('marks stale signals when fetchedAt exceeds staleAfterMs', async () => {
    const adapter = recordingAdapter([
      {
        signalId: 'test.metric',
        status: 'ok',
        fields: [{ scope: 'root', values: { scoreStatus: 'ok' } }],
        provenance: { source: 'test', fetchedAt: '2026-01-01T00:00:00Z' },
      },
    ]);
    const out = await collectHcs25Signals(baseSubject, {
      adapters: [adapter],
      fetch: fetchReturning({}),
      staleAfterMs: 1000,
      now: new Date('2026-01-02T00:00:00Z'),
    });
    expect(out.snapshot['test.metric'].status).toBe('stale');
    expect(out.subject.metadata?.scoreStatus).toBe('stale');
  });

  test('carries previous snapshot entries and stales them by fetchedAt', async () => {
    const previous = {
      'other.signal': {
        status: 'ok' as const,
        value: 10,
        fetchedAt: '2026-01-01T00:00:00Z',
      },
    };
    const out = await collectHcs25Signals(baseSubject, {
      adapters: [],
      fetch: fetchReturning({}),
      previousSnapshot: previous,
      staleAfterMs: 1000,
      now: new Date('2026-01-02T00:00:00Z'),
    });
    expect(out.snapshot['other.signal'].status).toBe('stale');
  });

  test('rejects invalid adapter ids', async () => {
    const adapter = recordingAdapter([], { id: 'Bad_Id' });
    await expect(
      collectHcs25Signals(baseSubject, {
        adapters: [adapter],
        fetch: fetchReturning({}),
      }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});

describe('availability signal adapter', () => {
  test('probes endpoint and stores availabilityScore', async () => {
    const adapter = createAvailabilitySignalAdapter();
    const subject: Hcs25Subject = {
      id: 'a1',
      metadata: { endpoint: 'https://agent.example.com' },
    };
    const out = await collectHcs25Signals(subject, {
      adapters: [adapter],
      fetch: fetchWithStatus(200),
    });
    expect(out.snapshot['availability.probe'].status).toBe('ok');
    expect(out.subject.metadata?.availabilityScore).toBe(1);
    expect(out.subject.metadata?.availabilityStatus).toBe('ok');
  });

  test('missing endpoint yields missing signal', async () => {
    const adapter = createAvailabilitySignalAdapter();
    const out = await collectHcs25Signals(
      { id: 'a2', metadata: {} },
      { adapters: [adapter], fetch: fetchReturning({}) },
    );
    expect(out.snapshot['availability.probe'].status).toBe('missing');
    expect(out.subject.metadata?.availabilityScore).toBeNull();
  });

  test('derives minsFromLastOnline from metrics.lastActiveAt', async () => {
    const adapter = createAvailabilitySignalAdapter();
    const now = new Date('2026-06-01T12:00:00Z');
    const subject: Hcs25Subject = {
      id: 'a3',
      metadata: {
        metrics: { lastActiveAt: '2026-06-01T11:30:00Z' },
      },
    };
    const out = await collectHcs25Signals(subject, {
      adapters: [adapter],
      fetch: fetchReturning({}),
      now,
    });
    expect(out.snapshot['availability.last_seen'].value).toBe(30);
    const metrics = out.subject.metadata?.metrics as Record<string, unknown>;
    expect(metrics.minsFromLastOnline).toBe(30);
  });
});

describe('ethos signal adapter', () => {
  test('fetches userkey score and writes composite', async () => {
    const adapter = createEthosSignalAdapter();
    const subject: Hcs25Subject = {
      id: 'a4',
      metadata: { ethosUserkey: 'service:x.com:username:someone' },
    };
    const fetch = fetchReturning({ score: 1600 });
    const out = await collectHcs25Signals(subject, {
      adapters: [adapter],
      fetch,
    });
    expect(out.snapshot['ethos.score'].status).toBe('ok');
    expect(out.subject.metadata?.ethosScore).toBe(1600);
    expect(out.subject.metadata?.ethosScoreStatus).toBe('ok');
    const composite = out.subject.metadata?.ethosComposite as Record<
      string,
      unknown
    >;
    expect(composite.score).toBe(1600);
  });

  test('no resolvable source → missing', async () => {
    const adapter = createEthosSignalAdapter();
    const out = await collectHcs25Signals(
      { id: 'a5', metadata: {} },
      { adapters: [adapter], fetch: fetchReturning({}) },
    );
    expect(out.snapshot['ethos.score'].status).toBe('missing');
    expect(out.subject.metadata?.ethosScoreStatus).toBe('missing');
  });
});

describe('x402 signal adapter', () => {
  test('stores usage summary from indexer response', async () => {
    const adapter = createX402SignalAdapter({
      endpoint: 'https://indexer.example.com/x402/{payTo}',
    });
    const subject: Hcs25Subject = {
      id: 'a6',
      metadata: { payTo: '0xabc', network: 'base' },
    };
    const out = await collectHcs25Signals(subject, {
      adapters: [adapter],
      fetch: fetchReturning({
        summary: {
          volume7dUsd: 12.5,
          volume24hUsd: 2,
          inboundTrades7d: 3,
          outboundTrades7d: 1,
        },
        cursor: { cursor: 'c1' },
      }),
    });
    expect(out.snapshot['x402.usage'].status).toBe('ok');
    const summary = out.subject.metadata?.x402UsageSummary as Record<
      string,
      unknown
    >;
    expect(summary.volume7dUsd).toBe(12.5);
    expect(out.subject.metadata?.x402UsageCursor).toEqual({ cursor: 'c1' });
  });
});

describe('erc8004 signal adapter', () => {
  test('on-chain getSummary fixed-point conversion (ratio5)', async () => {
    const source = createOnchainErc8004FeedbackSource({
      registries: { 11155111: '0xregistry' },
      contractFor: () => ({
        getClients: async () => ['0xclient1'],
        getSummary: async () => [2n, 45n, 1n] as const, // 4.5 → 90
      }),
      scoreScale: 'ratio5',
    });
    const adapter = createErc8004SignalAdapter({ sources: [source] });
    const subject: Hcs25Subject = {
      id: 'a7',
      registry: 'erc-8004',
      metadata: { nativeId: '11155111:42' },
    };
    const out = await collectHcs25Signals(subject, {
      adapters: [adapter],
      fetch: fetchReturning({}),
    });
    expect(out.snapshot['erc8004.feedback'].status).toBe('ok');
    const summary = out.subject.metadata?.erc8004FeedbackSummary as Record<
      string,
      unknown
    >;
    expect(summary.averageScore).toBe(90);
    expect(summary.totalFeedbacks).toBe(2);
  });

  test('missing nativeId → missing', async () => {
    const adapter = createErc8004SignalAdapter({ sources: [] });
    const out = await collectHcs25Signals(
      { id: 'a8', registry: 'erc-8004', metadata: {} },
      { adapters: [adapter], fetch: fetchReturning({}) },
    );
    expect(out.snapshot['erc8004.feedback'].status).toBe('missing');
  });
});

describe('huggingface signal adapter', () => {
  test('model-index metrics produce normalized score', async () => {
    const adapter = createHuggingFaceSignalAdapter();
    const subject: Hcs25Subject = {
      id: 'a9',
      registry: 'openrouter',
      metadata: { additional: { huggingFaceModelId: 'org/model' } },
    };
    const out = await collectHcs25Signals(subject, {
      adapters: [adapter],
      fetch: fetchReturning({
        id: 'org/model',
        downloads: 1000,
        likes: 10,
        cardData: {
          'model-index': [
            { results: [{ metrics: [{ name: 'acc', value: 0.8 }] }] },
          ],
        },
      }),
    });
    const additional = out.subject.metadata?.additional as Record<
      string,
      unknown
    >;
    expect(out.snapshot['huggingface.model_index'].status).toBe('ok');
    expect(typeof additional.huggingFaceEvalScore).toBe('number');
    expect(additional.huggingFaceEvalMode).toBe('mixed');
  });
});

describe('simple-evals signal adapter', () => {
  test('correct answers score 100 with questionId fields', async () => {
    const adapter = createSimpleEvalsSignalAdapter({
      family: 'a2a',
      rng: () => 0.5,
      transport: {
        async sendPrompt({ prompt }) {
          const mathMatch = prompt.match(/What is (\d+) ([+−×]) (\d+)/);
          if (mathMatch) {
            const left = Number(mathMatch[1]);
            const right = Number(mathMatch[3]);
            const answer =
              mathMatch[2] === '+'
                ? left + right
                : mathMatch[2] === '−'
                  ? left - right
                  : left * right;
            return String(answer);
          }
          const question = SIMPLE_SCIENCE_QUESTION_BANK.find(
            entry => entry.prompt === prompt,
          );
          return question?.correctChoice ?? 'A';
        },
      },
    });
    const subject: Hcs25Subject = { id: 'a10', metadata: {} };
    const out = await collectHcs25Signals(subject, {
      adapters: [adapter],
      fetch: fetchReturning({}),
    });
    const additional = out.subject.metadata?.additional as Record<
      string,
      unknown
    >;
    expect(out.snapshot['simple-evals.a2a_math'].status).toBe('ok');
    expect(additional.a2aSimpleMathScore).toBe(100);
  });

  test('unreachable subject → missing status, no crash', async () => {
    const adapter = createSimpleEvalsSignalAdapter({
      family: 'nanda',
      transport: {
        async sendPrompt() {
          return null;
        },
      },
    });
    const out = await collectHcs25Signals(
      { id: 'a11', metadata: {} },
      { adapters: [adapter], fetch: fetchReturning({}) },
    );
    expect(out.snapshot['simple-evals.nanda_math'].status).toBe('missing');
  });
});

describe('createHcs25SignalAdapters catalog', () => {
  test('enables zero-config families with true', () => {
    const adapters = createHcs25SignalAdapters({
      availability: true,
      ethos: { client: 'test' },
      x402: { endpoint: 'https://x.example/{payTo}' },
    });
    expect(adapters.map(a => a.id)).toEqual(['availability', 'ethos', 'x402']);
  });

  test('omitted families are not created', () => {
    expect(createHcs25SignalAdapters({})).toEqual([]);
  });
});

describe('collectAndScoreTrustScore pipeline', () => {
  test('end-to-end: collected fields feed the scoring adapter', async () => {
    const availabilityAdapter = createAvailabilitySignalAdapter();
    const subject: Hcs25Subject = {
      id: 'a12',
      metadata: { endpoint: 'https://agent.example.com' },
    };
    const { collection, record } = await collectAndScoreTrustScore(subject, {
      adapters: [availabilityAdapter],
      fetch: fetchWithStatus(200),
      config: {
        version: 1,
        adapters: [
          {
            id: 'availability',
            weight: 1,
            contributionMode: 'scoped',
            components: [
              {
                name: 'score',
                normalize: ({ subject: s }) => {
                  const score = s.metadata?.availabilityScore;
                  return typeof score === 'number'
                    ? { value: score * 100, status: 'ok' as const }
                    : { value: 0, status: 'missing' as const };
                },
              },
            ],
          },
        ],
      },
    });
    expect(collection.subject.metadata?.availabilityScore).toBe(1);
    expect(record.trustScores['availability.score']).toBe(100);
    expect(record.trustScores.total).toBe(100);
  });
});

describe('stale threading: stored status fields → normalized stale → multiplier', () => {
  const scoreWith = (
    subject: Hcs25Subject,
    adapterId: string,
    component: string,
    normalize: Hcs25ComponentDefinition['normalize'],
  ) => {
    const config = {
      version: 1,
      staleMultiplier: 0.5,
      adapters: [
        {
          id: adapterId,
          weight: 1,
          contributionMode: 'universal' as const,
          components: [{ name: component, normalize }],
        },
      ],
    };
    return computeTrustScore({ subject, snapshot: {}, config }).trustScores;
  };

  test('availability: stale probe status downgrades stored score', () => {
    const adapter = createAvailabilityAdapter();
    const normalize = adapter.components[0].normalize;
    const scores = scoreWith(
      {
        id: 's',
        metadata: { availabilityScore: 0.8, availabilityStatus: 'stale' },
      },
      'availability',
      'uptime',
      normalize,
    );
    // 80 * 0.5 stale multiplier
    expect(scores['availability.uptime']).toBe(40);
  });

  test('availability: timeout status without score surfaces as timeout', () => {
    const adapter = createAvailabilityAdapter();
    const result = adapter.components[0].normalize({
      subject: {
        id: 's',
        metadata: { availabilityStatus: 'timeout' },
      },
      snapshot: {},
      config: {
        version: 1,
        adapters: [adapter],
        staleMultiplier: 1,
        roundingDecimals: 2,
        computeConfidence: false,
      },
    });
    expect(result.status).toBe('timeout');
    expect(result.value).toBe(0);
  });

  test('ethos: stale composite keeps value, marks stale', () => {
    const adapter = createEthosAdapter();
    const normalize = adapter.components[0].normalize;
    const scores = scoreWith(
      {
        id: 's',
        metadata: { ethosScore: 1600, ethosScoreStatus: 'stale' },
      },
      'ethos',
      'score',
      normalize,
    );
    // raw 1600 → (1600-1200)/(2000-1200)=0.5 → 50; stale ×0.5 → 25
    expect(scores['ethos.score']).toBe(25);
  });

  test('x402: stale usage status keeps log-scaled value, marks stale', () => {
    const adapter = createX402Adapter();
    const normalize = adapter.components[0].normalize;
    const subject: Hcs25Subject = {
      id: 's',
      metadata: {
        x402UsageStatus: 'stale',
        x402UsageSummary: { volume7dUsd: 10000 },
      },
    };
    const result = normalize({
      subject,
      snapshot: {},
      config: {
        version: 1,
        adapters: [adapter],
        staleMultiplier: 0.5,
        roundingDecimals: 2,
        computeConfidence: false,
      },
    });
    expect(result.status).toBe('stale');
    expect(result.value).toBe(100); // volume == cap → logScale 100 pre-multiplier
  });

  test('connectivity: stale status downgrades stored score', () => {
    const adapter = createConnectivityAdapter();
    const normalize = adapter.components[0].normalize;
    const scores = scoreWith(
      {
        id: 's',
        metadata: {
          additional: { connectivityScore: 80, connectivityStatus: 'stale' },
        },
      },
      'connectivity',
      'score',
      normalize,
    );
    expect(scores['connectivity.score']).toBe(40);
  });

  test('simple-evals: stale stored status preserves score for multiplier', () => {
    const adapter = createSimpleMathAdapter();
    const normalize = adapter.components[0].normalize;
    const scores = scoreWith(
      {
        id: 's',
        metadata: {
          additional: {
            a2aSimpleMathScore: 100,
            a2aSimpleMathStatus: 'stale',
          },
        },
      },
      'simple-math',
      'score',
      normalize,
    );
    expect(scores['simple-math.score']).toBe(50);
  });
});

describe('isTimeoutError', () => {
  test('recognizes abort and timeout errors', () => {
    expect(isTimeoutError(new DOMException('x', 'AbortError'))).toBe(true);
    const err = new Error('x');
    err.name = 'TimeoutError';
    expect(isTimeoutError(err)).toBe(true);
    expect(isTimeoutError(new Error('x'))).toBe(false);
  });
});
