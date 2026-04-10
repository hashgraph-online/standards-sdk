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
});
