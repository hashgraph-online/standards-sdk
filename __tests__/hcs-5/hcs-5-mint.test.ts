import { HCS5Client } from '../../src/hcs-5/sdk';
import { buildHcs1Hrl } from '../../src/hcs-5/types';

jest.mock('../../src/services/mirror-node', () => ({
  HederaMirrorNode: jest.fn().mockImplementation(() => ({
    requestAccount: jest
      .fn()
      .mockResolvedValue({ key: { _type: 'ECDSA_SECP256K1' } }),
    getTokenInfo: jest
      .fn()
      .mockResolvedValue({ supply_key: { _type: 'ECDSA_SECP256K1' } }),
  })),
}));

jest.mock('../../src/utils/key-type-detector', () => ({
  detectKeyTypeFromString: jest.fn((k: string) => ({
    privateKey: { parsedFrom: k },
  })),
}));

jest.mock('../../src/inscribe/inscriber', () => ({
  inscribe: jest.fn(async () => ({
    confirmed: true,
    result: { jobId: 'x', transactionId: 'y' },
    inscription: { topic_id: '0.0.12345', jsonTopicId: '0.0.54321' },
  })),
}));

jest.mock('@hashgraph/sdk', () => {
  const clientFactory = {
    forMainnet: jest.fn(() => ({ setOperator: jest.fn() })),
    forTestnet: jest.fn(() => ({ setOperator: jest.fn() })),
  };

  class TokenMintTransaction {
    private _tokenId?: string;
    private _metadata?: Buffer[];
    public signedWith?: unknown;

    setTokenId(id: string) {
      this._tokenId = id;
      return this;
    }
    setMetadata(md: Buffer[]) {
      this._metadata = md;
      return this;
    }
    async freezeWith(_: unknown) {
      return this;
    }
    async sign(key: unknown) {
      this.signedWith = key;
      return this;
    }
    async execute(_: unknown) {
      const tokenId = this._tokenId;
      const metadata = this._metadata?.[0]?.toString();
      return {
        transactionId: { toString: () => '0.0.0@0.0' },
        getReceipt: async () => ({
          serials: [{ toString: () => '1' }],
          _tokenId: tokenId,
          _metadata: metadata,
        }),
      } as const;
    }
  }

  return {
    Client: clientFactory,
    TokenId: { fromString: (s: string) => s },
    AccountId: { fromString: (s: string) => ({ toString: () => s }) },
    PrivateKey: {
      fromStringECDSA: (s: string) => ({ kind: 'ecdsa', raw: s }),
      fromStringED25519: (s: string) => ({ kind: 'ed25519', raw: s }),
    },
    TokenMintTransaction,
  };
});

describe('HCS-5: buildHcs1Hrl', () => {
  it('builds correct HRL for HCS-1 topics', () => {
    expect(buildHcs1Hrl('0.0.123')).toBe('hcs://1/0.0.123');
  });
});

describe('HCS-5: mint()', () => {
  it('mints with supplied topic id and signs with supply key', async () => {
    const { Client } = await import('@hashgraph/sdk');
    const client = new HCS5Client({
      network: 'mainnet',
      operatorId: '0.0.1001',
      operatorKey: '302e020100300506032b657004220420...',
    });

    const res = await client.mint({
      tokenId: '0.0.2002',
      metadataTopicId: '0.0.999',
      supplyKey: 'private-key-for-supply',
    });

    expect(res.success).toBe(true);
    expect(res.serialNumber).toBe(1);
    expect(res.metadata).toBe('hcs://1/0.0.999');
    expect((Client as any).forMainnet).toHaveBeenCalled();
  });

  it('mints without supply key (no extra signature)', async () => {
    const { Client } = await import('@hashgraph/sdk');
    const client = new HCS5Client({
      network: 'testnet',
      operatorId: '0.0.3',
      operatorKey: 'operator-key',
    });

    const res = await client.mint({
      tokenId: '0.0.5',
      metadataTopicId: '0.0.6',
    });
    expect(res.success).toBe(true);
    expect((Client as any).forTestnet).toHaveBeenCalled();
  });

  it('returns error if metadataTopicId missing', async () => {
    const client = new HCS5Client({
      network: 'testnet',
      operatorId: '0.0.3',
      operatorKey: 'operator-key',
    });

    const res = await client.mint({ tokenId: '0.0.5' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/metadataTopicId is required/);
  });
});

describe('HCS-5: createHashinal()', () => {
  it('inscribes then mints using jsonTopicId', async () => {
    const client = new HCS5Client({
      network: 'testnet',
      operatorId: '0.0.3',
      operatorKey: 'operator-key',
    });

    const res = await client.createHashinal({
      tokenId: '0.0.7',
      inscriptionInput: {
        type: 'buffer',
        buffer: Buffer.from('{}'),
        fileName: 'metadata.json',
      },
      inscriptionOptions: {
        mode: 'hashinal',
        metadata: {
          name: 'x',
          creator: 'y',
          description: 'd',
          type: 'application/json',
        },
      },
    });

    expect(res.success).toBe(true);
    expect(res.metadata).toBe('hcs://1/0.0.54321');
  });

  it('errors when inscription returns no topic id', async () => {
    const { inscribe } = await import('../../src/inscribe/inscriber');
    (inscribe as unknown as jest.Mock).mockResolvedValueOnce({
      confirmed: true,
      inscription: { topic_id: undefined, jsonTopicId: undefined },
    });

    const client = new HCS5Client({
      network: 'testnet',
      operatorId: '0.0.3',
      operatorKey: 'operator-key',
    });

    const res = await client.createHashinal({
      tokenId: '0.0.7',
      inscriptionInput: {
        type: 'buffer',
        buffer: Buffer.from('{}'),
        fileName: 'metadata.json',
      },
      inscriptionOptions: {
        mode: 'hashinal',
        metadata: {
          name: 'x',
          creator: 'y',
          description: 'd',
          type: 'application/json',
        },
      },
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/No topic ID/);
  });

  it('errors when inscription not confirmed', async () => {
    const { inscribe } = await import('../../src/inscribe/inscriber');
    (inscribe as unknown as jest.Mock).mockResolvedValueOnce({
      confirmed: false,
    });

    const client = new HCS5Client({
      network: 'testnet',
      operatorId: '0.0.3',
      operatorKey: 'operator-key',
    });

    const res = await client.createHashinal({
      tokenId: '0.0.7',
      inscriptionInput: {
        type: 'buffer',
        buffer: Buffer.from('{}'),
        fileName: 'metadata.json',
      },
      inscriptionOptions: {
        mode: 'hashinal',
        metadata: {
          name: 'x',
          creator: 'y',
          description: 'd',
          type: 'application/json',
        },
      },
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/inscribe/);
  });
});

describe('HCS-5: supply key parsing fallback', () => {
  it('falls back to ECDSA parser when detection fails', async () => {
    const detectors = await import('../../src/utils/key-type-detector');
    (
      detectors.detectKeyTypeFromString as unknown as jest.Mock
    ).mockImplementationOnce(() => {
      throw new Error('fail-detect');
    });

    const client = new HCS5Client({
      network: 'testnet',
      operatorId: '0.0.3',
      operatorKey: 'operator-key',
    });

    const res = await client.mint({
      tokenId: '0.0.8',
      metadataTopicId: '0.0.9',
      supplyKey: 'string-key',
    });

    expect(res.success).toBe(true);
  });
});
