import { HTSParser } from '../../src/utils/parsers/hts-parser';
import {
  Transaction,
  TokenCreateTransaction,
  TokenAirdropTransaction,
} from '@hashgraph/sdk';

interface MockAccountId {
  shardNum: number;
  realmNum: number;
  accountNum: number;
  toString(): string;
}

interface MockTokenId {
  shardNum: number;
  realmNum: number;
  tokenNum: number;
  toString(): string;
}

interface MockTokenAirdrop {
  tokenTransfers: Array<{
    token: MockTokenId;
    transfers: Array<{
      accountID: MockAccountId;
      amount: { toString(): string };
      serialNumbers: number[];
    }>;
  }>;
}

interface MockTokenCreation {
  name: string;
  symbol: string;
  treasury: MockAccountId;
  initialSupply: number;
  decimals: number;
  customFees: unknown[];
}

interface MockTokenMint {
  token: MockTokenId;
  amount: number;
}

interface MockTokenBurn {
  token: MockTokenId;
  amount: number;
}

interface MockTokenAssociate {
  account: MockAccountId;
  tokens: MockTokenId[];
}

interface MockTokenDissociate {
  account: MockAccountId;
  tokens: MockTokenId[];
}

describe('HTSParser', () => {
  describe('Token Airdrop Parsing', () => {
    test('parseTokenAirdrop - parses airdrop from transaction body', () => {
      const mockTransaction = {
        _transactionBody: {
          tokenAirdrop: {
            tokenTransfers: [
              {
                token: {
                  toString: () => '0.0.123',
                  shardNum: 0,
                  realmNum: 0,
                  tokenNum: 123,
                },
                transfers: [
                  {
                    accountID: {
                      toString: () => '0.0.456',
                      shardNum: 0,
                      realmNum: 0,
                      accountNum: 456,
                    },
                    amount: { toString: () => '100' },
                    serialNumbers: [] as number[],
                  },
                ],
              },
            ],
          } satisfies MockTokenAirdrop,
        },
      };

      const result = HTSParser.parseTokenAirdrop(
        mockTransaction as unknown as Transaction,
      );

      expect(result).not.toBeNull();
      expect(result!.tokenTransfers).toHaveLength(1);
      expect(result!.tokenTransfers[0].tokenId).toBe('0.0.123');
      expect(result!.tokenTransfers[0].transfers).toHaveLength(1);
      expect(result!.tokenTransfers[0].transfers[0].accountId).toBe('0.0.456');
      expect(result!.tokenTransfers[0].transfers[0].amount).toBe('100');
    });

    test('parseTokenAirdrop - handles TokenAirdropTransaction instance', () => {
      const mockTransaction = {
        constructor: { name: 'TokenAirdropTransaction' },
        _tokenTransfers: [
          {
            tokenId: { toString: () => '0.0.789' },
            transfers: [
              {
                accountId: { toString: () => '0.0.101' },
                amount: { toString: () => '50' },
              },
            ],
          },
        ],
      };

      const result = HTSParser.parseTokenAirdrop(
        mockTransaction as unknown as Transaction,
      );

      expect(result).not.toBeNull();
      expect(result!.tokenTransfers).toHaveLength(1);
      expect(result!.tokenTransfers[0].tokenId).toBe('0.0.789');
      expect(result!.tokenTransfers[0].transfers[0].accountId).toBe('0.0.101');
      expect(result!.tokenTransfers[0].transfers[0].amount).toBe('50');
    });

    test('parseTokenAirdrop - returns null for non-airdrop transaction', () => {
      const mockTransaction = {
        _transactionBody: {
          cryptoTransfer: {
            transfers: [] as unknown[],
          },
        },
        constructor: { name: 'CryptoTransferTransaction' },
      };

      const result = HTSParser.parseTokenAirdrop(
        mockTransaction as unknown as Transaction,
      );
      expect(result).toBeNull();
    });

    test('parseTokenAirdrop - handles parsing errors gracefully', () => {
      const mockTransaction = {
        _transactionBody: {
          tokenAirdrop: null as unknown,
        },
      };

      const result = HTSParser.parseTokenAirdrop(
        mockTransaction as unknown as Transaction,
      );
      expect(result).toBeNull();
    });

    test('parseTokenAirdrop - handles serial numbers for NFTs', () => {
      const mockTransaction = {
        _transactionBody: {
          tokenAirdrop: {
            tokenTransfers: [
              {
                token: { toString: () => '0.0.999' },
                transfers: [
                  {
                    accountID: { toString: () => '0.0.888' },
                    amount: { toString: () => '0' },
                    serialNumbers: [
                      { toString: () => '1' },
                      { toString: () => '2' },
                    ],
                  },
                ],
              },
            ],
          },
        },
      };

      const result = HTSParser.parseTokenAirdrop(
        mockTransaction as unknown as Transaction,
      );

      expect(result).not.toBeNull();
      expect(result!.tokenTransfers[0].transfers[0].serialNumbers).toEqual([
        '1',
        '2',
      ]);
    });
  });

  describe('Token Airdrop Protobuf Parsing', () => {
    test('parseTokenAirdropFromProto - parses protobuf airdrop data', () => {
      const mockAirdrop = {
        tokenTransfers: [
          {
            token: null as unknown,
            transfers: [
              {
                accountID: null as unknown,
                amount: 250,
                serialNumbers: [1, 2, 3],
              },
            ],
          },
        ],
      };

      const result = HTSParser.parseTokenAirdropFromProto(mockAirdrop);

      expect(result.tokenTransfers).toHaveLength(1);
      expect(result.tokenTransfers[0].transfers).toHaveLength(1);
      expect(result.tokenTransfers[0].tokenId).toBe('Unknown');
      expect(result.tokenTransfers[0].transfers[0].accountId).toBe('Unknown');
      expect(result.tokenTransfers[0].transfers[0].amount).toBe('250');
    });

    test('parseTokenAirdropFromProto - handles empty data', () => {
      const mockAirdrop = {
        tokenTransfers: [] as unknown[],
      };

      const result = HTSParser.parseTokenAirdropFromProto(mockAirdrop);
      expect(result.tokenTransfers).toEqual([]);
    });

    test('parseTokenAirdropFromProto - handles null token transfers', () => {
      const mockAirdrop = {};

      const result = HTSParser.parseTokenAirdropFromProto(mockAirdrop);
      expect(result.tokenTransfers).toEqual([]);
    });
  });

  describe('HTS Transaction Parsing Integration', () => {
    test('parseHTSTransaction - detects airdrop transaction', () => {
      const mockTransaction = {
        _transactionBody: {
          tokenAirdrop: {
            tokenTransfers: [
              {
                token: { toString: () => '0.0.555' },
                transfers: [
                  {
                    accountID: { toString: () => '0.0.666' },
                    amount: { toString: () => '75' },
                  },
                ],
              },
            ],
          },
        },
      };

      const originalParseTokenAirdrop = HTSParser.parseTokenAirdrop;
      HTSParser.parseTokenAirdrop = jest.fn().mockReturnValue({
        tokenTransfers: [
          {
            tokenId: '0.0.555',
            transfers: [
              {
                accountId: '0.0.666',
                amount: '75',
              },
            ],
          },
        ],
      });

      const result = HTSParser.parseHTSTransaction(
        mockTransaction as unknown as Transaction,
      );

      expect(result.type).toBe('TOKENAIRDROP');
      expect(result.humanReadableType).toBe('Token Airdrop');
      expect(result.tokenAirdrop).toBeDefined();

      HTSParser.parseTokenAirdrop = originalParseTokenAirdrop;
    });

    test('parseHTSTransaction - handles token creation', () => {
      const mockTransaction = {
        _transactionBody: {
          tokenCreation: {
            name: 'Test Token',
            symbol: 'TEST',
            treasury: {
              shardNum: 0,
              realmNum: 0,
              accountNum: 123,
            },
          },
        },
      };

      const result = HTSParser.parseHTSTransaction(
        mockTransaction as unknown as Transaction,
      );

      expect(result.type).toBe('TOKENCREATE');
      expect(result.humanReadableType).toBe('Token Creation');
    });

    test('parseHTSTransaction - returns empty for non-HTS transaction', () => {
      const mockTransaction = {
        _transactionBody: {
          cryptoTransfer: {
            transfers: [] as unknown[],
          },
        },
      };

      const result = HTSParser.parseHTSTransaction(
        mockTransaction as unknown as Transaction,
      );
      expect(result).toEqual({});
    });

    test('parseHTSTransaction - handles parsing errors gracefully', () => {
      const mockTransaction = {
        _transactionBody: null as unknown,
      };

      const result = HTSParser.parseHTSTransaction(
        mockTransaction as unknown as Transaction,
      );
      expect(result).toEqual({});
    });
  });

  describe('Token Update & Fee Schedule Update', () => {
    test('parseTokenUpdate maps fields and keys', () => {
      const body = {
        token: { shardNum: 0, realmNum: 0, tokenNum: 1 },
        name: 'N',
        symbol: 'S',
        treasury: { shardNum: 0, realmNum: 0, accountNum: 2 },
        adminKey: { ed25519: Uint8Array.from([1]) },
        kycKey: { ed25519: Uint8Array.from([2]) },
        freezeKey: { ed25519: Uint8Array.from([3]) },
        wipeKey: { ed25519: Uint8Array.from([4]) },
        supplyKey: { ed25519: Uint8Array.from([5]) },
        feeScheduleKey: { ed25519: Uint8Array.from([6]) },
        pauseKey: { ed25519: Uint8Array.from([7]) },
        autoRenewAccount: { shardNum: 0, realmNum: 0, accountNum: 3 },
        autoRenewPeriod: { seconds: 9 },
        memo: { value: 'mm' },
        expiry: { seconds: 10, nanos: 1 },
      } satisfies import('@hashgraph/proto').proto.ITokenUpdateTransactionBody;
      const r =
        require('../../src/utils/parsers/hts-parser').HTSParser.parseTokenUpdate(
          body,
        );
      expect(r?.tokenId).toBe('0.0.1');
      expect(r?.name).toBe('N');
      expect(r?.symbol).toBe('S');
      expect(r?.treasuryAccountId).toBe('0.0.2');
      expect(r?.adminKey).toContain('ED25519');
      expect(r?.feeScheduleKey).toContain('ED25519');
      expect(r?.autoRenewAccountId).toBe('0.0.3');
      expect(r?.autoRenewPeriod).toBe('9');
      expect(r?.memo).toBe('mm');
      expect(r?.expiry?.startsWith('10.')).toBe(true);
    });

    test('parseTokenFeeScheduleUpdate supports fixed/fractional/royalty', () => {
      const body = {
        tokenId: { shardNum: 0, realmNum: 0, tokenNum: 9 },
        customFees: [
          {
            feeCollectorAccountId: { shardNum: 0, realmNum: 0, accountNum: 5 },
            fixedFee: { amount: 1 },
          },
          {
            feeCollectorAccountId: { shardNum: 0, realmNum: 0, accountNum: 6 },
            fractionalFee: {
              fractionalAmount: { numerator: 1, denominator: 2 },
              minimumAmount: 0,
              maximumAmount: 100,
              netOfTransfers: true,
            },
          },
          {
            feeCollectorAccountId: { shardNum: 0, realmNum: 0, accountNum: 7 },
            royaltyFee: {
              exchangeValueFraction: { numerator: 1, denominator: 10 },
              fallbackFee: {
                amount: 3,
                denominatingTokenId: { shardNum: 0, realmNum: 0, tokenNum: 9 },
              },
            },
          },
        ],
      } satisfies import('@hashgraph/proto').proto.ITokenFeeScheduleUpdateTransactionBody;
      const r =
        require('../../src/utils/parsers/hts-parser').HTSParser.parseTokenFeeScheduleUpdate(
          body,
        );
      expect(r?.tokenId).toBe('0.0.9');
      expect(r?.customFees?.length).toBe(3);
      const fixed = r!.customFees![0];
      const frac = r!.customFees![1];
      const roy = r!.customFees![2];
      expect(fixed.feeType).toBe('FIXED_FEE');
      expect(frac.feeType).toBe('FRACTIONAL_FEE');
      expect(frac.fractionalFee?.denominator).toBe('2');
      expect(roy.feeType).toBe('ROYALTY_FEE');
      expect(roy.royaltyFee?.fallbackFee?.denominatingTokenId).toBe('0.0.9');
    });

    test('parseTokenWipeAccount handles amount and serial numbers', () => {
      const withAmount = {
        token: { shardNum: 0, realmNum: 0, tokenNum: 1 },
        account: { shardNum: 0, realmNum: 0, accountNum: 2 },
        amount: 10,
      } satisfies import('@hashgraph/proto').proto.ITokenWipeAccountTransactionBody;
      const a =
        require('../../src/utils/parsers/hts-parser').HTSParser.parseTokenWipeAccount(
          withAmount,
        );
      expect(a?.amount).toBe('10');

      const withSerials = {
        token: { shardNum: 0, realmNum: 0, tokenNum: 1 },
        account: { shardNum: 0, realmNum: 0, accountNum: 2 },
        serialNumbers: [1, 2, 3],
      } satisfies import('@hashgraph/proto').proto.ITokenWipeAccountTransactionBody;
      const b =
        require('../../src/utils/parsers/hts-parser').HTSParser.parseTokenWipeAccount(
          withSerials,
        );
      expect(b?.serialNumbers).toEqual(['1', '2', '3']);
    });
  });

  describe('Token Creation Parsing', () => {
    test('parseTokenCreate - parses token creation data', () => {
      const mockTokenCreation = {
        name: 'My Token',
        symbol: 'MTK',
        treasury: {
          shardNum: 0 as any,
          realmNum: 0 as any,
          accountNum: 456 as any,
          toString: () => '0.0.456',
        },
        initialSupply: 1000000 as any,
        decimals: 18,
        customFees: [] as unknown[],
      };

      const result = HTSParser.parseTokenCreate(mockTokenCreation);

      expect(result).toBeDefined();
      expect(result!.tokenName).toBe('My Token');
      expect(result!.tokenSymbol).toBe('MTK');
      expect(result!.treasuryAccountId).toBe('0.0.456');
      expect(result!.initialSupply).toBe('1000000');
      expect(result!.decimals).toBe(18);
    });

    test('parseTokenCreate - returns undefined for null input', () => {
      const result = HTSParser.parseTokenCreate(null);
      expect(result).toBeUndefined();
    });
  });

  describe('Other Token Operations', () => {
    test('parseTokenMint - parses mint data', () => {
      const mockMint = {
        token: {
          shardNum: 0 as any,
          realmNum: 0 as any,
          tokenNum: 789 as any,
          toString: () => '0.0.789',
        },
        amount: 5000 as any,
      };

      const result = HTSParser.parseTokenMint(mockMint);

      expect(result).toBeDefined();
      expect(result!.tokenId).toBe('0.0.789');
      expect(result!.amount).toBe(5000);
    });

    test('parseTokenBurn - parses burn data', () => {
      const mockBurn = {
        token: {
          shardNum: 0 as any,
          realmNum: 0 as any,
          tokenNum: 321 as any,
          toString: () => '0.0.321',
        },
        amount: 2500 as any,
      };

      const result = HTSParser.parseTokenBurn(mockBurn);

      expect(result).toBeDefined();
      expect(result!.tokenId).toBe('0.0.321');
      expect(result!.amount).toBe(2500);
    });

    test('parseTokenAssociate - parses association data', () => {
      const mockAssociate = {
        account: {
          shardNum: 0 as any,
          realmNum: 0 as any,
          accountNum: 111 as any,
          toString: () => '0.0.111',
        },
        tokens: [
          {
            shardNum: 0 as any,
            realmNum: 0 as any,
            tokenNum: 222 as any,
            toString: () => '0.0.222',
          },
          {
            shardNum: 0 as any,
            realmNum: 0 as any,
            tokenNum: 333 as any,
            toString: () => '0.0.333',
          },
        ],
      };

      const result = HTSParser.parseTokenAssociate(mockAssociate);

      expect(result).toBeDefined();
      expect(result!.accountId).toBe('0.0.111');
      expect(result!.tokenIds).toEqual(['0.0.222', '0.0.333']);
    });

    test('parseTokenDissociate - parses dissociation data', () => {
      const mockDissociate = {
        account: {
          shardNum: 0 as any,
          realmNum: 0 as any,
          accountNum: 444 as any,
          toString: () => '0.0.444',
        },
        tokens: [
          {
            shardNum: 0 as any,
            realmNum: 0 as any,
            tokenNum: 555 as any,
            toString: () => '0.0.555',
          },
        ],
      };

      const result = HTSParser.parseTokenDissociate(mockDissociate);

      expect(result).toBeDefined();
      expect(result!.accountId).toBe('0.0.444');
      expect(result!.tokenIds).toEqual(['0.0.555']);
    });
  });
});

