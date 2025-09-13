import { PublicKey } from '@hashgraph/sdk';
import { accountIdsToExemptKeys } from '../../src/utils/topic-fee-utils';
import { HederaMirrorNode } from '../../src/services/mirror-node';
import { ILogger } from '../../src/utils/logger';

jest.mock('@hashgraph/sdk', () => ({
  PublicKey: {
    fromString: jest.fn(),
  },
}));

jest.mock('../../src/services/mirror-node', () => ({
  HederaMirrorNode: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  ILogger: {},
}));

describe('topic-fee-utils', () => {
  let mockMirrorNode: jest.Mocked<HederaMirrorNode>;
  let mockLogger: jest.Mocked<ILogger>;
  let mockPublicKey: PublicKey;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPublicKey = { toString: jest.fn() } as any;
    mockLogger = {
      warn: jest.fn(),
    } as jest.Mocked<ILogger>;

    mockMirrorNode = {
      getPublicKey: jest.fn(),
    } as any;

    (HederaMirrorNode as jest.Mock).mockImplementation(() => mockMirrorNode);
    (PublicKey.fromString as jest.Mock).mockReturnValue(mockPublicKey);
  });

  describe('accountIdsToExemptKeys', () => {
    test('should convert account IDs to public keys successfully', async () => {
      const accountIds = ['0.0.123', '0.0.456'];
      const network = 'testnet';
      const expectedPublicKeys = [mockPublicKey, mockPublicKey];

      mockMirrorNode.getPublicKey
        .mockResolvedValueOnce(mockPublicKey)
        .mockResolvedValueOnce(mockPublicKey);

      const result = await accountIdsToExemptKeys(
        accountIds,
        network,
        mockLogger,
      );

      expect(HederaMirrorNode).toHaveBeenCalledWith(network, mockLogger);
      expect(mockMirrorNode.getPublicKey).toHaveBeenCalledWith('0.0.123');
      expect(mockMirrorNode.getPublicKey).toHaveBeenCalledWith('0.0.456');
      expect(result).toEqual(expectedPublicKeys);
    });

    test('should handle errors gracefully and continue processing other accounts', async () => {
      const accountIds = ['0.0.123', '0.0.456', '0.0.789'];
      const network = 'mainnet';
      const expectedPublicKeys = [mockPublicKey, mockPublicKey]; // Only 2 should succeed

      mockMirrorNode.getPublicKey
        .mockResolvedValueOnce(mockPublicKey) // First call succeeds
        .mockRejectedValueOnce(new Error('Network error')) // Second call fails
        .mockResolvedValueOnce(mockPublicKey); // Third call succeeds

      const result = await accountIdsToExemptKeys(
        accountIds,
        network,
        mockLogger,
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Could not get public key for account 0.0.456: Error: Network error',
      );
      expect(result).toEqual(expectedPublicKeys);
      expect(result).toHaveLength(2);
    });

    test('should return empty array when no account IDs provided', async () => {
      const accountIds: string[] = [];
      const network = 'testnet';

      const result = await accountIdsToExemptKeys(
        accountIds,
        network,
        mockLogger,
      );

      expect(HederaMirrorNode).toHaveBeenCalledWith(network, mockLogger);
      expect(mockMirrorNode.getPublicKey).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    test('should handle single account ID', async () => {
      const accountIds = ['0.0.123'];
      const network = 'testnet';
      const expectedPublicKeys = [mockPublicKey];

      mockMirrorNode.getPublicKey.mockResolvedValue(mockPublicKey);

      const result = await accountIdsToExemptKeys(
        accountIds,
        network,
        mockLogger,
      );

      expect(mockMirrorNode.getPublicKey).toHaveBeenCalledWith('0.0.123');
      expect(result).toEqual(expectedPublicKeys);
    });

    test('should work without logger', async () => {
      const accountIds = ['0.0.123'];
      const network = 'testnet';
      const expectedPublicKeys = [mockPublicKey];

      mockMirrorNode.getPublicKey.mockResolvedValue(mockPublicKey);

      const result = await accountIdsToExemptKeys(accountIds, network);

      expect(HederaMirrorNode).toHaveBeenCalledWith(network, undefined);
      expect(result).toEqual(expectedPublicKeys);
    });

    test('should handle all accounts failing', async () => {
      const accountIds = ['0.0.123', '0.0.456'];
      const network = 'testnet';

      mockMirrorNode.getPublicKey
        .mockRejectedValueOnce(new Error('Network error 1'))
        .mockRejectedValueOnce(new Error('Network error 2'));

      const result = await accountIdsToExemptKeys(
        accountIds,
        network,
        mockLogger,
      );

      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
      expect(result).toEqual([]);
    });
  });
});
