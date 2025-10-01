import { ScheduleParser } from '../../src/utils/parsers/schedule-parser';
import { Transaction } from '@hashgraph/sdk';
import * as parserUtils from '../../src/utils/parsers/parser-utils';

jest.mock('../../src/utils/parsers/parser-utils');

describe('ScheduleParser', () => {
  const mockHasTransactionType =
    parserUtils.hasTransactionType as jest.MockedFunction<
      typeof parserUtils.hasTransactionType
    >;
  const mockParseKey = parserUtils.parseKey as jest.MockedFunction<
    typeof parserUtils.parseKey
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHasTransactionType.mockReturnValue(false);
    mockParseKey.mockImplementation(
      (key: any) => key?.toString() || 'parsed_key',
    );
  });

  describe('Schedule Create Parsing', () => {
    test('parseScheduleCreate - parses from transaction internals', () => {
      mockHasTransactionType.mockImplementation((_, type) => type === 'scheduleCreate');
      mockHasTransactionType.mockImplementation((_, type) => type === 'scheduleCreate');
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _scheduledTransaction: new Uint8Array([1, 2, 3, 4]),
        _scheduleMemo: 'Test schedule',
        _adminKey: { toString: () => 'admin_key_string' },
        _payerAccountId: { toString: () => '0.0.123' },
        _expirationTime: { toString: () => '1234567890' },
        _waitForExpiry: true,
        constructor: { name: 'ScheduleCreateTransaction' },
      };

      const result = ScheduleParser.parseScheduleCreate(mockTransaction as unknown as Transaction);

      expect(result).not.toBeNull();
      expect(result!.scheduledTransactionBody).toBeDefined();
      expect(result!.memo).toBe('Test schedule');
      expect(result!.adminKey).toBe('admin_key_string');
      expect(result!.payerAccountId).toBe('0.0.123');
      expect(result!.expirationTime).toBe('1234567890');
      expect(result!.waitForExpiry).toBe(true);
    });

    test('parseScheduleCreate - parses from ScheduleCreateTransaction instance', () => {
      mockHasTransactionType.mockImplementation((_, type) => type === 'scheduleCreate');
      mockHasTransactionType.mockImplementation((_, type) => type === 'scheduleCreate');
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        constructor: { name: 'ScheduleCreateTransaction' },
        _scheduledTransaction: new Uint8Array([5, 6, 7, 8]),
        _scheduleMemo: 'Instance memo',
        _adminKey: { toString: () => 'instance_admin_key' },
        _payerAccountId: { toString: () => '0.0.456' },
        _expirationTime: { toString: () => '9876543210' },
        _waitForExpiry: false,
      };

      const result = ScheduleParser.parseScheduleCreate(mockTransaction as unknown as Transaction);

      expect(result).not.toBeNull();
      expect(result!.scheduledTransactionBody).toBeDefined();
      expect(result!.memo).toBe('Instance memo');
      expect(result!.adminKey).toBe('instance_admin_key');
      expect(result!.payerAccountId).toBe('0.0.456');
      expect(result!.expirationTime).toBe('9876543210');
      expect(result!.waitForExpiry).toBe(false);
    });

    test('parseScheduleCreate - returns null for non-schedule transaction', () => {
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _transactionBody: {
          cryptoTransfer: {},
        },
        constructor: { name: 'CryptoTransferTransaction' },
      };

      const result = ScheduleParser.parseScheduleCreate(mockTransaction as unknown as Transaction);
      expect(result).toBeNull();
    });

    test('parseScheduleCreate - handles parsing errors gracefully', () => {
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _transactionBody: null as unknown,
        constructor: { name: 'SomeOtherTransaction' },
      };

      const result = ScheduleParser.parseScheduleCreate(mockTransaction as unknown as Transaction);
      expect(result).toBeNull();
    });
  });

  describe('Schedule Sign Parsing', () => {
    test('parseScheduleSign - parses from transaction body', () => {
      mockHasTransactionType.mockImplementation((_, type) => type === 'scheduleSign');
      mockHasTransactionType.mockImplementation((_, type) => type === 'scheduleSign');
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _transactionBody: {
          scheduleSign: {
            scheduleID: { toString: () => '0.0.789' },
          },
        },
        _scheduleId: { toString: () => '0.0.789' },
      };

      const result = ScheduleParser.parseScheduleSign(mockTransaction as unknown as Transaction);

      expect(result).not.toBeNull();
      expect(result!.scheduleId).toBe('0.0.789');
    });

    test('parseScheduleSign - parses from ScheduleSignTransaction instance', () => {
      mockHasTransactionType.mockImplementation((_, type) => type === 'scheduleSign');
      mockHasTransactionType.mockImplementation((_, type) => type === 'scheduleSign');
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        constructor: { name: 'ScheduleSignTransaction' },
        _scheduleId: { toString: () => '0.0.987' },
      };

      const result = ScheduleParser.parseScheduleSign(mockTransaction as unknown as Transaction);

      expect(result).not.toBeNull();
      expect(result!.scheduleId).toBe('0.0.987');
    });

    test('parseScheduleSign - returns null for non-schedule transaction', () => {
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _transactionBody: {
          cryptoTransfer: {},
        },
        constructor: { name: 'CryptoTransferTransaction' },
      };

      const result = ScheduleParser.parseScheduleSign(mockTransaction as unknown as Transaction);
      expect(result).toBeNull();
    });

    test('parseScheduleSign - handles parsing errors gracefully', () => {
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _transactionBody: null as unknown,
        constructor: { name: 'SomeOtherTransaction' },
      };

      const result = ScheduleParser.parseScheduleSign(mockTransaction as unknown as Transaction);
      expect(result).toBeNull();
    });
  });

  describe('Schedule Delete Parsing', () => {
    test('parseScheduleDelete - parses from transaction body', () => {
      mockHasTransactionType.mockImplementation((_, type) => type === 'scheduleDelete');
      mockHasTransactionType.mockImplementation((_, type) => type === 'scheduleDelete');
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _transactionBody: {
          scheduleDelete: {
            scheduleID: { toString: () => '0.0.321' },
          },
        },
        _scheduleId: { toString: () => '0.0.321' },
      };

      const result = ScheduleParser.parseScheduleDelete(mockTransaction as unknown as Transaction);

      expect(result).not.toBeNull();
      expect(result!.scheduleId).toBe('0.0.321');
    });

    test('parseScheduleDelete - parses from ScheduleDeleteTransaction instance', () => {
      mockHasTransactionType.mockImplementation((_, type) => type === 'scheduleDelete');
      mockHasTransactionType.mockImplementation((_, type) => type === 'scheduleDelete');
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        constructor: { name: 'ScheduleDeleteTransaction' },
        _scheduleId: { toString: () => '0.0.654' },
      };

      const result = ScheduleParser.parseScheduleDelete(mockTransaction as unknown as Transaction);

      expect(result).not.toBeNull();
      expect(result!.scheduleId).toBe('0.0.654');
    });

    test('parseScheduleDelete - returns null for non-schedule transaction', () => {
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _transactionBody: {
          cryptoTransfer: {},
        },
        constructor: { name: 'CryptoTransferTransaction' },
      };

      const result = ScheduleParser.parseScheduleDelete(mockTransaction as unknown as Transaction);
      expect(result).toBeNull();
    });

    test('parseScheduleDelete - handles parsing errors gracefully', () => {
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _transactionBody: null as unknown,
        constructor: { name: 'SomeOtherTransaction' },
      };

      const result = ScheduleParser.parseScheduleDelete(mockTransaction as unknown as Transaction);
      expect(result).toBeNull();
    });
  });

  describe('Schedule Info Extraction', () => {
    test('extractScheduleInfo - detects scheduled transaction', () => {
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _transactionBody: {
          scheduleRef: { toString: () => '0.0.111' },
        },
      };

      const result = ScheduleParser.extractScheduleInfo(mockTransaction as unknown as Transaction);

      expect(result.isScheduled).toBe(true);
      expect(result.scheduleRef).toBe('0.0.111');
    });

    test('extractScheduleInfo - detects schedule from transaction properties', () => {
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _transactionBody: {},
        _scheduleId: { toString: () => '0.0.222' },
      };

      const result = ScheduleParser.extractScheduleInfo(mockTransaction as unknown as Transaction);

      expect(result.isScheduled).toBe(true);
      expect(result.scheduleRef).toBe('0.0.222');
    });

    test('extractScheduleInfo - returns not scheduled for regular transaction', () => {
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _transactionBody: {
          cryptoTransfer: {},
        },
      };

      const result = ScheduleParser.extractScheduleInfo(mockTransaction as unknown as Transaction);

      expect(result.isScheduled).toBe(false);
      expect(result.scheduleRef).toBeUndefined();
    });

    test('extractScheduleInfo - handles errors gracefully', () => {
      const mockTransaction = null as unknown;

      const result = ScheduleParser.extractScheduleInfo(mockTransaction as unknown as Transaction);

      expect(result.isScheduled).toBe(false);
    });
  });

  describe('Schedule Transaction Main Parser', () => {
    test('parseScheduleTransaction - identifies schedule create', () => {
      mockHasTransactionType.mockImplementation((_, type) => type === 'scheduleCreate');
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _scheduledTransaction: new Uint8Array([1, 2, 3]),
        _scheduleMemo: 'Create test',
      };

      const result = ScheduleParser.parseScheduleTransaction(
        mockTransaction as unknown as Transaction,
      );

      expect(result.type).toBe('SCHEDULECREATE');
      expect(result.humanReadableType).toBe('Schedule Create');
      expect(result.scheduleCreate).toBeDefined();
    });

    test('parseScheduleTransaction - identifies schedule sign', () => {
      mockHasTransactionType.mockImplementation((_, type) => type === 'scheduleSign');
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _scheduleId: { toString: () => '0.0.333' },
      };

      const result = ScheduleParser.parseScheduleTransaction(
        mockTransaction as unknown as Transaction,
      );

      expect(result.type).toBe('SCHEDULESIGN');
      expect(result.humanReadableType).toBe('Schedule Sign');
      expect(result.scheduleSign).toBeDefined();
    });

    test('parseScheduleTransaction - identifies schedule delete', () => {
      mockHasTransactionType.mockImplementation((_, type) => type === 'scheduleDelete');
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _scheduleId: { toString: () => '0.0.444' },
      };

      const result = ScheduleParser.parseScheduleTransaction(
        mockTransaction as unknown as Transaction,
      );

      expect(result.type).toBe('SCHEDULEDELETE');
      expect(result.humanReadableType).toBe('Schedule Delete');
      expect(result.scheduleDelete).toBeDefined();
    });

    test('parseScheduleTransaction - detects scheduled transaction', () => {
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _transactionBody: {
          cryptoTransfer: {},
          scheduleRef: { toString: () => '0.0.555' },
        },
      };

      const info = ScheduleParser.extractScheduleInfo(
        mockTransaction as unknown as Transaction,
      );
      expect(info.isScheduled).toBe(true);
      expect(info.scheduleRef).toBe('0.0.555');
    });

    test('parseScheduleTransaction - returns empty for non-schedule transaction', () => {
      const mockTransaction = {
        toBytes: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
        _transactionBody: {
          cryptoTransfer: {},
        },
      };

      const result = ScheduleParser.parseScheduleTransaction(
        mockTransaction as unknown as Transaction,
      );

      expect(result).toEqual({});
    });
  });

  describe('Scheduled Transaction Body Parsing', () => {
    test('parseScheduledTransactionBody - parses hex format', () => {
      const testBytes = '0x010203040506';

      const result = ScheduleParser.parseScheduledTransactionBody(testBytes);

      expect(result).toBeNull();
    });

    test('parseScheduledTransactionBody - parses base64 format', () => {
      const testBytes = Buffer.from('hello world').toString('base64');

      const result = ScheduleParser.parseScheduledTransactionBody(testBytes);

      expect(result).toBeNull();
    });

    test('parseScheduledTransactionBody - handles parsing errors gracefully', () => {
      const invalidBytes = 'not_valid_transaction_data';

      const result = ScheduleParser.parseScheduledTransactionBody(invalidBytes);

      expect(result).toBeNull();
    });

    test('parseScheduledTransactionBody - extracts transaction type', () => {
      const testBytes = 'dGVzdA==';

      const result = ScheduleParser.parseScheduledTransactionBody(testBytes);

      expect(result).toBeNull();
    });
  });
});
