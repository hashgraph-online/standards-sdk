import { InscriptionSDK } from '@kiloscribe/inscription-sdk';
import {
  InscriptionOptions,
  InscriptionResult,
  RetrievedInscriptionResult,
  HederaClientConfig,
  QuoteResult,
  StartInscriptionRequest,
  InscriptionJobResponse,
  NodeHederaClientConfig,
  InscriptionCostSummary,
} from './types';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';
import { Logger, ILogger, LogLevel } from '../utils/logger';
import { ProgressCallback, ProgressReporter } from '../utils/progress-reporter';
import { TransactionParser } from '../utils/transaction-parser';
import { isBrowser } from '../utils/is-browser';
import { fileTypeFromBuffer } from 'file-type';
import {
  getOrCreateSDK,
  getCachedQuote,
  cacheQuote,
  validateQuoteParameters,
} from './quote-cache';
import { HederaMirrorNode } from '../services/mirror-node';
import { NetworkType } from '../utils/types';
import BigNumber from 'bignumber.js';
import { sleep } from '../utils/sleep';

let nodeModules: {
  readFileSync?: (path: string) => Buffer;
  basename?: (path: string) => string;
  extname?: (path: string) => string;
} = {};

export const normalizeTransactionId = (txId: string): string => {
  if (!txId.includes('@')) {
    return txId;
  }
  const txParts = txId?.split('@');
  return `${txParts[0]}-${txParts[1].replace('.', '-')}`;
};

async function loadNodeModules(): Promise<void> {
  if (isBrowser || nodeModules.readFileSync) {
    return;
  }

  try {
    const globalObj = typeof global !== 'undefined' ? global : globalThis;
    const req = globalObj.process?.mainModule?.require || globalObj.require;

    if (typeof req === 'function') {
      const fs = req('fs');
      const path = req('path');

      nodeModules.readFileSync = fs.readFileSync;
      nodeModules.basename = path.basename;
      nodeModules.extname = path.extname;
    } else {
      throw new Error('require function not available');
    }
  } catch (error) {
    console.warn(
      'Node.js modules not available, file path operations will be disabled',
    );
  }
}

export type InscriptionInput =
  | { type: 'url'; url: string }
  | { type: 'file'; path: string }
  | {
      type: 'buffer';
      buffer: ArrayBuffer | Buffer;
      fileName: string;
      mimeType?: string;
    };

const COST_LOOKUP_ATTEMPTS = 3;
const COST_LOOKUP_DELAY_MS = 1000;
const TINYBAR_DIVISOR = 100000000;
const COST_LOGGER_MODULE = 'InscriberCost';

/**
 * Convert file path to base64 with mime type detection
 * Note: This function only works in Node.js environment
 */
async function convertFileToBase64(filePath: string): Promise<{
  base64: string;
  fileName: string;
  mimeType: string;
}> {
  if (isBrowser) {
    throw new Error(
      'File path operations are not supported in browser environment. Use buffer input type instead.',
    );
  }

  await loadNodeModules();

  if (
    !nodeModules.readFileSync ||
    !nodeModules.basename ||
    !nodeModules.extname
  ) {
    throw new Error(
      'Node.js file system modules are not available. Cannot read file from path.',
    );
  }

  try {
    const buffer = nodeModules.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const fileName = nodeModules.basename(filePath);

    let mimeType = 'application/octet-stream';
    try {
      const fileTypeResult = await fileTypeFromBuffer(buffer);
      if (fileTypeResult) {
        mimeType = fileTypeResult.mime;
      }
    } catch (error) {
      const ext = nodeModules.extname(filePath).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.txt': 'text/plain',
        '.json': 'application/json',
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
      };
      mimeType = mimeMap[ext] || 'application/octet-stream';
    }

    return { base64, fileName, mimeType };
  } catch (error) {
    throw new Error(
      `Failed to read file ${filePath}: ${(error as Error).message}`,
    );
  }
}

export interface InscriptionResponse {
  confirmed: boolean;
  result: InscriptionResult | QuoteResult;
  inscription?: RetrievedInscriptionResult;
  sdk?: InscriptionSDK;
  quote?: boolean;
  costSummary?: InscriptionCostSummary;
}

function normalizeClientConfig(
  cfg: NodeHederaClientConfig,
): HederaClientConfig {
  return {
    accountId: cfg.accountId,
    privateKey:
      typeof cfg.privateKey === 'string'
        ? cfg.privateKey
        : cfg.privateKey.toString(),
    network: cfg.network,
  };
}

function resolveConnectionMode(options: InscriptionOptions) {
  if (options.connectionMode) {
    return options.connectionMode;
  }
  if (typeof options.websocket === 'boolean') {
    return options.websocket ? 'websocket' : 'http';
  }
  return 'websocket';
}

