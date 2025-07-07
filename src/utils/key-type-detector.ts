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
  let detectedType: KeyType = 'ed25519';

  try {
    const pkDetectedAlgorithmn = PrivateKey.getAlgorithm(privateKeyString);

    if (['ecdsa', 'ed25519'].includes(pkDetectedAlgorithmn)) {
      return {
        detectedType: pkDetectedAlgorithmn,
        privateKey:
          pkDetectedAlgorithmn === 'ecdsa'
            ? PrivateKey.fromStringECDSA(privateKeyString)
            : PrivateKey.fromStringED25519(privateKeyString),
      };
    }
  } catch (error) {
    // getAlgorithm only works for der encoded keys
  }

  if (privateKeyString.startsWith('0x')) {
    detectedType = 'ecdsa';
  } else if (privateKeyString.startsWith('302e020100300506032b6570')) {
    detectedType = 'ed25519';
  } else if (privateKeyString.startsWith('3030020100300706052b8104000a')) {
    detectedType = 'ecdsa';
  } else if (privateKeyString.length === 96) {
    detectedType = 'ed25519';
  } else if (privateKeyString.length === 88) {
    detectedType = 'ecdsa';
  }

  try {
    const privateKey =
      detectedType === 'ecdsa'
        ? PrivateKey.fromStringECDSA(privateKeyString)
        : PrivateKey.fromStringED25519(privateKeyString);
    return { detectedType, privateKey };
  } catch (parseError) {
    const alternateType = detectedType === 'ecdsa' ? 'ed25519' : 'ecdsa';
    try {
      const privateKey =
        alternateType === 'ecdsa'
          ? PrivateKey.fromStringECDSA(privateKeyString)
          : PrivateKey.fromStringED25519(privateKeyString);
      return { detectedType: alternateType, privateKey };
    } catch (secondError) {
      throw new Error(
        `Failed to parse private key as either ED25519 or ECDSA: ${parseError}`,
      );
    }
  }
}
