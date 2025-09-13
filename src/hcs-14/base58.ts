/**
 * Minimal Base58 encoder/decoder (Bitcoin alphabet) with no external dependencies.
 */

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE = 58;

function countLeadingZeros(bytes: Uint8Array): number {
  let zeros = 0;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    zeros++;
  }
  return zeros;
}

export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';

  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  if (zeros === bytes.length) return '1'.repeat(zeros);

  const digits: number[] = [0];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      const val = (digits[j] << 8) + carry;
      digits[j] = val % BASE;
      carry = (val / BASE) | 0;
    }
    while (carry > 0) {
      digits.push(carry % BASE);
      carry = (carry / BASE) | 0;
    }
  }

  let result = '';
  for (let i = 0; i < zeros; i++) result += '1';
  for (let i = digits.length - 1; i >= 0; i--) result += ALPHABET[digits[i]];
  return result;
}

export function base58Decode(text: string): Uint8Array {
  if (text.length === 0) return new Uint8Array(0);

  let zeros = 0;
  while (zeros < text.length && text[zeros] === '1') zeros++;

  const b256: number[] = [];
  for (let i = zeros; i < text.length; i++) {
    const ch = text[i];
    const val = ALPHABET.indexOf(ch);
    if (val === -1) throw new Error('Invalid Base58 character');

    let carry = val;
    for (let j = 0; j < b256.length; j++) {
      const x = b256[j] * BASE + carry;
      b256[j] = x & 0xff;
      carry = x >> 8;
    }
    while (carry > 0) {
      b256.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (let i = 0; i < zeros; i++) b256.push(0);
  b256.reverse();
  return Uint8Array.from(b256);
}

export function multibaseB58btcDecode(zText: string): Uint8Array {
  if (!zText.startsWith('z')) throw new Error('Invalid multibase base58btc');
  return base58Decode(zText.slice(1));
}
