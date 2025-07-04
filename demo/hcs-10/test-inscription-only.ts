import dotenv from 'dotenv';
import { InscriptionSDK } from '@kiloscribe/inscription-sdk';
import { detectKeyTypeFromString } from '../../src/utils/key-type-detector';

dotenv.config();

async function main() {
  try {
    console.log('=== INSCRIPTION-ONLY TEST ===');
    
    const accountId = process.env.HEDERA_ACCOUNT_ID;
    const privateKeyStr = process.env.HEDERA_PRIVATE_KEY;
    const holderId = process.env.HOLDER_ID;
    
    if (!accountId || !privateKeyStr || !holderId) {
      console.error('❌ Missing environment variables');
      console.error('Required: HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, HOLDER_ID');
      return;
    }
    
    console.log('1. Account ID:', accountId);
    console.log('2. Holder ID:', holderId);
    console.log('3. Private Key (first 20 chars):', privateKeyStr.substring(0, 20) + '...');
    
    // Test key detection
    console.log('\n=== KEY DETECTION TEST ===');
    const keyDetection = detectKeyTypeFromString(privateKeyStr);
    console.log('✅ Key detected as:', keyDetection.detectedType);
    console.log('✅ Private key object created successfully');
    
    // Initialize Inscription SDK
    console.log('\n=== INSCRIPTION SDK TEST ===');
    const sdk = await InscriptionSDK.createWithAuth({
      type: 'server',
      accountId,
      // Use private key string directly instead of object
      privateKey: privateKeyStr,
      network: 'testnet',
    });
    console.log('✅ InscriptionSDK initialized successfully');
    
    // Test simple inscription
    console.log('\n=== INSCRIPTION TEST ===');
    const testContent = JSON.stringify({
      test: 'Simple inscription test',
      timestamp: new Date().toISOString(),
      account: accountId,
    });
    
    console.log('Content to inscribe:', testContent);
    
    try {
      const result = await sdk.inscribeAndExecute(
        {
          file: {
            type: 'base64',
            base64: Buffer.from(testContent).toString('base64'),
            fileName: 'test-inscription.json',
            mimeType: 'application/json',
          },
          holderId: holderId,
          mode: 'file',
          network: 'testnet',
          description: 'Test inscription to debug signing issues',
        },
        {
          network: 'testnet',
          accountId: accountId,
          // Use private key string directly
          privateKey: privateKeyStr,
        }
      );
      
      console.log('✅ Inscription successful!');
      console.log('Transaction ID:', result.jobId);
      console.log('Result:', JSON.stringify(result, null, 2));
      
    } catch (inscriptionError) {
      console.error('❌ Inscription failed:', inscriptionError.message);
      console.error('Full error:', inscriptionError);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

main().catch(console.error); 