describe('HTSParser branches', () => {
  test('freeze/unfreeze/grantKyc/revokeKyc/pause/unpause/delete', () => {
    expect(
      require('../../src/utils/parsers/hts-parser').HTSParser.parseTokenFreeze({
        token: { shardNum: 0, realmNum: 0, tokenNum: 1 },
        account: { shardNum: 0, realmNum: 0, accountNum: 2 },
      })?.tokenId,
    ).toBe('0.0.1');
    expect(
      require('../../src/utils/parsers/hts-parser').HTSParser.parseTokenUnfreeze(
        {
          token: { shardNum: 0, realmNum: 0, tokenNum: 1 },
          account: { shardNum: 0, realmNum: 0, accountNum: 2 },
        },
      )?.accountId,
    ).toBe('0.0.2');
    expect(
      require('../../src/utils/parsers/hts-parser').HTSParser.parseTokenGrantKyc(
        {
          token: { shardNum: 0, realmNum: 0, tokenNum: 3 },
          account: { shardNum: 0, realmNum: 0, accountNum: 4 },
        },
      )?.tokenId,
    ).toBe('0.0.3');
    expect(
      require('../../src/utils/parsers/hts-parser').HTSParser.parseTokenRevokeKyc(
        {
          token: { shardNum: 0, realmNum: 0, tokenNum: 3 },
          account: { shardNum: 0, realmNum: 0, accountNum: 4 },
        },
      )?.accountId,
    ).toBe('0.0.4');
    expect(
      require('../../src/utils/parsers/hts-parser').HTSParser.parseTokenPause({
        token: { shardNum: 0, realmNum: 0, tokenNum: 5 },
      })?.tokenId,
    ).toBe('0.0.5');
    expect(
      require('../../src/utils/parsers/hts-parser').HTSParser.parseTokenUnpause(
        { token: { shardNum: 0, realmNum: 0, tokenNum: 6 } },
      )?.tokenId,
    ).toBe('0.0.6');
    expect(
      require('../../src/utils/parsers/hts-parser').HTSParser.parseTokenDelete({
        token: { shardNum: 0, realmNum: 0, tokenNum: 7 },
      })?.tokenId,
    ).toBe('0.0.7');
  });

  test('mint metadata and burn serialNumbers branches', () => {
    const { HTSParser } = require('../../src/utils/parsers/hts-parser');
    const m = HTSParser.parseTokenMint({
      token: { shardNum: 0, realmNum: 0, tokenNum: 9 },
      amount: 1,
      metadata: [new Uint8Array([1, 2, 3])],
    });
    expect(m?.metadata?.[0]).toBe(Buffer.from([1, 2, 3]).toString('base64'));

    const b = HTSParser.parseTokenBurn({
      token: { shardNum: 0, realmNum: 0, tokenNum: 9 },
      amount: 0,
      serialNumbers: [1, 2],
    });
    expect(b?.serialNumbers).toEqual([1, 2]);
  });

  test('extractTokenCreationFromTransaction internal fields', () => {
    const fakeTx = {
      _tokenName: 'T',
      _tokenSymbol: 'TOK',
      _initialSupply: 100,
      _decimals: 2,
      _treasuryAccountId: { toString: () => '0.0.100' },
      _maxSupply: 1000,
      _tokenType: 'FUNGIBLE_COMMON',
      _supplyType: 'FINITE',
      _tokenMemo: 'memo',
      _adminKey: { toString: () => 'k1' },
      _kycKey: { toString: () => 'k2' },
      _freezeKey: { toString: () => 'k3' },
      _wipeKey: { toString: () => 'k4' },
      _supplyKey: { toString: () => 'k5' },
      _feeScheduleKey: { toString: () => 'k6' },
      _pauseKey: { toString: () => 'k7' },
      _metadataKey: { toString: () => 'k8' },
      _autoRenewAccountId: { toString: () => '0.0.200' },
      _autoRenewPeriod: { toString: () => '10' },
      _expirationTime: { toString: () => '20' },
      _customFees: [
        {
          fixedFee: {
            amount: 1,
            denominatingTokenId: { toString: () => '0.0.9' },
          },
          allCollectorsAreExempt: true,
          feeCollectorAccountId: { toString: () => '0.0.5' },
        },
      ],
    } as unknown;

    const { HTSParser } = require('../../src/utils/parsers/hts-parser');
    const r = HTSParser.extractTokenCreationFromTransaction(fakeTx as any)!;
    expect(r.tokenName).toBe('T');
    expect(r.tokenSymbol).toBe('TOK');
    expect(r.treasuryAccountId).toBe('0.0.100');
    expect(r.maxSupply).toBe('1000');
    expect(r.memo).toBe('memo');
    expect(r.autoRenewAccount).toBe('0.0.200');
    expect(r.autoRenewPeriod).toBe('10');
    expect(r.expiry).toBe('20');
    expect(r.customFees?.[0].feeType).toBe('FIXED_FEE');
  });

  test('extractTokenAirdropFromTransaction internal list', () => {
    const fakeTx = {
      _tokenAirdrops: [
        {
          tokenId: { toString: () => '0.0.9' },
          transfers: [
            {
              accountId: { toString: () => '0.0.1' },
              amount: { toString: () => '5' },
              serialNumbers: [{ toString: () => '1' }],
            },
          ],
        },
      ],
    } as unknown;
    const { HTSParser } = require('../../src/utils/parsers/hts-parser');
    const out = HTSParser.extractTokenAirdropFromTransaction(fakeTx as any);
    expect(out?.tokenTransfers[0].tokenId).toBe('0.0.9');
    expect(out?.tokenTransfers[0].transfers[0].serialNumbers).toEqual(['1']);
  });

  test('parseFromTransactionObject maps tokenDeletion path from _transactionBody', () => {
    const fakeTx = {
      _transactionBody: {
        tokenDeletion: { token: { shardNum: 0, realmNum: 0, tokenNum: 1 } },
      },
    } as unknown;
    const { HTSParser } = require('../../src/utils/parsers/hts-parser');
    const r = HTSParser.parseFromTransactionObject(fakeTx as any);
    expect((r as any).tokenDelete.tokenId).toBe('0.0.1');
  });
});
