import { TransactionParser } from '../../src/utils/transaction-parser';
import {
  Transaction,
  TokenCreateTransaction,
  TokenAirdropTransaction,
  AccountId,
  TokenId,
} from '@hashgraph/sdk';
import { TransactionParsingError } from '../../src/utils/transaction-parser-types';

describe('TransactionParser', () => {
  describe('Input Validation', () => {
    test('validateTransactionBytes - valid base64', () => {
      const validation =
        TransactionParser.validateTransactionBytes('SGVsbG9Xb3JsZA==');
      expect(validation.isValid).toBe(true);
      expect(validation.format).toBe('base64');
    });

    test('validateTransactionBytes - valid hex', () => {
      const validation = TransactionParser.validateTransactionBytes(
        '0x48656c6c6f576f726c64',
      );
      expect(validation.isValid).toBe(true);
      expect(validation.format).toBe('hex');
    });

    test('validateTransactionBytes - invalid empty string', () => {
      const validation = TransactionParser.validateTransactionBytes('');
      expect(validation.isValid).toBe(false);
      expect(validation.error).toBe(
        'Transaction bytes must be a non-empty string',
      );
    });

    test('validateTransactionBytes - invalid null', () => {
      const validation = TransactionParser.validateTransactionBytes(null);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toBe(
        'Transaction bytes must be a non-empty string',
      );
    });

    test('validateTransactionBytes - invalid hex format', () => {
      const validation =
        TransactionParser.validateTransactionBytes('0xInvalidHex');
      expect(validation.isValid).toBe(false);
      expect(validation.error).toBe('Invalid hex format');
    });

    test('validateTransactionBytes - invalid base64 format', () => {
      const validation =
        TransactionParser.validateTransactionBytes('Invalid@Base64');
      expect(validation.isValid).toBe(false);
      expect(validation.error).toBe('Invalid base64 format');
    });
  });

  describe('Transaction Parsing', () => {
    test('parseTransactionBytes - invalid input returns fallback result', async () => {
      const result = await TransactionParser.parseTransactionBytes('invalid');
      expect(result.type).toBe('UNKNOWN');
      expect(result.details?.parseAttempts).toBeGreaterThan(0);
    });

    test('parseTransactionBytes - valid input with fallback disabled', async () => {
      const mockTransaction = new TokenCreateTransaction();
      mockTransaction.setTokenName('Test Token');
      mockTransaction.setTokenSymbol('TEST');

      const bytes = mockTransaction.toBytes();
      const base64 = Buffer.from(bytes).toString('base64');

      await expect(
        TransactionParser.parseTransactionBytes(base64, {
          enableFallback: false,
        }),
      ).resolves.toBeDefined();
    });

    test('parseTransactionObject - handles Transaction object', () => {
      const mockTransaction = new TokenCreateTransaction();
      mockTransaction.setTokenName('Test Token');
      mockTransaction.setTokenSymbol('TEST');

      const result = TransactionParser.parseTransactionObject(
        mockTransaction as Transaction,
      );

      expect(result.type).toBeDefined();
      expect(result.humanReadableType).toBeDefined();
      expect(result.transfers).toEqual([]);
      expect(result.tokenTransfers).toEqual([]);
    });

    test('parseTransactionObject - with includeRaw option', () => {
      const mockTransaction = new TokenCreateTransaction();
      mockTransaction.setTokenName('Test Token');
      mockTransaction.setTokenSymbol('TEST');

      const result = TransactionParser.parseTransactionObject(
        mockTransaction as Transaction,
        { includeRaw: true },
      );

      expect(result.raw).toBeDefined();
      expect(typeof result.raw).toBe('object');
    });

    test('parseTransactionObject - handles parsing errors', () => {
      const invalidTransaction = {} as Transaction;

      const result =
        TransactionParser.parseTransactionObject(invalidTransaction);

      expect(result.type).toBe('UNKNOWN');
      expect(result.humanReadableType).toBe('Unknown Transaction');
      expect(result.transfers).toEqual([]);
      expect(result.tokenTransfers).toEqual([]);
    });
  });

  describe('Legacy Method Support', () => {
    test('parseTransactionBody - parses scheduled transaction', () => {
      const mockScheduledTx = {
        memo: 'Test transaction',
        transactionFee: 100000000,
        tokenCreation: {
          name: 'Test Token',
          symbol: 'TEST',
          initialSupply: 1000,
          decimals: 2,
        },
      };

      const encoded = Buffer.from(JSON.stringify(mockScheduledTx)).toString(
        'base64',
      );

      const result = TransactionParser.parseTransactionBody(encoded);

      expect(result.type).toBe('UNKNOWN');
      expect(result.humanReadableType).toBe('Unknown Transaction');
    });

    test('parseScheduleResponse - handles schedule response format', () => {
      const mockResponse = {
        transaction_body: Buffer.from('test').toString('base64'),
        memo: 'Test memo',
      };

      const result = TransactionParser.parseScheduleResponse(mockResponse);

      expect(result.type).toBe('UNKNOWN');
      expect(result.humanReadableType).toBe('Unknown Transaction');
    });

    test('parseScheduleResponse - handles missing transaction_body gracefully', () => {
      const mockResponse = {
        memo: 'Test memo',
      };

      const result = TransactionParser.parseScheduleResponse(
        mockResponse as any,
      );
      expect(result.type).toBe('UNKNOWN');
      expect(result.details?.error).toBe(
        'Schedule response missing transaction_body',
      );
    });
  });

  describe('Transaction Type Detection', () => {
    test('detects token creation transaction', () => {
      const mockTxBody = {
        tokenCreation: {
          name: 'Test Token',
          symbol: 'TEST',
        },
      };

      const type = (TransactionParser as any).getTransactionType(mockTxBody);
      expect(type).toBe('TOKENCREATE');
    });

    test('detects crypto transfer transaction', () => {
      const mockTxBody = {
        cryptoTransfer: {
          transfers: [] as any[],
        },
      };

      const type = (TransactionParser as any).getTransactionType(mockTxBody);
      expect(type).toBe('CRYPTOTRANSFER');
    });

    test('detects token airdrop transaction', () => {
      const mockTxBody = {
        tokenAirdrop: {
          tokenTransfers: [] as any[],
        },
      };

      const type = (TransactionParser as any).getTransactionType(mockTxBody);
      expect(type).toBe('TOKENAIRDROP');
    });

    test('detects unknown transaction', () => {
      const mockTxBody = {};

      const type = (TransactionParser as any).getTransactionType(mockTxBody);
      expect(type).toBe('UNKNOWN');
    });
  });

  describe('Human Readable Types', () => {
    test('converts technical type to human readable', () => {
      const humanType = (TransactionParser as any).getHumanReadableType(
        'tokenCreate',
      );
      expect(humanType).toBe('Create Token');
    });

    test('converts crypto transfer to human readable', () => {
      const humanType = (TransactionParser as any).getHumanReadableType(
        'cryptoTransfer',
      );
      expect(humanType).toBe('HBAR Transfer');
    });

    test('converts token airdrop to human readable', () => {
      const humanType = (TransactionParser as any).getHumanReadableType(
        'tokenAirdrop',
      );
      expect(humanType).toBe('Token Airdrop');
    });

    test('handles unknown type', () => {
      const humanType = (TransactionParser as any).getHumanReadableType(
        'unknown',
      );
      expect(humanType).toBe('Unknown Transaction');
    });
  });

  describe('Transaction Summary Generation', () => {
    test('generates summary for token creation', () => {
      const parsedTx = {
        type: 'TOKENCREATE',
        humanReadableType: 'Create Token',
        tokenCreation: {
          tokenName: 'Test Token',
          tokenSymbol: 'TEST',
          initialSupply: '1000',
          customFees: [] as any[],
        },
        transfers: [] as any[],
        tokenTransfers: [] as any[],
        raw: {} as any,
      };

      const summary = TransactionParser.getTransactionSummary(parsedTx);
      expect(summary).toContain('Create token Test Token (TEST)');
      expect(summary).toContain('with initial supply 1000');
    });

    test('generates summary for HBAR transfer', () => {
      const parsedTx = {
        type: 'cryptoTransfer',
        humanReadableType: 'HBAR Transfer',
        transfers: [
          { accountId: '0.0.123', amount: '-10 ℏ' },
          { accountId: '0.0.456', amount: '10 ℏ' },
        ],
        tokenTransfers: [] as any[],
        raw: {} as any,
      };

      const summary = TransactionParser.getTransactionSummary(parsedTx);
      expect(summary).toContain('Transfer of HBAR from');
      expect(summary).toContain('0.0.123');
      expect(summary).toContain('0.0.456');
    });

    test('generates summary for token transfer', () => {
      const parsedTx = {
        type: 'tokenTransfer',
        humanReadableType: 'Token Transfer',
        transfers: [] as any[],
        tokenTransfers: [
          {
            tokenId: '0.0.789',
            accountId: '0.0.123',
            amount: -100,
          },
          {
            tokenId: '0.0.789',
            accountId: '0.0.456',
            amount: 100,
          },
        ],
        raw: {} as any,
      };

      const summary = TransactionParser.getTransactionSummary(parsedTx);
      expect(summary).toContain('Transfer of token 0.0.789');
      expect(summary).toContain('0.0.123');
      expect(summary).toContain('0.0.456');
    });

    test('generates summary for contract call', () => {
      const parsedTx = {
        type: 'contractCall',
        humanReadableType: 'Contract Call',
        contractCall: {
          contractId: '0.0.999',
          gas: 100000,
          amount: 5,
          functionName: 'transfer',
        },
        transfers: [] as any[],
        tokenTransfers: [] as any[],
        raw: {} as any,
      };

      const summary = TransactionParser.getTransactionSummary(parsedTx);
      expect(summary).toContain('Contract call to 0.0.999');
      expect(summary).toContain('100000 gas');
      expect(summary).toContain('5 HBAR');
      expect(summary).toContain('calling function transfer');
    });

    test('generates default summary for unknown transaction', () => {
      const parsedTx = {
        type: 'unknown',
        humanReadableType: 'Unknown Transaction',
        transfers: [] as any[],
        tokenTransfers: [] as any[],
        raw: {} as any,
      };

      const summary = TransactionParser.getTransactionSummary(parsedTx);
      expect(summary).toBe('Unknown Transaction');
    });
  });

  describe('Error Handling', () => {
    test('TransactionParsingError contains proper information', () => {
      const originalError = new Error('Original error');
      const transactionBytes = 'invalid_bytes';

      const parsingError = new TransactionParsingError(
        'Test error message',
        'TEST_CODE',
        originalError,
        transactionBytes,
      );

      expect(parsingError.message).toBe('Test error message');
      expect(parsingError.code).toBe('TEST_CODE');
      expect(parsingError.originalError).toBe(originalError);
      expect(parsingError.transactionBytes).toBe(transactionBytes);
      expect(parsingError.name).toBe('TransactionParsingError');
    });

    test('TransactionParsingError works with default parameters', () => {
      const parsingError = new TransactionParsingError('Test message');

      expect(parsingError.message).toBe('Test message');
      expect(parsingError.code).toBe('PARSING_FAILED');
      expect(parsingError.originalError).toBeUndefined();
      expect(parsingError.transactionBytes).toBeUndefined();
    });
  });

  describe('Helper Method Tests', () => {
    test('isValidHederaTransaction - with invalid bytes', async () => {
      const isValid =
        await TransactionParser.isValidHederaTransaction('invalid');
      expect(isValid).toBe(false);
    });

    test('decodeTransactionBytes - decodes hex format', () => {
      const decoded = (TransactionParser as any).decodeTransactionBytes(
        '0x48656c6c6f',
      );
      expect(decoded).toEqual(new Uint8Array(Buffer.from('Hello')));
    });

    test('decodeTransactionBytes - decodes base64 format', () => {
      const decoded = (TransactionParser as any).decodeTransactionBytes(
        Buffer.from('Hello').toString('base64'),
      );
      expect(decoded).toEqual(new Uint8Array(Buffer.from('Hello')));
    });

    test('createFallbackResult - creates proper fallback structure', () => {
      const error1 = new Error('Primary error');
      const error2 = new Error('Secondary error');
      const transactionBytes = 'test_bytes';

      const fallback = (TransactionParser as any).createFallbackResult(
        transactionBytes,
        error1,
        error2,
      );

      expect(fallback.type).toBe('UNKNOWN');
      expect(fallback.humanReadableType).toBe('Unknown Transaction');
      expect(fallback.details.primaryError).toBe('Primary error');
      expect(fallback.details.secondaryError).toBe('Secondary error');
      expect(fallback.details.parseAttempts).toBe(2);
      expect(fallback.transfers).toEqual([]);
      expect(fallback.tokenTransfers).toEqual([]);
    });
  });

  describe('Integration Tests', () => {
    test('end-to-end parsing with different input formats', async () => {
      const testData = 'SGVsbG9Xb3JsZA==';
      const hexData = '0x' + Buffer.from('HelloWorld').toString('hex');

      const result1 = await TransactionParser.parseTransactionBytes(testData);
      expect(result1.type).toBe('UNKNOWN');
      expect(result1.details?.parseAttempts).toBeGreaterThan(0);

      const result2 = await TransactionParser.parseTransactionBytes(hexData);
      expect(result2.type).toBe('UNKNOWN');
      expect(result2.details?.parseAttempts).toBeGreaterThan(0);
    });

    test('fallback mechanism works correctly', async () => {
      const invalidTx = 'SGVsbG9Xb3JsZA==';

      const result = await TransactionParser.parseTransactionBytes(invalidTx);
      expect(result.type).toBe('UNKNOWN');
      expect(result.details?.parseAttempts).toBeGreaterThan(0);
    });
  });

  describe('TokenCreateTransaction Bug Fix', () => {
    test('should detect TokenCreateTransaction correctly for specific failing bytes', async () => {
      const tokenCreateBytes =
        'Ck4aACJKIgIIeDIA6gFBCgZTVVBQTFkSBVNVUFBMGAIgoI0GKgkIABAAGMSoogFqCAjU0rfIBhAAegUIgM7aA4gBAJABAZgBgICapuqv4wE=';

      const result =
        await TransactionParser.parseTransactionBytes(tokenCreateBytes);

      expect(result.type).toBe('TOKENCREATE');
      expect(result.humanReadableType).toBe('Token Creation');

      expect(result.tokenCreation).toBeDefined();
      if (result.tokenCreation) {
        expect(result.tokenCreation.tokenName).toBe('SUPPLY');
        expect(result.tokenCreation.tokenSymbol).toBe('SUPPL');
      }
    });

    test('should prioritize constructor name detection over parser results', async () => {
      const tokenCreateBytes =
        'Ck4aACJKIgIIeDIA6gFBCgZTVVBQTFkSBVNVUFBMGAIgoI0GKgkIABAAGMSoogFqCAjU0rfIBhAAegUIgM7aA4gBAJABAZgBgICapuqv4wE=';

      const result =
        await TransactionParser.parseTransactionBytes(tokenCreateBytes);

      expect(result.type).not.toBe('UNKNOWN');
      expect(result.type).toBe('TOKENCREATE');
    });
  });
});

