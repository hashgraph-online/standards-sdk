import { proto } from '@hashgraph/proto';
import { Transaction, Long, FileId, ContractId } from '@hashgraph/sdk';
import {
  UtilPrngData,
  NetworkFreezeData,
  SystemDeleteData,
  SystemUndeleteData,
  NodeCreateData,
  NodeUpdateData,
  NodeDeleteData,
} from '../transaction-parser-types';
import {
  parseKey,
  extractTransactionBody,
  hasTransactionType,
} from './parser-utils';

/**
 * Utility and System Operations Parser
 *
 * Handles parsing for utility and system transaction types including:
 * - Pseudo-random number generation (PRNG)
 * - Network freeze operations
 * - System delete/undelete operations
 * - Node management operations
 * - Proper dual-branch parsing (regular vs signed transactions)
 * - Comprehensive protobuf extraction
 */
export class UtilParser {
  /**
   * Parse Utility/System Service transaction using unified dual-branch approach
   * This handles both regular transactions and signed transaction variants
   */
  static parseUtilTransaction(
    transaction: Transaction,
    originalBytes?: Uint8Array,
  ): {
    type?: string;
    humanReadableType?: string;
    utilPrng?: UtilPrngData;
    networkFreeze?: NetworkFreezeData;
    systemDelete?: SystemDeleteData;
    systemUndelete?: SystemUndeleteData;
    nodeCreate?: NodeCreateData;
    nodeUpdate?: NodeUpdateData;
    nodeDelete?: NodeDeleteData;
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
        humanReadableType: 'Unknown Utility Transaction',
      };
    }
  }

  /**
   * Parse utility transaction from protobuf TransactionBody
   * Handles all utility operations from decoded protobuf data
   */
  private static parseFromProtobufTxBody(txBody: proto.ITransactionBody): {
    type?: string;
    humanReadableType?: string;
    [key: string]: unknown;
  } {
    if (txBody.utilPrng) {
      const utilPrng = this.parseUtilPrng(txBody.utilPrng);
      if (utilPrng) {
        return {
          type: 'PRNG',
          humanReadableType: 'Pseudo Random Number',
          utilPrng,
        };
      }
    }

    if (txBody.freeze) {
      const networkFreeze = this.parseNetworkFreezeFromProto(txBody.freeze);
      if (networkFreeze) {
        return {
          type: 'FREEZE',
          humanReadableType: 'Network Freeze',
          networkFreeze,
        };
      }
    }

    if (txBody.systemDelete) {
      const systemDelete = this.parseSystemDeleteFromProto(txBody.systemDelete);
      if (systemDelete) {
        return {
          type: 'SYSTEMDELETE',
          humanReadableType: 'System Delete',
          systemDelete,
        };
      }
    }

    if (txBody.systemUndelete) {
      const systemUndelete = this.parseSystemUndeleteFromProto(
        txBody.systemUndelete,
      );
      if (systemUndelete) {
        return {
          type: 'SYSTEMUNDELETE',
          humanReadableType: 'System Undelete',
          systemUndelete,
        };
      }
    }

    if (txBody.nodeCreate) {
      const nodeCreate = this.parseNodeCreateFromProto(txBody.nodeCreate);
      if (nodeCreate) {
        return {
          type: 'NODECREATE',
          humanReadableType: 'Node Create',
          nodeCreate,
        };
      }
    }

    if (txBody.nodeUpdate) {
      const nodeUpdate = this.parseNodeUpdateFromProto(txBody.nodeUpdate);
      if (nodeUpdate) {
        return {
          type: 'NODEUPDATE',
          humanReadableType: 'Node Update',
          nodeUpdate,
        };
      }
    }

    if (txBody.nodeDelete) {
      const nodeDelete = this.parseNodeDeleteFromProto(txBody.nodeDelete);
      if (nodeDelete) {
        return {
          type: 'NODEDELETE',
          humanReadableType: 'Node Delete',
          nodeDelete,
        };
      }
    }

    return {};
  }

  /**
   * Extract utility data from Transaction internal fields
   * This handles cases where data is stored in Transaction object internals
   */
  private static parseFromTransactionInternals(transaction: Transaction): {
    type?: string;
    humanReadableType?: string;
    [key: string]: unknown;
  } {
    try {
      const tx = transaction as unknown as {
        _range?: number;
        _startTime?: { toString(): string };
        _endTime?: { toString(): string };
        _updateFile?: { toString(): string };
        _fileHash?: Uint8Array;
        _freezeType?: string;
        _fileId?: { toString(): string };
        _contractId?: { toString(): string };
        _expirationTime?: { toString(): string };
        _nodeId?: number;
        _accountId?: { toString(): string };
        _description?: string;
        _gossipEndpoint?: Array<unknown>;
        _serviceEndpoint?: Array<unknown>;
        _gossipCaCertificate?: Uint8Array;
        _grpcCertificateHash?: Uint8Array;
        _adminKey?: unknown;
        constructor?: { name?: string };
      };

      if (hasTransactionType(transaction, 'utilPrng')) {
        const utilPrng: UtilPrngData = {};
        if (tx._range && tx._range !== 0) {
          utilPrng.range = tx._range;
        }

        return {
          type: 'PRNG',
          humanReadableType: 'Pseudo Random Number',
          utilPrng,
        };
      }

      if (hasTransactionType(transaction, 'freeze')) {
        const networkFreeze: NetworkFreezeData = {};

        if (tx._startTime) {
          networkFreeze.startTime = tx._startTime.toString();
        }
        if (tx._endTime) {
          networkFreeze.endTime = tx._endTime.toString();
        }
        if (tx._updateFile) {
          networkFreeze.updateFile = tx._updateFile.toString();
        }
        if (tx._fileHash) {
          networkFreeze.fileHash = Buffer.from(tx._fileHash).toString('hex');
        }
        if (tx._freezeType) {
          networkFreeze.freezeType = tx._freezeType as any;
        }

        return {
          type: 'FREEZE',
          humanReadableType: 'Network Freeze',
          networkFreeze,
        };
      }

      if (hasTransactionType(transaction, 'systemDelete')) {
        const systemDelete: SystemDeleteData = {};

        if (tx._fileId) {
          systemDelete.fileId = tx._fileId.toString();
        } else if (tx._contractId) {
          systemDelete.contractId = tx._contractId.toString();
        }

        if (tx._expirationTime) {
          systemDelete.expirationTime = tx._expirationTime.toString();
        }

        return {
          type: 'SYSTEMDELETE',
          humanReadableType: 'System Delete',
          systemDelete,
        };
      }

      if (hasTransactionType(transaction, 'systemUndelete')) {
        const systemUndelete: SystemUndeleteData = {};

        if (tx._fileId) {
          systemUndelete.fileId = tx._fileId.toString();
        } else if (tx._contractId) {
          systemUndelete.contractId = tx._contractId.toString();
        }

        return {
          type: 'SYSTEMUNDELETE',
          humanReadableType: 'System Undelete',
          systemUndelete,
        };
      }

      return {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Parse Network Freeze from protobuf data
   */
  private static parseNetworkFreezeFromProto(
    body: proto.IFreezeTransactionBody,
  ): NetworkFreezeData | undefined {
    if (!body) return undefined;

    const data: NetworkFreezeData = {};

    if (body.startTime?.seconds) {
      data.startTime = `${Long.fromValue(
        body.startTime.seconds,
      ).toString()}.${body.startTime.nanos ?? 0}`;
    }

    if (body.updateFile) {
      data.updateFile = new FileId(
        body.updateFile.shardNum ?? 0,
        body.updateFile.realmNum ?? 0,
        body.updateFile.fileNum ?? 0,
      ).toString();
    }

    if (body.fileHash && body.fileHash.length > 0) {
      data.fileHash = Buffer.from(body.fileHash).toString('hex');
    }

    if (body.freezeType !== undefined) {
      const freezeTypes = [
        'FREEZE_ONLY',
        'PREPARE_UPGRADE',
        'FREEZE_UPGRADE',
        'FREEZE_ABORT',
      ];
      data.freezeType = (freezeTypes[body.freezeType] as any) || 'FREEZE_ONLY';
    }

    return data;
  }

  /**
   * Parse System Delete from protobuf data
   */
  private static parseSystemDeleteFromProto(
    body: proto.ISystemDeleteTransactionBody,
  ): SystemDeleteData | undefined {
    if (!body) return undefined;

    const data: SystemDeleteData = {};

    if (body.fileID) {
      data.fileId = new FileId(
        body.fileID.shardNum ?? 0,
        body.fileID.realmNum ?? 0,
        body.fileID.fileNum ?? 0,
      ).toString();
    } else if (body.contractID) {
      data.contractId = new ContractId(
        body.contractID.shardNum ?? 0,
        body.contractID.realmNum ?? 0,
        body.contractID.contractNum ?? 0,
      ).toString();
    }

    if (body.expirationTime?.seconds) {
      data.expirationTime = Long.fromValue(
        body.expirationTime.seconds,
      ).toString();
    }

    return data;
  }

  /**
   * Parse System Undelete from protobuf data
   */
  private static parseSystemUndeleteFromProto(
    body: proto.ISystemUndeleteTransactionBody,
  ): SystemUndeleteData | undefined {
    if (!body) return undefined;

    const data: SystemUndeleteData = {};

    if (body.fileID) {
      data.fileId = new FileId(
        body.fileID.shardNum ?? 0,
        body.fileID.realmNum ?? 0,
        body.fileID.fileNum ?? 0,
      ).toString();
    } else if (body.contractID) {
      data.contractId = new ContractId(
        body.contractID.shardNum ?? 0,
        body.contractID.realmNum ?? 0,
        body.contractID.contractNum ?? 0,
      ).toString();
    }

    return data;
  }

  /**
   * Parse Node Create from protobuf data
   */
  private static parseNodeCreateFromProto(
    body: any,
  ): NodeCreateData | undefined {
    if (!body) return undefined;

    const data: NodeCreateData = {};

    if (body.nodeId !== undefined) {
      data.nodeId = Long.fromValue(body.nodeId).toNumber();
    }

    return data;
  }

  /**
   * Parse Node Update from protobuf data
   */
  private static parseNodeUpdateFromProto(
    body: any,
  ): NodeUpdateData | undefined {
    if (!body) return undefined;

    const data: NodeUpdateData = {};

    if (body.nodeId !== undefined) {
      data.nodeId = Long.fromValue(body.nodeId).toNumber();
    }

    return data;
  }

  /**
   * Parse Node Delete from protobuf data
   */
  private static parseNodeDeleteFromProto(
    body: any,
  ): NodeDeleteData | undefined {
    if (!body) return undefined;

    const data: NodeDeleteData = {};

    if (body.nodeId !== undefined) {
      data.nodeId = Long.fromValue(body.nodeId).toNumber();
    }

    return data;
  }

  static parseUtilPrng(
    body: proto.IUtilPrngTransactionBody,
  ): UtilPrngData | undefined {
    if (!body) return undefined;
    const data: UtilPrngData = {};
    if (body.range && body.range !== 0) {
      data.range = body.range;
    }
    return data;
  }

  static parseFreeze(
    body: proto.IFreezeTransactionBody,
  ): NetworkFreezeData | undefined {
    return this.parseNetworkFreezeFromProto(body);
  }

  /**
   * Parse Utility/System Service transaction from Transaction object
   * This is the unified entry point that delegates to the comprehensive parsing logic
   */
  static parseFromTransactionObject(transaction: Transaction): {
    type?: string;
    humanReadableType?: string;
    [key: string]: unknown;
  } {
    return this.parseUtilTransaction(transaction);
  }
}
