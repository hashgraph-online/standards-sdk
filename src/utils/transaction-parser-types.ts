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
  autoRenewAccount?: string;
  autoRenewPeriod?: string;
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
};

export type FileAppendData = {
  fileId?: string;
  contents?: string;
};

export type FileUpdateData = {
  fileId?: string;
  expirationTime?: string;
  keys?: string;
  contents?: string;
  memo?: string;
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
  raw: proto.SchedulableTransactionBody;
};
