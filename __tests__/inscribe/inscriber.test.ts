import path from 'node:path';
import { optionalImport } from '../../src/utils/dynamic-import';
import {
  getRegistryBrokerQuote,
  inscribe,
} from '../../src/inscribe/inscriber';

const mockInscribeAndExecute = jest.fn();
const mockGetTransaction = jest.fn();

jest.mock('@kiloscribe/inscription-sdk', () => ({
  InscriptionSDK: jest.fn().mockImplementation(() => ({
    inscribeAndExecute: mockInscribeAndExecute,
  })),
}));

jest.mock('../../src/utils/dynamic-import', () => ({
  optionalImport: jest.fn(),
}));

jest.mock('../../src/services/mirror-node', () => ({
  HederaMirrorNode: jest.fn().mockImplementation(() => ({
    getTransaction: mockGetTransaction,
  })),
}));

jest.mock('../../src/inscribe/inscription-cost', () => ({
  computeInscriptionCostSummary: jest.fn(() => undefined),
}));

jest.mock('../../src/utils/sleep', () => ({
  sleep: jest.fn(async () => undefined),
}));

const fixturePath = path.join(process.cwd(), 'Hashgraph-Online.png');

describe('inscriber file-type handling', () => {
  const mockOptionalImport = jest.mocked(optionalImport);

  beforeEach(() => {
    jest.clearAllMocks();
    mockInscribeAndExecute.mockResolvedValue({
      jobId: '0.0.123@1712534400.000000001',
      transactionId: '0.0.123@1712534400.000000001',
    });
    mockGetTransaction.mockResolvedValue(null);
  });

  it('uses detected MIME types for direct file inscriptions', async () => {
    mockOptionalImport.mockResolvedValue({
      fileTypeFromBuffer: jest.fn(async () => ({
        ext: 'webp',
        mime: 'image/webp',
      })),
    });

    const result = await inscribe(
      { type: 'file', path: fixturePath },
      {
        accountId: '0.0.123',
        privateKey:
          '302e020100300506032b657004220420aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        network: 'testnet',
      },
      {
        apiKey: 'demo-key',
        waitForConfirmation: false,
        logging: { level: 'silent' },
      },
    );

    expect(result.confirmed).toBe(false);
    expect(mockInscribeAndExecute).toHaveBeenCalledTimes(1);
    expect(mockInscribeAndExecute.mock.calls[0][0]).toMatchObject({
      file: {
        type: 'base64',
        fileName: 'Hashgraph-Online.png',
        mimeType: 'image/webp',
      },
    });
    expect(mockOptionalImport).toHaveBeenCalledTimes(1);
  });

  it('falls back to extension-based MIME types for broker quotes when sniffing fails', async () => {
    mockOptionalImport.mockResolvedValue({
      fileTypeFromBuffer: jest.fn(async () => {
        throw new Error('unsupported');
      }),
    });

    const fetchMock = jest.fn(async () => {
      return new Response(
        JSON.stringify({
          quoteId: 'quote-1',
          contentHash: 'hash',
          sizeBytes: 1,
          totalCostHbar: 1,
          credits: 1,
          usdCents: 1,
          expiresAt: '2026-01-01T00:00:00Z',
          mode: 'file',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    });

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
      writable: true,
    });

    await getRegistryBrokerQuote(
      { type: 'file', path: fixturePath },
      {
        apiKey: 'demo-key',
        logging: { level: 'silent' },
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).mimeType,
    ).toBe('image/png');
    expect(mockOptionalImport).toHaveBeenCalledTimes(1);
  });
});