export async function inscribe(
  input: InscriptionInput,
  clientConfig: NodeHederaClientConfig,
  options: InscriptionOptions,
  existingSDK?: InscriptionSDK,
): Promise<InscriptionResponse> {
  const logger = Logger.getInstance({
    module: 'Inscriber',
    ...options.logging,
  });

  const resolvedConnectionMode = resolveConnectionMode(options);

  logger.info('Starting inscription process', {
    type: input.type,
    mode: options.mode || 'file',
    quoteOnly: options.quoteOnly || false,
    ...(input.type === 'url' ? { url: input.url } : {}),
    ...(input.type === 'file' ? { path: input.path } : {}),
    ...(input.type === 'buffer'
      ? { fileName: input.fileName, bufferSize: input.buffer.byteLength }
      : {}),
  });

  try {
    if (options.quoteOnly) {
      logger.debug('Quote-only mode requested, generating quote');
      return await generateQuote(input, clientConfig, options, existingSDK);
    }

    if (options.mode === 'hashinal' && options.metadata) {
      validateHashinalMetadata(options.metadata, logger);
    }

    let sdk: InscriptionSDK;

    if (existingSDK) {
      logger.debug('Using existing InscriptionSDK instance');
      sdk = existingSDK;
    } else if (options.apiKey) {
      logger.debug('Initializing InscriptionSDK with API key');
      sdk = new InscriptionSDK({
        apiKey: options.apiKey,
        network: clientConfig.network || 'mainnet',
        connectionMode: resolvedConnectionMode,
      });
    } else {
      logger.debug('Initializing InscriptionSDK with server auth');
      const normalized = normalizeClientConfig(clientConfig);
      sdk = await InscriptionSDK.createWithAuth({
        type: 'server',
        accountId: normalized.accountId,
        privateKey: normalized.privateKey,
        network: normalized.network || 'mainnet',
        connectionMode: resolvedConnectionMode,
      });
    }

    const baseRequest = {
      holderId: clientConfig.accountId,
      metadata: options.metadata || {},
      tags: options.tags || [],
      mode: options.mode || 'file',
      fileStandard: options.fileStandard,
      chunkSize: options.chunkSize,
    };

    let request: StartInscriptionRequest;
    switch (input.type) {
      case 'url':
        request = {
          ...baseRequest,
          file: {
            type: 'url',
            url: input.url,
          },
        };
        break;

      case 'file': {
        const fileData = await convertFileToBase64(input.path);
        request = {
          ...baseRequest,
          file: {
            type: 'base64',
            base64: fileData.base64,
            fileName: fileData.fileName,
            mimeType: fileData.mimeType,
          },
        };
        break;
      }

      case 'buffer':
        request = {
          ...baseRequest,
          file: {
            type: 'base64',
            base64: Buffer.from(
              input.buffer instanceof ArrayBuffer
                ? new Uint8Array(input.buffer)
                : input.buffer,
            ).toString('base64'),
            fileName: input.fileName,
            mimeType: input.mimeType,
          },
        };
        break;
    }

    if (options.mode === 'hashinal') {
      request.metadataObject = options.metadata;
      request.creator = options.metadata?.creator || clientConfig.accountId;
      request.description = options.metadata?.description;

      if (options.jsonFileURL) {
        request.jsonFileURL = options.jsonFileURL;
      }
    }

    logger.debug('Preparing to inscribe content', {
      type: input.type,
      mode: options.mode || 'file',
      holderId: clientConfig.accountId,
    });

    const normalizedCfg = normalizeClientConfig(clientConfig);
    const result = await sdk.inscribeAndExecute(request, normalizedCfg);
    const rawJobId =
      (result as { jobId?: string }).jobId ||
      (result as { tx_id?: string }).tx_id ||
      (result as { transactionId?: string }).transactionId ||
      '';
    const rawTxId =
      (result as { transactionId?: string }).transactionId || rawJobId || '';
    const normalizedJobId = normalizeTransactionId(rawJobId);
    const normalizedTxId = normalizeTransactionId(rawTxId);
    const waitId = normalizeTransactionId(
      normalizedJobId ||
        normalizedTxId ||
        rawJobId ||
        (result as { jobId?: string }).jobId ||
        '',
    );
    logger.info('Starting to inscribe.', {
      type: input.type,
      mode: options.mode || 'file',
      transactionId: result.jobId,
    });

    if (options.waitForConfirmation) {
      logger.debug('Waiting for inscription confirmation', {
        transactionId: waitId,
        maxAttempts: options.waitMaxAttempts,
        intervalMs: options.waitIntervalMs,
      });

      const inscription = await waitForInscriptionConfirmation(
        sdk,
        waitId,
        options.waitMaxAttempts,
        options.waitIntervalMs,
        options.progressCallback,
      );

      logger.info('Inscription confirmation received', {
        transactionId: result.jobId,
      });

      return {
        confirmed: true,
        result: {
          ...result,
          jobId: waitId,
          transactionId: normalizedTxId,
        },
        inscription,
        sdk,
        costSummary: await resolveInscriptionCost(
          normalizedTxId,
          clientConfig.network || 'mainnet',
          options.logging?.level,
        ),
      };
    }

    return {
      confirmed: false,
      result: {
        ...result,
        jobId: waitId,
        transactionId: normalizedTxId,
      },
      sdk,
      costSummary: await resolveInscriptionCost(
        normalizedTxId,
        clientConfig.network || 'mainnet',
        options.logging?.level,
      ),
    };
  } catch (error) {
    logger.error('Error during inscription process', error);
    throw error;
  }
}

