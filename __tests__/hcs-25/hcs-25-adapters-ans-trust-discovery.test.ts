import { describe, expect, test } from '@jest/globals';

import type { Hcs25JsonValue, Hcs25Subject } from '../../src/hcs-25/types';
import {
  compileScoringConfig,
  computeTrustScore,
} from '../../src/hcs-25/scoring';
import {
  createAnsTrustDiscoveryAdapter,
  createAvailabilityAdapter,
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

const UAID =
  'uaid:aid:7bU8xK;uid=b8d9425f-fd9f-47a5-ae5d-8ab51bda04c9;registry=ans;proto=a2a;nativeId=support-agent.example.com;version=v1.0.0';

const FULL_SIGNALS: Record<string, Hcs25JsonValue> = {
  'ans-trust-discovery.certtype': 100,
  'ans-trust-discovery.dnssecurity': 80,
  'ans-trust-discovery.agentage': 60,
  'ans-trust-discovery.versionstability': 100,
  'ans-trust-discovery.dnsconsistency': 70,
  'ans-trust-discovery.httpsrecord': 100,
  'ans-trust-discovery.agentcard': 100,
  'ans-trust-discovery.certificatehygiene': 95,
};

function ansSubject(
  ansTrustDiscovery?: Record<string, Hcs25JsonValue>,
  registry = 'ans',
): Hcs25Subject {
  return {
    id: UAID,
    registry,
    metadata: ansTrustDiscovery ? { ansTrustDiscovery } : {},
  };
}

describe('HCS-25 ANS trust discovery adapter', () => {
  test('declares the specified id, mode, weight, and default component key', () => {
    const adapter = createAnsTrustDiscoveryAdapter();

    expect(adapter.id).toBe('ans-trust-discovery');
    expect(adapter.contributionMode).toBe('scoped');
    expect(adapter.weight).toBe(1);
    expect(adapter.includeRegistries).toEqual(['ans']);
    expect(adapter.defaultComponentKey).toBe('ans-trust-discovery.certtype');
    expect(adapter.components.map(component => component.name)).toEqual([
      'certtype',
      'dnssecurity',
      'agentage',
      'versionstability',
      'dnsconsistency',
      'httpsrecord',
      'agentcard',
      'certificatehygiene',
    ]);
    expect(() =>
      compileScoringConfig({ version: 1, adapters: [adapter] }),
    ).not.toThrow();
  });

  test('passes each provider score through as one component', () => {
    const result = scoreOne(
      createAnsTrustDiscoveryAdapter(),
      ansSubject({ ...FULL_SIGNALS, ansTrustDiscoveryStatus: 'ok' }),
    );

    for (const [key, value] of Object.entries(FULL_SIGNALS)) {
      expect(result.trustScores[key]).toBe(value);
    }
    const adapterScore = result.breakdown.adapters[0];
    expect(adapterScore?.applicable).toBe(true);
    expect(adapterScore?.inDenominator).toBe(true);
    expect(adapterScore?.unavailable).toEqual([]);
    expect(adapterScore?.total).toBe(88.13);
    expect(result.trustScores.total).toBe(88.13);
  });

  test('clamps out-of-range scores to [0,100]', () => {
    const result = scoreOne(
      createAnsTrustDiscoveryAdapter(),
      ansSubject({
        'ans-trust-discovery.certtype': 140,
        'ans-trust-discovery.dnssecurity': -5,
      }),
    );

    expect(result.trustScores['ans-trust-discovery.certtype']).toBe(100);
    expect(result.trustScores['ans-trust-discovery.dnssecurity']).toBe(0);
  });

  test('excludes missing signals from the adapter total', () => {
    const result = scoreOne(
      createAnsTrustDiscoveryAdapter(),
      ansSubject({
        'ans-trust-discovery.certtype': 100,
        'ans-trust-discovery.dnssecurity': 50,
        'ans-trust-discovery.agentcard': null,
      }),
    );

    const adapterScore = result.breakdown.adapters[0];
    expect(adapterScore?.components.map(component => component.key)).toEqual([
      'ans-trust-discovery.certtype',
      'ans-trust-discovery.dnssecurity',
    ]);
    expect(adapterScore?.unavailable).toEqual([
      'ans-trust-discovery.agentage',
      'ans-trust-discovery.versionstability',
      'ans-trust-discovery.dnsconsistency',
      'ans-trust-discovery.httpsrecord',
      'ans-trust-discovery.agentcard',
      'ans-trust-discovery.certificatehygiene',
    ]);
    expect(adapterScore?.total).toBe(75);
    expect(result.trustScores['ans-trust-discovery.agentcard']).toBeUndefined();
  });

  test('keeps a measured zero distinct from a missing signal', () => {
    const result = scoreOne(
      createAnsTrustDiscoveryAdapter(),
      ansSubject({
        'ans-trust-discovery.certtype': 100,
        'ans-trust-discovery.httpsrecord': 0,
      }),
    );

    expect(result.trustScores['ans-trust-discovery.httpsrecord']).toBe(0);
    expect(result.breakdown.adapters[0]?.total).toBe(50);
  });

  test('treats non-numeric values as missing', () => {
    const result = scoreOne(
      createAnsTrustDiscoveryAdapter(),
      ansSubject({
        'ans-trust-discovery.certtype': '90',
        'ans-trust-discovery.dnssecurity': true,
        'ans-trust-discovery.agentage': 40,
      }),
    );

    const adapterScore = result.breakdown.adapters[0];
    expect(adapterScore?.unavailable).toContain('ans-trust-discovery.certtype');
    expect(adapterScore?.unavailable).toContain(
      'ans-trust-discovery.dnssecurity',
    );
    expect(adapterScore?.total).toBe(40);
  });

  test('ignores signals outside the specified set', () => {
    const result = scoreOne(
      createAnsTrustDiscoveryAdapter(),
      ansSubject({
        'ans-trust-discovery.certtype': 100,
        'ans-trust-discovery.unlisted': 0,
      }),
    );

    expect(result.trustScores['ans-trust-discovery.unlisted']).toBeUndefined();
    expect(result.breakdown.adapters[0]?.total).toBe(100);
  });

  test('stays in the denominator at zero when no signals are available', () => {
    for (const subject of [ansSubject(), ansSubject({})]) {
      const result = scoreOne(createAnsTrustDiscoveryAdapter(), subject);
      const adapterScore = result.breakdown.adapters[0];

      expect(adapterScore?.inDenominator).toBe(true);
      expect(adapterScore?.total).toBe(0);
      expect(adapterScore?.components).toEqual([
        {
          key: 'ans-trust-discovery.certtype',
          value: 0,
          status: 'missing',
          weight: 1,
        },
      ]);
      expect(adapterScore?.unavailable).toHaveLength(8);
    }
  });

  test('applies only to subjects in the ans registry', () => {
    const other = scoreOne(
      createAnsTrustDiscoveryAdapter(),
      ansSubject(FULL_SIGNALS, 'agentverse'),
    );
    expect(other.breakdown.adapters[0]?.applicable).toBe(false);
    expect(other.breakdown.adapters[0]?.inDenominator).toBe(false);
    expect(other.trustScores['ans-trust-discovery.certtype']).toBeUndefined();

    const unregistered = scoreOne(createAnsTrustDiscoveryAdapter(), {
      id: 'agent:a',
      metadata: { ansTrustDiscovery: FULL_SIGNALS },
    });
    expect(unregistered.breakdown.adapters[0]?.applicable).toBe(false);
  });

  test('supports custom registries', () => {
    const result = scoreOne(
      createAnsTrustDiscoveryAdapter({
        includeRegistries: ['example-registry'],
      }),
      ansSubject(FULL_SIGNALS, 'example-registry'),
    );

    expect(result.breakdown.adapters[0]?.applicable).toBe(true);
    expect(result.trustScores['ans-trust-discovery.certtype']).toBe(100);
  });

  test('applies the staleness multiplier to stale signals', () => {
    const result = computeTrustScore({
      subject: ansSubject({
        'ans-trust-discovery.certtype': 100,
        'ans-trust-discovery.agentage': 60,
        ansTrustDiscoveryStatus: 'stale',
      }),
      snapshot: {},
      config: {
        version: 1,
        staleMultiplier: 0.5,
        adapters: [createAnsTrustDiscoveryAdapter()],
      },
    });

    expect(result.trustScores['ans-trust-discovery.certtype']).toBe(50);
    expect(result.trustScores['ans-trust-discovery.agentage']).toBe(30);
    expect(result.breakdown.adapters[0]?.components[0]?.status).toBe('stale');
  });

  test('keeps present scores when the collection status is error or timeout', () => {
    for (const status of ['error', 'timeout']) {
      const result = scoreOne(
        createAnsTrustDiscoveryAdapter(),
        ansSubject({
          'ans-trust-discovery.certtype': 100,
          ansTrustDiscoveryStatus: status,
        }),
      );
      const adapterScore = result.breakdown.adapters[0];

      expect(adapterScore?.components).toEqual([
        {
          key: 'ans-trust-discovery.certtype',
          value: 100,
          status: 'ok',
          weight: 1,
        },
      ]);
      expect(adapterScore?.unavailable).toHaveLength(7);
    }
  });

  test('contributes to the composite alongside other adapters', () => {
    const result = computeTrustScore({
      subject: {
        ...ansSubject(FULL_SIGNALS),
        metadata: {
          availabilityScore: 0.5,
          ansTrustDiscovery: FULL_SIGNALS,
        },
      },
      snapshot: {},
      config: {
        version: 1,
        adapters: [
          createAvailabilityAdapter(),
          createAnsTrustDiscoveryAdapter(),
        ],
      },
    });

    expect(result.trustScores['availability.uptime']).toBe(50);
    expect(result.trustScores.total).toBe(69.07);
  });
});
