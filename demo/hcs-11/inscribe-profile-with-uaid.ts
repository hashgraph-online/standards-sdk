/**
 * HCS-10 demo: create agent (topics + HCS-11 profile with UAID) using existing account.
 */

import 'dotenv/config';
import { HCS10Client } from '../../src/hcs-10/sdk';
import { AgentBuilder } from '../../src/hcs-11/agent-builder';
import { InboundTopicType, AIAgentCapability } from '../../src/hcs-11/types';

function required(name: string, value: string | undefined): string {
  if (!value || !value.trim())
    throw new Error(`${name} is required in environment`);
  return value.trim();
}

async function main(): Promise<void> {
  const networkEnv = required(
    'HEDERA_NETWORK',
    process.env.HEDERA_NETWORK || 'testnet',
  );
  const network = (networkEnv === 'mainnet' ? 'mainnet' : 'testnet') as
    | 'mainnet'
    | 'testnet';
  const operatorId = required(
    'HEDERA_ACCOUNT_ID',
    process.env.HEDERA_ACCOUNT_ID,
  );
  const privateKey = required(
    'HEDERA_PRIVATE_KEY',
    process.env.HEDERA_PRIVATE_KEY,
  );

  const hcs10 = new HCS10Client({
    network,
    operatorId,
    operatorPrivateKey: privateKey,
    logLevel: 'info',
  });

  const builder = new AgentBuilder()
    .setName('HCS-10 Demo Agent')
    .setAlias('hcs10-demo-agent')
    .setBio('Demo created via HCS-10 createAgent (with UAID attached)')
    .setCapabilities([AIAgentCapability.TEXT_GENERATION])
    .setType('autonomous')
    .setModel('demo-model')
    .setNetwork(network)
    .setInboundTopicType(InboundTopicType.PUBLIC)
    .setExistingAccount(operatorId, privateKey);

  const res = await hcs10.createAgent(builder);

  const output = {
    success: true,
    inboundTopicId: res.inboundTopicId,
    outboundTopicId: res.outboundTopicId,
    profileTopicId: res.profileTopicId,
    pfpTopicId: res.pfpTopicId,
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    process.stderr.write(
      `Error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
