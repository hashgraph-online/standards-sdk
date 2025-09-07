import { describe, test, expect } from '@jest/globals';
import { isEip155Caip10, toEip155Caip10 } from '../../src/hcs-14/caip';
import { canonicalizeAgentData } from '../../src/hcs-14/canonical';

describe('EVM CAIP-10 helpers', () => {
  test('isEip155Caip10 validates correctly', () => {
    expect(isEip155Caip10('eip155:1:0x742d35Cc6634C0532925a3b844Bc9e7595f41Bd')).toBe(
      true,
    );
    expect(isEip155Caip10('eip155:10:0x0000000000000000000000000000000000000001')).toBe(
      true,
    );
    expect(isEip155Caip10('eip155:1:742d35Cc6634C0532925a3b844Bc9e7595f41Bd')).toBe(
      false,
    );
    expect(isEip155Caip10('eip155:x:0x742d35Cc6634C0532925a3b844Bc9e7595f41Bd')).toBe(
      false,
    );
  });

  test('toEip155Caip10 formats and validates', () => {
    expect(
      toEip155Caip10(1, '0x742d35Cc6634C0532925a3b844Bc9e7595f41Bd'),
    ).toBe('eip155:1:0x742d35Cc6634C0532925a3b844Bc9e7595f41Bd');
    expect(
      toEip155Caip10('137', '742d35Cc6634C0532925a3b844Bc9e7595f41Bd'),
    ).toBe('eip155:137:0x742d35Cc6634C0532925a3b844Bc9e7595f41Bd');
    expect(() => toEip155Caip10('x', '0x123')).toThrow('Invalid EIP-155 CAIP-10');
  });
});

describe('Canonicalization CAIP-10 enforcement for EVM protocols', () => {
  test('acp-virtuals requires EIP-155 CAIP-10 nativeId', () => {
    const valid = {
      registry: 'virtuals',
      name: 'Bot',
      version: '1.0.0',
      protocol: 'acp-virtuals',
      nativeId: 'eip155:1:0x742d35Cc6634C0532925a3b844Bc9e7595f41Bd',
      skills: [],
    } as const;
    expect(() => canonicalizeAgentData(valid)).not.toThrow();

    const invalid = {
      registry: 'virtuals',
      name: 'Bot',
      version: '1.0.0',
      protocol: 'acp-virtuals',
      nativeId: '0x742d35Cc6634C0532925a3b844Bc9e7595f41Bd',
      skills: [],
    } as const;
    expect(() => canonicalizeAgentData(invalid)).toThrow(/EIP-155 CAIP-10/);
  });
});

