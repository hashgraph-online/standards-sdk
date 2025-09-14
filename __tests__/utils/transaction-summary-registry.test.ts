import { resolveTransactionSummary } from '../../src/utils/transaction-summary-registry';
import type { ParsedTransaction } from '../../src/utils/transaction-parser-types';

describe('Transaction Summary Registry', () => {
  test('summarizes crypto transfer between accounts', () => {
    const tx = {
      type: 'CRYPTOTRANSFER',
      humanReadableType: 'HBAR Transfer',
      transfers: [
        { accountId: '0.0.100', amount: '-10 ℏ' },
        { accountId: '0.0.200', amount: '10 ℏ' },
      ],
      tokenTransfers: [],
    } as unknown as ParsedTransaction;
    const s = resolveTransactionSummary(tx);
    expect(s).toContain('Transfer of HBAR from');
    expect(s).toContain('0.0.100 (10 ℏ)');
    expect(s).toContain('0.0.200 (10 ℏ)');
  });

  test('summarizes grouped token transfers', () => {
    const tx = {
      type: 'tokenTransfer',
      humanReadableType: 'Token Transfer',
      transfers: [],
      tokenTransfers: [
        { tokenId: '0.0.300', accountId: '0.0.1', amount: -5 },
        { tokenId: '0.0.300', accountId: '0.0.2', amount: 5 },
        { tokenId: '0.0.400', accountId: '0.0.3', amount: -1 },
        { tokenId: '0.0.400', accountId: '0.0.4', amount: 1 },
      ],
    } as unknown as ParsedTransaction;
    const s = resolveTransactionSummary(tx);
    expect(s).toContain('Transfer of token 0.0.300 from 0.0.1 (5) to 0.0.2 (5)');
    expect(s).toContain('Transfer of token 0.0.400 from 0.0.3 (1) to 0.0.4 (1)');
  });

  test('summarizes contract call with gas, amount and function', () => {
    const tx = {
      type: 'CONTRACTCALL',
      humanReadableType: 'Contract Call',
      tokenTransfers: [],
      transfers: [],
      contractCall: {
        contractId: '0.0.999',
        gas: 12345,
        amount: 7,
        functionName: 'transfer',
      },
    } as unknown as ParsedTransaction;
    const s = resolveTransactionSummary(tx);
    expect(s).toContain('Contract call to 0.0.999');
    expect(s).toContain('12345 gas');
    expect(s).toContain('7 HBAR');
    expect(s).toContain('function transfer');
  });

  test('summarizes token creation with supply and custom fees', () => {
    const tx = {
      type: 'TOKENCREATE',
      humanReadableType: 'Token Creation',
      tokenTransfers: [],
      transfers: [],
      tokenCreation: {
        tokenName: 'MyToken',
        tokenSymbol: 'MTK',
        initialSupply: '1000',
        customFees: [{}, {}],
      },
    } as unknown as ParsedTransaction;
    const s = resolveTransactionSummary(tx);
    expect(s).toContain('Create token MyToken (MTK)');
    expect(s).toContain('initial supply 1000');
    expect(s).toContain('2 custom fee');
  });

  test('summarizes submit message with utf8 preview', () => {
    const tx = {
      type: 'CONSENSUSSUBMITMESSAGE',
      humanReadableType: 'Submit Message',
      tokenTransfers: [],
      transfers: [],
      consensusSubmitMessage: {
        topicId: '0.0.123',
        message: 'Hello Hedera! This is a test message.',
        messageEncoding: 'utf8',
      },
    } as unknown as ParsedTransaction;
    const s = resolveTransactionSummary(tx);
    expect(s).toContain('Submit message');
    expect(s).toContain('to topic 0.0.123');
    expect(s).toContain('Hello Hedera!');
  });

  test('summarizes submit message with base64 length', () => {
    const b64 = Buffer.from('abc').toString('base64');
    const tx = {
      type: 'consensusSubmitMessage',
      humanReadableType: 'Submit Message',
      tokenTransfers: [],
      transfers: [],
      consensusSubmitMessage: {
        topicId: '0.0.123',
        message: b64,
        messageEncoding: 'base64',
      },
    } as unknown as ParsedTransaction;
    const s = resolveTransactionSummary(tx);
    expect(s).toContain('binary message data, length: 3 bytes');
  });

  test('falls back to humanReadableType when no specific summary', () => {
    const tx = {
      type: 'UNKNOWN',
      humanReadableType: 'Some Operation',
      transfers: [],
      tokenTransfers: [],
    } as unknown as ParsedTransaction;
    const s = resolveTransactionSummary(tx);
    expect(s).toBe('Some Operation');
  });
});

