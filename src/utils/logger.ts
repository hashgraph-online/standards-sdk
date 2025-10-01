import { Writable } from 'stream';
import { inspect } from 'util';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface LoggerOptions {
  level?: LogLevel;
  module?: string;
  prettyPrint?: boolean;
  silent?: boolean;
}

export interface ILogger {
  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  trace(...args: any[]): void;
  setLogLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  setSilent(silent: boolean): void;
  setModule(module: string): void;
}

export type LoggerFactory = (options: LoggerOptions) => ILogger;

let loggerFactory: LoggerFactory | null = null;

/**
 * Set a custom logger factory to override the default Pino-based implementation
 */
export function setLoggerFactory(factory: LoggerFactory): void {
  loggerFactory = factory;
  Logger.clearInstances();
}

export class Logger implements ILogger {
  private static instances: Map<string, ILogger> = new Map();
  private level: LogLevel;
  private moduleContext: string;
  private silent: boolean;
  private prettyPrint: boolean;
  private outputStream: Writable;

  constructor(options: LoggerOptions = {}) {
    if (loggerFactory) {
      return loggerFactory(options) as any;
    }

    const globalDisable = process.env.DISABLE_LOGS === 'true';

    this.silent = options.silent || globalDisable;
    this.level = this.silent ? 'silent' : options.level || 'info';
    this.moduleContext = options.module || 'app';
    this.prettyPrint = !this.silent && options.prettyPrint !== false;
    this.outputStream = process.stdout;
  }

  static getInstance(options: LoggerOptions = {}): ILogger {
    const moduleKey = options.module || 'default';

    const globalDisable = process.env.DISABLE_LOGS === 'true';

    if (globalDisable && Logger.instances.has(moduleKey)) {
      const existingLogger = Logger.instances.get(moduleKey)!;
      if (existingLogger.getLevel() !== 'silent') {
        Logger.instances.delete(moduleKey);
      }
    }

    if (!Logger.instances.has(moduleKey)) {
      const logger = loggerFactory
        ? loggerFactory(options)
        : new Logger(options);
      Logger.instances.set(moduleKey, logger);
    }

    return Logger.instances.get(moduleKey)!;
  }

  setLogLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  setSilent(silent: boolean): void {
    this.silent = silent;
    if (silent) {
      this.level = 'silent';
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
      if (
        typeof arg === 'string' ||
        typeof arg === 'number' ||
        typeof arg === 'boolean'
      ) {
        stringArgs.push(String(arg));
      } else {
        objectArgs.push(arg);
      }
    });

    const msg = stringArgs.join(' ');
    return objectArgs.length > 0 ? { msg, data: objectArgs } : { msg };
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.silent || this.level === 'silent') return false;
    
    const levels = ['trace', 'debug', 'info', 'warn', 'error', 'silent'];
    const currentLevelIndex = levels.indexOf(this.level);
    const targetLevelIndex = levels.indexOf(level);
    
    return targetLevelIndex >= currentLevelIndex;
  }

  private writeLog(level: LogLevel, ...args: any[]): void {
    if (!this.shouldLog(level)) return;

    const { msg, data } = this.formatArgs(args);
    const timestamp = new Date().toISOString();
    
    if (this.prettyPrint) {
      const levelFormatted = level.toUpperCase().padEnd(5);
      let output = `${timestamp} ${levelFormatted} [${this.moduleContext}] ${msg}`;
      
      if (data) {
        output += '\n' + inspect(data, { colors: true, depth: 3 });
      }
      
      this.outputStream.write(output + '\n');
    } else {
      const logObj = {
        timestamp,
        level,
        module: this.moduleContext,
        message: msg,
        ...(data && { data })
      };
      
      this.outputStream.write(JSON.stringify(logObj) + '\n');
    }
  }

  debug(...args: any[]): void {
    this.writeLog('debug', ...args);
  }

  info(...args: any[]): void {
    this.writeLog('info', ...args);
  }

  warn(...args: any[]): void {
    this.writeLog('warn', ...args);
  }

  error(...args: any[]): void {
    this.writeLog('error', ...args);
  }

  trace(...args: any[]): void {
    this.writeLog('trace', ...args);
  }

  /**
   * Clear all logger instances
   * Used when switching logger implementations
   */
  static clearInstances(): void {
    Logger.instances.clear();
  }
}
