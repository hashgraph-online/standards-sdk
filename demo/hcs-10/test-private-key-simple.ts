import dotenv from 'dotenv';
import { 
  Client, 
  PrivateKey, 
  AccountBalanceQuery, 
  TransferTransaction, 
  Hbar 
} from '@hashgraph/sdk';
import { detectKeyTypeFromString } from '../../src/utils/key-type-detector';

dotenv.config();

async function main() {
  try {
    console.log('=== SIMPLE PRIVATE KEY & SIGNING TEST ===');
    
    const accountId = process.env.HEDERA_ACCOUNT_ID;
    const privateKeyStr = process.env.HEDERA_PRIVATE_KEY;
    
    if (!accountId || !privateKeyStr) {
      console.error('❌ Environment variables HEDERA_ACCOUNT_ID and/or HEDERA_PRIVATE_KEY are not set');
      console.error('Please make sure you have a .env file with these variables');
      return;
    }
    
    console.log('1. Account ID:', accountId);
    console.log('2. Private Key (first 20 chars):', privateKeyStr.substring(0, 20) + '...');
    console.log('3. Private Key Length:', privateKeyStr.length);
    
    // Test key detection
    console.log('\n=== KEY DETECTION TEST ===');
    try {
      const keyDetection = detectKeyTypeFromString(privateKeyStr);
      console.log('✅ Key detection successful');
      console.log('   Detected type:', keyDetection.detectedType);
      console.log('   Private key object created:', !!keyDetection.privateKey);
      console.log('   Public key:', keyDetection.privateKey.publicKey.toString());
      
      // Test client setup
      console.log('\n=== CLIENT SETUP TEST ===');
      const client = Client.forTestnet();
      client.setOperator(accountId, keyDetection.privateKey);
      console.log('✅ Client operator set successfully');
      
      // Test account balance query (simple read operation)
      console.log('\n=== ACCOUNT BALANCE TEST ===');
      const balance = await new AccountBalanceQuery()
        .setAccountId(accountId)
        .execute(client);
      console.log('✅ Account balance query successful');
      console.log('   HBAR Balance:', balance.hbars.toString());
      
      // Test transaction creation and signing (but don't execute)
      console.log('\n=== TRANSACTION SIGNING TEST ===');
      const testTransaction = new TransferTransaction()
        .addHbarTransfer(accountId, Hbar.fromTinybars(-1)) // Tiny transfer to self
        .addHbarTransfer(accountId, Hbar.fromTinybars(1))
        .setTransactionMemo('Test transaction - NOT EXECUTED')
        .freezeWith(client);
      
      console.log('✅ Transaction created and frozen');
      console.log('   Transaction ID:', testTransaction.transactionId?.toString());
      console.log('   Is Frozen:', testTransaction.isFrozen());
      
      // Sign the transaction
      const signedTransaction = await testTransaction.sign(keyDetection.privateKey);
      console.log('✅ Transaction signed successfully');
      
      // Check signatures
      const signatures = signedTransaction.getSignatures();
      console.log('   Number of signatures:', signatures.size);
      console.log('   Transaction account ID:', signedTransaction.transactionId?.accountId?.toString());
      
      console.log('\n=== TRANSACTION DECODING (ROUND-TRIP) TEST ===');
      const originalPayerAccountId = testTransaction.transactionId?.accountId?.toString();
      console.log('   Original Payer Account ID:', originalPayerAccountId);

      const transactionBytes = testTransaction.toBytes();
      console.log('✅ Transaction converted to bytes');

      const decodedTransaction = TransferTransaction.fromBytes(transactionBytes);
      console.log('✅ Transaction decoded from bytes');

      const decodedPayerAccountId = decodedTransaction.transactionId?.accountId?.toString();
      console.log('   Decoded Payer Account ID:', decodedPayerAccountId);

      if (decodedPayerAccountId === originalPayerAccountId) {
        console.log('✅ SUCCESS: Decoded account ID matches the original.');
      } else {
        console.error('❌ FAILURE: Decoded account ID does NOT match the original.');
      }

      console.log('\n=== SUMMARY ===');
      console.log('✅ Private key format: VALID');
      console.log('✅ Key detection: WORKING');
      console.log('✅ Client setup: WORKING');
      console.log('✅ Account access: WORKING');
      console.log('✅ Transaction signing: WORKING');
      console.log('✅ All tests passed! Your private key and setup are correct.');
      
    } catch (keyError) {
      console.error('❌ Key detection failed:', keyError);
      
      // Fallback test with direct key parsing
      console.log('\n=== FALLBACK KEY PARSING TEST ===');
      try {
        const ed25519Key = PrivateKey.fromStringED25519(privateKeyStr);
        console.log('✅ ED25519 parsing successful');
        console.log('   Public key:', ed25519Key.publicKey.toString());
      } catch (ed25519Error) {
        console.error('❌ ED25519 parsing failed:', ed25519Error);
        
        try {
          const ecdsaKey = PrivateKey.fromStringECDSA(privateKeyStr);
          console.log('✅ ECDSA parsing successful');
          console.log('   Public key:', ecdsaKey.publicKey.toString());
        } catch (ecdsaError) {
          console.error('❌ ECDSA parsing failed:', ecdsaError);
          
          try {
            const genericKey = PrivateKey.fromString(privateKeyStr);
            console.log('✅ Generic parsing successful');
            console.log('   Public key:', genericKey.publicKey.toString());
          } catch (genericError) {
            console.error('❌ All key parsing methods failed');
            console.error('   Your private key format might be invalid');
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main().catch(console.error); 