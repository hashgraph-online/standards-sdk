import { proto } from '@hashgraph/proto';
import { ContractId, Hbar, HbarUnit, Long } from '@hashgraph/sdk';
import {
  ContractCallData,
  ContractCreateData,
  ContractUpdateData,
  ContractDeleteData,
} from '../transaction-parser-types';
import { Buffer } from 'buffer';
import { parseKey } from './parser-utils';
import { AccountId, FileId } from '@hashgraph/sdk';

export class SCSParser {
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
        data.functionName = data.functionParameters.substring(0, 8);
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
      const memoAsAny = body.memo as any;
      if (
        memoAsAny &&
        typeof memoAsAny === 'object' &&
        memoAsAny.hasOwnProperty('value')
      ) {
        const memoVal = memoAsAny.value;
        data.memo =
          memoVal === null || memoVal === undefined
            ? undefined
            : String(memoVal);
      } else if (typeof memoAsAny === 'string') {
        data.memo = memoAsAny;
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
}
