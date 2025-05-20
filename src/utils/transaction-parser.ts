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
  amount: string;
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

export type TokenCreationData = {
  tokenName?: string;
  tokenSymbol?: string;
  initialSupply?: string;
  decimals?: number;
  maxSupply?: string;
  tokenType?: string;
  supplyType?: string;
  memo?: string;
  treasuryAccountId?: string;
  adminKey?: string;
  kycKey?: string;
  freezeKey?: string;
  wipeKey?: string;
  supplyKey?: string;
  feeScheduleKey?: string;
  pauseKey?: string;
  autoRenewAccount?: string;
  autoRenewPeriod?: string;
};

export type ConsensusCreateTopicData = {
  memo?: string;
  adminKey?: string;
  submitKey?: string;
  autoRenewPeriod?: string;
  autoRenewAccountId?: string;
};

export type ConsensusSubmitMessageData = {
  topicId?: string;
  message?: string;
  messageEncoding?: 'utf8' | 'base64';
  chunkInfoInitialTransactionID?: string;
  chunkInfoNumber?: number;
  chunkInfoTotal?: number;
};

export type CryptoDeleteData = {
  deleteAccountId?: string;
  transferAccountId?: string;
};

export type ScheduleCreateData = {
  scheduledTransaction?: ParsedTransaction;
  payerAccountId?: string;
  adminKey?: string;
  memo?: string;
  waitForExpiry?: boolean;
};

export type ScheduleSignData = {
  scheduleId?: string;
};

export type EthereumTransactionData = {
  ethereumData?: string;
  callDataFileId?: string;
  maxGasAllowanceHbar?: string;
};

export type SystemDeleteData = {
  fileId?: string;
  contractId?: string;
};

export type SystemUndeleteData = {
  fileId?: string;
  contractId?: string;
};

