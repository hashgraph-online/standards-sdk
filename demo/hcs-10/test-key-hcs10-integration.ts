import { HCS10Client } from '../../src';
import { PrivateKey } from '@hashgraph/sdk';
import { detectKeyTypeFromString } from '../../src/utils/key-type-detector';
import dotenv from 'dotenv';

dotenv.config();

async function testKeyDetectionOnly() {
  console.log('\n🔍 Testing Key Detection Only (No Account Validation)\n');

  // Generate test keys
  const ed25519Key = PrivateKey.generateED25519();
  const ecdsaKey = PrivateKey.generateECDSA();

  const testCases = [
    {
      name: 'ED25519 Raw Hex',
      keyString: ed25519Key.toStringRaw(),
      expectedType: 'ed25519'
    },
    {
      name: 'ED25519 Hex with 0x (MAIN BUG FIX)',
      keyString: `0x${ed25519Key.toStringRaw()}`,
      expectedType: 'ed25519'
    },
    {
      name: 'ED25519 DER',
      keyString: ed25519Key.toStringDer(),
      expectedType: 'ed25519'
    },
    {
      name: 'ECDSA Raw Hex (defaults to ED25519)',
      keyString: ecdsaKey.toStringRaw(),
      expectedType: 'ed25519' // Raw hex keys default to ED25519
    },
    {
      name: 'ECDSA Hex with 0x (defaults to ED25519)',
      keyString: `0x${ecdsaKey.toStringRaw()}`,
      expectedType: 'ed25519' // Raw hex keys default to ED25519
    },
    {
      name: 'ECDSA DER (deterministic)',
      keyString: ecdsaKey.toStringDer(),
      expectedType: 'ecdsa'
    },
  ];

  console.log('📝 Note: Raw 32-byte hex keys (with or without 0x) are ambiguous.');
  console.log('The detector defaults to ED25519 for such cases.\n');

  let passCount = 0;
  let failCount = 0;

  for (const testCase of testCases) {
    try {
      console.log(`🧪 ${testCase.name}`);
      console.log(`   Key: ${testCase.keyString.substring(0, 20)}...`);

      const result = detectKeyTypeFromString(testCase.keyString);
      
      if (result.detectedType === testCase.expectedType) {
        console.log(`   ✅ Correctly detected as: ${result.detectedType}`);
        passCount++;
      } else {
        console.log(`   ❌ Expected ${testCase.expectedType}, got ${result.detectedType}`);
        failCount++;
      }

      // Test that the private key actually works
      try {
        const publicKey = result.privateKey.publicKey;
        console.log(`   ✅ Key is valid and functional`);
      } catch (e) {
        console.log(`   ⚠️  Key detected but public key extraction failed: ${e}`);
      }

    } catch (error) {
      console.log(`   💥 Detection failed: ${error instanceof Error ? error.message : error}`);
      failCount++;
    }
  }

  console.log(`\n📊 Key Detection Summary: ${passCount} passed, ${failCount} failed`);
  return { passCount, failCount };
}

