import { proto } from '@hashgraph/proto';
import { AccountId, TokenId, Hbar, HbarUnit, Long } from '@hashgraph/sdk';
import {
  AccountAmount,
  TokenAmount,
  CryptoDeleteData,
  CryptoCreateAccountData,
  CryptoUpdateAccountData,
  CryptoApproveAllowanceData,
  CryptoDeleteAllowanceData,
  NftAllowance,
} from '../transaction-parser-types';
import { parseKey } from './parser-utils';

export class CryptoParser {
  static parseCryptoTransfers(
    cryptoTransfer: proto.ICryptoTransferTransactionBody,
    result: { transfers: AccountAmount[]; tokenTransfers: TokenAmount[] },
  ): void {
    if (cryptoTransfer.transfers?.accountAmounts) {
      result.transfers = cryptoTransfer.transfers.accountAmounts.map(aa => {
        const accountId = new AccountId(
          aa.accountID!.shardNum ?? 0,
          aa.accountID!.realmNum ?? 0,
          aa.accountID!.accountNum ?? 0,
        );
        const hbarAmount = Hbar.fromTinybars(Long.fromValue(aa.amount!));
        return {
          accountId: accountId.toString(),
          amount: hbarAmount.toString(HbarUnit.Hbar),
          isDecimal: true,
        };
      });
    }
    if (cryptoTransfer.tokenTransfers) {
      for (const tokenTransferList of cryptoTransfer.tokenTransfers) {
        const tokenId = new TokenId(
          tokenTransferList.token!.shardNum ?? 0,
          tokenTransferList.token!.realmNum ?? 0,
          tokenTransferList.token!.tokenNum ?? 0,
        );
        if (tokenTransferList.transfers) {
          for (const transfer of tokenTransferList.transfers) {
            const accountId = new AccountId(
              transfer.accountID!.shardNum ?? 0,
              transfer.accountID!.realmNum ?? 0,
              transfer.accountID!.accountNum ?? 0,
            );
            const tokenAmount = Long.fromValue(transfer.amount!).toNumber();
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

  static parseCryptoDelete(
    body: proto.ICryptoDeleteTransactionBody,
  ): CryptoDeleteData | undefined {
    if (!body) return undefined;
    const data: CryptoDeleteData = {};
    if (body.deleteAccountID) {
      data.deleteAccountId = new AccountId(
        body.deleteAccountID.shardNum ?? 0,
        body.deleteAccountID.realmNum ?? 0,
        body.deleteAccountID.accountNum ?? 0,
      ).toString();
    }
    if (body.transferAccountID) {
      data.transferAccountId = new AccountId(
        body.transferAccountID.shardNum ?? 0,
        body.transferAccountID.realmNum ?? 0,
        body.transferAccountID.accountNum ?? 0,
      ).toString();
    }
    return data;
  }

  static parseCryptoCreateAccount(
    body: proto.ICryptoCreateTransactionBody,
  ): CryptoCreateAccountData | undefined {
    if (!body) return undefined;
    const data: CryptoCreateAccountData = {};
    if (body.initialBalance) {
      data.initialBalance = Hbar.fromTinybars(
        Long.fromValue(body.initialBalance),
      ).toString(HbarUnit.Hbar);
    }
    if (body.key) {
      data.key = parseKey(body.key);
    }
    if (body.receiverSigRequired !== undefined) {
      data.receiverSigRequired = body.receiverSigRequired;
    }
    if (body.autoRenewPeriod?.seconds) {
      data.autoRenewPeriod = Long.fromValue(
        body.autoRenewPeriod.seconds,
      ).toString();
    }
    if (body.memo) {
      data.memo = body.memo;
    }
    if (body.maxAutomaticTokenAssociations !== undefined) {
      data.maxAutomaticTokenAssociations = body.maxAutomaticTokenAssociations;
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
    if (body.alias && body.alias.length > 0) {
      data.alias = Buffer.from(body.alias).toString('hex');
    }
    return data;
  }

  static parseCryptoUpdateAccount(
    body: proto.ICryptoUpdateTransactionBody,
  ): CryptoUpdateAccountData | undefined {
    if (!body) return undefined;
    const data: CryptoUpdateAccountData = {};
    if (body.accountIDToUpdate) {
      data.accountIdToUpdate = new AccountId(
        body.accountIDToUpdate.shardNum ?? 0,
        body.accountIDToUpdate.realmNum ?? 0,
        body.accountIDToUpdate.accountNum ?? 0,
      ).toString();
    }
    if (body.key) {
      data.key = parseKey(body.key);
    }
    if (body.expirationTime?.seconds) {
      data.expirationTime = `${Long.fromValue(
        body.expirationTime.seconds,
      ).toString()}.${body.expirationTime.nanos}`;
    }
    if (
      body.receiverSigRequired !== null &&
      body.receiverSigRequired !== undefined
    ) {
      data.receiverSigRequired = Boolean(body.receiverSigRequired);
    }
    if (body.autoRenewPeriod?.seconds) {
      data.autoRenewPeriod = Long.fromValue(
        body.autoRenewPeriod.seconds,
      ).toString();
    }
    if (body.memo?.value !== undefined) {
      data.memo = body.memo.value;
    }
    if (body.maxAutomaticTokenAssociations?.value !== undefined) {
      data.maxAutomaticTokenAssociations =
        body.maxAutomaticTokenAssociations.value;
    }
    if (body.stakedAccountId) {
      data.stakedAccountId = new AccountId(
        body.stakedAccountId.shardNum ?? 0,
        body.stakedAccountId.realmNum ?? 0,
        body.stakedAccountId.accountNum ?? 0,
      ).toString();
      data.stakedNodeId = undefined;
    } else if (body.stakedNodeId !== null && body.stakedNodeId !== undefined) {
      data.stakedNodeId = Long.fromValue(body.stakedNodeId).toString();
      data.stakedAccountId = undefined;
    } else {
      data.stakedAccountId = undefined;
      data.stakedNodeId = undefined;
    }
    if (body.declineReward !== null && body.declineReward !== undefined) {
      data.declineReward = Boolean(body.declineReward);
    }
    return data;
  }

  static parseCryptoApproveAllowance(
    body: proto.ICryptoApproveAllowanceTransactionBody,
  ): CryptoApproveAllowanceData | undefined {
    if (!body) return undefined;
    const data: CryptoApproveAllowanceData = {};
    if (body.cryptoAllowances && body.cryptoAllowances.length > 0) {
      data.hbarAllowances = body.cryptoAllowances.map(a => ({
        ownerAccountId: new AccountId(
          a.owner!.shardNum ?? 0,
          a.owner!.realmNum ?? 0,
          a.owner!.accountNum ?? 0,
        ).toString(),
        spenderAccountId: new AccountId(
          a.spender!.shardNum ?? 0,
          a.spender!.realmNum ?? 0,
          a.spender!.accountNum ?? 0,
        ).toString(),
        amount: Hbar.fromTinybars(Long.fromValue(a.amount!)).toString(
          HbarUnit.Hbar,
        ),
      }));
    }
    if (body.tokenAllowances && body.tokenAllowances.length > 0) {
      data.tokenAllowances = body.tokenAllowances.map(a => ({
        tokenId: new TokenId(
          a.tokenId!.shardNum ?? 0,
          a.tokenId!.realmNum ?? 0,
          a.tokenId!.tokenNum ?? 0,
        ).toString(),
        ownerAccountId: new AccountId(
          a.owner!.shardNum ?? 0,
          a.owner!.realmNum ?? 0,
          a.owner!.accountNum ?? 0,
        ).toString(),
        spenderAccountId: new AccountId(
          a.spender!.shardNum ?? 0,
          a.spender!.realmNum ?? 0,
          a.spender!.accountNum ?? 0,
        ).toString(),
        amount: Long.fromValue(a.amount!).toString(),
      }));
    }
    if (body.nftAllowances && body.nftAllowances.length > 0) {
      data.nftAllowances = body.nftAllowances.map(a => {
        const allowance: NftAllowance = {};
        if (a.tokenId)
          allowance.tokenId = new TokenId(
            a.tokenId.shardNum ?? 0,
            a.tokenId.realmNum ?? 0,
            a.tokenId.tokenNum ?? 0,
          ).toString();
        if (a.owner)
          allowance.ownerAccountId = new AccountId(
            a.owner.shardNum ?? 0,
            a.owner.realmNum ?? 0,
            a.owner.accountNum ?? 0,
          ).toString();
        if (a.spender)
          allowance.spenderAccountId = new AccountId(
            a.spender.shardNum ?? 0,
            a.spender.realmNum ?? 0,
            a.spender.accountNum ?? 0,
          ).toString();
        if (a.serialNumbers && a.serialNumbers.length > 0)
          allowance.serialNumbers = a.serialNumbers.map(sn =>
            Long.fromValue(sn).toString(),
          );
        if (a.approvedForAll?.value !== undefined)
          allowance.approvedForAll = a.approvedForAll.value;
        if (a.delegatingSpender)
          allowance.delegatingSpender = new AccountId(
            a.delegatingSpender.shardNum ?? 0,
            a.delegatingSpender.realmNum ?? 0,
            a.delegatingSpender.accountNum ?? 0,
          ).toString();
        return allowance;
      });
    }
    return data;
  }

  static parseCryptoDeleteAllowance(
    body: proto.ICryptoDeleteAllowanceTransactionBody,
  ): CryptoDeleteAllowanceData | undefined {
    if (!body) return undefined;
    const data: CryptoDeleteAllowanceData = {};
    if (body.nftAllowances && body.nftAllowances.length > 0) {
      data.nftAllowancesToRemove = body.nftAllowances.map(a => ({
        ownerAccountId: new AccountId(
          a.owner!.shardNum ?? 0,
          a.owner!.realmNum ?? 0,
          a.owner!.accountNum ?? 0,
        ).toString(),
        tokenId: new TokenId(
          a.tokenId!.shardNum ?? 0,
          a.tokenId!.realmNum ?? 0,
          a.tokenId!.tokenNum ?? 0,
        ).toString(),
        serialNumbers: a.serialNumbers
          ? a.serialNumbers.map(sn => Long.fromValue(sn).toString())
          : [],
      }));
    }
    return data;
  }
}
