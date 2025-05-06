import { proto } from '@hashgraph/proto';
import { Buffer } from 'buffer';
import {
  AccountId,
  ContractId,
  TokenId,
  Hbar,
  HbarUnit,
  Long,
} from '@hashgraph/sdk';
import { ethers } from 'ethers';

/**
 * Types for transaction parsing results
 */
export type AccountAmount = {
  accountId: string;
  amount: number;
  isDecimal?: boolean;
};

export type TokenAmount = {
  tokenId: string;
  accountId: string;
  amount: number;
};

export type ContractCallData = {
  contractId: string;
  gas: number;
  amount: number;
  functionParameters?: string;
  functionName?: string;
};

export type TokenMintData = {
  tokenId: string;
  amount: number;
  metadata?: string[];
};

export type TokenBurnData = {
  tokenId: string;
  amount: number;
  serialNumbers?: number[];
};

export type ParsedTransaction = {
  type: string;
  humanReadableType: string;
  transfers: AccountAmount[];
  tokenTransfers: TokenAmount[];
  memo?: string;
  transactionFee?: number;
  contractCall?: ContractCallData;
  tokenMint?: TokenMintData;
  tokenBurn?: TokenBurnData;
  raw: proto.SchedulableTransactionBody;
};

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
        result.transactionFee = parseFloat(hbarAmount.toString(HbarUnit.Hbar));
      }

      if (txBody.cryptoTransfer) {
        this.parseCryptoTransfers(txBody.cryptoTransfer, result);
      }

      if (txBody.contractCall) {
        this.parseContractCall(txBody.contractCall, result);
      }

      if (txBody.tokenMint) {
        this.parseTokenMint(txBody.tokenMint, result);
      }

      if (txBody.tokenBurn) {
        this.parseTokenBurn(txBody.tokenBurn, result);
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to parse transaction body: ${error}`);
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
    } else if (txBody.scheduleDelete) {
      transactionType = 'scheduleDelete';
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
      scheduleDelete: 'Delete Schedule',
      scheduleSign: 'Sign Schedule',

      systemDelete: 'System Delete',
      systemUndelete: 'System Undelete',

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
   * Parse crypto transfers from the transaction
   * @param cryptoTransfer - The crypto transfer transaction body
   * @param result - The parsed transaction
   */
  private static parseCryptoTransfers(
    cryptoTransfer: proto.ICryptoTransferTransactionBody,
    result: ParsedTransaction
  ): void {
    if (cryptoTransfer.transfers) {
      if (cryptoTransfer.transfers.accountAmounts) {
        result.transfers = cryptoTransfer.transfers.accountAmounts.map(
          (amount) => {
            const shard = amount.accountID?.shardNum
              ? Long.fromValue(amount.accountID.shardNum).toNumber()
              : 0;
            const realm = amount.accountID?.realmNum
              ? Long.fromValue(amount.accountID.realmNum).toNumber()
              : 0;
            const accountNum = amount.accountID?.accountNum
              ? Long.fromValue(amount.accountID.accountNum).toNumber()
              : 0;

            const accountId = AccountId.fromString(
              `${shard}.${realm}.${accountNum}`
            );

            const hbarValue = amount.amount
              ? Long.fromValue(amount.amount)
              : Long.ZERO;
            const hbarAmount = Hbar.fromTinybars(hbarValue);

            return {
              accountId: accountId.toString(),
              amount: parseFloat(hbarAmount.toString(HbarUnit.Hbar)),
              isDecimal: true,
            };
          }
        );
      }
    }

    if (cryptoTransfer.tokenTransfers) {
      for (const tokenTransfer of cryptoTransfer.tokenTransfers) {
        const shard = tokenTransfer.token?.shardNum
          ? Long.fromValue(tokenTransfer.token.shardNum).toNumber()
          : 0;
        const realm = tokenTransfer.token?.realmNum
          ? Long.fromValue(tokenTransfer.token.realmNum).toNumber()
          : 0;
        const tokenNum = tokenTransfer.token?.tokenNum
          ? Long.fromValue(tokenTransfer.token.tokenNum).toNumber()
          : 0;

        const tokenId = TokenId.fromString(`${shard}.${realm}.${tokenNum}`);

        if (tokenTransfer.transfers) {
          for (const transfer of tokenTransfer.transfers) {
            const accShard = transfer.accountID?.shardNum
              ? Long.fromValue(transfer.accountID.shardNum).toNumber()
              : 0;
            const accRealm = transfer.accountID?.realmNum
              ? Long.fromValue(transfer.accountID.realmNum).toNumber()
              : 0;
            const accNum = transfer.accountID?.accountNum
              ? Long.fromValue(transfer.accountID.accountNum).toNumber()
              : 0;

            const accountId = AccountId.fromString(
              `${accShard}.${accRealm}.${accNum}`
            );

            const tokenAmount = transfer.amount
              ? Long.fromValue(transfer.amount).toNumber()
              : 0;

            result.tokenTransfers.push({
              tokenId: tokenId.toString(),
              accountId: accountId.toString(),
              amount: tokenAmount,
            });
          }
        }
      }
    }
  }

  /**
   * Parse contract call transaction data
   * @param contractCall - The contract call transaction body
   * @param result - The parsed transaction
   */
  private static parseContractCall(
    contractCall: proto.IContractCallTransactionBody,
    result: ParsedTransaction
  ): void {
    if (contractCall) {
      const shard = contractCall.contractID?.shardNum
        ? Long.fromValue(contractCall.contractID.shardNum).toNumber()
        : 0;
      const realm = contractCall.contractID?.realmNum
        ? Long.fromValue(contractCall.contractID.realmNum).toNumber()
        : 0;
      const contractNum = contractCall.contractID?.contractNum
        ? Long.fromValue(contractCall.contractID.contractNum).toNumber()
        : 0;

      const contractId = ContractId.fromString(
        `${shard}.${realm}.${contractNum}`
      );

      const gasLimit = contractCall.gas
        ? Long.fromValue(contractCall.gas).toNumber()
        : 0;

      let amount = 0;
      if (contractCall.amount) {
        const hbar = Hbar.fromTinybars(Long.fromValue(contractCall.amount));
        amount = parseFloat(hbar.toString(HbarUnit.Hbar));
      }

      const functionParameters = contractCall.functionParameters
        ? Buffer.from(contractCall.functionParameters).toString('hex')
        : undefined;

      let functionName;
      if (functionParameters && functionParameters.length >= 8) {
        functionName = functionParameters.substring(0, 8);
      }

      result.contractCall = {
        contractId: contractId.toString(),
        gas: gasLimit,
        amount: amount,
        functionParameters: functionParameters,
        functionName: functionName,
      };
    }
  }

  /**
   * Parse token mint transaction data
   * @param tokenMint - The token mint transaction body
   * @param result - The parsed transaction
   */
  private static parseTokenMint(
    tokenMint: proto.ITokenMintTransactionBody,
    result: ParsedTransaction
  ): void {
    if (tokenMint) {
      const shard = tokenMint.token?.shardNum
        ? Long.fromValue(tokenMint.token.shardNum).toNumber()
        : 0;
      const realm = tokenMint.token?.realmNum
        ? Long.fromValue(tokenMint.token.realmNum).toNumber()
        : 0;
      const tokenNum = tokenMint.token?.tokenNum
        ? Long.fromValue(tokenMint.token.tokenNum).toNumber()
        : 0;

      const tokenId = TokenId.fromString(`${shard}.${realm}.${tokenNum}`);

      const amount = tokenMint.amount
        ? Long.fromValue(tokenMint.amount).toNumber()
        : 0;

      const metadata: string[] = [];
      if (tokenMint.metadata) {
        for (const meta of tokenMint.metadata) {
          if (meta) {
            metadata.push(Buffer.from(meta).toString('base64'));
          }
        }
      }

      result.tokenMint = {
        tokenId: tokenId.toString(),
        amount: amount,
        metadata: metadata.length > 0 ? metadata : undefined,
      };
    }
  }

  /**
   * Parse token burn transaction data
   * @param tokenBurn - The token burn transaction body
   * @param result - The parsed transaction
   */
  private static parseTokenBurn(
    tokenBurn: proto.ITokenBurnTransactionBody,
    result: ParsedTransaction
  ): void {
    if (tokenBurn) {
      const shard = tokenBurn.token?.shardNum
        ? Long.fromValue(tokenBurn.token.shardNum).toNumber()
        : 0;
      const realm = tokenBurn.token?.realmNum
        ? Long.fromValue(tokenBurn.token.realmNum).toNumber()
        : 0;
      const tokenNum = tokenBurn.token?.tokenNum
        ? Long.fromValue(tokenBurn.token.tokenNum).toNumber()
        : 0;

      const tokenId = TokenId.fromString(`${shard}.${realm}.${tokenNum}`);

      const amount = tokenBurn.amount
        ? Long.fromValue(tokenBurn.amount).toNumber()
        : 0;

      const serialNumbers: number[] = [];
      if (tokenBurn.serialNumbers) {
        for (const serial of tokenBurn.serialNumbers) {
          if (serial) {
            serialNumbers.push(Long.fromValue(serial).toNumber());
          }
        }
      }

      result.tokenBurn = {
        tokenId: tokenId.toString(),
        amount: amount,
        serialNumbers: serialNumbers.length > 0 ? serialNumbers : undefined,
      };
    }
  }

  /**
   * Get a human-readable summary of the transaction
   * @param parsedTx - The parsed transaction
   * @returns The human-readable summary of the transaction
   */
  static getTransactionSummary(parsedTx: ParsedTransaction): string {
    let summary: string;

    if (parsedTx.type === 'cryptoTransfer') {
      const senders = [];
      const receivers = [];

      for (const transfer of parsedTx.transfers) {
        if (transfer.amount < 0) {
          senders.push(
            `${transfer.accountId} (${Math.abs(transfer.amount)} ℏ)`
          );
        } else if (transfer.amount > 0) {
          receivers.push(`${transfer.accountId} (${transfer.amount} ℏ)`);
        }
      }

      if (senders.length > 0 && receivers.length > 0) {
        summary = `Transfer of HBAR from ${senders.join(
          ', '
        )} to ${receivers.join(', ')}`;
      } else {
        summary = parsedTx.humanReadableType;
      }
    } else if (parsedTx.contractCall) {
      let contractCallSummary = `Contract call to ${parsedTx.contractCall.contractId} with ${parsedTx.contractCall.gas} gas`;

      if (parsedTx.contractCall.amount > 0) {
        contractCallSummary += ` and ${parsedTx.contractCall.amount} HBAR`;
      }

      if (parsedTx.contractCall.functionName) {
        contractCallSummary += ` calling function ${parsedTx.contractCall.functionName}`;
      }

      summary = contractCallSummary;
    } else if (parsedTx.tokenMint) {
      summary = `Mint ${parsedTx.tokenMint.amount} tokens for token ${parsedTx.tokenMint.tokenId}`;
    } else if (parsedTx.tokenBurn) {
      summary = `Burn ${parsedTx.tokenBurn.amount} tokens for token ${parsedTx.tokenBurn.tokenId}`;
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
        const senders = [];
        const receivers = [];

        for (const transfer of transfers) {
          if (transfer.amount < 0) {
            senders.push(
              `${transfer.accountId} (${Math.abs(transfer.amount)})`
            );
          } else if (transfer.amount > 0) {
            receivers.push(`${transfer.accountId} (${transfer.amount})`);
          }
        }

        if (senders.length > 0 && receivers.length > 0) {
          tokenSummaries.push(
            `Transfer of token ${tokenId} from ${senders.join(
              ', '
            )} to ${receivers.join(', ')}`
          );
        }
      }

      if (tokenSummaries.length > 0) {
        summary = tokenSummaries.join('; ');
      } else {
        summary = parsedTx.humanReadableType;
      }
    } else {
      summary = parsedTx.humanReadableType;
    }

    return summary;
  }
}
