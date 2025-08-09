import { Transaction } from '@hashgraph/sdk';
import { proto } from '@hashgraph/proto';
import {
  ScheduleCreateData,
  ScheduleSignData,
  ScheduleDeleteData,
  ParsedTransaction,
} from '../transaction-parser-types';
import {
  parseKey,
  extractTransactionBody,
  hasTransactionType,
} from './parser-utils';
import { AccountId, ScheduleId, Long } from '@hashgraph/sdk';

/**
 * Schedule Operations Parser
 *
 * Specialized parser for schedule-related transaction types including:
 * - Schedule Create with inner transaction parsing
 * - Schedule Sign operations
 * - Schedule Delete operations
 * - Proper dual-branch parsing (regular vs signed transactions)
 * - Comprehensive protobuf extraction
 *
 * Scheduled transactions allow for deferred execution of transactions
 * that require multiple signatures or meet specific conditions.
 */
export class ScheduleParser {
  /**
   * Parse Schedule Service transaction using unified dual-branch approach
   * This handles both regular transactions and signed transaction variants
   */
  static parseScheduleTransaction(
    transaction: Transaction,
    originalBytes?: Uint8Array,
  ): {
    type?: string;
    humanReadableType?: string;
    scheduleCreate?: ScheduleCreateData;
    scheduleSign?: ScheduleSignData;
    scheduleDelete?: ScheduleDeleteData;
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
            else if (
              tx.signedTransactionBytes &&
              tx.signedTransactionBytes.length > 0
            ) {
              const signedTx = proto.SignedTransaction.decode(
                tx.signedTransactionBytes,
              );
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
      return {
        type: 'UNKNOWN',
        humanReadableType: 'Unknown Schedule Transaction',
      };
    }
  }

  /**
   * Parse schedule transaction from protobuf TransactionBody
   * Handles all schedule operations from decoded protobuf data
   */
  private static parseFromProtobufTxBody(txBody: proto.ITransactionBody): {
    type?: string;
    humanReadableType?: string;
    [key: string]: unknown;
  } {
    // Schedule Create
    if (txBody.scheduleCreate) {
      const scheduleCreate = this.parseScheduleCreateFromProto(
        txBody.scheduleCreate,
      );
      if (scheduleCreate) {
        return {
          type: 'SCHEDULECREATE',
          humanReadableType: 'Schedule Create',
          scheduleCreate,
        };
      }
    }

    // Schedule Sign
    if (txBody.scheduleSign) {
      const scheduleSign = this.parseScheduleSignFromProto(txBody.scheduleSign);
      if (scheduleSign) {
        return {
          type: 'SCHEDULESIGN',
          humanReadableType: 'Schedule Sign',
          scheduleSign,
        };
      }
    }

    // Schedule Delete
    if (txBody.scheduleDelete) {
      const scheduleDelete = this.parseScheduleDeleteFromProto(
        txBody.scheduleDelete,
      );
      if (scheduleDelete) {
        return {
          type: 'SCHEDULEDELETE',
          humanReadableType: 'Schedule Delete',
          scheduleDelete,
        };
      }
    }

    return {};
  }

