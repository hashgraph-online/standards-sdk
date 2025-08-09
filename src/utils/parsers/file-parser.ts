import { proto } from '@hashgraph/proto';
import { Long, Transaction } from '@hashgraph/sdk';
import {
  FileCreateData,
  FileAppendData,
  FileUpdateData,
  FileDeleteData,
} from '../transaction-parser-types';
import { parseKey, extractTransactionBody, hasTransactionType } from './parser-utils';
import { Buffer } from 'buffer';
import { FileId } from '@hashgraph/sdk';

/**
 * File Service Parser
 *
 * Handles parsing for all file-related transaction types including:
 * - File creation, updates, append, and deletion
 * - Proper dual-branch parsing (regular vs signed transactions)
 * - Comprehensive protobuf extraction
 * - Enhanced content handling with type detection
 */
export class FileParser {
  /**
   * Parse File Service transaction using unified dual-branch approach
   * This handles both regular transactions and signed transaction variants
   */
  static parseFileTransaction(
    transaction: Transaction,
    originalBytes?: Uint8Array
  ): {
    type?: string;
    humanReadableType?: string;
    fileCreate?: FileCreateData;
    fileAppend?: FileAppendData;
    fileUpdate?: FileUpdateData;
    fileDelete?: FileDeleteData;
    [key: string]: unknown;
  } {
    try {
      // First, try to parse from protobuf data if available
      if (originalBytes || transaction.toBytes) {
        try {
          const bytesToParse = originalBytes || transaction.toBytes();
          const decoded = proto.TransactionList.decode(bytesToParse);

          if (decoded.transactionList && decoded.transactionList.length > 0) {
            const tx = decoded.transactionList[0];
            let txBody: proto.ITransactionBody | null = null;

            // Handle regular transaction branch
            if (tx.bodyBytes && tx.bodyBytes.length > 0) {
              txBody = proto.TransactionBody.decode(tx.bodyBytes);
            }
            // Handle signed transaction branch (was missing in original)
            else if (tx.signedTransactionBytes && tx.signedTransactionBytes.length > 0) {
              const signedTx = proto.SignedTransaction.decode(tx.signedTransactionBytes);
              if (signedTx.bodyBytes) {
                txBody = proto.TransactionBody.decode(signedTx.bodyBytes);
              }
            }

            if (txBody) {
              const protoResult = this.parseFromProtobufTxBody(txBody);
              if (protoResult.type && protoResult.type !== 'UNKNOWN') {
                return protoResult;
              }
            }
          }
        } catch (protoError) {
          // Continue to Transaction object parsing
        }
      }

      // Fallback to Transaction object parsing
      return this.parseFromTransactionInternals(transaction);
    } catch (error) {
      return { type: 'UNKNOWN', humanReadableType: 'Unknown File Transaction' };
    }
  }

  /**
   * Parse file transaction from protobuf TransactionBody
   * Handles all file operations from decoded protobuf data
   */
  private static parseFromProtobufTxBody(
    txBody: proto.ITransactionBody
  ): {
    type?: string;
    humanReadableType?: string;
    [key: string]: unknown;
  } {
    // File Create
    if (txBody.fileCreate) {
      const fileCreate = this.parseFileCreate(txBody.fileCreate);
      if (fileCreate) {
        return {
          type: 'FILECREATE',
          humanReadableType: 'File Create',
          fileCreate,
        };
      }
    }

    // File Append
    if (txBody.fileAppend) {
      const fileAppend = this.parseFileAppend(txBody.fileAppend);
      if (fileAppend) {
        return {
          type: 'FILEAPPEND',
          humanReadableType: 'File Append',
          fileAppend,
        };
      }
    }

    // File Update
    if (txBody.fileUpdate) {
      const fileUpdate = this.parseFileUpdate(txBody.fileUpdate);
      if (fileUpdate) {
        return {
          type: 'FILEUPDATE',
          humanReadableType: 'File Update',
          fileUpdate,
        };
      }
    }

    // File Delete
    if (txBody.fileDelete) {
      const fileDelete = this.parseFileDelete(txBody.fileDelete);
      if (fileDelete) {
        return {
          type: 'FILEDELETE',
          humanReadableType: 'File Delete',
          fileDelete,
        };
      }
    }

    return {};
  }

