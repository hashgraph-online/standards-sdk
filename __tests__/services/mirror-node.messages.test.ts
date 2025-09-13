import { HederaMirrorNode } from '../../src/services/mirror-node';

jest.mock('axios');
const axios = require('axios');

describe('HederaMirrorNode.getTopicMessages pagination and filters', () => {
  let mirror: HederaMirrorNode;
  let axiosGet: jest.MockedFunction<typeof axios.get>;

  beforeEach(() => {
    jest.resetAllMocks();
    mirror = new HederaMirrorNode('testnet');
    mirror.configureRetry({ maxRetries: 1, initialDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 });
    axiosGet = axios.get as jest.MockedFunction<typeof axios.get>;
  });

  test('follows links.next across multiple pages', async () => {
    const page1 = {
      messages: [
        {
          consensus_timestamp: '1.000000000',
          message: Buffer.from(JSON.stringify({ p: 'hcs-20', op: 'register' })).toString('base64'),
          sequence_number: '1',
        },
      ],
      links: { next: '/api/v1/topics/0.0.1/messages?sequencenumber=gt:1' },
    };
    const page2 = {
      messages: [
        {
          consensus_timestamp: '2.000000000',
          message: Buffer.from(JSON.stringify({ any: 'json' })).toString('base64'),
          sequence_number: '2',
        },
      ],
      links: { next: null },
    };

    axiosGet
      .mockResolvedValueOnce({ data: page1 })
      .mockResolvedValueOnce({ data: page2 });

    const out = await mirror.getTopicMessages('0.0.1');
    expect(out.length).toBe(2);
    expect(out[0]).toMatchObject({ p: 'hcs-20', op: 'register', sequence_number: '1' });
    expect(out[1]).toMatchObject({ any: 'json', sequence_number: '2' });
    expect(axiosGet).toHaveBeenNthCalledWith(
      1,
      'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.1/messages',
      expect.any(Object),
    );
    expect(axiosGet).toHaveBeenNthCalledWith(
      2,
      'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.1/messages?sequencenumber=gt:1',
      expect.any(Object),
    );
  });

  test('applies sequencenumber operator and limit/order filters', async () => {
    const response = { messages: [], links: { next: null } };
    axiosGet.mockResolvedValue({ data: response });

    await mirror.getTopicMessages('0.0.2', { sequenceNumber: 'gte:100', limit: 5, order: 'desc' });

    const calledUrl1 = (axiosGet.mock.calls[0] as any)[0] as string;
    expect(calledUrl1).toContain('https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.2/messages');
    expect(calledUrl1).toContain('sequencenumber=gte%3A100');
    expect(calledUrl1).toContain('limit=5');
    expect(calledUrl1).toContain('order=desc');
  });

  test('adds gt: prefix if raw number provided for sequenceNumber', async () => {
    const response = { messages: [], links: { next: null } };
    axiosGet.mockResolvedValue({ data: response });

    await mirror.getTopicMessages('0.0.3', { sequenceNumber: 10 });
    const calledUrl2 = (axiosGet.mock.calls[0] as any)[0] as string;
    expect(calledUrl2).toContain('https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.3/messages');
    expect(calledUrl2).toContain('sequencenumber=gt%3A10');
  });
});
