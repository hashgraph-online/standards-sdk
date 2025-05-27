export interface FeeConfigBuilderInterface {
  addHbarFee(
    hbarAmount: number,
    collectorAccountId?: string,
    exemptAccountIds?: string[],
  ): FeeConfigBuilderInterface;
  addTokenFee(
    tokenAmount: number,
    feeTokenId: string,
    collectorAccountId?: string,
    decimals?: number,
    exemptAccountIds?: string[],
  ): Promise<FeeConfigBuilderInterface>;
  build(): TopicFeeConfig;
}

export enum CustomFeeType {
  FIXED_FEE = 'FIXED_FEE',
  FRACTIONAL_FEE = 'FRACTIONAL_FEE',
  ROYALTY_FEE = 'ROYALTY_FEE',
}

export type FeeAmount = {
  amount: number;
  decimals?: number;
};

export interface TokenFeeConfig {
  feeAmount: FeeAmount;
  feeCollectorAccountId: string;
  feeTokenId?: string;
  exemptAccounts: string[];
  type: CustomFeeType;
}

export interface TopicFeeConfig {
  customFees: TokenFeeConfig[];
  exemptAccounts: string[];
}