  /**
   * Extract file data from Transaction internal fields
   * This handles cases where data is stored in Transaction object internals
   */
  private static parseFromTransactionInternals(
    transaction: Transaction
  ): {
    type?: string;
    humanReadableType?: string;
    [key: string]: unknown;
  } {
    try {
      const tx = transaction as unknown as {
        _fileId?: { toString(): string };
        _contents?: Uint8Array;
        _keys?: unknown[];
        _expirationTime?: { toString(): string };
        _memo?: string;
        constructor?: { name?: string };
      };

      // File Create
      if (hasTransactionType(transaction, 'fileCreate')) {
        const fileCreate: FileCreateData = {};

        if (tx._contents) {
          const contentInfo = this.analyzeContent(tx._contents);
          fileCreate.contents = contentInfo.encoded;
          if (contentInfo.contentType) {
            fileCreate.contentType = contentInfo.contentType;
          }
          if (contentInfo.size) {
            fileCreate.contentSize = contentInfo.size;
          }
        }

        if (tx._keys && tx._keys.length > 0) {
          const keyList: proto.IKeyList = { keys: tx._keys as unknown as proto.IKey[] };
          fileCreate.keys = parseKey({ keyList });
        }

        if (tx._expirationTime) {
          fileCreate.expirationTime = tx._expirationTime.toString();
        }

        if (tx._memo) {
          fileCreate.memo = tx._memo;
        }

        return {
          type: 'FILECREATE',
          humanReadableType: 'File Create',
          fileCreate,
        };
      }

      // File Append
      if (hasTransactionType(transaction, 'fileAppend')) {
        const fileAppend: FileAppendData = {
          fileId: tx._fileId.toString(),
        };

        if (tx._contents) {
          const contentInfo = this.analyzeContent(tx._contents);
          fileAppend.contents = contentInfo.encoded;
          if (contentInfo.size) {
            fileAppend.contentSize = contentInfo.size;
          }
        }

        return {
          type: 'FILEAPPEND',
          humanReadableType: 'File Append',
          fileAppend,
        };
      }

      // File Update
      if (hasTransactionType(transaction, 'fileUpdate')) {
        const fileUpdate: FileUpdateData = {
          fileId: tx._fileId.toString(),
        };

        if (tx._contents) {
          const contentInfo = this.analyzeContent(tx._contents);
          fileUpdate.contents = contentInfo.encoded;
          if (contentInfo.size) {
            fileUpdate.contentSize = contentInfo.size;
          }
        }

        if (tx._keys && tx._keys.length > 0) {
          const keyList: proto.IKeyList = { keys: tx._keys as unknown as proto.IKey[] };
          fileUpdate.keys = parseKey({ keyList });
        }

        if (tx._expirationTime) {
          fileUpdate.expirationTime = tx._expirationTime.toString();
        }

        if (tx._memo) {
          fileUpdate.memo = tx._memo;
        }

        return {
          type: 'FILEUPDATE',
          humanReadableType: 'File Update',
          fileUpdate,
        };
      }

      // File Delete
      if (hasTransactionType(transaction, 'fileDelete')) {
        const fileDelete: FileDeleteData = {
          fileId: tx._fileId.toString(),
        };

        return {
          type: 'FILEDELETE',
          humanReadableType: 'File Delete',
          fileDelete,
        };
      }

      return {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Enhanced content analysis with type detection and metadata
   */
  private static analyzeContent(contents: Uint8Array): {
    encoded: string;
    contentType?: string;
    size: number;
  } {
    const size = contents.length;
    const contentBuffer = Buffer.from(contents);

    // Try to detect content type based on magic bytes and content
    let contentType: string | undefined;

    // Check for common file signatures
    if (size >= 4) {
      const header = contentBuffer.subarray(0, 4);
      const headerHex = header.toString('hex');

      // Common file type signatures
      const signatures: Record<string, string> = {
        '89504e47': 'image/png',
        'ffd8ffe0': 'image/jpeg',
        'ffd8ffe1': 'image/jpeg',
        '47494638': 'image/gif',
        '25504446': 'application/pdf',
        '504b0304': 'application/zip',
        '7f454c46': 'application/x-executable',
        'd0cf11e0': 'application/msoffice',
      };

      contentType = signatures[headerHex.toLowerCase()];
    }

    // If no signature match, try to detect text vs binary
    if (!contentType) {
      try {
        const textContent = contentBuffer.toString('utf8');
        // Check if it's likely text (no control characters except common ones)
        const hasControlChars = /[\x00-\x08\x0B\x0E-\x1F\x7F]/.test(textContent);
        const hasReplacementChars = textContent.includes('\uFFFD');

        if (!hasControlChars && !hasReplacementChars) {
          // Further classify text content
          if (textContent.trim().startsWith('{') && textContent.trim().endsWith('}')) {
            contentType = 'application/json';
          } else if (textContent.includes('<?xml') || textContent.includes('<html')) {
            contentType = 'text/xml';
          } else if (textContent.includes('<!DOCTYPE html')) {
            contentType = 'text/html';
          } else {
            contentType = 'text/plain';
          }
        } else {
          contentType = 'application/octet-stream';
        }
      } catch {
        contentType = 'application/octet-stream';
      }
    }

    // For text content, try UTF-8 first, otherwise base64
    let encoded: string;
    if (contentType?.startsWith('text/') || contentType === 'application/json') {
      try {
        encoded = contentBuffer.toString('utf8');
        // Double-check it's valid UTF-8
        if (encoded.includes('\uFFFD') || /[\x00-\x08\x0B\x0E-\x1F\x7F]/.test(encoded)) {
          encoded = contentBuffer.toString('base64');
        }
      } catch {
        encoded = contentBuffer.toString('base64');
      }
    } else {
      encoded = contentBuffer.toString('base64');
    }

    return {
      encoded,
      contentType,
      size,
    };
  }
  static parseFileCreate(
    body: proto.IFileCreateTransactionBody,
  ): FileCreateData | undefined {
    if (!body) return undefined;
    const data: FileCreateData = {};
    if (body.expirationTime?.seconds) {
      data.expirationTime = `${Long.fromValue(
        body.expirationTime.seconds,
      ).toString()}.${body.expirationTime.nanos}`;
    }
    if (body.keys) {
      data.keys = parseKey({ keyList: body.keys });
    }
    if (body.contents) {
      data.contents = Buffer.from(body.contents).toString('base64');
    }
    if (body.memo) {
      data.memo = body.memo;
    }
    return data;
  }

  static parseFileAppend(
    body: proto.IFileAppendTransactionBody,
  ): FileAppendData | undefined {
    if (!body) return undefined;
    const data: FileAppendData = {};
    if (body.fileID) {
      data.fileId = `${body.fileID.shardNum ?? 0}.${
        body.fileID.realmNum ?? 0
      }.${body.fileID.fileNum ?? 0}`;
    }
    if (body.contents) {
      data.contents = Buffer.from(body.contents).toString('base64');
    }
    return data;
  }

  static parseFileUpdate(
    body: proto.IFileUpdateTransactionBody,
  ): FileUpdateData | undefined {
    if (!body) return undefined;
    const data: FileUpdateData = {};
    if (body.fileID) {
      data.fileId = `${body.fileID.shardNum ?? 0}.${
        body.fileID.realmNum ?? 0
      }.${body.fileID.fileNum ?? 0}`;
    }
    if (body.expirationTime?.seconds) {
      data.expirationTime = `${Long.fromValue(
        body.expirationTime.seconds,
      ).toString()}.${body.expirationTime.nanos}`;
    }
    if (body.keys) {
      data.keys = parseKey({ keyList: body.keys });
    }
    if (body.contents) {
      data.contents = Buffer.from(body.contents).toString('base64');
    }
    if (body.memo?.value !== undefined) {
      data.memo = body.memo.value;
    }
    return data;
  }

  static parseFileDelete(
    body: proto.IFileDeleteTransactionBody,
  ): FileDeleteData | undefined {
    if (!body) return undefined;
    const data: FileDeleteData = {};
    if (body.fileID) {
      data.fileId = `${body.fileID.shardNum ?? 0}.${
        body.fileID.realmNum ?? 0
      }.${body.fileID.fileNum ?? 0}`;
    }
    return data;
  }

  /**
   * Parse File Service transaction from Transaction object
   * This is the unified entry point that delegates to the comprehensive parsing logic
   */
  static parseFromTransactionObject(transaction: Transaction): {
    type?: string;
    humanReadableType?: string;
    [key: string]: unknown;
  } {
    return this.parseFileTransaction(transaction);
  }
}
