/**
 * HCS-20 Specific Error Classes
 */

/**
 * Base error class for HCS-20 operations
 */
export class HCS20Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HCS20Error';
  }
}

/**
 * Error thrown when points deployment fails
 */
export class PointsDeploymentError extends HCS20Error {
  constructor(
    message: string,
    public readonly tick?: string,
  ) {
    super(message);
    this.name = 'PointsDeploymentError';
  }
}

/**
 * Error thrown when points minting fails
 */
export class PointsMintError extends HCS20Error {
  constructor(
    message: string,
    public readonly tick: string,
    public readonly requestedAmount: string,
    public readonly availableSupply?: string,
  ) {
    super(message);
    this.name = 'PointsMintError';
  }
}

/**
 * Error thrown when points transfer fails
 */
export class PointsTransferError extends HCS20Error {
  constructor(
    message: string,
    public readonly tick: string,
    public readonly from: string,
    public readonly to: string,
    public readonly amount: string,
    public readonly availableBalance?: string,
  ) {
    super(message);
    this.name = 'PointsTransferError';
  }
}

/**
 * Error thrown when points burn fails
 */
export class PointsBurnError extends HCS20Error {
  constructor(
    message: string,
    public readonly tick: string,
    public readonly from: string,
    public readonly amount: string,
    public readonly availableBalance?: string,
  ) {
    super(message);
    this.name = 'PointsBurnError';
  }
}

/**
 * Error thrown when points validation fails
 */
export class PointsValidationError extends HCS20Error {
  constructor(
    message: string,
    public readonly validationErrors: string[],
  ) {
    super(message);
    this.name = 'PointsValidationError';
  }
}

/**
 * Error thrown when points are not found
 */
export class PointsNotFoundError extends HCS20Error {
  constructor(public readonly tick: string) {
    super(`Points with tick "${tick}" not found`);
    this.name = 'PointsNotFoundError';
  }
}

/**
 * Error thrown when topic registration fails
 */
export class TopicRegistrationError extends HCS20Error {
  constructor(
    message: string,
    public readonly topicId: string,
  ) {
    super(message);
    this.name = 'TopicRegistrationError';
  }
}

/**
 * Error thrown when insufficient balance
 */
export class InsufficientBalanceError extends HCS20Error {
  constructor(
    public readonly accountId: string,
    public readonly tick: string,
    public readonly required: string,
    public readonly available: string,
  ) {
    super(
      `Insufficient balance for ${tick}: required ${required}, available ${available}`,
    );
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * Error thrown when supply limit is exceeded
 */
export class SupplyLimitExceededError extends HCS20Error {
  constructor(
    public readonly tick: string,
    public readonly requested: string,
    public readonly maxSupply: string,
    public readonly currentSupply: string,
  ) {
    super(
      `Supply limit exceeded for ${tick}: max ${maxSupply}, current ${currentSupply}, requested ${requested}`,
    );
    this.name = 'SupplyLimitExceededError';
  }
}

/**
 * Error thrown when mint limit is exceeded
 */
export class MintLimitExceededError extends HCS20Error {
  constructor(
    public readonly tick: string,
    public readonly requested: string,
    public readonly limit: string,
  ) {
    super(
      `Mint limit exceeded for ${tick}: requested ${requested}, limit ${limit}`,
    );
    this.name = 'MintLimitExceededError';
  }
}

/**
 * Error thrown when HCS-20 message format is invalid
 */
export class InvalidMessageFormatError extends HCS20Error {
  constructor(
    message: string,
    public readonly messageData?: any,
  ) {
    super(message);
    this.name = 'InvalidMessageFormatError';
  }
}

/**
 * Error thrown when account format is invalid
 */
export class InvalidAccountFormatError extends HCS20Error {
  constructor(public readonly account: string) {
    super(`Invalid Hedera account format: ${account}`);
    this.name = 'InvalidAccountFormatError';
  }
}

/**
 * Error thrown when tick format is invalid
 */
export class InvalidTickFormatError extends HCS20Error {
  constructor(public readonly tick: string) {
    super(`Invalid tick format: ${tick}`);
    this.name = 'InvalidTickFormatError';
  }
}

/**
 * Error thrown when number format is invalid
 */
export class InvalidNumberFormatError extends HCS20Error {
  constructor(
    public readonly value: string,
    public readonly field: string,
  ) {
    super(`Invalid number format for ${field}: ${value}`);
    this.name = 'InvalidNumberFormatError';
  }
}
