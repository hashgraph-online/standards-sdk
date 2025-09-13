import { HederaMirrorNode } from '../../src/services/mirror-node';

jest.mock('axios');
const axios = require('axios');

describe('HederaMirrorNode endpoints coverage', () => {
  let mirror: HederaMirrorNode;
  let axiosGet: jest.MockedFunction<typeof axios.get>;

  beforeEach(() => {
    jest.resetAllMocks();
    mirror = new HederaMirrorNode('testnet');
    mirror.configureRetry({ maxRetries: 1, initialDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 });
    axiosGet = axios.get as jest.MockedFunction<typeof axios.get>;
  });

  test('getAccountMemo returns memo and null when missing', async () => {
    axiosGet.mockResolvedValueOnce({ data: { memo: 'hi' } });
    const memo = await mirror.getAccountMemo('0.0.10');
    expect(memo).toBe('hi');

    axiosGet.mockResolvedValueOnce({ data: {} });
    const none = await mirror.getAccountMemo('0.0.11');
    expect(none).toBeNull();
  });

  test('getTransaction returns first transaction or null', async () => {
    axiosGet.mockResolvedValueOnce({ data: { transactions: [{ id: 'x' }] } });
    const tx = await mirror.getTransaction('abc');
    expect(tx).toEqual({ id: 'x' });

    axiosGet.mockResolvedValueOnce({ data: { transactions: [] } });
    const none = await mirror.getTransaction('def');
    expect(none).toBeNull();
  });

  test('getTransactionByTimestamp returns list or empty', async () => {
    axiosGet.mockResolvedValueOnce({ data: { transactions: [{ id: 1 }] } });
    const list = await mirror.getTransactionByTimestamp('1.000');
    expect(list).toHaveLength(1);

    axiosGet.mockRejectedValueOnce(new Error('fail'));
    const empty = await mirror.getTransactionByTimestamp('2.000');
    expect(empty).toEqual([]);
  });

  test('getAccountBalance converts tinybars to HBAR', async () => {
    axiosGet.mockResolvedValueOnce({ data: { balance: { balance: 123_000_000 } } });
    const bal = await mirror.getAccountBalance('0.0.12');
    expect(bal).toBeCloseTo(1.23);

    axiosGet.mockRejectedValueOnce(new Error('err'));
    const none = await mirror.getAccountBalance('0.0.12');
    expect(none).toBeNull();
  });

  test('airdrops endpoints (outstanding/pending) with params', async () => {
    axiosGet.mockResolvedValueOnce({ data: { airdrops: [{ id: 1 }] } });
    const out = await mirror.getOutstandingTokenAirdrops('0.0.1', { limit: 2, order: 'desc', receiverId: '0.0.2', serialNumber: '3', tokenId: '0.0.4' });
    expect(out?.length).toBe(1);
    const url1 = (axiosGet.mock.calls.at(-1) as any)[0] as string;
    expect(url1).toContain('receiver.id=0.0.2');
    expect(url1).toContain('serialnumber=3');
    expect(url1).toContain('token.id=0.0.4');

    axiosGet.mockResolvedValueOnce({ data: { airdrops: [] } });
    const pending = await mirror.getPendingTokenAirdrops('0.0.1', { senderId: '0.0.9' });
    expect(Array.isArray(pending)).toBe(true);
    const url2 = (axiosGet.mock.calls.at(-1) as any)[0] as string;
    expect(url2).toContain('sender.id=0.0.9');
  });

  test('blocks endpoints', async () => {
    axiosGet.mockResolvedValueOnce({ data: { blocks: [{ number: 1 }] } });
    const blocks = await mirror.getBlocks({ limit: 1, order: 'asc', timestamp: 'gte:1', blockNumber: '5' });
    expect(blocks?.length).toBe(1);

    axiosGet.mockResolvedValueOnce({ data: { number: 1 } });
    const block = await mirror.getBlock('1');
    expect(block).toEqual({ number: 1 });
  });

  test('contracts and results endpoints', async () => {
    axiosGet.mockResolvedValueOnce({ data: { contracts: [{ id: 'c' }] } });
    const cs = await mirror.getContracts({ contractId: '0.0.5', limit: 1, order: 'desc' });
    expect(cs?.[0].id).toBe('c');

    axiosGet.mockResolvedValueOnce({ data: { id: 'c1' } });
    const c = await mirror.getContract('0.0.5', '1.0');
    expect(c?.id).toBe('c1');

    axiosGet.mockResolvedValueOnce({ data: { results: [{ r: 1 }] } });
    const rs = await mirror.getContractResults({ from: '0x1', internal: true, limit: 1, order: 'asc', blockNumber: '2', timestamp: 'gte:1', transactionIndex: 0 });
    expect(rs?.length).toBe(1);

    axiosGet.mockResolvedValueOnce({ data: { r: 2 } });
    const r = await mirror.getContractResult('0xhash', 1);
    expect(r?.r).toBe(2);

    axiosGet.mockResolvedValueOnce({ data: { results: [{ v: 1 }] } });
    const byC = await mirror.getContractResultsByContract('0.0.5', { from: '0x1', internal: false, limit: 1, order: 'desc', blockHash: '0xabc', blockNumber: '3', timestamp: 'lte:2', transactionIndex: 1 });
    expect(byC?.length).toBe(1);
  });

  test('contract state/actions/logs endpoints', async () => {
    axiosGet.mockResolvedValueOnce({ data: { state: [{ key: '0x00', value: '0x01' }] } });
    const st = await mirror.getContractState('0.0.5', { limit: 1, order: 'asc', slot: '0x00', timestamp: '1.0' });
    expect(st?.length).toBe(1);

    axiosGet.mockResolvedValueOnce({ data: { actions: [{ t: 'CALL' }] } });
    const acts = await mirror.getContractActions('0xhash', { index: '0', limit: 1, order: 'desc' });
    expect(acts?.length).toBe(1);

    axiosGet.mockResolvedValueOnce({ data: { logs: [{ data: '0x' }] } });
    const logs = await mirror.getContractLogs({ index: '0', limit: 1, order: 'asc', timestamp: 'gte:1', topic0: '0x0', topic1: '0x1', topic2: '0x2', topic3: '0x3', transactionHash: '0xhash' });
    expect(logs?.length).toBe(1);

    axiosGet.mockResolvedValueOnce({ data: { logs: [{ data: '0x' }] } });
    const logsByC = await mirror.getContractLogsByContract('0.0.5', { index: '0', limit: 1, order: 'desc', timestamp: 'gte:1', topic0: '0x0', topic1: '0x1', topic2: '0x2', topic3: '0x3' });
    expect(logsByC?.length).toBe(1);
  });

  test('NFT endpoints and ownership', async () => {
    axiosGet.mockResolvedValueOnce({ data: { nfts: [{ token_id: '0.0.9', serial_number: 1, metadata: Buffer.from('ipfs://x').toString('base64') }], links: { next: null } } });
    const nfts = await mirror.getAccountNfts('0.0.1', '0.0.9');
    expect(nfts?.[0].token_uri).toContain('ipfs://');

    axiosGet.mockResolvedValueOnce({ data: { token_id: '0.0.9', serial_number: 1 } });
    const info = await mirror.getNftInfo('0.0.9', 1);
    expect(info?.token_id).toBe('0.0.9');

    axiosGet.mockResolvedValueOnce({ data: { nfts: [{ token_id: '0.0.9', serial_number: 1 }], links: { next: null } } });
    const byToken = await mirror.getNftsByToken('0.0.9', { accountId: '0.0.1', limit: 1, order: 'asc', serialNumber: '1' });
    expect(byToken?.length).toBe(1);

    axiosGet.mockResolvedValueOnce({ data: { nfts: [{ token_id: '0.0.9', serial_number: 1 }], links: { next: null } } });
    const owned = await mirror.validateNFTOwnership('0.0.1', '0.0.9', 1);
    expect(owned?.serial_number).toBe(1);
  });

  test('network info/supply/stake', async () => {
    axiosGet.mockResolvedValueOnce({ data: { nodes: [] } });
    const info = await mirror.getNetworkInfo();
    expect(info).toEqual({ nodes: [] });

    axiosGet.mockResolvedValueOnce({ data: { something: 1 } });
    const fees = await mirror.getNetworkFees('1.0');
    expect(fees).toEqual({ something: 1 });

    axiosGet.mockResolvedValueOnce({ data: { supply: 1 } });
    const supply = await mirror.getNetworkSupply('2.0');
    expect(supply).toEqual({ supply: 1 });

    axiosGet.mockResolvedValueOnce({ data: { stake: 1 } });
    const stake = await mirror.getNetworkStake('3.0');
    expect(stake).toEqual({ stake: 1 });
  });

  test('opcode traces', async () => {
    axiosGet.mockResolvedValueOnce({ data: { opcodes: [] } });
    const ops = await mirror.getOpcodeTraces('0xhash', { stack: true, memory: false, storage: true });
    expect(ops).toEqual({ opcodes: [] });
  });

  test('readSmartContractQuery uses fetch and injects API key', async () => {
    const mirrorWithApiKey = new HederaMirrorNode('testnet', undefined, { apiKey: 'k' });
    mirrorWithApiKey.configureRetry({ maxRetries: 1, initialDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 });

    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ result: '0x' }) });
    global.fetch = mockFetch;

    const out = await mirrorWithApiKey.readSmartContractQuery('0.0.5', '0x06fdde03', '0.0.100', { gas: 1, gasPrice: 2, value: 0 });
    expect(out).toEqual({ result: '0x' });

    const [fetchUrl, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(fetchUrl).toContain('/api/v1/contracts/call');
    expect((opts.headers as Record<string, string>)['X-API-Key']).toBe('k');
    expect(opts.method).toBe('POST');
    expect(typeof opts.body).toBe('string');
  });
});