async function resolveInscriptionCost(
  transactionId: string,
  network: NetworkType,
  level?: LogLevel,
): Promise<InscriptionCostSummary | undefined> {
  const logger = Logger.getInstance({
    module: COST_LOGGER_MODULE,
    level: level ?? 'info',
  });
  const mirrorNode = new HederaMirrorNode(network, logger);
  const normalizedId = normalizeTransactionId(transactionId);

  const payerAccountId = normalizedId.split('-')[0];

  for (let attempt = 0; attempt < COST_LOOKUP_ATTEMPTS; attempt++) {
    try {
      const txn = await mirrorNode.getTransaction(normalizedId);

      if (!txn) {
        if (attempt < COST_LOOKUP_ATTEMPTS - 1) {
          await sleep(COST_LOOKUP_DELAY_MS);
        }
        continue;
      }

      const payerTransfer = txn.transfers?.find(
        transfer =>
          transfer.account === payerAccountId &&
          typeof transfer.amount === 'number' &&
          transfer.amount < 0,
      );

      let payerTinybars: number | null = null;

      if (payerTransfer) {
        payerTinybars = Math.abs(payerTransfer.amount);
      } else if (txn.transfers && txn.transfers.length > 0) {
        const negativeSum = txn.transfers
          .filter(t => typeof t.amount === 'number' && t.amount < 0)
          .reduce((sum, t) => sum + Math.abs(t.amount), 0);
        payerTinybars = negativeSum > 0 ? negativeSum : null;
      } else if (typeof txn.charged_tx_fee === 'number') {
        payerTinybars = txn.charged_tx_fee;
      }

      if (!payerTinybars || payerTinybars <= 0) {
        if (attempt < COST_LOOKUP_ATTEMPTS - 1) {
          await sleep(COST_LOOKUP_DELAY_MS);
        }
        continue;
      }

      const totalCostHbar = new BigNumber(payerTinybars)
        .dividedBy(TINYBAR_DIVISOR)
        .toFixed();

      return {
        totalCostHbar,
        breakdown: {
          transfers: [
            {
              to: 'Hedera network (payer)',
              amount: totalCostHbar,
              description: `Transaction fee debited from ${payerAccountId}`,
            },
          ],
        },
      };
    } catch (error) {
      logger.warn('Unable to resolve inscription cost', {
        transactionId: normalizedId,
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : String(error),
      });

      if (attempt < COST_LOOKUP_ATTEMPTS - 1) {
        await sleep(COST_LOOKUP_DELAY_MS);
      }
    }
  }

  return undefined;
}

