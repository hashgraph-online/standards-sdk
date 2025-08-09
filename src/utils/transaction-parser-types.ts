import { proto } from '@hashgraph/proto';

export type AccountAmount = {
  accountId: string;
  amount: string;
  isDecimal?: boolean;
};

export type TokenAmount = {
  tokenId: string;
  accountId: string;
  amount: number;
};

export type ContractCallData = {
  contractId: string;
  gas: number;
  amount: number;
  functionParameters?: string;
  functionName?: string;
};

export type TokenMintData = {
  tokenId: string;
  amount: number;
  metadata?: string[];
};

export type TokenBurnData = {
  tokenId: string;
  amount: number;
  serialNumbers?: number[];
};

export type FixedFeeData = {
  amount: string;
  denominatingTokenId?: string;
};

export type FractionalFeeData = {
  numerator: string;
  denominator: string;
  minimumAmount: string;
  maximumAmount: string;
  netOfTransfers: boolean;
};

export type RoyaltyFeeData = {
  numerator: string;
  denominator: string;
  fallbackFee?: FixedFeeData;
};

export type CustomFeeData = {
  feeCollectorAccountId: string;
  feeType: 'FIXED_FEE' | 'FRACTIONAL_FEE' | 'ROYALTY_FEE';
  fixedFee?: FixedFeeData;
  fractionalFee?: FractionalFeeData;
  royaltyFee?: RoyaltyFeeData;
  allCollectorsAreExempt?: boolean;
};

export type TokenCreationData = {
  tokenName?: string;
  tokenSymbol?: string;
  initialSupply?: string;
  decimals?: number;
  maxSupply?: string;
  tokenType?: string;
  supplyType?: string;
  memo?: string;
  treasuryAccountId?: string;
  adminKey?: string;
  kycKey?: string;
  freezeKey?: string;
  wipeKey?: string;
  supplyKey?: string;
  feeScheduleKey?: string;
  pauseKey?: string;
  metadataKey?: string;
  autoRenewAccount?: string;
  autoRenewPeriod?: string;
  expiry?: string;
  customFees?: CustomFeeData[];
};

export type ConsensusCreateTopicData = {
  memo?: string;
  adminKey?: string;
  submitKey?: string;
  autoRenewPeriod?: string;
  autoRenewAccountId?: string;
};

export type ConsensusSubmitMessageData = {
  topicId?: string;
  message?: string;
  messageEncoding?: 'utf8' | 'base64';
  chunkInfoInitialTransactionID?: string;
  chunkInfoNumber?: number;
  chunkInfoTotal?: number;
};

export type CryptoDeleteData = {
  deleteAccountId?: string;
  transferAccountId?: string;
};

export type FileCreateData = {
  expirationTime?: string;
  keys?: string;
  contents?: string;
  memo?: string;
  maxSize?: string;
  // Enhanced content fields
  contentType?: string;
  contentSize?: number;
};

export type FileAppendData = {
  fileId?: string;
  contents?: string;
  // Enhanced content fields
  contentSize?: number;
};

export type FileUpdateData = {
  fileId?: string;
  expirationTime?: string;
  keys?: string;
  contents?: string;
  memo?: string;
  // Enhanced content fields
  contentSize?: number;
};

export type FileDeleteData = {
  fileId?: string;
};

export type ConsensusUpdateTopicData = {
  topicId?: string;
  memo?: string;
  adminKey?: string;
  submitKey?: string;
  autoRenewPeriod?: string;
  autoRenewAccountId?: string;
  clearAdminKey?: boolean;
  clearSubmitKey?: boolean;
};

export type ConsensusDeleteTopicData = {
  topicId?: string;
};

export type TokenUpdateData = {
  tokenId?: string;
  name?: string;
  symbol?: string;
  treasuryAccountId?: string;
  adminKey?: string;
  kycKey?: string;
  freezeKey?: string;
  wipeKey?: string;
  supplyKey?: string;
  feeScheduleKey?: string;
  pauseKey?: string;
  autoRenewAccountId?: string;
  autoRenewPeriod?: string;
  memo?: string;
  expiry?: string;
};

export type TokenFeeScheduleUpdateData = {
  tokenId?: string;
  customFees?: CustomFeeData[];
};

export type UtilPrngData = {
  range?: number;
  prngBytes?: string;
};

/**
 * System and Network Operation Data Types
 */
export type NetworkFreezeData = {
  startTime?: string;
  endTime?: string;
  updateFile?: string;
  fileHash?: string;
  freezeType?:
    | 'FREEZE_ONLY'
    | 'PREPARE_UPGRADE'
    | 'FREEZE_UPGRADE'
    | 'FREEZE_ABORT';
};

