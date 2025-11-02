import {
  isHederaNetwork,
  isHederaCaip10,
  toHederaCaip10,
  parseHederaCaip10,
  HederaNetwork,
} from '../../src/hcs-14/caip';

describe('HCS-14 CAIP Helpers', () => {
  describe('isHederaNetwork', () => {
    test('should return true for valid Hedera networks', () => {
      const validNetworks: HederaNetwork[] = [
        'mainnet',
        'testnet',
        'previewnet',
        'devnet',
      ];

      validNetworks.forEach(network => {
        expect(isHederaNetwork(network)).toBe(true);
      });
    });

    test('should return false for invalid networks', () => {
      const invalidNetworks = [
        'invalid',
        'ethereum',
        'polygon',
        'bitcoin',
        '',
        'Mainnet', // case sensitive
        'MAINNET',
        'Testnet',
        'TESTNET',
      ];

      invalidNetworks.forEach(network => {
        expect(isHederaNetwork(network)).toBe(false);
      });
    });

    test('should handle edge cases', () => {
      expect(isHederaNetwork('')).toBe(false);
      expect(isHederaNetwork(null as any)).toBe(false);
      expect(isHederaNetwork(undefined as any)).toBe(false);
      expect(isHederaNetwork(123 as any)).toBe(false);
    });
  });

  describe('isHederaCaip10', () => {
    test('should return true for valid Hedera CAIP-10 identifiers', () => {
      const validCaip10Ids = [
        'hedera:mainnet:0.0.12345',
        'hedera:testnet:0.0.67890',
        'hedera:previewnet:0.0.11111',
        'hedera:devnet:0.0.22222',
        'hedera:mainnet:0.0.12345-abcde',
        'hedera:testnet:1.2.34567-xyz89',
      ];

      validCaip10Ids.forEach(id => {
        expect(isHederaCaip10(id)).toBe(true);
      });
    });

    test('should return false for invalid CAIP-10 identifiers', () => {
      const invalidCaip10Ids = [
        'invalid',
        'hedera:invalid:0.0.12345',
        'hedera:mainnet:invalid',
        'hedera:mainnet:0.0.12345.67890', // too many parts
        'hedera:mainnet:0.0', // too few parts
        'ethereum:mainnet:0x123',
        'bitcoin:mainnet:12345',
        'hedera:mainnet:', // empty account
        ':mainnet:0.0.12345', // empty namespace
        'hedera::0.0.12345', // empty network
        'hedera:mainnet:0.0.12345-extralong', // invalid alias format (too long)
        'hedera:mainnet:0.0.12345-abcdef', // too long alias
        'hedera:mainnet:0.0.12345-abc', // too short alias
      ];

      invalidCaip10Ids.forEach(id => {
        console.log(`Testing: ${id}, result: ${isHederaCaip10(id)}`);
        expect(isHederaCaip10(id)).toBe(false);
      });
    });

    test('should handle edge cases', () => {
      expect(isHederaCaip10('')).toBe(false);
      expect(isHederaCaip10(null as any)).toBe(false);
      expect(isHederaCaip10(undefined as any)).toBe(false);
      expect(isHederaCaip10(123 as any)).toBe(false);
    });

    test('should be case sensitive for network names', () => {
      expect(isHederaCaip10('hedera:Mainnet:0.0.12345')).toBe(false);
      expect(isHederaCaip10('hedera:MAINNET:0.0.12345')).toBe(false);
      expect(isHederaCaip10('hedera:Testnet:0.0.12345')).toBe(false);
      expect(isHederaCaip10('hedera:TESTNET:0.0.12345')).toBe(false);
    });

    test('should validate alias format correctly', () => {
      expect(isHederaCaip10('hedera:mainnet:0.0.12345-abcde')).toBe(true);
      expect(isHederaCaip10('hedera:mainnet:0.0.12345-12345')).toBe(true);
      expect(isHederaCaip10('hedera:mainnet:0.0.12345-a1b2c')).toBe(true);
      expect(isHederaCaip10('hedera:mainnet:0.0.12345-ABCDE')).toBe(true); // uppercase IS allowed

      expect(isHederaCaip10('hedera:mainnet:0.0.12345-abcdef')).toBe(false); // too long
      expect(isHederaCaip10('hedera:mainnet:0.0.12345-abc')).toBe(false); // too short
      expect(isHederaCaip10('hedera:mainnet:0.0.12345-abc-')).toBe(false); // invalid char
    });
  });

  describe('toHederaCaip10', () => {
    test('should convert valid inputs to CAIP-10 format', () => {
      expect(toHederaCaip10('mainnet', '0.0.12345')).toBe(
        'hedera:mainnet:0.0.12345',
      );
      expect(toHederaCaip10('testnet', '0.0.67890')).toBe(
        'hedera:testnet:0.0.67890',
      );
      expect(toHederaCaip10('previewnet', '1.2.34567')).toBe(
        'hedera:previewnet:1.2.34567',
      );
      expect(toHederaCaip10('devnet', '0.0.11111')).toBe(
        'hedera:devnet:0.0.11111',
      );
    });

    test('should handle account IDs with aliases', () => {
      expect(toHederaCaip10('mainnet', '0.0.12345-abcde')).toBe(
        'hedera:mainnet:0.0.12345-abcde',
      );
      expect(toHederaCaip10('testnet', '1.2.34567-xyz89')).toBe(
        'hedera:testnet:1.2.34567-xyz89',
      );
    });

    test('should return existing CAIP-10 identifier unchanged', () => {
      const existingCaip10 = 'hedera:mainnet:0.0.12345';
      expect(toHederaCaip10('mainnet', existingCaip10)).toBe(existingCaip10);
    });

    test('should throw error for invalid network', () => {
      expect(() => toHederaCaip10('invalid' as any, '0.0.12345')).toThrow(
        'Invalid Hedera network',
      );
      expect(() => toHederaCaip10('ethereum' as any, '0.0.12345')).toThrow(
        'Invalid Hedera network',
      );
    });

    test('should throw error for invalid account ID format', () => {
      const invalidAccountIds = [
        'invalid',
        '0.0',
        '0.0.12345.67890',
        'a.b.c',
        '0.0.12345-invalid',
        '0.0.12345-ABCDEF', // uppercase not allowed
        '0.0.12345-abc', // too short
        '0.0.12345-abcdef', // too long
      ];

      invalidAccountIds.forEach(accountId => {
        expect(() => toHederaCaip10('mainnet', accountId)).toThrow(
          'Invalid Hedera accountId format',
        );
      });
    });

    test('should throw error for invalid existing CAIP-10', () => {
      const invalidCaip10 = 'hedera:invalid:0.0.12345';
      expect(() => toHederaCaip10('mainnet', invalidCaip10)).toThrow(
        'Invalid Hedera CAIP-10 account',
      );
    });

    test('should validate network parameter type', () => {
      expect(() => toHederaCaip10('' as any, '0.0.12345')).toThrow(
        'Invalid Hedera network',
      );
      expect(() => toHederaCaip10(null as any, '0.0.12345')).toThrow(
        'Invalid Hedera network',
      );
      expect(() => toHederaCaip10(undefined as any, '0.0.12345')).toThrow(
        'Invalid Hedera network',
      );
    });
  });

  describe('parseHederaCaip10', () => {
    test('should parse valid CAIP-10 identifiers', () => {
      expect(parseHederaCaip10('hedera:mainnet:0.0.12345')).toEqual({
        network: 'mainnet',
        accountId: '0.0.12345',
      });

      expect(parseHederaCaip10('hedera:testnet:1.2.34567')).toEqual({
        network: 'testnet',
        accountId: '1.2.34567',
      });

      expect(parseHederaCaip10('hedera:previewnet:0.0.11111-abcde')).toEqual({
        network: 'previewnet',
        accountId: '0.0.11111-abcde',
      });

      expect(parseHederaCaip10('hedera:devnet:2.3.45678-xyz89')).toEqual({
        network: 'devnet',
        accountId: '2.3.45678-xyz89',
      });
    });

    test('should throw error for invalid CAIP-10 identifiers', () => {
      const invalidCaip10Ids = [
        'invalid',
        'hedera:invalid:0.0.12345',
        'hedera:mainnet:invalid',
        'hedera:mainnet:',
        ':mainnet:0.0.12345',
        'hedera::0.0.12345',
        '',
      ];

      invalidCaip10Ids.forEach(id => {
        expect(() => parseHederaCaip10(id)).toThrow('Invalid Hedera CAIP-10');
      });
    });

    test('should handle edge cases', () => {
      expect(() => parseHederaCaip10('')).toThrow('Invalid Hedera CAIP-10');
      expect(() => parseHederaCaip10(null as any)).toThrow(
        'Invalid Hedera CAIP-10',
      );
      expect(() => parseHederaCaip10(undefined as any)).toThrow(
        'Invalid Hedera CAIP-10',
      );
    });

    test('should parse account IDs with different formats', () => {
      expect(parseHederaCaip10('hedera:mainnet:0.0.12345')).toEqual({
        network: 'mainnet',
        accountId: '0.0.12345',
      });

      expect(parseHederaCaip10('hedera:mainnet:1.2.34567')).toEqual({
        network: 'mainnet',
        accountId: '1.2.34567',
      });

      expect(parseHederaCaip10('hedera:mainnet:0.0.12345-abcde')).toEqual({
        network: 'mainnet',
        accountId: '0.0.12345-abcde',
      });
    });
  });

  describe('integration tests', () => {
    test('should round-trip conversion correctly', () => {
      const testCases = [
        { network: 'mainnet' as const, accountId: '0.0.12345' },
        { network: 'testnet' as const, accountId: '1.2.34567' },
        { network: 'previewnet' as const, accountId: '0.0.11111-abcde' },
        { network: 'devnet' as const, accountId: '2.3.45678-xyz89' },
      ];

      testCases.forEach(({ network, accountId }) => {
        const caip10 = toHederaCaip10(network, accountId);
        expect(isHederaCaip10(caip10)).toBe(true);

        const parsed = parseHederaCaip10(caip10);
        expect(parsed.network).toBe(network);
        expect(parsed.accountId).toBe(accountId);
      });
    });

    test('should handle all Hedera networks', () => {
      const networks: HederaNetwork[] = [
        'mainnet',
        'testnet',
        'previewnet',
        'devnet',
      ];
      const accountId = '0.0.12345';

      networks.forEach(network => {
        const caip10 = toHederaCaip10(network, accountId);
        expect(isHederaNetwork(network)).toBe(true);
        expect(isHederaCaip10(caip10)).toBe(true);

        const parsed = parseHederaCaip10(caip10);
        expect(parsed.network).toBe(network);
        expect(parsed.accountId).toBe(accountId);
      });
    });
  });

  describe('error handling', () => {
    test('should provide clear error messages', () => {
      expect(() => toHederaCaip10('invalid' as any, '0.0.12345')).toThrow(
        'Invalid Hedera network',
      );
      expect(() => toHederaCaip10('mainnet', 'invalid')).toThrow(
        'Invalid Hedera accountId format',
      );
      expect(() => parseHederaCaip10('invalid')).toThrow(
        'Invalid Hedera CAIP-10',
      );
    });

    test('should handle malformed inputs gracefully', () => {
      expect(() => parseHederaCaip10('hedera:')).toThrow(
        'Invalid Hedera CAIP-10',
      );
      expect(() => parseHederaCaip10('hedera:mainnet:')).toThrow(
        'Invalid Hedera CAIP-10',
      );
      expect(() => parseHederaCaip10(':mainnet:0.0.12345')).toThrow(
        'Invalid Hedera CAIP-10',
      );
    });
  });
});
