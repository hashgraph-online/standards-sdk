export type HCS21ErrorCode =
  | 'size_exceeded'
  | 'invalid_payload'
  | 'missing_signature'
  | 'verification_failed';

export class HCS21ValidationError extends Error {
  constructor(
    message: string,
    public readonly code: HCS21ErrorCode,
  ) {
    super(message);
    this.name = 'HCS21ValidationError';
  }
}
