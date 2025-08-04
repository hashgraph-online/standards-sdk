import {
  Logger,
  ILogger,
  setLoggerFactory,
  LogLevel,
} from '../src/utils/logger';

describe('Logger', () => {
  beforeEach(() => {
    // Clear any existing logger instances before each test
    Logger.clearInstances();
    // Reset to default logger factory
    setLoggerFactory(null as any);
  });

  describe('Swappable Logger Implementation', () => {
    it('should use default Pino implementation when no factory is set', () => {
      const logger = new Logger({ module: 'test' });

      expect(logger).toBeInstanceOf(Logger);
      expect(logger.getLevel()).toBe('info');

      // Test that logging methods work
      expect(() => logger.debug('debug message')).not.toThrow();
      expect(() => logger.info('info message')).not.toThrow();
      expect(() => logger.warn('warn message')).not.toThrow();
      expect(() => logger.error('error message')).not.toThrow();
    });

    it('should use custom logger implementation when factory is set', () => {
      // Create a mock logger implementation
      const mockLogger: ILogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
        setLogLevel: jest.fn(),
        getLevel: jest.fn(() => 'debug' as LogLevel),
        setSilent: jest.fn(),
        setModule: jest.fn(),
      };

      // Set the factory
      setLoggerFactory(() => mockLogger);

      // Create a new logger instance using getInstance
      const logger = Logger.getInstance({ module: 'test' });

      // Verify it returns our mock
      expect(logger).toBe(mockLogger);

      // Test that our mock methods are called
      logger.debug('test debug');
      expect(mockLogger.debug).toHaveBeenCalledWith('test debug');

      logger.info('test info');
      expect(mockLogger.info).toHaveBeenCalledWith('test info');

      logger.warn('test warn');
      expect(mockLogger.warn).toHaveBeenCalledWith('test warn');

      logger.error('test error');
      expect(mockLogger.error).toHaveBeenCalledWith('test error');
    });

    it('should clear instances when factory is changed', () => {
      // Create logger with default factory
      const logger1 = Logger.getInstance({ module: 'test1' });
      const logger2 = Logger.getInstance({ module: 'test1' });

      // Should be the same instance
      expect(logger1).toBe(logger2);

      // Set a new factory
      const mockLogger: ILogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
        setLogLevel: jest.fn(),
        getLevel: jest.fn(() => 'info' as LogLevel),
        setSilent: jest.fn(),
        setModule: jest.fn(),
      };

      setLoggerFactory(() => mockLogger);

      // Get instance again - should be the mock now
      const logger3 = Logger.getInstance({ module: 'test1' });
      expect(logger3).toBe(mockLogger);
      expect(logger3).not.toBe(logger1);
    });

    it('should maintain separate instances per module', () => {
      const mockLogger1: ILogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
        setLogLevel: jest.fn(),
        getLevel: jest.fn(() => 'info' as LogLevel),
        setSilent: jest.fn(),
        setModule: jest.fn(),
      };

      const mockLogger2: ILogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
        setLogLevel: jest.fn(),
        getLevel: jest.fn(() => 'debug' as LogLevel),
        setSilent: jest.fn(),
        setModule: jest.fn(),
      };

      let moduleCount = 0;
      setLoggerFactory(options => {
        moduleCount++;
        return moduleCount === 1 ? mockLogger1 : mockLogger2;
      });

      const logger1 = Logger.getInstance({ module: 'module1' });
      const logger2 = Logger.getInstance({ module: 'module2' });
      const logger3 = Logger.getInstance({ module: 'module1' });

      // Different modules should have different instances
      expect(logger1).not.toBe(logger2);
      // Same module should return same instance
      expect(logger1).toBe(logger3);
    });

    it('should pass options to custom logger factory', () => {
      const factorySpy = jest.fn(options => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
        setLogLevel: jest.fn(),
        getLevel: jest.fn(() => options.level || 'info'),
        setSilent: jest.fn(),
        setModule: jest.fn(),
      }));

      setLoggerFactory(factorySpy);

      const logger = Logger.getInstance({
        module: 'test-module',
        level: 'debug',
        timestamp: true,
      });

      expect(factorySpy).toHaveBeenCalledWith({
        module: 'test-module',
        level: 'debug',
        timestamp: true,
      });
    });

    it('should support all ILogger interface methods', () => {
      const mockLogger: ILogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
        setLogLevel: jest.fn(),
        getLevel: jest.fn(() => 'warn' as LogLevel),
        setSilent: jest.fn(),
        setModule: jest.fn(),
      };

      setLoggerFactory(() => mockLogger);
      const logger = Logger.getInstance({ module: 'test' });

      // Test all interface methods
      logger.trace('trace msg');
      expect(mockLogger.trace).toHaveBeenCalledWith('trace msg');

      logger.setLogLevel('error');
      expect(mockLogger.setLogLevel).toHaveBeenCalledWith('error');

      const level = logger.getLevel();
      expect(level).toBe('warn');
      expect(mockLogger.getLevel).toHaveBeenCalled();

      logger.setSilent(true);
      expect(mockLogger.setSilent).toHaveBeenCalledWith(true);

      logger.setModule('new-module');
      expect(mockLogger.setModule).toHaveBeenCalledWith('new-module');
    });

    it('should handle multiple arguments in log methods', () => {
      const mockLogger: ILogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
        setLogLevel: jest.fn(),
        getLevel: jest.fn(() => 'info' as LogLevel),
        setSilent: jest.fn(),
        setModule: jest.fn(),
      };

      setLoggerFactory(() => mockLogger);
      const logger = Logger.getInstance({ module: 'test' });

      const obj = { key: 'value' };
      const err = new Error('test error');

      logger.info('message', obj, 123);
      expect(mockLogger.info).toHaveBeenCalledWith('message', obj, 123);

      logger.error('error occurred', err, { context: 'test' });
      expect(mockLogger.error).toHaveBeenCalledWith('error occurred', err, {
        context: 'test',
      });
    });
  });
});
