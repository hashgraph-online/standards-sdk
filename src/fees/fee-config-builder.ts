import {
  FeeConfigBuilderInterface,
  TokenFeeConfig,
  TopicFeeConfig,
  CustomFeeType,
} from './types';
import { HederaMirrorNode } from '../services/mirror-node';
import { Logger } from '../utils/logger';
import { NetworkType } from '../utils/types';

/**
 * FeeConfigBuilder provides a fluent interface for creating fee configurations
 * for HCS-10 topics. This makes it easy to configure fees without dealing with
 * the complexity of the underlying fee structure.
 *
 * Example usage:
 *
 * // Super simple one-liner with the factory method
 * const simpleFeeConfig = FeeConfigBuilder.forHbar(5, '0.0.12345', NetworkType.TESTNET, new Logger(), ['0.0.67890']);
 *
 * // With multiple fees:
 * const multipleFeeConfig = new FeeConfigBuilder({
 *   network: NetworkType.TESTNET,
 *   logger: new Logger(),
 *   defaultCollectorAccountId: '0.0.12345',
 *   defaultExemptAccountIds: ['0.0.67890']
 * })
 *   .withHbarFee(1) // 1 HBAR fee
 *   .withTokenFee(10, '0.0.54321') // 10 units of token 0.0.54321
 *   .build();
 *
 * With Agent Builder
 * const agent = new AgentBuilder()
 *   .setName('Fee Collector Agent')
 *   .setDescription('An agent that collects fees')
 *   .setInboundTopicType(InboundTopicType.FEE_BASED)
 *   .setFeeConfig(FeeConfigBuilder.forHbar(1, '0.0.12345', NetworkType.TESTNET, new Logger(), ['0.0.67890']))
 *   .setNetwork('testnet')
  .build();

 * Directly with client
 * const client = new HCS10Client(config);
 * const connectionFeeConfig = new FeeConfigBuilder({
 *   network: NetworkType.TESTNET,
 *   logger: new Logger(),
 *   defaultCollectorAccountId: client.getAccountAndSigner().accountId,
 *   defaultExemptAccountIds: ['0.0.67890']
 * })
 *   .withHbarFee(0.5) // 0.5 HBAR (simple!)
 *   .build();

 * const result = await client.handleConnectionRequest(
 *   inboundTopicId,
 *   requestingAccountId,
 *   connectionRequestId,
 *   connectionFeeConfig
 * );
*/
export interface FeeConfigBuilderOptions {
  network: NetworkType;
  logger: Logger;
  defaultCollectorAccountId?: string;
}

export class FeeConfigBuilder implements FeeConfigBuilderInterface {
  private customFees: TokenFeeConfig[] = [];
  private mirrorNode: HederaMirrorNode;
  private logger: Logger;
  private defaultCollectorAccountId: string;

  constructor(options: FeeConfigBuilderOptions) {
    this.logger = options.logger;
    this.mirrorNode = new HederaMirrorNode(options.network, options.logger);
    this.defaultCollectorAccountId = options.defaultCollectorAccountId || '';
  }

  /**
   * Static factory method to create a FeeConfigBuilder with a single HBAR fee.
   * @param hbarAmount Amount in HBAR.
   * @param collectorAccountId Optional account ID to collect the fee. If omitted or undefined, defaults to the agent's own account ID during topic creation.
   * @param network Network type ('mainnet' or 'testnet').
   * @param logger Logger instance.
   * @param exemptAccounts Optional array of account IDs exempt from this fee.
   * @returns A configured FeeConfigBuilder instance.
   */
  static forHbar(
    hbarAmount: number,
    collectorAccountId: string | undefined,
    network: NetworkType,
    logger: Logger,
    exemptAccounts: string[] = [],
  ): FeeConfigBuilder {
    const builder = new FeeConfigBuilder({
      network,
      logger,
      defaultCollectorAccountId: collectorAccountId,
    });
    return builder.addHbarFee(hbarAmount, collectorAccountId, exemptAccounts);
  }

  /**
   * Static factory method to create a FeeConfigBuilder with a single token fee.
   * Automatically fetches token decimals if not provided.
   * @param tokenAmount Amount of tokens.
   * @param feeTokenId Token ID for the fee.
   * @param collectorAccountId Optional account ID to collect the fee. If omitted or undefined, defaults to the agent's own account ID during topic creation.
   * @param network Network type ('mainnet' or 'testnet').
   * @param logger Logger instance.
   * @param exemptAccounts Optional array of account IDs exempt from this fee.
   * @param decimals Optional decimals for the token (fetched if omitted).
   * @returns A Promise resolving to a configured FeeConfigBuilder instance.
   */
  static async forToken(
    tokenAmount: number,
    feeTokenId: string,
    collectorAccountId: string | undefined,
    network: NetworkType,
    logger: Logger,
    exemptAccounts: string[] = [],
    decimals?: number,
  ): Promise<FeeConfigBuilder> {
    const builder = new FeeConfigBuilder({
      network,
      logger,
      defaultCollectorAccountId: collectorAccountId,
    });
    await builder.addTokenFee(
      tokenAmount,
      feeTokenId,
      collectorAccountId,
      decimals,
      exemptAccounts,
    );
    return builder;
  }

