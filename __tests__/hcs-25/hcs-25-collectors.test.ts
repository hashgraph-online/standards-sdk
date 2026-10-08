import { describe, expect, test } from '@jest/globals';

import { computeTrustScore } from '../../src/hcs-25/scoring';
import {
  createAnsTrustDiscoveryAdapter,
  createAvailabilityAdapter,
  createConnectivityAdapter,
  createEthosAdapter,
  createHcs25AdapterCatalog,
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
  createAgentverseInsightsSignalAdapter,
  createAnsTrustDiscoverySignalAdapter,
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

  test('retries transient 5xx then succeeds; never retries 4xx', async () => {
    let calls = 0;
    const flaky: Hcs25Fetch = async () => {
      calls += 1;
      return calls < 3
        ? { ok: false, status: 503, json: async () => ({}) }
        : okResponse({ done: true });
    };
    const data = await requestJson<{ done: boolean }>('https://e.com/x', {
      fetch: flaky,
      maxRetries: 3,
      retryDelayMs: 1,
    });
    expect(data.done).toBe(true);
    expect(calls).toBe(3);

    let calls4xx = 0;
    const failing: Hcs25Fetch = async () => {
      calls4xx += 1;
      return { ok: false, status: 404, json: async () => ({}) };
    };
    await expect(
      requestJson('https://e.com/y', {
        fetch: failing,
        maxRetries: 3,
        retryDelayMs: 1,
      }),
    ).rejects.toBeInstanceOf(Hcs25CollectorHttpError);
    expect(calls4xx).toBe(1);
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

  test('later adapters see metadata collected by earlier adapters', async () => {
    const first: Hcs25SignalAdapter = {
      id: 'producer',
      produces: ['producer.field'],
      collect: async () => [
        {
          signalId: 'producer.field',
          status: 'ok',
          fields: [{ scope: 'root', values: { upstreamValue: 'hello' } }],
        },
      ],
    };
    let observed: unknown;
    const second: Hcs25SignalAdapter = {
      id: 'consumer',
      produces: ['consumer.field'],
      collect: async subject => {
        observed = subject.metadata?.upstreamValue;
        return [{ signalId: 'consumer.field', status: 'ok' }];
      },
    };
    const out = await collectHcs25Signals(baseSubject, {
      adapters: [first, second],
      fetch: fetchReturning({}),
    });
    expect(observed).toBe('hello');
    expect(out.subject.metadata?.upstreamValue).toBe('hello');
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
    const fetch = fetchReturning({ ok: true, data: { score: 1600 } });
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

  test('hits /api/v1/score/{userkey} and tolerates flat {score} payloads', async () => {
    const adapter = createEthosSignalAdapter();
    const urls: string[] = [];
    const fetch: Hcs25Fetch = async url => {
      urls.push(String(url));
      return okResponse({ score: 1234 });
    };
    const out = await collectHcs25Signals(
      {
        id: 'a4b',
        metadata: { ethosUserkey: 'service:x.com:username:flat' },
      },
      { adapters: [adapter], fetch },
    );
    expect(out.snapshot['ethos.score'].status).toBe('ok');
    expect(out.subject.metadata?.ethosScore).toBe(1234);
    expect(urls[0]).toContain('/api/v1/score/service%3Ax.com');
  });

  test('envelope {ok:false} marks the source missing', async () => {
    const adapter = createEthosSignalAdapter();
    const out = await collectHcs25Signals(
      {
        id: 'a4c',
        metadata: { ethosUserkey: 'service:x.com:username:none' },
      },
      {
        adapters: [adapter],
        fetch: fetchReturning({ ok: false, data: null }),
      },
    );
    expect(out.snapshot['ethos.score'].status).toBe('missing');
    expect(out.subject.metadata?.ethosScoreStatus).toBe('missing');
  });

  test('merges x + address sources with production weights (virtuals)', async () => {
    const adapter = createEthosSignalAdapter();
    const subject: Hcs25Subject = {
      id: 'a4d',
      registry: 'virtuals-protocol',
      metadata: {
        profile: { socials: [{ platform: 'x', handle: '@agent' }] },
        agentAddress: '0x' + 'ab'.repeat(20),
      },
    };
    const fetch: Hcs25Fetch = async url => {
      const score = String(url).includes('address') ? 800 : 2000;
      return okResponse({ ok: true, data: { score } });
    };
    const out = await collectHcs25Signals(subject, {
      adapters: [adapter],
      fetch,
    });
    const sources = out.subject.metadata?.ethosSources as Array<
      Record<string, unknown>
    >;
    expect(sources).toHaveLength(2);
    const xSource = sources.find(s => s.kind === 'x');
    const addrSource = sources.find(s => s.kind === 'address');
    expect(xSource?.weight).toBe(0.7);
    expect(addrSource?.weight).toBe(0.3);
    // weighted composite: (2000*0.7 + 800*0.3) / 1.0 = 1640
    expect(out.subject.metadata?.ethosScore).toBe(1640);
  });

  test('skips fresh ok sources within TTL (no upstream call)', async () => {
    const adapter = createEthosSignalAdapter({ ttlMs: 60_000 });
    const now = new Date('2026-06-01T00:00:00Z');
    const subject: Hcs25Subject = {
      id: 'a4e',
      metadata: {
        ethosUserkey: 'service:x.com:username:cached',
        ethosSources: [
          {
            userkey: 'service:x.com:username:cached',
            kind: 'x',
            weight: 1,
            status: 'ok',
            score: 1500,
            updatedAt: '2026-05-31T23:59:59Z',
          },
        ],
      },
    };
    let calls = 0;
    const fetch: Hcs25Fetch = async () => {
      calls += 1;
      return okResponse({ ok: true, data: { score: 9999 } });
    };
    const out = await collectHcs25Signals(subject, {
      adapters: [adapter],
      fetch,
      now,
    });
    expect(calls).toBe(0);
    expect(out.subject.metadata?.ethosScore).toBe(1500);
  });
});

describe('x402 signal adapter', () => {
  test('stores usage summary from indexer response', async () => {
    const adapter = createX402SignalAdapter({
      source: 'https://indexer.example.com/x402/{payTo}',
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

  test('default onchain source uses injected fetchUsageState', async () => {
    let calls = 0;
    const adapter = createX402SignalAdapter({
      fetchUsageState: async params => {
        calls += 1;
        expect(params.payTo).toBe('0xabc');
        return {
          summary: {
            volume7dUsd: 42,
            volume24hUsd: 6,
            inboundTrades7d: 5,
            outboundTrades7d: 1,
          },
          cursor: {
            network: 'base',
            asset: '0xusdc',
            payTo: '0xabc',
            lastScannedBlock: 100,
            daily: [],
          },
        };
      },
    });
    const subject: Hcs25Subject = {
      id: 'a6b',
      metadata: { payTo: '0xabc', asset: '0xusdc', network: 'base' },
    };
    const out = await collectHcs25Signals(subject, { adapters: [adapter] });
    expect(calls).toBe(1);
    expect(out.snapshot['x402.usage'].status).toBe('ok');
    const summary = out.subject.metadata?.x402UsageSummary as Record<
      string,
      unknown
    >;
    expect(summary.volume7dUsd).toBe(42);
    expect(out.subject.metadata?.x402UsageSource).toBe('onchain');
  });

  test('fresh ok state within TTL skips the scan entirely', async () => {
    let calls = 0;
    const adapter = createX402SignalAdapter({
      ttlMs: 60_000,
      fetchUsageState: async () => {
        calls += 1;
        return { summary: null, cursor: null };
      },
    });
    const now = new Date('2026-06-01T00:00:00Z');
    const subject: Hcs25Subject = {
      id: 'a6c',
      metadata: {
        payTo: '0xabc',
        asset: '0xusdc',
        network: 'base',
        x402UsageStatus: 'ok',
        x402UsageUpdatedAt: '2026-05-31T23:59:59Z',
        x402UsageSummary: { volume7dUsd: 9 },
      },
    };
    const out = await collectHcs25Signals(subject, {
      adapters: [adapter],
      now,
    });
    expect(calls).toBe(0);
    expect(out.snapshot['x402.usage'].status).toBe('ok');
    expect(out.snapshot['x402.usage'].value).toBe(9);
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

describe('agentverse signal adapter', () => {
  const agentAddress = `agent1${'q'.repeat(59)}`;

  test('falls back from mainnet to testnet on 404', async () => {
    const adapter = createAgentverseInsightsSignalAdapter();
    const urls: string[] = [];
    const fetch: Hcs25Fetch = async url => {
      const u = String(url);
      urls.push(u);
      if (u.includes('contract=testnet')) {
        return okResponse({ rating: 4.2, asi1_total_interactions: 3 });
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const out = await collectHcs25Signals(
      {
        id: 'av1',
        registry: 'agentverse',
        metadata: { nativeId: agentAddress },
      },
      { adapters: [adapter], fetch },
    );
    expect(urls.some(u => u.includes('contract=mainnet'))).toBe(true);
    expect(urls.some(u => u.includes('contract=testnet'))).toBe(true);
    const additional = out.subject.metadata?.additional as Record<
      string,
      unknown
    >;
    expect(out.snapshot['agentverse.insights'].status).toBe('ok');
    expect(additional.agentverseInsightsContract).toBe('testnet');
    expect(additional.agentverseInsightsRating).toBe(4.2);
  });

  test('all-empty payloads on both contracts → missing', async () => {
    const adapter = createAgentverseInsightsSignalAdapter();
    const out = await collectHcs25Signals(
      {
        id: 'av2',
        registry: 'agentverse',
        metadata: { nativeId: agentAddress },
      },
      { adapters: [adapter], fetch: fetchReturning({}) },
    );
    expect(out.snapshot['agentverse.insights'].status).toBe('missing');
    const additional = out.subject.metadata?.additional as Record<
      string,
      unknown
    >;
    expect(additional.agentverseInsightsStatus).toBe('missing');
  });

  test('422 on one contract still probes the other', async () => {
    const adapter = createAgentverseInsightsSignalAdapter();
    const fetch: Hcs25Fetch = async url => {
      const u = String(url);
      if (u.includes('contract=mainnet')) {
        return { ok: false, status: 422, json: async () => ({}) };
      }
      return okResponse({ readme_quality_score: 0.8 });
    };
    const out = await collectHcs25Signals(
      {
        id: 'av3',
        registry: 'agentverse',
        metadata: { nativeId: agentAddress },
      },
      { adapters: [adapter], fetch },
    );
    expect(out.snapshot['agentverse.insights'].status).toBe('ok');
    const additional = out.subject.metadata?.additional as Record<
      string,
      unknown
    >;
    expect(additional.agentverseInsightsContract).toBe('testnet');
  });

  test('non-bech32 id and no resolvable address → missing without fetch', async () => {
    const adapter = createAgentverseInsightsSignalAdapter();
    let calls = 0;
    const fetch: Hcs25Fetch = async url => {
      calls += 1;
      return okResponse({});
    };
    const out = await collectHcs25Signals(
      { id: 'not-an-agent-address', registry: 'agentverse', metadata: {} },
      { adapters: [adapter], fetch },
    );
    expect(out.snapshot['agentverse.insights'].status).toBe('missing');
    expect(calls).toBe(0);
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
      x402: { source: 'https://x.example/{payTo}' },
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

describe('ans trust discovery signal adapter', () => {
  const UAID =
    'uaid:aid:7bU8xK;uid=b8d9425f-fd9f-47a5-ae5d-8ab51bda04c9;registry=ans;proto=a2a;nativeId=support-agent.example.com;version=v1.0.0';

  const providerResponse = {
    signals: {
      certtype: { score: 100, missing: false },
      dnssecurity: { score: 80, missing: false },
      agentage: { score: 60, missing: false },
      versionstability: { score: 100, missing: false },
      dnsconsistency: { score: 70, missing: false },
      httpsrecord: { score: 140, missing: false },
      agentcard: { score: 100, missing: true },
      certificatehygiene: { score: 95, missing: false },
    },
  };

  test('stores provider scores and the scoring adapter consumes them', async () => {
    let requested = '';
    const fetchImpl: Hcs25Fetch = async url => {
      requested = url;
      return okResponse(providerResponse);
    };
    const collection = await collectHcs25Signals(
      { id: UAID, registry: 'ans' },
      {
        adapters: [
          createAnsTrustDiscoverySignalAdapter({
            baseUrl: 'https://ans.example.com/',
          }),
        ],
        fetch: fetchImpl,
        now: new Date('2026-08-18T01:58:17.623Z'),
      },
    );

    expect(requested).toBe(
      'https://ans.example.com/v1/ans/registered-agents/support-agent.example.com',
    );
    const stored = collection.subject.metadata?.ansTrustDiscovery as Record<
      string,
      unknown
    >;
    expect(stored['ans-trust-discovery.certtype']).toBe(100);
    expect(stored['ans-trust-discovery.httpsrecord']).toBe(100);
    expect(stored['ans-trust-discovery.agentcard']).toBeNull();
    expect(stored.ansTrustDiscoveryStatus).toBe('ok');
    expect(stored.ansTrustDiscoveryUpdatedAt).toBe('2026-08-18T01:58:17.623Z');
    expect(collection.snapshot['ans-trust-discovery.agentcard'].status).toBe(
      'missing',
    );

    const record = computeTrustScore({
      subject: collection.subject,
      snapshot: collection.snapshot,
      config: { version: 1, adapters: [createAnsTrustDiscoveryAdapter()] },
    });
    expect(record.trustScores['ans-trust-discovery.certtype']).toBe(100);
    expect(record.trustScores['ans-trust-discovery.httpsrecord']).toBe(100);
    expect(record.trustScores['ans-trust-discovery.agentcard']).toBeUndefined();
    expect(record.trustScores.total).toBe(86.43);
  });

  test('is missing when the subject has no ANS agent id', async () => {
    const collection = await collectHcs25Signals(
      { id: 'agent:plain', registry: 'ans' },
      {
        adapters: [createAnsTrustDiscoverySignalAdapter()],
        fetch: fetchReturning({}),
      },
    );
    expect(collection.snapshot['ans-trust-discovery.certtype'].status).toBe(
      'missing',
    );
    expect(collection.subject.metadata?.ansTrustDiscovery).toBeUndefined();
  });

  test('treats HTTP 404 as missing', async () => {
    const collection = await collectHcs25Signals(
      { id: UAID, registry: 'ans' },
      {
        adapters: [createAnsTrustDiscoverySignalAdapter()],
        fetch: fetchWithStatus(404),
      },
    );
    expect(collection.snapshot['ans-trust-discovery.certtype'].status).toBe(
      'missing',
    );
    expect(collection.results[0]?.status).toBe('missing');
  });

  test('stores timeout and error without a score', async () => {
    for (const [name, status] of [
      ['TimeoutError', 'timeout'],
      ['Error', 'error'],
    ] as const) {
      const fetchImpl: Hcs25Fetch = async () => {
        const error = new Error('upstream failed');
        error.name = name;
        throw error;
      };
      const collection = await collectHcs25Signals(
        { id: UAID, registry: 'ans' },
        {
          adapters: [createAnsTrustDiscoverySignalAdapter()],
          fetch: fetchImpl,
        },
      );
      const stored = collection.subject.metadata?.ansTrustDiscovery as Record<
        string,
        unknown
      >;
      expect(stored.ansTrustDiscoveryStatus).toBe(status);
      expect(collection.snapshot['ans-trust-discovery.certtype'].status).toBe(
        status,
      );
    }
  });

  test('does not apply outside the ans registry', async () => {
    const collection = await collectHcs25Signals(
      { id: UAID, registry: 'agentverse' },
      {
        adapters: [createAnsTrustDiscoverySignalAdapter()],
        fetch: fetchReturning(providerResponse),
      },
    );
    expect(collection.results[0]?.applicable).toBe(false);
    expect(collection.snapshot['ans-trust-discovery.certtype']).toBeUndefined();
  });
});

describe('adapter coverage mapping', () => {
  test('every scoring adapter has at least one signal collector', () => {
    const transport = {
      sendPrompt: async () => '42',
    };
    const collectors = createHcs25SignalAdapters({
      availability: true,
      connectivity: true,
      ethos: true,
      ossPopularity: true,
      agentverse: true,
      huggingFace: true,
      x402: true,
      acp: { endpoint: 'https://acp.example.com/{address}' },
      erc8004: {
        sources: [{ getFeedbackSummary: async () => null }],
      },
      openrouterEvals: true,
      chatbotArena: true,
      openLlm: true,
      outputVerification: {
        providers: [{ id: 'test', baseUrl: 'https://verify.example.com' }],
      },
      ansTrustDiscovery: true,
      simpleEvals: {
        a2a: { transport },
        agentverse: { transport },
        nanda: { transport },
      },
    });
    const collectorIds = new Set(collectors.map(adapter => adapter.id));

    // scoring adapter id -> acceptable collector id(s)
    const coverage: Record<string, readonly string[]> = {
      availability: ['availability'],
      ethos: ['ethos'],
      acp: ['acp'],
      'erc8004-feedback': ['erc8004-feedback'],
      x402: ['x402'],
      'oss-popularity': ['oss-popularity'],
      'simple-math': [
        'a2a-simple-evals',
        'agentverse-simple-evals',
        'nanda-simple-evals',
      ],
      'simple-science': [
        'a2a-simple-evals',
        'agentverse-simple-evals',
        'nanda-simple-evals',
      ],
      'agentverse-insights': ['agentverse-insights'],
      'agentverse-verifier': ['agentverse-insights'],
      'openrouter-evals': ['openrouter-evals'],
      'chatbot-arena': ['chatbot-arena'],
      'huggingface-model-index': ['huggingface-model-index'],
      'openllm-leaderboard': ['openllm-leaderboard'],
      'model-tier': [
        'openrouter-evals',
        'chatbot-arena',
        'huggingface-model-index',
        'openllm-leaderboard',
      ],
      'output-verification': ['output-verification'],
      connectivity: ['connectivity'],
      'ans-trust-discovery': ['ans-trust-discovery'],
    };

    const scoringAdapters = createHcs25AdapterCatalog();
    expect(scoringAdapters.length).toBeGreaterThan(0);
    for (const adapter of scoringAdapters) {
      const candidates = coverage[adapter.id];
      expect(candidates).toBeDefined();
      const covered = candidates.some(id => collectorIds.has(id));
      expect({ adapterId: adapter.id, covered }).toEqual({
        adapterId: adapter.id,
        covered: true,
      });
    }
  });
});
