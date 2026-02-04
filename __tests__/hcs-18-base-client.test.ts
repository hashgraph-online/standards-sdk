import { HCS18Client } from '../src/hcs-18';

jest.mock('@hashgraph/sdk', () => {
  class AccountId {
    constructor(value: string) {
      this.value = String(value);
    }
    value: string;
    static fromString(value: string) {
      return new AccountId(value);
    }
    toString() {
      return this.value;
    }
  }

  class PublicKey {
    constructor(value = 'mock-public-key') {
      this.value = String(value);
    }
    value: string;
    toString() {
      return this.value;
    }
  }

  class PrivateKey {
    constructor(value = 'mock-private-key') {
      this.value = String(value);
      this.publicKey = new PublicKey('mock-public-key');
    }
    value: string;
    publicKey: PublicKey;
    static fromStringED25519(value: string) {
      return new PrivateKey(value);
    }
    static fromStringECDSA(value: string) {
      return new PrivateKey(value);
    }
  }

  class Client {
    static forName = jest.fn(() => new Client());
    static forMainnet = jest.fn(() => new Client());
    static forTestnet = jest.fn(() => new Client());
    setOperator = jest.fn().mockReturnThis();
  }

  return { AccountId, Client, PrivateKey, PublicKey };
});

describe('HCS18BaseClient helpers (via HCS18Client)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (require('@hashgraph/sdk').Client.forName as unknown as jest.Mock) = jest
      .fn()
      .mockReturnValue(new (require('@hashgraph/sdk').Client)());
  });

  it('getDiscoveryMessages returns [] when mirror returns null', async () => {
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: '302e...',
    });
    (c as any).mirrorNode = {
      getTopicMessages: jest.fn().mockResolvedValue(null),
    };
    const msgs = await c.getDiscoveryMessages('0.0.1');
    expect(msgs).toEqual([]);
  });

  it('getDiscoveryMessages filters to valid hcs-18 ops', async () => {
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: '302e...',
    });
    const mixed = [
      { p: 'hcs-18', op: 'announce', sequence_number: 1 },
      { p: 'hcs-18', op: 'respond', sequence_number: 2 },
      { p: 'hcs-10', op: 'message', sequence_number: 3 },
      { p: 'hcs-18', op: 'foo', sequence_number: 4 },
    ];
    (c as any).mirrorNode = {
      getTopicMessages: jest.fn().mockResolvedValue(mixed),
    };
    const msgs = await c.getDiscoveryMessages('0.0.1');
    expect(msgs.map(m => m.sequence_number)).toEqual([1, 2]);
  });

  it('isProposalReady evaluates acceptances threshold', () => {
    const c = new HCS18Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey: '302e...',
    });
    const proposal = {
      data: { members: [{}, {}, {}] },
      responses: new Map([
        ['0.0.2', { decision: 'accept' }],
        ['0.0.3', { decision: 'reject' }],
      ]),
    } as any;
    expect(c.isProposalReady(proposal)).toBe(false);
    proposal.responses.set('0.0.4', { decision: 'accept' } as any);
    expect(c.isProposalReady(proposal)).toBe(true);
  });
});
