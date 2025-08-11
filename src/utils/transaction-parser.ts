import { proto } from '@hashgraph/proto';
import { Buffer } from 'buffer';
import { Hbar, HbarUnit, Long, Transaction, AccountId } from '@hashgraph/sdk';
import { ethers } from 'ethers';
import {
  ParsedTransaction,
  ValidationResult,
  ParseOptions,
  TransactionParsingError,
  TokenCreationData,
} from './transaction-parser-types';
import { resolveTransactionSummary } from './transaction-summary-registry';
export { TransactionParsingError } from './transaction-parser-types';
import { HTSParser } from './parsers/hts-parser';
import { HCSParser } from './parsers/hcs-parser';
import { FileParser } from './parsers/file-parser';
import { CryptoParser } from './parsers/crypto-parser';
import { SCSParser } from './parsers/scs-parser';
import { UtilParser } from './parsers/util-parser';
import { ScheduleParser } from './parsers/schedule-parser';
import { transactionParserRegistry } from './transaction-parser-registry';
import {
  getHumanReadableTransactionType,
  getTransactionTypeFromBody,
} from './transaction-type-registries';

interface TransactionInternals {
  _transactionBody?: proto.ITransactionBody;
  _transactionMemo?: string;
  _transactionValidStart?: {
    toString(): string;
  };
  _transactionValidDuration?: {
    toString(): string;
  };
  _hbarTransfers?: Array<{
    accountId: AccountId;
    amount: Hbar;
  }>;
  _tokenTransfers?: Array<{
    tokenId: { toString(): string };
    transfers: Array<{
      accountId?: AccountId;
      amount?: number | Long;
    }>;
  }>;
  _tokenName?: string;
  _tokenSymbol?: string;
  _decimals?: number | Long;
  _initialSupply?: number | Long;
  _treasuryAccountId?: AccountId;
  _adminKey?: any;
  _kycKey?: any;
  _freezeKey?: any;
  _wipeKey?: any;
  _supplyKey?: any;
  _feeScheduleKey?: any;
  _pauseKey?: any;
  _metadataKey?: any;
  _freezeDefault?: boolean;
  _expirationTime?: any;
  _autoRenewAccountId?: AccountId;
  _autoRenewPeriod?: any;
  _tokenMemo?: string;
  _customFees?: any[];
  _tokenType?: any;
  _supplyType?: any;
  _maxSupply?: number | Long;
  _metadata?: Buffer;
  _tokenAirdrops?: any[];
}

/**
 * Hedera Transaction Parser
 *
 * Supports parsing of both regular Transaction objects and scheduled transaction bytes
 * Provides comprehensive support for all major Hedera transaction types with fallback mechanisms
 */
export class TransactionParser {
  /**
   * Parse transaction bytes in any supported format (base64 or hex, regular or scheduled)
   * This is the main entry point for transaction parsing with enhanced retry logic
   *
   * @param transactionBytes - Transaction bytes in base64 or hex format
   * @param options - Parsing options and configuration
   * @returns Promise resolving to ParsedTransaction
   */
  static async parseTransactionBytes(
    transactionBytes: string,
    options: ParseOptions = {},
  ): Promise<ParsedTransaction> {
    const {
      enableFallback = true,
      strictMode = false,
      includeRaw = true,
      maxRetries = 2,
    } = options;

    const validation = this.validateTransactionBytes(transactionBytes);
    if (!validation.isValid && strictMode) {
      throw new TransactionParsingError(
        `Invalid transaction bytes format: ${validation.error}`,
        'INVALID_FORMAT',
        undefined,
        transactionBytes,
      );
    }

    let lastError: Error | undefined;
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      try {
        const result = await this.parseTransaction(transactionBytes, options);

        result.formatDetection = {
          originalFormat: validation.format || 'base64',
          wasConverted: validation.format === 'hex',
          length: transactionBytes.length,
        };

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount++;

        if (!enableFallback || retryCount > maxRetries) {
          if (strictMode) {
            throw new TransactionParsingError(
              'Failed to parse transaction after all attempts',
              'PARSING_FAILED',
              lastError,
              transactionBytes,
            );
          }
          break;
        }

        try {
          const result = this.parseScheduledTransaction(
            transactionBytes,
            options,
          );

          result.formatDetection = {
            originalFormat: validation.format || 'base64',
            wasConverted: false,
            length: transactionBytes.length,
          };

          return result;
        } catch (scheduledError) {}
      }
    }

