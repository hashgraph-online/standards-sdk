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

describe('RegistryBrokerClient credit helpers', () => {
  const fetchImplementation = jest.fn<typeof fetch>();

  beforeEach(() => {
    fetchImplementation.mockReset();
  });

  it('retrieves credit balance for the authenticated account', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => ({
          accountId: '0.0.1234',
          balance: 91,
          timestamp: '2026-04-05T18:00:00.000Z',
        }),
      }),
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'rb_test_key',
      accountId: '0.0.1234',
      fetchImplementation,
    });

    const balance = await client.getCreditsBalance({ accountId: '0.0.1234' });

    expect(balance.accountId).toBe('0.0.1234');
    expect(balance.balance).toBe(91);
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/credits/balance?accountId=0.0.1234',
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers),
      }),
    );
  });

  it('retrieves available credit providers', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => ({
          providers: [
            {
              name: 'stripe',
              publishableKey: 'pk_test_123',
              currency: 'usd',
              centsPerHbar: 100,
            },
          ],
        }),
      }),
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const providers = await client.getCreditProviders();

    expect(providers.providers).toHaveLength(1);
    expect(providers.providers[0]?.name).toBe('stripe');
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/credits/providers',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('creates an HBAR purchase intent without exposing signing to the broker', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => ({
          transaction: 'AQID',
          transactionId: '0.0.1234@1712332800.000000000',
          network: 'mainnet',
          accountId: '0.0.1234',
          treasuryAccountId: '0.0.98',
          hbarAmount: 3,
          credits: 300,
          tinybarAmount: 300000000,
          memo: 'skill-publish funding',
          centsPerHbar: 100,
          validStart: '2026-04-05T18:00:00.000Z',
          validDurationSeconds: 120,
          requiresManualSubmit: true,
          purchaseId: 'purchase_123',
        }),
      }),
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'rb_test_key',
      accountId: '0.0.1234',
      fetchImplementation,
    });

    const intent = await client.createHbarPurchaseIntent({
      accountId: '0.0.1234',
      hbarAmount: 3,
      memo: 'skill-publish funding',
    });

    expect(intent.requiresManualSubmit).toBe(true);
    expect(intent.purchaseId).toBe('purchase_123');
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/credits/payments/hbar/intent',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
        body: JSON.stringify({
          accountId: '0.0.1234',
          hbarAmount: 3,
          memo: 'skill-publish funding',
        }),
      }),
    );
  });
});
