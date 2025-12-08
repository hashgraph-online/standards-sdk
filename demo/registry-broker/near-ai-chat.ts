import 'dotenv/config';
import { RegistryBrokerClient } from '../../src/services/registry-broker';

const baseUrl =
  process.env.REGISTRY_BROKER_BASE_URL?.trim() ||
  'https://hol.org/registry/api/v1';

const run = async (): Promise<void> => {
  const registryApiKey = process.env.REGISTRY_BROKER_API_KEY?.trim();
  const client = new RegistryBrokerClient({
    baseUrl,
    apiKey: registryApiKey,
  });

  const modelId =
    process.env.NEAR_AI_MODEL_ID?.trim() || 'deepseek-ai/DeepSeek-V3.1';

  const searchResult = await client.search({
    q: modelId,
    registries: ['near-ai'],
    limit: 1,
  });

  if (searchResult.hits.length === 0) {
    throw new Error(
      `Unable to locate NEAR model "${modelId}" in the registry.`,
    );
  }

  const { uaid } = searchResult.hits[0];
  console.log('Using UAID discovered via search:', uaid);

  const session = await client.chat.createSession({
    uaid,
    historyTtlSeconds: 900,
  });
  console.log('Session created:', session.sessionId);

  const prompt =
    'Summarize how NEAR AI Cloud keeps inference private. Respond with JSON containing "summary" and "tee" keys.';
  const response = await client.chat.sendMessage({
    sessionId: session.sessionId,
    uaid,
    message: prompt,
  });

  console.log('Chat response message:', response.message);
  console.log('Remaining history entries:', response.history.length);
};

run().catch(error => {
  console.error('Demo failed:', error);
  process.exit(1);
});
