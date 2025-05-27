import { inscribe, retrieveInscription } from '../src/';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const API_KEY = process.env.API_KEY || undefined;
const ACCOUNT_ID = process.env.HEDERA_ACCOUNT_ID || '';
const PRIVATE_KEY = process.env.HEDERA_PRIVATE_KEY || '';
const NETWORK = (process.env.HEDERA_NETWORK || 'testnet') as
  | 'mainnet'
  | 'testnet';

if (!ACCOUNT_ID || !PRIVATE_KEY) {
  console.error('Please set ACCOUNT_ID, and PRIVATE_KEY in .env file');
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
  waitForConfirmation: false,
  waitMaxAttempts: 100,
  waitIntervalMs: 4000,
};

async function runDemo() {
  try {
    console.log('=== Inscribe Demo ===');
    console.log(`Network: ${NETWORK}`);
    console.log(`Account ID: ${ACCOUNT_ID}`);
    console.log('');

    // Text inscription (as buffer)
    console.log('1. Text Inscription');
    const textResponse = await inscribe(
      {
        type: 'buffer',
        buffer: Buffer.from('Hello from Inscribe Demo!', 'utf-8'),
        fileName: 'text.txt',
        mimeType: 'text/plain',
      },
      clientConfig,
      {
        ...options,
        waitForConfirmation: true,
        mode: 'file',
      },
    );
    console.log(`Transaction ID: ${textResponse.result.transactionId}`);
    if (textResponse.confirmed) {
      console.log('Inscription confirmed and retrieved:');
      console.log(`Content: ${textResponse.inscription.content}`);
    }
    console.log('');

    const inscription = await retrieveInscription(
      textResponse.result.transactionId,
      {
        ...options,
        ...clientConfig,
        apiKey: API_KEY,
      },
    );
    console.log('Inscription:', inscription);

    // URL inscription
    console.log('2. URL Inscription');
    const urlResponse = await inscribe(
      { type: 'url', url: 'https://picsum.photos/id/1/50/50' },
      clientConfig,
      {
        ...options,
        waitForConfirmation: true,
        mode: 'file',
        metadata: {
          name: 'Random Image',
          description: 'A random image from picsum.photos',
        },
      },
    );
    console.log(`Transaction ID: ${urlResponse.result.transactionId}`);
    if (urlResponse.confirmed) {
      console.log('Inscription confirmed and retrieved:');
      console.log(`URL: ${urlResponse.inscription.url}`);
    }
    console.log('');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Buffer inscription
    console.log('3. Buffer Inscription');
    const demoFilePath = path.join(__dirname, 'demo-file.txt');
    fs.writeFileSync(
      demoFilePath,
      'This is a demo file for buffer inscription.',
    );
    const buffer = fs.readFileSync(demoFilePath);
    console.log('demoFilePath', demoFilePath, buffer);
    const bufferResponse = await inscribe(
      {
        type: 'buffer',
        buffer,
        fileName: 'demo-file.txt',
        mimeType: 'text/plain',
      },
      clientConfig,
      {
        ...options,
        mode: 'file',
      },
    );
    console.log(`Transaction ID: ${bufferResponse.result.transactionId}`);
    if (bufferResponse.confirmed) {
      console.log('Inscription confirmed and retrieved:');
      console.log(`File URL: ${bufferResponse.inscription.url}`);
    }
    console.log('');

    // Hashinal inscription from URL
    console.log('4. Hashinal Inscription from URL');
    const hashinalUrlResponse = await inscribe(
      { type: 'url', url: 'https://picsum.photos/50/50.jpg' },
      clientConfig,
      {
        ...options,
        mode: 'hashinal',
        metadata: {
          name: 'Demo Hashinal from URL',
          creator: 'Inscribe Demo',
          description: 'A demo Hashinal NFT from a random image',
          type: 'image/jpeg',
          attributes: [
            {
              trait_type: 'Demo',
              value: 'True',
            },
            {
              trait_type: 'Size',
              value: '50x50',
            },
          ],
        },
      },
    );
    console.log(`Transaction ID: ${hashinalUrlResponse.result.transactionId}`);
    if (hashinalUrlResponse.confirmed) {
      console.log('Hashinal inscription confirmed and retrieved:');
      console.log(`NFT URL: ${hashinalUrlResponse.inscription.url}`);
      console.log(
        `Metadata: ${JSON.stringify(
          hashinalUrlResponse.inscription.metadata,
          null,
          2,
        )}`,
      );
    }
    console.log('');

    // Hashinal inscription from Buffer
    console.log('5. Hashinal Inscription from Buffer');
    const hashinalBufferResponse = await inscribe(
      {
        type: 'buffer',
        buffer,
        fileName: 'demo-file.txt',
        mimeType: 'text/plain',
      },
      clientConfig,
      {
        ...options,
        mode: 'hashinal',
        metadata: {
          name: 'Demo Hashinal from Buffer',
          creator: 'Inscribe Demo',
          description: 'A demo Hashinal NFT from buffer',
          type: 'text/plain',
          attributes: [
            {
              trait_type: 'Demo',
              value: 'True',
            },
          ],
        },
      },
    );
    console.log(
      `Transaction ID: ${hashinalBufferResponse.result.transactionId}`,
    );
    if (hashinalBufferResponse.confirmed) {
      console.log('Hashinal inscription confirmed and retrieved:');
      console.log(`NFT URL: ${hashinalBufferResponse.inscription.url}`);
      console.log(
        `Metadata: ${JSON.stringify(
          hashinalBufferResponse.inscription.metadata,
          null,
          2,
        )}`,
      );
    }
    console.log('');

    // Hashinal inscription from Text (as buffer)
    console.log('6. Hashinal Inscription from Text');
    const hashinalTextResponse = await inscribe(
      {
        type: 'buffer',
        buffer: Buffer.from('This is a Hashinal from text content!', 'utf-8'),
        fileName: 'text.txt',
        mimeType: 'text/plain',
      },
      clientConfig,
      {
        ...options,
        mode: 'hashinal',
        metadata: {
          name: 'Demo Hashinal from Text',
          creator: 'Inscribe Demo',
          description: 'A demo Hashinal NFT from text',
          type: 'text/plain',
          attributes: [
            {
              trait_type: 'Demo',
              value: 'True',
            },
          ],
        },
      },
    );
    console.log(`Transaction ID: ${hashinalTextResponse.result.transactionId}`);
    if (hashinalTextResponse.confirmed) {
      console.log('Hashinal inscription confirmed and retrieved:');
      console.log(`Content: ${hashinalTextResponse.inscription.content}`);
      console.log(
        `Metadata: ${JSON.stringify(
          hashinalTextResponse.inscription.metadata,
          null,
          2,
        )}`,
      );
    }
    console.log('');

    console.log('Demo completed successfully!');
  } catch (error) {
    console.error('Error running demo:', error);
  }
}

runDemo();
