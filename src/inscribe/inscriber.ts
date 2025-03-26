import { InscriptionSDK } from '@kiloscribe/inscription-sdk';
import {
  InscriptionOptions,
  InscriptionResult,
  RetrievedInscriptionResult,
  HederaClientConfig,
} from './types';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';
import { Logger } from '../utils/logger';
import { ProgressCallback, ProgressReporter } from '../utils/progress-reporter';

export type InscriptionInput =
  | { type: 'url'; url: string }
  | { type: 'file'; path: string }
  | {
      type: 'buffer';
      buffer: ArrayBuffer | Buffer;
      fileName: string;
      mimeType?: string;
    };

export type InscriptionResponse =
  | { confirmed: false; result: InscriptionResult; sdk: InscriptionSDK }
  | {
      confirmed: true;
      result: InscriptionResult;
      inscription: RetrievedInscriptionResult;
      sdk: InscriptionSDK;
    };

export async function inscribe(
  input: InscriptionInput,
  clientConfig: HederaClientConfig,
  options: InscriptionOptions,
  existingSDK?: InscriptionSDK
): Promise<InscriptionResponse> {
  const logger = Logger.getInstance({
    module: 'Inscriber',
    ...options.logging,
  });

  logger.info('Starting inscription process', {
    type: input.type,
    mode: options.mode || 'file',
    ...(input.type === 'url' ? { url: input.url } : {}),
    ...(input.type === 'file' ? { path: input.path } : {}),
    ...(input.type === 'buffer'
      ? { fileName: input.fileName, bufferSize: input.buffer.byteLength }
      : {}),
  });

  try {
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
      });
    } else {
      logger.debug('Initializing InscriptionSDK with server auth');
      sdk = await InscriptionSDK.createWithAuth({
        type: 'server',
        accountId: clientConfig.accountId,
        privateKey: clientConfig.privateKey,
        network: clientConfig.network || 'mainnet',
      });
    }

    const baseRequest = {
      holderId: clientConfig.accountId,
      metadata: options.metadata || {},
      tags: options.tags || [],
      mode: options.mode || 'file',
      chunkSize: options.chunkSize,
    };

    let request: any;
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

      case 'file':
        request = {
          ...baseRequest,
          file: {
            type: 'path',
            path: input.path,
          },
        };
        break;

      case 'buffer':
        request = {
          ...baseRequest,
          file: {
            type: 'base64',
            base64: Buffer.from(input.buffer).toString('base64'),
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

    const result = await sdk.inscribeAndExecute(request, clientConfig);
    logger.info('Starting to inscribe.', {
      type: input.type,
      mode: options.mode || 'file',
      transactionId: result.jobId,
    });

    if (options.waitForConfirmation) {
      logger.debug('Waiting for inscription confirmation', {
        transactionId: result.jobId,
        maxAttempts: options.waitMaxAttempts,
        intervalMs: options.waitIntervalMs,
      });

      const inscription = await waitForInscriptionConfirmation(
        sdk,
        result.jobId,
        options.waitMaxAttempts,
        options.waitIntervalMs,
        options.progressCallback
      );

      logger.info('Inscription confirmation received', {
        transactionId: result.jobId,
      });

      return {
        confirmed: true,
        result,
        inscription,
        sdk,
      };
    }

    return {
      confirmed: false,
      result,
      sdk,
    };
  } catch (error) {
    logger.error('Error during inscription process', error);
    throw error;
  }
}

