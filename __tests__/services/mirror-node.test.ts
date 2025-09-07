import { HederaMirrorNode } from '../../src/services/mirror-node';
import { Logger } from '../../src/utils/logger';

jest.mock('axios');
const axios = require('axios');

jest.mock('../../src/utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  })),
}));

describe('HederaMirrorNode', () => {
  let mirrorNode: HederaMirrorNode;
  let logger: Logger;
  let axiosGet: jest.MockedFunction<typeof axios.get>;
  let axiosPost: jest.MockedFunction<typeof axios.post>;

  beforeEach(() => {
    jest.clearAllMocks();

    logger = new Logger({ module: 'MirrorNodeTest' });
    mirrorNode = new HederaMirrorNode('testnet', logger);

    axiosGet = axios.get as jest.MockedFunction<typeof axios.get>;
    axiosPost = axios.post as jest.MockedFunction<typeof axios.post>;
  });

  describe('constructor', () => {
    test('initializes with correct base URL for testnet', () => {
      const testnetMirror = new HederaMirrorNode('testnet', logger);
      expect(testnetMirror).toBeInstanceOf(HederaMirrorNode);
    });

    test('initializes with correct base URL for mainnet', () => {
      const mainnetMirror = new HederaMirrorNode('mainnet', logger);
      expect(mainnetMirror).toBeInstanceOf(HederaMirrorNode);
    });

    test('initializes with custom URL', () => {
      const customMirror = new HederaMirrorNode('testnet', logger, {
        customUrl: 'https://custom-mirror-node.com',
      });
      expect(customMirror).toBeInstanceOf(HederaMirrorNode);
    });

    test('initializes with API key', () => {
      const mirrorWithApiKey = new HederaMirrorNode('testnet', logger, {
        customUrl: 'https://custom-mirror-node.com',
        apiKey: 'test-api-key',
      });
      expect(mirrorWithApiKey).toBeInstanceOf(HederaMirrorNode);
    });
  });

  describe('requestAccount', () => {
    const mockAccountResponse = {
      account: '0.0.12345',
      balance: {
        balance: 1000000000,
        timestamp: '1234567890.000000000',
        tokens: [],
      },
      key: {
        _type: 'ED25519',
        key: '302a300506032b6570032100114e6abc371b82dab5c15ea149f02d34a012087b163516dd70f44acafabf777fd',
      },
      memo: 'Test account',
    };

    test('successfully retrieves account information', async () => {
      axiosGet.mockResolvedValue({ data: mockAccountResponse });

      const result = await mirrorNode.requestAccount('0.0.12345');

      expect(axiosGet).toHaveBeenCalledWith(
        'https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.12345',
        expect.any(Object),
      );
      expect(result).toEqual(mockAccountResponse);
    });

    test('handles account not found error', async () => {
      const notFoundError = {
        response: {
          status: 404,
          data: { _status: { messages: [{ message: 'Account not found' }] } },
        },
      };
      axiosGet.mockRejectedValue(notFoundError);

      await expect(mirrorNode.requestAccount('0.0.99999')).rejects.toThrow(
        'Account not found',
      );
    });

    test('handles network errors with retry', async () => {
      axiosGet
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({ data: mockAccountResponse });

      const result = await mirrorNode.requestAccount('0.0.12345');

      expect(axiosGet).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockAccountResponse);
    });
  });

  describe('getTokenInfo', () => {
    const mockTokenResponse = {
      token_id: '0.0.12345',
      name: 'Test Token',
      symbol: 'TEST',
      decimals: '6',
      total_supply: '1000000000',
      max_supply: '1000000000000',
      treasury_account_id: '0.0.67890',
      admin_key: {
        _type: 'ED25519',
        key: '302a300506032b6570032100114e6abc371b82dab5c15ea149f02d34a012087b163516dd70f44acafabf777fd',
      },
    };

    test('successfully retrieves token information', async () => {
      axiosGet.mockResolvedValue({ data: mockTokenResponse });

      const result = await mirrorNode.getTokenInfo('0.0.12345');

      expect(axiosGet).toHaveBeenCalledWith(
        'https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.12345',
        expect.any(Object),
      );
      expect(result).toEqual(mockTokenResponse);
    });

    test('handles token not found error', async () => {
      const notFoundError = {
        response: {
          status: 404,
          data: { _status: { messages: [{ message: 'Token not found' }] } },
        },
      };
      axiosGet.mockRejectedValue(notFoundError);

      await expect(mirrorNode.getTokenInfo('0.0.99999')).rejects.toThrow(
        'Token not found',
      );
    });
  });

  describe('getTopicMessages', () => {
    const mockMessagesResponse = {
      messages: [
        {
          consensus_timestamp: '1234567890.000000000',
          message: 'SGVsbG8gV29ybGQ=', // Base64 encoded "Hello World"
          running_hash: 'hash1',
          sequence_number: '1',
          topic_id: '0.0.12345',
        },
        {
          consensus_timestamp: '1234567891.000000000',
          message: 'VGVzdCBtZXNzYWdl', // Base64 encoded "Test message"
          running_hash: 'hash2',
          sequence_number: '2',
          topic_id: '0.0.12345',
        },
      ],
      links: {
        next: null,
      },
    };

    test('successfully retrieves topic messages', async () => {
      axiosGet.mockResolvedValue({ data: mockMessagesResponse });

      const result = await mirrorNode.getTopicMessages('0.0.12345');

      expect(axiosGet).toHaveBeenCalledWith(
        'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.12345/messages',
        expect.any(Object),
      );
      expect(result).toEqual(mockMessagesResponse);
    });

    test('applies query parameters correctly', async () => {
      axiosGet.mockResolvedValue({ data: mockMessagesResponse });

      await mirrorNode.getTopicMessages('0.0.12345', {
        limit: 10,
        order: 'desc',
        timestamp: 'gt:1234567890',
      });

      expect(axiosGet).toHaveBeenCalledWith(
        'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.12345/messages?limit=10&order=desc&timestamp=gt:1234567890',
        expect.any(Object),
      );
    });

    test('handles empty message list', async () => {
      const emptyResponse = {
        messages: [],
        links: { next: null },
      };
      axiosGet.mockResolvedValue({ data: emptyResponse });

      const result = await mirrorNode.getTopicMessages('0.0.12345');

      expect(result.messages).toHaveLength(0);
    });
  });

  describe('getTopicInfo', () => {
    const mockTopicResponse = {
      admin_key: {
        _type: 'ED25519',
        key: '302a300506032b6570032100114e6abc371b82dab5c15ea149f02d34a012087b163516dd70f44acafabf777fd',
      },
      submit_key: {
        _type: 'ED25519',
        key: '302a300506032b6570032100114e6abc371b82dab5c15ea149f02d34a012087b163516dd70f44acafabf777fd',
      },
      created_timestamp: '1234567890.000000000',
      deleted: false,
      topic_id: '0.0.12345',
      memo: 'Test topic',
      sequence_number: '0',
      auto_renew_period: 7776000,
      auto_renew_account: '0.0.67890',
    };

    test('successfully retrieves topic information', async () => {
      axiosGet.mockResolvedValue({ data: mockTopicResponse });

      const result = await mirrorNode.getTopicInfo('0.0.12345');

      expect(axiosGet).toHaveBeenCalledWith(
        'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.12345',
        expect.any(Object),
      );
      expect(result).toEqual(mockTopicResponse);
    });

    test('handles topic not found error', async () => {
      const notFoundError = {
        response: {
          status: 404,
          data: { _status: { messages: [{ message: 'Topic not found' }] } },
        },
      };
      axiosGet.mockRejectedValue(notFoundError);

      await expect(mirrorNode.getTopicInfo('0.0.99999')).rejects.toThrow(
        'Topic not found',
      );
    });
  });

  describe('getNetworkFees', () => {
    const mockFeesResponse = {
      fees: [
        {
          gas: 100,
          transaction_type: 'CRYPTOTRANSFER',
        },
        {
          gas: 200,
          transaction_type: 'TOKENMINT',
        },
      ],
      timestamp: '1234567890.000000000',
    };

    test('successfully retrieves network fees', async () => {
      axiosGet.mockResolvedValue({ data: mockFeesResponse });

      const result = await mirrorNode.getNetworkFees();

      expect(axiosGet).toHaveBeenCalledWith(
        'https://testnet.mirrornode.hedera.com/api/v1/network/fees',
        expect.any(Object),
      );
      expect(result).toEqual(mockFeesResponse);
    });

    test('handles network fees API error', async () => {
      axiosGet.mockRejectedValue(new Error('Network error'));

      await expect(mirrorNode.getNetworkFees()).rejects.toThrow(
        'Network error',
      );
    });
  });

  describe('error handling', () => {
    test('handles generic axios errors', async () => {
      axiosGet.mockRejectedValue(new Error('Connection timeout'));

      await expect(mirrorNode.requestAccount('0.0.12345')).rejects.toThrow(
        'Connection timeout',
      );
    });

    test('handles malformed response data', async () => {
      axiosGet.mockResolvedValue({ data: null });

      await expect(mirrorNode.requestAccount('0.0.12345')).rejects.toThrow();
    });

    test('handles rate limiting', async () => {
      const rateLimitError = {
        response: {
          status: 429,
          data: { _status: { messages: [{ message: 'Rate limit exceeded' }] } },
        },
      };
      axiosGet.mockRejectedValue(rateLimitError);

      await expect(mirrorNode.requestAccount('0.0.12345')).rejects.toThrow(
        'Rate limit exceeded',
      );
    });
  });

  describe('custom headers and authentication', () => {
    test('includes custom headers in requests', async () => {
      const mirrorWithHeaders = new HederaMirrorNode('testnet', logger, {
        customUrl: 'https://custom-mirror.com',
        headers: {
          'X-Custom-Header': 'custom-value',
          Authorization: 'Bearer token123',
        },
      });

      axiosGet.mockResolvedValue({ data: { account: '0.0.12345' } });

      await mirrorWithHeaders.requestAccount('0.0.12345');

      expect(axiosGet).toHaveBeenCalledWith(
        'https://custom-mirror.com/api/v1/accounts/0.0.12345',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'custom-value',
            Authorization: 'Bearer token123',
          }),
        }),
      );
    });

    test('handles URL-based API key replacement', async () => {
      const mirrorWithApiKey = new HederaMirrorNode('testnet', logger, {
        customUrl: 'https://api.hgraph.dev/v1/<API-KEY>',
        apiKey: 'test-api-key-123',
      });

      axiosGet.mockResolvedValue({ data: { account: '0.0.12345' } });

      await mirrorWithApiKey.requestAccount('0.0.12345');

      expect(axiosGet).toHaveBeenCalledWith(
        'https://api.hgraph.dev/v1/test-api-key-123/accounts/0.0.12345',
        expect.any(Object),
      );
    });
  });

  describe('retry logic', () => {
    test('retries on transient errors', async () => {
      axiosGet
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValueOnce({ data: { account: '0.0.12345' } });

      const result = await mirrorNode.requestAccount('0.0.12345');

      expect(axiosGet).toHaveBeenCalledTimes(3);
      expect(result.account).toBe('0.0.12345');
    });

    test('respects max retry limit', async () => {
      axiosGet.mockRejectedValue(new Error('ECONNRESET'));

      await expect(mirrorNode.requestAccount('0.0.12345')).rejects.toThrow(
        'ECONNRESET',
      );

      expect(axiosGet).toHaveBeenCalledTimes(6); // Initial + 5 retries
    });

    test('does not retry on 4xx errors except 429', async () => {
      const notFoundError = {
        response: { status: 404 },
      };
      axiosGet.mockRejectedValue(notFoundError);

      await expect(mirrorNode.requestAccount('0.0.12345')).rejects.toThrow();

      expect(axiosGet).toHaveBeenCalledTimes(1); // No retries for 404
    });
  });

  describe('HBAR price queries', () => {
    const mockHbarPrice = {
      current_rate: {
        cent_equivalent: 2500, // $25.00 in cents
        hbar_equivalent: 100, // 100 hbars
      },
    };

    test('successfully retrieves HBAR price', async () => {
      axiosGet.mockResolvedValue({ data: mockHbarPrice });

      const result = await mirrorNode.getHBARPrice(new Date());

      expect(axiosGet).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://testnet.mirrornode.hedera.com/api/v1/network/exchangerate',
        ),
        expect.any(Object),
      );
      expect(result).toBe(0.25); // 2500 cents / 100 hbars / 100 = 0.25 USD
    });

    test('handles HBAR price API error', async () => {
      axiosGet.mockRejectedValue(new Error('Exchange rate unavailable'));

      await expect(mirrorNode.getHBARPrice(new Date())).rejects.toThrow(
        'Exchange rate unavailable',
      );
    });
  });
});