  /**
   * Extract schedule data from Transaction internal fields
   * This handles cases where data is stored in Transaction object internals
   */
  private static parseFromTransactionInternals(transaction: Transaction): {
    type?: string;
    humanReadableType?: string;
    [key: string]: unknown;
  } {
    try {
      const tx = transaction as unknown as {
        _scheduledTransaction?: Uint8Array;
        _scheduleMemo?: string;
        _adminKey?: unknown;
        _payerAccountId?: { toString(): string };
        _expirationTime?: { toString(): string };
        _waitForExpiry?: boolean;
        _scheduleId?: { toString(): string };
        constructor?: { name?: string };
      };

      // Schedule Create (most common) - use protobuf data instead of constructor name
      if (hasTransactionType(transaction, 'scheduleCreate')) {
        const scheduleCreate: ScheduleCreateData = {
          scheduledTransactionBody: Buffer.from(
            tx._scheduledTransaction,
          ).toString('base64'),
          memo: tx._scheduleMemo,
          adminKey: tx._adminKey ? parseKey(tx._adminKey) : undefined,
          payerAccountId: tx._payerAccountId?.toString(),
          expirationTime: tx._expirationTime?.toString(),
          waitForExpiry: tx._waitForExpiry || false,
        };

        return {
          type: 'SCHEDULECREATE',
          humanReadableType: 'Schedule Create',
          scheduleCreate,
        };
      }

      // Schedule Sign - use protobuf data instead of constructor name
      if (hasTransactionType(transaction, 'scheduleSign')) {
        const scheduleSign: ScheduleSignData = {
          scheduleId: tx._scheduleId.toString(),
        };

        return {
          type: 'SCHEDULESIGN',
          humanReadableType: 'Schedule Sign',
          scheduleSign,
        };
      }

      // Schedule Delete - use protobuf data instead of constructor name
      if (hasTransactionType(transaction, 'scheduleDelete')) {
        const scheduleDelete: ScheduleDeleteData = {
          scheduleId: tx._scheduleId.toString(),
        };

        return {
          type: 'SCHEDULEDELETE',
          humanReadableType: 'Schedule Delete',
          scheduleDelete,
        };
      }

      return {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Parse Schedule Create from protobuf data
   */
  private static parseScheduleCreateFromProto(
    body: proto.IScheduleCreateTransactionBody,
  ): ScheduleCreateData | undefined {
    if (!body) return undefined;

    const data: ScheduleCreateData = {};

    if (body.scheduledTransactionBody) {
      const schedBytes = proto.SchedulableTransactionBody.encode(
        proto.SchedulableTransactionBody.create(body.scheduledTransactionBody),
      ).finish();
      data.scheduledTransactionBody =
        Buffer.from(schedBytes).toString('base64');
    }

    if (body.memo) {
      data.memo = body.memo;
    }

    if (body.adminKey) {
      data.adminKey = parseKey(body.adminKey);
    }

    if (body.payerAccountID) {
      data.payerAccountId = new AccountId(
        body.payerAccountID.shardNum ?? 0,
        body.payerAccountID.realmNum ?? 0,
        body.payerAccountID.accountNum ?? 0,
      ).toString();
    }

    if (body.expirationTime?.seconds) {
      data.expirationTime = `${Long.fromValue(
        body.expirationTime.seconds,
      ).toString()}.${body.expirationTime.nanos ?? 0}`;
    }

    if (body.waitForExpiry !== undefined) {
      data.waitForExpiry = body.waitForExpiry;
    }

    return data;
  }

  /**
   * Parse Schedule Sign from protobuf data
   */
  private static parseScheduleSignFromProto(
    body: proto.IScheduleSignTransactionBody,
  ): ScheduleSignData | undefined {
    if (!body) return undefined;

    const data: ScheduleSignData = {};

    if (body.scheduleID) {
      data.scheduleId = new ScheduleId(
        body.scheduleID.shardNum ?? 0,
        body.scheduleID.realmNum ?? 0,
        body.scheduleID.scheduleNum ?? 0,
      ).toString();
    }

    return data;
  }

  /**
   * Parse Schedule Delete from protobuf data
   */
  private static parseScheduleDeleteFromProto(
    body: proto.IScheduleDeleteTransactionBody,
  ): ScheduleDeleteData | undefined {
    if (!body) return undefined;

    const data: ScheduleDeleteData = {};

    if (body.scheduleID) {
      data.scheduleId = new ScheduleId(
        body.scheduleID.shardNum ?? 0,
        body.scheduleID.realmNum ?? 0,
        body.scheduleID.scheduleNum ?? 0,
      ).toString();
    }

    return data;
  }

  /**
   * Legacy method: Parse schedule create transaction
   * @deprecated Use parseScheduleTransaction instead
   */
  static parseScheduleCreate(
    transaction: Transaction,
  ): ScheduleCreateData | null {
    try {
      const result = this.parseScheduleTransaction(transaction);
      return result.scheduleCreate || null;
    } catch (error) {
      console.warn('[ScheduleParser] Failed to parse schedule create:', error);
      return null;
    }
  }

  /**
   * Legacy method: Parse schedule sign transaction
   * @deprecated Use parseScheduleTransaction instead
   */
  static parseScheduleSign(transaction: Transaction): ScheduleSignData | null {
    try {
      const result = this.parseScheduleTransaction(transaction);
      return result.scheduleSign || null;
    } catch (error) {
      console.warn('[ScheduleParser] Failed to parse schedule sign:', error);
      return null;
    }
  }

  /**
   * Legacy method: Parse schedule delete transaction
   * @deprecated Use parseScheduleTransaction instead
   */
  static parseScheduleDelete(
    transaction: Transaction,
  ): ScheduleDeleteData | null {
    try {
      const result = this.parseScheduleTransaction(transaction);
      return result.scheduleDelete || null;
    } catch (error) {
      console.warn('[ScheduleParser] Failed to parse schedule delete:', error);
      return null;
    }
  }

  /**
   * Parse schedule info from transaction body (for scheduled transactions)
   */
  static extractScheduleInfo(transaction: Transaction): {
    isScheduled: boolean;
    scheduleRef?: string;
  } {
    try {
      const transactionBody = (transaction as any)._transactionBody;

      if (transactionBody?.scheduleRef) {
        return {
          isScheduled: true,
          scheduleRef: transactionBody.scheduleRef.toString(),
        };
      }

      const tx = transaction as any;
      if (tx._scheduleId || tx.scheduleId) {
        return {
          isScheduled: true,
          scheduleRef: (tx._scheduleId || tx.scheduleId)?.toString(),
        };
      }

      return { isScheduled: false };
    } catch (error) {
      return { isScheduled: false };
    }
  }

  /**
   * Parse a scheduled transaction body to extract the inner transaction
   * This is used when a schedule contains another transaction to be executed
   */
  static parseScheduledTransactionBody(scheduledTxBytes: string): any {
    try {
      let bytes: Uint8Array;

      if (scheduledTxBytes.startsWith('0x')) {
        const hexString = scheduledTxBytes.slice(2);
        bytes = new Uint8Array(Buffer.from(hexString, 'hex'));
      } else {
        bytes = new Uint8Array(Buffer.from(scheduledTxBytes, 'base64'));
      }

      const schedulableBody = proto.SchedulableTransactionBody.decode(bytes);

      const txType = Object.keys(schedulableBody).find(
        key =>
          schedulableBody[key as keyof proto.ISchedulableTransactionBody] !==
            null &&
          key !== 'transactionFee' &&
          key !== 'memo',
      );

      if (txType) {
        return {
          type: txType.toUpperCase(),
          body: schedulableBody[
            txType as keyof proto.ISchedulableTransactionBody
          ],
          memo: schedulableBody.memo,
          transactionFee: schedulableBody.transactionFee?.toString(),
        };
      }

      return null;
    } catch (error) {
      console.warn(
        '[ScheduleParser] Failed to parse scheduled transaction body:',
        error,
      );
      return null;
    }
  }

  /**
   * Parse Schedule Service transaction from Transaction object
   * This is the unified entry point that delegates to the comprehensive parsing logic
   */
  static parseFromTransactionObject(transaction: Transaction): {
    type?: string;
    humanReadableType?: string;
    [key: string]: unknown;
  } {
    return this.parseScheduleTransaction(transaction);
  }
}