export async function inscribeWithSigner(
  input: InscriptionInput,
  signer: DAppSigner,
  options: InscriptionOptions,
  existingSDK?: InscriptionSDK,
): Promise<InscriptionResponse> {
  const logger = Logger.getInstance({
    module: 'Inscriber',
    ...options.logging,
  });

  const resolvedConnectionMode = resolveConnectionMode(options);

  logger.info('Starting inscription process with signer', {
    type: input.type,
    mode: options.mode || 'file',
    quoteOnly: options.quoteOnly || false,
    ...(input.type === 'url' ? { url: input.url } : {}),
    ...(input.type === 'file' ? { path: input.path } : {}),
    ...(input.type === 'buffer'
      ? { fileName: input.fileName, bufferSize: input.buffer.byteLength }
      : {}),
  });
  try {
    if (options.quoteOnly) {
      logger.debug('Quote-only mode requested with signer, generating quote');
      const clientConfig = {
        accountId: signer.getAccountId().toString(),
        privateKey: '',
        network: options.network || 'mainnet',
      };
      return await generateQuote(input, clientConfig, options, existingSDK);
    }

    if (options.mode === 'hashinal' && options.metadata) {
      validateHashinalMetadata(options.metadata, logger);
    }

    const accountId = signer.getAccountId().toString();
    logger.debug('Using account ID from signer', { accountId });

    let sdk: InscriptionSDK;

    if (existingSDK) {
      logger.debug('Using existing InscriptionSDK instance');
      sdk = existingSDK;
    } else if (options.apiKey) {
      logger.debug('Initializing InscriptionSDK with API key');
      sdk = new InscriptionSDK({
        apiKey: options.apiKey,
        network: (options.network || 'mainnet') as 'mainnet' | 'testnet',
        connectionMode: resolvedConnectionMode,
      });
    } else {
      logger.debug('Initializing InscriptionSDK with client auth (websocket)');
      sdk = await InscriptionSDK.createWithAuth({
        type: 'client',
        accountId,
        signer: signer,
        network: (options.network || 'mainnet') as 'mainnet' | 'testnet',
        connectionMode: resolvedConnectionMode,
      });
    }

    const baseRequest = {
      holderId: accountId,
      metadata: options.metadata || {},
      tags: options.tags || [],
      mode: options.mode || 'file',
      fileStandard: options.fileStandard,
      chunkSize: options.chunkSize,
    };

    let request: StartInscriptionRequest;
    switch (input.type) {
      case 'url':
        request = {
          ...baseRequest,
          file: {
            type: 'url',
            url: input.url,
          },
        };
        break;

      case 'file': {
        const fileData = await convertFileToBase64(input.path);
        request = {
          ...baseRequest,
          file: {
            type: 'base64',
            base64: fileData.base64,
            fileName: fileData.fileName,
            mimeType: fileData.mimeType,
          },
        };
        break;
      }

      case 'buffer':
        request = {
          ...baseRequest,
          file: {
            type: 'base64',
            base64: Buffer.from(
              input.buffer instanceof ArrayBuffer
                ? new Uint8Array(input.buffer)
                : input.buffer,
            ).toString('base64'),
            fileName: input.fileName,
            mimeType: input.mimeType,
          },
        };
        break;
    }

    if (options.mode === 'hashinal') {
      request.metadataObject = options.metadata;
      request.creator = options.metadata?.creator || accountId;
      request.description = options.metadata?.description;

      if (options.jsonFileURL) {
        request.jsonFileURL = options.jsonFileURL;
      }
    }

    logger.debug('Starting inscription via startInscription (websocket)', {
      type: input.type,
      mode: options.mode || 'file',
      holderId: accountId,
      usesStartInscription: true,
    });

    const startResult = (await sdk.startInscription({
      ...request,
      holderId: accountId,
      network: (options.network || 'mainnet') as 'mainnet' | 'testnet',
    })) as InscriptionJobResponse;

    logger.info('about to start inscription', {
      type: input.type,
      mode: options.mode || 'file',
      jobId: startResult.id || startResult.tx_id,
      ...startResult,
    });

    if (typeof startResult?.transactionBytes === 'string') {
      logger.debug('Executing inscription transaction with signer from bytes');
      await sdk.executeTransactionWithSigner(
        startResult.transactionBytes,
        signer,
      );
    } else if (startResult?.transactionBytes?.type === 'Buffer') {
      logger.debug('Executing inscription transaction with signer from buffer');
      await sdk.executeTransactionWithSigner(
        Buffer.from(startResult.transactionBytes.data).toString('base64'),
        signer,
      );
    }

    const trackingId = normalizeTransactionId(
      startResult.tx_id || startResult.id || '',
    );
    const waitId = normalizeTransactionId(
      trackingId || startResult.id || startResult.tx_id || '',
    );

    if (options.waitForConfirmation) {
      logger.debug('Waiting for inscription confirmation (websocket)', {
        jobId: startResult.id || startResult.tx_id,
        maxAttempts: options.waitMaxAttempts,
        intervalMs: options.waitIntervalMs,
      });

      const inscription = await waitForInscriptionConfirmation(
        sdk,
        waitId,
        options.waitMaxAttempts,
        options.waitIntervalMs,
        options.progressCallback,
      );

      logger.info('Inscription confirmation received', {
        jobId: waitId,
      });

      return {
        confirmed: true,
        result: {
          jobId: waitId,
          transactionId: waitId,
          topic_id: startResult.topic_id,
          status: startResult.status,
          completed: startResult.completed,
        },
        inscription,
        sdk,
        costSummary: await resolveInscriptionCost(
          waitId,
          options.network || 'mainnet',
          options.logging?.level,
        ),
      };
    }

    return {
      confirmed: false,
      result: {
        jobId: waitId,
        transactionId: waitId,
        topic_id: startResult.topic_id,
        status: startResult.status,
        completed: startResult.completed,
      },
      sdk,
      costSummary: await resolveInscriptionCost(
        waitId,
        options.network || 'mainnet',
        options.logging?.level,
      ),
    };
  } catch (error) {
    logger.error('Error during inscription process', error);
    throw error;
  }
}

export async function retrieveInscription(
  transactionId: string,
  options: InscriptionOptions & { accountId?: string; privateKey?: string },
): Promise<RetrievedInscriptionResult> {
  const logger = Logger.getInstance({
    module: 'Inscriber',
    ...(options?.logging || {}),
  });

  const formattedTransactionId = transactionId.includes('@')
    ? `${transactionId.split('@')[0]}-${transactionId
        .split('@')[1]
        .replace(/\./g, '-')}`
    : transactionId;

  logger.info('Retrieving inscription', {
    originalTransactionId: transactionId,
    formattedTransactionId,
  });

  try {
    let sdk: InscriptionSDK;

    if (options?.apiKey) {
      logger.debug('Initializing InscriptionSDK with API key');
      sdk = new InscriptionSDK({
        apiKey: options.apiKey,
        network: options.network || 'mainnet',
      });
    } else if (options?.accountId && options?.privateKey) {
      logger.debug('Initializing InscriptionSDK with server auth');
      sdk = await InscriptionSDK.createWithAuth({
        type: 'server',
        accountId: options.accountId,
        privateKey: options.privateKey,
        network: options.network || 'mainnet',
      });
    } else {
      const error = new Error(
        'Either API key or account ID and private key are required for retrieving inscriptions',
      );
      logger.error('Missing authentication credentials', {
        hasApiKey: Boolean(options?.apiKey),
        hasAccountId: Boolean(options?.accountId),
        hasPrivateKey: Boolean(options?.privateKey),
      });
      throw error;
    }

    logger.debug('Initialized SDK for inscription retrieval', {
      formattedTransactionId,
      network: options.network || 'mainnet',
    });

    const result = await sdk.retrieveInscription(formattedTransactionId);
    logger.info('Successfully retrieved inscription', {
      formattedTransactionId,
    });

    return result;
  } catch (error) {
    logger.error('Error retrieving inscription', {
      formattedTransactionId,
      error,
    });
    throw error;
  }
}

export type { InscriptionOptions } from './types';

