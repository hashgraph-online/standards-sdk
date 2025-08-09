import { proto } from '@hashgraph/proto';
import { Buffer } from 'buffer';
import { Hbar, HbarUnit, Long, Transaction, AccountId } from '@hashgraph/sdk';
import { ethers } from 'ethers';
import {
  TokenAmount,
  ParsedTransaction,
  ValidationResult,
  ParseOptions,
  TransactionParsingError,
  TokenCreationData,
  TokenAirdropData,
} from './transaction-parser-types';

export { TransactionParsingError } from './transaction-parser-types';
import { HTSParser } from './parsers/hts-parser';
import { HCSParser } from './parsers/hcs-parser';
import { FileParser } from './parsers/file-parser';
import { CryptoParser } from './parsers/crypto-parser';
import { SCSParser } from './parsers/scs-parser';
import { UtilParser } from './parsers/util-parser';
import { ScheduleParser } from './parsers/schedule-parser';

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
    originalBytes?: Uint8Array,
    options: ParseOptions = {},
  ): ParsedTransaction {
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
        raw: options.includeRaw
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
        raw: options.includeRaw
          ? ({} as proto.SchedulableTransactionBody)
          : undefined,
        details: {
          error: `Failed to parse Transaction object: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  /**
   * Parse a base64 encoded transaction body and return structured data (legacy method)
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

      if (txBody.cryptoTransfer) {
        CryptoParser.parseCryptoTransfers(txBody.cryptoTransfer, result);
      }

      if (txBody.cryptoDelete) {
        result.cryptoDelete = CryptoParser.parseCryptoDelete(
          txBody.cryptoDelete,
        );
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
        result.cryptoApproveAllowance =
          CryptoParser.parseCryptoApproveAllowance(
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
        result.tokenUnfreeze = HTSParser.parseTokenUnfreeze(
          txBody.tokenUnfreeze,
        );
      }

      if (txBody.tokenGrantKyc) {
        result.tokenGrantKyc = HTSParser.parseTokenGrantKyc(
          txBody.tokenGrantKyc,
        );
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
   * Centralized method to eliminate duplication across parsing methods
   */
  private static detectTransactionTypeFromBody(
    txBody: proto.ITransactionBody,
  ): {
    type: string;
    humanReadableType: string;
  } {
    if (txBody.tokenCreation) {
      return { type: 'TOKENCREATE', humanReadableType: 'Token Creation' };
    } else if (txBody.tokenAirdrop) {
      return { type: 'TOKENAIRDROP', humanReadableType: 'Token Airdrop' };
    } else if (txBody.cryptoTransfer) {
      return { type: 'CRYPTOTRANSFER', humanReadableType: 'Crypto Transfer' };
    } else if (txBody.consensusSubmitMessage) {
      return {
        type: 'CONSENSUSSUBMITMESSAGE',
        humanReadableType: 'Submit Message',
      };
    } else if (txBody.contractCall) {
      return { type: 'CONTRACTCALL', humanReadableType: 'Contract Call' };
    } else if (txBody.cryptoCreateAccount) {
      return { type: 'ACCOUNTCREATE', humanReadableType: 'Account Creation' };
    } else if (txBody.cryptoUpdateAccount) {
      return { type: 'ACCOUNTUPDATE', humanReadableType: 'Account Update' };
    } else if (txBody.cryptoDelete) {
      return { type: 'ACCOUNTDELETE', humanReadableType: 'Account Deletion' };
    } else if (txBody.cryptoApproveAllowance) {
      return {
        type: 'APPROVEALLOWANCE',
        humanReadableType: 'Approve Allowance',
      };
    } else if (txBody.cryptoDeleteAllowance) {
      return { type: 'DELETEALLOWANCE', humanReadableType: 'Delete Allowance' };
    } else if (txBody.tokenMint) {
      return { type: 'TOKENMINT', humanReadableType: 'Token Mint' };
    } else if (txBody.tokenBurn) {
      return { type: 'TOKENBURN', humanReadableType: 'Token Burn' };
    } else if (txBody.tokenUpdate) {
      return { type: 'TOKENUPDATE', humanReadableType: 'Token Update' };
    } else if (txBody.tokenDeletion) {
      return { type: 'TOKENDELETE', humanReadableType: 'Token Deletion' };
    } else if (txBody.tokenAssociate) {
      return { type: 'TOKENASSOCIATE', humanReadableType: 'Token Association' };
    } else if (txBody.tokenDissociate) {
      return {
        type: 'TOKENDISSOCIATE',
        humanReadableType: 'Token Dissociation',
      };
    } else if (txBody.tokenFreeze) {
      return { type: 'TOKENFREEZE', humanReadableType: 'Token Freeze' };
    } else if (txBody.tokenUnfreeze) {
      return { type: 'TOKENUNFREEZE', humanReadableType: 'Token Unfreeze' };
    } else if (txBody.tokenGrantKyc) {
      return { type: 'TOKENGRANTKYC', humanReadableType: 'Token Grant KYC' };
    } else if (txBody.tokenRevokeKyc) {
      return { type: 'TOKENREVOKEKYC', humanReadableType: 'Token Revoke KYC' };
    } else if (txBody.tokenWipe) {
      return { type: 'TOKENWIPE', humanReadableType: 'Token Wipe' };
    } else if (txBody.tokenPause) {
      return { type: 'TOKENPAUSE', humanReadableType: 'Token Pause' };
    } else if (txBody.tokenUnpause) {
      return { type: 'TOKENUNPAUSE', humanReadableType: 'Token Unpause' };
    } else if (txBody.tokenFeeScheduleUpdate) {
      return {
        type: 'TOKENFEESCHEDULEUPDATE',
        humanReadableType: 'Token Fee Schedule Update',
      };
    } else if (txBody.fileCreate) {
      return { type: 'FILECREATE', humanReadableType: 'File Creation' };
    } else if (txBody.fileUpdate) {
      return { type: 'FILEUPDATE', humanReadableType: 'File Update' };
    } else if (txBody.fileDelete) {
      return { type: 'FILEDELETE', humanReadableType: 'File Deletion' };
    } else if (txBody.fileAppend) {
      return { type: 'FILEAPPEND', humanReadableType: 'File Append' };
    } else if (txBody.consensusCreateTopic) {
      return { type: 'TOPICCREATE', humanReadableType: 'Topic Creation' };
    } else if (txBody.consensusUpdateTopic) {
      return { type: 'TOPICUPDATE', humanReadableType: 'Topic Update' };
    } else if (txBody.consensusDeleteTopic) {
      return { type: 'TOPICDELETE', humanReadableType: 'Topic Deletion' };
    } else if (txBody.contractCreateInstance) {
      return { type: 'CONTRACTCREATE', humanReadableType: 'Contract Creation' };
    } else if (txBody.contractUpdateInstance) {
      return { type: 'CONTRACTUPDATE', humanReadableType: 'Contract Update' };
    } else if (txBody.contractDeleteInstance) {
      return { type: 'CONTRACTDELETE', humanReadableType: 'Contract Deletion' };
    } else if (txBody.scheduleCreate) {
      return { type: 'SCHEDULECREATE', humanReadableType: 'Schedule Creation' };
    } else if (txBody.scheduleSign) {
      return { type: 'SCHEDULESIGN', humanReadableType: 'Schedule Sign' };
    } else if (txBody.scheduleDelete) {
      return { type: 'SCHEDULEDELETE', humanReadableType: 'Schedule Deletion' };
    } else if (txBody.utilPrng) {
      return { type: 'PRNG', humanReadableType: 'Pseudo Random Number' };
    } else if (txBody.freeze) {
      return { type: 'FREEZE', humanReadableType: 'Network Freeze' };
    } else if (txBody.systemDelete) {
      return { type: 'SYSTEMDELETE', humanReadableType: 'System Delete' };
    } else if (txBody.systemUndelete) {
      return { type: 'SYSTEMUNDELETE', humanReadableType: 'System Undelete' };
    } else {
      return { type: 'UNKNOWN', humanReadableType: 'Unknown Transaction' };
    }
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
   * Determine the transaction type
   * @param txBody - The transaction body to determine the type of
   * @returns The type of the transaction
   */
  private static getTransactionType(
    txBody: proto.SchedulableTransactionBody,
  ): string {
    if (txBody.tokenCreation) return 'tokenCreate';
    if (txBody.tokenAirdrop) return 'tokenAirdrop';
    if (txBody.cryptoTransfer) return 'cryptoTransfer';
    if (txBody.consensusSubmitMessage) return 'consensusSubmitMessage';
    if (txBody.contractCall) return 'contractCall';
    if (txBody.cryptoCreateAccount) return 'cryptoCreateAccount';
    if (txBody.cryptoUpdateAccount) return 'cryptoUpdateAccount';
    if (txBody.cryptoApproveAllowance) return 'cryptoApproveAllowance';
    if (txBody.cryptoDeleteAllowance) return 'cryptoDeleteAllowance';
    if (txBody.cryptoDelete) return 'cryptoDelete';
    if (txBody.consensusCreateTopic) return 'consensusCreateTopic';
    if (txBody.consensusUpdateTopic) return 'consensusUpdateTopic';
    if (txBody.consensusDeleteTopic) return 'consensusDeleteTopic';
    if (txBody.fileCreate) return 'fileCreate';
    if (txBody.fileAppend) return 'fileAppend';
    if (txBody.fileUpdate) return 'fileUpdate';
    if (txBody.fileDelete) return 'fileDelete';
    if (txBody.contractCreateInstance) return 'contractCreate';
    if (txBody.contractUpdateInstance) return 'contractUpdate';
    if (txBody.contractDeleteInstance) return 'contractDelete';
    if (txBody.tokenUpdate) return 'tokenUpdate';
    if (txBody.tokenDeletion) return 'tokenDelete';
    if (txBody.tokenAssociate) return 'tokenAssociate';
    if (txBody.tokenDissociate) return 'tokenDissociate';
    if (txBody.tokenMint) return 'tokenMint';
    if (txBody.tokenBurn) return 'tokenBurn';
    if (txBody.tokenFeeScheduleUpdate) return 'tokenFeeScheduleUpdate';
    if (txBody.tokenFreeze) return 'tokenFreeze';
    if (txBody.tokenUnfreeze) return 'tokenUnfreeze';
    if (txBody.tokenGrantKyc) return 'tokenGrantKyc';
    if (txBody.tokenRevokeKyc) return 'tokenRevokeKyc';
    if (txBody.tokenPause) return 'tokenPause';
    if (txBody.tokenUnpause) return 'tokenUnpause';
    if (txBody.tokenWipe) return 'tokenWipe';
    if (txBody.utilPrng) return 'utilPrng';
    return 'unknown';
  }

  /**
   * Convert technical transaction type to human-readable format
   * @param type - The technical transaction type
   * @returns The human-readable transaction type
   */
  private static getHumanReadableType(type: string): string {
    const typeMap: Record<string, string> = {
      cryptoTransfer: 'HBAR Transfer',
      cryptoCreateAccount: 'Create Account',
      cryptoUpdateAccount: 'Update Account',
      cryptoDeleteAccount: 'Delete Account',
      cryptoApproveAllowance: 'Approve Allowance',
      cryptoDeleteAllowance: 'Delete Allowance',
      cryptoDelete: 'Delete Account',

      consensusCreateTopic: 'Create Topic',
      consensusUpdateTopic: 'Update Topic',
      consensusSubmitMessage: 'Submit Message',
      consensusDeleteTopic: 'Delete Topic',

      fileCreate: 'Create File',
      fileAppend: 'Append File',
      fileUpdate: 'Update File',
      fileDelete: 'Delete File',

      contractCall: 'Contract Call',
      contractCreate: 'Create Contract',
      contractUpdate: 'Update Contract',
      contractDelete: 'Delete Contract',
      ethereumTransaction: 'Ethereum Transaction',

      tokenCreate: 'Create Token',
      TOKENCREATE: 'Create Token',
      tokenUpdate: 'Update Token',
      tokenDelete: 'Delete Token',
      tokenAssociate: 'Associate Token',
      tokenDissociate: 'Dissociate Token',
      tokenMint: 'Mint Token',
      tokenBurn: 'Burn Token',
      tokenFeeScheduleUpdate: 'Update Token Fee Schedule',
      tokenFreeze: 'Freeze Token',
      tokenUnfreeze: 'Unfreeze Token',
      tokenGrantKyc: 'Grant KYC',
      tokenRevokeKyc: 'Revoke KYC',
      tokenPause: 'Pause Token',
      tokenUnpause: 'Unpause Token',
      tokenWipe: 'Wipe Token',
      tokenAirdrop: 'Token Airdrop',

      scheduleCreate: 'Create Schedule',
      scheduleSign: 'Sign Schedule',

      utilPrng: 'Generate Random Number',

      unknown: 'Unknown Transaction',
    };

    let result: string;
    if (typeMap[type]) {
      result = typeMap[type];
    } else {
      result = 'Unknown Transaction';
    }

    return result;
  }

  /**
   * Get a human-readable summary of the transaction
   * @param parsedTx - The parsed transaction
   * @returns The human-readable summary of the transaction
   */
  static getTransactionSummary(parsedTx: ParsedTransaction): string {
    if (parsedTx.type === 'cryptoTransfer') {
      const senders = [];
      const receivers = [];

      for (const transfer of parsedTx.transfers) {
        const originalAmountFloat = parseFloat(transfer.amount);

        let displayStr = transfer.amount;
        if (displayStr.startsWith('-')) {
          displayStr = displayStr.substring(1);
        }
        displayStr = displayStr.replace(/\s*ℏ$/, '');

        if (originalAmountFloat < 0) {
          senders.push(`${transfer.accountId} (${displayStr} ℏ)`);
        } else if (originalAmountFloat > 0) {
          receivers.push(`${transfer.accountId} (${displayStr} ℏ)`);
        }
      }

      if (senders.length > 0 && receivers.length > 0) {
        return `Transfer of HBAR from ${senders.join(', ')} to ${receivers.join(
          ', ',
        )}`;
      } else {
        return parsedTx.humanReadableType;
      }
    } else if (parsedTx.contractCall) {
      let contractCallSummary = `Contract call to ${parsedTx.contractCall.contractId} with ${parsedTx.contractCall.gas} gas`;

      if (parsedTx.contractCall.amount > 0) {
        contractCallSummary += ` and ${parsedTx.contractCall.amount} HBAR`;
      }

      if (parsedTx.contractCall.functionName) {
        contractCallSummary += ` calling function ${parsedTx.contractCall.functionName}`;
      }

      return contractCallSummary;
    } else if (parsedTx.tokenMint) {
      return `Mint ${parsedTx.tokenMint.amount} tokens for token ${parsedTx.tokenMint.tokenId}`;
    } else if (parsedTx.tokenBurn) {
      return `Burn ${parsedTx.tokenBurn.amount} tokens for token ${parsedTx.tokenBurn.tokenId}`;
    } else if (parsedTx.tokenCreation) {
      let summary = `Create token ${
        parsedTx.tokenCreation.tokenName || '(No Name)'
      } (${parsedTx.tokenCreation.tokenSymbol || '(No Symbol)'})`;
      if (parsedTx.tokenCreation.initialSupply) {
        summary += ` with initial supply ${parsedTx.tokenCreation.initialSupply}`;
      }
      if (parsedTx.tokenCreation.customFees?.length) {
        summary += ` including ${parsedTx.tokenCreation.customFees.length} custom fee(s)`;
      }
      return summary;
    } else if (parsedTx.tokenTransfers.length > 0) {
      const tokenGroups: Record<string, TokenAmount[]> = {};

      for (const transfer of parsedTx.tokenTransfers) {
        if (!tokenGroups[transfer.tokenId]) {
          tokenGroups[transfer.tokenId] = [];
        }
        tokenGroups[transfer.tokenId].push(transfer);
      }

      const tokenSummaries = [];

      for (const [tokenId, transfers] of Object.entries(tokenGroups)) {
        const tokenSenders = [];
        const tokenReceivers = [];

        for (const transfer of transfers) {
          const transferAmountValue = parseFloat(transfer.amount.toString());
          if (transferAmountValue < 0) {
            tokenSenders.push(
              `${transfer.accountId} (${Math.abs(transferAmountValue)})`,
            );
          } else if (transferAmountValue > 0) {
            tokenReceivers.push(
              `${transfer.accountId} (${transferAmountValue})`,
            );
          }
        }

        if (tokenSenders.length > 0 && tokenReceivers.length > 0) {
          tokenSummaries.push(
            `Transfer of token ${tokenId} from ${tokenSenders.join(
              ', ',
            )} to ${tokenReceivers.join(', ')}`,
          );
        }
      }

      if (tokenSummaries.length > 0) {
        return tokenSummaries.join('; ');
      } else {
        return parsedTx.humanReadableType;
      }
    } else if (parsedTx.consensusCreateTopic) {
      let summary = `Create new topic`;
      if (parsedTx.consensusCreateTopic.memo) {
        summary += ` with memo "${parsedTx.consensusCreateTopic.memo}"`;
      }
      if (parsedTx.consensusCreateTopic.autoRenewAccountId) {
        summary += `, auto-renew by ${parsedTx.consensusCreateTopic.autoRenewAccountId}`;
      }
      return summary;
    } else if (parsedTx.consensusSubmitMessage) {
      let summary = `Submit message`;
      if (parsedTx.consensusSubmitMessage.topicId) {
        summary += ` to topic ${parsedTx.consensusSubmitMessage.topicId}`;
      }
      if (parsedTx.consensusSubmitMessage.message) {
        if (parsedTx.consensusSubmitMessage.messageEncoding === 'utf8') {
          const messagePreview =
            parsedTx.consensusSubmitMessage.message.substring(0, 70);
          summary += `: "${messagePreview}${
            parsedTx.consensusSubmitMessage.message.length > 70 ? '...' : ''
          }"`;
        } else {
          summary += ` (binary message data, length: ${
            Buffer.from(parsedTx.consensusSubmitMessage.message, 'base64')
              .length
          } bytes)`;
        }
      }
      if (
        parsedTx.consensusSubmitMessage.chunkInfoNumber &&
        parsedTx.consensusSubmitMessage.chunkInfoTotal
      ) {
        summary += ` (chunk ${parsedTx.consensusSubmitMessage.chunkInfoNumber}/${parsedTx.consensusSubmitMessage.chunkInfoTotal})`;
      }
      return summary;
    } else if (parsedTx.fileCreate) {
      let summary = 'Create File';
      if (parsedTx.fileCreate.memo) {
        summary += ` with memo "${parsedTx.fileCreate.memo}"`;
      }
      if (parsedTx.fileCreate.contents) {
        summary += ` (includes content)`;
      }
      return summary;
    } else if (parsedTx.fileAppend) {
      return `Append to File ${parsedTx.fileAppend.fileId || '(Unknown ID)'}`;
    } else if (parsedTx.fileUpdate) {
      return `Update File ${parsedTx.fileUpdate.fileId || '(Unknown ID)'}`;
    } else if (parsedTx.fileDelete) {
      return `Delete File ${parsedTx.fileDelete.fileId || '(Unknown ID)'}`;
    } else if (parsedTx.consensusUpdateTopic) {
      return `Update Topic ${
        parsedTx.consensusUpdateTopic.topicId || '(Unknown ID)'
      }`;
    } else if (parsedTx.consensusDeleteTopic) {
      return `Delete Topic ${
        parsedTx.consensusDeleteTopic.topicId || '(Unknown ID)'
      }`;
    } else if (parsedTx.tokenUpdate) {
      return `Update Token ${parsedTx.tokenUpdate.tokenId || '(Unknown ID)'}`;
    } else if (parsedTx.tokenFeeScheduleUpdate) {
      return `Update Fee Schedule for Token ${
        parsedTx.tokenFeeScheduleUpdate.tokenId || '(Unknown ID)'
      }`;
    } else if (parsedTx.utilPrng) {
      let summary = 'Generate Random Number';
      if (parsedTx.utilPrng.range && parsedTx.utilPrng.range > 0) {
        summary += ` (range up to ${parsedTx.utilPrng.range - 1})`;
      }
      return summary;
    } else if (parsedTx.tokenFreeze) {
      return `Freeze Token ${parsedTx.tokenFreeze.tokenId} for Account ${parsedTx.tokenFreeze.accountId}`;
    } else if (parsedTx.tokenUnfreeze) {
      return `Unfreeze Token ${parsedTx.tokenUnfreeze.tokenId} for Account ${parsedTx.tokenUnfreeze.accountId}`;
    } else if (parsedTx.tokenGrantKyc) {
      return `Grant KYC for Token ${parsedTx.tokenGrantKyc.tokenId} to Account ${parsedTx.tokenGrantKyc.accountId}`;
    } else if (parsedTx.tokenRevokeKyc) {
      return `Revoke KYC for Token ${parsedTx.tokenRevokeKyc.tokenId} from Account ${parsedTx.tokenRevokeKyc.accountId}`;
    } else if (parsedTx.tokenPause) {
      return `Pause Token ${parsedTx.tokenPause.tokenId}`;
    } else if (parsedTx.tokenUnpause) {
      return `Unpause Token ${parsedTx.tokenUnpause.tokenId}`;
    } else if (parsedTx.tokenWipeAccount) {
      let summary = `Wipe Token ${parsedTx.tokenWipeAccount.tokenId} from Account ${parsedTx.tokenWipeAccount.accountId}`;
      if (parsedTx.tokenWipeAccount.serialNumbers?.length) {
        summary += ` (Serials: ${parsedTx.tokenWipeAccount.serialNumbers.join(
          ', ',
        )})`;
      }
      if (parsedTx.tokenWipeAccount.amount) {
        summary += ` (Amount: ${parsedTx.tokenWipeAccount.amount})`;
      }
      return summary;
    } else if (parsedTx.tokenDelete) {
      return `Delete Token ${parsedTx.tokenDelete.tokenId}`;
    } else if (parsedTx.tokenAssociate) {
      return `Associate Account ${
        parsedTx.tokenAssociate.accountId
      } with Tokens: ${parsedTx.tokenAssociate.tokenIds?.join(', ')}`;
    } else if (parsedTx.tokenDissociate) {
      return `Dissociate Account ${
        parsedTx.tokenDissociate.accountId
      } from Tokens: ${parsedTx.tokenDissociate.tokenIds?.join(', ')}`;
    } else if (parsedTx.cryptoDelete) {
      return `Delete Account ${parsedTx.cryptoDelete.deleteAccountId}`;
    }
    if (parsedTx.cryptoCreateAccount) {
      let summary = 'Create Account';
      if (
        parsedTx.cryptoCreateAccount.initialBalance &&
        parsedTx.cryptoCreateAccount.initialBalance !== '0'
      ) {
        summary += ` with balance ${parsedTx.cryptoCreateAccount.initialBalance}`;
      }
      if (parsedTx.cryptoCreateAccount.alias) {
        summary += ` (Alias: ${parsedTx.cryptoCreateAccount.alias})`;
      }
      return summary;
    }
    if (parsedTx.cryptoUpdateAccount) {
      return `Update Account ${
        parsedTx.cryptoUpdateAccount.accountIdToUpdate || '(Unknown ID)'
      }`;
    }
    if (parsedTx.cryptoApproveAllowance) {
      let count =
        (parsedTx.cryptoApproveAllowance.hbarAllowances?.length || 0) +
        (parsedTx.cryptoApproveAllowance.tokenAllowances?.length || 0) +
        (parsedTx.cryptoApproveAllowance.nftAllowances?.length || 0);
      return `Approve ${count} Crypto Allowance(s)`;
    }
    if (parsedTx.cryptoDeleteAllowance) {
      return `Delete ${
        parsedTx.cryptoDeleteAllowance.nftAllowancesToRemove?.length || 0
      } NFT Crypto Allowance(s)`;
    }
    if (parsedTx.contractCreate) {
      let summary = 'Create Contract';
      if (parsedTx.contractCreate.memo) {
        summary += ` (Memo: ${parsedTx.contractCreate.memo})`;
      }
      return summary;
    }
    if (parsedTx.contractUpdate) {
      return `Update Contract ${
        parsedTx.contractUpdate.contractIdToUpdate || '(Unknown ID)'
      }`;
    }
    if (parsedTx.contractDelete) {
      let summary = `Delete Contract ${
        parsedTx.contractDelete.contractIdToDelete || '(Unknown ID)'
      }`;
      if (parsedTx.contractDelete.transferAccountId) {
        summary += ` (Transfer to Account: ${parsedTx.contractDelete.transferAccountId})`;
      } else if (parsedTx.contractDelete.transferContractId) {
        summary += ` (Transfer to Contract: ${parsedTx.contractDelete.transferContractId})`;
      }
      return summary;
    }
    if (
      parsedTx.humanReadableType &&
      parsedTx.humanReadableType !== 'Unknown Transaction'
    ) {
      return parsedTx.humanReadableType;
    }
    if (parsedTx.tokenTransfers.length > 0) {
      const tokenGroups: Record<string, TokenAmount[]> = {};
      for (const transfer of parsedTx.tokenTransfers) {
        if (!tokenGroups[transfer.tokenId]) {
          tokenGroups[transfer.tokenId] = [];
        }
        tokenGroups[transfer.tokenId].push(transfer);
      }
      const tokenSummaries = [];
      for (const [tokenId, transfers] of Object.entries(tokenGroups)) {
        const tokenSenders = transfers
          .filter(t => t.amount < 0)
          .map(t => `${t.accountId} (${Math.abs(t.amount)})`);
        const tokenReceivers = transfers
          .filter(t => t.amount > 0)
          .map(t => `${t.accountId} (${t.amount})`);
        if (tokenSenders.length > 0 && tokenReceivers.length > 0) {
          tokenSummaries.push(
            `Transfer of token ${tokenId} from ${tokenSenders.join(
              ', ',
            )} to ${tokenReceivers.join(', ')}`,
          );
        } else if (tokenReceivers.length > 0) {
          tokenSummaries.push(
            `Token ${tokenId} received by ${tokenReceivers.join(', ')}`,
          );
        } else if (tokenSenders.length > 0) {
          tokenSummaries.push(
            `Token ${tokenId} sent from ${tokenSenders.join(', ')}`,
          );
        }
      }
      if (tokenSummaries.length > 0) return tokenSummaries.join('; ');
    }

    return 'Unknown Transaction';
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

      let transactionType = 'UNKNOWN';
      let humanReadableType = 'Unknown Transaction';
      let parsedTokenCreation: TokenCreationData | undefined;

      try {
        const decoded = proto.TransactionList.decode(bytes);
        if (decoded.transactionList && decoded.transactionList.length > 0) {
          const tx = decoded.transactionList[0];

          if (tx.bodyBytes && tx.bodyBytes.length > 0) {
            const txBody = proto.TransactionBody.decode(tx.bodyBytes);
            const typeResult = this.detectTransactionTypeFromBody(txBody);
            transactionType = typeResult.type;
            humanReadableType = typeResult.humanReadableType;

            const protoParsingResult = this.parseTransactionBodyDetails(
              txBody,
              transactionType,
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
              transactionType = typeResult.type;
              humanReadableType = typeResult.humanReadableType;

              const protoParsingResult = this.parseTransactionBodyDetails(
                txBody,
                transactionType,
              );
              if (protoParsingResult.tokenCreation) {
                parsedTokenCreation = protoParsingResult.tokenCreation;
              }
            }
          }
        }
      } catch (protoError) {}

      if (transactionType === 'UNKNOWN' && primaryResult.type) {
        transactionType = primaryResult.type;
        humanReadableType =
          primaryResult.humanReadableType || 'Unknown Transaction';
      }

      const result: ParsedTransaction = {
        type: transactionType,
        humanReadableType,
        transfers: cryptoResult.transfers || [],
        tokenTransfers: cryptoResult.tokenTransfers || [],
        details: {
          ...metadata,
        },
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
        ...primaryResult,
        raw: options.includeRaw
          ? ({} as proto.SchedulableTransactionBody)
          : undefined,
      };

      if (transactionType === 'TOKENCREATE') {
        const tokenCreationData =
          parsedTokenCreation ||
          htsResult.tokenCreation ||
          HTSParser.extractTokenCreationFromTransaction(transaction);
        if (tokenCreationData) {
          result.tokenCreation = tokenCreationData;
        }
      }

      if (htsResult.tokenAirdrop && !result.tokenAirdrop) {
        result.tokenAirdrop = htsResult.tokenAirdrop;
      }

      if (transactionType === 'TOKENAIRDROP' && !result.tokenAirdrop) {
        try {
          const buffer = Buffer.from(transactionBytes, 'base64');
          const decoded = proto.TransactionList.decode(buffer);

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

            if (txBody && txBody.tokenAirdrop) {
              const parsedAirdrop = HTSParser.parseTokenAirdropFromProto(
                txBody.tokenAirdrop,
              );
              if (parsedAirdrop) {
                result.tokenAirdrop = parsedAirdrop;
              }
            }
          }
        } catch (error) {}
      }

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
   * Parse transaction body details for all supported transaction types
   * This is the DRY, unified approach that delegates to appropriate parsers
   */
  private static parseTransactionBodyDetails(
    txBody: proto.TransactionBody,
    transactionType: string,
  ): Partial<ParsedTransaction> {
    const result: Partial<ParsedTransaction> = {};

    if (txBody.tokenCreation && transactionType === 'TOKENCREATE') {
      result.tokenCreation = HTSParser.parseTokenCreate(txBody.tokenCreation);
    } else if (txBody.tokenMint && transactionType === 'TOKENMINT') {
      result.tokenMint = HTSParser.parseTokenMint(txBody.tokenMint);
    } else if (txBody.tokenBurn && transactionType === 'TOKENBURN') {
      result.tokenBurn = HTSParser.parseTokenBurn(txBody.tokenBurn);
    } else if (txBody.tokenUpdate && transactionType === 'TOKENUPDATE') {
      result.tokenUpdate = HTSParser.parseTokenUpdate(txBody.tokenUpdate);
    } else if (txBody.tokenDeletion && transactionType === 'TOKENDELETE') {
      result.tokenDelete = HTSParser.parseTokenDelete(txBody.tokenDeletion);
    } else if (txBody.tokenAssociate && transactionType === 'TOKENASSOCIATE') {
      result.tokenAssociate = HTSParser.parseTokenAssociate(
        txBody.tokenAssociate,
      );
    } else if (
      txBody.tokenDissociate &&
      transactionType === 'TOKENDISSOCIATE'
    ) {
      result.tokenDissociate = HTSParser.parseTokenDissociate(
        txBody.tokenDissociate,
      );
    } else if (txBody.tokenFreeze && transactionType === 'TOKENFREEZE') {
      result.tokenFreeze = HTSParser.parseTokenFreeze(txBody.tokenFreeze);
    } else if (txBody.tokenUnfreeze && transactionType === 'TOKENUNFREEZE') {
      result.tokenUnfreeze = HTSParser.parseTokenUnfreeze(txBody.tokenUnfreeze);
    } else if (txBody.tokenGrantKyc && transactionType === 'TOKENGRANTKYC') {
      result.tokenGrantKyc = HTSParser.parseTokenGrantKyc(txBody.tokenGrantKyc);
    } else if (txBody.tokenRevokeKyc && transactionType === 'TOKENREVOKEKYC') {
      result.tokenRevokeKyc = HTSParser.parseTokenRevokeKyc(
        txBody.tokenRevokeKyc,
      );
    } else if (txBody.tokenPause && transactionType === 'TOKENPAUSE') {
      result.tokenPause = HTSParser.parseTokenPause(txBody.tokenPause);
    } else if (txBody.tokenUnpause && transactionType === 'TOKENUNPAUSE') {
      result.tokenUnpause = HTSParser.parseTokenUnpause(txBody.tokenUnpause);
    } else if (txBody.tokenWipe && transactionType === 'TOKENWIPEACCOUNT') {
      result.tokenWipeAccount = HTSParser.parseTokenWipeAccount(
        txBody.tokenWipe,
      );
    } else if (
      txBody.tokenFeeScheduleUpdate &&
      transactionType === 'TOKENFEESCHEDULEUPDATE'
    ) {
      result.tokenFeeScheduleUpdate = HTSParser.parseTokenFeeScheduleUpdate(
        txBody.tokenFeeScheduleUpdate,
      );
    } else if (txBody.tokenAirdrop && transactionType === 'TOKENAIRDROP') {
      result.tokenAirdrop = HTSParser.parseTokenAirdropFromProto(
        txBody.tokenAirdrop,
      );
    }

    return result;
  }

  /**
   * Merge protobuf parsing results with parser results using unified prioritization
   */
  private static mergeProtoParsingResults(
    result: ParsedTransaction,
    protoResult: Partial<ParsedTransaction>,
    htsResult: any,
    transaction: Transaction,
    originalBytes?: Uint8Array,
  ): void {
    const transactionFields: Array<
      keyof Pick<
        ParsedTransaction,
        | 'tokenCreation'
        | 'tokenMint'
        | 'tokenBurn'
        | 'tokenUpdate'
        | 'tokenDelete'
        | 'tokenAssociate'
        | 'tokenDissociate'
        | 'tokenFreeze'
        | 'tokenUnfreeze'
        | 'tokenGrantKyc'
        | 'tokenRevokeKyc'
        | 'tokenPause'
        | 'tokenUnpause'
        | 'tokenWipeAccount'
        | 'tokenFeeScheduleUpdate'
        | 'tokenAirdrop'
      >
    > = [
      'tokenCreation',
      'tokenMint',
      'tokenBurn',
      'tokenUpdate',
      'tokenDelete',
      'tokenAssociate',
      'tokenDissociate',
      'tokenFreeze',
      'tokenUnfreeze',
      'tokenGrantKyc',
      'tokenRevokeKyc',
      'tokenPause',
      'tokenUnpause',
      'tokenWipeAccount',
      'tokenFeeScheduleUpdate',
      'tokenAirdrop',
    ];

    transactionFields.forEach(field => {
      const protoValue = protoResult[field];
      const htsValue = (htsResult as Partial<ParsedTransaction>)[field];

      if (protoValue !== undefined) {
        (result as Partial<ParsedTransaction>)[field] = protoValue as any;
      } else if (htsValue !== undefined) {
        (result as Partial<ParsedTransaction>)[field] = htsValue as any;
      } else if (field === 'tokenCreation' && result.type === 'TOKENCREATE') {
        const extracted =
          HTSParser.extractTokenCreationFromTransaction(transaction);
        if (extracted) {
          (result as Partial<ParsedTransaction>)[field] = extracted as any;
        }
      } else if (field === 'tokenAirdrop' && result.type === 'TOKENAIRDROP') {
        const extracted =
          HTSParser.extractTokenAirdropFromTransaction(transaction);
        if (extracted) {
          (result as Partial<ParsedTransaction>)[field] = extracted as any;
        }
      }
    });
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
