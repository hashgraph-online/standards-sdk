import { describe, it, expect } from '@jest/globals';
import { HCS14_PROTOCOL_REGEX } from '../src/hcs-14/types';
import * as cryptoAbstraction from '../src/utils/crypto-abstraction';

describe('HCS-14 AID/UAID', () => {
  it('generates deterministic AID for HCS-10 agent and matches manual hash', async () => {
    const { generateAidDid, parseHcs14Did, canonicalizeAgentData } =
      await import('../src/hcs-14');
    const input = {
      registry: 'hol',
      name: 'Support Agent',
      version: '1.0.0',
      protocol: 'hcs-10',
      nativeId: 'hedera:testnet:0.0.123456',
      skills: [0, 17],
    } as const;

    const did = await generateAidDid(input);
    const parsed = parseHcs14Did(did);
    expect(parsed.method).toBe('aid');
    expect(parsed.params.registry).toBe('hol');
    expect(parsed.params.nativeId).toBe('hedera:testnet:0.0.123456');
    expect(parsed.params.uid).toBe('0');

    const { canonicalJson } = canonicalizeAgentData(input);
    const nodeCrypto = await import('crypto');
    const { base58Encode } = await import('../src/hcs-14/base58');
    const hash = nodeCrypto
      .createHash('sha384')
      .update(Buffer.from(canonicalJson, 'utf8'))
      .digest();
    const expectedId = base58Encode(hash as any);
    const expectedDid = `did:aid:${expectedId};registry=hol;nativeId=hedera:testnet:0.0.123456;uid=0`;
    expect(did).toBe(expectedDid);
  });

  it('normalizes strings and sorts skills deterministically', async () => {
    const { generateAidDid } = await import('../src/hcs-14');
    const inputA = {
      registry: 'HOL',
      name: '  Support Agent  ',
      version: '1.0.0',
      protocol: 'HCS-10',
      nativeId: ' hedera:testnet:0.0.123456 ',
      skills: [17, 0],
    } as const;

    const inputB = {
      registry: 'hol',
      name: 'Support Agent',
      version: '1.0.0',
      protocol: 'hcs-10',
      nativeId: 'hedera:testnet:0.0.123456',
      skills: [0, 17],
    } as const;

    const didA = await generateAidDid(inputA);
    const didB = await generateAidDid(inputB);
    expect(didA).toBe(didB);
  });

  it('generates UAID from existing DID with params', async () => {
    const { generateUaidDid, parseHcs14Did } = await import('../src/hcs-14');
    const existingDid =
      'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
    const uaid = generateUaidDid(existingDid, {
      proto: 'hcs-10',
      nativeId: 'hedera:testnet:0.0.999',
      uid: '0',
    });
    expect(uaid).toBe(
      'did:uaid:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK;proto=hcs-10;nativeId=hedera:testnet:0.0.999;uid=0',
    );
    const parsed = parseHcs14Did(uaid);
    expect(parsed.method).toBe('uaid');
    expect(parsed.id).toBe('z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK');
    expect(parsed.params.proto).toBe('hcs-10');
  });

  it('UAID without params has no param segment', async () => {
    const { generateUaidDid, parseHcs14Did } = await import('../src/hcs-14');
    const existingDid = 'did:web:example.com:agents:alice';
    const uaid = generateUaidDid(existingDid);
    expect(uaid).toBe('did:uaid:example.com:agents:alice');
    const parsed = parseHcs14Did(uaid);
    expect(Object.keys(parsed.params).length).toBe(0);
  });

  it('builds AID with additional params when provided', async () => {
    const { generateAidDid, parseHcs14Did } = await import('../src/hcs-14');
    const input = {
      registry: 'nanda',
      name: 'Pirate Bot',
      version: '1.0.0',
      protocol: 'a2a',
      nativeId: 'pirate-bot',
      skills: [],
    } as const;

    const did = await generateAidDid(input, {
      proto: 'a2a',
      uid: 'pirate-bot',
      domain: 'pirates.example',
    });
    const parsed = parseHcs14Did(did);
    expect(parsed.params.registry).toBe('nanda');
    expect(parsed.params.proto).toBe('a2a');
    expect(parsed.params.nativeId).toBe('pirate-bot');
    expect(parsed.params.uid).toBe('pirate-bot');
    expect(parsed.params.domain).toBe('pirates.example');
  });

  it('throws for invalid inputs and unsupported DIDs', async () => {
    const { canonicalizeAgentData, generateUaidDid, parseHcs14Did } =
      await import('../src/hcs-14');
    const bad: unknown = {
      registry: '',
      name: '',
      version: '',
      protocol: '',
      nativeId: '',
      skills: [],
    };
    expect(() => canonicalizeAgentData(bad)).toThrow();

    expect(() => generateUaidDid('not-a-did')).toThrow();
    expect(() => parseHcs14Did('bad')).toThrow();
    expect(() => parseHcs14Did('did:other:abc')).toThrow();
  });

  it('enforces CAIP-10 nativeId for hcs-10 protocol', async () => {
    const { canonicalizeAgentData } = await import('../src/hcs-14');
    const invalidHedera: unknown = {
      registry: 'hol',
      name: 'x',
      version: '1',
      protocol: 'hcs-10',
      nativeId: '0.0.1',
      skills: [],
    };
    expect(() => canonicalizeAgentData(invalidHedera)).toThrow(
      /nativeId must be CAIP-10/,
    );
  });

  it('encodes Base58 correctly for basic cases', async () => {
    const { base58Encode, base58Decode, multibaseB58btcDecode } = await import(
      '../src/hcs-14/base58'
    );
    expect(base58Encode(new Uint8Array([]))).toBe('');
    expect(base58Encode(new Uint8Array([0]))).toBe('1');
    expect(base58Encode(new Uint8Array([0, 0, 1]))).toBe('112');
    expect(base58Encode(new Uint8Array([1]))).toBe('2');
    const text = 'hello';
    const enc = base58Encode(Buffer.from(text, 'utf8'));
    const dec = Buffer.from(base58Decode(enc)).toString('utf8');
    expect(dec).toBe(text);
    expect(Array.from(base58Decode(''))).toEqual([]);
    expect(Array.from(base58Decode('1'))).toEqual([0]);
    expect(() => base58Decode('0')).toThrow('Invalid Base58 character');
    expect(() => multibaseB58btcDecode('xabc')).toThrow(
      'Invalid multibase base58btc',
    );
  });

  it('UAID from did:hedera with params is sanitized and carries src', async () => {
    const { generateUaidDid, parseHcs14Did } = await import('../src/hcs-14');
    const did =
      'did:hedera:testnet:zABC123;hedera:testnet:fid=0.0.1;tid=0.0.2#frag';
    const uaid = generateUaidDid(did, { proto: 'hcs-10', uid: '0' });
    expect(uaid.startsWith('did:uaid:testnet:zABC123;')).toBe(true);
    const parsed = parseHcs14Did(uaid);
    expect(parsed.params.src?.startsWith('z')).toBe(true);
  });

  it('UAID from did:hedera underscore variant keeps full id without src', async () => {
    const { generateUaidDid, parseHcs14Did } = await import('../src/hcs-14');
    const did = 'did:hedera:testnet:zK3Y_0.0.12345';
    const uaid = generateUaidDid(did, { proto: 'hcs-10' });
    expect(uaid).toBe('did:uaid:testnet:zK3Y_0.0.12345;proto=hcs-10');
    const parsed = parseHcs14Did(uaid);
    expect(parsed.params.src).toBeUndefined();
  });

  it('Hedera CAIP-10 helpers validate and format correctly', async () => {
    const {
      isHederaNetwork,
      isHederaCaip10,
      toHederaCaip10,
      parseHederaCaip10,
    } = await import('../src/hcs-14/caip');
    const caip = toHederaCaip10('testnet', '0.0.123456');
    expect(caip).toBe('hedera:testnet:0.0.123456');
    expect(isHederaCaip10(caip)).toBe(true);
    const parsed = parseHederaCaip10(caip);
    expect(parsed.network).toBe('testnet');
    expect(parsed.accountId).toBe('0.0.123456');
    expect(isHederaNetwork('previewnet')).toBe(true);
    expect(isHederaNetwork('othernet')).toBe(false);
    expect(toHederaCaip10('testnet', 'hedera:testnet:0.0.123')).toBe(
      'hedera:testnet:0.0.123',
    );
    expect(() => toHederaCaip10('testnet', 'hedera:testnet:bad')).toThrow(
      'Invalid Hedera CAIP-10 account',
    );
    expect(() => toHederaCaip10('x' as any, '0.0.1')).toThrow(
      'Invalid Hedera network',
    );
    expect(() => toHederaCaip10('testnet', 'bad')).toThrow(
      'Invalid Hedera accountId format',
    );
    expect(() => parseHederaCaip10('hedera:testnet:bad')).toThrow(
      'Invalid Hedera CAIP-10',
    );
  });

  it('parseHcs14Did handles malformed parts length', async () => {
    const { parseHcs14Did } = await import('../src/hcs-14');
    expect(() => parseHcs14Did('did:')).toThrow('Invalid DID');
  });

  it('covers promise-based hashing branch and paramless AID', async () => {
    jest.resetModules();

    const mockAdapter = {
      createHash: () => ({
        update() {
          return this;
        },
        digest: async () => 'abcd',
      }),
    } as any;

    const cryptoPath = require.resolve('../src/utils/crypto-abstraction');
    jest.doMock(cryptoPath, () => ({ getCryptoAdapter: () => mockAdapter }));

    const { generateAidDid } = await import('../src/hcs-14');
    const did = await generateAidDid(
      {
        registry: 'x',
        name: 'y',
        version: '1',
        protocol: 'p',
        nativeId: 'n',
        skills: [],
      },
      undefined,
      { includeParams: false },
    );
    expect(did.startsWith('did:aid:')).toBe(true);
    expect(did.includes(';')).toBe(false);
    jest.dontMock(cryptoPath);
  });

  it('covers promise resolving to Buffer branch', async () => {
    jest.resetModules();

    const mockAdapter = {
      createHash: () => ({
        update() {
          return this;
        },
        digest: async () => Buffer.from([5, 6, 7, 8]),
      }),
    } as any;

    const cryptoPath = require.resolve('../src/utils/crypto-abstraction');
    jest.doMock(cryptoPath, () => ({ getCryptoAdapter: () => mockAdapter }));

    const { generateAidDid } = await import('../src/hcs-14');
    const did = await generateAidDid(
      {
        registry: 'reg',
        name: 'name',
        version: '1',
        protocol: 'proto',
        nativeId: 'nid',
        skills: [],
      },
      undefined,
      { includeParams: false },
    );
    expect(did.startsWith('did:aid:')).toBe(true);
    jest.dontMock(cryptoPath);
  });

  it('validates protocol regex sample', () => {
    expect(HCS14_PROTOCOL_REGEX.test('hcs-10')).toBe(true);
    expect(HCS14_PROTOCOL_REGEX.test('HCS_10')).toBe(false);
  });
});
