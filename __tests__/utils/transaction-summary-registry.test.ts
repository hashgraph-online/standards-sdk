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