export type SystemDeleteData = {
  fileId?: string;
  contractId?: string;
  expirationTime?: string;
};

export type SystemUndeleteData = {
  fileId?: string;
  contractId?: string;
};

export type NodeCreateData = {
  nodeId?: number;
  accountId?: string;
  description?: string;
  gossipEndpoint?: Array<{
    ipAddressV4?: Uint8Array;
    port?: number;
  }>;
  serviceEndpoint?: Array<{
    ipAddressV4?: Uint8Array;
    port?: number;
  }>;
  gossipCaCertificate?: string;
  grpcCertificateHash?: string;
  adminKey?: string;
};

export type NodeUpdateData = {
  nodeId?: number;
  accountId?: string;
  description?: string;
  gossipEndpoint?: Array<{
    ipAddressV4?: Uint8Array;
    port?: number;
  }>;
  serviceEndpoint?: Array<{
    ipAddressV4?: Uint8Array;
    port?: number;
  }>;
  gossipCaCertificate?: string;
  grpcCertificateHash?: string;
  adminKey?: string;
};

export type NodeDeleteData = {
  nodeId?: number;
};

export type TokenFreezeData = {
  tokenId?: string;
  accountId?: string;
};

export type TokenUnfreezeData = {
  tokenId?: string;
  accountId?: string;
};

export type TokenGrantKycData = {
  tokenId?: string;
  accountId?: string;
};

export type TokenRevokeKycData = {
  tokenId?: string;
  accountId?: string;
};

export type TokenPauseData = {
  tokenId?: string;
};

export type TokenUnpauseData = {
  tokenId?: string;
};

export type TokenWipeAccountData = {
  tokenId?: string;
  accountId?: string;
  serialNumbers?: string[];
  amount?: string;
};

export type TokenDeleteData = {
  tokenId?: string;
};

export type TokenAssociateData = {
  accountId?: string;
  tokenIds?: string[];
};

export type TokenDissociateData = {
  accountId?: string;
  tokenIds?: string[];
};

export type CryptoCreateAccountData = {
  initialBalance?: string;
  key?: string;
  receiverSigRequired?: boolean;
  autoRenewPeriod?: string;
  memo?: string;
  maxAutomaticTokenAssociations?: number;
  stakedAccountId?: string;
  stakedNodeId?: string;
  declineReward?: boolean;
  alias?: string;
};

export type CryptoUpdateAccountData = {
  accountIdToUpdate?: string;
  key?: string;
  expirationTime?: string;
  receiverSigRequired?: boolean;
  autoRenewPeriod?: string;
  memo?: string;
  maxAutomaticTokenAssociations?: number;
  stakedAccountId?: string;
  stakedNodeId?: string;
  declineReward?: boolean;
};

export type NftAllowance = {
  tokenId?: string;
  ownerAccountId?: string;
  spenderAccountId?: string;
  serialNumbers?: string[];
  approvedForAll?: boolean;
  delegatingSpender?: string;
};

export type CryptoApproveAllowanceData = {
  hbarAllowances?: {
    ownerAccountId?: string;
    spenderAccountId?: string;
    amount?: string;
  }[];
  tokenAllowances?: {
    tokenId?: string;
    ownerAccountId?: string;
    spenderAccountId?: string;
    amount?: string;
  }[];
  nftAllowances?: NftAllowance[];
};

export type CryptoDeleteAllowanceData = {
  nftAllowancesToRemove?: {
    ownerAccountId?: string;
    tokenId?: string;
    serialNumbers?: string[];
  }[];
};

export type ContractCreateData = {
  initialBalance?: string;
  gas?: string;
  adminKey?: string;
  constructorParameters?: string;
  memo?: string;
  autoRenewPeriod?: string;
  stakedAccountId?: string;
  stakedNodeId?: string;
  declineReward?: boolean;
  maxAutomaticTokenAssociations?: number;
  initcodeSource?: 'fileID' | 'bytes';
  initcode?: string;
};

export type ContractUpdateData = {
  contractIdToUpdate?: string;
  adminKey?: string;
  expirationTime?: string;
  autoRenewPeriod?: string;
  memo?: string;
  stakedAccountId?: string;
  stakedNodeId?: string;
  declineReward?: boolean;
  maxAutomaticTokenAssociations?: number;
  autoRenewAccountId?: string;
};

export type ContractDeleteData = {
  contractIdToDelete?: string;
  transferAccountId?: string;
  transferContractId?: string;
};

/**
 * Token Airdrop data structure supporting both fungible tokens and NFTs
 */