export type ParsedTransaction = {
  type: string;
  humanReadableType: string;
  transfers: AccountAmount[];
  tokenTransfers: TokenAmount[];
  memo?: string;
  transactionFee?: string;
  contractCall?: ContractCallData;
  tokenMint?: TokenMintData;
  tokenBurn?: TokenBurnData;
  tokenCreation?: TokenCreationData;
  consensusCreateTopic?: ConsensusCreateTopicData;
  consensusSubmitMessage?: ConsensusSubmitMessageData;
  cryptoDelete?: CryptoDeleteData;
  scheduleCreate?: ScheduleCreateData;
  scheduleSign?: ScheduleSignData;
  ethereumTransaction?: EthereumTransactionData;
  systemDelete?: SystemDeleteData;
  systemUndelete?: SystemUndeleteData;
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
        result.transactionFee = hbarAmount.toString(HbarUnit.Hbar);
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

      if (txBody.tokenCreation) {
        this.parseTokenCreation(txBody.tokenCreation, result);
      }

      if (txBody.consensusCreateTopic) {
        this.parseConsensusCreateTopic(txBody.consensusCreateTopic, result);
      }

      if (txBody.consensusSubmitMessage) {
        this.parseConsensusSubmitMessage(txBody.consensusSubmitMessage, result);
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
    } else if (txBody.scheduleDelete) {
      transactionType = 'scheduleDelete';
    } else if (txBody.systemDelete) {
      transactionType = 'systemDelete';
    } else if (txBody.systemUndelete) {
      transactionType = 'systemUndelete';
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
              amount: hbarAmount.toString(HbarUnit.Hbar),
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
   * Parse token creation transaction data
   * @param tokenCreation - The token creation transaction body
   * @param result - The parsed transaction
   */
  private static parseTokenCreation(
    tokenCreation: proto.ITokenCreateTransactionBody,
    result: ParsedTransaction
  ): void {
    if (tokenCreation) {
      const creationData: TokenCreationData = {};
      if (tokenCreation.name) creationData.tokenName = tokenCreation.name;
      if (tokenCreation.symbol) creationData.tokenSymbol = tokenCreation.symbol;
      if (tokenCreation.treasury) {
        const t = tokenCreation.treasury;
        creationData.treasuryAccountId = new AccountId(
          t.shardNum ? Long.fromValue(t.shardNum).toNumber() : 0,
          t.realmNum ? Long.fromValue(t.realmNum).toNumber() : 0,
          t.accountNum ? Long.fromValue(t.accountNum).toNumber() : 0
        ).toString();
      }
      if (tokenCreation.initialSupply) {
        creationData.initialSupply = Long.fromValue(
          tokenCreation.initialSupply
        ).toString();
      }
      if (
        tokenCreation.decimals !== undefined &&
        tokenCreation.decimals !== null
      ) {
        creationData.decimals = Long.fromValue(
          tokenCreation.decimals
        ).toNumber();
      }
      if (tokenCreation.maxSupply) {
        creationData.maxSupply = Long.fromValue(
          tokenCreation.maxSupply
        ).toString();
      }
      if (tokenCreation.memo) creationData.memo = tokenCreation.memo;

      if (
        tokenCreation.tokenType !== null &&
        tokenCreation.tokenType !== undefined
      ) {
        creationData.tokenType = proto.TokenType[tokenCreation.tokenType];
      }
      if (
        tokenCreation.supplyType !== null &&
        tokenCreation.supplyType !== undefined
      ) {
        creationData.supplyType =
          proto.TokenSupplyType[tokenCreation.supplyType];
      }

      creationData.adminKey = tokenCreation.adminKey
        ? 'Present'
        : 'Not Present';
      creationData.kycKey = tokenCreation.kycKey ? 'Present' : 'Not Present';
      creationData.freezeKey = tokenCreation.freezeKey
        ? 'Present'
        : 'Not Present';
      creationData.wipeKey = tokenCreation.wipeKey ? 'Present' : 'Not Present';
      creationData.supplyKey = tokenCreation.supplyKey
        ? 'Present'
        : 'Not Present';
      creationData.feeScheduleKey = tokenCreation.feeScheduleKey
        ? 'Present'
        : 'Not Present';
      creationData.pauseKey = tokenCreation.pauseKey
        ? 'Present'
        : 'Not Present';

      if (tokenCreation.autoRenewAccount) {
        const ara = tokenCreation.autoRenewAccount;
        creationData.autoRenewAccount = new AccountId(
          ara.shardNum ? Long.fromValue(ara.shardNum).toNumber() : 0,
          ara.realmNum ? Long.fromValue(ara.realmNum).toNumber() : 0,
          ara.accountNum ? Long.fromValue(ara.accountNum).toNumber() : 0
        ).toString();
      }
      if (
        tokenCreation.autoRenewPeriod &&
        tokenCreation.autoRenewPeriod.seconds
      ) {
        creationData.autoRenewPeriod = Long.fromValue(
          tokenCreation.autoRenewPeriod.seconds
        ).toString();
      }

      result.tokenCreation = creationData;
    }
  }

  /**
   * Parse consensus create topic transaction data
   * @param createTopicBody - The consensus create topic transaction body
   * @param result - The parsed transaction
   */
  private static parseConsensusCreateTopic(
    createTopicBody: proto.IConsensusCreateTopicTransactionBody,
    result: ParsedTransaction
  ): void {
    if (createTopicBody) {
      const topicData: ConsensusCreateTopicData = {};
      if (createTopicBody.memo) topicData.memo = createTopicBody.memo;
      topicData.adminKey = createTopicBody.adminKey ? 'Present' : 'Not Present';
      topicData.submitKey = createTopicBody.submitKey
        ? 'Present'
        : 'Not Present';

      if (createTopicBody.autoRenewAccount) {
        const ara = createTopicBody.autoRenewAccount;
        topicData.autoRenewAccountId = new AccountId(
          ara.shardNum ? Long.fromValue(ara.shardNum).toNumber() : 0,
          ara.realmNum ? Long.fromValue(ara.realmNum).toNumber() : 0,
          ara.accountNum ? Long.fromValue(ara.accountNum).toNumber() : 0
        ).toString();
      }
      if (
        createTopicBody.autoRenewPeriod &&
        createTopicBody.autoRenewPeriod.seconds
      ) {
        topicData.autoRenewPeriod = Long.fromValue(
          createTopicBody.autoRenewPeriod.seconds
        ).toString();
      }
      result.consensusCreateTopic = topicData;
    }
  }

  /**
   * Parse consensus submit message transaction data
   * @param submitMessageBody - The consensus submit message transaction body
   * @param result - The parsed transaction
   */
  private static parseConsensusSubmitMessage(
    submitMessageBody: proto.IConsensusSubmitMessageTransactionBody,
    result: ParsedTransaction
  ): void {
    if (submitMessageBody) {
      const messageData: ConsensusSubmitMessageData = {};
      if (submitMessageBody.topicID) {
        const tid = submitMessageBody.topicID;
        messageData.topicId = `${
          tid.shardNum ? Long.fromValue(tid.shardNum).toNumber() : 0
        }.${tid.realmNum ? Long.fromValue(tid.realmNum).toNumber() : 0}.${
          tid.topicNum ? Long.fromValue(tid.topicNum).toNumber() : 0
        }`;
      }
      if (submitMessageBody.message && submitMessageBody.message.length > 0) {
        const messageBuffer = Buffer.from(submitMessageBody.message);
        const utf8String = messageBuffer.toString('utf8');

        if (/[ --]/.test(utf8String) || utf8String.includes('\uFFFD')) {
          messageData.message = messageBuffer.toString('base64');
          messageData.messageEncoding = 'base64';
        } else {
          messageData.message = utf8String;
          messageData.messageEncoding = 'utf8';
        }
      }
      if (submitMessageBody.chunkInfo) {
        if (submitMessageBody.chunkInfo.initialTransactionID) {
          const txId =
            submitMessageBody.chunkInfo.initialTransactionID.accountID;
          const taValidStart =
            submitMessageBody.chunkInfo.initialTransactionID
              .transactionValidStart;
          if (txId && taValidStart) {
            messageData.chunkInfoInitialTransactionID = `${
              txId.shardNum ? Long.fromValue(txId.shardNum).toNumber() : 0
            }.${txId.realmNum ? Long.fromValue(txId.realmNum).toNumber() : 0}.${
              txId.accountNum ? Long.fromValue(txId.accountNum).toNumber() : 0
            }@${
              taValidStart.seconds
                ? Long.fromValue(taValidStart.seconds).toNumber()
                : 0
            }.${
              taValidStart.nanos
                ? Long.fromValue(taValidStart.nanos).toNumber()
                : 0
            }`;
          }
        }
        if (
          submitMessageBody.chunkInfo.number !== undefined &&
          submitMessageBody.chunkInfo.number !== null
        ) {
          messageData.chunkInfoNumber = submitMessageBody.chunkInfo.number;
        }
        if (
          submitMessageBody.chunkInfo.total !== undefined &&
          submitMessageBody.chunkInfo.total !== null
        ) {
          messageData.chunkInfoTotal = submitMessageBody.chunkInfo.total;
        }
      }
      result.consensusSubmitMessage = messageData;
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
        summary = tokenSummaries.join('; ');
      } else {
        summary = parsedTx.humanReadableType;
      }
    } else if (parsedTx.consensusCreateTopic) {
      summary = `Create new topic`;
      if (parsedTx.consensusCreateTopic.memo) {
        summary += ` with memo "${parsedTx.consensusCreateTopic.memo}"`;
      }
      if (parsedTx.consensusCreateTopic.autoRenewAccountId) {
        summary += `, auto-renew by ${parsedTx.consensusCreateTopic.autoRenewAccountId}`;
      }
    } else if (parsedTx.consensusSubmitMessage) {
      summary = `Submit message`;
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
    } else {
      summary = parsedTx.humanReadableType;
    }

    return summary;
  }
}
