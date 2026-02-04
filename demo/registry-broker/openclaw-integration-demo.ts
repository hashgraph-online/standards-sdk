/**
 * OpenClaw + Registry Broker Integration Demo
 *
 * This demo shows how OpenClaw agents can:
 * 1. Register themselves in the universal agent registry
 * 2. Discover other agents
 * 3. Chat with other agents
 *
 * For OpenClaw agents, add this skill:
 *   Read https://hol.org/registry/skill.md and follow the instructions
 *
 * @see https://hol.org/registry
 * @see https://openclaw.ai
 */

import 'dotenv/config';
import {
  RegistryBrokerClient,
  isSuccessRegisterAgentResponse,
  isPendingRegisterAgentResponse,
} from '../../src/services/registry-broker';
import { AIAgentCapability, AIAgentType } from '../../src/hcs-11/types';

const BASE_URL =
  process.env.REGISTRY_BROKER_BASE_URL ?? 'https://hol.org/registry/api/v1';

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('OpenClaw + Registry Broker Integration Demo');
  console.log('='.repeat(60));

  const client = new RegistryBrokerClient({
    baseUrl: BASE_URL,
  });

  /**
   * Step 1: Discover existing agents
   */
  console.log('\n--- Step 1: Discover Agents ---\n');

  const searchResult = await client.search({
    q: 'code generation',
    type: 'ai-agents',
    online: true,
    limit: 5,
  });

  console.log(`Found ${searchResult.total} agents matching "code generation"`);
  console.log('\nTop 5 results:');

  for (const hit of searchResult.hits) {
    console.log(`  - ${hit.name ?? hit.uaid}`);
    console.log(`    UAID: ${hit.uaid}`);
    console.log(`    Trust: ${hit.trustScore ?? 'N/A'}`);
    console.log(`    Status: ${hit.availabilityStatus ?? 'unknown'}`);
    console.log();
  }

  /**
   * Step 2: Register an agent (if credentials are provided)
   */
  console.log('\n--- Step 2: Register Your Agent ---\n');

  const agentName =
    process.env.OPENCLAW_AGENT_NAME ?? `OpenClaw-Demo-${Date.now()}`;

  console.log(`Registering agent: ${agentName}`);

  const profile = {
    version: '1.0',
    type: 1,
    display_name: agentName,
    bio: 'An OpenClaw agent demonstrating Registry Broker integration',
    capabilities: [
      AIAgentCapability.TEXT_GENERATION,
      AIAgentCapability.WORKFLOW_AUTOMATION,
    ],
    ai_agent_type: AIAgentType.AUTONOMOUS,
    properties: [{ framework: 'openclaw' }],
    tags: ['openclaw', 'demo', 'automation'],
  };

  try {
    const registrationResult = await client.registerAgent({
      profile,
      protocol: 'a2a',
      metadata: {
        adapter: 'a2a',
        category: 'ai-agent',
        customFields: {
          framework: 'openclaw',
        },
      },
    });

    if (isSuccessRegisterAgentResponse(registrationResult)) {
      console.log('Registration successful!');
      console.log(`  UAID: ${registrationResult.uaid}`);
      console.log(
        `  Inbound Topic: ${registrationResult.inboundTopicId ?? 'N/A'}`,
      );

      /**
       * Step 3: Chat with another agent
       */
      if (searchResult.hits.length > 0) {
        console.log('\n--- Step 3: Start a Chat ---\n');

        const targetAgent = searchResult.hits[0];
        console.log(
          `Starting chat with: ${targetAgent.name ?? targetAgent.uaid}`,
        );

        try {
          const conversation = await client.startConversation({
            uaid: targetAgent.uaid,
            senderUaid: registrationResult.uaid,
            encryption: { preference: 'preferred' },
          });

          console.log(`Chat session created: ${conversation.sessionId}`);
          console.log(`Encryption mode: ${conversation.mode}`);

          console.log('\nSending message...');
          const sendResult = await conversation.send({
            plaintext: 'Hello from OpenClaw! This is a test message.',
          });

          console.log(`Message sent! ID: ${sendResult.messageId ?? 'N/A'}`);

          console.log('\nFetching chat history...');
          const history = await conversation.fetchHistory();
          console.log(`History contains ${history.length} message(s)`);

          for (const entry of history) {
            console.log(
              `  [${entry.entry.sender}]: ${entry.plaintext ?? entry.entry.content}`,
            );
          }
        } catch (chatError) {
          console.log(
            `Chat failed (expected for demo): ${chatError instanceof Error ? chatError.message : String(chatError)}`,
          );
        }
      }
    } else if (isPendingRegisterAgentResponse(registrationResult)) {
      console.log('Registration pending...');
      console.log(`  Attempt ID: ${registrationResult.attemptId}`);
    } else {
      console.log('Registration partial:', registrationResult.status);
    }
  } catch (error) {
    console.log(
      `Registration requires credits. Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.log('\nTo register agents, you need Registry Broker credits.');
    console.log('Visit https://hol.org/registry to learn more.');
  }

  /**
   * Step 4: Resolve a specific agent
   */
  console.log('\n--- Step 4: Resolve Agent Details ---\n');

  if (searchResult.hits.length > 0) {
    const targetUaid = searchResult.hits[0].uaid;
    console.log(`Resolving: ${targetUaid}`);

    try {
      const resolved = await client.resolveUaid(targetUaid);

      if (resolved.agent) {
        console.log(`  Name: ${resolved.agent.name}`);
        console.log(`  Description: ${resolved.agent.description ?? 'N/A'}`);
        console.log(`  Trust Score: ${resolved.agent.trustScore ?? 'N/A'}`);
        console.log(
          `  Capabilities: ${resolved.agent.capabilities?.join(', ') ?? 'N/A'}`,
        );
        console.log(`  Registry: ${resolved.agent.registry}`);
      }
    } catch (resolveError) {
      console.log(
        `Resolve failed: ${resolveError instanceof Error ? resolveError.message : String(resolveError)}`,
      );
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Demo complete!');
  console.log('='.repeat(60));
}

main().catch(error => {
  console.error('Demo failed:', error);
  process.exit(1);
});
