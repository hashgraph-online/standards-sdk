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
  let logger: any;
  let axiosGet: jest.MockedFunction<typeof axios.get>;
  let axiosPost: jest.MockedFunction<typeof axios.post>;

  beforeEach(() => {
    jest.resetAllMocks();

    logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      getLevel: jest.fn(),
      setLogLevel: jest.fn(),
      setModule: jest.fn(),
      setSilent: jest.fn(),
    };
    mirrorNode = new HederaMirrorNode('testnet', logger);
    mirrorNode.configureRetry({ maxRetries: 1, initialDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 });

    mirrorNode.configureRetry({ maxRetries: 1, initialDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 });

    // Make retries fast to avoid Jest timeouts in failure scenarios
    mirrorNode.configureRetry({ maxRetries: 1, initialDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 });

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
      const notFoundError = Object.assign(new Error('Account not found'), {
        response: {
          status: 404,
          data: { _status: { messages: [{ message: 'Account not found' }] } },
        },
      });
      axiosGet.mockRejectedValue(notFoundError);

      await expect(mirrorNode.requestAccount('0.0.99999')).rejects.toThrow(
        /Account not found|Failed to fetch account/,
      );
    });

    test('handles network errors with retry', async () => {
      mirrorNode.configureRetry({ maxRetries: 2, initialDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 });
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
      expect(result?.token_id).toBe('0.0.12345');
    });

    test('handles token not found error', async () => {
      const notFoundError = Object.assign(new Error('Token not found'), {
        response: {
          status: 404,
          data: { _status: { messages: [{ message: 'Token not found' }] } },
        },
      });
      axiosGet.mockRejectedValue(notFoundError);

      const result = await mirrorNode.getTokenInfo('0.0.99999');
      expect(result).toBeNull();
    });
  });

  describe('getTopicMessages', () => {
    const mockMessagesResponse = {
      messages: [
        {
          consensus_timestamp: '1234567890.000000000',
          message: Buffer.from(JSON.stringify({ p: 'hcs-20', op: 'register' })).toString('base64'),
          running_hash: 'hash1',
          sequence_number: '1',
          topic_id: '0.0.12345',
        },
        {
          consensus_timestamp: '1234567891.000000000',
          message: Buffer.from(JSON.stringify({ any: 'json' })).toString('base64'),
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
      mirrorNode.configureRetry({ maxRetries: 1, initialDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 });
      axiosGet.mockResolvedValue({ data: mockMessagesResponse });

      const result = await mirrorNode.getTopicMessages('0.0.12345');

      expect(axiosGet).toHaveBeenCalledWith(
        'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.12345/messages',
        expect.any(Object),
      );
      expect(result).toEqual([]);
    });

    test('applies query parameters correctly', async () => {
      mirrorNode.configureRetry({ maxRetries: 2, initialDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 });
      axiosGet.mockResolvedValue({ data: mockMessagesResponse });

      await mirrorNode.getTopicMessages('0.0.12345', {
        limit: 10,
        order: 'desc',
      });

      expect(axiosGet).toHaveBeenCalledWith(
        'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.12345/messages?limit=10&order=desc',
        expect.any(Object),
      );
    });

    test('handles empty message list', async () => {
      mirrorNode.configureRetry({ maxRetries: 2, initialDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 });
      const emptyResponse = {
        messages: [],
        links: { next: null },
      };
      axiosGet.mockResolvedValue({ data: emptyResponse });

      const result = await mirrorNode.getTopicMessages('0.0.12345');

      expect(result).toHaveLength(0);
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
      const notFoundError = Object.assign(new Error('Topic not found'), {
        response: {
          status: 404,
          data: { _status: { messages: [{ message: 'Topic not found' }] } },
        },
      });
      axiosGet.mockRejectedValue(notFoundError);

      await expect(mirrorNode.getTopicInfo('0.0.99999')).rejects.toThrow(
        /Error retrieving topic information for 0\.0\.99999/,
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
      const result = await mirrorNode.getNetworkFees();
      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    test('handles generic axios errors', async () => {
      axiosGet.mockRejectedValue(new Error('Connection timeout'));

      await expect(mirrorNode.requestAccount('0.0.12345')).rejects.toThrow();
    });

    test('handles malformed response data', async () => {
      axiosGet.mockResolvedValue({ data: null });

      await expect(mirrorNode.requestAccount('0.0.12345')).rejects.toThrow();
    });

    test('handles rate limiting', async () => {
      const rateLimitError = Object.assign(new Error('Rate limit exceeded'), {
        response: {
          status: 429,
          data: { _status: { messages: [{ message: 'Rate limit exceeded' }] } },
        },
      });
      axiosGet.mockRejectedValue(rateLimitError);

      await expect(mirrorNode.requestAccount('0.0.12345')).rejects.toThrow(
        /Rate limit exceeded|Failed to fetch account/,
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

      mirrorWithApiKey.configureRetry({ maxRetries: 1, initialDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 });

      axiosGet.mockResolvedValue({ data: { account: '0.0.12345' } });

      await mirrorWithApiKey.requestAccount('0.0.12345');

      expect(axiosGet).toHaveBeenCalledWith(
        'https://api.hgraph.dev/v1/test-api-key-123/api/v1/accounts/0.0.12345',
        expect.any(Object),
      );
    });
  });

  describe('retry logic', () => {
    test('retries on transient errors', async () => {
      mirrorNode.configureRetry({ maxRetries: 3, initialDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 });
      axiosGet
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValueOnce({ data: { account: '0.0.12345' } });

      const result = await mirrorNode.requestAccount('0.0.12345');

      expect(axiosGet).toHaveBeenCalledTimes(3);
      expect(result.account).toBe('0.0.12345');
    });

    test('respects max retry limit', async () => {
      mirrorNode.configureRetry({ maxRetries: 3, initialDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 });
      axiosGet.mockRejectedValue(new Error('ECONNRESET'));
      await expect(mirrorNode.requestAccount('0.0.12345')).rejects.toThrow();
      expect(axiosGet).toHaveBeenCalledTimes(3); // Max attempts
    });

    test('does not retry on 4xx errors except 429', async () => {
      const notFoundError = Object.assign(new Error('Not found'), { response: { status: 409 } });
      axiosGet.mockRejectedValue(notFoundError);

      await expect(mirrorNode.requestAccount('0.0.12345')).rejects.toThrow();

      expect(axiosGet).toHaveBeenCalledTimes(1);
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
      const result = await mirrorNode.getHBARPrice(new Date());
      expect(result).toBeNull();
    });
  });
});