function validateHashinalMetadata(
  metadata: Record<string, unknown>,
  logger: ILogger,
): void {
  const requiredFields = ['name', 'creator', 'description', 'type'];
  const missingFields = requiredFields.filter(field => !metadata[field]);

  if (missingFields.length > 0) {
    const error = new Error(
      `Missing required Hashinal metadata fields: ${missingFields.join(', ')}`,
    );
    logger.error('Hashinal metadata validation failed', { missingFields });
    throw error;
  }

  logger.debug('Hashinal metadata validation passed', {
    name: metadata.name,
    creator: metadata.creator,
    description: metadata.description,
    type: metadata.type,
    hasAttributes: !!metadata.attributes,
    hasProperties: !!metadata.properties,
  });
}

/**
 * Generate a quote for an inscription without executing it
 * @param input - The inscription input data
 * @param clientConfig - Hedera client configuration
 * @param options - Inscription options
 * @param existingSDK - Optional existing SDK instance
 * @returns Promise containing the quote result
 */
export async function generateQuote(
  input: InscriptionInput,
  clientConfig: NodeHederaClientConfig,
  options: InscriptionOptions,
  existingSDK?: InscriptionSDK,
): Promise<InscriptionResponse> {
  const logger = Logger.getInstance({
    module: 'Inscriber',
    ...options.logging,
  });

  logger.info('Generating inscription quote', {
    type: input.type,
    mode: options.mode || 'file',
    ...(input.type === 'url' ? { url: input.url } : {}),
    ...(input.type === 'file' ? { path: input.path } : {}),
    ...(input.type === 'buffer'
      ? { fileName: input.fileName, bufferSize: input.buffer.byteLength }
      : {}),
  });

  try {
    validateQuoteParameters(input, clientConfig, options);

    const cachedQuote = getCachedQuote(input, clientConfig, options);

    if (cachedQuote) {
      logger.debug('Returning cached quote');
      return {
        confirmed: false,
        quote: true,
        result: cachedQuote,
      };
    }

    if (options.mode === 'hashinal' && options.metadata) {
      validateHashinalMetadata(options.metadata, logger);
    }

    const sdk = await getOrCreateSDK(clientConfig, options, existingSDK);

    const baseRequest = {
      holderId: clientConfig.accountId,
      metadata: options.metadata || {},
      tags: options.tags || [],
      mode: options.mode || 'file',
      fileStandard: options.fileStandard,
      chunkSize: options.chunkSize,
    };

    let request: StartInscriptionRequest;
    switch (input.type) {
      case 'url':
        request = {
          ...baseRequest,
          file: {
            type: 'url',
            url: input.url,
          },
        };
        break;

      case 'file': {
        const fileData = await convertFileToBase64(input.path);
        request = {
          ...baseRequest,
          file: {
            type: 'base64',
            base64: fileData.base64,
            fileName: fileData.fileName,
            mimeType: fileData.mimeType,
          },
        };
        break;
      }

      case 'buffer':
        request = {
          ...baseRequest,
          file: {
            type: 'base64',
            base64: Buffer.from(
              input.buffer instanceof ArrayBuffer
                ? new Uint8Array(input.buffer)
                : input.buffer,
            ).toString('base64'),
            fileName: input.fileName,
            mimeType: input.mimeType,
          },
        };
        break;
    }

    if (options.mode === 'hashinal') {
      request.metadataObject = options.metadata;
      request.creator = options.metadata?.creator || clientConfig.accountId;
      request.description = options.metadata?.description;

      if (options.jsonFileURL) {
        request.jsonFileURL = options.jsonFileURL;
      }
    }

    logger.debug('Calling inscription SDK startInscription for quote', {
      type: input.type,
      mode: options.mode || 'file',
      holderId: clientConfig.accountId,
    });

    const inscriptionResponse = await sdk.startInscription(request);

    logger.debug('Received inscription response for quote parsing', {
      hasTransactionBytes: !!inscriptionResponse.transactionBytes,
      bytesLength: inscriptionResponse.transactionBytes?.length || 0,
      transactionBytesType: typeof inscriptionResponse.transactionBytes,
      totalCost: (inscriptionResponse as InscriptionJobResponse).totalCost,
    });

    const quote = await parseTransactionForQuote(
      inscriptionResponse as InscriptionJobResponse,
      logger,
    );

    cacheQuote(input, clientConfig, options, quote);

    logger.info('Successfully generated inscription quote', {
      totalCostHbar: quote.totalCostHbar,
    });

    return {
      confirmed: false,
      quote: true,
      result: quote,
    };
  } catch (error) {
    logger.error('Error generating inscription quote', error);
    throw error;
  }
}

/**
 * Parse inscription response to extract HBAR cost information
 * @param inscriptionResponse - Response from inscription SDK
 * @param logger - Logger instance for debugging
 * @returns Promise containing the quote result
 */
