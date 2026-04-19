import { jest } from '@jest/globals';
import { RegistryBrokerClient } from '../../src/services/registry-broker';

function createResponse(payload: {
  status?: number;
  json?: () => Promise<unknown>;
}): Response {
  return {
    ok: (payload.status ?? 200) >= 200 && (payload.status ?? 200) < 300,
    status: payload.status ?? 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: payload.json ?? (async () => ({})),
    text: async () => JSON.stringify(await (payload.json?.() ?? {})),
  } as unknown as Response;
}

describe('RegistryBrokerClient guard helpers', () => {
  const fetchImplementation = jest.fn<typeof fetch>();

  beforeEach(() => {
    fetchImplementation.mockReset();
  });

  it('retrieves the guard session and entitlements payload', async () => {
    const sessionPayload = {
      principal: {
        signedIn: true,
        userId: 'user_123',
        email: 'guard@example.com',
        accountId: '0.0.1234',
        stripeCustomerId: 'cus_123',
        roles: ['user'],
      },
      entitlements: {
        planId: 'pro',
        includedMonthlyCredits: 500,
        deviceLimit: 5,
        retentionDays: 90,
        syncEnabled: true,
        premiumFeedsEnabled: true,
        teamPolicyEnabled: false,
      },
      balance: {
        accountId: '0.0.1234',
        availableCredits: 212,
      },
      bucketingMode: 'product-bucketed',
      buckets: [
        {
          bucketId: 'guard_credits',
          label: 'Guard credits',
          availableCredits: 212,
          includedMonthlyCredits: 500,
        },
      ],
    };
    fetchImplementation
      .mockResolvedValueOnce(
        createResponse({ json: async () => sessionPayload }),
      )
      .mockResolvedValueOnce(
        createResponse({ json: async () => sessionPayload }),
      );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'rb_test_key',
      fetchImplementation,
    });

    const session = await client.getGuardSession();
    const entitlements = await client.getGuardEntitlements();

    expect(session.entitlements.planId).toBe('pro');
    expect(entitlements.principal.email).toBe('guard@example.com');
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/api/v1/guard/auth/session',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/api/v1/guard/entitlements',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('falls back to portal-canonical guard routes when legacy paths return 404', async () => {
    const sessionPayload = {
      principal: {
        signedIn: true,
        userId: 'user_123',
        email: 'guard@example.com',
        accountId: '0.0.1234',
        stripeCustomerId: 'cus_123',
        roles: ['user'],
      },
      entitlements: {
        planId: 'pro',
        includedMonthlyCredits: 500,
        deviceLimit: 5,
        retentionDays: 90,
        syncEnabled: true,
        premiumFeedsEnabled: true,
        teamPolicyEnabled: false,
      },
      balance: {
        accountId: '0.0.1234',
        availableCredits: 212,
      },
      bucketingMode: 'product-bucketed',
      buckets: [],
    };
    fetchImplementation
      .mockResolvedValueOnce(
        createResponse({ status: 404, json: async () => ({}) }),
      )
      .mockResolvedValueOnce(
        createResponse({ json: async () => sessionPayload }),
      );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const session = await client.getGuardSession();

    expect(session.entitlements.planId).toBe('pro');
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/api/v1/guard/auth/session',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/api/guard/auth/session',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('does not fallback to portal-canonical route on non-404/501 failures', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        status: 403,
        json: async () => ({ error: 'forbidden' }),
      }),
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    await expect(client.getGuardSession()).rejects.toMatchObject({
      status: 403,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/api/v1/guard/auth/session',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('supports canonical fallback when baseUrl is relative', async () => {
    const sessionPayload = {
      principal: {
        signedIn: true,
        userId: 'user_123',
        email: 'guard@example.com',
        accountId: '0.0.1234',
        stripeCustomerId: 'cus_123',
        roles: ['user'],
      },
      entitlements: {
        planId: 'pro',
        includedMonthlyCredits: 500,
        deviceLimit: 5,
        retentionDays: 90,
        syncEnabled: true,
        premiumFeedsEnabled: true,
        teamPolicyEnabled: false,
      },
      balance: null,
      bucketingMode: 'shared-ledger',
      buckets: [],
    };
    fetchImplementation
      .mockResolvedValueOnce(
        createResponse({ status: 404, json: async () => ({}) }),
      )
      .mockResolvedValueOnce(
        createResponse({ json: async () => sessionPayload }),
      );

    const client = new RegistryBrokerClient({
      baseUrl: '/registry',
      fetchImplementation,
    });

    const session = await client.getGuardSession();

    expect(session.entitlements.planId).toBe('pro');
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      '/registry/api/v1/guard/auth/session',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      '/api/guard/auth/session',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('preserves proxy base path for canonical fallback retries', async () => {
    const sessionPayload = {
      principal: {
        signedIn: true,
        userId: 'user_123',
        email: 'guard@example.com',
        accountId: '0.0.1234',
        stripeCustomerId: 'cus_123',
        roles: ['user'],
      },
      entitlements: {
        planId: 'pro',
        includedMonthlyCredits: 500,
        deviceLimit: 5,
        retentionDays: 90,
        syncEnabled: true,
        premiumFeedsEnabled: true,
        teamPolicyEnabled: false,
      },
      balance: null,
      bucketingMode: 'shared-ledger',
      buckets: [],
    };
    fetchImplementation
      .mockResolvedValueOnce(
        createResponse({ status: 404, json: async () => ({}) }),
      )
      .mockResolvedValueOnce(
        createResponse({ json: async () => sessionPayload }),
      );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com/proxy/api/v1',
      fetchImplementation,
    });

    const session = await client.getGuardSession();

    expect(session.entitlements.planId).toBe('pro');
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/proxy/api/v1/guard/auth/session',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/proxy/api/guard/auth/session',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('retrieves billing balance, trust, and revocation data', async () => {
    fetchImplementation
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            generatedAt: '2026-04-09T18:00:00.000Z',
            bucketingMode: 'shared-ledger',
            buckets: [
              {
                bucketId: 'registry_credits',
                label: 'Shared credits',
                availableCredits: 98,
              },
            ],
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            generatedAt: '2026-04-09T18:00:00.000Z',
            query: {
              sha256:
                '5f70bf18a086007016e948b04aed3b82103a36beab34d7d9f4b5d1f1c6ed7095',
            },
            match: {
              artifactId: 'skill_123',
              artifactName: 'hashnet-mcp',
              artifactType: 'skill',
              artifactSlug: 'hashnet-mcp',
              recommendation: 'review',
              verified: true,
              safetyScore: 94,
              trustScore: 91,
              href: 'https://hol.org/registry/skills/hashnet-mcp',
              ecosystem: 'codex',
            },
            evidence: ['attested', 'verified publisher'],
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            generatedAt: '2026-04-09T18:00:00.000Z',
            query: {
              ecosystem: 'codex',
              name: 'hashnet-mcp',
              version: '1.0.0',
            },
            items: [
              {
                artifactId: 'skill_123',
                artifactName: 'hashnet-mcp',
                artifactType: 'skill',
                artifactSlug: 'hashnet-mcp',
                recommendation: 'monitor',
                verified: true,
                ecosystem: 'codex',
              },
            ],
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            generatedAt: '2026-04-09T18:00:00.000Z',
            items: [
              {
                id: 'rev_123',
                artifactId: 'skill_999',
                artifactName: 'bad-tool',
                reason: 'publisher revoked',
                severity: 'high',
                publishedAt: '2026-04-08T18:00:00.000Z',
                confidence: 0.94,
                remediation: 'Remove the tool and review prior receipts.',
                source: 'curated-guard-feed',
                firstSeenAt: '2026-04-07T18:00:00.000Z',
                lastUpdatedAt: '2026-04-09T18:00:00.000Z',
              },
            ],
          }),
        }),
      );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const balance = await client.getGuardBillingBalance();
    const trustByHash = await client.getGuardTrustByHash(
      '5f70bf18a086007016e948b04aed3b82103a36beab34d7d9f4b5d1f1c6ed7095',
    );
    const resolved = await client.resolveGuardTrust({
      ecosystem: 'codex',
      name: 'hashnet-mcp',
      version: '1.0.0',
    });
    const revocations = await client.getGuardRevocations();

    expect(balance.buckets[0]?.availableCredits).toBe(98);
    expect(trustByHash.match?.artifactName).toBe('hashnet-mcp');
    expect(resolved.items).toHaveLength(1);
    expect(revocations.items[0]?.severity).toBe('high');
    expect(revocations.items[0]?.source).toBe('curated-guard-feed');
    expect(revocations.items[0]?.remediation).toBe(
      'Remove the tool and review prior receipts.',
    );
  });

  it('syncs guard receipts to the broker', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => ({
          syncedAt: '2026-04-09T18:00:00.000Z',
          receiptsStored: 1,
        }),
      }),
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'rb_test_key',
      fetchImplementation,
    });

    const synced = await client.syncGuardReceipts({
      receipts: [
        {
          receiptId: 'receipt_123',
          capturedAt: '2026-04-09T17:59:00.000Z',
          harness: 'codex',
          deviceId: 'device_123',
          deviceName: 'MacBook Pro',
          artifactId: 'skill_123',
          artifactName: 'hashnet-mcp',
          artifactType: 'skill',
          artifactSlug: 'hashnet-mcp',
          artifactHash:
            '5f70bf18a086007016e948b04aed3b82103a36beab34d7d9f4b5d1f1c6ed7095',
          policyDecision: 'allow',
          recommendation: 'monitor',
          changedSinceLastApproval: false,
          publisher: 'hashgraph-online',
          capabilities: ['mcp:list_tools'],
          summary: 'First-party MCP canary approved.',
        },
      ],
    });

    expect(synced.receiptsStored).toBe(1);
    const request = fetchImplementation.mock.calls[0]?.[1] as RequestInit;
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/guard/receipts/sync',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(JSON.parse(String(request.body))).toMatchObject({
      receipts: [
        expect.objectContaining({
          receiptId: 'receipt_123',
          harness: 'codex',
        }),
      ],
    });
  });

  it('retrieves artifact abom and round-trips pain signals', async () => {
    fetchImplementation
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            generatedAt: '2026-04-11T18:00:00.000Z',
            summary: {
              totalArtifacts: 1,
              totalDevices: 1,
              totalHarnesses: 1,
              blockedArtifacts: 1,
              reviewArtifacts: 0,
            },
            items: [
              {
                artifactId: 'skill_123',
                artifactName: 'secret-probe',
                artifactType: 'skill',
                artifactSlug: 'secret-probe',
                harnesses: ['codex'],
                devices: ['device_123'],
                eventCount: 1,
                firstSeenAt: '2026-04-11T17:55:00.000Z',
                lastSeenAt: '2026-04-11T17:59:00.000Z',
                latestDecision: 'block',
                latestRecommendation: 'block',
                latestHash: 'abc123',
                latestSummary: 'Reads secrets and calls an external host.',
              },
            ],
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            generatedAt: '2026-04-11T18:00:00.000Z',
            items: [
              {
                signalId: 'install_time_block:codex:skill_123',
                signalName: 'install_time_block',
                artifactId: 'skill_123',
                artifactName: 'secret-probe',
                artifactType: 'skill',
                harness: 'codex',
                latestSummary: 'Install blocked before registration.',
                firstSeenAt: '2026-04-11T17:55:00.000Z',
                lastSeenAt: '2026-04-11T17:59:00.000Z',
                count: 2,
                source: 'scanner',
              },
            ],
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            generatedAt: '2026-04-11T18:05:00.000Z',
            items: [
              {
                signalId: 'install_time_block:codex:skill_123',
                signalName: 'install_time_block',
                artifactId: 'skill_123',
                artifactName: 'secret-probe',
                artifactType: 'skill',
                harness: 'codex',
                latestSummary: 'Install blocked before registration.',
                firstSeenAt: '2026-04-11T17:55:00.000Z',
                lastSeenAt: '2026-04-11T18:05:00.000Z',
                count: 3,
                source: 'scanner',
              },
            ],
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            generatedAt: '2026-04-11T18:06:00.000Z',
            summary: {
              totalSignals: 1,
              uniqueArtifacts: 1,
              uniqueConsumers: 2,
            },
            items: [
              {
                signalName: 'install_time_block',
                artifactId: 'skill_123',
                artifactName: 'secret-probe',
                artifactType: 'skill',
                totalCount: 3,
                consumerCount: 2,
                harnesses: ['codex'],
                publishers: ['hashgraph-online'],
                firstSeenAt: '2026-04-11T17:55:00.000Z',
                lastSeenAt: '2026-04-11T18:05:00.000Z',
                latestSummary: 'Install blocked before registration.',
              },
            ],
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            name: 'Default team policy',
            reviewMode: 'prompt',
            sharedHarnessDefaults: {
              codex: 'prompt',
            },
            allowedPublishers: ['hashgraph-online'],
            blockedArtifacts: ['skill_123'],
            alertChannel: 'email',
            updatedAt: '2026-04-11T18:06:00.000Z',
            auditTrail: [
              {
                changedAt: '2026-04-11T18:06:00.000Z',
                actor: 'guard@example.com',
                change: 'created',
                summary: 'Created team policy pack.',
              },
            ],
            delegatedApproverEmails: ['security@example.com'],
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            name: 'Default team policy',
            reviewMode: 'enforce',
            sharedHarnessDefaults: {
              codex: 'enforce',
            },
            allowedPublishers: ['hashgraph-online'],
            blockedArtifacts: ['skill_123'],
            blockedPublishers: ['hashgraph-online', 'unknown-publisher'],
            blockedDomains: ['evil.example', 'mirror.evil.example'],
            alertChannel: 'email',
            updatedAt: '2026-04-11T18:07:00.000Z',
            auditTrail: [
              {
                changedAt: '2026-04-11T18:07:00.000Z',
                actor: 'guard@example.com',
                change: 'updated',
                summary: 'Expanded blocked publishers and domains.',
              },
            ],
            delegatedApproverEmails: ['security@example.com'],
          }),
        }),
      );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'rb_test_key',
      fetchImplementation,
    });

    const artifactAbom = await client.exportGuardArtifactAbom('skill_123');
    const painSignals = await client.getGuardPainSignals();
    const updatedSignals = await client.ingestGuardPainSignals([
      {
        signalId: 'install_time_block:codex:skill_123',
        signalName: 'install_time_block',
        artifactId: 'skill_123',
        artifactName: 'secret-probe',
        artifactType: 'skill',
        harness: 'codex',
        latestSummary: 'Install blocked before registration.',
        occurredAt: '2026-04-11T18:05:00.000Z',
      },
    ]);
    const aggregatedSignals = await client.getGuardAggregatedPainSignals();
    const teamPolicyPack = await client.getGuardTeamPolicyPack();
    const updatedTeamPolicyPack = await client.updateGuardTeamPolicyPack({
      reviewMode: 'enforce',
      blockedArtifacts: ['skill_123'],
      blockedPublishers: ['hashgraph-online', 'unknown-publisher'],
      blockedDomains: ['evil.example', 'mirror.evil.example'],
      delegatedApproverEmails: ['security@example.com'],
    });

    expect(artifactAbom.summary.blockedArtifacts).toBe(1);
    expect(painSignals.items[0]?.count).toBe(2);
    expect(updatedSignals.items[0]?.count).toBe(3);
    expect(aggregatedSignals.items[0]?.consumerCount).toBe(2);
    expect(aggregatedSignals.summary.totalSignals).toBe(1);
    expect(aggregatedSignals.items[0]?.publishers).toContain(
      'hashgraph-online',
    );
    expect(teamPolicyPack.blockedPublishers ?? []).toEqual([]);
    expect(updatedTeamPolicyPack.blockedDomains).toContain(
      'mirror.evil.example',
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/api/v1/guard/abom/skill_123',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/api/v1/guard/signals/pain',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      3,
      'https://api.example.com/api/v1/guard/signals/pain',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      4,
      'https://api.example.com/api/v1/guard/signals/pain/aggregate',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      5,
      'https://api.example.com/api/v1/guard/team/policy-pack',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      6,
      'https://api.example.com/api/v1/guard/team/policy-pack',
      expect.objectContaining({ method: 'PUT' }),
    );
    const updateRequest = fetchImplementation.mock.calls[5]?.[1] as RequestInit;
    expect(JSON.parse(String(updateRequest.body))).toMatchObject({
      blockedPublishers: ['hashgraph-online', 'unknown-publisher'],
      blockedDomains: ['evil.example', 'mirror.evil.example'],
    });
  });

  it('omits the guard feed limit query when the truncated value is not positive', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => ({
          generatedAt: '2026-04-12T16:00:00.000Z',
          items: [],
          summary: {
            total: 0,
            monitorCount: 0,
            reviewCount: 0,
            blockCount: 0,
          },
        }),
      }),
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'rb_test_key',
      fetchImplementation,
    });

    const feed = await client.getGuardFeed(0.5);

    expect(feed.items).toHaveLength(0);
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/guard/feed',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('submits guard receipts and retrieves preflight verdicts', async () => {
    fetchImplementation
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            syncedAt: '2026-04-12T15:00:00.000Z',
            receiptsStored: 1,
            inventoryStored: 0,
            inventoryDiff: {
              generatedAt: '2026-04-12T15:00:00.000Z',
              items: [],
            },
            advisories: [],
            policy: {
              mode: 'prompt',
              defaultAction: 'warn',
              unknownPublisherAction: 'review',
              changedHashAction: 'require-reapproval',
              newNetworkDomainAction: 'warn',
              subprocessAction: 'block',
              telemetryEnabled: false,
              syncEnabled: true,
              updatedAt: '2026-04-12T15:00:00.000Z',
            },
            alertPreferences: {
              emailEnabled: true,
              digestMode: 'daily',
              watchlistEnabled: true,
              advisoriesEnabled: true,
              repeatedWarningsEnabled: true,
              teamAlertsEnabled: false,
              updatedAt: '2026-04-12T15:00:00.000Z',
            },
            exceptions: [],
            teamPolicyPack: {
              name: 'Default team policy',
              sharedHarnessDefaults: {
                hermes: 'enforce',
              },
              allowedPublishers: ['hashgraph-online'],
              blockedPublishers: ['forked-inc'],
              blockedDomains: ['evil.example'],
              blockedArtifacts: ['plugin:forked/risky-tool'],
              alertChannel: 'email',
              updatedAt: '2026-04-12T15:00:00.000Z',
              auditTrail: [],
            },
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            generatedAt: '2026-04-12T15:01:00.000Z',
            principal: {
              signedIn: true,
              principalType: 'service',
              serviceId: 'hermes-agent',
              workspaceId: 'workspace-alpha',
              serviceLabel: 'Hermes Workspace',
              roles: ['guard:service'],
            },
            decision: 'review',
            recommendation: 'review',
            rationale: 'Guard wants review before install for Risky Tool.',
            category: 'trust',
            confidence: 0.76,
            freshnessTimestamp: '2026-04-12T15:01:00.000Z',
            evidenceSources: ['trust-feed'],
            scope: 'artifact',
            matchedEvidence: [
              {
                category: 'trust',
                source: 'trust-feed',
                detail: 'Review required for Risky Tool.',
              },
            ],
            matchedException: null,
            trustMatch: null,
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            generatedAt: '2026-04-12T15:02:00.000Z',
            principal: {
              signedIn: true,
              principalType: 'service',
              serviceId: 'hermes-agent',
              workspaceId: 'workspace-alpha',
              serviceLabel: 'Hermes Workspace',
              roles: ['guard:service'],
            },
            decision: 'block',
            recommendation: 'block',
            rationale: 'Team policy blocks Risky Tool before execution.',
            category: 'team-policy',
            confidence: 0.98,
            freshnessTimestamp: '2026-04-12T15:02:00.000Z',
            evidenceSources: ['team-policy'],
            scope: 'artifact',
            matchedEvidence: [
              {
                category: 'team-policy',
                source: 'team-policy',
                detail: 'Blocked artifact plugin:forked/risky-tool.',
              },
            ],
            matchedException: null,
            trustMatch: null,
          }),
        }),
      );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'rb_test_key',
      fetchImplementation,
    });

    const submitted = await client.submitGuardReceipts({
      receipts: [
        {
          receiptId: 'receipt_456',
          capturedAt: '2026-04-12T14:59:00.000Z',
          harness: 'hermes',
          deviceId: 'workspace-alpha',
          deviceName: 'Hermes Workspace',
          artifactId: 'plugin:forked/risky-tool',
          artifactName: 'Risky Tool',
          artifactType: 'plugin',
          artifactSlug: 'forked/risky-tool',
          artifactHash: 'def456',
          policyDecision: 'block',
          recommendation: 'block',
          changedSinceLastApproval: true,
          publisher: 'forked-inc',
          capabilities: ['network.egress'],
          summary: 'Execution blocked before tool dispatch.',
        },
      ],
    });
    const installVerdict = await client.getGuardPreInstallVerdict({
      harness: 'hermes',
      artifactName: 'Risky Tool',
      artifactType: 'plugin',
      artifactId: 'plugin:forked/risky-tool',
      publisher: 'forked-inc',
    });
    const executionVerdict = await client.getGuardPreExecutionVerdict({
      harness: 'hermes',
      artifactName: 'Risky Tool',
      artifactType: 'plugin',
      artifactId: 'plugin:forked/risky-tool',
      publisher: 'forked-inc',
    });

    expect(submitted.receiptsStored).toBe(1);
    expect(installVerdict.principal.principalType).toBe('service');
    expect(installVerdict.decision).toBe('review');
    expect(installVerdict.category).toBe('trust');
    expect(installVerdict.evidenceSources).toContain('trust-feed');
    expect(executionVerdict.decision).toBe('block');
    expect(executionVerdict.category).toBe('team-policy');
    expect(executionVerdict.evidenceSources).toContain('team-policy');
    expect(submitted.policy?.mode).toBe('prompt');
    expect(submitted.teamPolicyPack?.name).toBe('Default team policy');
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/api/v1/guard/receipts/submit',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/api/v1/guard/verdict/pre-install',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      3,
      'https://api.example.com/api/v1/guard/verdict/pre-execution',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('retrieves guard overview/feed and uses explicit cloud-agent aliases', async () => {
    fetchImplementation
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            generatedAt: '2026-04-12T16:00:00.000Z',
            items: [
              {
                id: 'curated:malicious-skill',
                artifactType: 'skill',
                slug: 'malicious-skill',
                name: 'Malicious Skill',
                href: '/registry/skills/malicious-skill',
                ecosystem: 'codex',
                safetyScore: 12,
                trustScore: 18,
                verified: false,
                recommendation: 'block',
                updatedAt: '2026-04-12T16:00:00.000Z',
              },
            ],
            summary: {
              total: 1,
              monitorCount: 0,
              reviewCount: 0,
              blockCount: 1,
            },
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            generatedAt: '2026-04-12T16:01:00.000Z',
            principal: {
              signedIn: true,
              principalType: 'service',
              serviceId: 'hermes-agent',
              workspaceId: 'workspace-alpha',
              serviceLabel: 'Hermes Workspace',
              roles: ['guard:service'],
            },
            entitlements: {
              planId: 'team',
              includedMonthlyCredits: 5000,
              deviceLimit: 10,
              retentionDays: 30,
              syncEnabled: true,
              premiumFeedsEnabled: true,
              teamPolicyEnabled: true,
            },
            balance: {
              accountId: 'workspace-alpha',
              availableCredits: 900,
            },
            trustFeed: {
              generatedAt: '2026-04-12T16:01:00.000Z',
              items: [],
              summary: {
                total: 0,
                monitorCount: 0,
                reviewCount: 0,
                blockCount: 0,
              },
            },
            integrations: [
              {
                id: 'hermes',
                name: 'Hermes',
                status: 'available',
                href: '/guard/integrations/hermes',
                summary: 'Managed workspace policy checks',
              },
            ],
            actionItems: [
              {
                title: 'Review risky artifacts',
                description: 'Check the current risky workspace artifacts.',
                href: '/guard/review',
              },
            ],
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            mode: 'enforce',
            defaultAction: 'warn',
            unknownPublisherAction: 'review',
            changedHashAction: 'require-reapproval',
            newNetworkDomainAction: 'warn',
            subprocessAction: 'block',
            telemetryEnabled: false,
            syncEnabled: true,
            updatedAt: '2026-04-12T16:02:00.000Z',
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            generatedAt: '2026-04-12T16:03:00.000Z',
            items: [
              {
                id: 'rev_123',
                artifactId: 'plugin:forked/risky-tool',
                artifactName: 'Risky Tool',
                reason: 'Known malicious maintainer release.',
                severity: 'high',
                publishedAt: '2026-04-12T15:50:00.000Z',
              },
            ],
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            generatedAt: '2026-04-12T16:04:00.000Z',
            items: [
              {
                exceptionId: 'artifact:plugin:forked/risky-tool',
                scope: 'artifact',
                harness: null,
                artifactId: 'plugin:forked/risky-tool',
                publisher: null,
                reason: 'Incident response window',
                owner: 'security@hashgraph.online',
                source: 'manual',
                expiresAt: '2099-01-01T00:00:00.000Z',
                createdAt: '2026-04-12T16:04:00.000Z',
                updatedAt: '2026-04-12T16:04:00.000Z',
              },
            ],
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            generatedAt: '2026-04-12T16:05:00.000Z',
            matched: true,
            scope: 'domain',
            item: {
              artifactId: 'plugin:forked/risky-tool',
              publisher: 'forked-inc',
              domain: 'evil.example',
              source: 'team-policy',
              reason: 'Blocked domain evil.example.',
            },
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            syncedAt: '2026-04-12T16:06:00.000Z',
            receiptsStored: 0,
            inventoryStored: 1,
          }),
        }),
      );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'rb_test_key',
      fetchImplementation,
    });

    const feed = await client.getGuardFeed(6);
    const overview = await client.getGuardOverview();
    const policy = await client.fetchGuardPolicy();
    const advisories = await client.fetchGuardAdvisories();
    const exceptions = await client.requestGuardException({
      scope: 'artifact',
      artifactId: 'plugin:forked/risky-tool',
      reason: 'Incident response window',
      owner: 'security@hashgraph.online',
      source: 'manual',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    const watchlistLookup = await client.lookupGuardWatchlist({
      harness: 'hermes',
      artifactName: 'Risky Tool',
      artifactType: 'plugin',
      artifactId: 'plugin:forked/risky-tool',
      publisher: 'forked-inc',
      domain: 'evil.example',
    });
    const inventorySync = await client.syncGuardInventory({
      receipts: [],
      inventory: [
        {
          artifactId: 'plugin:forked/risky-tool',
          artifactName: 'Risky Tool',
          artifactType: 'plugin',
          artifactSlug: 'forked/risky-tool',
          harnesses: ['hermes'],
          devices: ['workspace-alpha'],
          eventCount: 1,
          firstSeenAt: '2026-04-12T16:06:00.000Z',
          lastSeenAt: '2026-04-12T16:06:00.000Z',
          latestDecision: 'block',
          latestRecommendation: 'block',
          latestHash: 'sha256-risky-tool',
          latestSummary: 'Blocked before execution.',
        },
      ],
    });

    expect(feed.items[0]?.recommendation).toBe('block');
    expect(overview.principal.principalType).toBe('service');
    expect(policy.mode).toBe('enforce');
    expect(advisories.items[0]?.artifactId).toBe('plugin:forked/risky-tool');
    expect(exceptions.items[0]?.owner).toBe('security@hashgraph.online');
    expect(watchlistLookup.scope).toBe('domain');
    expect(inventorySync.inventoryStored).toBe(1);
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/api/v1/guard/feed?limit=6',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/api/v1/guard/overview',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      3,
      'https://api.example.com/api/v1/guard/policy/fetch',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      4,
      'https://api.example.com/api/v1/guard/advisories',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      5,
      'https://api.example.com/api/v1/guard/exceptions/request',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      6,
      'https://api.example.com/api/v1/guard/watchlist/lookup',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      7,
      'https://api.example.com/api/v1/guard/inventory/sync',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
