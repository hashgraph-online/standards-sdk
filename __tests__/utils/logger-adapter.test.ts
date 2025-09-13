import {
  createLoggerAdapter,
  isConcreteLogger,
  ensureLoggerType,
} from '../../src/utils/logger-adapter';
import { Logger } from '../../src/utils/logger';
import type { ILogger } from '../../src/utils/logger';

describe('Logger Adapter', () => {
  let mockILogger: jest.Mocked<ILogger>;
  let mockLogger: Logger;

  beforeEach(() => {
    mockILogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      trace: jest.fn(),
      setLogLevel: jest.fn(),
      getLevel: jest.fn().mockReturnValue('info'),
      setSilent: jest.fn(),
      setModule: jest.fn(),
    };

    mockLogger = new Logger({ module: 'test' });
  });

  describe('createLoggerAdapter', () => {
    it('should create a Logger adapter from ILogger', () => {
      const adapter = createLoggerAdapter(mockILogger);

      expect(adapter).toBeInstanceOf(Logger);
      expect(typeof adapter.debug).toBe('function');
      expect(typeof adapter.info).toBe('function');
      expect(typeof adapter.warn).toBe('function');
      expect(typeof adapter.error).toBe('function');
      expect(typeof adapter.trace).toBe('function');
    });

    it('should delegate all logging methods to the underlying ILogger', () => {
      const adapter = createLoggerAdapter(mockILogger);

      const testArgs = ['test', 'message', 123];

      adapter.debug(...testArgs);
      expect(mockILogger.debug).toHaveBeenCalledWith(...testArgs);

      adapter.info(...testArgs);
      expect(mockILogger.info).toHaveBeenCalledWith(...testArgs);

      adapter.warn(...testArgs);
      expect(mockILogger.warn).toHaveBeenCalledWith(...testArgs);

      adapter.error(...testArgs);
      expect(mockILogger.error).toHaveBeenCalledWith(...testArgs);

      adapter.trace(...testArgs);
      expect(mockILogger.trace).toHaveBeenCalledWith(...testArgs);
    });

    it('should delegate configuration methods to the underlying ILogger', () => {
      const adapter = createLoggerAdapter(mockILogger);

      adapter.setLogLevel('debug');
      expect(mockILogger.setLogLevel).toHaveBeenCalledWith('debug');

      adapter.setSilent(true);
      expect(mockILogger.setSilent).toHaveBeenCalledWith(true);

      adapter.setModule('test-module');
      expect(mockILogger.setModule).toHaveBeenCalledWith('test-module');
    });

    it('should delegate getter methods to the underlying ILogger', () => {
      const adapter = createLoggerAdapter(mockILogger);

      const level = adapter.getLevel();
      expect(mockILogger.getLevel).toHaveBeenCalled();
      expect(level).toBe('info');
    });
  });

  describe('isConcreteLogger', () => {
    it('should return true for concrete Logger instances', () => {
      expect(isConcreteLogger(mockLogger)).toBe(true);
    });

    it('should return false for ILogger implementations that are not Logger', () => {
      expect(isConcreteLogger(mockILogger)).toBe(false);
    });

    it('should return false for plain objects', () => {
      expect(isConcreteLogger({} as ILogger)).toBe(false);
    });
  });

  describe('ensureLoggerType', () => {
    it('should return the Logger as-is if it is already a concrete Logger', () => {
      const result = ensureLoggerType(mockLogger);
      expect(result).toBe(mockLogger);
    });

    it('should create an adapter if the logger is an ILogger but not a concrete Logger', () => {
      const result = ensureLoggerType(mockILogger);
      expect(result).toBeInstanceOf(Logger);
      expect(result).not.toBe(mockILogger);
    });

    it('should ensure the adapter works correctly', () => {
      const result = ensureLoggerType(mockILogger);

      result.info('test message');
      expect(mockILogger.info).toHaveBeenCalledWith('test message');
    });
  });
});
