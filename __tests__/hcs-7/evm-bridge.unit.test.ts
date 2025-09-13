import { EVMBridge } from '../../src/hcs-7/evm-bridge';

jest.mock('ethers', () => ({
  ethers: {
    Interface: jest.fn().mockImplementation(([_abi]: any[]) => ({
      encodeFunctionData: (_name: string) => '0xdeadbeef',
      decodeFunctionResult: (_name: string, _data: string) => ['42', true, '0xABCDEF'],
    })),
  },
}));

jest.mock('@hashgraph/sdk', () => ({
  ContractId: { fromSolidityAddress: (a: string) => ({ toSolidityAddress: () => a }) },
  AccountId: { fromString: (s: string) => ({ toSolidityAddress: () => s }) },
}));

describe('EVMBridge (unit)', () => {
  const originalFetch = global.fetch as any;
  const okResponse = { ok: true, json: async () => ({ result: '0x' + '0'.repeat(64) }) } as Response;

  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn().mockResolvedValue(okResponse) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('executeCommands decodes and caches results, updates state', async () => {
    const bridge = new EVMBridge('testnet', 'mirrornode/api/v1/contracts/call');
    const cfg = {
      c: {
        contractAddress: '0x0000000000000000000000000000000000000001',
        abi: { name: 'getCount', stateMutability: 'view', outputs: [{ name: 'count', type: 'uint256' }] },
      },
    } as any;

    const first = await bridge.executeCommands([cfg]);
    expect(first.results.getCount.values[0]).toBe('42');
    expect(first.stateData.getCount).toBeDefined();
    const before = (global.fetch as jest.Mock).mock.calls.length;
    const second = await bridge.executeCommands([cfg], first.stateData);
    const after = (global.fetch as jest.Mock).mock.calls.length;
    expect(second.results.getCount.values[0]).toBe('42');
    expect(after).toBe(before); // no new fetch due to cache
  });

  test('executeCommands falls back gracefully on HTTP error', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });
    const bridge = new EVMBridge('testnet', 'mirrornode/api/v1/contracts/call');
    const cfg = {
      c: {
        contractAddress: '0x0000000000000000000000000000000000000002',
        abi: { name: 'name', stateMutability: 'view', outputs: [{ name: 'name', type: 'string' }] },
      },
    } as any;
    const { results } = await bridge.executeCommands([cfg]);
    expect(results.name).toBe('0');
  });
});
