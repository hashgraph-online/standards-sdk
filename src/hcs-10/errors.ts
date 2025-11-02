export class PayloadSizeError extends Error {
  constructor(
    message: string,
    public payloadSize: number,
  ) {
    super(message);
    this.name = 'PayloadSizeError';
  }
}

export class AccountCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountCreationError';
  }
}

export class TopicCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TopicCreationError';
  }
}

export class ConnectionConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionConfirmationError';
  }
}
