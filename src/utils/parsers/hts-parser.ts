import { proto } from '@hashgraph/proto';
import { AccountId, TokenId, Long } from '@hashgraph/sdk';
import {
  TokenCreationData,
  TokenMintData,
  TokenBurnData,
  TokenUpdateData,
  TokenFeeScheduleUpdateData,
  TokenFreezeData,
  TokenUnfreezeData,
  TokenGrantKycData,
  TokenRevokeKycData,
  TokenPauseData,
  TokenUnpauseData,
  TokenWipeAccountData,
  TokenDeleteData,
  TokenAssociateData,
  TokenDissociateData,
  CustomFeeData,
  FixedFeeData,
  FractionalFeeData,
  RoyaltyFeeData,
} from '../transaction-parser-types';
import { parseKey } from './parser-utils';
import { Buffer } from 'buffer';

export class HTSParser {
  static parseTokenCreate(
    body: proto.ITokenCreateTransactionBody
  ): TokenCreationData | undefined {
    if (!body) return undefined;
    const data: TokenCreationData = {};
    if (body.name) {
      data.tokenName = body.name;
    }
    if (body.symbol) {
      data.tokenSymbol = body.symbol;
    }
    if (body.treasury) {
      data.treasuryAccountId = new AccountId(
        body.treasury.shardNum ?? 0,
        body.treasury.realmNum ?? 0,
        body.treasury.accountNum ?? 0
      ).toString();
    }
    if (body.initialSupply) {
      data.initialSupply = Long.fromValue(body.initialSupply).toString();
    }
    if (body.decimals !== undefined && body.decimals !== null) {
      data.decimals = Long.fromValue(body.decimals).toNumber();
    }
    if (body.maxSupply) {
      data.maxSupply = Long.fromValue(body.maxSupply).toString();
    }
    if (body.memo) {
      data.memo = body.memo;
    }
    if (body.tokenType !== null && body.tokenType !== undefined) {
      data.tokenType = proto.TokenType[body.tokenType];
    }
    if (body.supplyType !== null && body.supplyType !== undefined) {
      data.supplyType = proto.TokenSupplyType[body.supplyType];
    }
    data.adminKey = parseKey(body.adminKey);
    data.kycKey = parseKey(body.kycKey);
    data.freezeKey = parseKey(body.freezeKey);
    data.wipeKey = parseKey(body.wipeKey);
    data.supplyKey = parseKey(body.supplyKey);
    data.feeScheduleKey = parseKey(body.feeScheduleKey);
    data.pauseKey = parseKey(body.pauseKey);
    if (body.autoRenewAccount) {
      data.autoRenewAccount = new AccountId(
        body.autoRenewAccount.shardNum ?? 0,
        body.autoRenewAccount.realmNum ?? 0,
        body.autoRenewAccount.accountNum ?? 0
      ).toString();
    }
    if (body.autoRenewPeriod?.seconds) {
      data.autoRenewPeriod = Long.fromValue(
        body.autoRenewPeriod.seconds
      ).toString();
    }
    if (body.customFees && body.customFees.length > 0) {
      data.customFees = body.customFees.map((fee) => {
        const feeCollectorAccountId = fee.feeCollectorAccountId
          ? new AccountId(
              fee.feeCollectorAccountId.shardNum ?? 0,
              fee.feeCollectorAccountId.realmNum ?? 0,
              fee.feeCollectorAccountId.accountNum ?? 0
            ).toString()
          : 'Not Set';
        const commonFeeData = {
          feeCollectorAccountId,
          allCollectorsAreExempt: fee.allCollectorsAreExempt || false,
        };
        if (fee.fixedFee) {
          return {
            ...commonFeeData,
            feeType: 'FIXED_FEE',
            fixedFee: {
              amount: Long.fromValue(fee.fixedFee.amount || 0).toString(),
              denominatingTokenId: fee.fixedFee.denominatingTokenId
                ? new TokenId(
                    fee.fixedFee.denominatingTokenId.shardNum ?? 0,
                    fee.fixedFee.denominatingTokenId.realmNum ?? 0,
                    fee.fixedFee.denominatingTokenId.tokenNum ?? 0
                  ).toString()
                : undefined,
            },
          };
        } else if (fee.fractionalFee) {
          return {
            ...commonFeeData,
            feeType: 'FRACTIONAL_FEE',
            fractionalFee: {
              numerator: Long.fromValue(
                fee.fractionalFee.fractionalAmount?.numerator || 0
              ).toString(),
              denominator: Long.fromValue(
                fee.fractionalFee.fractionalAmount?.denominator || 1
              ).toString(),
              minimumAmount: Long.fromValue(
                fee.fractionalFee.minimumAmount || 0
              ).toString(),
              maximumAmount: Long.fromValue(
                fee.fractionalFee.maximumAmount || 0
              ).toString(),
              netOfTransfers: fee.fractionalFee.netOfTransfers || false,
            },
          };
        } else if (fee.royaltyFee) {
          let fallbackFeeData: FixedFeeData | undefined = undefined;
          if (fee.royaltyFee.fallbackFee) {
            fallbackFeeData = {
              amount: Long.fromValue(
                fee.royaltyFee.fallbackFee.amount || 0
              ).toString(),
              denominatingTokenId: fee.royaltyFee.fallbackFee
                .denominatingTokenId
                ? new TokenId(
                    fee.royaltyFee.fallbackFee.denominatingTokenId.shardNum ??
                      0,
                    fee.royaltyFee.fallbackFee.denominatingTokenId.realmNum ??
                      0,
                    fee.royaltyFee.fallbackFee.denominatingTokenId.tokenNum ?? 0
                  ).toString()
                : undefined,
            };
          }
          return {
            ...commonFeeData,
            feeType: 'ROYALTY_FEE',
            royaltyFee: {
              numerator: Long.fromValue(
                fee.royaltyFee.exchangeValueFraction?.numerator || 0
              ).toString(),
              denominator: Long.fromValue(
                fee.royaltyFee.exchangeValueFraction?.denominator || 1
              ).toString(),
              fallbackFee: fallbackFeeData,
            },
          };
        }
        return {
          ...commonFeeData,
          feeType: 'FIXED_FEE',
          fixedFee: { amount: '0' },
        } as CustomFeeData;
      });
    }
    return data;
  }

