import { resolveTransactionSummary } from '../../src/utils/transaction-summary-registry';
import type { ParsedTransaction } from '../../src/utils/transaction-parser-types';

describe('Transaction Summary Registry – extended coverage', () => {
  const base: Partial<ParsedTransaction> = {
    humanReadableType: 'Unknown Transaction',
    transfers: [],
    tokenTransfers: [],
  } as Partial<ParsedTransaction>;

  const summarize = (tx: Partial<ParsedTransaction>) =>
    resolveTransactionSummary(tx as ParsedTransaction);

  test('token freeze/unfreeze/grant/revoke/pause/unpause/wipe/delete', () => {
    expect(
      summarize({ type: 'TOKENFREEZE', tokenFreeze: { tokenId: '0.0.1', accountId: '0.0.2' }, ...base })
    ).toBe('Freeze Token 0.0.1 for Account 0.0.2');
    expect(
      summarize({ type: 'TOKENUNFREEZE', tokenUnfreeze: { tokenId: '0.0.1', accountId: '0.0.2' }, ...base })
    ).toBe('Unfreeze Token 0.0.1 for Account 0.0.2');
    expect(
      summarize({ type: 'TOKENGRANTKYC', tokenGrantKyc: { tokenId: '0.0.3', accountId: '0.0.4' }, ...base })
    ).toBe('Grant KYC for Token 0.0.3 to Account 0.0.4');
    expect(
      summarize({ type: 'TOKENREVOKEKYC', tokenRevokeKyc: { tokenId: '0.0.3', accountId: '0.0.4' }, ...base })
    ).toBe('Revoke KYC for Token 0.0.3 from Account 0.0.4');
    expect(
      summarize({ type: 'TOKENPAUSE', tokenPause: { tokenId: '0.0.5' }, ...base })
    ).toBe('Pause Token 0.0.5');
    expect(
      summarize({ type: 'TOKENUNPAUSE', tokenUnpause: { tokenId: '0.0.5' }, ...base })
    ).toBe('Unpause Token 0.0.5');
    expect(
      summarize({ type: 'TOKENWIPE', tokenWipeAccount: { tokenId: '0.0.6', accountId: '0.0.7', amount: 10 }, ...base })
    ).toBe('Wipe Token 0.0.6 from Account 0.0.7 (Amount: 10)');
    expect(
      summarize({ type: 'TOKENWIPEACCOUNT', tokenWipeAccount: { tokenId: '0.0.6', accountId: '0.0.7', serialNumbers: [1,2,3] }, ...base })
    ).toBe('Wipe Token 0.0.6 from Account 0.0.7 (Serials: 1, 2, 3)');
    expect(
      summarize({ type: 'TOKENDELETE', tokenDelete: { tokenId: '0.0.8' }, ...base })
    ).toBe('Delete Token 0.0.8');
  });

  test('token associate/dissociate', () => {
    expect(
      summarize({ type: 'TOKENASSOCIATE', tokenAssociate: { accountId: '0.0.9', tokenIds: ['0.0.1','0.0.2'] }, ...base })
    ).toBe('Associate Account 0.0.9 with Tokens: 0.0.1, 0.0.2');
    expect(
      summarize({ type: 'TOKENDISSOCIATE', tokenDissociate: { accountId: '0.0.9', tokenIds: ['0.0.1'] }, ...base })
    ).toBe('Dissociate Account 0.0.9 from Tokens: 0.0.1');
  });

  test('account create/update/delete', () => {
    expect(
      summarize({ type: 'ACCOUNTCREATE', cryptoCreateAccount: { initialBalance: '100', alias: '0xabc' } as any, ...base })
    ).toContain('Create Account');
    expect(
      summarize({ type: 'ACCOUNTUPDATE', cryptoUpdateAccount: { accountIdToUpdate: '0.0.10' } as any, ...base })
    ).toBe('Update Account 0.0.10');
    expect(
      summarize({ type: 'ACCOUNTDELETE', cryptoDelete: { deleteAccountId: '0.0.11' } as any, ...base })
    ).toBe('Delete Account 0.0.11');
  });

  test('approve/delete allowance', () => {
    expect(
      summarize({ type: 'APPROVEALLOWANCE', cryptoApproveAllowance: { hbarAllowances: [{}], tokenAllowances: [{}, {}], nftAllowances: [] } as any, ...base })
    ).toBe('Approve 3 Crypto Allowance(s)');
    expect(
      summarize({ type: 'DELETEALLOWANCE', cryptoDeleteAllowance: { nftAllowancesToRemove: [{}, {}] } as any, ...base })
    ).toBe('Delete 2 NFT Crypto Allowance(s)');
  });

  test('contract create/update/delete', () => {
    expect(
      summarize({ type: 'CONTRACTCREATE', contractCreate: { memo: 'x' } as any, ...base })
    ).toBe('Create Contract (Memo: x)');
    expect(
      summarize({ type: 'CONTRACTUPDATE', contractUpdate: { contractIdToUpdate: '0.0.12' } as any, ...base })
    ).toBe('Update Contract 0.0.12');
    expect(
      summarize({ type: 'CONTRACTDELETE', contractDelete: { contractIdToDelete: '0.0.13', transferAccountId: '0.0.14' } as any, ...base })
    ).toBe('Delete Contract 0.0.13 (Transfer to Account: 0.0.14)');
  });

  test('schedule create/sign/delete', () => {
    expect(
      summarize({ type: 'SCHEDULECREATE', scheduleCreate: { memo: 'payroll' } as any, ...base })
    ).toBe('Create Schedule (Memo: payroll)');
    expect(summarize({ type: 'SCHEDULESIGN', scheduleSign: {} as any, ...base })).toBe('Sign Schedule');
    expect(summarize({ type: 'SCHEDULEDELETE', scheduleDelete: {} as any, ...base })).toBe('Delete Schedule');
  });

  test('system delete/undelete', () => {
    expect(summarize({ type: 'SYSTEMDELETE', systemDelete: { fileId: '0.0.15' } as any, ...base })).toBe('System Delete File 0.0.15');
    expect(summarize({ type: 'SYSTEMDELETE', systemDelete: { contractId: '0.0.16' } as any, ...base })).toBe('System Delete Contract 0.0.16');
    expect(summarize({ type: 'SYSTEMUNDELETE', systemUndelete: { fileId: '0.0.17' } as any, ...base })).toBe('System Undelete File 0.0.17');
    expect(summarize({ type: 'SYSTEMUNDELETE', systemUndelete: { contractId: '0.0.18' } as any, ...base })).toBe('System Undelete Contract 0.0.18');
  });

  test('freeze, ethereum tx, unchecked submit, node ops, atomic batch', () => {
    expect(summarize({ type: 'FREEZE', ...base })).toBe('Network Freeze');
    expect(summarize({ type: 'ETHEREUMTRANSACTION', ...base })).toBe('Ethereum Transaction');
    expect(summarize({ type: 'UNCHECKEDSUBMIT', uncheckedSubmit: { topicId: '0.0.19' } as any, ...base })).toBe('Unchecked Submit to topic 0.0.19');
    expect(summarize({ type: 'NODECREATE', ...base })).toBe('Create Node');
    expect(summarize({ type: 'NODEUPDATE', ...base })).toBe('Update Node');
    expect(summarize({ type: 'NODEDELETE', ...base })).toBe('Delete Node');
    expect(summarize({ type: 'ATOMICBATCH', atomicBatch: { transactions: [{}, {}, {}] } as any, ...base })).toBe('Atomic Batch (3 transaction(s))');
  });
});

