import { PrivateKey } from '@hashgraph/sdk';

export type KeyType = 'ed25519' | 'ecdsa';

export interface KeyDetectionResult {
  detectedType: KeyType;
  privateKey: PrivateKey;
}

/**
 * Detects the key type from a private key string and returns the parsed PrivateKey.
 * For raw hex keys, a keyType parameter should be provided as they are ambiguous.
 * DER and PEM formats can be detected automatically.
 * @param privateKeyString The private key string to detect type from
 * @param keyType Optional key type hint for ambiguous formats (raw hex)
 * @returns The detected key type and parsed PrivateKey
 * @throws Error if the private key cannot be parsed
 */
export function detectKeyTypeFromString(
  privateKeyString: string,
  keyType?: KeyType
): KeyDetectionResult {
  if (!privateKeyString || privateKeyString.trim() === '') {
    throw new Error('Failed to parse private key: empty input');
  }

  const normalizedKey = privateKeyString.trim();

  // Check for public key prefix (reject early)
  if (normalizedKey.startsWith('302a300506032b6570')) {
    throw new Error('Public keys are not supported, private key required');
  }

  // Handle PEM format - can auto-detect
  if (normalizedKey.includes('-----BEGIN')) {
    return handlePemFormat(normalizedKey);
  }

  const has0xPrefix = normalizedKey.startsWith('0x');
  const hexWithoutPrefix = has0xPrefix ? normalizedKey.substring(2) : normalizedKey;
  const isHex = /^[0-9a-fA-F]+$/.test(hexWithoutPrefix);

  // Validate hex format if 0x prefix is present
  if (has0xPrefix && !isHex) {
    throw new Error('Failed to parse private key: invalid hex characters');
  }
  
  // Validate hex length
  if (has0xPrefix && hexWithoutPrefix.length % 2 !== 0) {
    throw new Error('Invalid hex string: odd number of characters');
  }

  // Handle DER format (definitive detection)
  if (isHex && isDerFormatted(normalizedKey)) {
    return handleDerFormat(normalizedKey);
  }

  // Handle base64 format - can auto-detect
  if (!isHex && !has0xPrefix && isBase64(normalizedKey)) {
    return handleBase64Format(normalizedKey);
  }

  // Handle raw hex keys - these are ambiguous and need keyType parameter
  if (isHex && hexWithoutPrefix.length === 64) {
    if (!keyType) {
      throw new Error(
        'Raw hex private keys are ambiguous. Please specify keyType parameter as either "ed25519" or "ecdsa"'
      );
    }
    return parseRawHexKey(normalizedKey, keyType);
  }

  // For other cases, try to parse based on format
  return tryParseByFormat(normalizedKey, keyType);
}

/**
 * Parses a raw hex key with the specified key type
 */
function parseRawHexKey(hexKey: string, keyType: KeyType): KeyDetectionResult {
  const hexWithoutPrefix = hexKey.startsWith('0x') ? hexKey.substring(2) : hexKey;
  
  if (hexWithoutPrefix.length !== 64) {
    throw new Error('Raw hex key must be 32 bytes (64 hex characters)');
  }

  try {
    const derPrefix = keyType === 'ed25519' 
      ? '302e020100300506032b657004220420'
      : '3030020100300706052b8104000a04220420';
    
    const derKey = derPrefix + hexWithoutPrefix;
    const privateKey = keyType === 'ed25519'
      ? PrivateKey.fromStringED25519(derKey)
      : PrivateKey.fromStringECDSA(derKey);

    return {
      detectedType: keyType,
      privateKey
    };
  } catch (error) {
    throw new Error(`Failed to parse private key as ${keyType}: ${error}`);
  }
}

// Helper functions for format detection and handling

function isDerFormatted(key: string): boolean {
  return key.startsWith('302e020100300506032b657004220420') || 
         key.startsWith('3030020100300706052b8104000a');
}

function handleDerFormat(derKey: string): KeyDetectionResult {
  if (derKey.startsWith('302e020100300506032b657004220420')) {
    return {
      detectedType: 'ed25519',
      privateKey: PrivateKey.fromStringED25519(derKey)
    };
  } else if (derKey.startsWith('3030020100300706052b8104000a')) {
    return {
      detectedType: 'ecdsa',
      privateKey: PrivateKey.fromStringECDSA(derKey)
    };
  }
  
  throw new Error('Invalid DER format');
}

function handlePemFormat(pemKey: string): KeyDetectionResult {
  const base64Match = pemKey.match(/-----BEGIN[\s\S]+?-----\n([\s\S]+?)\n-----END/);
  if (!base64Match) {
    throw new Error('Invalid PEM format');
  }
  
  const base64Content = base64Match[1].replace(/\s/g, '');
  const derKey = Buffer.from(base64Content, 'base64').toString('hex');
  
  return handleDerFormat(derKey);
}

function handleBase64Format(base64Key: string): KeyDetectionResult {
  const derHex = Buffer.from(base64Key, 'base64').toString('hex');
  return handleDerFormat(derHex);
}

function tryParseByFormat(key: string, keyType?: KeyType): KeyDetectionResult {
  // Check if it's a raw hex key that needs type specification
  const hexWithoutPrefix = key.startsWith('0x') ? key.substring(2) : key;
  if (/^[0-9a-fA-F]{64}$/.test(hexWithoutPrefix)) {
    if (!keyType) {
      throw new Error(
        'Raw hex private keys are ambiguous. Please specify keyType parameter as either "ed25519" or "ecdsa"'
      );
    }
    return parseRawHexKey(key, keyType);
  }
  
  // Try parsing as DER format first
  const types: KeyType[] = keyType ? [keyType] : ['ed25519', 'ecdsa'];
  let lastError: Error | null = null;
  
  for (const type of types) {
    try {
      const privateKey = type === 'ecdsa' 
        ? PrivateKey.fromStringECDSA(key)
        : PrivateKey.fromStringED25519(key);
      
      return {
        detectedType: type,
        privateKey
      };
    } catch (error) {
      lastError = error as Error;
    }
  }
  
  throw new Error(`Failed to parse private key: ${lastError?.message}`);
}

function isBase64(str: string): boolean {
  if (str.includes('-') || str.includes('_')) return false;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(str)) return false;
  if (str.length % 4 !== 0) return false;
  
  try {
    const decoded = Buffer.from(str, 'base64');
    const reencoded = decoded.toString('base64');
    return reencoded === str;
  } catch {
    return false;
  }
}