// Extended coverage for Transaction Summary Registry
describe('Transaction Summary Registry – extended coverage', () => {
  const base: Partial<import('../../src/utils/transaction-parser-types').ParsedTransaction> = {
    humanReadableType: 'Unknown Transaction',
    transfers: [],
    tokenTransfers: [],
  };

  const summarize = (tx: Partial<import('../../src/utils/transaction-parser-types').ParsedTransaction>) =>
    resolveTransactionSummary(tx as any);

  test('token freeze/unfreeze/grant/revoke/pause/unpause/wipe/delete', () => {
    expect(summarize({ type: 'TOKENFREEZE', tokenFreeze: { tokenId: '0.0.1', accountId: '0.0.2' }, ...base })).toBe('Freeze Token 0.0.1 for Account 0.0.2');
    expect(summarize({ type: 'TOKENUNFREEZE', tokenUnfreeze: { tokenId: '0.0.1', accountId: '0.0.2' }, ...base })).toBe('Unfreeze Token 0.0.1 for Account 0.0.2');
    expect(summarize({ type: 'TOKENGRANTKYC', tokenGrantKyc: { tokenId: '0.0.3', accountId: '0.0.4' }, ...base })).toBe('Grant KYC for Token 0.0.3 to Account 0.0.4');
    expect(summarize({ type: 'TOKENREVOKEKYC', tokenRevokeKyc: { tokenId: '0.0.3', accountId: '0.0.4' }, ...base })).toBe('Revoke KYC for Token 0.0.3 from Account 0.0.4');
    expect(summarize({ type: 'TOKENPAUSE', tokenPause: { tokenId: '0.0.5' }, ...base })).toBe('Pause Token 0.0.5');
    expect(summarize({ type: 'TOKENUNPAUSE', tokenUnpause: { tokenId: '0.0.5' }, ...base })).toBe('Unpause Token 0.0.5');
    expect(summarize({ type: 'TOKENWIPE', tokenWipeAccount: { tokenId: '0.0.6', accountId: '0.0.7', amount: 10 }, ...base })).toBe('Wipe Token 0.0.6 from Account 0.0.7 (Amount: 10)');
    expect(summarize({ type: 'TOKENWIPEACCOUNT', tokenWipeAccount: { tokenId: '0.0.6', accountId: '0.0.7', serialNumbers: [1,2,3] }, ...base })).toBe('Wipe Token 0.0.6 from Account 0.0.7 (Serials: 1, 2, 3)');
    expect(summarize({ type: 'TOKENDELETE', tokenDelete: { tokenId: '0.0.8' }, ...base })).toBe('Delete Token 0.0.8');
  });

  test('token associate/dissociate', () => {
    expect(summarize({ type: 'TOKENASSOCIATE', tokenAssociate: { accountId: '0.0.9', tokenIds: ['0.0.1','0.0.2'] }, ...base })).toBe('Associate Account 0.0.9 with Tokens: 0.0.1, 0.0.2');
    expect(summarize({ type: 'TOKENDISSOCIATE', tokenDissociate: { accountId: '0.0.9', tokenIds: ['0.0.1'] }, ...base })).toBe('Dissociate Account 0.0.9 from Tokens: 0.0.1');
  });

  test('account create/update/delete', () => {
    expect(summarize({ type: 'ACCOUNTCREATE', cryptoCreateAccount: { initialBalance: '100', alias: '0xabc' } as any, ...base })).toContain('Create Account');
    expect(summarize({ type: 'ACCOUNTUPDATE', cryptoUpdateAccount: { accountIdToUpdate: '0.0.10' } as any, ...base })).toBe('Update Account 0.0.10');
    expect(summarize({ type: 'ACCOUNTDELETE', cryptoDelete: { deleteAccountId: '0.0.11' } as any, ...base })).toBe('Delete Account 0.0.11');
  });

  test('approve/delete allowance', () => {
    expect(summarize({ type: 'APPROVEALLOWANCE', cryptoApproveAllowance: { hbarAllowances: [{}], tokenAllowances: [{}, {}], nftAllowances: [] } as any, ...base })).toBe('Approve 3 Crypto Allowance(s)');
    expect(summarize({ type: 'DELETEALLOWANCE', cryptoDeleteAllowance: { nftAllowancesToRemove: [{}, {}] } as any, ...base })).toBe('Delete 2 NFT Crypto Allowance(s)');
  });

  test('contract create/update/delete', () => {
    expect(summarize({ type: 'CONTRACTCREATE', contractCreate: { memo: 'x' } as any, ...base })).toBe('Create Contract (Memo: x)');
    expect(summarize({ type: 'CONTRACTUPDATE', contractUpdate: { contractIdToUpdate: '0.0.12' } as any, ...base })).toBe('Update Contract 0.0.12');
    expect(summarize({ type: 'CONTRACTDELETE', contractDelete: { contractIdToDelete: '0.0.13', transferAccountId: '0.0.14' } as any, ...base })).toBe('Delete Contract 0.0.13 (Transfer to Account: 0.0.14)');
  });

  test('schedule/system/node/atomic batch summaries', () => {
    expect(summarize({ type: 'SCHEDULECREATE', scheduleCreate: { memo: 'payroll' } as any, ...base })).toBe('Create Schedule (Memo: payroll)');
    expect(summarize({ type: 'SCHEDULESIGN', scheduleSign: {} as any, ...base })).toBe('Sign Schedule');
    expect(summarize({ type: 'SYSTEMDELETE', systemDelete: { fileId: '0.0.15' } as any, ...base })).toBe('System Delete File 0.0.15');
    expect(summarize({ type: 'SYSTEMUNDELETE', systemUndelete: { contractId: '0.0.18' } as any, ...base })).toBe('System Undelete Contract 0.0.18');
    expect(summarize({ type: 'FREEZE', ...base })).toBe('Network Freeze');
    expect(summarize({ type: 'ETHEREUMTRANSACTION', ...base })).toBe('Ethereum Transaction');
    expect(summarize({ type: 'UNCHECKEDSUBMIT', uncheckedSubmit: { topicId: '0.0.19' } as any, ...base })).toBe('Unchecked Submit to topic 0.0.19');
    expect(summarize({ type: 'NODECREATE', ...base })).toBe('Create Node');
    expect(summarize({ type: 'NODEUPDATE', ...base })).toBe('Update Node');
    expect(summarize({ type: 'NODEDELETE', ...base })).toBe('Delete Node');
    expect(summarize({ type: 'ATOMICBATCH', atomicBatch: { transactions: [{}, {}, {}] } as any, ...base })).toBe('Atomic Batch (3 transaction(s))');
  });
});
