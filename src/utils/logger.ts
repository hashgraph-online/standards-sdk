import pino from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface LoggerOptions {
  level?: LogLevel;
  module?: string;
  prettyPrint?: boolean;
  silent?: boolean;
}
export class Logger {
  private static instances: Map<string, Logger> = new Map();
  private logger: pino.Logger;
  private moduleContext: string;

  constructor(options: LoggerOptions = {}) {
    const globalDisable = process.env.DISABLE_LOGS === 'true';

    const shouldSilence = options.silent || globalDisable;
    const level = shouldSilence ? 'silent' : options.level || 'info';
    this.moduleContext = options.module || 'app';

    const shouldEnablePrettyPrint =
      !shouldSilence && options.prettyPrint !== false;
    const pinoOptions: pino.LoggerOptions = {
      level,
      enabled: !shouldSilence,
      transport: shouldEnablePrettyPrint
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    };

    this.logger = pino(pinoOptions);
  }

  static getInstance(options: LoggerOptions = {}): Logger {
    const moduleKey = options.module || 'default';

    const globalDisable = process.env.DISABLE_LOGS === 'true';

    if (globalDisable && Logger.instances.has(moduleKey)) {
      const existingLogger = Logger.instances.get(moduleKey)!;
      if (existingLogger.getLevel() !== 'silent') {
        Logger.instances.delete(moduleKey);
      }
    }

    if (!Logger.instances.has(moduleKey)) {
      Logger.instances.set(moduleKey, new Logger(options));
    }

    return Logger.instances.get(moduleKey)!;
  }

  setLogLevel(level: LogLevel): void {
    this.logger.level = level;
  }

  getLevel(): LogLevel {
    return this.logger.level as LogLevel;
  }

  setSilent(silent: boolean): void {
    if (silent) {
      this.logger.level = 'silent';
    }
  }

  setModule(module: string): void {
    this.moduleContext = module;
  }

  debug(...args: any[]): void {
    this.logger.debug({ module: this.moduleContext }, ...args);
  }

  info(...args: any[]): void {
    this.logger.info({ module: this.moduleContext }, ...args);
  }

  warn(...args: any[]): void {
    this.logger.warn({ module: this.moduleContext }, ...args);
  }

  error(...args: any[]): void {
    this.logger.error({ module: this.moduleContext }, ...args);
  }

  trace(...args: any[]): void {
    this.logger.trace({ module: this.moduleContext }, ...args);
  }
}