async function parseTransactionForQuote(
  inscriptionResponse: InscriptionJobResponse,
  logger: ILogger,
): Promise<QuoteResult> {
  try {
    let totalCostHbar = '0.001';

    if (
      inscriptionResponse.totalCost &&
      typeof inscriptionResponse.totalCost === 'number'
    ) {
      const hbarAmount = inscriptionResponse.totalCost / 100000000;
      totalCostHbar = hbarAmount.toString();

      logger.debug('Using totalCost from inscription response', {
        totalCostTinybars: inscriptionResponse.totalCost,
        totalCostHbar: totalCostHbar,
      });
    } else if (inscriptionResponse.transactionBytes) {
      logger.debug('Parsing transaction bytes for cost information');

      try {
        let transactionBytesString: string;

        if (typeof inscriptionResponse.transactionBytes === 'string') {
          transactionBytesString = inscriptionResponse.transactionBytes;
        } else if (
          inscriptionResponse.transactionBytes &&
          typeof inscriptionResponse.transactionBytes === 'object' &&
          'data' in inscriptionResponse.transactionBytes
        ) {
          const buffer = Buffer.from(inscriptionResponse.transactionBytes.data);
          transactionBytesString = buffer.toString('base64');
        } else {
          throw new Error('Invalid transactionBytes format');
        }

        logger.debug('About to parse transaction bytes', {
          bytesLength: transactionBytesString.length,
          bytesPreview: transactionBytesString.slice(0, 100),
        });

        const parsedTransaction = await TransactionParser.parseTransactionBytes(
          transactionBytesString,
          { includeRaw: false },
        );

        logger.debug('Parsed transaction for quote', {
          type: parsedTransaction.type,
          hasTransfers: !!parsedTransaction.transfers,
          transferCount: parsedTransaction.transfers?.length || 0,
          transfers: parsedTransaction.transfers,
        });

        let totalTransferAmount = 0;

        if (
          parsedTransaction.transfers &&
          parsedTransaction.transfers.length > 0
        ) {
          for (const transfer of parsedTransaction.transfers) {
            const transferAmount =
              typeof transfer.amount === 'string'
                ? parseFloat(transfer.amount)
                : transfer.amount;

            if (transferAmount < 0) {
              const amountHbar = Math.abs(transferAmount);
              totalTransferAmount += amountHbar;

              logger.debug('Found HBAR transfer', {
                from: transfer.accountId,
                to: 'service',
                amount: amountHbar,
              });
            }
          }
        }

        if (totalTransferAmount > 0) {
          totalCostHbar = totalTransferAmount.toString();
          logger.debug('Using parsed transaction transfer amount', {
            totalTransferAmount,
            totalCostHbar,
          });
        }
      } catch (parseError) {
        logger.warn(
          'Could not parse transaction bytes, using totalCost fallback',
          {
            error: parseError,
            errorMessage:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          },
        );
      }
    }

    const transfers = [
      {
        to: 'Inscription Service',
        amount: totalCostHbar,
        description: `Inscription fee (${totalCostHbar} HBAR)`,
      },
    ];

    const validUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const quote: QuoteResult = {
      totalCostHbar,
      validUntil,
      breakdown: {
        transfers,
      },
    };

    logger.debug('Successfully parsed transaction for quote', {
      totalCostHbar: quote.totalCostHbar,
      transferCount: transfers.length,
      hasTransactionBytes: !!inscriptionResponse.transactionBytes,
      hasTotalCost: !!inscriptionResponse.totalCost,
    });

    return quote;
  } catch (error) {
    logger.error('Error parsing transaction for quote', error);
    throw error;
  }
}

export async function waitForInscriptionConfirmation(
  sdk: InscriptionSDK,
  transactionId: string,
  maxAttempts: number = 30,
  intervalMs: number = 4000,
  progressCallback?: ProgressCallback,
): Promise<RetrievedInscriptionResult> {
  const logger = Logger.getInstance({ module: 'Inscriber' });
  const normalizedId = normalizeTransactionId(transactionId);
  const progressReporter = new ProgressReporter({
    module: 'Inscriber',
    logger,
    callback: progressCallback,
  });

  try {
    logger.debug('Waiting for inscription confirmation', {
      transactionId: normalizedId,
      maxAttempts,
      intervalMs,
    });

    progressReporter.preparing('Preparing for inscription confirmation', 5, {
      transactionId: normalizedId,
      maxAttempts,
      intervalMs,
    });

    try {
      const waitMethod = sdk.waitForInscription.bind(sdk) as (
        txId: string,
        maxAttempts: number,
        intervalMs: number,
        checkCompletion: boolean,
        progressCallback?: (data: {
          stage?: string;
          message?: string;
          progressPercent?: number;
          details?: unknown;
        }) => void,
      ) => Promise<RetrievedInscriptionResult>;

      const wrappedCallback = (data: {
        stage?: string;
        message?: string;
        progressPercent?: number;
        details?: unknown;
      }) => {
        const stageRaw = data.stage || 'confirming';
        const allowedStages = [
          'preparing',
          'submitting',
          'confirming',
          'verifying',
          'completed',
          'failed',
        ] as const;
        const stage = (
          allowedStages.includes(stageRaw as (typeof allowedStages)[number])
            ? stageRaw
            : 'confirming'
        ) as (typeof allowedStages)[number];

        const message = data.message || 'Processing inscription';
        const percent = data.progressPercent || 50;

        progressReporter.report({
          stage,
          message,
          progressPercent: percent,
          details: data.details as Record<string, unknown> | undefined,
        });
      };

      return await waitMethod(
        normalizedId,
        maxAttempts,
        intervalMs,
        true,
        wrappedCallback,
      );
    } catch (e) {
      logger.debug('Falling back to standard waitForInscription method', {
        error: e,
      });
      progressReporter.verifying('Verifying inscription status', 50, {
        error: e,
      });

      return await sdk.waitForInscription(
        normalizedId,
        maxAttempts,
        intervalMs,
        true,
      );
    }
  } catch (error) {
    logger.error('Error waiting for inscription confirmation', {
      transactionId,
      maxAttempts,
      intervalMs,
      error,
    });

    progressReporter.failed('Inscription confirmation failed', {
      transactionId,
      error,
    });

    throw error;
  }
}