  /**
   * Adds an HBAR fee configuration to the builder.
   * Allows chaining multiple fee additions.
   * @param hbarAmount The amount in HBAR (e.g., 0.5).
   * @param collectorAccountId Optional. The account ID to collect this fee. If omitted, defaults to the agent's own account ID during topic creation.
   * @param exemptAccountIds Optional. Accounts specifically exempt from *this* HBAR fee.
   * @returns This FeeConfigBuilder instance for chaining.
   */
  addHbarFee(
    hbarAmount: number,
    collectorAccountId?: string,
    exemptAccountIds: string[] = [],
  ): FeeConfigBuilder {
    if (hbarAmount <= 0) {
      throw new Error('HBAR amount must be greater than zero');
    }

    this.customFees.push({
      feeAmount: {
        amount: hbarAmount * 100_000_000,
        decimals: 0,
      },
      feeCollectorAccountId: collectorAccountId || '',
      feeTokenId: undefined,
      exemptAccounts: [...exemptAccountIds],
      type: CustomFeeType.FIXED_FEE,
    });

    return this;
  }

  /**
   * Adds a token fee configuration to the builder.
   * Allows chaining multiple fee additions.
   * Fetches token decimals automatically if not provided.
   * @param tokenAmount The amount of the specified token.
   * @param feeTokenId The ID of the token to charge the fee in.
   * @param collectorAccountId Optional. The account ID to collect this fee. If omitted, defaults to the agent's own account ID during topic creation.
   * @param decimals Optional. The number of decimals for the token. If omitted, it will be fetched from the mirror node.
   * @param exemptAccountIds Optional. Accounts specifically exempt from *this* token fee.
   * @returns A Promise resolving to this FeeConfigBuilder instance for chaining.
   */
  async addTokenFee(
    tokenAmount: number,
    feeTokenId: string,
    collectorAccountId?: string,
    decimals?: number,
    exemptAccountIds: string[] = [],
  ): Promise<FeeConfigBuilder> {
    if (tokenAmount <= 0) {
      throw new Error('Token amount must be greater than zero');
    }
    if (!feeTokenId) {
      throw new Error('Fee token ID is required when adding a token fee');
    }

    let finalDecimals = decimals;
    if (finalDecimals === undefined) {
      try {
        const tokenInfo = await this.mirrorNode.getTokenInfo(feeTokenId);
        if (tokenInfo?.decimals) {
          finalDecimals = parseInt(tokenInfo.decimals, 10);
          this.logger.info(
            `Fetched decimals for ${feeTokenId}: ${finalDecimals}`,
          );
        } else {
          this.logger.warn(
            `Could not fetch decimals for ${feeTokenId}, defaulting to 0.`,
          );
          finalDecimals = 0;
        }
      } catch (error) {
        this.logger.error(
          `Error fetching decimals for ${feeTokenId}, defaulting to 0: ${error}`,
        );
        finalDecimals = 0;
      }
    }

    this.customFees.push({
      feeAmount: {
        amount: tokenAmount * 10 ** finalDecimals,
        decimals: finalDecimals,
      },
      feeCollectorAccountId: collectorAccountId || '',
      feeTokenId: feeTokenId,
      exemptAccounts: [...exemptAccountIds],
      type: CustomFeeType.FIXED_FEE,
    });

    return this;
  }

  /**
   * Builds the final TopicFeeConfig object.
   * @returns The TopicFeeConfig containing all added custom fees and a consolidated list of unique exempt accounts.
   * @throws Error if no fees have been added.
   * @throws Error if more than 10 fees have been added.
   */
  build(): TopicFeeConfig {
    if (this.customFees.length === 0) {
      throw new Error(
        'At least one fee must be added using addHbarFee/addTokenFee or created using forHbar/forToken',
      );
    }

    if (this.customFees.length > 10) {
      throw new Error('Maximum of 10 custom fees per topic allowed');
    }

    const allExemptAccounts = new Set<string>();
    this.customFees.forEach(fee => {
      fee.exemptAccounts.forEach(account => allExemptAccounts.add(account));
    });

    return {
      customFees: this.customFees,
      exemptAccounts: Array.from(allExemptAccounts),
    };
  }
}
