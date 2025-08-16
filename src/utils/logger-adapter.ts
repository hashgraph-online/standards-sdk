import { Logger, ILogger } from './logger';

/**
 * Creates a Logger instance that wraps an ILogger implementation
 * This is needed for compatibility with external libraries that expect the concrete Logger type
 */
export function createLoggerAdapter(iLogger: ILogger): Logger {
  const adapter = Object.create(Logger.prototype);

  adapter.debug = (...args: any[]) => iLogger.debug(...args);
  adapter.info = (...args: any[]) => iLogger.info(...args);
  adapter.warn = (...args: any[]) => iLogger.warn(...args);
  adapter.error = (...args: any[]) => iLogger.error(...args);
  adapter.trace = (...args: any[]) => iLogger.trace(...args);
  adapter.setLogLevel = (level: any) => iLogger.setLogLevel(level);
  adapter.getLevel = () => iLogger.getLevel();
  adapter.setSilent = (silent: boolean) => iLogger.setSilent(silent);
  adapter.setModule = (module: string) => iLogger.setModule(module);

  adapter.logger = { level: iLogger.getLevel() };
  adapter.moduleContext = '';
  adapter.formatArgs = () => ({ msg: '' });

  return adapter as Logger;
}

/**
 * Type guard to check if a logger is the concrete Logger type
 */
export function isConcreteLogger(logger: ILogger | Logger): logger is Logger {
  return logger instanceof Logger;
}

/**
 * Gets a Logger-compatible instance from an ILogger
 * If the ILogger is already a Logger, returns it as-is
 * Otherwise, creates an adapter
 */
export function ensureLoggerType(logger: ILogger): Logger {
  if (isConcreteLogger(logger)) {
    return logger;
  }
  return createLoggerAdapter(logger);
}
