import { createRequire } from 'node:module';

type TopicCreateTransactionCtor =
  (typeof import('@hashgraph/sdk/lib/topic/TopicCreateTransaction'))['default'];
type AccountIdCtor =
  (typeof import('@hashgraph/sdk/lib/account/AccountId'))['default'];
type AccountIdInstance = InstanceType<AccountIdCtor>;

const require = createRequire(import.meta.url);

const accountModule = safeRequire<{ default: AccountIdCtor }>(
  '@hashgraph/sdk/lib/account/AccountId.cjs',
);
const topicModule = safeRequire<{ default: TopicCreateTransactionCtor }>(
  '@hashgraph/sdk/lib/topic/TopicCreateTransaction.cjs',
);
const sdkModule = safeRequire<{
  AccountId?: AccountIdCtor;
  TopicCreateTransaction?: TopicCreateTransactionCtor;
  default?: {
    AccountId?: AccountIdCtor;
    TopicCreateTransaction?: TopicCreateTransactionCtor;
  };
}>('@hashgraph/sdk');

const accountIdPattern = /^\d+\.\d+\.\d+$/u;
const prototypeMarker = Symbol.for('standards-sdk.topic-auto-renew.patch');
const accountMarker = Symbol.for('standards-sdk.account-id.patch');

const candidates: Array<{
  accountId?: AccountIdCtor;
  topic?: TopicCreateTransactionCtor;
}> = [];

if (accountModule?.default && topicModule?.default) {
  candidates.push({
    accountId: accountModule.default,
    topic: topicModule.default,
  });
}

if (sdkModule) {
  candidates.push({
    accountId: sdkModule.AccountId ?? sdkModule.default?.AccountId,
    topic:
      sdkModule.TopicCreateTransaction ??
      sdkModule.default?.TopicCreateTransaction,
  });
}

for (const candidate of candidates) {
  patchTopicModule(candidate.topic, candidate.accountId);
}

Reflect.set(globalThis, '__standardsSdkTopicAutoRenewPatched', true);

function safeRequire<T>(moduleId: string): T | null {
  try {
    return require(moduleId) as T;
  } catch {
    return null;
  }
}

function patchTopicModule(
  topicCtor?: TopicCreateTransactionCtor,
  accountCtor?: AccountIdCtor,
): void {
  if (!topicCtor || !accountCtor) {
    return;
  }

  patchAccountId(accountCtor);

  const prototype = topicCtor.prototype;

  if (Reflect.get(prototype, prototypeMarker)) {
    return;
  }

  const originalSet = prototype.setAutoRenewAccountId;
  const originalFreeze = prototype.freezeWith;

  prototype.setAutoRenewAccountId = function setAutoRenewAccountIdPatched(
    this: TopicPrototype,
    autoRenewAccountId: unknown,
  ) {
    const resolved = resolveAccountId(autoRenewAccountId, accountCtor);

    if (resolved) {
      requireNotFrozen(this);
      this._autoRenewAccountId = resolved;
      return this;
    }

    return originalSet.call(
      this,
      autoRenewAccountId as AccountIdInstance | string,
    );
  };

  prototype.freezeWith = function freezeWithPatched(
    this: TopicPrototype,
    client?: unknown,
  ) {
    if (
      !this.getAutoRenewAccountId ||
      typeof this.getAutoRenewAccountId !== 'function'
    ) {
      return originalFreeze.call(this, client);
    }

    const current = this.getAutoRenewAccountId();

    if (!current) {
      const transactionAccountId = this.transactionId?.accountId;
      const operatorAccountId = (client as ClientLike | null | undefined)
        ?.operatorAccountId;
      const resolved =
        resolveAccountId(transactionAccountId, accountCtor) ??
        resolveAccountId(operatorAccountId, accountCtor);

      if (resolved) {
        this._autoRenewAccountId = resolved;
      }
    }

    return originalFreeze.call(this, client);
  };

  Reflect.set(prototype, prototypeMarker, true);
}

function patchAccountId(accountCtor: AccountIdCtor): void {
  if (Reflect.get(accountCtor, accountMarker)) {
    return;
  }

  const originalFromString = accountCtor.fromString.bind(accountCtor);

  accountCtor.fromString = function accountIdFromStringPatched(
    value: unknown,
  ): AccountIdInstance {
    if (typeof value === 'string') {
      return originalFromString(value);
    }

    const extracted = extractAccountIdString(value);

    if (extracted) {
      return originalFromString(extracted);
    }

    if (isProtoAccountId(value)) {
      const shard = toNumericString(value.shard);
      const realm = toNumericString(value.realm);
      const num = toNumericString(value.num);

      if (shard && realm && num) {
        return originalFromString(`${shard}.${realm}.${num}`);
      }
    }

    return originalFromString(value as string);
  };

  Reflect.set(accountCtor, accountMarker, true);
}

function resolveAccountId(
  value: unknown,
  accountCtor: AccountIdCtor,
): AccountIdInstance | null {
  if (value instanceof accountCtor) {
    return value;
  }

  if (typeof value === 'string' && accountIdPattern.test(value)) {
    return accountCtor.fromString(value);
  }

  const normalized = normalizeAutoRenewValue(value);

  if (normalized) {
    return accountCtor.fromString(normalized);
  }

  return null;
}

function normalizeAutoRenewValue(value: unknown): string | null {
  if (typeof value === 'string' && accountIdPattern.test(value)) {
    return value;
  }

  const extracted = extractAccountIdString(value);

  if (extracted) {
    return extracted;
  }

  if (isProtoAccountId(value)) {
    const shard = toNumericString(value.shard);
    const realm = toNumericString(value.realm);
    const num = toNumericString(value.num);

    if (shard && realm && num) {
      const composed = `${shard}.${realm}.${num}`;
      if (accountIdPattern.test(composed)) {
        return composed;
      }
    }
  }

  return null;
}

function extractAccountIdString(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as { toString?: () => unknown };
  const method = candidate.toString;

  if (typeof method !== 'function') {
    return null;
  }

  const result = method.call(value);

  if (typeof result !== 'string') {
    return null;
  }

  return accountIdPattern.test(result) ? result : null;
}

function isProtoAccountId(value: unknown): value is {
  shard: { toString: () => string };
  realm: { toString: () => string };
  num: { toString: () => string };
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    hasToString(candidate.shard) &&
    hasToString(candidate.realm) &&
    hasToString(candidate.num)
  );
}

function hasToString(value: unknown): value is { toString: () => string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toString?: unknown }).toString === 'function'
  );
}

function toNumericString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (hasToString(value)) {
    const result = value.toString();
    if (/^\d+$/u.test(result)) {
      return result;
    }
  }

  return null;
}

function requireNotFrozen(target: TopicPrototype): void {
  const candidate = target as { _requireNotFrozen?: () => void };
  candidate._requireNotFrozen?.();
}

type ClientLike = {
  operatorAccountId?: unknown;
};

type TopicPrototype = TopicCreateTransactionCtor['prototype'] & {
  _autoRenewAccountId?: AccountIdInstance | null;
  transactionId?: { accountId?: unknown } | null;
};
