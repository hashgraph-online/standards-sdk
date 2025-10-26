import { config as loadEnv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { HCS7Client } from '../../src/hcs-7/sdk';
import { HCS7ConfigType } from '../../src/hcs-7/types';
import { Logger } from '../../src/utils/logger';
import { NetworkType } from '../../src/utils/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '../../.env') });

const DEFAULT_CONTRACT =
  '0x1d67aaf7f7e8d806bbeba24c4dea24808e1158b8'.toLowerCase();
const DEFAULT_WASM_TOPIC_ID = '0.0.5269810';
const DEFAULT_TTL = 86_400;

const mintedAbi = {
  name: 'minted',
  inputs: [],
  outputs: [
    {
      name: '',
      type: 'uint64',
    },
  ],
  stateMutability: 'view',
  type: 'function',
} as const;

const remainingAbi = {
  name: 'tokensRemaining',
  inputs: [],
  outputs: [
    {
      name: 'tokensRemaining',
      type: 'uint256',
    },
  ],
  stateMutability: 'view',
  type: 'function',
} as const;

async function main() {
  const operatorId = process.env.HEDERA_ACCOUNT_ID;
  const operatorKey = process.env.HEDERA_PRIVATE_KEY;
  const network = (process.env.HEDERA_NETWORK as NetworkType) || 'testnet';

  if (!operatorId || !operatorKey) {
    throw new Error('Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env');
  }

  const logger = new Logger({
    module: 'HCS7Demo',
    level: 'info',
  });

  let client: HCS7Client | undefined;
  try {
    client = new HCS7Client({
      operatorId,
      operatorKey,
      network,
      logger,
    });

    console.log('Creating HCS-7 registry topic...');
    const registry = await client.createRegistry({
      ttl: DEFAULT_TTL,
      submitKey: true,
    });

    if (!registry.success || !registry.topicId) {
      throw new Error(`Failed to create registry: ${registry.error}`);
    }

    console.log(`Registry Topic ID: ${registry.topicId}`);
    console.log('Registering EVM configs...');

    await client.registerConfig({
      registryTopicId: registry.topicId,
      memo: 'LaunchPage Test Mint',
      config: {
        type: HCS7ConfigType.EVM,
        contractAddress: DEFAULT_CONTRACT,
        abi: mintedAbi,
      },
      transactionMemo: 'HCS-7 minted config',
    });

    await client.registerConfig({
      registryTopicId: registry.topicId,
      memo: 'LaunchPage Tokens Remaining',
      config: {
        type: HCS7ConfigType.EVM,
        contractAddress: DEFAULT_CONTRACT,
        abi: remainingAbi,
      },
      transactionMemo: 'HCS-7 remaining config',
    });

    console.log('Registering WASM config...');
    await client.registerConfig({
      registryTopicId: registry.topicId,
      memo: 'minted-and-remaining-router',
      config: {
        type: HCS7ConfigType.WASM,
        wasmTopicId: DEFAULT_WASM_TOPIC_ID,
        inputType: {
          stateData: {
            minted: 'number',
            tokensRemaining: 'number',
          },
        },
        outputType: {
          type: 'string',
          format: 'topic-id',
        },
      },
      transactionMemo: 'HCS-7 wasm config',
    });

    console.log('Registering metadata topics...');
    await client.registerMetadata({
      registryTopicId: registry.topicId,
      metadataTopicId: '0.0.3717738',
      memo: 'blue',
      weight: 1,
      tags: ['odd'],
      transactionMemo: 'HCS-7 odd metadata',
    });

    await client.registerMetadata({
      registryTopicId: registry.topicId,
      metadataTopicId: '0.0.3717746',
      memo: 'purple',
      weight: 1,
      tags: ['even'],
      transactionMemo: 'HCS-7 even metadata',
    });

    console.log('✅ Completed HCS-7 topic bootstrap.');
  } finally {
    client?.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Failed to run HCS-7 demo', error);
    process.exit(1);
  });
