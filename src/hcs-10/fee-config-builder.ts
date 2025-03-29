import { FeeConfigBuilderInterface, TopicFeeConfig } from './types';

/**
 * FeeConfigBuilder provides a fluent interface for creating fee configurations
 * for HCS-10 topics. This makes it easy to configure fees without dealing with
 * the complexity of the underlying fee structure.
 *
 * Example usage:
 * ```typescript
 * const feeConfig = new FeeConfigBuilder()
 *   .setHbarAmount(1) // 1 HBAR
 *   .setFeeCollector('0.0.12345')
 *   .addExemptAccount('0.0.67890')
 *   .build();
 * ```
 */
export class FeeConfigBuilder implements FeeConfigBuilderInterface {
  private feeAmount: number = 0;
  private decimals: number = 0;
  private feeCollectorAccountId: string = '';
  private exemptAccountIds: string[] = [];

  /**
   * Static factory method to create a fee config with HBAR amount in one line
   * @param hbarAmount Amount in HBAR
   * @param collectorAccountId Account that will receive the fees
   * @param exemptAccounts Optional array of exempt account IDs
   * @returns A configured FeeConfigBuilder
   */
  static forHbar(
    hbarAmount: number,
    collectorAccountId: string,
    exemptAccounts: string[] = []
  ): FeeConfigBuilder {
    return new FeeConfigBuilder()
      .setHbarAmount(hbarAmount)
      .setFeeCollector(collectorAccountId)
      .addExemptAccounts(exemptAccounts);
  }

  /**
   * Sets the fee amount in HBAR (convenient method)
   * @param hbarAmount The amount in HBAR (e.g., 5 for 5 HBAR)
   * @returns This builder instance for method chaining
   */
  setHbarAmount(hbarAmount: number): FeeConfigBuilder {
    if (hbarAmount <= 0) {
      throw new Error('HBAR amount must be greater than zero');
    }

    // Convert HBAR to tinybars (1 HBAR = 100,000,000 tinybars)
    this.feeAmount = hbarAmount * 100_000_000;
    this.decimals = 0;
    return this;
  }

  /**
   * Sets the amount of the fee to be collected for topic submissions
   * @param amount The fee amount (in tinybars or token units)
   * @param decimals Decimal places for fixed point representation (default: 0)
   * @returns This builder instance for method chaining
   */
  setFeeAmount(amount: number, decimals: number = 0): FeeConfigBuilder {
    this.feeAmount = amount;
    this.decimals = decimals;
    return this;
  }

  /**
   * Sets the Hedera account ID that will collect the fees
   * @param accountId The fee collector's account ID (e.g., '0.0.12345')
   * @returns This builder instance for method chaining
   */
  setFeeCollector(accountId: string): FeeConfigBuilder {
    this.feeCollectorAccountId = accountId;
    return this;
  }

  /**
   * Adds an account ID to the list of accounts exempt from paying fees
   * @param accountId The account ID to exempt from fees
   * @returns This builder instance for method chaining
   */
  addExemptAccount(accountId: string): FeeConfigBuilder {
    if (!this.exemptAccountIds.includes(accountId)) {
      this.exemptAccountIds.push(accountId);
    }
    return this;
  }

  /**
   * Adds multiple account IDs to the list of accounts exempt from paying fees
   * @param accountIds Array of account IDs to exempt from fees
   * @returns This builder instance for method chaining
   */
  addExemptAccounts(accountIds: string[]): FeeConfigBuilder {
    for (const accountId of accountIds) {
      this.addExemptAccount(accountId);
    }
    return this;
  }

  /**
   * Builds and returns the final fee configuration object
   * @throws Error if fee collector account ID is not set or if fee amount is not positive
   * @returns A complete TopicFeeConfig object
   */
  build(): TopicFeeConfig {
    if (!this.feeCollectorAccountId) {
      throw new Error('Fee collector account ID is required');
    }

    if (this.feeAmount <= 0) {
      throw new Error('Fee amount must be greater than zero');
    }

    return {
      feeAmount: {
        amount: this.feeAmount,
        decimals: this.decimals,
      },
      feeCollectorAccountId: this.feeCollectorAccountId,
      exemptAccounts: this.exemptAccountIds,
    };
  }
}

/* Example usage:

// Super simple one-liner with the factory method
const simpleFeeConfig = FeeConfigBuilder.forHbar(5, '0.0.12345');

// With Agent Builder
const agent = new AgentBuilder()
  .setName('Fee Collector Agent')
  .setDescription('An agent that collects fees')
  .setInboundTopicType(InboundTopicType.FEE_BASED)
  .setFeeConfig(FeeConfigBuilder.forHbar(1, '0.0.12345', ['0.0.67890']))
  .setNetwork('testnet')
  .build();

// Directly with client
const client = new HCS10Client(config);
const connectionFeeConfig = new FeeConfigBuilder()
  .setHbarAmount(0.5) // 0.5 HBAR (simple!)
  .setFeeCollector(client.getAccountAndSigner().accountId)
  .addExemptAccount(requestingAccountId);

const result = await client.handleConnectionRequest(
  inboundTopicId,
  requestingAccountId,
  connectionRequestId,
  connectionFeeConfig
);

*/
