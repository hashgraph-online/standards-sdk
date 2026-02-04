import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';

type UnknownRecord = Record<string, unknown>;

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function hasFunctionProp(
  value: UnknownRecord,
  prop: string,
): value is UnknownRecord & Record<string, (...args: never[]) => unknown> {
  return typeof value[prop] === 'function';
}

export function isDAppSigner(value: unknown): value is DAppSigner {
  if (!isUnknownRecord(value)) {
    return false;
  }

  return (
    hasFunctionProp(value, 'getAccountId') &&
    hasFunctionProp(value, 'getAccountKey') &&
    hasFunctionProp(value, 'signTransaction') &&
    hasFunctionProp(value, 'call')
  );
}

export function requireDAppSigner(
  value: unknown,
  errorMessage: string,
): DAppSigner {
  if (!isDAppSigner(value)) {
    throw new Error(errorMessage);
  }
  return value;
}
