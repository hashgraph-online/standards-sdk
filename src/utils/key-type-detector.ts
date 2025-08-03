import { PrivateKey } from '@hashgraph/sdk';

/**
 * Enumeration of supported key types
 */
export enum KeyType {
  ED25519 = 'ed25519',
  ECDSA = 'ecdsa',
  UNKNOWN = 'unknown',
}

/**
 * Result of key type detection
 */
export interface KeyInfo {
  /** Detected key type (ED25519, ECDSA, or UNKNOWN) */
  type: KeyType;
  /** Format of the provided key */
  format: 'hex' | 'der' | 'pem' | 'raw';
  /** Whether the key is a private key */
  isPrivateKey: boolean;
  /** Raw bytes of the key (if available) */
  rawBytes?: Uint8Array;
  /** Confidence level of the detection */
  confidence: 'certain' | 'uncertain';
  /** Warning message for uncertain detections */
  warning?: string;
}

/**
 * Legacy interface for backward compatibility
 */
export interface KeyDetectionResult {
  /** Detected key type */
  detectedType: 'ed25519' | 'ecdsa';
  /** Parsed private key */
  privateKey: PrivateKey;
  /** Optional warning for ambiguous keys */
  warning?: string;
}

/**
 * Utility class for detecting cryptographic key types used in Hedera
 *
 * This class provides methods to determine whether a key is ED25519 or ECDSA
 * based on various input formats (hex, DER, PEM) and detection strategies.
 *
 * For ambiguous 32-byte raw keys, it uses heuristics and signature testing
 * to make a best-effort determination. When confidence is 'uncertain',
 * consider using the Hedera mirror node to confirm the key type if you have
 * the associated account ID.
 *
 * @example
 * // Detect key type from a hex string
 * const keyInfo = KeyTypeDetector.detect('0x' + privateKey.toStringRaw());
 * if (keyInfo.confidence === 'uncertain') {
 *   console.warn(keyInfo.warning);
 *   // Consider checking mirror node if account ID is available
 * }
 */
export class KeyTypeDetector {
  private static readonly ED25519_PUBLIC_KEY_LENGTH = 32;
  private static readonly ED25519_EXPANDED_PRIVATE_KEY_LENGTH = 64;

