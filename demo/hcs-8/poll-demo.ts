import 'dotenv/config';
import { Hcs8Client } from '../../src/hcs-8';
import { PollMetadata } from '../../src/hcs-9';

async function main() {
  const operatorId = process.env.ACCOUNT_ID;
  const operatorKey = process.env.PRIVATE_KEY;
  if (!operatorId || !operatorKey) {
    throw new Error('ACCOUNT_ID and PRIVATE_KEY must be set in the environment.');
  }

  const client = new Hcs8Client({
    network: 'testnet',
    operatorId,
    operatorKey,
    logLevel: 'info',
  });

  const metadata: PollMetadata = {
    schema: 'hcs-9',
    title: 'HCS-8 Demo Poll',
    description: 'Choose the focus for the next SDK milestone.',
    author: operatorId,
    votingRules: {
      schema: 'hcs-9',
      allocations: [{ schema: 'hcs-9:equal-weight', weight: 1 }],
      permissions: [{ schema: 'hcs-9:allow-all' }],
      rules: [{ name: 'allowVoteChanges' }],
    },
    permissionsRules: [{ schema: 'hcs-9:allow-all' }],
    manageRules: {
      schema: 'hcs-9',
      permissions: [{ schema: 'hcs-9:allow-author' }],
    },
    updateRules: {
      schema: 'hcs-9',
      permissions: [{ schema: 'hcs-9:allow-author' }],
      updateSettings: { endDate: true },
    },
    options: [
      { schema: 'hcs-9', id: 0, title: 'Developer Tooling' },
      { schema: 'hcs-9', id: 1, title: 'Network Integrations' },
    ],
    status: 'inactive',
    startDate: `${Math.floor(Date.now() / 1000)}`,
    endConditionRules: [
      { schema: 'hcs-9:end-date', endDate: `${Math.floor(Date.now() / 1000) + 86400}` },
    ],
  };

  try {
    console.log('Creating poll topic...');
    const { topicId } = await client.createPollTopic();
    console.log(`Topic created: ${topicId}`);

    console.log('Submitting register message...');
    await client.submitRegister(topicId, metadata, 'Register demo poll');

    console.log('Opening poll...');
    await client.submitManage(topicId, operatorId, 'open', 'Open poll for voting');

    console.log('Casting vote for option 0');
    await client.submitVote(topicId, operatorId, [
      { accountId: operatorId, optionId: 0, weight: 1 },
    ]);

    console.log('Closing poll...');
    await client.submitManage(topicId, operatorId, 'close', 'Poll concluded');

    console.log('Waiting for mirror node propagation...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('Fetching poll state from mirror node...');
    const state = await client.getPollState(topicId);
    console.log('Poll status:', state.status);
    console.log('Total vote weight:', state.results.totalWeight);
    for (const [optionId, weight] of state.results.optionWeight.entries()) {
      console.log(`Option ${optionId} weight: ${weight}`);
    }
  } finally {
    client.close();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
