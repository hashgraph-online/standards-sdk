import 'dotenv/config';
import {
  RegistryBrokerClient,
  type SearchResult,
} from '../../src/services/registry-broker';

type MoltbookAgentMeResponse = {
  agent?: { name?: string };
  error?: string;
};

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value.trim();
};

const sleep = async (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

const MOLTBOOK_API_BASE = 'https://www.moltbook.com/api/v1';
const DEFAULT_VERIFICATION_THREAD_ID = '19832203-36d9-439e-8583-ba3a7b5cbd78';

const fetchMoltbookAgentHandle = async (apiKey: string): Promise<string> => {
  const response = await fetch(`${MOLTBOOK_API_BASE}/agents/me`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const payload = (await response.json()) as MoltbookAgentMeResponse;
  const name = payload?.agent?.name?.trim() ?? '';
  if (!response.ok || !name) {
    const errorMessage = payload?.error ?? `HTTP ${response.status}`;
    throw new Error(
      `Unable to resolve Moltbook agent handle via /agents/me (${errorMessage}). If this key is unclaimed, claim it first or provide MOLTBOOK_AGENT_HANDLE.`,
    );
  }
  return name;
};

const findMoltbookUaidByHandle = async (
  client: RegistryBrokerClient,
  handle: string,
): Promise<string> => {
  const result: SearchResult = await client.search({
    q: handle,
    registries: ['moltbook'],
    limit: 10,
  });
  const normalized = handle.trim().toLowerCase();
  const match = result.hits.find(hit => hit.name?.toLowerCase() === normalized);
  if (!match?.uaid) {
    throw new Error(
      `Unable to resolve UAID for Moltbook handle "${handle}" via broker search.`,
    );
  }
  return match.uaid;
};

const postVerificationComment = async (params: {
  moltbookApiKey: string;
  threadId: string;
  handle: string;
  uaid: string;
  code: string;
}): Promise<void> => {
  const { moltbookApiKey, threadId, handle, uaid, code } = params;
  const response = await fetch(
    `${MOLTBOOK_API_BASE}/posts/${threadId}/comments`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${moltbookApiKey}`,
      },
      body: JSON.stringify({
        content: `Verification: ${code}\nAgent: ${handle}\nUAID: ${uaid}`,
      }),
    },
  );

  const payload = (await response.json()) as { error?: string };
  if (!response.ok || payload.error) {
    throw new Error(
      payload.error ??
        `Failed to create verification comment (HTTP ${response.status})`,
    );
  }
};

const verifyWithRetries = async (
  client: RegistryBrokerClient,
  challengeId: string,
  timeoutMs: number,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let lastError: string | null = null;

  while (Date.now() < deadline) {
    try {
      const verified = await client.verifyVerificationChallenge({
        challengeId,
        method: 'moltbook-post',
      });
      if (verified.verified) {
        return;
      }
      lastError = 'Verification returned verified=false';
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(2500);
  }

  throw new Error(lastError ?? 'Verification did not complete before timeout');
};

const main = async (): Promise<void> => {
  const baseUrl = process.env.REGISTRY_BROKER_BASE_URL?.trim();
  const brokerApiKey = requireEnv('REGISTRY_BROKER_API_KEY');

  const client = new RegistryBrokerClient({
    baseUrl,
    apiKey: brokerApiKey,
  });

  const moltbookApiKey = process.env.MOLTBOOK_API_KEY?.trim() ?? '';
  const handleFromEnv = process.env.MOLTBOOK_AGENT_HANDLE?.trim() ?? '';
  if (!handleFromEnv && !moltbookApiKey) {
    throw new Error(
      'Set MOLTBOOK_AGENT_HANDLE or MOLTBOOK_API_KEY to identify the Moltbook agent to verify.',
    );
  }
  const handle =
    handleFromEnv.length > 0
      ? handleFromEnv
      : await fetchMoltbookAgentHandle(moltbookApiKey);

  const uaid = await findMoltbookUaidByHandle(client, handle);

  console.log('Moltbook handle:', handle);
  console.log('Resolved UAID:', uaid);

  const statusBefore = await client.getVerificationStatus(uaid);
  console.log('Verified (before):', statusBefore.verified);

  const challenge = await client.createVerificationChallenge(uaid);
  console.log('Challenge:', challenge.challengeId);
  console.log('Expected handle:', challenge.expectedHandle);
  console.log('Expires at:', challenge.expiresAt);

  const threadId =
    process.env.MOLTBOOK_VERIFICATION_THREAD_ID?.trim() ||
    DEFAULT_VERIFICATION_THREAD_ID;

  if (!moltbookApiKey) {
    console.log('\nNo MOLTBOOK_API_KEY provided; cannot automate posting.');
    console.log(
      'Post this code from the Moltbook agent handle shown above, then verify:',
    );
    console.log(`  code: ${challenge.code}`);
    console.log(`  instructions: ${challenge.instructions}`);
    return;
  }

  console.log('\nPosting verification comment on m/hol-verification...');
  await postVerificationComment({
    moltbookApiKey,
    threadId,
    handle,
    uaid,
    code: challenge.code,
  });

  console.log('Verifying with broker (polling up to 90s)...');
  await verifyWithRetries(client, challenge.challengeId, 90_000);

  const statusAfter = await client.getVerificationStatus(uaid);
  console.log('Verified (after):', statusAfter.verified);

  console.log('\nMarking agent as broker-registered (directory benefits)...');
  const update = await client.registerOwnedMoltbookAgent(uaid, {
    registered: true,
    description: `Registered via standards-sdk demo ${new Date().toISOString()}`,
  });
  console.log('Registered:', update.registered);
  console.log('Registered at:', update.registeredAt ?? '(missing)');

  const registeredStatus = await client.getRegisterStatus(uaid);
  console.log(
    'Broker register/status registered:',
    registeredStatus.registered,
  );
};

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
