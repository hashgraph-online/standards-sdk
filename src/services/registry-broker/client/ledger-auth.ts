import { Buffer } from 'node:buffer';
import type { SignerSignature } from '@hashgraph/sdk';
import type {
  JsonObject,
  JsonValue,
  LedgerAuthenticationOptions,
  LedgerAuthenticationSignerResult,
  LedgerChallengeRequest,
  LedgerChallengeResponse,
  LedgerCredentialAuthOptions,
  LedgerVerifyRequest,
  LedgerVerifyResponse,
} from '../types';
import {
  ledgerChallengeResponseSchema,
  ledgerVerifyResponseSchema,
} from '../schemas';
import { canonicalizeLedgerNetwork } from '../ledger-network';
import { createPrivateKeySigner } from '../private-key-signer';
import { RegistryBrokerClient } from './base-client';

declare module './base-client' {
  interface RegistryBrokerClient {
    createLedgerChallenge(
      payload: LedgerChallengeRequest,
    ): Promise<LedgerChallengeResponse>;
    verifyLedgerChallenge(
      payload: LedgerVerifyRequest,
    ): Promise<LedgerVerifyResponse>;
    authenticateWithLedger(
      options: LedgerAuthenticationOptions,
    ): Promise<LedgerVerifyResponse>;
    authenticateWithLedgerCredentials(
      options: LedgerCredentialAuthOptions,
    ): Promise<LedgerVerifyResponse>;
  }
}

async function loadViemAccount(privateKey: `0x${string}`): Promise<{
  publicKey: string;
  signMessage: (input: { message: string }) => Promise<string>;
}> {
  try {
    const viem = await import('viem/accounts');
    return viem.privateKeyToAccount(privateKey);
  } catch (error) {
    const err = new Error(
      'EVM ledger authentication requires the optional dependency "viem". Install it to use evmPrivateKey flows.',
    );
    (err as { cause?: unknown }).cause = error;
    throw err;
  }
}

async function resolveLedgerAuthSignature(
  message: string,
  options: LedgerAuthenticationOptions,
): Promise<LedgerAuthenticationSignerResult> {
  if (typeof options.sign === 'function') {
    const result = await options.sign(message);
    if (
      !result ||
      typeof result.signature !== 'string' ||
      result.signature.length === 0
    ) {
      throw new Error('Custom ledger signer failed to produce a signature.');
    }
    return result;
  }

  if (!options.signer || typeof options.signer.sign !== 'function') {
    throw new Error(
      'Ledger authentication requires a Hedera Signer or custom sign function.',
    );
  }

  const payload = Buffer.from(message, 'utf8');
  const signatures: SignerSignature[] = await options.signer.sign([payload]);
  const signatureEntry = signatures?.[0];
  if (!signatureEntry) {
    throw new Error('Signer did not return any signatures.');
  }

  let derivedPublicKey: string | undefined;
  if (signatureEntry.publicKey) {
    derivedPublicKey = signatureEntry.publicKey.toString();
  } else if (typeof options.signer.getAccountKey === 'function') {
    const accountKey = await options.signer.getAccountKey();
    if (accountKey && typeof accountKey.toString === 'function') {
      derivedPublicKey = accountKey.toString();
    }
  }

  return {
    signature: Buffer.from(signatureEntry.signature).toString('base64'),
    signatureKind: 'raw',
    publicKey: derivedPublicKey,
  };
}

RegistryBrokerClient.prototype.createLedgerChallenge = async function (
  this: RegistryBrokerClient,
  payload: LedgerChallengeRequest,
): Promise<LedgerChallengeResponse> {
  const resolvedNetwork = canonicalizeLedgerNetwork(payload.network);
  const network =
    resolvedNetwork.kind === 'hedera'
      ? (resolvedNetwork.hederaNetwork ?? resolvedNetwork.canonical)
      : resolvedNetwork.canonical;
  const raw = await this.requestJson<JsonValue>('/auth/ledger/challenge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      accountId: payload.accountId,
      network,
    },
  });

  return this.parseWithSchema(
    raw,
    ledgerChallengeResponseSchema,
    'ledger challenge response',
  );
};