describe('TransactionParser bytes-level', () => {
  test('validateTransactionBytes detects hex vs base64', () => {
    const hex = TransactionParser.validateTransactionBytes('0xdeadbeef');
    expect(hex.isValid).toBe(true);
    expect(hex.format).toBe('hex');

    const b64 = TransactionParser.validateTransactionBytes(
      Buffer.from('x').toString('base64'),
    );
    expect(b64.isValid).toBe(true);
    expect(b64.format).toBe('base64');
  });

  test('invalid input is flagged by validation (no throw on decode)', () => {
    const v = TransactionParser.validateTransactionBytes('%%%');
    expect(v.isValid).toBe(false);
  });

  test('parseTransactionBody decodes schedulable body and applies parsing', () => {
    const { proto } = require('@hashgraph/proto');
    const { Hbar, HbarUnit, Long } = require('@hashgraph/sdk');
    const sb = {
      memo: 'm',
      transactionFee: Long.fromValue(100000000),
      cryptoTransfer: {
        transfers: {
          accountAmounts: [
            {
              accountID: { shardNum: 0, realmNum: 0, accountNum: 1 },
              amount: -100,
            },
            {
              accountID: { shardNum: 0, realmNum: 0, accountNum: 2 },
              amount: 100,
            },
          ],
        },
      },
    };
    const base64 = Buffer.from(
      proto.SchedulableTransactionBody.encode(sb).finish(),
    ).toString('base64');
    const parsed = TransactionParser.parseTransactionBody(base64);
    expect(parsed.memo).toBe('m');
    expect(parsed.transactionFee).toBe(
      Hbar.fromTinybars(Long.fromValue(100000000)).toString(HbarUnit.Hbar),
    );
    expect(parsed.transfers?.length).toBe(2);
  });

  test('parseScheduleResponse handles missing body and merges memo', () => {
    const { proto } = require('@hashgraph/proto');
    const r1 = TransactionParser.parseScheduleResponse({
      transaction_body: '',
    });
    expect(r1.type).toBe('UNKNOWN');

    const sb = { memo: 'a' };
    const base64 = Buffer.from(
      proto.SchedulableTransactionBody.encode(sb).finish(),
    ).toString('base64');
    const r2 = TransactionParser.parseScheduleResponse({
      transaction_body: base64,
      memo: 'b',
    });
    expect(r2.memo).toBe('b');
  });

  test('parseTransactionBytes falls back to scheduled parser', async () => {
    const { proto } = require('@hashgraph/proto');
    const sb = { memo: 'fallback' };
    const base64 = Buffer.from(
      proto.SchedulableTransactionBody.encode(sb).finish(),
    ).toString('base64');
    const out = await TransactionParser.parseTransactionBytes(base64, {
      enableFallback: true,
      includeRaw: true,
    });
    expect(out.memo).toBe('fallback');
    expect(out.formatDetection?.originalFormat).toBe('base64');
  });
});

