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

  private formatArgs(args: any[]): { msg: string; data?: any } {
    if (args.length === 0) {
      return { msg: '' };
    }

    if (args.length === 1) {
      if (typeof args[0] === 'string') {
        return { msg: args[0] };
      }
      return { msg: '', data: args[0] };
    }

    const stringArgs: string[] = [];
    const objectArgs: any[] = [];

    args.forEach(arg => {
      if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
        stringArgs.push(String(arg));
      } else {
        objectArgs.push(arg);
      }
    });

    const msg = stringArgs.join(' ');
    return objectArgs.length > 0 ? { msg, data: objectArgs } : { msg };
  }

  debug(...args: any[]): void {
    const { msg, data } = this.formatArgs(args);
    const logObj = { module: this.moduleContext, ...(data && { data }) };
    this.logger.debug(logObj, msg);
  }

  info(...args: any[]): void {
    const { msg, data } = this.formatArgs(args);
    const logObj = { module: this.moduleContext, ...(data && { data }) };
    this.logger.info(logObj, msg);
  }

  warn(...args: any[]): void {
    const { msg, data } = this.formatArgs(args);
    const logObj = { module: this.moduleContext, ...(data && { data }) };
    this.logger.warn(logObj, msg);
  }

  error(...args: any[]): void {
    const { msg, data } = this.formatArgs(args);
    const logObj = { module: this.moduleContext, ...(data && { data }) };
    this.logger.error(logObj, msg);
  }

  trace(...args: any[]): void {
    const { msg, data } = this.formatArgs(args);
    const logObj = { module: this.moduleContext, ...(data && { data }) };
    this.logger.trace(logObj, msg);
  }
}
