import {
  DiscoveryOperation,
  isDiscoveryMessage,
  isAnnounceMessage,
  isProposeMessage,
  isRespondMessage,
  isCompleteMessage,
  isWithdrawMessage,
} from '../src/hcs-18';

describe('HCS-18 type guards', () => {
  it('validates announce message', () => {
    const msg = {
      p: 'hcs-18',
      op: DiscoveryOperation.ANNOUNCE,
      data: {
        account: '0.0.1001',
        petal: { name: 'P', priority: 500 },
        capabilities: { protocols: ['hcs-16', 'hcs-18'] },
        valid_for: 100,
      },
    };
    expect(isDiscoveryMessage(msg)).toBe(true);
    expect(isAnnounceMessage(msg)).toBe(true);
  });

  it('rejects invalid announce message', () => {
    const msg = {
      p: 'hcs-18',
      op: DiscoveryOperation.ANNOUNCE,
      data: {
        account: 123, // invalid type
        petal: { name: 'P', priority: 500 },
        capabilities: { protocols: ['hcs-16', 'hcs-18'] },
      },
    } as unknown;
    expect(isAnnounceMessage(msg)).toBe(false);
  });

  it('validates propose message', () => {
    const msg = {
      p: 'hcs-18',
      op: DiscoveryOperation.PROPOSE,
      data: {
        proposer: '0.0.1001',
        members: [
          { account: '0.0.2002', priority: 600, announce_seq: 1 },
          { account: '0.0.3003', priority: 500 },
        ],
        config: { name: 'X', threshold: 2 },
      },
    };
    expect(isDiscoveryMessage(msg)).toBe(true);
    expect(isProposeMessage(msg)).toBe(true);
  });

  it('rejects invalid propose message', () => {
    const msg = {
      p: 'hcs-18',
      op: DiscoveryOperation.PROPOSE,
      data: {
        proposer: '0.0.1001',
        members: [{ account: '0.0.2002', priority: 'high' }], // invalid priority type
        config: { name: 'X', threshold: 2 },
      },
    } as unknown;
    expect(isProposeMessage(msg)).toBe(false);
  });

  it('validates respond message', () => {
    const msg = {
      p: 'hcs-18',
      op: DiscoveryOperation.RESPOND,
      data: { responder: '0.0.1001', proposal_seq: 1, decision: 'accept' },
    };
    expect(isRespondMessage(msg)).toBe(true);
  });

  it('rejects invalid respond message', () => {
    const msg = {
      p: 'hcs-18',
      op: DiscoveryOperation.RESPOND,
      data: { responder: '0.0.1001', proposal_seq: '1', decision: 'accept' },
    } as unknown;
    expect(isRespondMessage(msg)).toBe(false);
  });

  it('validates complete message', () => {
    const msg = {
      p: 'hcs-18',
      op: DiscoveryOperation.COMPLETE,
      data: {
        proposer: '0.0.1001',
        proposal_seq: 1,
        flora_account: '0.0.9009',
        topics: { communication: '0.0.1', transaction: '0.0.2', state: '0.0.3' },
      },
    };
    expect(isCompleteMessage(msg)).toBe(true);
  });

  it('rejects invalid complete message', () => {
    const msg = {
      p: 'hcs-18',
      op: DiscoveryOperation.COMPLETE,
      data: {
        proposer: '0.0.1001',
        proposal_seq: 1,
        flora_account: '0.0.9009',
        topics: { communication: '0.0.1', transaction: 2, state: '0.0.3' },
      },
    } as unknown;
    expect(isCompleteMessage(msg)).toBe(false);
  });

  it('validates withdraw message', () => {
    const msg = {
      p: 'hcs-18',
      op: DiscoveryOperation.WITHDRAW,
      data: { account: '0.0.1001', announce_seq: 5, reason: 'maintenance' },
    };
    expect(isWithdrawMessage(msg)).toBe(true);
  });

  it('rejects invalid protocol', () => {
    const msg = { p: 'hcs-10', op: 'announce', data: {} } as unknown;
    expect(isDiscoveryMessage(msg)).toBe(false);
  });

  it('rejects non-object and invalid op', () => {
    expect(isDiscoveryMessage(null as unknown)).toBe(false);
    const msg = { p: 'hcs-18', op: 'unknown', data: {} } as unknown;
    expect(isDiscoveryMessage(msg)).toBe(false);
  });

  it('rejects announce with invalid protocols', () => {
    const msg = {
      p: 'hcs-18',
      op: DiscoveryOperation.ANNOUNCE,
      data: {
        account: '0.0.1001',
        petal: { name: 'P', priority: 1 },
        capabilities: { protocols: [1, 2] },
      },
    } as unknown;
    expect(isAnnounceMessage(msg)).toBe(false);
  });

  it('rejects withdraw with non-number seq and non-string reason', () => {
    const msg1 = { p: 'hcs-18', op: DiscoveryOperation.WITHDRAW, data: { account: '0.0.1', announce_seq: 'x' } } as unknown;
    expect(isWithdrawMessage(msg1)).toBe(false);
    const msg2 = { p: 'hcs-18', op: DiscoveryOperation.WITHDRAW, data: { account: '0.0.1', announce_seq: 1, reason: 2 } } as unknown;
    expect(isWithdrawMessage(msg2)).toBe(false);
  });

  it('rejects propose with invalid config', () => {
    const msg = {
      p: 'hcs-18',
      op: DiscoveryOperation.PROPOSE,
      data: { proposer: '0.0.1', members: [], config: { name: 1, threshold: 'x' } },
    } as unknown;
    expect(isProposeMessage(msg)).toBe(false);
  });

  it('rejects respond with invalid decision', () => {
    const msg = { p: 'hcs-18', op: DiscoveryOperation.RESPOND, data: { responder: '0.0.1', proposal_seq: 1, decision: 'maybe' } } as unknown;
    expect(isRespondMessage(msg)).toBe(false);
  });

  it('rejects complete with invalid topics', () => {
    const msg = {
      p: 'hcs-18',
      op: DiscoveryOperation.COMPLETE,
      data: {
        proposer: '0.0.1',
        proposal_seq: 1,
        flora_account: '0.0.2',
        topics: { communication: '0.0.1', transaction: '0.0.2', state: 3 },
      },
    } as unknown;
    expect(isCompleteMessage(msg)).toBe(false);
  });

  it('covers error class instantiation', () => {
    const { DiscoveryError } = require('../src/hcs-18');
    const err = new DiscoveryError('x', 'INVALID_STATE');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('DiscoveryError');
    expect(err.code).toBe('INVALID_STATE');
  });

  it('extra negative paths for guards and error type', () => {
    expect(isDiscoveryMessage({ p: 'hcs-18', op: 1, data: {} } as any)).toBe(
      false,
    );

    expect(
      isAnnounceMessage({ p: 'hcs-10', op: 'announce', data: {} } as any),
    ).toBe(false);
    expect(
      isAnnounceMessage({ p: 'hcs-18', op: 'respond', data: {} } as any),
    ).toBe(false);
    expect(
      isAnnounceMessage({ p: 'hcs-18', op: 'announce', data: 'x' } as any),
    ).toBe(false);
    expect(
      isAnnounceMessage({ p: 'hcs-18', op: 'announce', data: { account: '0.0.1', petal: { name: 'P', priority: 1 }, capabilities: { protocols: [] }, valid_for: 'x' } } as any),
    ).toBe(false);

    expect(
      isProposeMessage({ p: 'hcs-10', op: 'propose', data: {} } as any),
    ).toBe(false);
    expect(
      isProposeMessage({ p: 'hcs-18', op: 'announce', data: {} } as any),
    ).toBe(false);
    expect(
      isProposeMessage({ p: 'hcs-18', op: 'propose', data: 'x' } as any),
    ).toBe(false);

    expect(
      isRespondMessage({ p: 'hcs-10', op: 'respond', data: {} } as any),
    ).toBe(false);
    expect(
      isRespondMessage({ p: 'hcs-18', op: 'announce', data: {} } as any),
    ).toBe(false);
    expect(
      isRespondMessage({ p: 'hcs-18', op: 'respond', data: 'x' } as any),
    ).toBe(false);

    expect(
      isCompleteMessage({ p: 'hcs-10', op: 'complete', data: {} } as any),
    ).toBe(false);
    expect(
      isCompleteMessage({ p: 'hcs-18', op: 'respond', data: {} } as any),
    ).toBe(false);
    expect(
      isCompleteMessage({ p: 'hcs-18', op: 'complete', data: 'x' } as any),
    ).toBe(false);
    expect(
      isCompleteMessage({ p: 'hcs-18', op: 'complete', data: { proposer: '0.0.1', proposal_seq: 1, flora_account: '0.0.2', topics: 'x' } } as any),
    ).toBe(false);

    expect(isWithdrawMessage({ p: 'hcs-10', op: 'withdraw', data: {} } as any)).toBe(
      false,
    );
    expect(
      isWithdrawMessage({ p: 'hcs-18', op: 'announce', data: {} } as any),
    ).toBe(false);
    expect(
      isWithdrawMessage({ p: 'hcs-18', op: 'withdraw', data: 'x' } as any),
    ).toBe(false);
    expect(
      isWithdrawMessage({ p: 'hcs-18', op: 'withdraw', data: { account: 1, announce_seq: 1 } } as any),
    ).toBe(false);
  });

  it('exhaustive negative branches per field', () => {
    expect(
      isAnnounceMessage({ p: 'hcs-18', op: 'announce', data: { account: '0.0.1', petal: 'x', capabilities: { protocols: ['hcs-18'] } } } as any),
    ).toBe(false);
    expect(
      isAnnounceMessage({ p: 'hcs-18', op: 'announce', data: { account: '0.0.1', petal: { name: 1, priority: 'x' }, capabilities: { protocols: ['hcs-18'] } } } as any),
    ).toBe(false);
    expect(
      isAnnounceMessage({ p: 'hcs-18', op: 'announce', data: { account: '0.0.1', petal: { name: 'P', priority: 1 }, capabilities: 'x' } } as any),
    ).toBe(false);

    expect(
      isProposeMessage({ p: 'hcs-18', op: 'propose', data: { proposer: 1, members: [], config: { name: 'X', threshold: 1 } } } as any),
    ).toBe(false);
    expect(
      isProposeMessage({ p: 'hcs-18', op: 'propose', data: { proposer: '0.0.1', members: 'x', config: { name: 'X', threshold: 1 } } } as any),
    ).toBe(false);
    expect(
      isProposeMessage({ p: 'hcs-18', op: 'propose', data: { proposer: '0.0.1', members: ['x'], config: { name: 'X', threshold: 1 } } } as any),
    ).toBe(false);
    expect(
      isProposeMessage({ p: 'hcs-18', op: 'propose', data: { proposer: '0.0.1', members: [{ account: 1, priority: 1 }], config: { name: 'X', threshold: 1 } } } as any),
    ).toBe(false);
    expect(
      isProposeMessage({ p: 'hcs-18', op: 'propose', data: { proposer: '0.0.1', members: [{ account: '0.0.2', priority: 1, announce_seq: 'x' }], config: { name: 'X', threshold: 1 } } } as any),
    ).toBe(false);
    expect(
      isProposeMessage({ p: 'hcs-18', op: 'propose', data: { proposer: '0.0.1', members: [], config: 'x' } } as any),
    ).toBe(false);

    expect(
      isRespondMessage({ p: 'hcs-18', op: 'respond', data: { responder: 1, proposal_seq: 1, decision: 'accept' } } as any),
    ).toBe(false);
    expect(
      isRespondMessage({ p: 'hcs-18', op: 'respond', data: { responder: '0.0.1', proposal_seq: 1, decision: 1 } } as any),
    ).toBe(false);

    expect(
      isCompleteMessage({ p: 'hcs-18', op: 'complete', data: { proposer: 1, proposal_seq: 1, flora_account: '0.0.2', topics: { communication: '0.0.1', transaction: '0.0.2', state: '0.0.3' } } } as any),
    ).toBe(false);
    expect(
      isCompleteMessage({ p: 'hcs-18', op: 'complete', data: { proposer: '0.0.1', proposal_seq: 'x', flora_account: '0.0.2', topics: { communication: '0.0.1', transaction: '0.0.2', state: '0.0.3' } } } as any),
    ).toBe(false);
    expect(
      isCompleteMessage({ p: 'hcs-18', op: 'complete', data: { proposer: '0.0.1', proposal_seq: 1, flora_account: 1, topics: { communication: '0.0.1', transaction: '0.0.2', state: '0.0.3' } } } as any),
    ).toBe(false);
  });
});
