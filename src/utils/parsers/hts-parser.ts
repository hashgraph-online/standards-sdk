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
  TokenAirdropData,
  CustomFeeData,
  FixedFeeData,
  FractionalFeeData,
  RoyaltyFeeData,
} from '../transaction-parser-types';
import { ParsedTransaction } from '../transaction-parser-types';
import { parseKey, extractTransactionBody, hasTransactionType } from './parser-utils';
import { Buffer } from 'buffer';

import { Transaction } from '@hashgraph/sdk';

export class HTSParser {
  /**
   * Main entry point for parsing HTS transactions from a Transaction object
   * This method bridges between the Transaction object and the protobuf parsers
   */
  static parseHTSTransaction(
    transaction: Transaction,
  ): Partial<ParsedTransaction> {
    try {
      const transactionBody = (
        transaction as unknown as { _transactionBody?: proto.ITransactionBody }
      )._transactionBody as proto.ITransactionBody | undefined;

      if (!transactionBody) {
        return {};
      }

      if (transactionBody.tokenCreation) {
        const tokenCreation = this.parseTokenCreate(
          transactionBody.tokenCreation,
        );
        if (tokenCreation) {
          return {
            type: 'TOKENCREATE',
            humanReadableType: 'Token Creation',
            tokenCreation,
          };
        }
      }

      if (transactionBody.tokenMint) {
        const tokenMint = this.parseTokenMint(transactionBody.tokenMint);
        if (tokenMint) {
          return {
            type: 'TOKENMINT',
            humanReadableType: 'Token Mint',
            tokenMint,
          };
        }
      }

      if (transactionBody.tokenBurn) {
        const tokenBurn = this.parseTokenBurn(transactionBody.tokenBurn);
        if (tokenBurn) {
          return {
            type: 'TOKENBURN',
            humanReadableType: 'Token Burn',
            tokenBurn,
          };
        }
      }

      if (transactionBody.tokenUpdate) {
        const tokenUpdate = this.parseTokenUpdate(transactionBody.tokenUpdate);
        if (tokenUpdate) {
          return {
            type: 'TOKENUPDATE',
            humanReadableType: 'Token Update',
            tokenUpdate,
          };
        }
      }

      if (transactionBody.tokenFreeze) {
        const tokenFreeze = this.parseTokenFreeze(transactionBody.tokenFreeze);
        if (tokenFreeze) {
          return {
            type: 'TOKENFREEZE',
            humanReadableType: 'Token Freeze',
            tokenFreeze,
          };
        }
      }

      if (transactionBody.tokenUnfreeze) {
        const tokenUnfreeze = this.parseTokenUnfreeze(
          transactionBody.tokenUnfreeze,
        );
        if (tokenUnfreeze) {
          return {
            type: 'TOKENUNFREEZE',
            humanReadableType: 'Token Unfreeze',
            tokenUnfreeze,
          };
        }
      }

      if (transactionBody.tokenGrantKyc) {
        const tokenGrantKyc = this.parseTokenGrantKyc(
          transactionBody.tokenGrantKyc,
        );
        if (tokenGrantKyc) {
          return {
            type: 'TOKENGRANTKYC',
            humanReadableType: 'Token Grant KYC',
            tokenGrantKyc,
          };
        }
      }

      if (transactionBody.tokenRevokeKyc) {
        const tokenRevokeKyc = this.parseTokenRevokeKyc(
          transactionBody.tokenRevokeKyc,
        );
        if (tokenRevokeKyc) {
          return {
            type: 'TOKENREVOKEKYC',
            humanReadableType: 'Token Revoke KYC',
            tokenRevokeKyc,
          };
        }
      }

      if (transactionBody.tokenPause) {
        const tokenPause = this.parseTokenPause(transactionBody.tokenPause);
        if (tokenPause) {
          return {
            type: 'TOKENPAUSE',
            humanReadableType: 'Token Pause',
            tokenPause,
          };
        }
      }

      if (transactionBody.tokenUnpause) {
        const tokenUnpause = this.parseTokenUnpause(
          transactionBody.tokenUnpause,
        );
        if (tokenUnpause) {
          return {
            type: 'TOKENUNPAUSE',
            humanReadableType: 'Token Unpause',
            tokenUnpause,
          };
        }
      }

      if (transactionBody.tokenWipe) {
        const tokenWipeAccount = this.parseTokenWipeAccount(
          transactionBody.tokenWipe,
        );
        if (tokenWipeAccount) {
          return {
            type: 'TOKENWIPEACCOUNT',
            humanReadableType: 'Token Wipe Account',
            tokenWipeAccount,
          };
        }
      }

      if (transactionBody.tokenDeletion) {
        const tokenDelete = this.parseTokenDelete(
          transactionBody.tokenDeletion,
        );
        if (tokenDelete) {
          return {
            type: 'TOKENDELETE',
            humanReadableType: 'Token Delete',
            tokenDelete,
          };
        }
      }

      if (transactionBody.tokenAssociate) {
        const tokenAssociate = this.parseTokenAssociate(
          transactionBody.tokenAssociate,
        );
        if (tokenAssociate) {
          return {
            type: 'TOKENASSOCIATE',
            humanReadableType: 'Token Associate',
            tokenAssociate,
          };
        }
      }

      if (transactionBody.tokenDissociate) {
        const tokenDissociate = this.parseTokenDissociate(
          transactionBody.tokenDissociate,
        );
        if (tokenDissociate) {
          return {
            type: 'TOKENDISSOCIATE',
            humanReadableType: 'Token Dissociate',
            tokenDissociate,
          };
        }
      }

      if (transactionBody.tokenFeeScheduleUpdate) {
        const tokenFeeScheduleUpdate = this.parseTokenFeeScheduleUpdate(
          transactionBody.tokenFeeScheduleUpdate,
        );
        if (tokenFeeScheduleUpdate) {
          return {
            type: 'TOKENFEESCHEDULEUPDATE',
            humanReadableType: 'Token Fee Schedule Update',
            tokenFeeScheduleUpdate,
          };
        }
      }

      const airdrop = this.parseTokenAirdrop(transaction);
      if (airdrop) {
        return {
          type: 'TOKENAIRDROP',
          humanReadableType: 'Token Airdrop',
          tokenAirdrop: airdrop,
        };
      }

      return {};
    } catch (error) {
      console.warn('[HTSParser] Failed to parse HTS transaction:', error);
      return {};
    }
  }

