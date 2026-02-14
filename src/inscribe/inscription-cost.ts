import BigNumber from 'bignumber.js';
import { Transaction } from '../services/types';
import { QuoteResult, InscriptionCostSummary } from './types';

const TINYBAR_DIVISOR = 100000000;

type MirrorNodeTransactionLike = Pick<
  Transaction,
  'charged_tx_fee' | 'transfers'
>;

type CostTransfer = QuoteResult['breakdown']['transfers'][number];

function safePositiveTransfers(
  transfers: Transaction['transfers'] | undefined,
): Array<{ account: string; amountTinybar: number }> {
  if (!Array.isArray(transfers)) {
    return [];
  }

  return transfers
    .filter(
      transfer => typeof transfer.amount === 'number' && transfer.amount > 0,
    )
    .map(transfer => ({
      account: transfer.account,
      amountTinybar: transfer.amount,
    }));
}

function resolvePayerDebitTinybar(
  transfers: Transaction['transfers'] | undefined,
  payerAccountId: string,
): number | null {
  if (!Array.isArray(transfers)) {
    return null;
  }

  const payerDebit = transfers.find(
    transfer =>
      transfer.account === payerAccountId &&
      typeof transfer.amount === 'number' &&
      transfer.amount < 0,
  );

  if (!payerDebit || typeof payerDebit.amount !== 'number') {
    return null;
  }

  return Math.abs(payerDebit.amount);
}

function toHbarString(tinybar: number): string {
  return new BigNumber(tinybar).dividedBy(TINYBAR_DIVISOR).toFixed();
}

function fallbackFeeTinybar(chargedTxFee: unknown): number | null {
  if (typeof chargedTxFee !== 'number' || !Number.isFinite(chargedTxFee)) {
    return null;
  }
  if (chargedTxFee <= 0) {
    return null;
  }
  return chargedTxFee;
}

export function computeInscriptionCostSummary(params: {
  txn: MirrorNodeTransactionLike;
  payerAccountId: string;
}): { summary: InscriptionCostSummary; totalTinybar: number } | null {
  const { txn, payerAccountId } = params;

  const positiveTransfers = safePositiveTransfers(txn.transfers);
  const payerDebitTinybar = resolvePayerDebitTinybar(
    txn.transfers,
    payerAccountId,
  );

  const transferOutflowTinybar =
    payerDebitTinybar ??
    positiveTransfers.reduce((sum, t) => sum + t.amountTinybar, 0);
  const chargedFeeTinybar = fallbackFeeTinybar(txn.charged_tx_fee);

  const resolvedTotalTinybar =
    transferOutflowTinybar > 0 ? transferOutflowTinybar : chargedFeeTinybar;

  if (!resolvedTotalTinybar || resolvedTotalTinybar <= 0) {
    return null;
  }

  const totalCostHbar = toHbarString(resolvedTotalTinybar);

  const breakdownTransfers: CostTransfer[] =
    positiveTransfers.length > 0
      ? positiveTransfers.map(transfer => ({
          to: transfer.account,
          amount: toHbarString(transfer.amountTinybar),
          description: `HBAR transfer from ${payerAccountId}`,
        }))
      : [
          {
            to: 'Hedera network',
            amount: totalCostHbar,
            description: `Transaction fee debited from ${payerAccountId}`,
          },
        ];

  return {
    totalTinybar: resolvedTotalTinybar,
    summary: {
      totalCostHbar,
      breakdown: {
        transfers: breakdownTransfers,
      },
    },
  };
}
