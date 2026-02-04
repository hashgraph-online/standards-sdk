import 'dotenv/config';
import {
  RegistryBrokerClient,
  isPendingRegisterAgentResponse,
  type AgentRegistrationRequest,
} from '../../src/services/registry-broker';
import {
  ProfileType,
  AIAgentType,
  AIAgentCapability,
  type HCS11Profile,
} from '../../src/hcs-11/types';

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value.trim();
};

const baseUrl = process.env.REGISTRY_BROKER_BASE_URL?.trim();

const buildProfile = (alias: string): HCS11Profile => ({
  version: '1.0',
  type: ProfileType.AI_AGENT,
  display_name: alias,
  alias,
  bio: 'Demo agent registered via Registry Broker with Moltbook additional registry.',
  aiAgent: {
    type: AIAgentType.MANUAL,
    model: 'demo',
    creator: 'standards-sdk demo',
    capabilities: [AIAgentCapability.TEXT_GENERATION],
  },
});

const main = async (): Promise<void> => {
  const client = new RegistryBrokerClient({
    baseUrl,
    apiKey: requireEnv('REGISTRY_BROKER_API_KEY'),
  });

  const suffix = `${Date.now()}`;
  const alias = `moltbook-demo-${suffix}`;

  const payload: AgentRegistrationRequest = {
    profile: buildProfile(alias),
    registry: 'hashgraph-online',
    communicationProtocol: 'hcs-10',
    endpoint: requireEnv('REGISTRY_BROKER_DEMO_AGENT_ENDPOINT'),
    additionalRegistries: ['moltbook'],
  };

  const response = await client.registerAgent(payload);
  console.log('status:', response.status);
  console.log('uaid:', response.uaid);
  console.log('agentId:', response.agentId);

  const secrets = response.additionalRegistrySecrets?.['moltbook:main'];
  if (!secrets || typeof secrets !== 'object') {
    console.log('No Moltbook claim details returned.');
    return;
  }

  const claimUrl =
    typeof (secrets as { claimUrl?: unknown }).claimUrl === 'string'
      ? (secrets as { claimUrl: string }).claimUrl
      : null;
  const verificationCode =
    typeof (secrets as { verificationCode?: unknown }).verificationCode ===
    'string'
      ? (secrets as { verificationCode: string }).verificationCode
      : null;
  const tweetTemplate =
    typeof (secrets as { tweetTemplate?: unknown }).tweetTemplate === 'string'
      ? (secrets as { tweetTemplate: string }).tweetTemplate
      : null;

  if (isPendingRegisterAgentResponse(response)) {
    console.log(
      'Registration is pending; additional registries may still be processing.',
    );
  }

  console.log('--- Moltbook claim required ---');
  if (claimUrl) {
    console.log('Claim URL:', claimUrl);
  }
  if (verificationCode) {
    console.log('Verification code:', verificationCode);
  }
  if (tweetTemplate) {
    console.log('Tweet template:\n', tweetTemplate);
  }
  console.log(
    'Human owner must complete the claim tweet for Moltbook to mark the agent as claimed.',
  );
};

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
