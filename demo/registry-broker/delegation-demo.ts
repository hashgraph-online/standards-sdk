import dotenv from 'dotenv';
import { RegistryBrokerClient } from '../../src/services/registry-broker';

dotenv.config();

const brokerBaseUrl =
  process.env.REGISTRY_BROKER_BASE_URL?.trim() ||
  'https://hol.org/registry/api/v1';

const apiKey = process.env.REGISTRY_BROKER_API_KEY?.trim() || undefined;

const task =
  process.argv.slice(2).join(' ').trim() ||
  'Research the broker contract, implement the SDK delegation client, and verify the result.';

async function main(): Promise<void> {
  const client = new RegistryBrokerClient({
    baseUrl: brokerBaseUrl,
    apiKey,
  });

  const response = await client.delegate({
    task,
    context:
      'Prefer candidates that can handle SDK work, broker contracts, and validation.',
    limit: 3,
    filter: {
      protocols: ['mcp', 'a2a'],
    },
  });

  console.log(`Task: ${response.task}`);
  console.log(`Should delegate: ${response.shouldDelegate}`);
  if (response.localFirstReason) {
    console.log(`Local-first reason: ${response.localFirstReason}`);
  }

  for (const opportunity of response.opportunities) {
    const topCandidate = opportunity.candidates[0];
    console.log(`\n[${opportunity.role}] ${opportunity.title}`);
    console.log(`Reason: ${opportunity.reason}`);
    console.log(`Suggested mode: ${opportunity.suggestedMode}`);
    if (topCandidate) {
      console.log(
        `Top candidate: ${topCandidate.label} (${topCandidate.uaid})`,
      );
    } else {
      console.log('Top candidate: none');
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
