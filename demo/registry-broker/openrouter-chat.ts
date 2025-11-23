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
    process.env.OPENROUTER_MODEL_ID?.trim() || 'anthropic/claude-3.5-sonnet';
  const registry = process.env.OPENROUTER_REGISTRY?.trim() || 'openrouter';

  const searchResult = await client.search({
    q: modelId,
    registries: [registry],
    limit: 1,
  });

  if (searchResult.hits.length === 0) {
    throw new Error(
      `Unable to locate model "${modelId}" in registry "${registry}".`,
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
    'Respond with a short JSON object summarizing your capabilities (keys: "summary", "pricing").';
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