  static parseTokenCreate(
    body: proto.ITokenCreateTransactionBody,
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
        body.treasury.accountNum ?? 0,
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
        body.autoRenewAccount.accountNum ?? 0,
      ).toString();
    }
    if (body.autoRenewPeriod?.seconds) {
      data.autoRenewPeriod = Long.fromValue(
        body.autoRenewPeriod.seconds,
      ).toString();
    }
    if (body.customFees && body.customFees.length > 0) {
      data.customFees = body.customFees.map(fee => {
        const feeCollectorAccountId = fee.feeCollectorAccountId
          ? new AccountId(
              fee.feeCollectorAccountId.shardNum ?? 0,
              fee.feeCollectorAccountId.realmNum ?? 0,
              fee.feeCollectorAccountId.accountNum ?? 0,
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
                    fee.fixedFee.denominatingTokenId.tokenNum ?? 0,
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
                fee.fractionalFee.fractionalAmount?.numerator || 0,
              ).toString(),
              denominator: Long.fromValue(
                fee.fractionalFee.fractionalAmount?.denominator || 1,
              ).toString(),
              minimumAmount: Long.fromValue(
                fee.fractionalFee.minimumAmount || 0,
              ).toString(),
              maximumAmount: Long.fromValue(
                fee.fractionalFee.maximumAmount || 0,
              ).toString(),
              netOfTransfers: fee.fractionalFee.netOfTransfers || false,
            },
          };
        } else if (fee.royaltyFee) {
          let fallbackFeeData: FixedFeeData | undefined = undefined;
          if (fee.royaltyFee.fallbackFee) {
            fallbackFeeData = {
              amount: Long.fromValue(
                fee.royaltyFee.fallbackFee.amount || 0,
              ).toString(),
              denominatingTokenId: fee.royaltyFee.fallbackFee
                .denominatingTokenId
                ? new TokenId(
                    fee.royaltyFee.fallbackFee.denominatingTokenId.shardNum ??
                      0,
                    fee.royaltyFee.fallbackFee.denominatingTokenId.realmNum ??
                      0,
                    fee.royaltyFee.fallbackFee.denominatingTokenId.tokenNum ??
                      0,
                  ).toString()
                : undefined,
            };
          }
          return {
            ...commonFeeData,
            feeType: 'ROYALTY_FEE',
            royaltyFee: {
              numerator: Long.fromValue(
                fee.royaltyFee.exchangeValueFraction?.numerator || 0,
              ).toString(),
              denominator: Long.fromValue(
                fee.royaltyFee.exchangeValueFraction?.denominator || 1,
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
    body: proto.ITokenMintTransactionBody,
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
        body.token.tokenNum ?? 0,
      ).toString(),
      amount: Long.fromValue(body.amount).toNumber(),
    };
    if (body.metadata && body.metadata.length > 0) {
      data.metadata = body.metadata.map(meta =>
        Buffer.from(meta).toString('base64'),
      );
    }
    return data;
  }

  static parseTokenBurn(
    body: proto.ITokenBurnTransactionBody,
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
        body.token.tokenNum ?? 0,
      ).toString(),
      amount: Long.fromValue(body.amount).toNumber(),
    };
    if (body.serialNumbers && body.serialNumbers.length > 0) {
      data.serialNumbers = body.serialNumbers.map(sn =>
        Long.fromValue(sn).toNumber(),
      );
    }
    return data;
  }

  static parseTokenUpdate(
    body: proto.ITokenUpdateTransactionBody,
  ): TokenUpdateData | undefined {
    if (!body) return undefined;
    const data: TokenUpdateData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0,
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
        body.treasury.accountNum ?? 0,
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
        body.autoRenewAccount.accountNum ?? 0,
      ).toString();
    }
    if (body.autoRenewPeriod?.seconds) {
      data.autoRenewPeriod = Long.fromValue(
        body.autoRenewPeriod.seconds,
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
    body: proto.ITokenFeeScheduleUpdateTransactionBody,
  ): TokenFeeScheduleUpdateData | undefined {
    if (!body) return undefined;
    const data: TokenFeeScheduleUpdateData = {};
    if (body.tokenId) {
      data.tokenId = new TokenId(
        body.tokenId.shardNum ?? 0,
        body.tokenId.realmNum ?? 0,
        body.tokenId.tokenNum ?? 0,
      ).toString();
    }
    if (body.customFees && body.customFees.length > 0) {
      data.customFees = body.customFees.map(fee => {
        const feeCollectorAccountId = fee.feeCollectorAccountId
          ? new AccountId(
              fee.feeCollectorAccountId.shardNum ?? 0,
              fee.feeCollectorAccountId.realmNum ?? 0,
              fee.feeCollectorAccountId.accountNum ?? 0,
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
                    fee.fixedFee.denominatingTokenId.tokenNum ?? 0,
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
                fee.fractionalFee.fractionalAmount?.numerator || 0,
              ).toString(),
              denominator: Long.fromValue(
                fee.fractionalFee.fractionalAmount?.denominator || 1,
              ).toString(),
              minimumAmount: Long.fromValue(
                fee.fractionalFee.minimumAmount || 0,
              ).toString(),
              maximumAmount: Long.fromValue(
                fee.fractionalFee.maximumAmount || 0,
              ).toString(),
              netOfTransfers: fee.fractionalFee.netOfTransfers || false,
            },
          };
        } else if (fee.royaltyFee) {
          let fallbackFeeData: FixedFeeData | undefined = undefined;
          if (fee.royaltyFee.fallbackFee) {
            fallbackFeeData = {
              amount: Long.fromValue(
                fee.royaltyFee.fallbackFee.amount || 0,
              ).toString(),
              denominatingTokenId: fee.royaltyFee.fallbackFee
                .denominatingTokenId
                ? new TokenId(
                    fee.royaltyFee.fallbackFee.denominatingTokenId.shardNum ??
                      0,
                    fee.royaltyFee.fallbackFee.denominatingTokenId.realmNum ??
                      0,
                    fee.royaltyFee.fallbackFee.denominatingTokenId.tokenNum ??
                      0,
                  ).toString()
                : undefined,
            };
          }
          return {
            ...commonFeeData,
            feeType: 'ROYALTY_FEE',
            royaltyFee: {
              numerator: Long.fromValue(
                fee.royaltyFee.exchangeValueFraction?.numerator || 0,
              ).toString(),
              denominator: Long.fromValue(
                fee.royaltyFee.exchangeValueFraction?.denominator || 1,
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
    body: proto.ITokenFreezeAccountTransactionBody,
  ): TokenFreezeData | undefined {
    if (!body) return undefined;
    const data: TokenFreezeData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0,
      ).toString();
    }
    if (body.account) {
      data.accountId = new AccountId(
        body.account.shardNum ?? 0,
        body.account.realmNum ?? 0,
        body.account.accountNum ?? 0,
      ).toString();
    }
    return data;
  }

  static parseTokenUnfreeze(
    body: proto.ITokenUnfreezeAccountTransactionBody,
  ): TokenUnfreezeData | undefined {
    if (!body) return undefined;
    const data: TokenUnfreezeData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0,
      ).toString();
    }
    if (body.account) {
      data.accountId = new AccountId(
        body.account.shardNum ?? 0,
        body.account.realmNum ?? 0,
        body.account.accountNum ?? 0,
      ).toString();
    }
    return data;
  }

  static parseTokenGrantKyc(
    body: proto.ITokenGrantKycTransactionBody,
  ): TokenGrantKycData | undefined {
    if (!body) return undefined;
    const data: TokenGrantKycData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0,
      ).toString();
    }
    if (body.account) {
      data.accountId = new AccountId(
        body.account.shardNum ?? 0,
        body.account.realmNum ?? 0,
        body.account.accountNum ?? 0,
      ).toString();
    }
    return data;
  }

  static parseTokenRevokeKyc(
    body: proto.ITokenRevokeKycTransactionBody,
  ): TokenRevokeKycData | undefined {
    if (!body) return undefined;
    const data: TokenRevokeKycData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0,
      ).toString();
    }
    if (body.account) {
      data.accountId = new AccountId(
        body.account.shardNum ?? 0,
        body.account.realmNum ?? 0,
        body.account.accountNum ?? 0,
      ).toString();
    }
    return data;
  }

  static parseTokenPause(
    body: proto.ITokenPauseTransactionBody,
  ): TokenPauseData | undefined {
    if (!body) return undefined;
    const data: TokenPauseData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0,
      ).toString();
    }
    return data;
  }

  static parseTokenUnpause(
    body: proto.ITokenUnpauseTransactionBody,
  ): TokenUnpauseData | undefined {
    if (!body) return undefined;
    const data: TokenUnpauseData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0,
      ).toString();
    }
    return data;
  }

  static parseTokenWipeAccount(
    body: proto.ITokenWipeAccountTransactionBody,
  ): TokenWipeAccountData | undefined {
    if (!body) return undefined;
    const data: TokenWipeAccountData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0,
      ).toString();
    }
    if (body.account) {
      data.accountId = new AccountId(
        body.account.shardNum ?? 0,
        body.account.realmNum ?? 0,
        body.account.accountNum ?? 0,
      ).toString();
    }
    if (body.serialNumbers && body.serialNumbers.length > 0) {
      data.serialNumbers = body.serialNumbers.map(sn =>
        Long.fromValue(sn).toString(),
      );
    }
    if (body.amount) {
      data.amount = Long.fromValue(body.amount).toString();
    }
    return data;
  }

  static parseTokenDelete(
    body: proto.ITokenDeleteTransactionBody,
  ): TokenDeleteData | undefined {
    if (!body) return undefined;
    const data: TokenDeleteData = {};
    if (body.token) {
      data.tokenId = new TokenId(
        body.token.shardNum ?? 0,
        body.token.realmNum ?? 0,
        body.token.tokenNum ?? 0,
      ).toString();
    }
    return data;
  }

  static parseTokenAssociate(
    body: proto.ITokenAssociateTransactionBody,
  ): TokenAssociateData | undefined {
    if (!body) return undefined;
    const data: TokenAssociateData = {};
    if (body.account) {
      data.accountId = new AccountId(
        body.account.shardNum ?? 0,
        body.account.realmNum ?? 0,
        body.account.accountNum ?? 0,
      ).toString();
    }
    if (body.tokens && body.tokens.length > 0) {
      data.tokenIds = body.tokens.map(t =>
        new TokenId(
          t.shardNum ?? 0,
          t.realmNum ?? 0,
          t.tokenNum ?? 0,
        ).toString(),
      );
    }
    return data;
  }

  static parseTokenDissociate(
    body: proto.ITokenDissociateTransactionBody,
  ): TokenDissociateData | undefined {
    if (!body) return undefined;
    const data: TokenDissociateData = {};
    if (body.account) {
      data.accountId = new AccountId(
        body.account.shardNum ?? 0,
        body.account.realmNum ?? 0,
        body.account.accountNum ?? 0,
      ).toString();
    }
    if (body.tokens && body.tokens.length > 0) {
      data.tokenIds = body.tokens.map(t =>
        new TokenId(
          t.shardNum ?? 0,
          t.realmNum ?? 0,
          t.tokenNum ?? 0,
        ).toString(),
      );
    }
    return data;
  }

  /**
   * Parse token airdrop transaction for both fungible tokens and NFTs
   * Extracts airdrop transfers from transaction protobuf data
   */
  static parseTokenAirdrop(transaction: Transaction): TokenAirdropData | null {
    try {
      const transactionBody = (
        transaction as unknown as { _transactionBody?: proto.ITransactionBody }
      )._transactionBody as proto.ITransactionBody | undefined;

      if (transactionBody?.tokenAirdrop) {
        const airdrop = transactionBody.tokenAirdrop;

        return {
          tokenTransfers: (airdrop.tokenTransfers || []).map(
            (transfer: any) => ({
              tokenId: transfer.token?.toString() || 'Unknown',
              transfers: (transfer.transfers || []).map((t: any) => ({
                accountId: t.accountID?.toString() || 'Unknown',
                amount: t.amount?.toString() || '0',
                serialNumbers: t.serialNumbers?.map((sn: any) => sn.toString()),
              })),
            }),
          ),
        };
      }

      // Check for token airdrop transaction using protobuf data
      if (hasTransactionType(transaction, 'tokenAirdrop')) {
        const txBody = extractTransactionBody(transaction);
        if (txBody?.tokenAirdrop) {
          return this.parseTokenAirdropFromProto(txBody.tokenAirdrop);
        }
      }

      // Fallback: check internal transaction fields for airdrop data
      const tx = transaction as unknown as {
        _tokenTransfers?: Array<{
          tokenId?: { toString(): string } | string;
          transfers?: Array<{
            accountId?: { toString(): string } | string;
            amount?: { toString(): string } | string | number | Long;
            serialNumbers?: Array<{ toString(): string } | string | number | Long>;
          }>;
        }>;
      };
      const tokenTransfersList = tx._tokenTransfers || [];

      if (tokenTransfersList.length > 0) {
        return {
          tokenTransfers: tokenTransfersList.map((transfer: any) => ({
            tokenId: transfer.tokenId?.toString() || 'Unknown',
            transfers: (transfer.transfers || []).map((t: any) => ({
              accountId: t.accountId?.toString() || 'Unknown',
              amount: t.amount?.toString() || '0',
              serialNumbers: t.serialNumbers?.map((sn: any) => sn.toString()),
            })),
          })),
        };
      }

      return null;
    } catch (error) {
      console.warn('[HTSParser] Failed to parse token airdrop:', error);
      return null;
    }
  }

  /**
   * Parse token airdrop from protobuf data for scheduled transactions
   */
  static parseTokenAirdropFromProto(airdrop: any): TokenAirdropData {
    const tokenTransfers = [];

    if (airdrop.tokenTransfers) {
      for (const tokenTransfer of airdrop.tokenTransfers) {
        const token = tokenTransfer.token
          ? new TokenId(
              tokenTransfer.token.shardNum ?? 0,
              tokenTransfer.token.realmNum ?? 0,
              tokenTransfer.token.tokenNum ?? 0,
            )
          : null;
        const transfers = [];

        if (tokenTransfer.transfers) {
          for (const transfer of tokenTransfer.transfers) {
            const accountId = transfer.accountID
              ? new AccountId(
                  transfer.accountID.shardNum ?? 0,
                  transfer.accountID.realmNum ?? 0,
                  transfer.accountID.accountNum ?? 0,
                )
              : null;

            transfers.push({
              accountId: accountId?.toString() || 'Unknown',
              amount: transfer.amount
                ? Long.fromValue(transfer.amount).toString()
                : '0',
              serialNumbers: transfer.serialNumbers?.map((sn: any) =>
                Long.fromValue(sn).toString(),
              ),
            });
          }
        }

        tokenTransfers.push({
          tokenId: token?.toString() || 'Unknown',
          transfers,
        });
      }
    }

    return { tokenTransfers };
  }

  /**
   * Extract token creation data from Transaction object internal fields
   * This handles the case where token creation data is stored in Transaction internals
   */
  static extractTokenCreationFromTransaction(
    transaction: Transaction,
  ): TokenCreationData | null {
    try {
      const tx = transaction as unknown as {
        _tokenName?: string;
        _tokenSymbol?: string;
        _initialSupply?: number | Long;
        _decimals?: number | Long;
        _treasuryAccountId?: AccountId;
        _maxSupply?: number | Long;
        _tokenType?: unknown;
        _supplyType?: unknown;
        _tokenMemo?: string;
        _adminKey?: unknown;
        _kycKey?: unknown;
        _freezeKey?: unknown;
        _wipeKey?: unknown;
        _supplyKey?: unknown;
        _feeScheduleKey?: unknown;
        _pauseKey?: unknown;
        _metadataKey?: unknown;
        _autoRenewAccountId?: AccountId;
        _autoRenewPeriod?: { seconds?: Long; toString(): string };
        _expirationTime?: { seconds?: Long; toString(): string };
        _customFees?: unknown[];
      };

      if (tx._tokenName || tx._tokenSymbol) {
        const result: TokenCreationData = {
          tokenName: tx._tokenName || 'Unknown Token',
          tokenSymbol: tx._tokenSymbol || 'UNKNOWN',
          initialSupply: tx._initialSupply?.toString() || '0',
          decimals: Number(tx._decimals || 0),
          treasuryAccountId: tx._treasuryAccountId?.toString() || 'Unknown',
        };

        if (tx._maxSupply) {
          result.maxSupply = tx._maxSupply.toString();
        }

        if (tx._tokenType) {
          result.tokenType = tx._tokenType.toString
            ? tx._tokenType.toString()
            : String(tx._tokenType);
        }

        if (tx._supplyType) {
          result.supplyType = tx._supplyType.toString
            ? tx._supplyType.toString()
            : String(tx._supplyType);
        }

        if (tx._tokenMemo) {
          result.memo = tx._tokenMemo;
        }

        if (tx._adminKey) {
          result.adminKey = tx._adminKey.toString();
        }

        if (tx._kycKey) {
          result.kycKey = tx._kycKey.toString();
        }

        if (tx._freezeKey) {
          result.freezeKey = tx._freezeKey.toString();
        }

        if (tx._wipeKey) {
          result.wipeKey = tx._wipeKey.toString();
        }

        if (tx._supplyKey) {
          result.supplyKey = tx._supplyKey.toString();
        }

        if (tx._feeScheduleKey) {
          result.feeScheduleKey = tx._feeScheduleKey.toString();
        }

        if (tx._pauseKey) {
          result.pauseKey = tx._pauseKey.toString();
        }

        if (tx._metadataKey) {
          result.metadataKey = tx._metadataKey.toString();
        }

        if (tx._autoRenewAccountId) {
          result.autoRenewAccount = tx._autoRenewAccountId.toString();
        }

        if (tx._autoRenewPeriod) {
          result.autoRenewPeriod =
            tx._autoRenewPeriod.seconds?.toString() ||
            tx._autoRenewPeriod.toString();
        }

        if (tx._expirationTime) {
          result.expiry =
            tx._expirationTime.seconds?.toString() ||
            tx._expirationTime.toString();
        }

        if (
          tx._customFees &&
          Array.isArray(tx._customFees) &&
          tx._customFees.length > 0
        ) {
          result.customFees = tx._customFees.map((fee: any) => {
            const customFee: CustomFeeData = {
              feeCollectorAccountId:
                fee.feeCollectorAccountId?.toString() || '',
              feeType: 'FIXED_FEE',
            };

            if (fee.fixedFee) {
              customFee.feeType = 'FIXED_FEE';
              customFee.fixedFee = {
                amount: fee.fixedFee.amount?.toString() || '0',
                denominatingTokenId:
                  fee.fixedFee.denominatingTokenId?.toString(),
              };
            } else if (fee.fractionalFee) {
              customFee.feeType = 'FRACTIONAL_FEE';
              customFee.fractionalFee = {
                numerator: fee.fractionalFee.numerator?.toString() || '0',
                denominator: fee.fractionalFee.denominator?.toString() || '1',
                minimumAmount:
                  fee.fractionalFee.minimumAmount?.toString() || '0',
                maximumAmount:
                  fee.fractionalFee.maximumAmount?.toString() || '0',
                netOfTransfers: fee.fractionalFee.netOfTransfers || false,
              };
            } else if (fee.royaltyFee) {
              customFee.feeType = 'ROYALTY_FEE';
              customFee.royaltyFee = {
                numerator: fee.royaltyFee.numerator?.toString() || '0',
                denominator: fee.royaltyFee.denominator?.toString() || '1',
                fallbackFee: fee.royaltyFee.fallbackFee
                  ? {
                      amount:
                        fee.royaltyFee.fallbackFee.amount?.toString() || '0',
                      denominatingTokenId:
                        fee.royaltyFee.fallbackFee.denominatingTokenId?.toString(),
                    }
                  : undefined,
              };
            }

            customFee.allCollectorsAreExempt =
              fee.allCollectorsAreExempt || false;
            return customFee;
          });
        }

        return result;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract token airdrop data from Transaction object internal fields
   * This handles the case where airdrop data is stored in Transaction internals
   */
  static extractTokenAirdropFromTransaction(
    transaction: Transaction,
  ): TokenAirdropData | null {
    try {
      const tx = transaction as unknown as {
        _tokenAirdrops?: Array<{
          tokenId?: { toString(): string };
          transfers?: Array<{
            accountId?: { toString(): string };
            amount?: { toString(): string };
            serialNumbers?: Array<{ toString(): string }>;
          }>;
        }>;
      };

      if (tx._tokenAirdrops && Array.isArray(tx._tokenAirdrops)) {
        const tokenTransfers = tx._tokenAirdrops.map(airdrop => ({
          tokenId: airdrop.tokenId?.toString() || 'Unknown',
          transfers: (airdrop.transfers || []).map(transfer => ({
            accountId: transfer.accountId?.toString() || 'Unknown',
            amount: transfer.amount?.toString() || '0',
            serialNumbers: transfer.serialNumbers?.map(s => s.toString()) || [],
          })),
        }));

        return { tokenTransfers };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse HTS transaction from Transaction object with comprehensive extraction
   * This is the unified entry point that handles both protobuf and internal field extraction
   */
  static parseFromTransactionObject(transaction: Transaction): {
    type?: string;
    humanReadableType?: string;
    tokenCreation?: TokenCreationData;
    tokenAirdrop?: TokenAirdropData;
    [key: string]: unknown;
  } {
    try {
      try {
        const bytes = transaction.toBytes ? transaction.toBytes() : undefined;
        if (bytes) {
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
              if (txBody.tokenCreation) {
                const tokenCreation = this.parseTokenCreate(txBody.tokenCreation);
                if (tokenCreation) {
                  return {
                    type: 'TOKENCREATE',
                    humanReadableType: 'Token Creation',
                    tokenCreation,
                  };
                }
              }
              if (txBody.tokenMint) {
                const tokenMint = this.parseTokenMint(txBody.tokenMint);
                if (tokenMint) {
                  return {
                    type: 'TOKENMINT',
                    humanReadableType: 'Token Mint',
                    tokenMint,
                  };
                }
              }
              if (txBody.tokenBurn) {
                const tokenBurn = this.parseTokenBurn(txBody.tokenBurn);
                if (tokenBurn) {
                  return {
                    type: 'TOKENBURN',
                    humanReadableType: 'Token Burn',
                    tokenBurn,
                  };
                }
              }
              if (txBody.tokenUpdate) {
                const tokenUpdate = this.parseTokenUpdate(txBody.tokenUpdate);
                if (tokenUpdate) {
                  return {
                    type: 'TOKENUPDATE',
                    humanReadableType: 'Token Update',
                    tokenUpdate,
                  };
                }
              }
              if (txBody.tokenFreeze) {
                const tokenFreeze = this.parseTokenFreeze(txBody.tokenFreeze);
                if (tokenFreeze) {
                  return {
                    type: 'TOKENFREEZE',
                    humanReadableType: 'Token Freeze',
                    tokenFreeze,
                  };
                }
              }
              if (txBody.tokenUnfreeze) {
                const tokenUnfreeze = this.parseTokenUnfreeze(
                  txBody.tokenUnfreeze,
                );
                if (tokenUnfreeze) {
                  return {
                    type: 'TOKENUNFREEZE',
                    humanReadableType: 'Token Unfreeze',
                    tokenUnfreeze,
                  };
                }
              }
              if (txBody.tokenGrantKyc) {
                const tokenGrantKyc = this.parseTokenGrantKyc(
                  txBody.tokenGrantKyc,
                );
                if (tokenGrantKyc) {
                  return {
                    type: 'TOKENGRANTKYC',
                    humanReadableType: 'Token Grant KYC',
                    tokenGrantKyc,
                  };
                }
              }
              if (txBody.tokenRevokeKyc) {
                const tokenRevokeKyc = this.parseTokenRevokeKyc(
                  txBody.tokenRevokeKyc,
                );
                if (tokenRevokeKyc) {
                  return {
                    type: 'TOKENREVOKEKYC',
                    humanReadableType: 'Token Revoke KYC',
                    tokenRevokeKyc,
                  };
                }
              }
              if (txBody.tokenPause) {
                const tokenPause = this.parseTokenPause(txBody.tokenPause);
                if (tokenPause) {
                  return {
                    type: 'TOKENPAUSE',
                    humanReadableType: 'Token Pause',
                    tokenPause,
                  };
                }
              }
              if (txBody.tokenUnpause) {
                const tokenUnpause = this.parseTokenUnpause(txBody.tokenUnpause);
                if (tokenUnpause) {
                  return {
                    type: 'TOKENUNPAUSE',
                    humanReadableType: 'Token Unpause',
                    tokenUnpause,
                  };
                }
              }
              if (txBody.tokenWipe) {
                const tokenWipeAccount = this.parseTokenWipeAccount(
                  txBody.tokenWipe,
                );
                if (tokenWipeAccount) {
                  return {
                    type: 'TOKENWIPEACCOUNT',
                    humanReadableType: 'Token Wipe Account',
                    tokenWipeAccount,
                  } as {
                    type?: string;
                    humanReadableType?: string;
                    tokenWipeAccount?: TokenWipeAccountData;
                  };
                }
              }
              if (txBody.tokenDeletion) {
                const tokenDelete = this.parseTokenDelete(txBody.tokenDeletion);
                if (tokenDelete) {
                  return {
                    type: 'TOKENDELETE',
                    humanReadableType: 'Token Delete',
                    tokenDelete,
                  };
                }
              }
              if (txBody.tokenAssociate) {
                const tokenAssociate = this.parseTokenAssociate(
                  txBody.tokenAssociate,
                );
                if (tokenAssociate) {
                  return {
                    type: 'TOKENASSOCIATE',
                    humanReadableType: 'Token Associate',
                    tokenAssociate,
                  };
                }
              }
              if (txBody.tokenDissociate) {
                const tokenDissociate = this.parseTokenDissociate(
                  txBody.tokenDissociate,
                );
                if (tokenDissociate) {
                  return {
                    type: 'TOKENDISSOCIATE',
                    humanReadableType: 'Token Dissociate',
                    tokenDissociate,
                  };
                }
              }
              if (txBody.tokenFeeScheduleUpdate) {
                const tokenFeeScheduleUpdate = this.parseTokenFeeScheduleUpdate(
                  txBody.tokenFeeScheduleUpdate,
                );
                if (tokenFeeScheduleUpdate) {
                  return {
                    type: 'TOKENFEESCHEDULEUPDATE',
                    humanReadableType: 'Token Fee Schedule Update',
                    tokenFeeScheduleUpdate,
                  };
                }
              }
              if (txBody.tokenAirdrop) {
                const tokenAirdrop = this.parseTokenAirdropFromProto(
                  txBody.tokenAirdrop,
                );
                if (tokenAirdrop) {
                  return {
                    type: 'TOKENAIRDROP',
                    humanReadableType: 'Token Airdrop',
                    tokenAirdrop,
                  };
                }
              }
            }
          }
        }
      } catch (e) {}

      const protoResult = this.parseHTSTransaction(transaction);
      if (protoResult.type) {
        return protoResult;
      }

      const tokenCreation = this.extractTokenCreationFromTransaction(transaction);
      const tokenAirdrop = this.extractTokenAirdropFromTransaction(transaction);
      if (tokenCreation) {
        return {
          type: 'TOKENCREATE',
          humanReadableType: 'Token Creation',
          tokenCreation,
        };
      }
      if (tokenAirdrop) {
        return {
          type: 'TOKENAIRDROP',
          humanReadableType: 'Token Airdrop',
          tokenAirdrop,
        };
      }

      return {};
    } catch (error) {
      return {};
    }
  }
}
