import { HTSParser } from '../parsers/hts-parser';
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
                token: { toString: () => '0.0.123', shardNum: 0, realmNum: 0, tokenNum: 123 },
                transfers: [
                  {
                    accountID: { toString: () => '0.0.456', shardNum: 0, realmNum: 0, accountNum: 456 },
                    amount: { toString: () => '100' },
                    serialNumbers: [] as number[],
                  },
                ],
              },
            ],
          } satisfies MockTokenAirdrop,
        },
      };

      const result = HTSParser.parseTokenAirdrop(mockTransaction as unknown as Transaction);

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

      const result = HTSParser.parseTokenAirdrop(mockTransaction as unknown as Transaction);

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

      const result = HTSParser.parseTokenAirdrop(mockTransaction as unknown as Transaction);
      expect(result).toBeNull();
    });

    test('parseTokenAirdrop - handles parsing errors gracefully', () => {
      const mockTransaction = {
        _transactionBody: {
          tokenAirdrop: null as unknown,
        },
      };

      const result = HTSParser.parseTokenAirdrop(mockTransaction as unknown as Transaction);
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

      const result = HTSParser.parseTokenAirdrop(mockTransaction as unknown as Transaction);

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

      const result = HTSParser.parseHTSTransaction(mockTransaction as unknown as Transaction);

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

      const result = HTSParser.parseHTSTransaction(mockTransaction as unknown as Transaction);

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

      const result = HTSParser.parseHTSTransaction(mockTransaction as unknown as Transaction);
      expect(result).toEqual({});
    });

    test('parseHTSTransaction - handles parsing errors gracefully', () => {
      const mockTransaction = {
        _transactionBody: null as unknown,
      };

      const result = HTSParser.parseHTSTransaction(mockTransaction as unknown as Transaction);
      expect(result).toEqual({});
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