const DEFAULT_REGISTRY_BROKER_URL = 'https://hol.org/registry/api/v1';
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_WAIT_TIMEOUT_MS = 120000;

/**
 * Options for inscribing via Registry Broker with ledger authentication
 */
export interface InscribeViaRegistryBrokerOptions {
  /** Registry Broker base URL */
  baseUrl?: string;
  /** Ledger API key (from authenticateWithLedger) */
  ledgerApiKey?: string;
  /** Standard API key */
  apiKey?: string;
  /** Inscription mode */
  mode?: 'file' | 'upload' | 'hashinal' | 'hashinal-collection';
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Optional tags */
  tags?: string[];
  /** File standard */
  fileStandard?: string;
  /** Chunk size for large files */
  chunkSize?: number;
  /** Wait for confirmation (default: true) */
  waitForConfirmation?: boolean;
  /** Timeout for waiting (default: 120000ms) */
  waitTimeoutMs?: number;
  /** Poll interval (default: 2000ms) */
  pollIntervalMs?: number;
  /** Logging options */
  logging?: { level?: LogLevel };
}

/**
 * Result from Registry Broker inscription
 */
export interface RegistryBrokerInscriptionResult {
  confirmed: boolean;
  jobId: string;
  status: string;
  hrl?: string;
  topicId?: string;
  network?: string;
  credits?: number;
  usdCents?: number;
  sizeBytes?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface RegistryBrokerJobResponse {
  jobId?: string;
  id?: string;
  status: string;
  hrl?: string;
  topicId?: string;
  network?: string;
  credits?: number;
  quoteCredits?: number;
  usdCents?: number;
  quoteUsdCents?: number;
  sizeBytes?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface RegistryBrokerQuoteResponse {
  quoteId: string;
  contentHash: string;
  sizeBytes: number;
  totalCostHbar: number;
  credits: number;
  usdCents: number;
  expiresAt: string;
  mode: string;
}

async function fetchRegistryBroker<T>(
  url: string,
  options: RequestInit & { headers?: Record<string, string> },
): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage =
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error?: unknown }).error)
        : `HTTP ${response.status}`;
    throw new Error(errorMessage);
  }
  return body as T;
}

/**
 * Inscribe content via the Registry Broker API using credits.
 *
 * This function allows inscribing content using Registry Broker credits instead
 * of direct Hedera transactions. It supports both ledger authentication (EVM/Hedera)
 * and standard API key authentication.
 *
 * @param input - The content to inscribe (URL, file path, or buffer)
 * @param options - Configuration options including auth credentials
 * @returns Promise containing the inscription result with HRL
 *
 * @example
 * ```typescript
 * // Using ledger authentication
 * const result = await inscribeViaRegistryBroker(
 *   { type: 'buffer', buffer: myData, fileName: 'data.json' },
 *   { ledgerApiKey: 'rbk_...', mode: 'file' }
 * );
 * console.log('Inscribed at:', result.hrl);
 * ```
 */
