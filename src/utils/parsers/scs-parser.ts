import { proto } from '@hashgraph/proto';
import { ContractId, Hbar, HbarUnit, Long, Transaction } from '@hashgraph/sdk';
import {
  ContractCallData,
  ContractCreateData,
  ContractUpdateData,
  ContractDeleteData,
} from '../transaction-parser-types';
import { Buffer } from 'buffer';
import {
  parseKey,
  extractTransactionBody,
  hasTransactionType,
} from './parser-utils';
import { AccountId, FileId } from '@hashgraph/sdk';

/**
 * Smart Contract Service (SCS) Parser
 *
 * Handles parsing for all contract-related transaction types including:
 * - Contract calls (including EthereumTransaction)
 * - Contract creation, updates, and deletion
 * - Proper dual-branch parsing (regular vs signed transactions)
 * - Comprehensive protobuf extraction
 */
export class SCSParser {
  /**
   * Parse Smart Contract Service transaction using unified dual-branch approach
   * This handles both regular transactions and signed transaction variants
   */
  static parseSCSTransaction(
    transaction: Transaction,
    originalBytes?: Uint8Array,
  ): {
    type?: string;
    humanReadableType?: string;
    contractCall?: ContractCallData;
    contractCreate?: ContractCreateData;
    contractUpdate?: ContractUpdateData;
    contractDelete?: ContractDeleteData;
    [key: string]: unknown;
  } {
    try {
      if (originalBytes || transaction.toBytes) {
        try {
          const bytesToParse = originalBytes || transaction.toBytes();
          const decoded = proto.TransactionList.decode(bytesToParse);

          if (decoded.transactionList && decoded.transactionList.length > 0) {
            const tx = decoded.transactionList[0];
            let txBody: proto.ITransactionBody | null = null;

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
              const protoResult = this.parseFromProtobufTxBody(txBody);
              if (protoResult.type && protoResult.type !== 'UNKNOWN') {
                return protoResult;
              }
            }
          }
        } catch (protoError) {}
      }

      return this.parseFromTransactionInternals(transaction);
    } catch (error) {
      return {
        type: 'UNKNOWN',
        humanReadableType: 'Unknown Contract Transaction',
      };
    }
  }

  /**
   * Parse contract transaction from protobuf TransactionBody
   * Handles all contract operations from decoded protobuf data
   */
  private static parseFromProtobufTxBody(txBody: proto.ITransactionBody): {
    type?: string;
    humanReadableType?: string;
    [key: string]: unknown;
  } {
    if (txBody.contractCall) {
      const contractCall = this.parseContractCall(txBody.contractCall);
      if (contractCall) {
        return {
          type: 'CONTRACTCALL',
          humanReadableType: 'Contract Call',
          contractCall,
        };
      }
    }

    if (txBody.contractCreateInstance) {
      const contractCreate = this.parseContractCreate(
        txBody.contractCreateInstance,
      );
      if (contractCreate) {
        return {
          type: 'CONTRACTCREATE',
          humanReadableType: 'Contract Create',
          contractCreate,
        };
      }
    }

    if (txBody.contractUpdateInstance) {
      const contractUpdate = this.parseContractUpdate(
        txBody.contractUpdateInstance,
      );
      if (contractUpdate) {
        return {
          type: 'CONTRACTUPDATE',
          humanReadableType: 'Contract Update',
          contractUpdate,
        };
      }
    }

    if (txBody.contractDeleteInstance) {
      const contractDelete = this.parseContractDelete(
        txBody.contractDeleteInstance,
      );
      if (contractDelete) {
        return {
          type: 'CONTRACTDELETE',
          humanReadableType: 'Contract Delete',
          contractDelete,
        };
      }
    }

    if (txBody.ethereumTransaction) {
      const ethereumCall = this.parseEthereumTransaction(
        txBody.ethereumTransaction,
      );
      if (ethereumCall) {
        return {
          type: 'ETHEREUMTRANSACTION',
          humanReadableType: 'Ethereum Transaction',
          ethereumTransaction: ethereumCall,
        };
      }
    }

    return {};
  }

  /**
   * Extract contract data from Transaction internal fields
   * This handles cases where data is stored in Transaction object internals
   */
  private static parseFromTransactionInternals(transaction: Transaction): {
    type?: string;
    humanReadableType?: string;
    [key: string]: unknown;
  } {
    try {
      const tx = transaction as unknown as {
        _contractId?: { toString(): string };
        _gas?: number | Long;
        _amount?: { toString(): string };
        _functionParameters?: Uint8Array;
        _initialBalance?: { toString(): string };
        _adminKey?: unknown;
        _memo?: string;
        _fileId?: { toString(): string };
        _bytecode?: Uint8Array;
        _constructorParameters?: Uint8Array;
        _maxAutomaticTokenAssociations?: number;
        _stakedAccountId?: { toString(): string };
        _stakedNodeId?: number | Long;
        _declineReward?: boolean;
        _autoRenewPeriod?: { toString(): string };
        _transferAccountId?: { toString(): string };
        _transferContractId?: { toString(): string };
        constructor?: { name?: string };
      };

      if (tx._contractId && tx._gas) {
        const contractCall: ContractCallData = {
          contractId: tx._contractId.toString(),
          gas:
            typeof tx._gas === 'number'
              ? tx._gas
              : Long.fromValue(tx._gas).toNumber(),
          amount: tx._amount ? parseFloat(tx._amount.toString()) : 0,
        };

        if (tx._functionParameters) {
          const funcParams = Buffer.from(tx._functionParameters).toString(
            'hex',
          );
          contractCall.functionParameters = funcParams;
          contractCall.functionName = this.extractFunctionName(funcParams);
        }

        return {
          type: 'CONTRACTCALL',
          humanReadableType: 'Contract Call',
          contractCall,
        };
      }

      if (hasTransactionType(transaction, 'contractCreateInstance')) {
        const contractCreate: ContractCreateData = {
          gas: tx._gas.toString(),
          initialBalance: tx._initialBalance?.toString() || '0',
        };

        if (tx._fileId) {
          contractCreate.initcodeSource = 'fileID';
          contractCreate.initcode = tx._fileId.toString();
        } else if (tx._bytecode) {
          contractCreate.initcodeSource = 'bytes';
          contractCreate.initcode = Buffer.from(tx._bytecode).toString('hex');
        }

        if (tx._constructorParameters) {
          contractCreate.constructorParameters = Buffer.from(
            tx._constructorParameters,
          ).toString('hex');
        }

        if (tx._memo) contractCreate.memo = tx._memo;
        if (tx._adminKey) contractCreate.adminKey = parseKey(tx._adminKey);
        if (tx._maxAutomaticTokenAssociations !== undefined) {
          contractCreate.maxAutomaticTokenAssociations =
            tx._maxAutomaticTokenAssociations;
        }
        if (tx._stakedAccountId) {
          contractCreate.stakedAccountId = tx._stakedAccountId.toString();
        } else if (
          tx._stakedNodeId !== null &&
          tx._stakedNodeId !== undefined
        ) {
          contractCreate.stakedNodeId = Long.fromValue(
            tx._stakedNodeId,
          ).toString();
        }
        if (tx._declineReward !== undefined)
          contractCreate.declineReward = tx._declineReward;
        if (tx._autoRenewPeriod)
          contractCreate.autoRenewPeriod = tx._autoRenewPeriod.toString();

        return {
          type: 'CONTRACTCREATE',
          humanReadableType: 'Contract Create',
          contractCreate,
        };
      }

      if (hasTransactionType(transaction, 'contractUpdateInstance')) {
        const contractUpdate: ContractUpdateData = {
          contractIdToUpdate: tx._contractId.toString(),
        };

        if (tx._memo) contractUpdate.memo = tx._memo;
        if (tx._adminKey) contractUpdate.adminKey = parseKey(tx._adminKey);
        if (tx._maxAutomaticTokenAssociations !== undefined) {
          contractUpdate.maxAutomaticTokenAssociations =
            tx._maxAutomaticTokenAssociations;
        }
        if (tx._stakedAccountId) {
          contractUpdate.stakedAccountId = tx._stakedAccountId.toString();
        } else if (
          tx._stakedNodeId !== null &&
          tx._stakedNodeId !== undefined
        ) {
          contractUpdate.stakedNodeId = Long.fromValue(
            tx._stakedNodeId,
          ).toString();
        }
        if (tx._declineReward !== undefined)
          contractUpdate.declineReward = tx._declineReward;
        if (tx._autoRenewPeriod)
          contractUpdate.autoRenewPeriod = tx._autoRenewPeriod.toString();

        return {
          type: 'CONTRACTUPDATE',
          humanReadableType: 'Contract Update',
          contractUpdate,
        };
      }

      if (hasTransactionType(transaction, 'contractDeleteInstance')) {
        const contractDelete: ContractDeleteData = {
          contractIdToDelete: tx._contractId.toString(),
        };

        if (tx._transferAccountId) {
          contractDelete.transferAccountId = tx._transferAccountId.toString();
        } else if (tx._transferContractId) {
          contractDelete.transferContractId = tx._transferContractId.toString();
        }

        return {
          type: 'CONTRACTDELETE',
          humanReadableType: 'Contract Delete',
          contractDelete,
        };
      }

      return {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Enhanced function name extraction from contract call parameters
   * Attempts to decode function selector and map to known function names
   */
  private static extractFunctionName(functionParameters: string): string {
    if (functionParameters.length < 8) return 'unknown';

    const selector = functionParameters.substring(0, 8);

    const commonSelectors: Record<string, string> = {
      a9059cbb: 'transfer',
      '095ea7b3': 'approve',
      '23b872dd': 'transferFrom',
      '70a08231': 'balanceOf',
      dd62ed3e: 'allowance',
      '18160ddd': 'totalSupply',
      '06fdde03': 'name',
      '95d89b41': 'symbol',
      '313ce567': 'decimals',
      '42842e0e': 'safeTransferFrom',
      b88d4fde: 'safeTransferFrom',
      e985e9c5: 'isApprovedForAll',
      a22cb465: 'setApprovalForAll',
      '6352211e': 'ownerOf',
      c87b56dd: 'tokenURI',
      '01ffc9a7': 'supportsInterface',
      '40c10f19': 'mint',
      '42966c68': 'burn',
      f2fde38b: 'transferOwnership',
      '715018a6': 'renounceOwnership',
      '8da5cb5b': 'owner',
    };

    return commonSelectors[selector] || selector;
  }

  /**
   * Parse Ethereum Transaction (was completely missing from original parser)
   */
  static parseEthereumTransaction(
    body: proto.IEthereumTransactionBody,
  ): ContractCallData | undefined {
    if (!body) return undefined;

    const data: ContractCallData = {
      contractId: 'EVM',
      gas: body.maxGasAllowance
        ? Long.fromValue(body.maxGasAllowance).toNumber()
        : 0,
      amount: 0,
    };

    if (body.ethereumData && body.ethereumData.length > 0) {
      const ethData = Buffer.from(body.ethereumData).toString('hex');
      data.functionParameters = ethData;

      if (ethData.length >= 8) {
        data.functionName = this.extractFunctionName(ethData);
      }
    }

    return data;
  }

  static parseContractCall(
    body: proto.IContractCallTransactionBody,
  ): ContractCallData | undefined {
    if (!body) return undefined;
    const hbarAmount = Hbar.fromTinybars(Long.fromValue(body.amount ?? 0));
    const data: ContractCallData = {
      contractId: new ContractId(
        body.contractID!.shardNum ?? 0,
        body.contractID!.realmNum ?? 0,
        body.contractID!.contractNum ?? 0,
      ).toString(),
      gas: Long.fromValue(body.gas ?? 0).toNumber(),
      amount: parseFloat(hbarAmount.toString(HbarUnit.Hbar)),
    };
    if (body.functionParameters) {
      data.functionParameters = Buffer.from(body.functionParameters).toString(
        'hex',
      );
      if (data.functionParameters.length >= 8) {
        data.functionName = this.extractFunctionName(data.functionParameters);
      }
    }
    return data;
  }

  static parseContractCreate(
    body: proto.IContractCreateTransactionBody,
  ): ContractCreateData | undefined {
    if (!body) return undefined;
    const data: ContractCreateData = {};
    if (body.initialBalance) {
      data.initialBalance = Hbar.fromTinybars(
        Long.fromValue(body.initialBalance),
      ).toString(HbarUnit.Hbar);
    }
    if (body.gas) {
      data.gas = Long.fromValue(body.gas).toString();
    }
    if (body.adminKey) {
      data.adminKey = parseKey(body.adminKey);
    }
    if (body.constructorParameters) {
      data.constructorParameters = Buffer.from(
        body.constructorParameters,
      ).toString('hex');
    }
    if (body.memo) {
      data.memo = body.memo;
    }
    if (body.autoRenewPeriod?.seconds) {
      data.autoRenewPeriod = Long.fromValue(
        body.autoRenewPeriod.seconds,
      ).toString();
    }
    if (body.stakedAccountId) {
      data.stakedAccountId = new AccountId(
        body.stakedAccountId.shardNum ?? 0,
        body.stakedAccountId.realmNum ?? 0,
        body.stakedAccountId.accountNum ?? 0,
      ).toString();
    } else if (body.stakedNodeId !== null && body.stakedNodeId !== undefined) {
      data.stakedNodeId = Long.fromValue(body.stakedNodeId).toString();
    }
    if (body.declineReward !== undefined) {
      data.declineReward = body.declineReward;
    }
    if (body.maxAutomaticTokenAssociations !== undefined) {
      data.maxAutomaticTokenAssociations = body.maxAutomaticTokenAssociations;
    }
    if (body.fileID) {
      data.initcodeSource = 'fileID';
      data.initcode = new FileId(
        body.fileID.shardNum ?? 0,
        body.fileID.realmNum ?? 0,
        body.fileID.fileNum ?? 0,
      ).toString();
    } else if (body.initcode && body.initcode.length > 0) {
      data.initcodeSource = 'bytes';
      data.initcode = Buffer.from(body.initcode).toString('hex');
    }
    return data;
  }

  static parseContractUpdate(
    body: proto.IContractUpdateTransactionBody,
  ): ContractUpdateData | undefined {
    if (!body) return undefined;
    const data: ContractUpdateData = {};
    if (body.contractID) {
      data.contractIdToUpdate = new ContractId(
        body.contractID.shardNum ?? 0,
        body.contractID.realmNum ?? 0,
        body.contractID.contractNum ?? 0,
      ).toString();
    }
    if (body.adminKey) {
      data.adminKey = parseKey(body.adminKey);
    }
    if (body.expirationTime?.seconds) {
      data.expirationTime = `${Long.fromValue(
        body.expirationTime.seconds,
      ).toString()}.${body.expirationTime.nanos}`;
    }
    if (body.autoRenewPeriod?.seconds) {
      data.autoRenewPeriod = Long.fromValue(
        body.autoRenewPeriod.seconds,
      ).toString();
    }

    if (body.memo) {
      const memoUnion = body.memo as unknown;
      if (
        memoUnion &&
        typeof memoUnion === 'object' &&
        Object.prototype.hasOwnProperty.call(memoUnion, 'value')
      ) {
        const value = (memoUnion as { value: unknown }).value;
        if (value === null || value === undefined) {
          data.memo = undefined;
        } else {
          data.memo = String(value);
        }
      } else if (typeof memoUnion === 'string') {
        data.memo = memoUnion;
      } else {
        data.memo = undefined;
      }
    } else {
      data.memo = undefined;
    }

    if (body.stakedAccountId) {
      data.stakedAccountId = new AccountId(
        body.stakedAccountId.shardNum ?? 0,
        body.stakedAccountId.realmNum ?? 0,
        body.stakedAccountId.accountNum ?? 0,
      ).toString();
      data.stakedNodeId = undefined;
    } else if (
      body.stakedNodeId !== null &&
      body.stakedNodeId !== undefined &&
      Long.fromValue(body.stakedNodeId).notEquals(-1)
    ) {
      data.stakedNodeId = Long.fromValue(body.stakedNodeId).toString();
      data.stakedAccountId = undefined;
    } else {
      data.stakedNodeId = undefined;
      data.stakedAccountId = undefined;
    }
    if (body.declineReward?.value !== undefined) {
      data.declineReward = body.declineReward.value;
    }
    if (body.maxAutomaticTokenAssociations?.value !== undefined) {
      data.maxAutomaticTokenAssociations =
        body.maxAutomaticTokenAssociations.value;
    }
    if (body.autoRenewAccountId) {
      data.autoRenewAccountId = new AccountId(
        body.autoRenewAccountId.shardNum ?? 0,
        body.autoRenewAccountId.realmNum ?? 0,
        body.autoRenewAccountId.accountNum ?? 0,
      ).toString();
    }
    return data;
  }

  static parseContractDelete(
    body: proto.IContractDeleteTransactionBody,
  ): ContractDeleteData | undefined {
    if (!body) return undefined;
    const data: ContractDeleteData = {};
    if (body.contractID) {
      data.contractIdToDelete = new ContractId(
        body.contractID.shardNum ?? 0,
        body.contractID.realmNum ?? 0,
        body.contractID.contractNum ?? 0,
      ).toString();
    }
    if (body.transferAccountID) {
      data.transferAccountId = new AccountId(
        body.transferAccountID.shardNum ?? 0,
        body.transferAccountID.realmNum ?? 0,
        body.transferAccountID.accountNum ?? 0,
      ).toString();
    } else if (body.transferContractID) {
      data.transferContractId = new ContractId(
        body.transferContractID.shardNum ?? 0,
        body.transferContractID.realmNum ?? 0,
        body.transferContractID.contractNum ?? 0,
      ).toString();
    }
    return data;
  }

  /**
   * Parse SCS (Smart Contract Service) transaction from Transaction object
   * This is the unified entry point that delegates to the comprehensive parsing logic
   */
  static parseFromTransactionObject(transaction: Transaction): {
    type?: string;
    humanReadableType?: string;
    [key: string]: unknown;
  } {
    return this.parseSCSTransaction(transaction);
  }
}
