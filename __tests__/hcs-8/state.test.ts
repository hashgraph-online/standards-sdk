import { PollStateMachine } from '../../src/hcs-8/state';
import {
  buildManageMessage,
  buildRegisterMessage,
  buildVoteMessage,
  buildUpdateMessage,
  buildRegisterChunks,
} from '../../src/hcs-8/builders';
import { RegisterSequenceAssembler } from '../../src/hcs-8/assembler';
import { PollMetadata } from '../../src/hcs-9';

const baseMetadata: PollMetadata = {
  schema: 'hcs-9',
  title: 'Hashgraph Roadmap',
  description: 'Vote for the next feature to build',
  author: '0.0.1001',
  votingRules: {
    schema: 'hcs-9',
    allocations: [{ schema: 'hcs-9:equal-weight', weight: 1 }],
    permissions: [{ schema: 'hcs-9:allow-all' }],
    rules: [{ name: 'allowVoteChanges' }, { name: 'allowMultipleChoice' }],
  },
  permissionsRules: [{ schema: 'hcs-9:allow-all' }],
  manageRules: { schema: 'hcs-9', permissions: [{ schema: 'hcs-9:allow-author' }] },
  updateRules: {
    schema: 'hcs-9',
    permissions: [{ schema: 'hcs-9:allow-author' }],
    updateSettings: { endDate: true },
  },
  options: [
    { schema: 'hcs-9', id: 0, title: 'Smart Contract Toolkit' },
    { schema: 'hcs-9', id: 1, title: 'Wallet Integrations' },
  ],
  status: 'inactive',
  startDate: '1720000000',
  endConditionRules: [{ schema: 'hcs-9:end-date', endDate: '1720003600' }],
};

describe('HCS-8 poll state machine', () => {
  it('processes register, manage, vote and close lifecycle', () => {
    const machine = new PollStateMachine();
    machine.apply(buildRegisterMessage(baseMetadata), '1');
    expect(machine.getState().metadata?.title).toBe('Hashgraph Roadmap');
    expect(machine.getState().status).toBe('inactive');

    machine.apply(buildManageMessage(baseMetadata.author, 'open'), '2');
    expect(machine.getState().status).toBe('active');

    const voteMessage = buildVoteMessage(baseMetadata.author, [
      { accountId: baseMetadata.author, optionId: 0, weight: 1 },
    ]);
    machine.apply(voteMessage, '3');

    const stateAfterVote = machine.getState();
    expect(stateAfterVote.results.totalWeight).toBe(1);
    expect(stateAfterVote.results.optionWeight.get(0)).toBe(1);

    machine.apply(buildManageMessage(baseMetadata.author, 'close'), '4');
    expect(machine.getState().status).toBe('closed');
  });

  it('rejects unauthorised updates', () => {
    const machine = new PollStateMachine();
    machine.apply(buildRegisterMessage(baseMetadata), '1');
    machine.apply(
      buildUpdateMessage('0.0.other', { endDate: '1720009999' }),
      '2',
    );
    expect(machine.getState().errors.some((error) => error.operation === 'update')).toBe(true);
  });

  it('supports multi-message register assembly', () => {
    const assembler = new RegisterSequenceAssembler();
    const chunks = buildRegisterChunks(baseMetadata, 'chunked register', { chunkSize: 40 });
    expect(chunks.length).toBeGreaterThan(1);

    let complete;
    chunks.forEach((chunk, index) => {
      const parsed = assembler.ingest(chunk, `${index}`);
      if (parsed) {
        complete = parsed.message;
      }
    });

    expect(complete).toBeDefined();
    const machine = new PollStateMachine();
    machine.apply(complete!, 'final');
    expect(machine.getState().metadata?.title).toBe(baseMetadata.title);
  });

  it('enforces vote weight allocations and changes', () => {
    const machine = new PollStateMachine();
    machine.apply(buildRegisterMessage(baseMetadata), '1');
    machine.apply(buildManageMessage(baseMetadata.author, 'open'), '2');

    const firstVote = buildVoteMessage('0.0.2001', [
      { accountId: '0.0.2001', optionId: 0, weight: 1 },
    ]);
    machine.apply(firstVote, '3');

    const secondVote = buildVoteMessage('0.0.2001', [
      { accountId: '0.0.2001', optionId: 1, weight: 1 },
    ]);
    machine.apply(secondVote, '4');

    const state = machine.getState();
    expect(state.results.optionWeight.get(0)).toBeUndefined();
    expect(state.results.optionWeight.get(1)).toBe(1);
  });
});
