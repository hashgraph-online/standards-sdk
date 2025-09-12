import 'dotenv/config';
import { Logger } from '../../src/utils/logger';
import { detectKeyTypeFromString } from '../../src/utils/key-type-detector';
import { HCS5Client } from '../../src/hcs-5/sdk';
import {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
} from '@hashgraph/sdk';
import { fileTypeFromBuffer } from 'file-type';
import fs from 'fs';
import path from 'path';
import { HederaMirrorNode } from '../../src/services/mirror-node';

async function main(): Promise<void> {
  const logger = Logger.getInstance({ module: 'HCS-5 Demo' });

  const network = (process.env.HEDERA_NETWORK || 'testnet') as
    | 'testnet'
    | 'mainnet';
  const operatorId = process.env.HEDERA_ACCOUNT_ID || '';
  const operatorKey = process.env.HEDERA_PRIVATE_KEY || '';
  let tokenId = process.env.HCS5_TOKEN_ID || '';

  if (!operatorId || !operatorKey) {
    throw new Error(
      'Please set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env',
    );
  }

  const hcs5 = new HCS5Client({
    network,
    operatorId,
    operatorKey,
    logLevel: 'info',
  });

  if (!tokenId) {
    logger.info('HCS5_TOKEN_ID not set, creating a demo NFT token');
    tokenId = await createDemoNftToken(
      network,
      operatorId,
      operatorKey,
      logger,
    );
    logger.info('Created demo token', { tokenId });
  }

  const imagePath = process.env.HCS5_IMAGE_PATH || '';
  const imageUrl = process.env.HCS5_IMAGE_URL || '';
  const svgLetter = (process.env.HCS5_LETTER || 'S').slice(0, 1);
  const svgBg = process.env.HCS5_BG || '#0d9488';
  const svgFg = process.env.HCS5_FG || '#ffffff';

  let inscriptionInput:
    | { type: 'buffer'; buffer: Buffer; fileName: string; mimeType: string }
    | { type: 'url'; url: string };
  const metadata: Record<string, unknown> = {
    name: 'HCS-5 Demo NFT',
    creator: operatorId,
    description: 'Demo Hashinal (HCS-5) minted by standards-sdk',
  };

  if (imagePath) {
    const imageBuf = fs.readFileSync(imagePath);
    const ft = await fileTypeFromBuffer(imageBuf);
    const mime = ft?.mime || 'application/octet-stream';
    inscriptionInput = {
      type: 'buffer',
      buffer: imageBuf,
      fileName: path.basename(imagePath),
      mimeType: mime,
    };
    metadata.type = mime;
    metadata.attributes = [
      { trait_type: 'Letter', value: svgLetter },
      { trait_type: 'Background', value: svgBg },
      { trait_type: 'Foreground', value: svgFg },
    ];
  } else if (imageUrl) {
    inscriptionInput = { type: 'url', url: imageUrl };
    metadata.type = 'image/*';
    metadata.attributes = [
      { trait_type: 'Letter', value: svgLetter },
      { trait_type: 'Background', value: svgBg },
      { trait_type: 'Foreground', value: svgFg },
    ];
  } else {
    const svg = generateSvgLetter(svgLetter, svgBg, svgFg);
    inscriptionInput = {
      type: 'buffer',
      buffer: svg,
      fileName: 'hashinal.svg',
      mimeType: 'image/svg+xml',
    };
    metadata.type = 'image/svg+xml';
    metadata.attributes = [
      { trait_type: 'Letter', value: svgLetter },
      { trait_type: 'Background', value: svgBg },
      { trait_type: 'Foreground', value: svgFg },
    ];
  }

  const res = await hcs5.inscribeAndMint({
    tokenId,
    inscriptionInput,
    inscriptionOptions: {
      metadata,
      waitForConfirmation: true,
      waitMaxAttempts: process.env.HCS_WAIT_MAX_ATTEMPTS
        ? Number(process.env.HCS_WAIT_MAX_ATTEMPTS)
        : undefined,
      waitIntervalMs: process.env.HCS_WAIT_INTERVAL_MS
        ? Number(process.env.HCS_WAIT_INTERVAL_MS)
        : undefined,
    },
  });

  if (!res.success) {
    logger.error('HCS-5 demo failed', { error: res.error });
    process.exit(1);
  }

  logger.info('HCS-5 demo succeeded', {
    tokenId,
    serialNumber: res.serialNumber,
    metadata: res.metadata,
    transactionId: res.transactionId,
  });
  process.exit(0);
}

main().catch(err => {
  const logger = Logger.getInstance({ module: 'HCS-5 Demo' });
  logger.error('Unhandled error in HCS-5 demo', err);
  process.exit(1);
});

async function createDemoNftToken(
  network: 'testnet' | 'mainnet',
  operatorId: string,
  operatorKey: string,
  logger: ReturnType<typeof Logger.getInstance>,
): Promise<string> {
  const client =
    network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  const operatorAccountId = AccountId.fromString(operatorId);
  const mirror = new HederaMirrorNode(network, logger);
  let privateKey: PrivateKey;
  try {
    const account = await mirror.requestAccount(operatorId);
    const typeField = account?.key?._type || '';
    privateKey = typeField.includes('ED25519')
      ? PrivateKey.fromStringED25519(operatorKey)
      : PrivateKey.fromStringECDSA(operatorKey);
  } catch {
    const fallback = detectKeyTypeFromString(operatorKey);
    privateKey = fallback.privateKey;
  }
  client.setOperator(operatorAccountId, privateKey);

  const tx = new TokenCreateTransaction()
    .setTokenName('HCS5 Demo Token')
    .setTokenSymbol('H5D')
    .setTokenType(TokenType.NonFungibleUnique)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTreasuryAccountId(operatorAccountId)
    .setSupplyKey(privateKey.publicKey)
    .setAutoRenewAccountId(operatorAccountId)
    .setAutoRenewPeriod(7776000);

  const frozen = await tx.freezeWith(client);
  await frozen.sign(privateKey);
  const resp = await frozen.execute(client);
  const receipt = await resp.getReceipt(client);
  if (!receipt.tokenId) {
    throw new Error('Failed to create demo NFT token');
  }
  logger.info('Created NFT token for demo', {
    tokenId: receipt.tokenId.toString(),
  });
  return receipt.tokenId.toString();
}

/**
 * Generate a simple SVG avatar with a single letter.
 */
function generateSvgLetter(letter: string, bg: string, fg: string): Buffer {
  const safeLetter = (letter || 'S').slice(0, 1).toUpperCase();
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="64" ry="64" fill="${bg}"/>
  <text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, sans-serif"
        font-size="320" font-weight="700" fill="${fg}">${safeLetter}</text>
</svg>`;
  return Buffer.from(svg, 'utf-8');
}
