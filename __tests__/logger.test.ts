/**
 * Logger Tests
 *
 * Tests for the Logger utility class to ensure proper argument handling
 */

import { Logger } from '../src/utils/logger';


jest.mock('pino', () => {
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
    level: 'info',
  };

  return jest.fn(() => mockLogger);
});

describe('Logger', () => {
  let logger: Logger;
  let mockPinoLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger({ module: 'test-module' });

    const pino = require('pino');
    mockPinoLogger = pino();
  });

  describe('Argument Handling', () => {
    it('should handle single string argument', () => {
      logger.info('test message');

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        { module: 'test-module' },
        'test message',
      );
    });

    it('should handle multiple string arguments', () => {
      logger.info('test', 'message', 'with', 'multiple', 'parts');

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        { module: 'test-module' },
        'test message with multiple parts',
      );
    });

    it('should handle single object argument', () => {
      const testObj = { userId: 123, action: 'login' };
      logger.info(testObj);

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        { module: 'test-module', data: testObj },
        '',
      );
    });

    it('should handle string with object arguments', () => {
      const userObj = { id: 123, name: 'Alice' };
      const permObj = { read: true, write: false };

      logger.info('User logged in:', userObj, 'with permissions:', permObj);

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        { module: 'test-module', data: [userObj, permObj] },
        'User logged in: with permissions:',
      );
    });

    it('should handle mixed string, number, and object arguments', () => {
      const dataObj = { status: 'success' };
      logger.info('Processing completed in', 250, 'ms with result:', dataObj);

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        { module: 'test-module', data: [dataObj] },
        'Processing completed in 250 ms with result:',
      );
    });

    it('should handle boolean arguments', () => {
      logger.info('Feature enabled:', true, 'Debug mode:', false);

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        { module: 'test-module' },
        'Feature enabled: true Debug mode: false',
      );
    });

    it('should handle array arguments', () => {
      const items = ['item1', 'item2', 'item3'];
      logger.info('Processing items:', items);

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        { module: 'test-module', data: [items] },
        'Processing items:',
      );
    });

    it('should handle empty arguments', () => {
      logger.info();

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        { module: 'test-module' },
        '',
      );
    });

    it('should handle complex nested objects', () => {
      const complexObj = {
        user: { id: 123, profile: { name: 'Alice', roles: ['admin', 'user'] } },
        timestamp: new Date(),
        metadata: { source: 'api', version: '1.0' },
      };

      logger.info('Complex operation:', complexObj);

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        { module: 'test-module', data: [complexObj] },
        'Complex operation:',
      );
    });
  });

  describe('Log Levels', () => {
    it('should call debug with proper formatting', () => {
      const debugData = { debug: true };
      logger.debug('Debug message:', debugData);

      expect(mockPinoLogger.debug).toHaveBeenCalledWith(
        { module: 'test-module', data: [debugData] },
        'Debug message:',
      );
    });

    it('should call warn with proper formatting', () => {
      const warnData = { warning: 'low disk space' };
      logger.warn('Warning:', warnData);

      expect(mockPinoLogger.warn).toHaveBeenCalledWith(
        { module: 'test-module', data: [warnData] },
        'Warning:',
      );
    });

    it('should call error with proper formatting', () => {
      const errorData = { error: 'connection failed', code: 500 };
      logger.error('Error occurred:', errorData);

      expect(mockPinoLogger.error).toHaveBeenCalledWith(
        { module: 'test-module', data: [errorData] },
        'Error occurred:',
      );
    });

    it('should call trace with proper formatting', () => {
      const traceData = { stack: 'trace info' };
      logger.trace('Trace:', traceData);

      expect(mockPinoLogger.trace).toHaveBeenCalledWith(
        { module: 'test-module', data: [traceData] },
        'Trace:',
      );
    });
  });

  describe('Module Context', () => {
    it('should use provided module name', () => {
      const customLogger = new Logger({ module: 'custom-module' });
      customLogger.info('test');

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        { module: 'custom-module' },
        'test',
      );
    });

    it('should update module name dynamically', () => {
      logger.setModule('updated-module');
      logger.info('test after update');

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        { module: 'updated-module' },
        'test after update',
      );
    });

    it('should use default module when none provided', () => {
      const defaultLogger = new Logger();
      defaultLogger.info('test');

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        { module: 'app' },
        'test',
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values', () => {
      logger.info('Value is:', null);

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        { module: 'test-module', data: [null] },
        'Value is:',
      );
    });

    it('should handle undefined values', () => {
      logger.info('Value is:', undefined);

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        { module: 'test-module', data: [undefined] },
        'Value is:',
      );
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000);
      logger.info('Long string:', longString);

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        { module: 'test-module' },
        `Long string: ${longString}`,
      );
    });

    it('should handle objects with circular references', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      logger.info('Circular object:', circularObj);

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        { module: 'test-module', data: [circularObj] },
        'Circular object:',
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

    it('should handle global disable via environment', () => {
      const originalEnv = process.env.DISABLE_LOGS;
      process.env.DISABLE_LOGS = 'true';

      const silentLogger = Logger.getInstance({ module: 'silent-test' });
      silentLogger.info('Should be silent');


      expect(mockPinoLogger.info).toHaveBeenCalled();

      process.env.DISABLE_LOGS = originalEnv;
    });
  });
});
