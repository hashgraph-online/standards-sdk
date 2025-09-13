import { FeeConfigBuilder } from '../../src/fees/fee-config-builder';
import { NetworkType } from '../../src/utils/types';
import { Logger } from '../../src/utils/logger';
import { CustomFeeType } from '../../src/fees/types';

jest.mock('../../src/services/mirror-node', () => ({
  HederaMirrorNode: jest.fn().mockImplementation(() => ({
    getTokenInfo: jest.fn().mockResolvedValue({ decimals: '6' }),
  })),
}));

describe('FeeConfigBuilder', () => {
  let logger: Logger;
  let mirrorNodeMock: any;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger({ module: 'FeeConfigBuilderTest' });
    mirrorNodeMock = {
      getTokenInfo: jest.fn().mockResolvedValue({ decimals: '6' }),
    };
  });

  describe('Static Factory Methods', () => {
    test('forHbar creates builder with HBAR fee', () => {
      const builder = FeeConfigBuilder.forHbar(
        5,
        '0.0.12345',
        'testnet',
        logger,
        ['0.0.67890'],
      );

      expect(builder).toBeInstanceOf(FeeConfigBuilder);
      const config = builder.build();
      expect(config.customFees).toHaveLength(1);
      expect(config.customFees[0].feeAmount.amount).toBe(500_000_000); // 5 HBAR in tinybars
      expect(config.customFees[0].feeAmount.decimals).toBe(0);
      expect(config.customFees[0].feeCollectorAccountId).toBe('0.0.12345');
      expect(config.customFees[0].feeTokenId).toBeUndefined();
      expect(config.customFees[0].exemptAccounts).toEqual(['0.0.67890']);
      expect(config.customFees[0].type).toBe(CustomFeeType.FIXED_FEE);
    });

    test('forHbar with undefined collector uses empty string', () => {
      const builder = FeeConfigBuilder.forHbar(1, undefined, 'testnet', logger);

      const config = builder.build();
      expect(config.customFees[0].feeCollectorAccountId).toBe('');
    });

    test('forToken creates builder with token fee', async () => {
      mirrorNodeMock.getTokenInfo.mockResolvedValue({ decimals: '2' });

      const builder = await FeeConfigBuilder.forToken(
        10,
        '0.0.54321',
        '0.0.12345',
        'testnet',
        logger,
        ['0.0.67890'],
        2,
      );

      expect(builder).toBeInstanceOf(FeeConfigBuilder);
      const config = builder.build();
      expect(config.customFees).toHaveLength(1);
      expect(config.customFees[0].feeAmount.amount).toBe(1000); // 10 * 10^2
      expect(config.customFees[0].feeAmount.decimals).toBe(2);
      expect(config.customFees[0].feeCollectorAccountId).toBe('0.0.12345');
      expect(config.customFees[0].feeTokenId).toBe('0.0.54321');
      expect(config.customFees[0].exemptAccounts).toEqual(['0.0.67890']);
      expect(config.customFees[0].type).toBe(CustomFeeType.FIXED_FEE);
    });

    test('forToken fetches decimals when not provided', async () => {
      const builder = await FeeConfigBuilder.forToken(
        5,
        '0.0.99999',
        '0.0.11111',
        'testnet',
        logger,
      );

      const config = builder.build();
      expect(config.customFees[0].feeAmount.amount).toBe(5_000_000); // 5 * 10^6
      expect(config.customFees[0].feeAmount.decimals).toBe(6);
    });

    test('forToken defaults to 0 decimals when fetch fails', async () => {
      const HederaMirrorNodeMock =
        require('../../src/services/mirror-node').HederaMirrorNode;
      HederaMirrorNodeMock.mockImplementationOnce(() => ({
        getTokenInfo: jest.fn().mockRejectedValue(new Error('Network error')),
      }));

      const builder = await FeeConfigBuilder.forToken(
        1,
        '0.0.99999',
        '0.0.11111',
        'testnet',
        logger,
      );

      const config = builder.build();
      expect(config.customFees[0].feeAmount.amount).toBe(1); // 1 * 10^0
      expect(config.customFees[0].feeAmount.decimals).toBe(0);
    });
  });

  describe('Instance Methods', () => {
    let builder: FeeConfigBuilder;

    beforeEach(() => {
      builder = new FeeConfigBuilder({
        network: 'testnet',
        logger,
        defaultCollectorAccountId: '0.0.12345',
      });
    });

    describe('addHbarFee', () => {
      test('adds HBAR fee correctly', () => {
        const result = builder.addHbarFee(2.5, '0.0.67890', ['0.0.99999']);

        expect(result).toBe(builder); // Returns self for chaining
        const config = builder.build();
        expect(config.customFees).toHaveLength(1);
        expect(config.customFees[0].feeAmount.amount).toBe(250_000_000); // 2.5 HBAR
        expect(config.customFees[0].feeCollectorAccountId).toBe('0.0.67890');
        expect(config.customFees[0].exemptAccounts).toEqual(['0.0.99999']);
      });

      test('throws error for non-positive HBAR amount', () => {
        expect(() => builder.addHbarFee(0)).toThrow(
          'HBAR amount must be greater than zero',
        );
        expect(() => builder.addHbarFee(-1)).toThrow(
          'HBAR amount must be greater than zero',
        );
      });

      test('uses default collector when not specified', () => {
        builder.addHbarFee(1);
        const config = builder.build();
        expect(config.customFees[0].feeCollectorAccountId).toBe('0.0.12345');
      });

      test('uses empty string when collector not specified and no default', () => {
        const noDefaultBuilder = new FeeConfigBuilder({
          network: 'testnet',
          logger,
        });
        noDefaultBuilder.addHbarFee(1);
        const config = noDefaultBuilder.build();
        expect(config.customFees[0].feeCollectorAccountId).toBe('');
      });
    });

    describe('addTokenFee', () => {
      test('adds token fee with provided decimals', async () => {
        await builder.addTokenFee(100, '0.0.54321', '0.0.67890', 8, [
          '0.0.99999',
        ]);

        const config = builder.build();
        expect(config.customFees).toHaveLength(1);
        expect(config.customFees[0].feeAmount.amount).toBe(10_000_000_000); // 100 * 10^8
        expect(config.customFees[0].feeAmount.decimals).toBe(8);
        expect(config.customFees[0].feeCollectorAccountId).toBe('0.0.67890');
        expect(config.customFees[0].feeTokenId).toBe('0.0.54321');
        expect(config.customFees[0].exemptAccounts).toEqual(['0.0.99999']);
      });

      test('fetches decimals when not provided', async () => {
        await builder.addTokenFee(50, '0.0.11111');

        const config = builder.build();
        expect(config.customFees[0].feeAmount.amount).toBe(50_000_000); // 50 * 10^6 (mock returns 6 decimals)
        expect(config.customFees[0].feeAmount.decimals).toBe(6);
      });

      test('throws error for non-positive token amount', async () => {
        await expect(builder.addTokenFee(0, '0.0.12345')).rejects.toThrow(
          'Token amount must be greater than zero',
        );
        await expect(builder.addTokenFee(-5, '0.0.12345')).rejects.toThrow(
          'Token amount must be greater than zero',
        );
      });

      test('throws error for missing token ID', async () => {
        await expect(builder.addTokenFee(10, '')).rejects.toThrow(
          'Fee token ID is required when adding a token fee',
        );
        await expect(builder.addTokenFee(10, undefined as any)).rejects.toThrow(
          'Fee token ID is required when adding a token fee',
        );
      });

      test('handles mirror node errors gracefully', async () => {
        const HederaMirrorNodeMock =
          require('../../src/services/mirror-node').HederaMirrorNode;
        HederaMirrorNodeMock.mockImplementationOnce(() => ({
          getTokenInfo: jest
            .fn()
            .mockRejectedValue(new Error('Network timeout')),
        }));

        const testBuilder = new FeeConfigBuilder({
          network: 'testnet',
          logger,
        });
        await testBuilder.addTokenFee(25, '0.0.22222');

        const config = testBuilder.build();
        expect(config.customFees[0].feeAmount.amount).toBe(25); // 25 * 10^0
        expect(config.customFees[0].feeAmount.decimals).toBe(0);
      });
    });

    describe('build', () => {
      test('builds config with single fee', () => {
        builder.addHbarFee(1);
        const config = builder.build();

        expect(config.customFees).toHaveLength(1);
        expect(config.exemptAccounts).toEqual([]);
      });

      test('builds config with multiple fees', () => {
        builder
          .addHbarFee(1, '0.0.11111', ['0.0.22222'])
          .addHbarFee(2, '0.0.33333', ['0.0.44444', '0.0.22222']); // Overlapping exempt account

        const config = builder.build();

        expect(config.customFees).toHaveLength(2);
        expect(config.exemptAccounts).toEqual(['0.0.22222', '0.0.44444']); // Unique and sorted
      });

      test('throws error when no fees added', () => {
        expect(() => builder.build()).toThrow(
          'At least one fee must be added using addHbarFee/addTokenFee or created using forHbar/forToken',
        );
      });

      test('throws error when more than 10 fees added', () => {
        for (let i = 0; i < 11; i++) {
          builder.addHbarFee(1);
        }

        expect(() => builder.build()).toThrow(
          'Maximum of 10 custom fees per topic allowed',
        );
      });
    });
  });

  describe('Integration Scenarios', () => {
    test('complex fee configuration with multiple types', async () => {
      const builder = new FeeConfigBuilder({
        network: 'testnet',
        logger,
        defaultCollectorAccountId: '0.0.12345',
      });

      builder.addHbarFee(0.5, undefined, ['0.0.11111']);
      builder.addHbarFee(1.5, '0.0.22222', ['0.0.33333']);

      await builder.addTokenFee(1000, '0.0.44444', undefined, undefined, [
        '0.0.55555',
      ]);

      const config = builder.build();

      expect(config.customFees).toHaveLength(3);
      expect(config.exemptAccounts).toEqual([
        '0.0.11111',
        '0.0.33333',
        '0.0.55555',
      ]);

      expect(config.customFees[0].feeAmount.amount).toBe(50_000_000); // 0.5 HBAR
      expect(config.customFees[0].feeCollectorAccountId).toBe('0.0.12345'); // Default
      expect(config.customFees[1].feeAmount.amount).toBe(150_000_000); // 1.5 HBAR
      expect(config.customFees[1].feeCollectorAccountId).toBe('0.0.22222');

      expect(config.customFees[2].feeAmount.amount).toBe(1_000_000_000); // 1000 * 10^6
      expect(config.customFees[2].feeAmount.decimals).toBe(6);
      expect(config.customFees[2].feeTokenId).toBe('0.0.44444');
    });
  });
});
