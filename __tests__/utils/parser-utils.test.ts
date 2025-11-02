import { parseKey } from '../../src/utils/parsers/parser-utils';
import { proto } from '@hashgraph/proto';

describe('parser-utils.parseKey', () => {
  test('returns undefined on null/undefined input', () => {
    expect(parseKey(null)).toBeUndefined();
    expect(parseKey(undefined)).toBeUndefined();
  });

  test('parses ContractID key', () => {
    const key: proto.IKey = {
      contractID: { shardNum: 0, realmNum: 0, contractNum: 123 },
    };
    expect(parseKey(key)).toBe('ContractID: 0.0.123');
  });

  test('parses ED25519 key', () => {
    const key: proto.IKey = { ed25519: new Uint8Array([1, 2, 3, 4]) };
    expect(parseKey(key)).toBe('ED25519: 01020304');
  });

  test('parses ECDSA secp256k1 key', () => {
    const key: proto.IKey = { ECDSASecp256k1: new Uint8Array([0xab, 0xcd]) };
    expect(parseKey(key)).toBe('ECDSA_secp256k1: abcd');
  });

  test('parses KeyList with nested keys', () => {
    const key: proto.IKey = {
      keyList: {
        keys: [
          { ed25519: new Uint8Array([1]) },
          { ECDSASecp256k1: new Uint8Array([2]) },
        ],
      },
    };
    const out = parseKey(key)!;
    expect(out.startsWith('KeyList (2 keys): [')).toBe(true);
    expect(out).toContain('ED25519: 01');
    expect(out).toContain('ECDSA_secp256k1: 02');
  });

  test('parses ThresholdKey with nested keys', () => {
    const key: proto.IKey = {
      thresholdKey: {
        threshold: 2,
        keys: {
          keys: [
            { ed25519: new Uint8Array([3]) },
            { ed25519: new Uint8Array([4]) },
          ],
        },
      },
    };
    const out = parseKey(key)!;
    expect(out.startsWith('ThresholdKey (2 of 2): [')).toBe(true);
    expect(out).toContain('ED25519: 03');
    expect(out).toContain('ED25519: 04');
  });

  test('parses DelegatableContractID', () => {
    const key: proto.IKey = {
      delegatableContractId: { shardNum: 0, realmNum: 0, contractNum: 321 },
    };
    expect(parseKey(key)).toBe('DelegatableContractID: 0.0.321');
  });

  test('handles empty key structure', () => {
    const key: proto.IKey = {};
    expect(parseKey(key)).toBe('Empty Key Structure');
  });

  test('handles unknown key structure', () => {
    const key: proto.IKey = { unknown: true } as any;
    expect(parseKey(key)).toBe('Unknown or Unset Key Type');
  });
});
