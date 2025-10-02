/**
 * Logger Tests
 *
 * Tests for the Logger utility class to ensure proper argument handling
 */

import { Logger } from '../../src/utils/logger';

describe('Logger', () => {
  const originalEnv = process.env.DISABLE_LOGS;
  let logger: Logger;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DISABLE_LOGS = 'false';

    consoleInfoSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    logger = new Logger({ module: 'test-module' });
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  afterAll(() => {
    process.env.DISABLE_LOGS = originalEnv;
  });

  describe('Argument Handling', () => {
    it('should handle single string argument', () => {
      logger.info('test message');

      expect(consoleInfoSpy).toHaveBeenCalled();
      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('test message');
      expect(call).toContain('test-module');
    });

    it('should handle multiple string arguments', () => {
      logger.info('test', 'message', 'with', 'multiple', 'parts');

      expect(consoleInfoSpy).toHaveBeenCalled();
      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('test message with multiple parts');
    });

    it('should handle single object argument', () => {
      const testObj = { userId: 123, action: 'login' };
      logger.info(testObj);

      expect(consoleInfoSpy).toHaveBeenCalled();
      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('test-module');
    });

    it('should handle string with object arguments', () => {
      const userObj = { id: 123, name: 'Alice' };
      const permObj = { read: true, write: false };

      logger.info('User logged in:', userObj, 'with permissions:', permObj);

      expect(consoleInfoSpy).toHaveBeenCalled();
      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('User logged in:');
      expect(call).toContain('with permissions:');
    });

    it('should handle mixed string, number, and object arguments', () => {
      const dataObj = { status: 'success' };
      logger.info('Processing completed in', 250, 'ms with result:', dataObj);

      expect(consoleInfoSpy).toHaveBeenCalled();
      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('Processing completed in 250 ms with result:');
    });

    it('should handle boolean arguments', () => {
      logger.info('Feature enabled:', true, 'Debug mode:', false);

      expect(consoleInfoSpy).toHaveBeenCalled();
      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('Feature enabled: true Debug mode: false');
    });

    it('should handle array arguments', () => {
      const items = ['item1', 'item2', 'item3'];
      logger.info('Processing items:', items);

      expect(consoleInfoSpy).toHaveBeenCalled();
      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('Processing items:');
    });

    it('should handle empty arguments', () => {
      logger.info();

      expect(consoleInfoSpy).toHaveBeenCalled();
    });
  });

  describe('Log Levels', () => {
    it('should call debug with proper formatting', () => {
      const debugLogger = new Logger({ module: 'test-module', level: 'debug' });
      const debugData = { debug: true };
      debugLogger.debug('Debug message:', debugData);

      expect(consoleDebugSpy).toHaveBeenCalled();
      const call = consoleDebugSpy.mock.calls[0][0];
      expect(call).toContain('Debug message:');
    });

    it('should call warn with proper formatting', () => {
      const warnData = { warning: 'low disk space' };
      logger.warn('Warning:', warnData);

      expect(consoleWarnSpy).toHaveBeenCalled();
      const call = consoleWarnSpy.mock.calls[0][0];
      expect(call).toContain('Warning:');
    });

    it('should call error with proper formatting', () => {
      const errorData = { error: 'connection failed', code: 500 };
      logger.error('Error occurred:', errorData);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const call = consoleErrorSpy.mock.calls[0][0];
      expect(call).toContain('Error occurred:');
    });

    it('should call trace with proper formatting', () => {
      const traceLogger = new Logger({ module: 'test-module', level: 'trace' });
      const traceData = { stack: 'trace info' };
      traceLogger.trace('Trace:', traceData);

      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('Trace:');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values', () => {
      logger.info('Value is:', null);

      expect(consoleInfoSpy).toHaveBeenCalled();
      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('Value is:');
    });

    it('should handle undefined values', () => {
      logger.info('Value is:', undefined);

      expect(consoleInfoSpy).toHaveBeenCalled();
      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('Value is:');
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000);
      logger.info('Long string:', longString);

      expect(consoleInfoSpy).toHaveBeenCalled();
      const call = consoleInfoSpy.mock.calls[0][0];
      expect(call).toContain('Long string:');
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

      expect(consoleInfoSpy).not.toHaveBeenCalled();

      process.env.DISABLE_LOGS = originalEnv;
    });
  });
});