RegistryBrokerClient.prototype.verifyLedgerChallenge = async function (
  this: RegistryBrokerClient,
  payload: LedgerVerifyRequest,
): Promise<LedgerVerifyResponse> {
  const resolvedNetwork = canonicalizeLedgerNetwork(payload.network);
  const network =
    resolvedNetwork.kind === 'hedera'
      ? (resolvedNetwork.hederaNetwork ?? resolvedNetwork.canonical)
      : resolvedNetwork.canonical;
  const body: JsonObject = {
    challengeId: payload.challengeId,
    accountId: payload.accountId,
    network,
    signature: payload.signature,
  };

  if (payload.signatureKind) {
    body.signatureKind = payload.signatureKind;
  }
  if (payload.publicKey) {
    body.publicKey = payload.publicKey;
  }
  if (typeof payload.expiresInMinutes === 'number') {
    body.expiresInMinutes = payload.expiresInMinutes;
  }

  const raw = await this.requestJson<JsonValue>('/auth/ledger/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

  const result = this.parseWithSchema(
    raw,
    ledgerVerifyResponseSchema,
    'ledger verification response',
  );

  this.setLedgerApiKey(result.key);
  return result;
};

RegistryBrokerClient.prototype.authenticateWithLedger = async function (
  this: RegistryBrokerClient,
  options: LedgerAuthenticationOptions,
): Promise<LedgerVerifyResponse> {
  const challenge = await this.createLedgerChallenge({
    accountId: options.accountId,
    network: options.network,
  });
  const signed = await resolveLedgerAuthSignature(challenge.message, options);
  const verification = await this.verifyLedgerChallenge({
    challengeId: challenge.challengeId,
    accountId: options.accountId,
    network: options.network,
    signature: signed.signature,
    signatureKind: signed.signatureKind,
    publicKey: signed.publicKey,
    expiresInMinutes: options.expiresInMinutes,
  });
  return verification;
};

RegistryBrokerClient.prototype.authenticateWithLedgerCredentials =
  async function (
    this: RegistryBrokerClient,
    options: LedgerCredentialAuthOptions,
  ): Promise<LedgerVerifyResponse> {
    const {
      accountId,
      network,
      signer,
      sign,
      hederaPrivateKey,
      evmPrivateKey,
      expiresInMinutes,
      setAccountHeader = true,
      label,
      logger,
    } = options;

    const resolvedNetwork = canonicalizeLedgerNetwork(network);
    const labelSuffix = label ? ` for ${label}` : '';

    const networkPayload = resolvedNetwork.canonical;

    const authOptions: LedgerAuthenticationOptions = {
      accountId,
      network: networkPayload,
      expiresInMinutes,
    };

    if (sign) {
      authOptions.sign = sign;
    } else if (signer) {
      authOptions.signer = signer;
    } else if (hederaPrivateKey) {
      if (resolvedNetwork.kind !== 'hedera' || !resolvedNetwork.hederaNetwork) {
        throw new Error(
          'hederaPrivateKey can only be used with hedera:mainnet or hedera:testnet networks.',
        );
      }
      authOptions.signer = createPrivateKeySigner({
        accountId,
        privateKey: hederaPrivateKey,
        network: resolvedNetwork.hederaNetwork,
      });
    } else if (evmPrivateKey) {
      if (resolvedNetwork.kind !== 'evm') {
        throw new Error(
          'evmPrivateKey can only be used with CAIP-2 EVM networks (eip155:<chainId>).',
        );
      }
      const formattedKey = evmPrivateKey.startsWith('0x')
        ? (evmPrivateKey as `0x${string}`)
        : (`0x${evmPrivateKey}` as `0x${string}`);
      const account = await loadViemAccount(formattedKey);
      authOptions.sign = async message => ({
        signature: await account.signMessage({ message }),
        signatureKind: 'evm',
        publicKey: account.publicKey,
      });
    } else {
      throw new Error(
        'Provide a signer, sign function, hederaPrivateKey, or evmPrivateKey to authenticate with the ledger.',
      );
    }

    logger?.info?.(
      `Authenticating ledger account ${accountId} (${resolvedNetwork.canonical})${labelSuffix}...`,
    );
    const verification = await this.authenticateWithLedger(authOptions);
    if (setAccountHeader) {
      this.setDefaultHeader('x-account-id', verification.accountId);
    }
    logger?.info?.(
      `Ledger authentication complete${labelSuffix}. Issued key prefix: ${verification.apiKey.prefix}…${verification.apiKey.lastFour}`,
    );
    return verification;
  };
