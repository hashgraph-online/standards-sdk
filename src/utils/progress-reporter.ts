import { Logger, ILogger } from './logger';

export type ProgressStage =
  | 'preparing'
  | 'submitting'
  | 'confirming'
  | 'verifying'
  | 'completed'
  | 'failed';

export interface ProgressData {
  stage: ProgressStage;
  message: string;
  progressPercent: number;
  details?: Record<string, any>;
}

export type ProgressCallback = (data: ProgressData) => void;

export interface ProgressReporterOptions {
  module?: string;
  callback?: ProgressCallback;
  logger?: ILogger;
  logProgress?: boolean;
  minPercent?: number;
  maxPercent?: number;
}

/**
 * ProgressReporter is a singleton class that reports progress of a task.
 * Can be used in a generalized fashion.
 */
export class ProgressReporter {
  private static instance: ProgressReporter;
  private module: string;
  private callback?: ProgressCallback;
  private logger: ILogger;
  private logProgress: boolean;
  private minPercent: number;
  private maxPercent: number;
  private lastReportedPercent: number;
  private lastReportedTime: number;
  private throttleMs: number;

  constructor(options: ProgressReporterOptions = {}) {
    this.module = options.module || 'Progress';
    this.callback = options.callback;
    this.logger =
      options.logger ||
      new Logger({
        level: 'info',
        module: 'ProgressReporter',
      });
    this.logProgress = options.logProgress ?? true;
    this.minPercent = options.minPercent ?? 0;
    this.maxPercent = options.maxPercent ?? 100;
    this.lastReportedPercent = -1;
    this.lastReportedTime = 0;
    this.throttleMs = 100;
  }

  static getInstance(options: ProgressReporterOptions = {}): ProgressReporter {
    if (!ProgressReporter.instance) {
      ProgressReporter.instance = new ProgressReporter(options);
    } else {
      if (options.callback) {
        ProgressReporter.instance.setCallback(options.callback);
      }
      if (options.module) {
        ProgressReporter.instance.setModule(options.module);
      }
      if (options.logger) {
        ProgressReporter.instance.setLogger(options.logger);
      }
      if (options.minPercent !== undefined) {
        ProgressReporter.instance.setMinPercent(options.minPercent);
      }
      if (options.maxPercent !== undefined) {
        ProgressReporter.instance.setMaxPercent(options.maxPercent);
      }
    }
    return ProgressReporter.instance;
  }

  setCallback(callback: ProgressCallback): void {
    this.callback = callback;
  }

  setModule(module: string): void {
    this.module = module;
  }

  setLogger(logger: ILogger): void {
    this.logger = logger;
  }

  setMinPercent(minPercent: number): void {
    this.minPercent = minPercent;
  }

  setMaxPercent(maxPercent: number): void {
    this.maxPercent = maxPercent;
  }

  createSubProgress(options: {
    minPercent: number;
    maxPercent: number;
    logPrefix?: string;
  }): ProgressReporter {
    const subReporter = new ProgressReporter({
      module: this.module,
      logger: this.logger,
      logProgress: this.logProgress,
      minPercent: options.minPercent,
      maxPercent: options.maxPercent,
    });

    const logPrefix = options.logPrefix || '';

    subReporter.setCallback(data => {
      const scaledPercent = this.scalePercent(
        data.progressPercent,
        options.minPercent,
        options.maxPercent,
      );

      let formattedMessage = data.message;
      if (logPrefix && !formattedMessage.startsWith(logPrefix)) {
        formattedMessage = `${logPrefix}: ${formattedMessage}`;
      }

      this.report({
        stage: data.stage,
        message: formattedMessage,
        progressPercent: scaledPercent,
        details: data.details,
      });
    });

    return subReporter;
  }

  report(data: ProgressData): void {
    const rawPercent = data.progressPercent;
    const percent = Math.max(0, Math.min(100, rawPercent));

    const scaledPercent = this.scalePercent(percent, 0, 100);

    const now = Date.now();
    if (
      scaledPercent === this.lastReportedPercent &&
      now - this.lastReportedTime < this.throttleMs &&
      data.stage !== 'completed' &&
      data.stage !== 'failed'
    ) {
      return;
    }

    this.lastReportedPercent = scaledPercent;
    this.lastReportedTime = now;

    const progressData = {
      ...data,
      progressPercent: scaledPercent,
    };

    if (this.logProgress) {
      this.logger.debug(
        `[${this.module}] [${data.stage.toUpperCase()}] ${
          data.message
        } (${scaledPercent.toFixed(1)}%)`,
        data.details,
      );
    }

    if (this.callback) {
      try {
        this.callback(progressData);
      } catch (err) {
        this.logger.warn(`Error in progress callback: ${err}`);
      }
    }
  }

  private scalePercent(
    percent: number,
    sourceMin: number,
    sourceMax: number,
  ): number {
    const range = this.maxPercent - this.minPercent;
    const sourceRange = sourceMax - sourceMin;
    const scaleFactor = range / sourceRange;

    return this.minPercent + (percent - sourceMin) * scaleFactor;
  }

  preparing(
    message: string,
    percent: number,
    details?: Record<string, any>,
  ): void {
    this.report({
      stage: 'preparing',
      message,
      progressPercent: percent,
      details,
    });
  }

  submitting(
    message: string,
    percent: number,
    details?: Record<string, any>,
  ): void {
    this.report({
      stage: 'submitting',
      message,
      progressPercent: percent,
      details,
    });
  }

  confirming(
    message: string,
    percent: number,
    details?: Record<string, any>,
  ): void {
    this.report({
      stage: 'confirming',
      message,
      progressPercent: percent,
      details,
    });
  }

  verifying(
    message: string,
    percent: number,
    details?: Record<string, any>,
  ): void {
    this.report({
      stage: 'verifying',
      message,
      progressPercent: percent,
      details,
    });
  }

  completed(message: string, details?: Record<string, any>): void {
    this.report({ stage: 'completed', message, progressPercent: 100, details });
  }

  failed(message: string, details?: Record<string, any>): void {
    this.report({
      stage: 'failed',
      message,
      progressPercent: this.lastReportedPercent,
      details,
    });
  }
}