export async function inscribeViaRegistryBroker(
  input: InscriptionInput,
  options: InscribeViaRegistryBrokerOptions = {},
): Promise<RegistryBrokerInscriptionResult> {
  const logger = Logger.getInstance({
    module: 'InscribeViaBroker',
    ...options.logging,
  });

  const baseUrl = options.baseUrl ?? DEFAULT_REGISTRY_BROKER_URL;
  const waitForConfirmation = options.waitForConfirmation ?? true;
  const waitTimeoutMs = options.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (options.ledgerApiKey) {
    headers['x-api-key'] = options.ledgerApiKey;
  } else if (options.apiKey) {
    headers['x-api-key'] = options.apiKey;
  } else {
    throw new Error(
      'Either ledgerApiKey or apiKey is required for Registry Broker inscription',
    );
  }

  logger.info('Starting inscription via Registry Broker', {
    baseUrl,
    inputType: input.type,
    mode: options.mode ?? 'file',
  });

  let base64Content: string;
  let fileName: string;
  let mimeType: string | undefined;

  switch (input.type) {
    case 'url':
      logger.debug('Creating job with URL input');
      break;
    case 'file': {
      const fileData = await convertFileToBase64(input.path);
      base64Content = fileData.base64;
      fileName = fileData.fileName;
      mimeType = fileData.mimeType;
      break;
    }
    case 'buffer':
      base64Content = Buffer.from(
        input.buffer instanceof ArrayBuffer
          ? new Uint8Array(input.buffer)
          : input.buffer,
      ).toString('base64');
      fileName = input.fileName;
      mimeType = input.mimeType;
      break;
  }

  const requestBody: Record<string, unknown> = {
    inputType: input.type === 'url' ? 'url' : 'base64',
    mode: options.mode ?? 'file',
  };

  if (input.type === 'url') {
    requestBody.url = input.url;
  } else {
    requestBody.base64 = base64Content!;
    requestBody.fileName = fileName!;
    if (mimeType) {
      requestBody.mimeType = mimeType;
    }
  }

  if (options.metadata) {
    requestBody.metadata = options.metadata;
  }
  if (options.tags) {
    requestBody.tags = options.tags;
  }
  if (options.fileStandard) {
    requestBody.fileStandard = options.fileStandard;
  }
  if (options.chunkSize) {
    requestBody.chunkSize = options.chunkSize;
  }

  logger.debug('Creating inscription job');
  const job = await fetchRegistryBroker<RegistryBrokerJobResponse>(
    `${baseUrl}/inscribe/content`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    },
  );

  const jobId = job.jobId ?? job.id ?? '';
  logger.info('Inscription job created', { jobId, status: job.status });

  if (!waitForConfirmation) {
    return {
      confirmed: false,
      jobId,
      status: job.status,
      credits: job.credits ?? job.quoteCredits,
      usdCents: job.usdCents ?? job.quoteUsdCents,
      sizeBytes: job.sizeBytes,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      network: job.network,
    };
  }

  logger.debug('Polling for job completion', { jobId, waitTimeoutMs });
  const startTime = Date.now();
  let lastStatus = '';

  while (Date.now() - startTime < waitTimeoutMs) {
    const currentJob = await fetchRegistryBroker<RegistryBrokerJobResponse>(
      `${baseUrl}/inscribe/content/${jobId}`,
      { method: 'GET', headers },
    );

    if (currentJob.status !== lastStatus) {
      logger.debug('Job status update', { jobId, status: currentJob.status });
      lastStatus = currentJob.status;
    }

    if (currentJob.status === 'completed') {
      logger.info('Inscription completed', {
        jobId,
        hrl: currentJob.hrl,
        topicId: currentJob.topicId,
      });

      return {
        confirmed: true,
        jobId,
        status: currentJob.status,
        hrl: currentJob.hrl,
        topicId: currentJob.topicId,
        network: currentJob.network,
        credits: currentJob.credits ?? currentJob.quoteCredits,
        usdCents: currentJob.usdCents ?? currentJob.quoteUsdCents,
        sizeBytes: currentJob.sizeBytes,
        createdAt: currentJob.createdAt,
        updatedAt: currentJob.updatedAt,
      };
    }

    if (currentJob.status === 'failed') {
      logger.error('Inscription failed', { jobId, error: currentJob.error });
      return {
        confirmed: false,
        jobId,
        status: currentJob.status,
        error: currentJob.error ?? 'Inscription failed',
        credits: currentJob.credits ?? currentJob.quoteCredits,
        createdAt: currentJob.createdAt,
        updatedAt: currentJob.updatedAt,
      };
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Inscription job ${jobId} did not complete within ${waitTimeoutMs}ms`,
  );
}

/**
 * Get an inscription quote from the Registry Broker without creating a job.
 *
 * @param input - The content to get a quote for
 * @param options - Configuration options
 * @returns Promise containing the quote with cost information
 */
export async function getRegistryBrokerQuote(
  input: InscriptionInput,
  options: InscribeViaRegistryBrokerOptions = {},
): Promise<RegistryBrokerQuoteResponse> {
  const logger = Logger.getInstance({
    module: 'InscribeViaBroker',
    ...options.logging,
  });

  const baseUrl = options.baseUrl ?? DEFAULT_REGISTRY_BROKER_URL;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (options.ledgerApiKey) {
    headers['x-api-key'] = options.ledgerApiKey;
  } else if (options.apiKey) {
    headers['x-api-key'] = options.apiKey;
  } else {
    throw new Error(
      'Either ledgerApiKey or apiKey is required for Registry Broker quotes',
    );
  }

  let base64Content: string | undefined;
  let fileName: string | undefined;
  let mimeType: string | undefined;

  switch (input.type) {
    case 'url':
      break;
    case 'file': {
      const fileData = await convertFileToBase64(input.path);
      base64Content = fileData.base64;
      fileName = fileData.fileName;
      mimeType = fileData.mimeType;
      break;
    }
    case 'buffer':
      base64Content = Buffer.from(
        input.buffer instanceof ArrayBuffer
          ? new Uint8Array(input.buffer)
          : input.buffer,
      ).toString('base64');
      fileName = input.fileName;
      mimeType = input.mimeType;
      break;
  }

  const requestBody: Record<string, unknown> = {
    inputType: input.type === 'url' ? 'url' : 'base64',
    mode: options.mode ?? 'file',
  };

  if (input.type === 'url') {
    requestBody.url = input.url;
  } else {
    requestBody.base64 = base64Content;
    requestBody.fileName = fileName;
    if (mimeType) {
      requestBody.mimeType = mimeType;
    }
  }

  if (options.metadata) {
    requestBody.metadata = options.metadata;
  }
  if (options.tags) {
    requestBody.tags = options.tags;
  }
  if (options.fileStandard) {
    requestBody.fileStandard = options.fileStandard;
  }
  if (options.chunkSize) {
    requestBody.chunkSize = options.chunkSize;
  }

  logger.debug('Getting inscription quote from Registry Broker');

  return fetchRegistryBroker<RegistryBrokerQuoteResponse>(
    `${baseUrl}/inscribe/content/quote`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    },
  );
}
