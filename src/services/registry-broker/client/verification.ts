import type {
  JsonValue,
  MoltbookOwnerRegistrationUpdateRequest,
  MoltbookOwnerRegistrationUpdateResponse,
  RegisterStatusResponse,
  VerificationChallengeDetailsResponse,
  VerificationChallengeResponse,
  VerificationOwnershipResponse,
  VerificationStatusResponse,
  VerificationVerifyResponse,
  VerificationVerifySenderResponse,
} from '../types';
import {
  moltbookOwnerRegistrationUpdateResponseSchema,
  registerStatusResponseSchema,
  verificationChallengeDetailsResponseSchema,
  verificationChallengeResponseSchema,
  verificationOwnershipResponseSchema,
  verificationStatusResponseSchema,
  verificationVerifyResponseSchema,
  verificationVerifySenderResponseSchema,
} from '../schemas';
import type { RegistryBrokerClient } from './base-client';

export async function getVerificationStatus(
  client: RegistryBrokerClient,
  uaid: string,
): Promise<VerificationStatusResponse> {
  const raw = await client.requestJson<JsonValue>(
    `/verification/status/${encodeURIComponent(uaid)}`,
    { method: 'GET' },
  );
  return client.parseWithSchema(
    raw,
    verificationStatusResponseSchema,
    'verification status response',
  );
}

export async function createVerificationChallenge(
  client: RegistryBrokerClient,
  uaid: string,
): Promise<VerificationChallengeResponse> {
  const raw = await client.requestJson<JsonValue>('/verification/challenge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { uaid },
  });
  return client.parseWithSchema(
    raw,
    verificationChallengeResponseSchema,
    'verification challenge response',
  );
}

export async function getVerificationChallenge(
  client: RegistryBrokerClient,
  challengeId: string,
): Promise<VerificationChallengeDetailsResponse> {
  const raw = await client.requestJson<JsonValue>(
    `/verification/challenge/${encodeURIComponent(challengeId)}`,
    { method: 'GET' },
  );
  return client.parseWithSchema(
    raw,
    verificationChallengeDetailsResponseSchema,
    'verification challenge details response',
  );
}

export async function verifyVerificationChallenge(
  client: RegistryBrokerClient,
  params: { challengeId: string; method?: 'moltbook-post' | string },
): Promise<VerificationVerifyResponse> {
  const raw = await client.requestJson<JsonValue>('/verification/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      challengeId: params.challengeId,
      method: params.method ?? 'moltbook-post',
    },
  });
  return client.parseWithSchema(
    raw,
    verificationVerifyResponseSchema,
    'verification verify response',
  );
}

export async function getVerificationOwnership(
  client: RegistryBrokerClient,
  uaid: string,
): Promise<VerificationOwnershipResponse> {
  const raw = await client.requestJson<JsonValue>(
    `/verification/ownership/${encodeURIComponent(uaid)}`,
    { method: 'GET' },
  );
  return client.parseWithSchema(
    raw,
    verificationOwnershipResponseSchema,
    'verification ownership response',
  );
}

export async function verifySenderOwnership(
  client: RegistryBrokerClient,
  uaid: string,
): Promise<VerificationVerifySenderResponse> {
  const raw = await client.requestJson<JsonValue>(
    '/verification/verify-sender',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { uaid },
    },
  );
  return client.parseWithSchema(
    raw,
    verificationVerifySenderResponseSchema,
    'verification sender response',
  );
}

export async function getRegisterStatus(
  client: RegistryBrokerClient,
  uaid: string,
): Promise<RegisterStatusResponse> {
  const raw = await client.requestJson<JsonValue>(
    `/register/status/${encodeURIComponent(uaid)}`,
    { method: 'GET' },
  );
  return client.parseWithSchema(
    raw,
    registerStatusResponseSchema,
    'register status response',
  );
}

export async function registerOwnedMoltbookAgent(
  client: RegistryBrokerClient,
  uaid: string,
  request: MoltbookOwnerRegistrationUpdateRequest,
): Promise<MoltbookOwnerRegistrationUpdateResponse> {
  const raw = await client.requestJson<JsonValue>(
    `/register/${encodeURIComponent(uaid)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: {
        registered: request.registered ?? true,
        ...(request.name ? { name: request.name } : {}),
        ...(request.description ? { description: request.description } : {}),
        ...(request.endpoint ? { endpoint: request.endpoint } : {}),
        ...(request.metadata ? { metadata: request.metadata } : {}),
      },
    },
  );
  return client.parseWithSchema(
    raw,
    moltbookOwnerRegistrationUpdateResponseSchema,
    'moltbook owner registration update response',
  );
}
