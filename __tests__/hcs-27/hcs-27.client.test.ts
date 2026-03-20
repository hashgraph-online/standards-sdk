import { createHash } from 'crypto';
import { HCS27BaseClient } from '../../src/hcs-27/base-client';
import { canonicalizeHCS27Json } from '../../src/hcs-27/merkle';
import { HCS27Client } from '../../src/hcs-27/sdk';

jest.mock('../../src/inscribe/inscriber', () => ({
  inscribe: jest.fn(),
}));

describe('HCS27BaseClient', () => {
  const client = new HCS27BaseClient({ network: 'testnet' });

  const rootHash = (value: string): string =>
    createHash('sha256').update(value).digest('base64url');

  const validMetadata = {
    type: 'ans-checkpoint-v1' as const,
    stream: { registry: 'ans', log_id: 'default' },
    log: {
      alg: 'sha-256' as const,
      leaf: 'sha256(jcs(event))',
      merkle: 'rfc9162' as const,
    },
    root: {
      treeSize: '1',
      rootHashB64u: rootHash('root'),
    },
  };

  it('builds and parses topic memos', () => {
    expect(client.buildTopicMemo(3600)).toBe('hcs-27:0:3600:0');
    expect(client.parseTopicMemo('hcs-27:0:3600:0')).toEqual({
      indexedFlag: 0,
      ttlSeconds: 3600,
      topicType: 0,
    });
  });

  it('returns the empty-root and leaf vectors', () => {
    expect(client.emptyRoot().toString('hex')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(
      client.leafHashHexFromEntry({
        event: 'register',
        issued_at: '2026-01-01T00:00:00Z',
        log_id: 'default',
        payload: {
          hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          uri: 'hcs://1/0.0.123',
        },
        record_id: 'registry-native-id',
        registry: 'example',
      }),
    ).toBe('a12882925d08570166fe748ebdc16670fc0c69428e2b60ed388b35b52c91d6e2');
  });

  it('canonicalizes object keys with code-point ordering', () => {
    expect(canonicalizeHCS27Json({ a: 1, Z: 2 }).toString('utf8')).toBe(
      '{"Z":2,"a":1}',
    );
  });

  it('validates a draft-compliant checkpoint message', async () => {
    await expect(
      client.validateCheckpointMessage({
        p: 'hcs-27',
        op: 'register',
        metadata: validMetadata,
      }),
    ).resolves.toEqual(validMetadata);
  });

  it('rejects non-canonical tree sizes', async () => {
    await expect(
      client.validateCheckpointMessage({
        p: 'hcs-27',
        op: 'register',
        metadata: {
          ...validMetadata,
          root: {
            treeSize: '01',
            rootHashB64u: rootHash('root'),
          },
        },
      }),
    ).rejects.toThrow();
  });

  it('resolves HCS-1 metadata references and checks digests', async () => {
    const metadataBytes = Buffer.from(JSON.stringify(validMetadata), 'utf8');
    await expect(
      client.validateCheckpointMessage(
        {
          p: 'hcs-27',
          op: 'register',
          metadata: 'hcs://1/0.0.123',
          metadata_digest: {
            alg: 'sha-256',
            b64u: createHash('sha256')
              .update(metadataBytes)
              .digest('base64url'),
          },
        },
        async () => metadataBytes,
      ),
    ).resolves.toEqual(validMetadata);
  });

  it('verifies inclusion and consistency proof objects', () => {
    const leafHex =
      'a12882925d08570166fe748ebdc16670fc0c69428e2b60ed388b35b52c91d6e2';
    const rootB64 = Buffer.from(leafHex, 'hex').toString('base64');

    expect(
      client.verifyInclusionProof({
        leafHash: leafHex,
        leafIndex: '0',
        treeSize: '1',
        path: [],
        rootHash: rootB64,
        treeVersion: 1,
      }),
    ).toBe(true);

    expect(
      client.verifyConsistencyProof({
        oldTreeSize: '0',
        newTreeSize: '10',
        oldRootHash: '',
        newRootHash: 'ignored',
        consistencyPath: [],
        treeVersion: 1,
      }),
    ).toBe(true);
  });

  it('validates checkpoint chain linkage', () => {
    expect(() =>
      client.validateCheckpointChain([
        {
          topicId: '0.0.123',
          sequence: 1,
          consensusTimestamp: '1.2',
          message: { p: 'hcs-27', op: 'register', metadata: validMetadata },
          effectiveMetadata: {
            ...validMetadata,
            root: { treeSize: '1', rootHashB64u: rootHash('root-1') },
          },
        },
        {
          topicId: '0.0.123',
          sequence: 2,
          consensusTimestamp: '1.3',
          message: { p: 'hcs-27', op: 'register', metadata: validMetadata },
          effectiveMetadata: {
            ...validMetadata,
            root: { treeSize: '2', rootHashB64u: rootHash('root-2') },
            prev: { treeSize: '1', rootHashB64u: rootHash('root-1') },
          },
        },
      ]),
    ).not.toThrow();
  });
});

describe('HCS27Client overflow payload', () => {
  const createClient = (): HCS27Client =>
    new HCS27Client({
      operatorId: '0.0.1001',
      operatorKey:
        '302e020100300506032b657004220420fb77695921a5c79474d57c42006f03ff178688514d797fb30f60fd0fc9e82716',
      network: 'testnet',
    });

  it('switches to an HCS-1 pointer when metadata exceeds 1024 bytes', async () => {
    const { inscribe } = await import('../../src/inscribe/inscriber');
    const mockedInscribe = jest.mocked(inscribe);
    mockedInscribe.mockResolvedValue({
      confirmed: true,
      result: {} as never,
      inscription: { topicId: '0.0.900000' },
    });

    const client = createClient();

    const prepared = await (
      client as unknown as {
        prepareCheckpointPayload(
          metadata: Record<string, unknown>,
          messageMemo?: string,
        ): Promise<{ message: Record<string, unknown> }>;
      }
    ).prepareCheckpointPayload(
      {
        type: 'ans-checkpoint-v1',
        stream: { registry: 'ans', log_id: 'overflow' },
        log: {
          alg: 'sha-256',
          leaf: 'sha256(jcs(event))-'.repeat(90),
          merkle: 'rfc9162',
        },
        root: {
          treeSize: '1',
          rootHashB64u: createHash('sha256')
            .update('root-overflow')
            .digest('base64url'),
        },
      },
      'overflow checkpoint',
    );

    expect(prepared.message.metadata).toBe('hcs://1/0.0.900000');
    expect(prepared.message.metadata_digest).toBeDefined();
  });

  it('throws a descriptive error for invalid topic keys', () => {
    const client = createClient();
    const resolveTopicKey = Reflect.get(client, 'resolveTopicKey') as (
      input: string,
    ) => unknown;

    expect(() => resolveTopicKey('definitely-not-a-key')).toThrow(
      'Failed to parse topic key as PublicKey or PrivateKey',
    );
  });

  it('rejects unsafe topic sequence numbers', () => {
    const client = createClient();
    const parseSequenceNumber = Reflect.get(
      client,
      'parseSequenceNumber',
    ) as (value: { toString(): string }) => number;

    expect(() =>
      parseSequenceNumber({
        toString: () => '9007199254740992',
      }),
    ).toThrow('topicSequenceNumber exceeds Number.MAX_SAFE_INTEGER');
  });
});
