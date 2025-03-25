import pino from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

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
    const level = options.level || 'info';
    this.moduleContext = options.module || 'app';

    const pinoOptions: pino.LoggerOptions = {
      level,
      enabled: !options.silent,
      transport:
        options.prettyPrint !== false
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

    if (!Logger.instances.has(moduleKey)) {
      Logger.instances.set(moduleKey, new Logger(options));
    }

    return Logger.instances.get(moduleKey)!;
  }

  setLogLevel(level: LogLevel): void {
    this.logger.level = level;
  }

  setSilent(silent: boolean): void {
    if (silent) {
      this.logger.level = 'silent';
    }
  }

  setModule(module: string): void {
    this.moduleContext = module;
  }

  debug(message: string, data?: any): void {
    if (data) {
      this.logger.debug({ module: this.moduleContext, ...data }, message);
    } else {
      this.logger.debug({ module: this.moduleContext }, message);
    }
  }

  info(message: string, data?: any): void {
    if (data) {
      this.logger.info({ module: this.moduleContext, ...data }, message);
    } else {
      this.logger.info({ module: this.moduleContext }, message);
    }
  }

  warn(message: string, data?: any): void {
    if (data) {
      this.logger.warn({ module: this.moduleContext, ...data }, message);
    } else {
      this.logger.warn({ module: this.moduleContext }, message);
    }
  }

  error(message: string, data?: any): void {
    if (data) {
      this.logger.error({ module: this.moduleContext, ...data }, message);
    } else {
      this.logger.error({ module: this.moduleContext }, message);
    }
  }
}
