import {
  ProgressReporter,
  ProgressStage,
  ProgressData,
  ProgressCallback,
} from '../../src/utils/progress-reporter';
import { Logger } from '../../src/utils/logger';

jest.mock('../../src/utils/logger');

describe('ProgressReporter', () => {
  const mockLogger = {
    debug: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (Logger as jest.MockedClass<any>).mockImplementation(() => mockLogger);
    (ProgressReporter as any).instance = undefined;
  });

  afterEach(() => {
    (ProgressReporter as any).instance = undefined;
  });

  describe('constructor', () => {
    test('should create ProgressReporter with default options', () => {
      const reporter = new ProgressReporter();

      expect(reporter).toBeInstanceOf(ProgressReporter);
    });

    test('should create ProgressReporter with custom options', () => {
      const callback = jest.fn();
      const customLogger = { debug: jest.fn() };

      const reporter = new ProgressReporter({
        module: 'TestModule',
        callback,
        logger: customLogger as any,
        logProgress: false,
        minPercent: 10,
        maxPercent: 90,
      });

      expect(reporter).toBeInstanceOf(ProgressReporter);
    });
  });

  describe('getInstance', () => {
    test('should return singleton instance', () => {
      const instance1 = ProgressReporter.getInstance();
      const instance2 = ProgressReporter.getInstance();

      expect(instance1).toBe(instance2);
    });

    test('should update callback when provided', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const instance = ProgressReporter.getInstance({ callback: callback1 });
      expect((instance as any).callback).toBe(callback1);

      ProgressReporter.getInstance({ callback: callback2 });
      expect((instance as any).callback).toBe(callback2);
    });

    test('should update module when provided', () => {
      const instance = ProgressReporter.getInstance({ module: 'TestModule' });
      expect((instance as any).module).toBe('TestModule');

      ProgressReporter.getInstance({ module: 'NewModule' });
      expect((instance as any).module).toBe('NewModule');
    });

    test('should update logger when provided', () => {
      const logger1 = { debug: jest.fn() };
      const logger2 = { debug: jest.fn() };

      const instance = ProgressReporter.getInstance({ logger: logger1 as any });
      expect((instance as any).logger).toBe(logger1);

      ProgressReporter.getInstance({ logger: logger2 as any });
      expect((instance as any).logger).toBe(logger2);
    });

    test('should update min and max percent when provided', () => {
      const instance = ProgressReporter.getInstance({
        minPercent: 10,
        maxPercent: 90,
      });

      expect((instance as any).minPercent).toBe(10);
      expect((instance as any).maxPercent).toBe(90);

      ProgressReporter.getInstance({
        minPercent: 20,
        maxPercent: 80,
      });

      expect((instance as any).minPercent).toBe(20);
      expect((instance as any).maxPercent).toBe(80);
    });
  });

  describe('setter methods', () => {
    let reporter: ProgressReporter;

    beforeEach(() => {
      reporter = new ProgressReporter();
    });

    test('should set callback', () => {
      const callback = jest.fn();
      reporter.setCallback(callback);

      expect((reporter as any).callback).toBe(callback);
    });

    test('should set module', () => {
      reporter.setModule('NewModule');

      expect((reporter as any).module).toBe('NewModule');
    });

    test('should set logger', () => {
      const newLogger = { debug: jest.fn() };
      reporter.setLogger(newLogger as any);

      expect((reporter as any).logger).toBe(newLogger);
    });

    test('should set min percent', () => {
      reporter.setMinPercent(25);

      expect((reporter as any).minPercent).toBe(25);
    });

    test('should set max percent', () => {
      reporter.setMaxPercent(75);

      expect((reporter as any).maxPercent).toBe(75);
    });
  });

  describe('createSubProgress', () => {
    let reporter: ProgressReporter;
    let callback: jest.MockedFunction<ProgressCallback>;

    beforeEach(() => {
      callback = jest.fn();
      reporter = new ProgressReporter({
        callback,
        minPercent: 10,
        maxPercent: 90,
      });
    });

    test('should create sub progress reporter', () => {
      const subReporter = reporter.createSubProgress({
        minPercent: 20,
        maxPercent: 80,
        logPrefix: 'SubTask',
      });

      expect(subReporter).toBeInstanceOf(ProgressReporter);
    });

    test('should scale progress correctly', () => {
      const subReporter = reporter.createSubProgress({
        minPercent: 20,
        maxPercent: 80,
      });

      subReporter.report({
        stage: 'preparing',
        message: 'Test message',
        progressPercent: 50,
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: 'preparing',
          message: 'Test message',
          progressPercent: 50, // 20 + (50-0) * (90-10)/(100-0) = 50
        }),
      );
    });

    test('should add log prefix', () => {
      const subReporter = reporter.createSubProgress({
        minPercent: 20,
        maxPercent: 80,
        logPrefix: 'SubTask',
      });

      subReporter.report({
        stage: 'preparing',
        message: 'Test message',
        progressPercent: 50,
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'SubTask: Test message',
        }),
      );
    });
  });

  describe('report', () => {
    let reporter: ProgressReporter;
    let callback: jest.MockedFunction<ProgressCallback>;

    beforeEach(() => {
      callback = jest.fn();
      reporter = new ProgressReporter({
        callback,
        logProgress: true,
      });
    });

    test('should call callback with correct data', () => {
      const progressData: ProgressData = {
        stage: 'preparing',
        message: 'Test progress',
        progressPercent: 50,
      };

      reporter.report(progressData);

      expect(callback).toHaveBeenCalledWith(progressData);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Progress] [PREPARING] Test progress (50.0%)',
        undefined,
      );
    });

    test('should log progress when enabled', () => {
      const progressData: ProgressData = {
        stage: 'submitting',
        message: 'Submitting data',
        progressPercent: 75,
        details: { key: 'value' },
      };

      reporter.report(progressData);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Progress] [SUBMITTING] Submitting data (75.0%)',
        { key: 'value' },
      );
    });

    test('should not log progress when disabled', () => {
      const reporterWithoutLog = new ProgressReporter({
        callback,
        logProgress: false,
      });

      const progressData: ProgressData = {
        stage: 'confirming',
        message: 'Confirming',
        progressPercent: 25,
      };

      reporterWithoutLog.report(progressData);

      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    test('should clamp progress percent between 0 and 100', () => {
      reporter.report({
        stage: 'verifying',
        message: 'Test',
        progressPercent: -10,
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ progressPercent: 0 }),
      );

      reporter.report({
        stage: 'verifying',
        message: 'Test',
        progressPercent: 150,
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ progressPercent: 100 }),
      );
    });

    test('should throttle duplicate progress reports', () => {
      const progressData: ProgressData = {
        stage: 'preparing',
        message: 'Test',
        progressPercent: 50,
      };

      reporter.report(progressData);
      reporter.report(progressData); // Should be throttled

      expect(callback).toHaveBeenCalledTimes(1);
    });

    test('should not throttle completed or failed stages', () => {
      const completedData: ProgressData = {
        stage: 'completed',
        message: 'Done',
        progressPercent: 100,
      };

      const failedData: ProgressData = {
        stage: 'failed',
        message: 'Error',
        progressPercent: 75,
      };

      reporter.report(completedData);
      reporter.report(completedData); // Should not be throttled

      reporter.report(failedData);
      reporter.report(failedData); // Should not be throttled

      expect(callback).toHaveBeenCalledTimes(4);
    });

    test('should handle callback errors gracefully', () => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });

      const reporterWithError = new ProgressReporter({
        callback: errorCallback,
      });

      const progressData: ProgressData = {
        stage: 'preparing',
        message: 'Test',
        progressPercent: 50,
      };

      reporterWithError.report(progressData);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Error in progress callback: Error: Callback error',
      );
    });
  });

  describe('convenience methods', () => {
    let reporter: ProgressReporter;
    let callback: jest.MockedFunction<ProgressCallback>;

    beforeEach(() => {
      callback = jest.fn();
      reporter = new ProgressReporter({ callback });
    });

    test('should call preparing method', () => {
      reporter.preparing('Preparing data', 25, { key: 'value' });

      expect(callback).toHaveBeenCalledWith({
        stage: 'preparing',
        message: 'Preparing data',
        progressPercent: 25,
        details: { key: 'value' },
      });
    });

    test('should call submitting method', () => {
      reporter.submitting('Submitting transaction', 50);

      expect(callback).toHaveBeenCalledWith({
        stage: 'submitting',
        message: 'Submitting transaction',
        progressPercent: 50,
        details: undefined,
      });
    });

    test('should call confirming method', () => {
      reporter.confirming('Confirming receipt', 75);

      expect(callback).toHaveBeenCalledWith({
        stage: 'confirming',
        message: 'Confirming receipt',
        progressPercent: 75,
        details: undefined,
      });
    });

    test('should call verifying method', () => {
      reporter.verifying('Verifying signature', 90);

      expect(callback).toHaveBeenCalledWith({
        stage: 'verifying',
        message: 'Verifying signature',
        progressPercent: 90,
        details: undefined,
      });
    });

    test('should call completed method', () => {
      reporter.completed('Task finished successfully');

      expect(callback).toHaveBeenCalledWith({
        stage: 'completed',
        message: 'Task finished successfully',
        progressPercent: 100,
        details: undefined,
      });
    });

    test('should call failed method', () => {
      reporter.failed('Task failed with error', { error: 'Test error' });

      expect(callback).toHaveBeenCalledWith({
        stage: 'failed',
        message: 'Task failed with error',
        progressPercent: expect.any(Number),
        details: { error: 'Test error' },
      });
    });
  });

  describe('scalePercent', () => {
    test('should scale percent correctly', () => {
      const reporter = new ProgressReporter({
        minPercent: 20,
        maxPercent: 80,
      });

      const result = (reporter as any).scalePercent(50, 0, 100);

      expect(result).toBe(50); // 20 + (50-0) * (80-20)/(100-0) = 20 + 50 * 0.6 = 50
    });

    test('should handle different source ranges', () => {
      const reporter = new ProgressReporter({
        minPercent: 10,
        maxPercent: 90,
      });

      const result = (reporter as any).scalePercent(75, 25, 125);

      expect(result).toBeCloseTo(50);
    });
  });
});
