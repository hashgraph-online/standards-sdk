import { AccountCreateTransaction, PublicKey } from '@hashgraph/sdk';
import {
  buildHcs15BaseAccountCreateTx,
  buildHcs15PetalAccountCreateTx,
  HCS15_BASE_ACCOUNT_CREATE_TRANSACTION_MEMO,
  HCS15_PETAL_ACCOUNT_CREATE_TRANSACTION_MEMO,
} from '../../src/hcs-15/tx';

jest.mock('@hashgraph/sdk', () => {
  const AccountCreateTransaction = jest.fn().mockImplementation(() => ({
    setECDSAKeyWithAlias: jest.fn().mockReturnThis(),
    setKeyWithoutAlias: jest.fn().mockReturnThis(),
    setInitialBalance: jest.fn().mockReturnThis(),
    setMaxAutomaticTokenAssociations: jest.fn().mockReturnThis(),
    setAccountMemo: jest.fn().mockReturnThis(),
    setTransactionMemo: jest.fn().mockReturnThis(),
  }));

  const Hbar = jest.fn().mockImplementation(() => ({}));
  const PublicKey = jest.fn().mockImplementation(() => ({}));

  return {
    AccountCreateTransaction,
    Hbar,
    PublicKey,
  };
});

describe('HCS-15 transaction builders', () => {
  const mockAccountCreateTx = AccountCreateTransaction as jest.MockedClass<
    typeof AccountCreateTransaction
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccountCreateTx.mockReturnValue({
      setECDSAKeyWithAlias: jest.fn().mockReturnThis(),
      setKeyWithoutAlias: jest.fn().mockReturnThis(),
      setInitialBalance: jest.fn().mockReturnThis(),
      setMaxAutomaticTokenAssociations: jest.fn().mockReturnThis(),
      setAccountMemo: jest.fn().mockReturnThis(),
      setTransactionMemo: jest.fn().mockReturnThis(),
    } as any);
  });

  test('base account create sets default hcs-15 transaction memo', () => {
    const tx = buildHcs15BaseAccountCreateTx({
      publicKey: {} as unknown as PublicKey,
    });

    expect(tx.setTransactionMemo).toHaveBeenCalledWith(
      HCS15_BASE_ACCOUNT_CREATE_TRANSACTION_MEMO,
    );
  });

  test('base account create supports overriding transaction memo', () => {
    const tx = buildHcs15BaseAccountCreateTx({
      publicKey: {} as unknown as PublicKey,
      transactionMemo: 'hcs-15:op:custom',
    });

    expect(tx.setTransactionMemo).toHaveBeenCalledWith('hcs-15:op:custom');
  });

  test('petal account create sets default hcs-15 transaction memo', () => {
    const tx = buildHcs15PetalAccountCreateTx({
      publicKey: {} as unknown as PublicKey,
    });

    expect(tx.setTransactionMemo).toHaveBeenCalledWith(
      HCS15_PETAL_ACCOUNT_CREATE_TRANSACTION_MEMO,
    );
  });

  test('petal account create supports overriding transaction memo', () => {
    const tx = buildHcs15PetalAccountCreateTx({
      publicKey: {} as unknown as PublicKey,
      transactionMemo: 'hcs-15:op:custom_petal',
    });

    expect(tx.setTransactionMemo).toHaveBeenCalledWith(
      'hcs-15:op:custom_petal',
    );
  });
});