export async function inscribeWithSigner(
  input: InscriptionInput,
  signer: DAppSigner,
  options: InscriptionOptions,
  existingSDK?: InscriptionSDK
): Promise<InscriptionResponse> {
  const logger = Logger.getInstance({
    module: 'Inscriber',
    ...options.logging,
  });

  logger.info('Starting inscription process with signer', {
    type: input.type,
    mode: options.mode || 'file',
    ...(input.type === 'url' ? { url: input.url } : {}),
    ...(input.type === 'file' ? { path: input.path } : {}),
    ...(input.type === 'buffer'
      ? { fileName: input.fileName, bufferSize: input.buffer.byteLength }
      : {}),
  });

  try {
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
        network: options.network || 'mainnet',
      });
    } else {
      logger.debug('Initializing InscriptionSDK with client auth');
      sdk = await InscriptionSDK.createWithAuth({
        type: 'client',
        accountId,
        signer: signer,
        network: options.network || 'mainnet',
      });
    }

    const baseRequest = {
      holderId: accountId,
      metadata: options.metadata || {},
      tags: options.tags || [],
      mode: options.mode || 'file',
      chunkSize: options.chunkSize,
    };

    let request: any;
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

      case 'file':
        request = {
          ...baseRequest,
          file: {
            type: 'path',
            path: input.path,
          },
        };
        break;

      case 'buffer':
        request = {
          ...baseRequest,
          file: {
            type: 'base64',
            base64: Buffer.from(input.buffer).toString('base64'),
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

    logger.debug('Preparing to inscribe content with signer', {
      type: input.type,
      mode: options.mode || 'file',
      holderId: accountId,
    });

    const result = await sdk.inscribe(
      {
        ...request,
        holderId: accountId,
      },
      signer
    );
    logger.info('Inscription started', {
      type: input.type,
      mode: options.mode || 'file',
      transactionId: result.jobId,
    });

    if (options.waitForConfirmation) {
      logger.debug('Waiting for inscription confirmation', {
        transactionId: result.jobId,
        maxAttempts: options.waitMaxAttempts,
        intervalMs: options.waitIntervalMs,
      });

      const inscription = await waitForInscriptionConfirmation(
        sdk,
        result.jobId,
        options.waitMaxAttempts,
        options.waitIntervalMs,
        options.progressCallback
      );

      logger.info('Inscription confirmation received', {
        transactionId: result.jobId,
      });

      return {
        confirmed: true,
        result,
        inscription,
        sdk,
      };
    }

    return {
      confirmed: false,
      result,
      sdk,
    };
  } catch (error) {
    logger.error('Error during inscription process', error);
    throw error;
  }
}

export async function retrieveInscription(
  transactionId: string,
  options: InscriptionOptions & { accountId?: string; privateKey?: string }
): Promise<RetrievedInscriptionResult> {
  const logger = Logger.getInstance({
    module: 'Inscriber',
    ...options.logging,
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

    if (options.apiKey) {
      logger.debug('Initializing InscriptionSDK with API key');
      sdk = new InscriptionSDK({
        apiKey: options.apiKey,
        network: options.network || 'mainnet',
      });
    } else if (options.accountId && options.privateKey) {
      logger.debug('Initializing InscriptionSDK with server auth');
      sdk = await InscriptionSDK.createWithAuth({
        type: 'server',
        accountId: options.accountId,
        privateKey: options.privateKey,
        network: options.network || 'mainnet',
      });
    } else {
      const error = new Error(
        'Either API key or account ID and private key are required for retrieving inscriptions'
      );
      logger.error('Missing authentication credentials', {
        hasApiKey: !!options.apiKey,
        hasAccountId: !!options.accountId,
        hasPrivateKey: !!options.privateKey,
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

function validateHashinalMetadata(metadata: any, logger: any): void {
  const requiredFields = ['name', 'creator', 'description', 'type'];
  const missingFields = requiredFields.filter((field) => !metadata[field]);

  if (missingFields.length > 0) {
    const error = new Error(
      `Missing required Hashinal metadata fields: ${missingFields.join(', ')}`
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

async function waitForInscriptionConfirmation(
  sdk: InscriptionSDK,
  transactionId: string,
  maxAttempts: number = 30,
  intervalMs: number = 4000,
  progressCallback?: ProgressCallback
): Promise<RetrievedInscriptionResult> {
  const logger = Logger.getInstance({ module: 'Inscriber' });
  const progressReporter = new ProgressReporter({
    module: 'Inscriber',
    logger,
    callback: progressCallback,
  });

  try {
    logger.debug('Waiting for inscription confirmation', {
      transactionId,
      maxAttempts,
      intervalMs,
    });

    progressReporter.preparing('Preparing for inscription confirmation', 5, {
      transactionId,
      maxAttempts,
      intervalMs,
    });

    try {
      const waitMethod = sdk.waitForInscription.bind(sdk) as (
        txId: string,
        maxAttempts: number,
        intervalMs: number,
        checkCompletion: boolean,
        progressCallback?: Function
      ) => Promise<RetrievedInscriptionResult>;

      const wrappedCallback = (data: any) => {
        const stage = data.stage || 'confirming';
        const message = data.message || 'Processing inscription';
        const percent = data.progressPercent || 50;

        progressReporter.report({
          stage: stage,
          message: message,
          progressPercent: percent,
          details: {},
        });
      };

      return await waitMethod(
        transactionId,
        maxAttempts,
        intervalMs,
        true,
        wrappedCallback
      );
    } catch (e) {
      console.log(e);
      // Fall back to standard method if progress callback fails
      logger.debug('Falling back to standard waitForInscription method', {
        error: e,
      });
      progressReporter.verifying('Verifying inscription status', 50, {
        error: e,
      });

      return await sdk.waitForInscription(
        transactionId,
        maxAttempts,
        intervalMs,
        true
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