describe('TransactionParser regular flow', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('parseTransactionBytes merges proto and parser results', async () => {
    const { proto } = require('@hashgraph/proto');
    const fakeTx = {
      transactionId: { toString: () => '0.0.100@1.0' },
      nodeAccountIds: [{ toString: () => '0.0.3' }],
      maxTransactionFee: { toTinybars: () => ({ toString: () => '1' }) },
      _transactionMemo: 'memo',
    } as unknown as Transaction;

    jest.spyOn(Transaction, 'fromBytes').mockReturnValue(fakeTx);

    const hts = require('../../src/utils/parsers/hts-parser');
    const hcs = require('../../src/utils/parsers/hcs-parser');
    const file = require('../../src/utils/parsers/file-parser');
    const scs = require('../../src/utils/parsers/scs-parser');
    const sched = require('../../src/utils/parsers/schedule-parser');
    const util = require('../../src/utils/parsers/util-parser');
    const crypto = require('../../src/utils/parsers/crypto-parser');

    jest.spyOn(hts.HTSParser, 'parseFromTransactionObject').mockReturnValue({});
    jest.spyOn(hcs.HCSParser, 'parseFromTransactionObject').mockReturnValue({});
    jest
      .spyOn(file.FileParser, 'parseFromTransactionObject')
      .mockReturnValue({});
    jest.spyOn(scs.SCSParser, 'parseFromTransactionObject').mockReturnValue({});
    jest
      .spyOn(sched.ScheduleParser, 'parseFromTransactionObject')
      .mockReturnValue({});
    jest
      .spyOn(util.UtilParser, 'parseFromTransactionObject')
      .mockReturnValue({});
    jest
      .spyOn(crypto.CryptoParser, 'parseFromTransactionObject')
      .mockReturnValue({
        type: 'CRYPTOTRANSFER',
        humanReadableType: 'Crypto Transfer',
        transfers: [{ accountId: '0.0.1', amount: '1 ℏ' }],
        tokenTransfers: [],
      });

    jest.spyOn(proto.TransactionList, 'decode').mockReturnValue({
      transactionList: [{ bodyBytes: new Uint8Array([1]) }],
    } as any);
    jest.spyOn(proto.TransactionBody, 'decode').mockReturnValue({
      tokenCreation: {
        name: 'X',
        symbol: 'Y',
        treasury: { shardNum: 0, realmNum: 0, accountNum: 1 },
      },
    } as any);

    const out = await TransactionParser.parseTransactionBytes('0x00', {
      includeRaw: true,
      enableFallback: false,
    });

    expect(out.type).toBe('TOKENCREATE');
    expect(out.transfers?.length).toBe(1);
    expect(out.details?.memo || out.memo).toBeDefined();
  });
});
