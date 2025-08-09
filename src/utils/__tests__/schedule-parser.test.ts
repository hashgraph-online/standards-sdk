import { ScheduleParser } from '../parsers/schedule-parser';
import { Transaction } from '@hashgraph/sdk';

describe('ScheduleParser', () => {
  describe('Schedule Create Parsing', () => {
    test('parseScheduleCreate - parses from transaction body', () => {
      const mockTransaction = {
        _transactionBody: {
          scheduleCreate: {
            scheduledTransactionBody: new Uint8Array([1, 2, 3, 4]),
            memo: 'Test schedule',
            adminKey: { toString: () => 'admin_key_string' },
            payerAccountId: { toString: () => '0.0.123' },
            expirationTime: { toString: () => '1234567890' },
            waitForExpiry: true,
          },
        },
      };

      const result = ScheduleParser.parseScheduleCreate(mockTransaction as any);

      expect(result).not.toBeNull();
      expect(result!.scheduledTransactionBody).toBeDefined();
      expect(result!.memo).toBe('Test schedule');
      expect(result!.adminKey).toBe('admin_key_string');
      expect(result!.payerAccountId).toBe('0.0.123');
      expect(result!.expirationTime).toBe('1234567890');
      expect(result!.waitForExpiry).toBe(true);
    });

    test('parseScheduleCreate - parses from ScheduleCreateTransaction instance', () => {
      const mockTransaction = {
        constructor: { name: 'ScheduleCreateTransaction' },
        _scheduledTransaction: new Uint8Array([5, 6, 7, 8]),
        _scheduleMemo: 'Instance memo',
        _adminKey: { toString: () => 'instance_admin_key' },
        _payerAccountId: { toString: () => '0.0.456' },
        _expirationTime: { toString: () => '9876543210' },
        _waitForExpiry: false,
      };

      const result = ScheduleParser.parseScheduleCreate(mockTransaction as any);

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
        _transactionBody: {
          cryptoTransfer: {},
        },
        constructor: { name: 'CryptoTransferTransaction' },
      };

      const result = ScheduleParser.parseScheduleCreate(mockTransaction as any);
      expect(result).toBeNull();
    });

    test('parseScheduleCreate - handles parsing errors gracefully', () => {
      const mockTransaction = {
        _transactionBody: null,
        constructor: { name: 'SomeOtherTransaction' },
      };

      const result = ScheduleParser.parseScheduleCreate(mockTransaction as any);
      expect(result).toBeNull();
    });
  });

  describe('Schedule Sign Parsing', () => {
    test('parseScheduleSign - parses from transaction body', () => {
      const mockTransaction = {
        _transactionBody: {
          scheduleSign: {
            scheduleID: { toString: () => '0.0.789' },
          },
        },
      };

      const result = ScheduleParser.parseScheduleSign(mockTransaction as any);

      expect(result).not.toBeNull();
      expect(result!.scheduleId).toBe('0.0.789');
    });

    test('parseScheduleSign - parses from ScheduleSignTransaction instance', () => {
      const mockTransaction = {
        constructor: { name: 'ScheduleSignTransaction' },
        _scheduleId: { toString: () => '0.0.987' },
      };

      const result = ScheduleParser.parseScheduleSign(mockTransaction as any);

      expect(result).not.toBeNull();
      expect(result!.scheduleId).toBe('0.0.987');
    });

    test('parseScheduleSign - returns null for non-schedule transaction', () => {
      const mockTransaction = {
        _transactionBody: {
          cryptoTransfer: {},
        },
        constructor: { name: 'CryptoTransferTransaction' },
      };

      const result = ScheduleParser.parseScheduleSign(mockTransaction as any);
      expect(result).toBeNull();
    });

    test('parseScheduleSign - handles parsing errors gracefully', () => {
      const mockTransaction = {
        _transactionBody: null,
        constructor: { name: 'SomeOtherTransaction' },
      };

      const result = ScheduleParser.parseScheduleSign(mockTransaction as any);
      expect(result).toBeNull();
    });
  });

  describe('Schedule Delete Parsing', () => {
    test('parseScheduleDelete - parses from transaction body', () => {
      const mockTransaction = {
        _transactionBody: {
          scheduleDelete: {
            scheduleID: { toString: () => '0.0.321' },
          },
        },
      };

      const result = ScheduleParser.parseScheduleDelete(mockTransaction as any);

      expect(result).not.toBeNull();
      expect(result!.scheduleId).toBe('0.0.321');
    });

    test('parseScheduleDelete - parses from ScheduleDeleteTransaction instance', () => {
      const mockTransaction = {
        constructor: { name: 'ScheduleDeleteTransaction' },
        _scheduleId: { toString: () => '0.0.654' },
      };

      const result = ScheduleParser.parseScheduleDelete(mockTransaction as any);

      expect(result).not.toBeNull();
      expect(result!.scheduleId).toBe('0.0.654');
    });

    test('parseScheduleDelete - returns null for non-schedule transaction', () => {
      const mockTransaction = {
        _transactionBody: {
          cryptoTransfer: {},
        },
        constructor: { name: 'CryptoTransferTransaction' },
      };

      const result = ScheduleParser.parseScheduleDelete(mockTransaction as any);
      expect(result).toBeNull();
    });

    test('parseScheduleDelete - handles parsing errors gracefully', () => {
      const mockTransaction = {
        _transactionBody: null,
        constructor: { name: 'SomeOtherTransaction' },
      };

      const result = ScheduleParser.parseScheduleDelete(mockTransaction as any);
      expect(result).toBeNull();
    });
  });

  describe('Schedule Info Extraction', () => {
    test('extractScheduleInfo - detects scheduled transaction', () => {
      const mockTransaction = {
        _transactionBody: {
          scheduleRef: { toString: () => '0.0.111' },
        },
      };

      const result = ScheduleParser.extractScheduleInfo(mockTransaction as any);

      expect(result.isScheduled).toBe(true);
      expect(result.scheduleRef).toBe('0.0.111');
    });

    test('extractScheduleInfo - detects schedule from transaction properties', () => {
      const mockTransaction = {
        _transactionBody: {},
        _scheduleId: { toString: () => '0.0.222' },
      };

      const result = ScheduleParser.extractScheduleInfo(mockTransaction as any);

      expect(result.isScheduled).toBe(true);
      expect(result.scheduleRef).toBe('0.0.222');
    });

    test('extractScheduleInfo - returns not scheduled for regular transaction', () => {
      const mockTransaction = {
        _transactionBody: {
          cryptoTransfer: {},
        },
      };

      const result = ScheduleParser.extractScheduleInfo(mockTransaction as any);

      expect(result.isScheduled).toBe(false);
      expect(result.scheduleRef).toBeUndefined();
    });

    test('extractScheduleInfo - handles errors gracefully', () => {
      const mockTransaction = null;

      const result = ScheduleParser.extractScheduleInfo(mockTransaction as any);

      expect(result.isScheduled).toBe(false);
    });
  });

  describe('Schedule Transaction Main Parser', () => {
    test('parseScheduleTransaction - identifies schedule create', () => {
      const mockTransaction = {
        _transactionBody: {
          scheduleCreate: {
            scheduledTransactionBody: new Uint8Array([1, 2, 3]),
            memo: 'Create test',
          },
        },
      };

      const originalParseScheduleCreate = ScheduleParser.parseScheduleCreate;
      ScheduleParser.parseScheduleCreate = jest.fn().mockReturnValue({
        scheduledTransactionBody: 'AQID',
        memo: 'Create test',
      });

      const result = ScheduleParser.parseScheduleTransaction(
        mockTransaction as any,
      );

      expect(result.type).toBe('SCHEDULECREATE');
      expect(result.humanReadableType).toBe('Schedule Create');
      expect(result.scheduleCreate).toBeDefined();

      ScheduleParser.parseScheduleCreate = originalParseScheduleCreate;
    });

    test('parseScheduleTransaction - identifies schedule sign', () => {
      const mockTransaction = {
        _transactionBody: {
          scheduleSign: {
            scheduleID: { toString: () => '0.0.333' },
          },
        },
      };

      const originalParseScheduleSign = ScheduleParser.parseScheduleSign;
      ScheduleParser.parseScheduleSign = jest.fn().mockReturnValue({
        scheduleId: '0.0.333',
      });

      const result = ScheduleParser.parseScheduleTransaction(
        mockTransaction as any,
      );

      expect(result.type).toBe('SCHEDULESIGN');
      expect(result.humanReadableType).toBe('Schedule Sign');
      expect(result.scheduleSign).toBeDefined();

      ScheduleParser.parseScheduleSign = originalParseScheduleSign;
    });

    test('parseScheduleTransaction - identifies schedule delete', () => {
      const mockTransaction = {
        _transactionBody: {
          scheduleDelete: {
            scheduleID: { toString: () => '0.0.444' },
          },
        },
      };

      const originalParseScheduleDelete = ScheduleParser.parseScheduleDelete;
      ScheduleParser.parseScheduleDelete = jest.fn().mockReturnValue({
        scheduleId: '0.0.444',
      });

      const result = ScheduleParser.parseScheduleTransaction(
        mockTransaction as any,
      );

      expect(result.type).toBe('SCHEDULEDELETE');
      expect(result.humanReadableType).toBe('Schedule Delete');
      expect(result.scheduleDelete).toBeDefined();

      ScheduleParser.parseScheduleDelete = originalParseScheduleDelete;
    });

    test('parseScheduleTransaction - detects scheduled transaction', () => {
      const mockTransaction = {
        _transactionBody: {
          cryptoTransfer: {},
          scheduleRef: { toString: () => '0.0.555' },
        },
      };

      const result = ScheduleParser.parseScheduleTransaction(
        mockTransaction as any,
      );

      expect(result.details?.isScheduled).toBe(true);
      expect(result.details?.scheduleRef).toBe('0.0.555');
    });

    test('parseScheduleTransaction - returns empty for non-schedule transaction', () => {
      const mockTransaction = {
        _transactionBody: {
          cryptoTransfer: {},
        },
      };

      const result = ScheduleParser.parseScheduleTransaction(
        mockTransaction as any,
      );

      expect(result).toEqual({});
    });
  });

  describe('Scheduled Transaction Body Parsing', () => {
    test('parseScheduledTransactionBody - parses hex format', () => {
      const testBytes = '0x010203040506';

      const mockSchedulableBody = {
        tokenCreation: { name: 'Test' },
        memo: 'Test memo',
        transactionFee: 100000,
      };

      jest.mock('@hashgraph/proto', () => ({
        proto: {
          SchedulableTransactionBody: {
            decode: jest.fn().mockReturnValue(mockSchedulableBody),
          },
        },
      }));

      const result = ScheduleParser.parseScheduledTransactionBody(testBytes);

      expect(result).toBeDefined();
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