export type TokenAirdropData = {
  tokenTransfers: {
    tokenId: string;
    transfers: Array<{
      accountId: string;
      amount: string;
      serialNumbers?: string[];
    }>;
  }[];
};

/**
 * Schedule Create data structure
 */
export type ScheduleCreateData = {
  scheduledTransactionBody?: string;
  memo?: string;
  adminKey?: string;
  payerAccountId?: string;
  expirationTime?: string;
  waitForExpiry?: boolean;
};

/**
 * Schedule Sign data structure
 */
export type ScheduleSignData = {
  scheduleId?: string;
};

/**
 * Schedule Delete data structure
 */
export type ScheduleDeleteData = {
  scheduleId?: string;
};

/**
 * Validation result for transaction bytes
 */
export type ValidationResult = {
  isValid: boolean;
  format?: 'base64' | 'hex';
  error?: string;
  length?: number;
};

/**
 * Parse options for configuring parsing behavior
 */
export type ParseOptions = {
  /** Whether to use fallback parsing when primary parsing fails */
  enableFallback?: boolean;
  /** Whether to enforce strict validation of transaction format */
  strictMode?: boolean;
  /** Whether to include raw protobuf data in the result */
  includeRaw?: boolean;
  /** Maximum number of retry attempts for parsing */
  maxRetries?: number;
};

/**
 * Custom error class for transaction parsing failures
 */
export class TransactionParsingError extends Error {
  public readonly code: string;
  public readonly originalError?: Error;
  public readonly transactionBytes?: string;

  constructor(
    message: string,
    code: string = 'PARSING_FAILED',
    originalError?: Error,
    transactionBytes?: string,
  ) {
    super(message);
    this.name = 'TransactionParsingError';
    this.code = code;
    this.originalError = originalError;
    this.transactionBytes = transactionBytes;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TransactionParsingError);
    }
  }
}

export type ParsedTransaction = {
  type: string;
  humanReadableType: string;
  transfers: AccountAmount[];
  tokenTransfers: TokenAmount[];
  memo?: string;
  transactionFee?: string;
  contractCall?: ContractCallData;
  tokenMint?: TokenMintData;
  tokenBurn?: TokenBurnData;
  tokenCreation?: TokenCreationData;
  consensusCreateTopic?: ConsensusCreateTopicData;
  consensusSubmitMessage?: ConsensusSubmitMessageData;
  cryptoDelete?: CryptoDeleteData;
  fileCreate?: FileCreateData;
  fileAppend?: FileAppendData;
  fileUpdate?: FileUpdateData;
  fileDelete?: FileDeleteData;
  consensusUpdateTopic?: ConsensusUpdateTopicData;
  consensusDeleteTopic?: ConsensusDeleteTopicData;
  tokenUpdate?: TokenUpdateData;
  tokenFeeScheduleUpdate?: TokenFeeScheduleUpdateData;
  utilPrng?: UtilPrngData;
  tokenFreeze?: TokenFreezeData;
  tokenUnfreeze?: TokenUnfreezeData;
  tokenGrantKyc?: TokenGrantKycData;
  tokenRevokeKyc?: TokenRevokeKycData;
  tokenPause?: TokenPauseData;
  tokenUnpause?: TokenUnpauseData;
  tokenWipeAccount?: TokenWipeAccountData;
  tokenDelete?: TokenDeleteData;
  tokenAssociate?: TokenAssociateData;
  tokenDissociate?: TokenDissociateData;
  cryptoCreateAccount?: CryptoCreateAccountData;
  cryptoUpdateAccount?: CryptoUpdateAccountData;
  cryptoApproveAllowance?: CryptoApproveAllowanceData;
  cryptoDeleteAllowance?: CryptoDeleteAllowanceData;
  contractCreate?: ContractCreateData;
  contractUpdate?: ContractUpdateData;
  contractDelete?: ContractDeleteData;
  /** New fields for unified parser */
  tokenAirdrop?: TokenAirdropData;
  scheduleCreate?: ScheduleCreateData;
  scheduleSign?: ScheduleSignData;
  scheduleDelete?: ScheduleDeleteData;
  /** Metadata fields */
  transactionId?: string;
  nodeAccountIds?: string[];
  maxTransactionFee?: string;
  validStart?: string;
  validDuration?: string;
  /** Transaction details and debugging info */
  details?: Record<string, any>;
  /** Format detection metadata */
  formatDetection?: {
    originalFormat: 'base64' | 'hex';
    wasConverted: boolean;
    length: number;
  };
  raw?: proto.SchedulableTransactionBody;
};