  static parseTokenMint(
    body: proto.ITokenMintTransactionBody
  ): TokenMintData | undefined {
    if (
      !body ||
      !body.token ||
      body.amount === null ||
      body.amount === undefined
    ) {
      return undefined;
    }
    const data: TokenMintData = {
      tokenId: new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0
      ).toString(),
      amount: Long.fromValue(body.amount).toNumber(),
    };
    if (body.metadata && body.metadata.length > 0) {
      data.metadata = body.metadata.map((meta) =>
        Buffer.from(meta).toString('base64')
      );
    }
    return data;
  }

  static parseTokenBurn(
    body: proto.ITokenBurnTransactionBody
  ): TokenBurnData | undefined {
    if (
      !body ||
      !body.token ||
      body.amount === null ||
      body.amount === undefined
    ) {
      return undefined;
    }
    const data: TokenBurnData = {
      tokenId: new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0
      ).toString(),
      amount: Long.fromValue(body.amount).toNumber(),
    };
    if (body.serialNumbers && body.serialNumbers.length > 0) {
      data.serialNumbers = body.serialNumbers.map((sn) =>
        Long.fromValue(sn).toNumber()
      );
    }
    return data;
  }

  static parseTokenUpdate(
    body: proto.ITokenUpdateTransactionBody
  ): TokenUpdateData | undefined {
    if (!body) return undefined;
    const data: TokenUpdateData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0
      ).toString();
    }
    if (body.name) {
      data.name = body.name;
    }
    if (body.symbol) {
      data.symbol = body.symbol;
    }
    if (body.treasury) {
      data.treasuryAccountId = new AccountId(
        body.treasury.shardNum ?? 0,
        body.treasury.realmNum ?? 0,
        body.treasury.accountNum ?? 0
      ).toString();
    }
    data.adminKey = parseKey(body.adminKey);
    data.kycKey = parseKey(body.kycKey);
    data.freezeKey = parseKey(body.freezeKey);
    data.wipeKey = parseKey(body.wipeKey);
    data.supplyKey = parseKey(body.supplyKey);
    data.feeScheduleKey = parseKey(body.feeScheduleKey);
    data.pauseKey = parseKey(body.pauseKey);
    if (body.autoRenewAccount) {
      data.autoRenewAccountId = new AccountId(
        body.autoRenewAccount.shardNum ?? 0,
        body.autoRenewAccount.realmNum ?? 0,
        body.autoRenewAccount.accountNum ?? 0
      ).toString();
    }
    if (body.autoRenewPeriod?.seconds) {
      data.autoRenewPeriod = Long.fromValue(
        body.autoRenewPeriod.seconds
      ).toString();
    }
    if (body.memo?.value !== undefined) {
      data.memo = body.memo.value;
    }
    if (body.expiry?.seconds) {
      data.expiry = `${Long.fromValue(body.expiry.seconds).toString()}.${
        body.expiry.nanos
      }`;
    }
    return data;
  }

  static parseTokenFeeScheduleUpdate(
    body: proto.ITokenFeeScheduleUpdateTransactionBody
  ): TokenFeeScheduleUpdateData | undefined {
    if (!body) return undefined;
    const data: TokenFeeScheduleUpdateData = {};
    if (body.tokenId) {
      data.tokenId = new TokenId(
        body.tokenId.shardNum ?? 0,
        body.tokenId.realmNum ?? 0,
        body.tokenId.tokenNum ?? 0
      ).toString();
    }
    if (body.customFees && body.customFees.length > 0) {
      data.customFees = body.customFees.map((fee) => {
        const feeCollectorAccountId = fee.feeCollectorAccountId
          ? new AccountId(
              fee.feeCollectorAccountId.shardNum ?? 0,
              fee.feeCollectorAccountId.realmNum ?? 0,
              fee.feeCollectorAccountId.accountNum ?? 0
            ).toString()
          : 'Not Set';
        const commonFeeData = {
          feeCollectorAccountId,
          allCollectorsAreExempt: fee.allCollectorsAreExempt || false,
        };
        if (fee.fixedFee) {
          return {
            ...commonFeeData,
            feeType: 'FIXED_FEE',
            fixedFee: {
              amount: Long.fromValue(fee.fixedFee.amount || 0).toString(),
              denominatingTokenId: fee.fixedFee.denominatingTokenId
                ? new TokenId(
                    fee.fixedFee.denominatingTokenId.shardNum ?? 0,
                    fee.fixedFee.denominatingTokenId.realmNum ?? 0,
                    fee.fixedFee.denominatingTokenId.tokenNum ?? 0
                  ).toString()
                : undefined,
            },
          };
        } else if (fee.fractionalFee) {
          return {
            ...commonFeeData,
            feeType: 'FRACTIONAL_FEE',
            fractionalFee: {
              numerator: Long.fromValue(
                fee.fractionalFee.fractionalAmount?.numerator || 0
              ).toString(),
              denominator: Long.fromValue(
                fee.fractionalFee.fractionalAmount?.denominator || 1
              ).toString(),
              minimumAmount: Long.fromValue(
                fee.fractionalFee.minimumAmount || 0
              ).toString(),
              maximumAmount: Long.fromValue(
                fee.fractionalFee.maximumAmount || 0
              ).toString(),
              netOfTransfers: fee.fractionalFee.netOfTransfers || false,
            },
          };
        } else if (fee.royaltyFee) {
          let fallbackFeeData: FixedFeeData | undefined = undefined;
          if (fee.royaltyFee.fallbackFee) {
            fallbackFeeData = {
              amount: Long.fromValue(
                fee.royaltyFee.fallbackFee.amount || 0
              ).toString(),
              denominatingTokenId: fee.royaltyFee.fallbackFee
                .denominatingTokenId
                ? new TokenId(
                    fee.royaltyFee.fallbackFee.denominatingTokenId.shardNum ??
                      0,
                    fee.royaltyFee.fallbackFee.denominatingTokenId.realmNum ??
                      0,
                    fee.royaltyFee.fallbackFee.denominatingTokenId.tokenNum ?? 0
                  ).toString()
                : undefined,
            };
          }
          return {
            ...commonFeeData,
            feeType: 'ROYALTY_FEE',
            royaltyFee: {
              numerator: Long.fromValue(
                fee.royaltyFee.exchangeValueFraction?.numerator || 0
              ).toString(),
              denominator: Long.fromValue(
                fee.royaltyFee.exchangeValueFraction?.denominator || 1
              ).toString(),
              fallbackFee: fallbackFeeData,
            },
          };
        }
        return {
          ...commonFeeData,
          feeType: 'FIXED_FEE',
          fixedFee: { amount: '0' },
        } as CustomFeeData;
      });
    }
    return data;
  }

  static parseTokenFreeze(
    body: proto.ITokenFreezeAccountTransactionBody
  ): TokenFreezeData | undefined {
    if (!body) return undefined;
    const data: TokenFreezeData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0
      ).toString();
    }
    if (body.account) {
      data.accountId = new AccountId(
        body.account.shardNum ?? 0,
        body.account.realmNum ?? 0,
        body.account.accountNum ?? 0
      ).toString();
    }
    return data;
  }

  static parseTokenUnfreeze(
    body: proto.ITokenUnfreezeAccountTransactionBody
  ): TokenUnfreezeData | undefined {
    if (!body) return undefined;
    const data: TokenUnfreezeData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0
      ).toString();
    }
    if (body.account) {
      data.accountId = new AccountId(
        body.account.shardNum ?? 0,
        body.account.realmNum ?? 0,
        body.account.accountNum ?? 0
      ).toString();
    }
    return data;
  }

  static parseTokenGrantKyc(
    body: proto.ITokenGrantKycTransactionBody
  ): TokenGrantKycData | undefined {
    if (!body) return undefined;
    const data: TokenGrantKycData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0
      ).toString();
    }
    if (body.account) {
      data.accountId = new AccountId(
        body.account.shardNum ?? 0,
        body.account.realmNum ?? 0,
        body.account.accountNum ?? 0
      ).toString();
    }
    return data;
  }

  static parseTokenRevokeKyc(
    body: proto.ITokenRevokeKycTransactionBody
  ): TokenRevokeKycData | undefined {
    if (!body) return undefined;
    const data: TokenRevokeKycData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0
      ).toString();
    }
    if (body.account) {
      data.accountId = new AccountId(
        body.account.shardNum ?? 0,
        body.account.realmNum ?? 0,
        body.account.accountNum ?? 0
      ).toString();
    }
    return data;
  }

  static parseTokenPause(
    body: proto.ITokenPauseTransactionBody
  ): TokenPauseData | undefined {
    if (!body) return undefined;
    const data: TokenPauseData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0
      ).toString();
    }
    return data;
  }

  static parseTokenUnpause(
    body: proto.ITokenUnpauseTransactionBody
  ): TokenUnpauseData | undefined {
    if (!body) return undefined;
    const data: TokenUnpauseData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0
      ).toString();
    }
    return data;
  }

  static parseTokenWipeAccount(
    body: proto.ITokenWipeAccountTransactionBody
  ): TokenWipeAccountData | undefined {
    if (!body) return undefined;
    const data: TokenWipeAccountData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0
      ).toString();
    }
    if (body.account) {
      data.accountId = new AccountId(
        body.account.shardNum ?? 0,
        body.account.realmNum ?? 0,
        body.account.accountNum ?? 0
      ).toString();
    }
    if (body.serialNumbers && body.serialNumbers.length > 0) {
      data.serialNumbers = body.serialNumbers.map((sn) =>
        Long.fromValue(sn).toString()
      );
    }
    if (body.amount) {
      data.amount = Long.fromValue(body.amount).toString();
    }
    return data;
  }

  static parseTokenDelete(
    body: proto.ITokenDeleteTransactionBody
  ): TokenDeleteData | undefined {
    if (!body) return undefined;
    const data: TokenDeleteData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0
      ).toString();
    }
    return data;
  }

  static parseTokenAssociate(
    body: proto.ITokenAssociateTransactionBody
  ): TokenAssociateData | undefined {
    if (!body) return undefined;
    const data: TokenAssociateData = {};
    if (body.account) {
      data.accountId = new AccountId(
        body.account.shardNum ?? 0,
        body.account.realmNum ?? 0,
        body.account.accountNum ?? 0
      ).toString();
    }
    if (body.tokens && body.tokens.length > 0) {
      data.tokenIds = body.tokens.map((t) =>
        new TokenId(
          t.shardNum ?? 0,
          t.realmNum ?? 0,
          t.tokenNum ?? 0
        ).toString()
      );
    }
    return data;
  }

  static parseTokenDissociate(
    body: proto.ITokenDissociateTransactionBody
  ): TokenDissociateData | undefined {
    if (!body) return undefined;
    const data: TokenDissociateData = {};
    if (body.account) {
      data.accountId = new AccountId(
        body.account.shardNum ?? 0,
        body.account.realmNum ?? 0,
        body.account.accountNum ?? 0
      ).toString();
    }
    if (body.tokens && body.tokens.length > 0) {
      data.tokenIds = body.tokens.map((t) =>
        new TokenId(
          t.shardNum ?? 0,
          t.realmNum ?? 0,
          t.tokenNum ?? 0
        ).toString()
      );
    }
    return data;
  }
}
