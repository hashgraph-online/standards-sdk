import { inscribe, QuoteResult } from '../src/';
import * as dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.API_KEY || undefined;
const ACCOUNT_ID =
  process.env.HEDERA_OPERATOR_ID || process.env.HEDERA_ACCOUNT_ID || '';
const PRIVATE_KEY =
  process.env.HEDERA_OPERATOR_KEY || process.env.HEDERA_PRIVATE_KEY || '';
const NETWORK = (process.env.HEDERA_NETWORK || 'testnet') as
  | 'mainnet'
  | 'testnet';

if (!ACCOUNT_ID || !PRIVATE_KEY) {
  console.error(
    'Please set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in .env file',
  );
  process.exit(1);
}

const clientConfig = {
  accountId: ACCOUNT_ID,
  privateKey: PRIVATE_KEY,
  network: NETWORK,
};

const options = {
  apiKey: API_KEY,
  network: NETWORK,
  quoteOnly: true,
  logging: {
    level: 'info' as const,
  },
};

async function runDemo() {
  try {
    console.log('=== Quote Demo ===');
    console.log(`Network: ${NETWORK}`);
    console.log(`Account ID: ${ACCOUNT_ID}`);
    console.log('');

    console.log('1. Text Quote');
    const textResponse = await inscribe(
      {
        type: 'buffer',
        buffer: Buffer.from('Hello from Quote Demo!', 'utf-8'),
        fileName: 'text.txt',
        mimeType: 'text/plain',
      },
      clientConfig,
      {
        ...options,
        mode: 'file',
      },
    );

    if (textResponse.quote) {
      const quoteResult = textResponse.result as QuoteResult;
      console.log(`Total cost: ${quoteResult.totalCostHbar} HBAR`);
      console.log(`Valid until: ${quoteResult.validUntil}`);
      console.log(`Transfer details:`, quoteResult.breakdown.transfers);
    } else {
      throw new Error('Expected quote result');
    }

    console.log('');
    console.log('Quote demo completed successfully!');
  } catch (error) {
    console.error('Error running demo:', error);
  }
}

runDemo();
