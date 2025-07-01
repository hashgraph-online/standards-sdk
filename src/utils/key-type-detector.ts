import { PrivateKey } from '@hashgraph/sdk';

export type KeyType = 'ed25519' | 'ecdsa';

export interface KeyDetectionResult {
  detectedType: KeyType;
  privateKey: PrivateKey;
}

/**
 * Detects the key type from a private key string and returns the parsed PrivateKey
 * @param privateKeyString The private key string to detect type from
 * @returns The detected key type and parsed PrivateKey
 * @throws Error if the private key cannot be parsed
 */
export function detectKeyTypeFromString(
  privateKeyString: string,
): KeyDetectionResult {
  let normalizedKey = privateKeyString.trim();
  const has0xPrefix = normalizedKey.startsWith('0x');

  // Check if it's a hex string (with or without 0x prefix)
  const hexWithoutPrefix = has0xPrefix ? normalizedKey.substring(2) : normalizedKey;
  const isHex = /^[0-9a-fA-F]+$/.test(hexWithoutPrefix);
  const isRawHex64 = isHex && hexWithoutPrefix.length === 64;

  // Special case for hex keys - try both types but in different orders
  if ((has0xPrefix || isRawHex64) && isHex) {
    // For keys with 0x prefix, try ECDSA first (backward compatibility)
    const firstType = has0xPrefix ? 'ecdsa' : 'ed25519';
    const secondType = has0xPrefix ? 'ed25519' : 'ecdsa';
    
    try {
      if (firstType === 'ecdsa') {
        const privateKey = PrivateKey.fromStringECDSA(normalizedKey);
        return { detectedType: 'ecdsa', privateKey };
      } else {
        const privateKey = PrivateKey.fromStringED25519(normalizedKey);
        return { detectedType: 'ed25519', privateKey };
      }
    } catch (firstError) {
      try {
        const privateKey = secondType === 'ecdsa' 
          ? PrivateKey.fromStringECDSA(normalizedKey)
          : PrivateKey.fromStringED25519(normalizedKey);
        return { detectedType: secondType, privateKey };
      } catch (secondError) {
        throw new Error(
          `Failed to parse private key as either ED25519 or ECDSA: ${firstError}`,
        );
      }
    }
  }

  // For non-hex keys, use the original detection logic
  let detectedType: KeyType = 'ed25519';

  if (normalizedKey.startsWith('302e020100300506032b6570')) {
    detectedType = 'ed25519';
  } else if (normalizedKey.startsWith('3030020100300706052b8104000a')) {
    detectedType = 'ecdsa';
  } else if (normalizedKey.length === 96) {
    detectedType = 'ed25519';
  } else if (normalizedKey.length === 88) {
    detectedType = 'ecdsa';
  }
  
  try {
    const privateKey =
      detectedType === 'ecdsa'
        ? PrivateKey.fromStringECDSA(normalizedKey)
        : PrivateKey.fromStringED25519(normalizedKey);
    return { detectedType, privateKey };
  } catch (parseError) {
    const alternateType = detectedType === 'ecdsa' ? 'ed25519' : 'ecdsa';
    try {
      const privateKey =
        alternateType === 'ecdsa'
          ? PrivateKey.fromStringECDSA(normalizedKey)
          : PrivateKey.fromStringED25519(normalizedKey);
      return { detectedType: alternateType, privateKey };
    } catch (secondError) {
      throw new Error(
        `Failed to parse private key as either ED25519 or ECDSA: ${parseError}`,
      );
    }
  }
}
