import { base58Encode, base58Decode } from '../../src/hcs-14/base58';

describe('HCS-14 Base58 Encoding', () => {
  describe('base58Encode', () => {
    test('should encode empty array as empty string', () => {
      const result = base58Encode(new Uint8Array(0));
      expect(result).toBe('');
    });

    test('should encode single zero byte', () => {
      const result = base58Encode(new Uint8Array([0]));
      expect(result).toBe('1');
    });

    test('should encode multiple leading zeros', () => {
      const result = base58Encode(new Uint8Array([0, 0, 0]));
      expect(result).toBe('111');
    });

    test('should encode single non-zero byte', () => {
      const result = base58Encode(new Uint8Array([1]));
      expect(result).toBe('2');
    });

    test('roundtrip for random short sequences', () => {
      const cases = [
        new Uint8Array([57]),
        new Uint8Array([58]),
        new Uint8Array([255]),
        new Uint8Array([0, 1]),
        new Uint8Array([1, 0]),
      ];
      for (const c of cases) {
        const enc = base58Encode(c);
        const dec = base58Decode(enc);
        expect(Buffer.from(dec)).toEqual(Buffer.from(c));
      }
    });

    test('should encode common byte sequences', () => {
      expect(base58Encode(new Uint8Array([0, 1]))).toBe('12');
      const pairs = [
        new Uint8Array([1, 0]),
        new Uint8Array([255]),
        new Uint8Array([255, 255]),
      ];
      for (const p of pairs) {
        const enc = base58Encode(p);
        const dec = base58Decode(enc);
        expect(Buffer.from(dec)).toEqual(Buffer.from(p));
      }
    });

    test('should encode with mixed leading zeros', () => {
      const input = new Uint8Array([0, 0, 1, 2, 3]);
      const enc = base58Encode(input);
      expect(enc.startsWith('11')).toBe(true);
      const dec = base58Decode(enc);
      expect(Buffer.from(dec)).toEqual(Buffer.from(input));
    });

    test('should encode large numbers correctly', () => {
      const result = base58Encode(new Uint8Array([255, 255, 255, 255]));
      expect(result).toBe('7YXq9G');
    });

    test('should encode typical hash values', () => {
      const hash = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        hash[i] = i % 256;
      }
      const result = base58Encode(hash);
      expect(result).toMatch(
        /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/,
      );
      expect(result.length).toBeGreaterThan(40); // Base58 encoding is typically longer than hex
    });

    test('should encode sequential bytes', () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      const result = base58Encode(bytes);
      const dec = base58Decode(result);
      expect(Buffer.from(dec)).toEqual(Buffer.from(bytes));
    });

    test('should encode all zeros as all ones', () => {
      const zeros = new Uint8Array(10).fill(0);
      const result = base58Encode(zeros);
      expect(/^1+$/.test(result)).toBe(true);
      expect(result.length).toBe(10);
    });

    test('should encode maximum byte values', () => {
      const maxBytes = new Uint8Array(4).fill(255);
      const result = base58Encode(maxBytes);
      expect(result).toBe('7YXq9G');
    });

    test('should encode with trailing zeros', () => {
      const input = new Uint8Array([1, 2, 3, 0, 0]);
      const result = base58Encode(input);
      const dec = base58Decode(result);
      expect(Buffer.from(dec)).toEqual(Buffer.from(input));
    });

    test('should produce deterministic results', () => {
      const bytes = new Uint8Array([42, 123, 67, 89, 200]);
      const result1 = base58Encode(bytes);
      const result2 = base58Encode(bytes);

      expect(result1).toBe(result2);
    });

    test('should handle byte values that require carry-over', () => {
      const input = new Uint8Array([255, 255, 255]);
      const result = base58Encode(input);
      const dec = base58Decode(result);
      expect(Buffer.from(dec)).toEqual(Buffer.from(input));
    });

    test('should encode power-of-2 values', () => {
      const cases = [new Uint8Array([128]), new Uint8Array([64]), new Uint8Array([32])];
      for (const c of cases) {
        const enc = base58Encode(c);
        const dec = base58Decode(enc);
        expect(Buffer.from(dec)).toEqual(Buffer.from(c));
      }
    });
  });

  describe('alphabet and encoding properties', () => {
    test('should only use valid Base58 alphabet characters', () => {
      const bytes = new Uint8Array([0, 1, 57, 58, 100, 150, 200, 255]);
      const result = base58Encode(bytes);

      const validChars =
        '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      for (const char of result) {
        expect(validChars).toContain(char);
      }
    });

    test('should not contain ambiguous characters (0, O, I, l)', () => {
      const bytes = new Uint8Array([
        0, 1, 10, 18, 24, 48, 73, 76, 79, 105, 108, 111,
      ]);
      const result = base58Encode(bytes);

      expect(result).not.toContain('0');
      expect(result).not.toContain('O');
      expect(result).not.toContain('I');
      expect(result).not.toContain('l');
    });

    test('should produce different encodings for different inputs', () => {
      const input1 = new Uint8Array([1, 2, 3]);
      const input2 = new Uint8Array([3, 2, 1]);

      const result1 = base58Encode(input1);
      const result2 = base58Encode(input2);

      expect(result1).not.toBe(result2);
    });
  });
});