  private static readonly ED25519_PUBLIC_KEY_PREFIX = Buffer.from([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
  ]);
  private static readonly ED25519_PRIVATE_KEY_PREFIX = Buffer.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
    0x04, 0x22, 0x04, 0x20,
  ]);

  private static readonly ECDSA_SECP256K1_PUBLIC_KEY_PREFIX = Buffer.from([
    0x30, 0x56, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
    0x01, 0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a, 0x03, 0x42, 0x00,
  ]);
  private static readonly ECDSA_SECP256K1_PRIVATE_KEY_PREFIX = Buffer.from([
    0x30, 0x74, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  private static readonly ECDSA_SECP256K1_PRIVATE_KEY_PREFIX_SHORT =
    Buffer.from([
      0x30, 0x30, 0x02, 0x01, 0x00, 0x30, 0x07, 0x06, 0x05, 0x2b, 0x81, 0x04,
      0x00, 0x0a, 0x04, 0x22, 0x04, 0x20,
    ]);


  private static readonly ECDSA_SECP256K1_PRIVATE_KEY_PREFIX_LONG = Buffer.from(
    [0x30, 0x77, 0x02, 0x01, 0x01, 0x04, 0x20],
  );

  /**
   * Detects private key type from various input formats without throwing errors
   *
   * This detector is designed for private keys only. It uses various heuristics to determine
   * the key type for ambiguous 32-byte keys, including byte patterns and statistical analysis.
   *
   * For ambiguous cases (where confidence is 'uncertain'), if you have the associated account ID,
   * you can use the Hedera mirror node to confirm the key type.
   *
   * @param keyInput - The key to detect, can be a string (hex, base64, PEM), Buffer, or Uint8Array
   * @returns KeyInfo object containing the detected key type and metadata
   *
   * @example
   * // Detect from hex string
   * const info1 = KeyTypeDetector.detect('0x7f96cea0c0d9d5bfb3ab8a42cf0cea44d57f62f2e068f8e5a3251914a9252b04');
   *
   * // Detect from DER-encoded string
   * const info2 = KeyTypeDetector.detect(privateKey.toStringDer());
   *
   * // Detect from PEM format
   * const info3 = KeyTypeDetector.detect(`-----BEGIN PRIVATE KEY-----
   * MC4CAQAwBQYDK2VwBCIEIGRchBsQGQduAAGBQ7GAkKCKkmQ3EGCARwHsHiRqTNR9
   * -----END PRIVATE KEY-----`);
   */
  static detect(keyInput: string | Uint8Array | Buffer): KeyInfo {
    try {
      let keyBytes: Uint8Array;
      let originalFormat: 'hex' | 'der' | 'pem' | 'raw' = 'raw';

      if (typeof keyInput === 'string') {
        let trimmed = keyInput.trim();

        if (trimmed.includes('-----BEGIN')) {
          return this.detectFromPem(trimmed);
        }

        if (trimmed.toLowerCase().startsWith('0x')) {
          trimmed = trimmed.substring(2);
        }

        if (this.isValidHex(trimmed)) {
          keyBytes = this.hexToBytes(trimmed);
          originalFormat = 'hex';
        } else if (this.isBase64(trimmed)) {
          keyBytes = Buffer.from(trimmed, 'base64');
          originalFormat = 'der';
        } else {
          return {
            type: KeyType.UNKNOWN,
            format: 'raw',
            isPrivateKey: false,
            confidence: 'certain',
          };
        }
      } else if (keyInput instanceof Buffer) {
        keyBytes = new Uint8Array(keyInput);
      } else {
        keyBytes = keyInput as Uint8Array;
      }

      return this.detectFromBytes(keyBytes, originalFormat);
    } catch (error) {
      return {
        type: KeyType.UNKNOWN,
        format: 'raw',
        isPrivateKey: false,
        confidence: 'certain',
      };
    }
  }

  /**
   * Detect key type from raw bytes
   *
   * @param bytes - The raw bytes of the key
   * @param format - The original format of the key
   * @returns KeyInfo object with detection results
   * @private
   */
  private static detectFromBytes(
    bytes: Uint8Array,
    format: 'hex' | 'der' | 'pem' | 'raw',
  ): KeyInfo {
    if (this.hasPrefix(bytes, this.ED25519_PUBLIC_KEY_PREFIX)) {
      const keyStart = this.ED25519_PUBLIC_KEY_PREFIX.length;
      return {
        type: KeyType.ED25519,
        format: 'der',
        isPrivateKey: false,
        rawBytes: bytes.slice(keyStart),
        confidence: 'certain',
      };
    }

    if (this.hasPrefix(bytes, this.ED25519_PRIVATE_KEY_PREFIX)) {
      const keyStart = this.ED25519_PRIVATE_KEY_PREFIX.length;
      if (bytes.length >= keyStart + 32) {
        return {
          type: KeyType.ED25519,
          format: 'der',
          isPrivateKey: true,
          rawBytes: bytes.slice(keyStart, keyStart + 32),
          confidence: 'certain',
        };
      }
    }

    if (this.hasPrefix(bytes, this.ECDSA_SECP256K1_PUBLIC_KEY_PREFIX)) {
      const keyStart = this.ECDSA_SECP256K1_PUBLIC_KEY_PREFIX.length;
      return {
        type: KeyType.ECDSA,
        format: 'der',
        isPrivateKey: false,
        rawBytes: bytes.slice(keyStart),
        confidence: 'certain',
      };
    }

    if (this.hasPrefix(bytes, this.ECDSA_SECP256K1_PRIVATE_KEY_PREFIX_SHORT)) {
      const keyStart = this.ECDSA_SECP256K1_PRIVATE_KEY_PREFIX_SHORT.length;
      return {
        type: KeyType.ECDSA,
        format: 'der',
        isPrivateKey: true,
        rawBytes: bytes.slice(keyStart),
        confidence: 'certain',
      };
    }

    if (this.hasPrefix(bytes, this.ECDSA_SECP256K1_PRIVATE_KEY_PREFIX)) {
      const keyStart = this.ECDSA_SECP256K1_PRIVATE_KEY_PREFIX.length;
      return {
        type: KeyType.ECDSA,
        format: 'der',
        isPrivateKey: true,
        rawBytes: bytes.slice(keyStart, keyStart + 32),
        confidence: 'certain',
      };
    }

    if (this.hasPrefix(bytes, this.ECDSA_SECP256K1_PRIVATE_KEY_PREFIX_LONG)) {
      const keyStart = this.ECDSA_SECP256K1_PRIVATE_KEY_PREFIX_LONG.length;
      return {
        type: KeyType.ECDSA,
        format: 'der',
        isPrivateKey: true,
        rawBytes: bytes.slice(keyStart, keyStart + 32),
        confidence: 'certain',
      };
    }

    if (bytes.length > 36 && this.containsECDSAPrivateKeyPattern(bytes)) {
      return {
        type: KeyType.ECDSA,
        format: 'der',
        isPrivateKey: true,
        rawBytes: this.extractECDSAPrivateKey(bytes),
        confidence: 'certain',
      };
    }

    switch (bytes.length) {
      case this.ED25519_PUBLIC_KEY_LENGTH:

        if (format === 'hex') {
          const hexStr = Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');


          const privateResult = this.tryCreateKey(hexStr);
          if (privateResult.type !== KeyType.UNKNOWN) {
            return privateResult;
          }
        }

        return {
          type: KeyType.UNKNOWN,
          format: format,
          isPrivateKey: false,
          rawBytes: bytes,
          confidence: 'certain',
        };

      case this.ED25519_EXPANDED_PRIVATE_KEY_LENGTH:
        return {
          type: KeyType.ED25519,
          format: format,
          isPrivateKey: true,
          rawBytes: bytes,
          confidence: 'certain',
        };
    }

    return {
      type: KeyType.UNKNOWN,
      format: format,
      isPrivateKey: false,
      rawBytes: bytes,
      confidence: 'certain',
    };
  }

  /**
   * Detect key type from PEM format
   *
   * @param pem - The PEM-encoded key string
   * @returns KeyInfo object with detection results
   * @private
   */
  private static detectFromPem(pem: string): KeyInfo {
    const trimmedPem = pem.trim();
    const isPrivateKey = trimmedPem.includes('PRIVATE KEY');

    const pemTypes = {
      EC_PRIVATE: /-----BEGIN EC PRIVATE KEY-----/,
      EC_PUBLIC: /-----BEGIN EC PUBLIC KEY-----/,
      PRIVATE: /-----BEGIN PRIVATE KEY-----/,
      PUBLIC: /-----BEGIN PUBLIC KEY-----/,
    };

    let isECKey = false;
    for (const [type, regex] of Object.entries(pemTypes)) {
      if (regex.test(trimmedPem) && type.includes('EC')) {
        isECKey = true;
        break;
      }
    }

    const base64Match = trimmedPem.match(
      /-----BEGIN[\s\S]+?-----[\r\n]+([\s\S]+?)[\r\n]+-----END/,
    );
    if (!base64Match) {
      return {
        type: KeyType.UNKNOWN,
        format: 'pem',
        isPrivateKey,
        confidence: 'certain',
      };
    }

    const base64Content = base64Match[1].replace(/\s/g, '');
    try {
      const derBytes = Buffer.from(base64Content, 'base64');
      const result = this.detectFromBytes(new Uint8Array(derBytes), 'der');

      if (result.type === KeyType.UNKNOWN && isECKey) {
        return {
          type: KeyType.ECDSA,
          format: 'pem',
          isPrivateKey,
          rawBytes: derBytes,
          confidence: 'certain',
        };
      }

      return {
        ...result,
        format: 'pem',
      };
    } catch {
      return {
        type: KeyType.UNKNOWN,
        format: 'pem',
        isPrivateKey,
        confidence: 'certain',
      };
    }
  }

  /**
   * Try to create a key using Hedera SDK to validate the type
   *
   * @param keyInput - The key input string or bytes
   * @returns KeyInfo object with detection results
   * @private
   */
  private static tryCreateKey(keyInput: string | Uint8Array): KeyInfo {
    try {
      if (typeof keyInput === 'string') {
        let keyStr = keyInput.trim();
        if (keyStr.toLowerCase().startsWith('0x')) {
          keyStr = keyStr.substring(2);
        }

        if (this.isValidHex(keyStr) && keyStr.length === 64) {
          const keyBytes = this.hexToBytes(keyStr);


          const signatureResult = this.detectBySignature(keyStr);
          if (signatureResult.type !== KeyType.UNKNOWN) {
            return {
              type: signatureResult.type,
              format: 'hex',
              isPrivateKey: true,
              rawBytes: keyBytes,
              confidence: signatureResult.confidence,
              warning: signatureResult.warning,
            };
          }

          return {
            type: KeyType.UNKNOWN,
            format: 'hex',
            isPrivateKey: false,
            rawBytes: keyBytes,
            confidence: 'certain',
          };
        }
      }
    } catch {

    }

    return {
      type: KeyType.UNKNOWN,
      format: 'hex',
      isPrivateKey: false,
      rawBytes: new Uint8Array(),
      confidence: 'certain',
    };
  }

  /**
   * Detect key type by attempting to sign a message with both algorithms
   *
   * For ambiguous cases where both algorithms can use the key, this method
   * uses heuristics to make a best-effort determination. For production use
   * with ambiguous keys, consider using the Hedera mirror node to confirm
   * the key type if you have the associated account ID.
   *
   * @param hexKey - The hex string representation of the key
   * @returns Object containing type, confidence level, and optional warning
   * @private
   */
  private static detectBySignature(hexKey: string): {
    type: KeyType;
    confidence: 'certain' | 'uncertain';
    warning?: string;
  } {

    const keyBigInt = BigInt('0x' + hexKey);
    const secp256k1Order = BigInt(
      '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141',
    );


    if (keyBigInt === 0n) {
      return {
        type: KeyType.ED25519,
        confidence: 'certain',
      };
    }


    if (keyBigInt >= secp256k1Order) {
      return {
        type: KeyType.ED25519,
        confidence: 'certain',
      };
    }


    let ed25519CanSign = false;
    let ecdsaCanSign = false;


    try {
      const ed25519Key = PrivateKey.fromStringED25519(hexKey);
      const testMessage = new Uint8Array([1, 2, 3, 4, 5]);
      const signature = ed25519Key.sign(testMessage);
      if (ed25519Key.publicKey.verify(testMessage, signature)) {
        ed25519CanSign = true;
      }
    } catch {

    }


    try {
      const ecdsaKey = PrivateKey.fromStringECDSA(hexKey);
      const testMessage = new Uint8Array([1, 2, 3, 4, 5]);
      const signature = ecdsaKey.sign(testMessage);
      if (ecdsaKey.publicKey.verify(testMessage, signature)) {
        ecdsaCanSign = true;
      }
    } catch {

    }


    if (ed25519CanSign && ecdsaCanSign) {

      const keyBytes = this.hexToBytes(hexKey);


      if (keyBytes[0] === 0xa8 && keyBytes[1] === 0x01) {
        return {
          type: KeyType.ED25519,
          confidence: 'uncertain',
          warning:
            'Detection based on byte pattern heuristic. Both ED25519 and ECDSA accept this key.',
        };
      }


      let highBytes = 0;
      for (const byte of keyBytes) {
        if (byte >= 0x80) highBytes++;
      }


      const highByteRatio = highBytes / keyBytes.length;
      if (highByteRatio >= 0.4 && highByteRatio <= 0.6) {
        return {
          type: KeyType.ECDSA,
          confidence: 'uncertain',
          warning:
            'Detection based on entropy heuristic. Both ED25519 and ECDSA accept this key.',
        };
      }


      return {
        type: KeyType.ECDSA,
        confidence: 'uncertain',
        warning:
          'Detection based on entropy heuristic. Both ED25519 and ECDSA accept this key. Defaulting to ECDSA.',
      };
    }


    if (ed25519CanSign && !ecdsaCanSign) {
      return {
        type: KeyType.ED25519,
        confidence: 'certain',
      };
    }

    if (ecdsaCanSign && !ed25519CanSign) {
      return {
        type: KeyType.ECDSA,
        confidence: 'certain',
      };
    }

    return {
      type: KeyType.UNKNOWN,
      confidence: 'certain',
    };
  }

  /**
   * Check if a string is valid hexadecimal with even length
   *
   * @param str - The string to check
   * @returns True if the string is valid hex with even length
   * @private
   */
  private static isValidHex(str: string): boolean {
    return /^[0-9a-fA-F]+$/.test(str) && str.length % 2 === 0;
  }

  /**
   * Check if a string is valid base64
   *
   * @param str - The string to check
   * @returns True if the string is valid base64
   * @private
   */
  private static isBase64(str: string): boolean {
    try {
      return Buffer.from(str, 'base64').toString('base64') === str;
    } catch {
      return false;
    }
  }

  /**
   * Convert a hex string to bytes
   *
   * @param hex - The hex string to convert
   * @returns Uint8Array of bytes
   * @private
   */
  private static hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Check if bytes start with a specific prefix
   *
   * @param bytes - The bytes to check
   * @param prefix - The prefix to look for
   * @returns True if bytes start with the prefix
   * @private
   */
  private static hasPrefix(bytes: Uint8Array, prefix: Buffer): boolean {
    if (bytes.length < prefix.length) return false;
    for (let i = 0; i < prefix.length; i++) {
      if (bytes[i] !== prefix[i]) return false;
    }
    return true;
  }

  /**
   * Check if bytes contain an ECDSA private key pattern
   *
   * @param bytes - The bytes to check
   * @returns True if ECDSA private key pattern is found
   * @private
   */
  private static containsECDSAPrivateKeyPattern(bytes: Uint8Array): boolean {

    for (let i = 0; i < bytes.length - 7; i++) {
      if (
        bytes[i] === 0x30 &&
        bytes[i + 1] === 0x74 &&
        bytes[i + 2] === 0x02 &&
        bytes[i + 3] === 0x01 &&
        bytes[i + 4] === 0x01 &&
        bytes[i + 5] === 0x04 &&
        bytes[i + 6] === 0x20
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Extract ECDSA private key from DER structure
   *
   * @param bytes - The DER encoded bytes
   * @returns The extracted private key bytes
   * @private
   */
  private static extractECDSAPrivateKey(bytes: Uint8Array): Uint8Array {

    for (let i = 0; i < bytes.length - 32; i++) {
      if (bytes[i] === 0x04 && bytes[i + 1] === 0x20) {
        return bytes.slice(i + 2, i + 34);
      }
    }
    return bytes;
  }
}

/**
 * Detects the key type from a private key string and returns the parsed PrivateKey
 *
 * This function leverages the KeyTypeDetector class to determine whether a key is
 * ED25519 or ECDSA. It handles parsing the key and provides appropriate warnings
 * for uncertain detections.
 *
 * Note: For ambiguous keys, if you have the associated account ID, consider using
 * the Hedera mirror node to confirm the key type for production use.
 *
 * @param privateKeyString The private key string to detect type from
 * @returns The detected key type, parsed PrivateKey, and optional warning
 * @throws Error if the private key cannot be parsed
 */
export function detectKeyTypeFromString(
  privateKeyString: string,
): KeyDetectionResult {

  const keyInfo = KeyTypeDetector.detect(privateKeyString);


  if (keyInfo.type !== KeyType.UNKNOWN) {
    try {
      const privateKey =
        keyInfo.type === KeyType.ECDSA
          ? PrivateKey.fromStringECDSA(privateKeyString)
          : PrivateKey.fromStringED25519(privateKeyString);


      const result: KeyDetectionResult = {
        detectedType: keyInfo.type as 'ed25519' | 'ecdsa',
        privateKey,
      };

      if (keyInfo.confidence === 'uncertain') {
        result.warning =
          `Key type detection is uncertain. If you have the associated account ID, ` +
          `consider using the Hedera mirror node to confirm the key type.`;
      }

      return result;
    } catch (error) {

    }
  }




  try {
    const privateKey = PrivateKey.fromStringECDSA(privateKeyString);
    return {
      detectedType: 'ecdsa',
      privateKey,
      warning: `Using ECDSA as default. If you have the associated account ID, consider using the Hedera mirror node to confirm the key type.`,
    };
  } catch (ecdsaError) {

    try {
      const privateKey = PrivateKey.fromStringED25519(privateKeyString);
      return {
        detectedType: 'ed25519',
        privateKey,
        warning: `Using ED25519 as fallback. If you have the associated account ID, consider using the Hedera mirror node to confirm the key type.`,
      };
    } catch (ed25519Error) {

      throw new Error(
        `Failed to parse private key as either ECDSA or ED25519: ${ecdsaError}`,
      );
    }
  }
}
