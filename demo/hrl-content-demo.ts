import { HCS10Client } from '../src/index';
import { config } from 'dotenv';
import fs from 'fs';
import path, { dirname } from 'path';
import mime from 'mime-types';
import { fileURLToPath } from 'url';

config();

/**
 * Fetches and processes text content from an HRL
 */
async function fetchTextContent(
  client: HCS10Client,
  hrl: string,
): Promise<void> {
  console.log(`Fetching text content from ${hrl}...`);

  try {
    const textContent = await client.getMessageContent(hrl);
    console.log('Text content retrieved:');
    console.log(textContent);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error fetching text content: ${errorMessage}`);
  }
}

/**
 * Fetches content with type information from an HRL
 */
async function fetchContentWithType(
  client: HCS10Client,
  hrl: string,
): Promise<void> {
  console.log(`\nFetching content with type from ${hrl}...`);

  try {
    const result = await client.getMessageContentWithType(hrl);
    console.log('Content with type retrieved:');
    console.log(`Content type: ${result.contentType}`);
    console.log(`Is binary: ${result.isBinary}`);

    if (result.isBinary) {
      const buffer = Buffer.from(result.content as ArrayBuffer);
      console.log(`Binary size: ${buffer.length} bytes`);
    } else if (result.contentType === 'application/json') {
      console.log('JSON content:');
      if (typeof result.content === 'object') {
        console.log(JSON.stringify(result.content, null, 2));
      } else {
        console.log(result.content);
      }
    } else {
      console.log('Content:');
      console.log(result.content);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error fetching content with type: ${errorMessage}`);
  }
}

/**
 * Fetches and processes JSON content from an HRL
 */
async function fetchJsonContent(
  client: HCS10Client,
  hrl: string,
): Promise<void> {
  console.log(`\nFetching JSON content from ${hrl}...`);

  try {
    const jsonContent = await client.getMessageContent(hrl);
    console.log('JSON content retrieved:');
    console.log(
      typeof jsonContent === 'string'
        ? jsonContent
        : JSON.stringify(jsonContent, null, 2),
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error fetching JSON content: ${errorMessage}`);
  }
}

/**
 * Fetches, processes and saves binary content from an HRL
 */
async function fetchBinaryContent(
  client: HCS10Client,
  hrl: string,
  network: string,
): Promise<void> {
  console.log(`\nFetching binary content from ${hrl}...`);

  try {
    console.log('\nAttempting to fetch as binary data...');
    const binaryContent = (await client.getMessageContent(
      hrl,
      true,
    )) as ArrayBuffer;

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const buffer = Buffer.from(binaryContent);
    const outputDir = path.join(__dirname, 'output');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    // Get content type more efficiently using the new method
    const contentInfo = await client.getMessageContentWithType(hrl, true);
    const contentType = contentInfo.contentType || 'application/octet-stream';

    // Explicitly handle JSON content type
    let extension = 'bin';
    if (contentType === 'application/json') {
      extension = 'json';
    } else {
      extension = mime.extension(contentType) || 'bin';
    }

    const outputPath = path.join(outputDir, `inscription.${extension}`);
    fs.writeFileSync(outputPath, buffer);

    console.log(`Saved binary content to ${outputPath}`);
    console.log(`Content type: ${contentType}`);
    console.log(`Binary size: ${buffer.length} bytes`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error fetching binary content: ${errorMessage}`);
  }
}

/**
 * Fetches JSON content and saves it to a file
 */
async function fetchAndSaveJsonContent(
  client: HCS10Client,
  hrl: string,
): Promise<void> {
  console.log(`\nFetching and saving JSON content from ${hrl}...`);

  try {
    const result = await client.getMessageContentWithType(hrl);

    if (result.contentType !== 'application/json') {
      console.log(
        `Not a JSON content type (${result.contentType}), skipping save.`,
      );
      return;
    }

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const outputDir = path.join(__dirname, 'output');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    const outputPath = path.join(outputDir, 'inscription.json');

    // Format JSON properly if it's an object
    if (typeof result.content === 'object') {
      fs.writeFileSync(outputPath, JSON.stringify(result.content, null, 2));
    } else if (typeof result.content === 'string') {
      try {
        // Try to parse and re-stringify with formatting
        const jsonObj = JSON.parse(result.content);
        fs.writeFileSync(outputPath, JSON.stringify(jsonObj, null, 2));
      } catch {
        // If parsing fails, just save the raw string
        fs.writeFileSync(outputPath, result.content);
      }
    } else {
      fs.writeFileSync(outputPath, String(result.content));
    }

    console.log(`Saved JSON content to ${outputPath}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error saving JSON content: ${errorMessage}`);
  }
}

/**
 * Main demo function
 */
async function main(): Promise<void> {
  if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
    console.log(
      'Please set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env file',
    );
    return;
  }

  const network = 'testnet';
  const operatorId = process.env.HEDERA_ACCOUNT_ID;
  const operatorKey = process.env.HEDERA_PRIVATE_KEY;

  const client = new HCS10Client({
    network: network as 'mainnet' | 'testnet',
    operatorId,
    operatorPrivateKey: operatorKey,
    logLevel: 'debug',
    prettyPrint: true,
  });

  const textHrl = 'hcs://1/0.0.5925538';
  const jsonHrl = 'hcs://1/0.0.5911795';
  const imageHrl = 'hcs://1/0.0.5932283';

  await fetchTextContent(client, textHrl);
  await fetchContentWithType(client, textHrl);
  await fetchJsonContent(client, jsonHrl);
  await fetchContentWithType(client, jsonHrl);
  await fetchAndSaveJsonContent(client, jsonHrl);
  await fetchBinaryContent(client, imageHrl, network);
  await fetchContentWithType(client, imageHrl);
}

main()
  .then(() => console.log('Demo completed successfully'))
  .catch(error => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Demo failed with error: ${errorMessage}`);
  })
  .finally(() => process.exit(0));
