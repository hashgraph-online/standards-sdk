import { HCS7BrowserClient } from '../../src/hcs-7/browser';
import {
  HCS7ConfigType,
  HCS7RegisterConfigOptions,
} from '../../src/hcs-7/types';

const mockReceipt = {
  topicSequenceNumber: { toNumber: () => 7 },
} as any;

const createMockHwc = () => ({
  getAccountInfo: jest.fn().mockReturnValue({ accountId: '0.0.1234' }),
  createTopic: jest.fn().mockResolvedValue('0.0.5000'),
  submitMessageToTopic: jest.fn().mockResolvedValue(mockReceipt),
});

describe('HCS7BrowserClient', () => {
  it('creates registry topics via wallet connector', async () => {
    const hwc = createMockHwc();
    const client = new HCS7BrowserClient({
      hwc: hwc as any,
      network: 'testnet',
    });
    const res = await client.createRegistry({ ttl: 7200 });
    expect(res.success).toBe(true);
    expect(hwc.createTopic).toHaveBeenCalledWith('hcs-7:indexed:7200');
  });

  it('rejects invalid TTL values', async () => {
    const hwc = createMockHwc();
    const client = new HCS7BrowserClient({
      hwc: hwc as any,
      network: 'testnet',
    });
    const res = await client.createRegistry({ ttl: 10 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('TTL');
  });

  it('submits config registrations through wallet', async () => {
    const hwc = createMockHwc();
    const client = new HCS7BrowserClient({
      hwc: hwc as any,
      network: 'testnet',
    });
    const options: HCS7RegisterConfigOptions = {
      registryTopicId: '0.0.5000',
      memo: 'minted',
      config: {
        type: HCS7ConfigType.EVM,
        contractAddress: '0x0000000000000000000000000000000000000001',
        abi: {
          name: 'minted',
          inputs: [],
          outputs: [],
          stateMutability: 'view',
          type: 'function',
        },
      },
    };
    const res = await client.registerConfig(options);
    expect(res.success).toBe(true);
    const payload = JSON.parse(hwc.submitMessageToTopic.mock.calls[0][1]);
    expect(payload.p).toBe('hcs-7');
    expect(payload.op).toBe('register-config');
  });

  it('submits metadata registrations', async () => {
    const hwc = createMockHwc();
    const client = new HCS7BrowserClient({
      hwc: hwc as any,
      network: 'testnet',
    });
    const res = await client.registerMetadata({
      registryTopicId: '0.0.5000',
      metadataTopicId: '0.0.7000',
      memo: 'blue',
      weight: 2,
      tags: ['odd'],
    });
    expect(res.success).toBe(true);
    const payload = JSON.parse(hwc.submitMessageToTopic.mock.calls[0][1]);
    expect(payload.op).toBe('register');
    expect(payload.t_id).toBe('0.0.7000');
  });

  it('surfaces wallet connection errors', async () => {
    const hwc = createMockHwc();
    hwc.getAccountInfo.mockReturnValue(undefined);
    const client = new HCS7BrowserClient({
      hwc: hwc as any,
      network: 'testnet',
    });
    const res = await client.registerMetadata({
      registryTopicId: '0.0.1',
      metadataTopicId: '0.0.2',
      weight: 1,
      tags: ['odd'],
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('No active wallet connection');
  });
});
