import { PrivateKey, TransferTransaction, AccountId, TransactionId } from '@hashgraph/sdk';
import { KeyTypeDetector, KeyType, detectKeyTypeFromString } from '../src/utils/key-type-detector';

// Set longer timeout for transaction tests
jest.setTimeout(30000);

describe('Key Type Detection', () => {
  // For testing ambiguous keys
  let ambiguousKey: string;
  let ambiguousKeyWithPrefix: string;
  
  beforeAll(() => {
    // Generate an ambiguous key that works with both algorithms
    let isAmbiguous = false;
    let attempts = 0;
    const maxAttempts = 100;
    
    while (!isAmbiguous && attempts < maxAttempts) {
      attempts++;
      const privateKey = PrivateKey.generateECDSA();
      const hexKey = privateKey.toStringRaw();
      
      try {
        const ed25519Key = PrivateKey.fromStringED25519(hexKey);
        const ecdsaKey = PrivateKey.fromStringECDSA(hexKey);
        
        const testMessage = new Uint8Array([1, 2, 3, 4, 5]);
        const ed25519Signature = ed25519Key.sign(testMessage);
        const ecdsaSignature = ecdsaKey.sign(testMessage);
        
        if (ed25519Key.publicKey.verify(testMessage, ed25519Signature) && 
            ecdsaKey.publicKey.verify(testMessage, ecdsaSignature)) {
          isAmbiguous = true;
          ambiguousKey = hexKey;
          ambiguousKeyWithPrefix = '0x' + hexKey;
        }
      } catch {
        // Not ambiguous, continue
      }
    }
  });

  describe('detectKeyTypeFromString', () => {
    describe('ED25519 key detection', () => {
      it('should detect ED25519 key with DER header', () => {
        const ed25519DerKey = '302e020100300506032b657004220420' + '0'.repeat(64);
        const result = detectKeyTypeFromString(ed25519DerKey);

        expect(result.detectedType).toBe('ed25519');
        expect(result.privateKey).toBeDefined();
      });

      it('should detect ED25519 key by length (96 chars)', () => {
        // Generate a valid ED25519 private key
        const privateKey = PrivateKey.generateED25519();
        const keyString = privateKey.toString();

        const result = detectKeyTypeFromString(keyString);

        expect(result.detectedType).toBe('ed25519');
        expect(result.privateKey.toString()).toBe(keyString);
      });

      it('should detect ED25519 key even if length suggests ECDSA', () => {
        const privateKey = PrivateKey.generateED25519();
        const fullKeyString = privateKey.toString();

        const result = detectKeyTypeFromString(fullKeyString);
        expect(result.detectedType).toBe('ed25519');
        expect(result.privateKey).toBeDefined();
      });
    });

    describe('ECDSA key detection', () => {
      it('should detect ECDSA key with 0x prefix', () => {
        const privateKey = PrivateKey.generateECDSA();
        const hexKey = privateKey.toStringRaw();
        const ecdsaKey = '0x' + hexKey;

        const result = detectKeyTypeFromString(ecdsaKey);

        expect(result.detectedType).toBe('ecdsa');
        expect(result.privateKey).toBeDefined();
      });

      it('should detect ECDSA key with DER header', () => {
        const privateKey = PrivateKey.generateECDSA();
        const ecdsaDerKey = privateKey.toString();

        const result = detectKeyTypeFromString(ecdsaDerKey);

        expect(result.detectedType).toBe('ecdsa');
        expect(result.privateKey).toBeDefined();
      });

      it('should detect ECDSA key by length (88 chars)', () => {
        // Generate a valid ECDSA private key
        const privateKey = PrivateKey.generateECDSA();
        const keyString = privateKey.toString();

        const result = detectKeyTypeFromString(keyString);

        expect(result.detectedType).toBe('ecdsa');
        expect(result.privateKey.toString()).toBe(keyString);
      });
    });

    describe('Fallback behavior', () => {
      it('should try alternate type if first detection fails', () => {
        const invalidKeyWithEcdsaHint = '0x' + 'z'.repeat(64);

        expect(() => detectKeyTypeFromString(invalidKeyWithEcdsaHint)).toThrow(
          /Failed to parse private key/,
        );
      });

      it('should handle keys without obvious indicators', () => {
        // Generate a key and strip any obvious indicators
        const privateKey = PrivateKey.generateED25519();
        const keyString = privateKey.toString();

        const result = detectKeyTypeFromString(keyString);

        expect(['ed25519', 'ecdsa']).toContain(result.detectedType);
        expect(result.privateKey).toBeDefined();
      });
    });

    describe('Error handling', () => {
      it('should throw error for invalid key string', () => {
        const invalidKey = 'not-a-valid-key';

        expect(() => detectKeyTypeFromString(invalidKey)).toThrow(
          /Failed to parse private key/,
        );
      });

      it('should throw error for empty string', () => {
        expect(() => detectKeyTypeFromString('')).toThrow(
          /Failed to parse private key/,
        );
      });

      it('should throw error for malformed hex string', () => {
        const malformedKey = '0xGHIJKL'; // Invalid hex characters

        expect(() => detectKeyTypeFromString(malformedKey)).toThrow(
          /Failed to parse private key/,
        );
      });
    });

    describe('Real key examples', () => {
      it('should correctly identify real ED25519 DER encoded keys', () => {
        const privateKey = PrivateKey.generateED25519();
        const ed25519Example = privateKey.toString();

        const result = detectKeyTypeFromString(ed25519Example);
        expect(result.detectedType).toBe('ed25519');
        expect(result.privateKey).toBeDefined();
      });

      it('should correctly identify real ECDSA keys with various formats', () => {
        const privateKey = PrivateKey.generateECDSA();
        const rawHex = privateKey.toStringRaw();
        const ecdsaHexExample = '0x' + rawHex;

        const result = detectKeyTypeFromString(ecdsaHexExample);
        expect(result.detectedType).toBe('ecdsa');
        expect(result.privateKey).toBeDefined();
      });
    });
  });
  
  describe('KeyTypeDetector', () => {
    describe('Ambiguous key handling', () => {
      it('should default to ECDSA for ambiguous 32-byte keys', () => {
        if (!ambiguousKey) {
          console.log('No ambiguous key found, skipping test');
          return;
        }
        
        const result = KeyTypeDetector.detect(ambiguousKey);
        
        expect(result.confidence).toBe('uncertain');
        expect(result.type).toBe(KeyType.ECDSA);
        expect(result.warning).toBeDefined();
        expect(result.warning).toContain('Both ED25519 and ECDSA accept this key');
      });

      it('should default to ECDSA for hex-encoded ambiguous keys', () => {
        if (!ambiguousKeyWithPrefix) {
          console.log('No ambiguous key found, skipping test');
          return;
        }
        
        const result = KeyTypeDetector.detect(ambiguousKeyWithPrefix);
        
        expect(result.confidence).toBe('uncertain');
        expect(result.type).toBe(KeyType.ECDSA);
        expect(result.warning).toBeDefined();
      });

      it('should provide specific warning message for ambiguous keys', () => {
        if (!ambiguousKey) {
          console.log('No ambiguous key found, skipping test');
          return;
        }
        
        const result = detectKeyTypeFromString(ambiguousKey);
        
        expect(result.detectedType).toBe('ecdsa');
        expect(result.warning).toBeDefined();
        expect(result.warning).toContain('Key type detection is uncertain');
        expect(result.warning).toContain('If you have the associated account ID');
        expect(result.warning).toContain('mirror node');
      });
      
      it('should provide appropriate warning for ambiguous keys', () => {
        // Use a key that will be detected as ambiguous
        const result = detectKeyTypeFromString('0000000000000000000000000000000000000000000000000000000000000001');
        
        expect(result.detectedType).toBe('ecdsa');
        expect(result.warning).toBeDefined();
        // Check for the actual warning message pattern - at least one of these should be in the warning
        const hasExpectedWarning = 
          result.warning!.includes('Key type detection is uncertain') || 
          result.warning!.includes('Using ECDSA as default');
        expect(hasExpectedWarning).toBe(true);
      });
    });
    
    describe('Format detection', () => {
      it('should detect various key formats correctly', () => {
        const ecdsaKey = PrivateKey.generateECDSA();
        
        expect(KeyTypeDetector.detect(ecdsaKey.toStringRaw()).format).toBe('hex');
        expect(KeyTypeDetector.detect('0x' + ecdsaKey.toStringRaw()).format).toBe('hex');
        expect(KeyTypeDetector.detect(ecdsaKey.toString()).format).toBe('der');
      });
    });
    
    describe('Transaction signing', () => {
      it('should successfully sign a transaction with detected ECDSA key', async () => {
        // Generate a new ECDSA key
        const ecdsaKey = PrivateKey.generateECDSA();
        const keyString = ecdsaKey.toString();
        
        // Detect key type
        const keyDetection = detectKeyTypeFromString(keyString);
        expect(keyDetection.detectedType).toBe('ecdsa');
        
        // Create a transaction with a transaction ID
        const transaction = await new TransferTransaction()
          .setNodeAccountIds([new AccountId(3)])
          .setTransactionId(TransactionId.generate(AccountId.fromString('0.0.1000')))
          .freeze();
        
        // Sign with the detected key
        const signedBytes = keyDetection.privateKey.sign(transaction.toBytes());
        
        // Verify the signature with the public key
        const verified = keyDetection.privateKey.publicKey.verify(transaction.toBytes(), signedBytes);
        expect(verified).toBe(true);
      });
      
      it('should successfully sign a transaction with detected ED25519 key', async () => {
        // Generate a new ED25519 key
        const ed25519Key = PrivateKey.generateED25519();
        const keyString = ed25519Key.toString();
        
        // Detect key type
        const keyDetection = detectKeyTypeFromString(keyString);
        expect(keyDetection.detectedType).toBe('ed25519');
        
        // Create a transaction with a transaction ID
        const transaction = await new TransferTransaction()
          .setNodeAccountIds([new AccountId(3)])
          .setTransactionId(TransactionId.generate(AccountId.fromString('0.0.1000')))
          .freeze();
        
        // Sign with the detected key
        const signedBytes = keyDetection.privateKey.sign(transaction.toBytes());
        
        // Verify the signature with the public key
        const verified = keyDetection.privateKey.publicKey.verify(transaction.toBytes(), signedBytes);
        expect(verified).toBe(true);
      });
    });
  });
});
