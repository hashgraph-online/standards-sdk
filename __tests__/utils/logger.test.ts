/**
 * Logger Tests
 *
 * Tests for the Logger utility class to ensure proper argument handling
 */

import { Logger } from '../../src/utils/logger';

// Mock the write function
const mockWrite = jest.fn();

// Mock process.stdout.write
Object.defineProperty(process.stdout, 'write', {
  value: mockWrite,
  writable: true
});

describe('Logger', () => {
  const originalEnv = process.env.DISABLE_LOGS;
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWrite.mockClear();
    logger = new Logger({ module: 'test-module', prettyPrint: false });
  });
  afterAll(() => {
    process.env.DISABLE_LOGS = originalEnv;
  });

  describe('Argument Handling', () => {
    it('should handle single string argument', () => {
      logger.info('test message');

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"message":"test message"')
      );
      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"module":"test-module"')
      );
    });

    it('should handle multiple string arguments', () => {
      logger.info('test', 'message', 'with', 'multiple', 'parts');

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"message":"test message with multiple parts"')
      );
    });

    it('should handle single object argument', () => {
      const testObj = { userId: 123, action: 'login' };
      logger.info(testObj);

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"message":""')
      );
      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"data":')
      );
    });

    it('should handle string with object arguments', () => {
      const userObj = { id: 123, name: 'Alice' };
      const permObj = { read: true, write: false };

      logger.info('User logged in:', userObj, 'with permissions:', permObj);

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"message":"User logged in: with permissions:"')
      );
      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"data":')
      );
    });

    it('should handle mixed string, number, and object arguments', () => {
      const dataObj = { status: 'success' };
      logger.info('Processing completed in', 250, 'ms with result:', dataObj);

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Processing completed in 250 ms with result:"')
      );
    });

    it('should handle boolean arguments', () => {
      logger.info('Feature enabled:', true, 'Debug mode:', false);

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Feature enabled: true Debug mode: false"')
      );
    });

    it('should handle array arguments', () => {
      const items = ['item1', 'item2', 'item3'];
      logger.info('Processing items:', items);

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Processing items:"')
      );
      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"data":')
      );
    });

    it('should handle empty arguments', () => {
      logger.info();

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"message":""')
      );
    });
  });

  describe('Log Levels', () => {
    it('should call debug with proper formatting', () => {
      const debugLogger = new Logger({ module: 'test-module', level: 'debug', prettyPrint: false });
      const debugData = { debug: true };
      debugLogger.debug('Debug message:', debugData);

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"level":"debug"')
      );
    });

    it('should call warn with proper formatting', () => {
      const warnData = { warning: 'low disk space' };
      logger.warn('Warning:', warnData);

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"level":"warn"')
      );
    });

    it('should call error with proper formatting', () => {
      const errorData = { error: 'connection failed', code: 500 };
      logger.error('Error occurred:', errorData);

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"level":"error"')
      );
    });

    it('should call trace with proper formatting', () => {
      const traceLogger = new Logger({ module: 'test-module', level: 'trace', prettyPrint: false });
      const traceData = { stack: 'trace info' };
      traceLogger.trace('Trace:', traceData);

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"level":"trace"')
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values', () => {
      logger.info('Value is:', null);

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Value is:"')
      );
      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"data":')
      );
    });

    it('should handle undefined values', () => {
      logger.info('Value is:', undefined);

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Value is:"')
      );
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000);
      logger.info('Long string:', longString);

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining(`"message":"Long string: ${longString}"`)
      );
    });
  });

  describe('getInstance', () => {
    it('should return singleton instances per module', () => {
      const logger1 = Logger.getInstance({ module: 'test' });
      const logger2 = Logger.getInstance({ module: 'test' });
      const logger3 = Logger.getInstance({ module: 'other' });

      expect(logger1).toBe(logger2);
      expect(logger1).not.toBe(logger3);
    });

    it('should respect log levels', () => {
      mockWrite.mockClear();
      const debugLogger = new Logger({ level: 'debug', prettyPrint: false });
      debugLogger.debug('debug message');
      expect(mockWrite).toHaveBeenCalled();
      
      mockWrite.mockClear();
      const infoLogger = new Logger({ level: 'info', prettyPrint: false });
      infoLogger.debug('debug message');
      expect(mockWrite).not.toHaveBeenCalled();
    });

    it('should respect silent mode', () => {
      mockWrite.mockClear();
      const silentLogger = new Logger({ silent: true });
      silentLogger.info('test message');
      
      expect(mockWrite).not.toHaveBeenCalled();
    });
  });
});
