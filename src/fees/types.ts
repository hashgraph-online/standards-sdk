export interface FeeConfigBuilderInterface {
  setHbarAmount(hbarAmount: number): FeeConfigBuilderInterface;
  setFeeAmount(amount: number, decimals?: number): FeeConfigBuilderInterface;
  setFeeCollector(accountId: string): FeeConfigBuilderInterface;
  addExemptAccount(accountId: string): FeeConfigBuilderInterface;
  addExemptAccounts(accountIds: string[]): FeeConfigBuilderInterface;
  build(): TopicFeeConfig;
}

export interface TopicFeeConfig {
  feeAmount: FeeAmount;
  feeCollectorAccountId: string;
  exemptAccounts?: string[];
}

export type FeeAmount = {
  amount: number;
  decimals?: number;
  tokenId?: string;
};

export interface TopicFeeConfig {
  feeAmount: FeeAmount;
  feeCollectorAccountId: string;
  exemptAccounts?: string[];
}