    const fallbackResult = this.createFallbackResult(
      transactionBytes,
      lastError,
      undefined,
    );
    if (fallbackResult.details) {
      fallbackResult.details.parseAttempts = Math.max(retryCount, 1);
    }
    return fallbackResult;
  }

  /**
   * Parse a Transaction object directly using unified delegation approach
   * This method delegates to specialized parsers for clean separation of concerns
   *
   * @param transaction - The Transaction object to parse
   * @param originalBytes - The original transaction bytes (optional, for protobuf parsing)
   * @param options - Parsing options
   * @returns Parsed transaction data
   */
  static parseTransactionObject(
    transaction: Transaction,
    originalBytesOrOptions?: Uint8Array | ParseOptions,
    options: ParseOptions = {},
  ): ParsedTransaction {
    let originalBytes: Uint8Array | undefined;
    let actualOptions: ParseOptions;

    if (
      originalBytesOrOptions &&
      !Buffer.isBuffer(originalBytesOrOptions) &&
      !(originalBytesOrOptions instanceof Uint8Array)
    ) {
      actualOptions = originalBytesOrOptions as ParseOptions;
      originalBytes = undefined;
    } else {
      originalBytes = originalBytesOrOptions as Uint8Array | undefined;
      actualOptions = options;
    }
    try {
      const metadata = this.extractTransactionMetadata(transaction);

      const htsResult = HTSParser.parseFromTransactionObject(transaction);
      const cryptoResult = CryptoParser.parseFromTransactionObject(transaction);
      const hcsResult = HCSParser.parseFromTransactionObject(transaction);
      const fileResult = FileParser.parseFromTransactionObject(transaction);
      const scsResult = SCSParser.parseFromTransactionObject(transaction);
      const scheduleResult =
        ScheduleParser.parseFromTransactionObject(transaction);
      const utilResult = UtilParser.parseFromTransactionObject(transaction);

      const results = [
        htsResult,
        cryptoResult,
        hcsResult,
        fileResult,
        scsResult,
        scheduleResult,
        utilResult,
      ];
      const primaryResult =
        results.find(result => result.type && result.type !== 'UNKNOWN') || {};

      let finalType = 'UNKNOWN';
      let finalHumanReadableType = 'Unknown Transaction';
      let parsedTokenCreation: TokenCreationData | undefined;
      let protoParsingResult: any = {};

      if (originalBytes || transaction.toBytes) {
        try {
          const bytesToParse = originalBytes || transaction.toBytes();
          const decoded = proto.TransactionList.decode(bytesToParse);

          if (decoded.transactionList && decoded.transactionList.length > 0) {
            const tx = decoded.transactionList[0];

            if (tx.bodyBytes && tx.bodyBytes.length > 0) {
              const txBody = proto.TransactionBody.decode(tx.bodyBytes);
              const typeResult = this.detectTransactionTypeFromBody(txBody);
              finalType = typeResult.type;
              finalHumanReadableType = typeResult.humanReadableType;

              protoParsingResult = this.parseTransactionBodyDetails(
                txBody,
                finalType,
              );
              if (protoParsingResult.tokenCreation) {
                parsedTokenCreation = protoParsingResult.tokenCreation;
              }
            } else if (
              tx.signedTransactionBytes &&
              tx.signedTransactionBytes.length > 0
            ) {
              const signedTx = proto.SignedTransaction.decode(
                tx.signedTransactionBytes,
              );
              if (signedTx.bodyBytes) {
                const txBody = proto.TransactionBody.decode(signedTx.bodyBytes);
                const typeResult = this.detectTransactionTypeFromBody(txBody);
                finalType = typeResult.type;
                finalHumanReadableType = typeResult.humanReadableType;

                protoParsingResult = this.parseTransactionBodyDetails(
                  txBody,
                  finalType,
                );
                if (protoParsingResult.tokenCreation) {
                  parsedTokenCreation = protoParsingResult.tokenCreation;
                }
              }
            }
          }
        } catch (protoError) {}
      }

      if (finalType === 'UNKNOWN' && primaryResult.type) {
        finalType = primaryResult.type;
        finalHumanReadableType =
          primaryResult.humanReadableType || finalHumanReadableType;
      }

      const result: ParsedTransaction = {
        type: finalType,
        humanReadableType: finalHumanReadableType,
        transfers: [],
        tokenTransfers: [],
        ...metadata,
        ...primaryResult,
        raw: actualOptions.includeRaw
          ? ((transaction as unknown as TransactionInternals)
              ._transactionBody as proto.SchedulableTransactionBody) ||
            ({} as proto.SchedulableTransactionBody)
          : undefined,
      };

      this.mergeProtoParsingResults(
        result,
        protoParsingResult,
        htsResult,
        transaction,
        originalBytes,
      );

      result.transfers = cryptoResult.transfers || result.transfers || [];
      result.tokenTransfers =
        cryptoResult.tokenTransfers || result.tokenTransfers || [];

      return result;
    } catch (error) {
      return {
        type: 'UNKNOWN',
        humanReadableType: 'Unknown Transaction',
        transfers: [],
        tokenTransfers: [],
        raw: actualOptions.includeRaw
          ? ({} as proto.SchedulableTransactionBody)
          : undefined,
        details: {
          error: `Failed to parse Transaction object: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  /**
   * Parse a base64 encoded transaction body using registry pattern
   * @param transactionBodyBase64 - The base64 encoded transaction body
   * @returns The parsed transaction
   */
  static parseTransactionBody(
    transactionBodyBase64: string,
  ): ParsedTransaction {
    try {
      const buffer = ethers.decodeBase64(transactionBodyBase64);
      const txBody = proto.SchedulableTransactionBody.decode(buffer);

      const transactionType = this.getTransactionType(txBody);

      const result: ParsedTransaction = {
        type: transactionType,
        humanReadableType: this.getHumanReadableType(transactionType),
        transfers: [],
        tokenTransfers: [],
        raw: txBody,
      };

      if (txBody.memo) {
        result.memo = txBody.memo;
      }

      if (txBody.transactionFee) {
        const hbarAmount = Hbar.fromTinybars(
          Long.fromValue(txBody.transactionFee),
        );
        result.transactionFee = hbarAmount.toString(HbarUnit.Hbar);
      }

      this.applySchedulableTransactionParsing(txBody, result);

      return result;
    } catch (error) {
      return {
        type: 'UNKNOWN',
        humanReadableType: 'Unknown Transaction',
        transfers: [],
        tokenTransfers: [],
        raw: undefined,
        details: {
          error: `Failed to parse transaction body: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      };
    }
  }

  /**
   * Detect transaction type and human-readable type from transaction body protobuf
   * Uses registry pattern to eliminate massive if-else chain
   */
  private static detectTransactionTypeFromBody(
    txBody: proto.ITransactionBody,
  ): {
    type: string;
    humanReadableType: string;
  } {
    return getTransactionTypeFromBody(txBody as proto.TransactionBody);
  }

  /**
   * Parse details from a complete schedule response
   * @param scheduleResponse - The schedule response to parse
   * @returns The parsed transaction
   */
  static parseScheduleResponse(scheduleResponse: {
    transaction_body: string;
    memo?: string;
  }): ParsedTransaction {
    if (!scheduleResponse.transaction_body) {
      return {
        type: 'UNKNOWN',
        humanReadableType: 'Unknown Transaction',
        transfers: [],
        tokenTransfers: [],
        raw: undefined,
        details: {
          error: 'Schedule response missing transaction_body',
        },
      };
    }

    const parsed = this.parseTransactionBody(scheduleResponse.transaction_body);

    if (scheduleResponse.memo) {
      parsed.memo = scheduleResponse.memo;
    }

    return parsed;
  }

  /**
   * Determine the transaction type using registry pattern
   * @param txBody - The transaction body to determine the type of
   * @returns The type of the transaction
   */
  private static getTransactionType(
    txBody: proto.SchedulableTransactionBody,
  ): string {
    return getTransactionTypeFromBody(txBody as proto.TransactionBody).type;
  }

  /**
   * Convert technical transaction type to human-readable format using registry pattern
   * @param type - The technical transaction type
   * @returns The human-readable transaction type
   */
  private static getHumanReadableType(type: string): string {
    return getHumanReadableTransactionType(type);
  }

  /**
   * Get a human-readable summary of the transaction
   * @param parsedTx - The parsed transaction
   * @returns The human-readable summary of the transaction
   */
  static getTransactionSummary(parsedTx: ParsedTransaction): string {
    return resolveTransactionSummary(parsedTx);
  }

  /**
   * Validate transaction bytes format and encoding
   * Enhanced validation with better format detection
   */
  static validateTransactionBytes(transactionBytes: string): ValidationResult {
    if (!transactionBytes || typeof transactionBytes !== 'string') {
      return {
        isValid: false,
        error: 'Transaction bytes must be a non-empty string',
      };
    }

    const format = this.detectTransactionFormat(transactionBytes);
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    const hexRegex = /^0x[0-9a-fA-F]+$/;

    let isValid = false;
    let error: string | undefined;

    if (format === 'hex') {
      isValid = hexRegex.test(transactionBytes) && transactionBytes.length > 2;
      if (!isValid) {
        error = 'Invalid hex format';
      }
    } else {
      isValid =
        base64Regex.test(transactionBytes) && transactionBytes.length > 0;
      if (!isValid) {
        error = 'Invalid base64 format';
      }
    }

    return {
      isValid,
      format,
      error,
      length: transactionBytes.length,
    };
  }

  /**
   * Detects the format of transaction bytes
   * @param transactionBytes - The transaction bytes to analyze
   * @returns The detected format ('base64' or 'hex')
   */
  static detectTransactionFormat(transactionBytes: string): 'base64' | 'hex' {
    return transactionBytes.startsWith('0x') ? 'hex' : 'base64';
  }

  /**
   * Decodes transaction bytes from string to Uint8Array
   * @param transactionBytes - The transaction bytes string (base64 or hex)
   * @returns Decoded Uint8Array
   * @throws TransactionParsingError if decoding fails
   */
  static decodeTransactionBytes(transactionBytes: string): Uint8Array {
    try {
      const format = this.detectTransactionFormat(transactionBytes);

      if (format === 'hex') {
        const hexString = transactionBytes.slice(2);
        return new Uint8Array(Buffer.from(hexString, 'hex'));
      } else {
        return new Uint8Array(Buffer.from(transactionBytes, 'base64'));
      }
    } catch (error) {
      throw new TransactionParsingError(
        'Failed to decode transaction bytes',
        'DECODE_ERROR',
        error instanceof Error ? error : undefined,
        transactionBytes,
      );
    }
  }

  /**
   * Check if transaction bytes represent a valid Hedera transaction
   */
  static async isValidHederaTransaction(
    transactionBytes: string,
  ): Promise<boolean> {
    try {
      if (!this.validateTransactionBytes(transactionBytes).isValid) {
        return false;
      }

      const bytes = this.decodeTransactionBytes(transactionBytes);
      Transaction.fromBytes(bytes);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Legacy alias for decodeTransactionBytes - keeping for backward compatibility
   */
  private static decodeBytesLegacy(transactionBytes: string): Uint8Array {
    return this.decodeTransactionBytes(transactionBytes);
  }

  /**
   * Parse transaction bytes into structured data using thin orchestration
   * Delegates to specialized parsers for clean separation of concerns
   */
  private static async parseTransaction(
    transactionBytes: string,
    options: ParseOptions = {},
  ): Promise<ParsedTransaction> {
    try {
      const bytes = this.decodeTransactionBytes(transactionBytes);
      const transaction = Transaction.fromBytes(bytes);
      const metadata = this.extractTransactionMetadataEnhanced(transaction);

      const parserResults = this.runAllParsers(transaction);

      const primaryResult =
        parserResults.find(
          result => result.type && result.type !== 'UNKNOWN',
        ) || {};

      const protoParsingResult = this.parseFromProtobuf(bytes);

      const finalType =
        protoParsingResult.type || primaryResult.type || 'UNKNOWN';
      const finalHumanReadableType =
        protoParsingResult.humanReadableType ||
        primaryResult.humanReadableType ||
        'Unknown Transaction';

      const result: ParsedTransaction = {
        type: finalType,
        humanReadableType: finalHumanReadableType,
        transfers: [],
        tokenTransfers: [],
        details: { ...metadata },
        memo: typeof metadata.memo === 'string' ? metadata.memo : undefined,
        transactionId:
          typeof metadata.transactionId === 'string'
            ? metadata.transactionId
            : undefined,
        nodeAccountIds: Array.isArray(metadata.nodeAccountIds)
          ? metadata.nodeAccountIds
          : [],
        maxTransactionFee:
          typeof metadata.maxTransactionFee === 'string'
            ? metadata.maxTransactionFee
            : undefined,
        validStart:
          typeof metadata.validStart === 'string'
            ? metadata.validStart
            : undefined,
        validDuration:
          typeof metadata.validDuration === 'string'
            ? metadata.validDuration
            : undefined,
        raw: options.includeRaw
          ? ({} as proto.SchedulableTransactionBody)
          : undefined,
      };

      this.mergeAllResults(
        result,
        protoParsingResult,
        primaryResult,
        parserResults,
      );

      return result;
    } catch (error) {
      throw new TransactionParsingError(
        'Failed to parse as regular transaction',
        'REGULAR_PARSING_FAILED',
        error instanceof Error ? error : undefined,
        transactionBytes,
      );
    }
  }

  /**
   * Parse scheduled transaction body
   */
  private static parseScheduledTransaction(
    transactionBytes: string,
    options: ParseOptions = {},
  ): ParsedTransaction {
    try {
      const parsedTx = this.parseTransactionBody(transactionBytes);

      const validation = this.validateTransactionBytes(transactionBytes);

      const enhancedResult: ParsedTransaction = {
        ...parsedTx,
        details: {
          ...(parsedTx.details || {}),
          parseMethod: 'scheduled',
          validation,
          parseAttempts: parsedTx.details?.parseAttempts || 1,
        },
        formatDetection: {
          originalFormat: validation.format || 'base64',
          wasConverted: false,
          length: transactionBytes.length,
        },
      };

      return enhancedResult;
    } catch (error) {
      throw new TransactionParsingError(
        'Failed to parse as scheduled transaction',
        'SCHEDULED_PARSING_FAILED',
        error instanceof Error ? error : undefined,
        transactionBytes,
      );
    }
  }

  /**
   * Extract metadata from Transaction object (legacy method - keeping for backward compatibility)
   */
  private static extractTransactionMetadata(
    transaction: Transaction,
  ): Partial<ParsedTransaction> {
    return {
      transactionId: transaction.transactionId?.toString(),
      nodeAccountIds:
        transaction.nodeAccountIds?.map(id => id.toString()) || [],
      maxTransactionFee:
        transaction.maxTransactionFee?.toTinybars().toString() || '0',
      memo:
        (transaction as unknown as TransactionInternals)._transactionMemo ||
        undefined,
      transfers: [],
      tokenTransfers: [],
    };
  }

  /**
   * Extract enhanced metadata from Transaction object
   */
  private static extractTransactionMetadataEnhanced(
    transaction: Transaction,
  ): Record<string, string | string[] | undefined> {
    return {
      transactionId: transaction.transactionId?.toString(),
      nodeAccountIds:
        transaction.nodeAccountIds?.map(id => id.toString()) || [],
      maxTransactionFee:
        transaction.maxTransactionFee?.toTinybars().toString() || '0',
      memo:
        (transaction as unknown as TransactionInternals)._transactionMemo ||
        undefined,
      validStart: (
        transaction as unknown as TransactionInternals
      )._transactionValidStart?.toString(),
      validDuration: (
        transaction as unknown as TransactionInternals
      )._transactionValidDuration?.toString(),
    };
  }

  /**
   * Run all available parsers on a transaction
   */
  private static runAllParsers(transaction: Transaction): any[] {
    return [
      HTSParser.parseFromTransactionObject(transaction),
      CryptoParser.parseFromTransactionObject(transaction),
      HCSParser.parseFromTransactionObject(transaction),
      FileParser.parseFromTransactionObject(transaction),
      SCSParser.parseFromTransactionObject(transaction),
      ScheduleParser.parseFromTransactionObject(transaction),
      UtilParser.parseFromTransactionObject(transaction),
    ];
  }

  /**
   * Parse transaction from protobuf bytes
   */
  private static parseFromProtobuf(
    bytes: Uint8Array,
  ): Partial<ParsedTransaction> {
    const result: Partial<ParsedTransaction> = {};

    try {
      const decoded = proto.TransactionList.decode(bytes);
      if (decoded.transactionList && decoded.transactionList.length > 0) {
        const tx = decoded.transactionList[0];
        let txBody: proto.TransactionBody | null = null;

        if (tx.bodyBytes && tx.bodyBytes.length > 0) {
          txBody = proto.TransactionBody.decode(tx.bodyBytes);
        } else if (
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
          const typeResult = this.detectTransactionTypeFromBody(txBody);
          result.type = typeResult.type;
          result.humanReadableType = typeResult.humanReadableType;

          const details = this.parseTransactionBodyDetails(
            txBody,
            typeResult.type,
          );
          Object.assign(result, details);
        }
      }
    } catch (error) {}

    return result;
  }

  /**
   * Intelligently merge all parsing results
   */
  private static mergeAllResults(
    result: ParsedTransaction,
    protoResult: Partial<ParsedTransaction>,
    primaryResult: any,
    parserResults: any[],
  ): void {
    const cryptoResult =
      parserResults.find(r => r.transfers || r.tokenTransfers) || {};
    result.transfers = cryptoResult.transfers || result.transfers || [];
    result.tokenTransfers =
      cryptoResult.tokenTransfers || result.tokenTransfers || [];

    Object.keys(protoResult).forEach(key => {
      if (
        protoResult[key as keyof ParsedTransaction] !== undefined &&
        key !== 'type' &&
        key !== 'humanReadableType'
      ) {
        (result as any)[key] = protoResult[key as keyof ParsedTransaction];
      }
    });

    Object.keys(primaryResult).forEach(key => {
      if (
        primaryResult[key] !== undefined &&
        !(key in result) &&
        key !== 'type' &&
        key !== 'humanReadableType'
      ) {
        (result as any)[key] = primaryResult[key];
      }
    });
  }

  /**
   * Apply schedulable transaction parsing using registry pattern
   * Eliminates conditional logic in parseTransactionBody
   */
  private static applySchedulableTransactionParsing(
    txBody: proto.SchedulableTransactionBody,
    result: ParsedTransaction,
  ): void {
    if (txBody.cryptoTransfer) {
      CryptoParser.parseCryptoTransfers(txBody.cryptoTransfer, result);
    }

    if (txBody.cryptoDelete) {
      result.cryptoDelete = CryptoParser.parseCryptoDelete(txBody.cryptoDelete);
    }

    if (txBody.cryptoCreateAccount) {
      result.cryptoCreateAccount = CryptoParser.parseCryptoCreateAccount(
        txBody.cryptoCreateAccount,
      );
    }

    if (txBody.cryptoUpdateAccount) {
      result.cryptoUpdateAccount = CryptoParser.parseCryptoUpdateAccount(
        txBody.cryptoUpdateAccount,
      );
    }

    if (txBody.cryptoApproveAllowance) {
      result.cryptoApproveAllowance = CryptoParser.parseCryptoApproveAllowance(
        txBody.cryptoApproveAllowance,
      );
    }

    if (txBody.cryptoDeleteAllowance) {
      result.cryptoDeleteAllowance = CryptoParser.parseCryptoDeleteAllowance(
        txBody.cryptoDeleteAllowance,
      );
    }

    if (txBody.contractCall) {
      result.contractCall = SCSParser.parseContractCall(txBody.contractCall);
    }

    if (txBody.contractCreateInstance) {
      result.contractCreate = SCSParser.parseContractCreate(
        txBody.contractCreateInstance,
      );
    }

    if (txBody.contractUpdateInstance) {
      result.contractUpdate = SCSParser.parseContractUpdate(
        txBody.contractUpdateInstance,
      );
    }

    if (txBody.contractDeleteInstance) {
      result.contractDelete = SCSParser.parseContractDelete(
        txBody.contractDeleteInstance,
      );
    }

    if (txBody.tokenCreation) {
      result.tokenCreation = HTSParser.parseTokenCreate(txBody.tokenCreation);
    }

    if (txBody.tokenMint) {
      result.tokenMint = HTSParser.parseTokenMint(txBody.tokenMint);
    }

    if (txBody.tokenBurn) {
      result.tokenBurn = HTSParser.parseTokenBurn(txBody.tokenBurn);
    }

    if (txBody.tokenUpdate) {
      result.tokenUpdate = HTSParser.parseTokenUpdate(txBody.tokenUpdate);
    }

    if (txBody.tokenFeeScheduleUpdate) {
      result.tokenFeeScheduleUpdate = HTSParser.parseTokenFeeScheduleUpdate(
        txBody.tokenFeeScheduleUpdate,
      );
    }

    if (txBody.tokenFreeze) {
      result.tokenFreeze = HTSParser.parseTokenFreeze(txBody.tokenFreeze);
    }

    if (txBody.tokenUnfreeze) {
      result.tokenUnfreeze = HTSParser.parseTokenUnfreeze(txBody.tokenUnfreeze);
    }

    if (txBody.tokenGrantKyc) {
      result.tokenGrantKyc = HTSParser.parseTokenGrantKyc(txBody.tokenGrantKyc);
    }

    if (txBody.tokenRevokeKyc) {
      result.tokenRevokeKyc = HTSParser.parseTokenRevokeKyc(
        txBody.tokenRevokeKyc,
      );
    }

    if (txBody.tokenPause) {
      result.tokenPause = HTSParser.parseTokenPause(txBody.tokenPause);
    }

    if (txBody.tokenUnpause) {
      result.tokenUnpause = HTSParser.parseTokenUnpause(txBody.tokenUnpause);
    }

    if (txBody.tokenWipe) {
      result.tokenWipeAccount = HTSParser.parseTokenWipeAccount(
        txBody.tokenWipe,
      );
    }

    if (txBody.tokenDeletion) {
      result.tokenDelete = HTSParser.parseTokenDelete(txBody.tokenDeletion);
    }

    if (txBody.tokenAssociate) {
      result.tokenAssociate = HTSParser.parseTokenAssociate(
        txBody.tokenAssociate,
      );
    }

    if (txBody.tokenDissociate) {
      result.tokenDissociate = HTSParser.parseTokenDissociate(
        txBody.tokenDissociate,
      );
    }

    if (txBody.tokenAirdrop) {
      result.tokenAirdrop = HTSParser.parseTokenAirdropFromProto(
        txBody.tokenAirdrop,
      );
    }

    if (txBody.consensusCreateTopic) {
      result.consensusCreateTopic = HCSParser.parseConsensusCreateTopic(
        txBody.consensusCreateTopic,
      );
    }

    if (txBody.consensusSubmitMessage) {
      result.consensusSubmitMessage = HCSParser.parseConsensusSubmitMessage(
        txBody.consensusSubmitMessage,
      );
    }

    if (txBody.consensusUpdateTopic) {
      result.consensusUpdateTopic = HCSParser.parseConsensusUpdateTopic(
        txBody.consensusUpdateTopic,
      );
    }

    if (txBody.consensusDeleteTopic) {
      result.consensusDeleteTopic = HCSParser.parseConsensusDeleteTopic(
        txBody.consensusDeleteTopic,
      );
    }

    if (txBody.fileCreate) {
      result.fileCreate = FileParser.parseFileCreate(txBody.fileCreate);
    }

    if (txBody.fileAppend) {
      result.fileAppend = FileParser.parseFileAppend(txBody.fileAppend);
    }

    if (txBody.fileUpdate) {
      result.fileUpdate = FileParser.parseFileUpdate(txBody.fileUpdate);
    }

    if (txBody.fileDelete) {
      result.fileDelete = FileParser.parseFileDelete(txBody.fileDelete);
    }

    if (txBody.utilPrng) {
      result.utilPrng = UtilParser.parseUtilPrng(txBody.utilPrng);
    }
  }

  /**
   * Parse transaction body details for all supported transaction types
   * Uses a scalable registry pattern instead of if-else chains
   */
  private static parseTransactionBodyDetails(
    txBody: proto.TransactionBody,
    transactionType: string,
  ): Partial<ParsedTransaction> {
    const result: Partial<ParsedTransaction> = {};

    const parserConfig = transactionParserRegistry[transactionType];
    if (parserConfig) {
      const bodyData = txBody[parserConfig.bodyField];
      if (bodyData) {
        const parserResult = parserConfig.parser(bodyData);

        if (parserConfig.spreadResult) {
          Object.assign(result, parserResult);
        } else {
          result[parserConfig.resultField] = parserResult;
        }
      }
    }

    return result;
  }

  /**
   * Merge protobuf parsing results with parser results using registry pattern
   * Eliminates transactionFields array and forEach logic
   */
  private static mergeProtoParsingResults(
    result: ParsedTransaction,
    protoResult: Partial<ParsedTransaction>,
    htsResult: any,
    transaction: Transaction,
    originalBytes?: Uint8Array,
  ): void {
    const fieldsToMerge = Object.values(transactionParserRegistry).map(
      config => config.resultField as string,
    );

    for (const field of fieldsToMerge) {
      const protoValue = protoResult[field as keyof ParsedTransaction];
      const htsValue = htsResult[field];

      if (protoValue !== undefined) {
        (result as any)[field] = protoValue;
      } else if (htsValue !== undefined) {
        (result as any)[field] = htsValue;
      } else {
        this.handleSpecialFieldExtraction(result, field, transaction);
      }
    }
  }

  /**
   * Handle special field extraction cases using registry pattern
   */
  private static handleSpecialFieldExtraction(
    result: ParsedTransaction,
    field: string,
    transaction: Transaction,
  ): void {
    if (field === 'tokenCreation' && result.type === 'TOKENCREATE') {
      const extracted =
        HTSParser.extractTokenCreationFromTransaction(transaction);
      if (extracted) {
        (result as any)[field] = extracted;
      }
    } else if (field === 'tokenAirdrop' && result.type === 'TOKENAIRDROP') {
      const extracted =
        HTSParser.extractTokenAirdropFromTransaction(transaction);
      if (extracted) {
        (result as any)[field] = extracted;
      }
    }
  }

  /**
   * Create fallback result when all parsing methods fail
   */
  private static createFallbackResult(
    transactionBytes: string,
    primaryError?: Error,
    secondaryError?: Error,
  ): ParsedTransaction {
    const validation = this.validateTransactionBytes(transactionBytes);

    return {
      type: 'UNKNOWN',
      humanReadableType: 'Unknown Transaction',
      transfers: [],
      tokenTransfers: [],
      details: {
        rawBytes:
          transactionBytes.length > 100
            ? transactionBytes.substring(0, 100) + '...'
            : transactionBytes,
        primaryError: primaryError?.message,
        secondaryError: secondaryError?.message,
        parseAttempts: secondaryError ? 2 : 1,
        validation,
      },
      formatDetection: {
        originalFormat: validation.format || 'base64',
        wasConverted: false,
        length: transactionBytes.length,
      },
      raw: {} as proto.SchedulableTransactionBody,
    };
  }
}
