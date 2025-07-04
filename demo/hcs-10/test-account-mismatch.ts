import dotenv from 'dotenv';
import { HCS10Client, Logger } from '../../src';
import { detectKeyTypeFromString } from '../../src/utils/key-type-detector';
import { PrivateKey, TransferTransaction } from '@hashgraph/sdk';
import { InscriptionSDK } from '@kiloscribe/inscription-sdk';

dotenv.config();

const logger = new Logger({
  module: 'AccountMismatchTest',
  level: 'debug',
  prettyPrint: true,
});

/**
 * This test demonstrates the account mismatch issue that causes INVALID_SIGNATURE errors
 * when using the Kiloscribe Inscription SDK
 */
async function main() {
  try {
    // 1. Get the account info from the environment
    const accountId = process.env.HEDERA_ACCOUNT_ID!;
    const privateKeyStr = process.env.HEDERA_PRIVATE_KEY!;
    const privateKey = detectKeyTypeFromString(privateKeyStr).privateKey;
    
    logger.info('Using account:', { accountId });
    
    // 2. Initialize the HCS10Client
    const client = new HCS10Client({
      network: 'testnet',
      operatorId: accountId,
      operatorPrivateKey: privateKeyStr,
      logLevel: 'debug',
    });
    
    // 3. Create a test buffer to inscribe
    const testBuffer = Buffer.from('Test message for inscription');
    
    // 4. Log the transaction creation process
    logger.info('Creating inscription request with the following parameters:');
    logger.info('- holderId (account that will own the inscription):', accountId);
    logger.info('- Account used for signing the transaction:', accountId);
    
    // 5. Initialize the InscriptionSDK directly to see what's happening
    const sdk = await InscriptionSDK.createWithAuth({
      type: 'server',
      accountId: accountId,
      privateKey: privateKey,
      network: 'testnet',
    });
    
    // 6. Create the inscription request
    const request = {
      holderId: accountId,
      mode: 'file' as const,
      file: {
        type: 'base64' as const,
        base64: testBuffer.toString('base64'),
        fileName: 'test-message.txt',
        mimeType: 'text/plain',
      }
    };
    
    // 7. Start the inscription but don't execute yet - just get the transaction bytes
    logger.info('Starting inscription process to get transaction bytes...');
    const response = await sdk.startInscription(request);
    
    if (!response.transactionBytes) {
      throw new Error('No transaction bytes returned from inscription request');
    }
    
    logger.info('Got transaction bytes from Kiloscribe API');
    
    // 8. Decode the transaction to see what account it's for
    const transaction = TransferTransaction.fromBytes(
      Buffer.from(response.transactionBytes, 'base64')
    );
    
    // 9. Log the transaction details
    logger.info('Transaction details:');
    logger.info(`- Transaction ID: ${transaction.transactionId?.toString()}`);
    
    const txAccountId = transaction.transactionId?.accountId?.toString();
    logger.info(`- Transaction Account ID: ${txAccountId}`);
    logger.info(`- Our Account ID: ${accountId}`);
    
    // 10. Check for mismatch
    if (txAccountId !== accountId) {
      logger.error('ACCOUNT MISMATCH DETECTED!');
      logger.error(`The transaction is created for account ${txAccountId} but we're trying to sign and execute it with account ${accountId}`);
      logger.error('This is the root cause of the INVALID_SIGNATURE error');
    } else {
      logger.info('Account IDs match. This is not the cause of the INVALID_SIGNATURE error.');
      
      // Check if the transaction is already signed
      try {
        const sigs = transaction.getSignatures();
        logger.info(`Transaction already has ${sigs.size} signatures`);
        
        if (sigs.size > 0) {
          logger.info('The transaction already has signatures, which might be causing the issue');
          logger.info('When we try to sign it again with our account, it creates an invalid signature state');
        }
      } catch (e) {
        logger.error('Error checking signatures:', e);
      }
    }
    
    // 11. Try to execute the transaction anyway to see the error
    try {
      logger.info('Attempting to execute the transaction...');
      const executeTxId = await sdk.executeTransaction(response.transactionBytes, {
        accountId: accountId,
        privateKey: privateKey,
        network: 'testnet',
      });
      logger.info('Transaction executed successfully:', executeTxId);
    } catch (error) {
      logger.error('Transaction execution failed:', error);
      logger.error('This is the same INVALID_SIGNATURE error seen in the demo');
    }
    
  } catch (error) {
    logger.error('Error in test:', error);
  }
}

// Run the test
main().catch(console.error); 