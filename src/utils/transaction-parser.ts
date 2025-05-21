import { proto } from '@hashgraph/proto';
import { Buffer } from 'buffer';
import { Hbar, HbarUnit, Long } from '@hashgraph/sdk';
import { ethers } from 'ethers';
import { TokenAmount, ParsedTransaction } from './transaction-parser-types'; // Import all types
import { HTSParser } from './parsers/hts-parser'; // Import HTSParser
import { HCSParser } from './parsers/hcs-parser'; // Import HCSParser
import { FileParser } from './parsers/file-parser'; // Import FileParser
import { CryptoParser } from './parsers/crypto-parser'; // Import CryptoParser
import { SCSParser } from './parsers/scs-parser'; // Import SCSParser
import { UtilParser } from './parsers/util-parser'; // Import UtilParser

/**
 * Types for transaction parsing results
 */

export class TransactionParser {
  /**
   * Parse a base64 encoded transaction body and return structured data
   * @param transactionBodyBase64 - The base64 encoded transaction body
   * @returns The parsed transaction
   */
  static parseTransactionBody(
    transactionBodyBase64: string
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
          Long.fromValue(txBody.transactionFee)
        );
        result.transactionFee = hbarAmount.toString(HbarUnit.Hbar);
      }

      if (txBody.cryptoTransfer) {
        CryptoParser.parseCryptoTransfers(txBody.cryptoTransfer, result);
      }

      if (txBody.cryptoDelete) {
        result.cryptoDelete = CryptoParser.parseCryptoDelete(
          txBody.cryptoDelete
        );
      }

      if (txBody.cryptoCreateAccount) {
        result.cryptoCreateAccount = CryptoParser.parseCryptoCreateAccount(
          txBody.cryptoCreateAccount
        );
      }

      if (txBody.cryptoUpdateAccount) {
        result.cryptoUpdateAccount = CryptoParser.parseCryptoUpdateAccount(
          txBody.cryptoUpdateAccount
        );
      }

      if (txBody.cryptoApproveAllowance) {
        result.cryptoApproveAllowance =
          CryptoParser.parseCryptoApproveAllowance(
            txBody.cryptoApproveAllowance
          );
      }

      if (txBody.cryptoDeleteAllowance) {
        result.cryptoDeleteAllowance = CryptoParser.parseCryptoDeleteAllowance(
          txBody.cryptoDeleteAllowance
        );
      }

      if (txBody.contractCall) {
        result.contractCall = SCSParser.parseContractCall(txBody.contractCall);
      }

      if (txBody.contractCreateInstance) {
        result.contractCreate = SCSParser.parseContractCreate(
          txBody.contractCreateInstance
        );
      }

      if (txBody.contractUpdateInstance) {
        result.contractUpdate = SCSParser.parseContractUpdate(
          txBody.contractUpdateInstance
        );
      }

      if (txBody.contractDeleteInstance) {
        result.contractDelete = SCSParser.parseContractDelete(
          txBody.contractDeleteInstance
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
          txBody.tokenFeeScheduleUpdate
        );
      }

      if (txBody.tokenFreeze) {
        result.tokenFreeze = HTSParser.parseTokenFreeze(txBody.tokenFreeze);
      }

      if (txBody.tokenUnfreeze) {
        result.tokenUnfreeze = HTSParser.parseTokenUnfreeze(
          txBody.tokenUnfreeze
        );
      }

      if (txBody.tokenGrantKyc) {
        result.tokenGrantKyc = HTSParser.parseTokenGrantKyc(
          txBody.tokenGrantKyc
        );
      }

      if (txBody.tokenRevokeKyc) {
        result.tokenRevokeKyc = HTSParser.parseTokenRevokeKyc(
          txBody.tokenRevokeKyc
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
          txBody.tokenWipe
        );
      }

      if (txBody.tokenDeletion) {
        result.tokenDelete = HTSParser.parseTokenDelete(txBody.tokenDeletion);
      }

      if (txBody.tokenAssociate) {
        result.tokenAssociate = HTSParser.parseTokenAssociate(
          txBody.tokenAssociate
        );
      }

      if (txBody.tokenDissociate) {
        result.tokenDissociate = HTSParser.parseTokenDissociate(
          txBody.tokenDissociate
        );
      }

      if (txBody.consensusCreateTopic) {
        result.consensusCreateTopic = HCSParser.parseConsensusCreateTopic(
          txBody.consensusCreateTopic
        );
      }

      if (txBody.consensusSubmitMessage) {
        result.consensusSubmitMessage = HCSParser.parseConsensusSubmitMessage(
          txBody.consensusSubmitMessage
        );
      }

      if (txBody.consensusUpdateTopic) {
        result.consensusUpdateTopic = HCSParser.parseConsensusUpdateTopic(
          txBody.consensusUpdateTopic
        );
      }

      if (txBody.consensusDeleteTopic) {
        result.consensusDeleteTopic = HCSParser.parseConsensusDeleteTopic(
          txBody.consensusDeleteTopic
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
      throw new Error(
        `Failed to parse transaction body: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
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
      throw new Error('Schedule response missing transaction_body');
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
    txBody: proto.SchedulableTransactionBody
  ): string {
    let transactionType = 'unknown';

    if (txBody.cryptoTransfer) {
      transactionType = 'cryptoTransfer';
    } else if (txBody.cryptoCreateAccount) {
      transactionType = 'cryptoCreateAccount';
    } else if (txBody.cryptoUpdateAccount) {
      transactionType = 'cryptoUpdateAccount';
    } else if (txBody.cryptoApproveAllowance) {
      transactionType = 'cryptoApproveAllowance';
    } else if (txBody.cryptoDeleteAllowance) {
      transactionType = 'cryptoDeleteAllowance';
    } else if (txBody.cryptoDelete) {
      transactionType = 'cryptoDelete';
    } else if (txBody.consensusCreateTopic) {
      transactionType = 'consensusCreateTopic';
    } else if (txBody.consensusUpdateTopic) {
      transactionType = 'consensusUpdateTopic';
    } else if (txBody.consensusSubmitMessage) {
      transactionType = 'consensusSubmitMessage';
    } else if (txBody.consensusDeleteTopic) {
      transactionType = 'consensusDeleteTopic';
    } else if (txBody.fileCreate) {
      transactionType = 'fileCreate';
    } else if (txBody.fileAppend) {
      transactionType = 'fileAppend';
    } else if (txBody.fileUpdate) {
      transactionType = 'fileUpdate';
    } else if (txBody.fileDelete) {
      transactionType = 'fileDelete';
    } else if (txBody.contractCall) {
      transactionType = 'contractCall';
    } else if (txBody.contractCreateInstance) {
      transactionType = 'contractCreate';
    } else if (txBody.contractUpdateInstance) {
      transactionType = 'contractUpdate';
    } else if (txBody.contractDeleteInstance) {
      transactionType = 'contractDelete';
    } else if (txBody.tokenCreation) {
      transactionType = 'tokenCreate';
    } else if (txBody.tokenUpdate) {
      transactionType = 'tokenUpdate';
    } else if (txBody.tokenDeletion) {
      transactionType = 'tokenDelete';
    } else if (txBody.tokenAssociate) {
      transactionType = 'tokenAssociate';
    } else if (txBody.tokenDissociate) {
      transactionType = 'tokenDissociate';
    } else if (txBody.tokenMint) {
      transactionType = 'tokenMint';
    } else if (txBody.tokenBurn) {
      transactionType = 'tokenBurn';
    } else if (txBody.tokenFeeScheduleUpdate) {
      transactionType = 'tokenFeeScheduleUpdate';
    } else if (txBody.tokenFreeze) {
      transactionType = 'tokenFreeze';
    } else if (txBody.tokenUnfreeze) {
      transactionType = 'tokenUnfreeze';
    } else if (txBody.tokenGrantKyc) {
      transactionType = 'tokenGrantKyc';
    } else if (txBody.tokenRevokeKyc) {
      transactionType = 'tokenRevokeKyc';
    } else if (txBody.tokenPause) {
      transactionType = 'tokenPause';
    } else if (txBody.tokenUnpause) {
      transactionType = 'tokenUnpause';
    } else if (txBody.tokenWipe) {
      transactionType = 'tokenWipe';
    } else if (txBody.utilPrng) {
      transactionType = 'utilPrng';
    }

    return transactionType;
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
          ', '
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
              `${transfer.accountId} (${Math.abs(transferAmountValue)})`
            );
          } else if (transferAmountValue > 0) {
            tokenReceivers.push(
              `${transfer.accountId} (${transferAmountValue})`
            );
          }
        }

        if (tokenSenders.length > 0 && tokenReceivers.length > 0) {
          tokenSummaries.push(
            `Transfer of token ${tokenId} from ${tokenSenders.join(
              ', '
            )} to ${tokenReceivers.join(', ')}`
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
          ', '
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
          .filter((t) => t.amount < 0)
          .map((t) => `${t.accountId} (${Math.abs(t.amount)})`);
        const tokenReceivers = transfers
          .filter((t) => t.amount > 0)
          .map((t) => `${t.accountId} (${t.amount})`);
        if (tokenSenders.length > 0 && tokenReceivers.length > 0) {
          tokenSummaries.push(
            `Transfer of token ${tokenId} from ${tokenSenders.join(
              ', '
            )} to ${tokenReceivers.join(', ')}`
          );
        } else if (tokenReceivers.length > 0) {
          tokenSummaries.push(
            `Token ${tokenId} received by ${tokenReceivers.join(', ')}`
          );
        } else if (tokenSenders.length > 0) {
          tokenSummaries.push(
            `Token ${tokenId} sent from ${tokenSenders.join(', ')}`
          );
        }
      }
      if (tokenSummaries.length > 0) return tokenSummaries.join('; ');
    }

    return 'Unknown Transaction';
  }
}
