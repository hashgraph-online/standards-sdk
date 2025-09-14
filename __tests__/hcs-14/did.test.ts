import { createUaid, parseHcs14Did } from '../../src/hcs-14/did';
import { canonicalizeAgentData } from '../../src/hcs-14/canonical';
import { base58Encode } from '../../src/hcs-14/base58';
import { getCryptoAdapter } from '../../src/utils/crypto-abstraction';

jest.mock('../../src/hcs-14/canonical');
jest.mock('../../src/hcs-14/base58');
jest.mock('../../src/utils/crypto-abstraction');

describe('HCS-14 DID Generation and Parsing', () => {
  const mockCanonicalizeAgentData =
    canonicalizeAgentData as jest.MockedFunction<typeof canonicalizeAgentData>;
  const mockBase58Encode = base58Encode as jest.MockedFunction<
    typeof base58Encode
  >;
  const mockGetCryptoAdapter = getCryptoAdapter as jest.MockedFunction<
    typeof getCryptoAdapter
  >;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCanonicalizeAgentData.mockReturnValue({
      normalized: {
        registry: 'test-registry',
        name: 'test-agent',
        version: '1.0.0',
        protocol: 'hcs-14',
        nativeId: '0.0.12345',
        skills: [1, 2, 3],
      },
      canonicalJson:
        '{"skills":[1,2,3],"name":"test-agent","nativeId":"0.0.12345","protocol":"hcs-14","registry":"test-registry","version":"1.0.0"}',
    });

    mockBase58Encode.mockReturnValue('mock-encoded-id');

    const mockAdapter = {
      createHash: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockResolvedValue(Buffer.from('mock-digest')),
      }),
    };
    mockGetCryptoAdapter.mockReturnValue(mockAdapter);
  });

  describe('createUaid (AID path)', () => {
    test('should generate AID DID without params', async () => {
      const input = {
        registry: 'test-registry',
        name: 'test-agent',
        version: '1.0.0',
        protocol: 'hcs-14',
        nativeId: '0.0.12345',
        skills: [1, 2, 3],
      };

      const result = await createUaid(input);

      expect(mockCanonicalizeAgentData).toHaveBeenCalledWith(input);
      expect(mockGetCryptoAdapter).toHaveBeenCalled();
      expect(result).toBe(
        'uaid:aid:mock-encoded-id;uid=0;registry=test-registry;nativeId=0.0.12345',
      );
    });

    test('should generate AID DID with custom params', async () => {
      const input = {
        registry: 'test-registry',
        name: 'test-agent',
        version: '1.0.0',
        protocol: 'hcs-14',
        nativeId: '0.0.12345',
        skills: [1, 2, 3],
      };
      const params = {
        registry: 'custom-registry',
        proto: 'custom-proto',
        uid: 'custom-uid',
      };

      const result = await createUaid(input, params);

      expect(result).toBe(
        'uaid:aid:mock-encoded-id;uid=custom-uid;registry=custom-registry;proto=custom-proto;nativeId=0.0.12345',
      );
    });

    test('should generate AID DID without params when includeParams is false', async () => {
      const input = {
        registry: 'test-registry',
        name: 'test-agent',
        version: '1.0.0',
        protocol: 'hcs-14',
        nativeId: '0.0.12345',
        skills: [1, 2, 3],
      };

      const result = await createUaid(input, {}, { includeParams: false });

      expect(result).toBe('uaid:aid:mock-encoded-id');
    });

    test('should merge params with defaults', async () => {
      const input = {
        registry: 'test-registry',
        name: 'test-agent',
        version: '1.0.0',
        protocol: 'hcs-14',
        nativeId: '0.0.12345',
        skills: [1, 2, 3],
      };
      const params = {
        registry: 'custom-registry', // Override default
        proto: 'custom-proto', // New param
      };

      const result = await createUaid(input, params);

      expect(result).toBe(
        'uaid:aid:mock-encoded-id;uid=0;registry=custom-registry;proto=custom-proto;nativeId=0.0.12345',
      );
    });

    test('should handle empty params object', async () => {
      const input = {
        registry: 'test-registry',
        name: 'test-agent',
        version: '1.0.0',
        protocol: 'hcs-14',
        nativeId: '0.0.12345',
        skills: [1, 2, 3],
      };

      const result = await createUaid(input, {});

      expect(result).toBe(
        'uaid:aid:mock-encoded-id;uid=0;registry=test-registry;nativeId=0.0.12345',
      );
    });

    test('should call crypto adapter with correct parameters', async () => {
      const input = {
        registry: 'test-registry',
        name: 'test-agent',
        version: '1.0.0',
        protocol: 'hcs-14',
        nativeId: '0.0.12345',
        skills: [1, 2, 3],
      };

      await createUaid(input);

      const mockAdapter = mockGetCryptoAdapter.mock.results[0].value;
      expect(mockAdapter.createHash).toHaveBeenCalledWith('sha384');
      const mockHash = mockAdapter.createHash.mock.results[0].value;
      expect(mockHash.update).toHaveBeenCalledWith(
        Buffer.from(
          '{"skills":[1,2,3],"name":"test-agent","nativeId":"0.0.12345","protocol":"hcs-14","registry":"test-registry","version":"1.0.0"}',
          'utf8',
        ),
      );
      expect(mockHash.digest).toHaveBeenCalled();
      expect(mockBase58Encode).toHaveBeenCalledWith(Buffer.from('mock-digest'));
    });
  });

  describe('createUaid (DID path)', () => {
    test('should generate UAID DID from AID DID', () => {
      const existingDid = 'uaid:aid:abc123;registry=test;nativeId=0.0.123';
      const params = {
        registry: 'new-registry',
        proto: 'new-proto',
      };

      const result = createUaid(existingDid, params);

      expect(result).toBe(
        'uaid:did:abc123;registry=new-registry;proto=new-proto;src=zmock-encoded-id',
      );
    });

    test('should generate UAID DID without additional params', () => {
      const existingDid = 'uaid:aid:abc123;registry=test;nativeId=0.0.123';

      const result = createUaid(existingDid);

      expect(result).toBe('uaid:did:abc123;src=zmock-encoded-id');
    });

    test('should generate UAID DID from AID DID without params', () => {
      const existingDid = 'uaid:aid:simple-id';

      const result = createUaid(existingDid);

      expect(result).toBe('uaid:did:simple-id');
    });

    test('should throw error for invalid DID format', () => {
      expect(() => createUaid('invalid-did')).toThrow(
        'Invalid DID format',
      );
      expect(() => createUaid('did:invalid')).toThrow(
        'Invalid DID format',
      );
      expect(() => createUaid('not-a-did')).toThrow('Invalid DID format');
    });

    test('should handle empty params', () => {
      const existingDid = 'uaid:aid:abc123;registry=test';
      const params = {};

      const result = createUaid(existingDid, params);

      expect(result).toBe('uaid:did:abc123;src=zmock-encoded-id');
    });

    test('should preserve existing params when adding new ones', () => {
      const existingDid = 'uaid:aid:abc123;registry=old;domain=test.com';
      const params = {
        proto: 'new-proto',
        uid: 'new-uid',
      };

      const result = createUaid(existingDid, params);

      expect(result).toBe(
        'uaid:did:abc123;uid=new-uid;proto=new-proto;src=zmock-encoded-id',
      );
    });
  });

  describe('parseHcs14Did', () => {
    test('should parse AID DID without params', () => {
      const did = 'uaid:aid:abc123';

      const result = parseHcs14Did(did);

      expect(result).toEqual({
        method: 'aid',
        id: 'abc123',
        params: {},
      });
    });

    test('should parse UAID DID without params', () => {
      const did = 'uaid:did:def456';

      const result = parseHcs14Did(did);

      expect(result).toEqual({
        method: 'uaid',
        id: 'def456',
        params: {},
      });
    });

    test('should parse AID DID with params', () => {
      const did = 'uaid:aid:abc123;uid=1;registry=test;nativeId=0.0.123';

      const result = parseHcs14Did(did);

      expect(result).toEqual({
        method: 'aid',
        id: 'abc123',
        params: {
          registry: 'test',
          nativeId: '0.0.123',
          uid: '1',
        },
      });
    });

    test('should parse UAID DID with params', () => {
      const did = 'uaid:did:def456;proto=hcs-14;domain=test.com';

      const result = parseHcs14Did(did);

      expect(result).toEqual({
        method: 'uaid',
        id: 'def456',
        params: {
          proto: 'hcs-14',
          domain: 'test.com',
        },
      });
    });

    test('should parse DID with single param', () => {
      const did = 'uaid:aid:abc123;registry=test';

      const result = parseHcs14Did(did);

      expect(result).toEqual({
        method: 'aid',
        id: 'abc123',
        params: {
          registry: 'test',
        },
      });
    });

    test('should throw error for invalid DID prefix', () => {
      expect(() => parseHcs14Did('invalid-did')).toThrow('Invalid DID');
      expect(() => parseHcs14Did('not-did:aid:123')).toThrow('Invalid DID');
    });

    test('should throw error for insufficient parts', () => {
      expect(() => parseHcs14Did('did:aid')).toThrow('Invalid DID');
      expect(() => parseHcs14Did('did:')).toThrow('Invalid DID');
    });

    test('should throw error for unsupported method', () => {
      expect(() => parseHcs14Did('did:unsupported:abc123')).toThrow(
        'Invalid DID',
      );
      expect(() => parseHcs14Did('did:invalid:abc123')).toThrow('Invalid DID');
    });

    test('should handle malformed param pairs', () => {
      const did = 'uaid:aid:abc123;invalid;registry=test;malformed=';

      const result = parseHcs14Did(did);

      expect(result).toEqual({
        method: 'aid',
        id: 'abc123',
        params: {
          registry: 'test',
          malformed: '',
        },
      });
    });

    test('should handle DID with empty param values', () => {
      const did = 'uaid:aid:abc123;registry=;proto=test';

      const result = parseHcs14Did(did);

      expect(result).toEqual({
        method: 'aid',
        id: 'abc123',
        params: {
          registry: '',
          proto: 'test',
        },
      });
    });

    test('should handle complex param values', () => {
      const did = 'uaid:aid:abc123;domain=test.example.com;nativeId=0.0.12345';

      const result = parseHcs14Did(did);

      expect(result).toEqual({
        method: 'aid',
        id: 'abc123',
        params: {
          domain: 'test.example.com',
          nativeId: '0.0.12345',
        },
      });
    });
  });
});


