import type { JsonValue } from '../types';
import { ZodError } from 'zod';

export interface ErrorDetails {
  status: number;
  statusText: string;
  body: JsonValue;
}

export class RegistryBrokerError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: JsonValue;

  constructor(message: string, details: ErrorDetails) {
    super(message);
    this.status = details.status;
    this.statusText = details.statusText;
    this.body = details.body;
  }
}

export class RegistryBrokerParseError extends Error {
  readonly cause: ZodError | Error | string;
  readonly rawValue?: JsonValue;

  constructor(
    message: string,
    cause: ZodError | Error | string,
    rawValue?: JsonValue,
  ) {
    super(message);
    this.cause = cause;
    this.rawValue = rawValue;
  }
}
