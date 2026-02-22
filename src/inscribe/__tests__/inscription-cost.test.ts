import { computeInscriptionCostSummary } from '../inscription-cost';

describe('computeInscriptionCostSummary', () => {
  it('prefers payer debit when present', () => {
    const computed = computeInscriptionCostSummary({
      payerAccountId: '0.0.1001',
      txn: {
        charged_tx_fee: 2000,
        transfers: [
          { account: '0.0.1001', amount: -200_000_000, is_approval: false },
          { account: '0.0.2002', amount: 150_000_000, is_approval: false },
          { account: '0.0.3003', amount: 50_000_000, is_approval: false },
        ],
      },
    });

    expect(computed).not.toBeNull();
    expect(computed?.totalTinybar).toBe(200_000_000);
    expect(computed?.summary.totalCostHbar).toBe('2');
    expect(computed?.summary.breakdown.transfers).toHaveLength(2);
    expect(computed?.summary.breakdown.transfers[0]?.to).toBe('0.0.2002');
    expect(computed?.summary.breakdown.transfers[0]?.amount).toBe('1.5');
  });

  it('falls back to sum of positive transfers when payer debit is absent', () => {
    const computed = computeInscriptionCostSummary({
      payerAccountId: '0.0.1001',
      txn: {
        charged_tx_fee: 1234,
        transfers: [
          { account: '0.0.2002', amount: 25_000_000, is_approval: false },
          { account: '0.0.3003', amount: 75_000_000, is_approval: false },
        ],
      },
    });

    expect(computed).not.toBeNull();
    expect(computed?.totalTinybar).toBe(100_000_000);
    expect(computed?.summary.totalCostHbar).toBe('1');
    expect(computed?.summary.breakdown.transfers).toHaveLength(2);
  });

  it('falls back to charged tx fee when transfers do not contain a cost signal', () => {
    const computed = computeInscriptionCostSummary({
      payerAccountId: '0.0.1001',
      txn: {
        charged_tx_fee: 1_234_567,
        transfers: [],
      },
    });

    expect(computed).not.toBeNull();
    expect(computed?.totalTinybar).toBe(1_234_567);
    expect(computed?.summary.totalCostHbar).toBe('0.01234567');
    expect(computed?.summary.breakdown.transfers).toHaveLength(1);
    expect(computed?.summary.breakdown.transfers[0]?.to).toBe('Hedera network');
  });

  it('returns null when it cannot resolve a positive amount', () => {
    const computed = computeInscriptionCostSummary({
      payerAccountId: '0.0.1001',
      txn: {
        charged_tx_fee: 0,
        transfers: [],
      },
    });

    expect(computed).toBeNull();
  });
});
