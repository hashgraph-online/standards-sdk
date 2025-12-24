import { inscribe, retrieveInscription } from '../src/';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

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
  waitMaxAttempts: 90,
  waitIntervalMs: 2000,
  progressCallback: data => {
    console.log('progressCallback', data);
  },
};

function logCostSummary(
  label: string,
  response: Awaited<ReturnType<typeof inscribe>>,
) {
  if (!response.costSummary) {
    console.log(
      `[${label}] Cost details not available yet (mirror node sync pending).`,
    );
    return;
  }

  console.log(
    `[${label}] Total cost: ${response.costSummary.totalCostHbar} HBAR`,
  );

  if (response.costSummary.breakdown?.transfers?.length) {
    response.costSummary.breakdown.transfers.forEach(transfer => {
      console.log(
        `  -> ${transfer.amount} HBAR to ${transfer.to} (${transfer.description})`,
      );
    });
  }
}

async function runDemo() {
  const selected = new Set(process.argv.slice(2).filter(Boolean));
  const runAll = selected.size === 0 || selected.has('all');
  const shouldRun = (key: string) => runAll || selected.has(key);

  try {
    console.log('=== Inscribe Demo ===');
    console.log(`Network: ${NETWORK}`);
    console.log(`Account ID: ${ACCOUNT_ID}`);
    console.log('');

    // Text inscription (as buffer)
    if (shouldRun('text')) {
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
      logCostSummary('Text Inscription', textResponse);
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
    }

    // URL inscription
    const demoImageUrl =
      'https://fastly.picsum.photos/id/866/50/50.jpg?hmac=8BpfgzuDgu2xpFYzkj90PW12YfNrbake-5BbyZPeHVI';

    if (shouldRun('url')) {
      console.log('2. URL Inscription');
      const urlResponse = await inscribe(
        {
          type: 'url',
          url: demoImageUrl,
        },
        clientConfig,
        {
          ...options,
          waitForConfirmation: true,
          mode: 'file',
          metadata: {
            name: 'Random Image',
            description: 'A random image from .photos',
          },
        },
      );
      console.log(`Transaction ID: ${urlResponse.result.transactionId}`);
      if (urlResponse.confirmed) {
        console.log('Inscription confirmed and retrieved:');
        console.log(`URL: ${urlResponse.inscription.url}`);
      }
      logCostSummary('URL Inscription', urlResponse);
      console.log('');
    }

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Buffer inscription
    const demoFilePath = path.join(__dirname, 'demo-file.txt');
    fs.writeFileSync(
      demoFilePath,
      'This is a demo file for buffer inscription.',
    );
    const buffer = fs.readFileSync(demoFilePath);

    if (shouldRun('buffer')) {
      console.log('3. Buffer Inscription');
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
      logCostSummary('Buffer Inscription', bufferResponse);
      console.log('');
    }

    // Hashinal inscription from URL
    if (shouldRun('hashinal-url')) {
      console.log('4. Hashinal Inscription from URL');
      const hashinalUrlResponse = await inscribe(
        {
          type: 'url',
          url: demoImageUrl,
        },
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
      console.log(
        `Transaction ID: ${hashinalUrlResponse.result.transactionId}`,
      );
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
      logCostSummary('Hashinal URL', hashinalUrlResponse);
      console.log('');
    }

    // Hashinal inscription from Buffer
    if (shouldRun('hashinal-buffer')) {
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
      logCostSummary('Hashinal Buffer', hashinalBufferResponse);
      console.log('');
    }

    // Hashinal inscription from Text (as buffer)
    if (shouldRun('hashinal-text')) {
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
      console.log(
        `Transaction ID: ${hashinalTextResponse.result.transactionId}`,
      );
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
      logCostSummary('Hashinal Text', hashinalTextResponse);
      console.log('');
    }

    if (shouldRun('collection')) {
      console.log('7. Hashinal Collection (ZIP)');
      const jpegBase64 =
        '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEA8QEBUPDw8PDw8QDw8PDw8QFREWFhURFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OFQ8PFS0dFR0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAbAAEAAwEBAQEAAAAAAAAAAAAABQYHAgMEAf/EADYQAAIBAgQDBgQEBwAAAAAAAAECAwQRAAUSITFBBhMiUWEHFDKBkaGx0SNCUuEHJDOCorL/xAAbAQEAAwEBAQEAAAAAAAAAAAAABQYHAgMEAf/EAC8RAAICAQMDAgQFBQAAAAAAAAABAhEDBBIhMRMiQVFhIhRxgZGhsdHh8PFC/9oADAMBAAIRAxEAPwD3k0oJjC5v3t3bG9eQGfQb8Xb9T0sY9w9r4Xk4y2+6lQqjO2mC0rM5B3b4g8c9L3mW8t8eQ2o1lQqYJmX4d9Vq5m6wX2c+gYl1p2o0tHn1mHqY0kYfZyVwVwq7mZxwYw7bYpUq2e0YVw1wJ7p1y3o3qYVj3o9a8bqgV3Xc2b6bqQkqg8i0QK9Xn4aJx7cLr0mZsQ2kqGgk0hS1I3w6v1cY5d8p1y8kP5j2Vx2k5b2j1m8wqzqQm1mSg0mZP0qfX4lq5p3m4qS8u7G0m0bq3x8a8cV9o8Zb6z7k2o0pVZQx2qYJk2VfWJ7D7nqk0lW3bYkqWqQ0WZkJ3bWc6k5uWQ7m3m4a7bSgqgk0oUo1Gm2m0o0pUo0qX//Z';

      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6nq3UAAAAASUVORK5CYII=';

      const mp4Placeholder = Buffer.from('00000018667479706D703432', 'hex');

      const jpegBuffer = Buffer.from(jpegBase64, 'base64');
      const pngBuffer = Buffer.from(pngBase64, 'base64');

      const zip = new JSZip();
      const images = zip.folder('images');
      const metadata = zip.folder('metadata');
      const secondaryImages1 = zip.folder('secondary_images_1');
      const secondaryImages2 = zip.folder('secondary_images_2');

      if (!images || !metadata || !secondaryImages1 || !secondaryImages2) {
        throw new Error('Failed to create collection ZIP folders');
      }

      images.file('1.jpeg', jpegBuffer);
      images.file('2.jpeg', jpegBuffer);

      secondaryImages1.file('1.png', pngBuffer);
      secondaryImages1.file('2.png', pngBuffer);

      secondaryImages2.file('1.mp4', mp4Placeholder);
      secondaryImages2.file('2.mp4', mp4Placeholder);

      const baseMetadata = {
        format: 'HIP412@2.0.0',
        type: 'image/jpeg',
        creator: 'Inscribe Demo',
        image: '',
        attributes: [],
        files: [
          {
            uri: 'secondary_images_1/1.png',
            type: 'image/png',
          },
          {
            uri: 'secondary_images_2/1.mp4',
            type: 'video/mp4',
          },
        ],
      };

      metadata.file(
        '1.json',
        JSON.stringify(
          {
            ...baseMetadata,
            name: 'Demo Collection #1',
            description: 'Demo Hashinal collection item #1',
          },
          null,
          2,
        ),
      );

      metadata.file(
        '2.json',
        JSON.stringify(
          {
            ...baseMetadata,
            name: 'Demo Collection #2',
            description: 'Demo Hashinal collection item #2',
          },
          null,
          2,
        ),
      );

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      const collectionResponse = await inscribe(
        {
          type: 'buffer',
          buffer: zipBuffer,
          fileName: 'collection.zip',
          mimeType: 'application/zip',
        },
        clientConfig,
        {
          ...options,
          waitForConfirmation: true,
          mode: 'hashinal-collection',
        },
      );

      console.log(`Transaction ID: ${collectionResponse.result.transactionId}`);
      if (collectionResponse.confirmed) {
        console.log('Hashinal collection confirmed and retrieved:', {
          status: collectionResponse.inscription.status,
          completed: collectionResponse.inscription.completed,
          mode: collectionResponse.inscription.mode,
        });
      }
      logCostSummary('Hashinal Collection', collectionResponse);
      console.log('');
    }

    console.log('Demo completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error running demo:', error);
    process.exit(1);
  }
}

runDemo();