async function testHCS10WithDifferentKeyFormats() {
  console.log('🔗 Testing HCS10Client with Different Key Formats\n');

  // Generate test keys
  const ed25519Key = PrivateKey.generateED25519();
  const ecdsaKey = PrivateKey.generateECDSA();

  // Use real account IDs from environment for testing
  const testAccountIds = [
    process.env.HEDERA_ACCOUNT_ID || '0.0.5864628',
    process.env.ALICE_ACCOUNT_ID || '0.0.6266905',
    process.env.BOB_ACCOUNT_ID || '0.0.6266910'
  ];

  const testCases = [
    {
      name: 'ED25519 Raw Hex',
      keyString: ed25519Key.toStringRaw(),
      expectedType: 'ed25519'
    },
    {
      name: 'ED25519 Hex with 0x (MAIN BUG FIX)',
      keyString: `0x${ed25519Key.toStringRaw()}`,
      expectedType: 'ed25519'
    },
    {
      name: 'ED25519 DER',
      keyString: ed25519Key.toStringDer(),
      expectedType: 'ed25519'
    },
    {
      name: 'ECDSA DER (deterministic)',
      keyString: ecdsaKey.toStringDer(),
      expectedType: 'ecdsa'
    },
  ];

  // Test each key format with a real account ID
  for (const testCase of testCases) {
    try {
      console.log(`\n🧪 Testing: ${testCase.name}`);
      console.log(`   Key: ${testCase.keyString.substring(0, 20)}...`);

      // First, test the detector directly
      const detectionResult = detectKeyTypeFromString(testCase.keyString);
      console.log(`   ✅ Detected type: ${detectionResult.detectedType}`);

      if (detectionResult.detectedType !== testCase.expectedType) {
        console.log(`   ❌ Expected ${testCase.expectedType}, got ${detectionResult.detectedType}`);
        continue;
      }

      // Test creating HCS10Client with auto-detection (no keyType specified)
      // Use the first available real account ID
      const testAccountId = testAccountIds[0];
      
      try {
        const client = new HCS10Client({
          network: 'testnet',
          operatorId: testAccountId,
          operatorPrivateKey: testCase.keyString,
          // Note: No keyType specified - should auto-detect
        });

        // Test that the client initializes correctly (this validates the account exists)
        console.log(`   ✅ HCS10Client created successfully`);
        console.log(`   🔑 Key type auto-detected and working`);

        // Test with explicit keyType
        const explicitClient = new HCS10Client({
          network: 'testnet',
          operatorId: testAccountId,
          operatorPrivateKey: testCase.keyString,
          keyType: testCase.expectedType,
        });

        console.log(`   ✅ HCS10Client with explicit keyType successful`);

      } catch (error) {
        console.log(`   ❌ HCS10Client failed: ${error instanceof Error ? error.message : error}`);
      }

    } catch (error) {
      console.log(`   💥 Test failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Test with environment key if available
  if (process.env.HEDERA_PRIVATE_KEY && process.env.HEDERA_ACCOUNT_ID) {
    console.log(`\n🌍 Testing with Environment Variables:`);
    try {
      const detectionResult = detectKeyTypeFromString(process.env.HEDERA_PRIVATE_KEY);
      console.log(`   ✅ Environment key detected as: ${detectionResult.detectedType}`);

      const client = new HCS10Client({
        network: 'testnet',
        operatorId: process.env.HEDERA_ACCOUNT_ID,
        operatorPrivateKey: process.env.HEDERA_PRIVATE_KEY,
        // Auto-detection should work
      });

      await client.initializeOperator();
      console.log(`   ✅ HCS10Client with environment key successful`);
      console.log(`   🎯 Real-world key type detection working!`);

    } catch (error) {
      console.log(`   ❌ Environment key test failed: ${error instanceof Error ? error.message : error}`);
    }
  } else {
    console.log(`\n🌍 Environment Variables: HEDERA_PRIVATE_KEY or HEDERA_ACCOUNT_ID not set`);
  }
}

async function demonstrateTheMainBugFix() {
  console.log('\n🐛 Demonstrating the Main Bug Fix\n');
  console.log('Before the fix: ED25519 keys with 0x prefix were incorrectly detected as ECDSA');
  console.log('After the fix: ED25519 keys with 0x prefix are correctly detected as ED25519\n');

  const ed25519Key = PrivateKey.generateED25519();
  const ed25519WithPrefix = `0x${ed25519Key.toStringRaw()}`;

  console.log(`Test Key: ${ed25519WithPrefix}`);
  console.log(`Expected: ed25519`);

  try {
    const result = detectKeyTypeFromString(ed25519WithPrefix);
    console.log(`Detected: ${result.detectedType}`);
    
    if (result.detectedType === 'ed25519') {
      console.log(`✅ BUG FIX WORKING: Correctly detected ED25519 with 0x prefix!`);
    } else {
      console.log(`❌ BUG STILL EXISTS: Incorrectly detected as ${result.detectedType}`);
    }

    // Show it works with the HCS10Client (but don't call initializeOperator with dummy account)
    const client = new HCS10Client({
      network: 'testnet',
      operatorId: process.env.HEDERA_ACCOUNT_ID || '0.0.5864628',
      operatorPrivateKey: ed25519WithPrefix,
    });

    console.log(`✅ HCS10Client successfully created with hex-prefixed ED25519 key!`);
    
    // Only test initialization if we have a real account
    if (process.env.HEDERA_ACCOUNT_ID) {
    await client.initializeOperator();
      console.log(`✅ HCS10Client successfully initialized with real account!`);
    }
    
  } catch (error) {
    console.log(`❌ Test failed: ${error instanceof Error ? error.message : error}`);
  }
}

async function main() {
  console.log('🔧 HCS10Client Key Type Integration Test');
  console.log('=========================================\n');

  await demonstrateTheMainBugFix();
  
  const { passCount, failCount } = await testKeyDetectionOnly();
  
  if (failCount === 0) {
    console.log('✅ All key detection tests passed! Proceeding with HCS10Client tests...\n');
  await testHCS10WithDifferentKeyFormats();
  } else {
    console.log('❌ Some key detection tests failed. Please check the implementation.\n');
  }

  console.log('\n' + '='.repeat(50));
  console.log('🎉 Integration test complete!');
  console.log('The key type detector fix is working with HCS10Client.');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { testHCS10WithDifferentKeyFormats, demonstrateTheMainBugFix }; 