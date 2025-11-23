import 'dotenv/config';
import { Client, TopicCreateTransaction } from '@hashgraph/sdk';
import {
  HCS21Client,
  Logger,
  NetworkType,
  PackageMetadataRecord,
} from '../../src';
import { sleep } from '../../src/utils/sleep';

const logger = new Logger({ module: 'hcs-21-demo', level: 'info' });

async function main(): Promise<void> {
  const network = (process.env.HEDERA_NETWORK as NetworkType) || 'testnet';
  const networkPrefix =
    network === 'mainnet'
      ? 'MAINNET_'
      : network === 'testnet'
        ? 'TESTNET_'
        : '';

  const scopedAccount = networkPrefix
    ? process.env[`${networkPrefix}HEDERA_ACCOUNT_ID`]
    : undefined;
  const scopedKey = networkPrefix
    ? process.env[`${networkPrefix}HEDERA_PRIVATE_KEY`]
    : undefined;

  const operatorId =
    scopedAccount ||
    process.env.HEDERA_OPERATOR_ID ||
    process.env.HEDERA_ACCOUNT_ID;
  const operatorKey =
    scopedKey ||
    process.env.HEDERA_OPERATOR_KEY ||
    process.env.HEDERA_PRIVATE_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error('Missing HEDERA_OPERATOR_ID/HEDERA_OPERATOR_KEY');
  }

  const client = new HCS21Client({
    network,
    operatorId,
    operatorKey,
    logLevel: 'info',
  });

  const hederaClient =
    network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  hederaClient.setOperator(operatorId, operatorKey);

  let packageTopicId = process.env.HCS21_PACKAGE_TOPIC_ID;

  if (!packageTopicId) {
    logger.info('Creating HCS-2 package topic');
    const packageTopicTx = await new TopicCreateTransaction()
      .setTopicMemo('hcs-2:0:3600:0')
      .execute(hederaClient);
    const packageTopicReceipt = await packageTopicTx.getReceipt(hederaClient);
    if (!packageTopicReceipt.topicId) {
      throw new Error('Failed to create package topic');
    }
    packageTopicId = packageTopicReceipt.topicId.toString();
    logger.info('Package topic ready', { packageTopicId });
  }

  let metadataPointer = process.env.HCS21_METADATA_POINTER;

  const packageName = 'Standards SDK Package';
  const packageDescription =
    'Demo package declaration showcasing HCS-21 register + update operations.';
  const packageAuthor = 'Kantorcodes';
  const packageTags = ['demo', 'registry', 'hcs-21'];

  if (metadataPointer) {
    logger.info('Using metadata pointer from environment', {
      pointer: metadataPointer,
    });
  } else {
    logger.info('Inscribing package metadata via HCS-1');
    const metadataRecord: PackageMetadataRecord = {
      schema: 'hcs-21/metadata@1.0',
      description: packageDescription,
      website: 'https://hashgraph.online',
      docs: 'https://hashgraph.online/docs/libraries/standards-sdk/',
      source: 'https://github.com/hashgraph-online/standards-sdk',
      support: 'https://discord.gg/hashgraphonline',
      maintainers: [packageAuthor],
      tags: packageTags,
      dependencies: {
        '@hashgraph/sdk': '^2.77.0',
      },
      t_id: packageTopicId,
      artifacts: [
        {
          type: 'bundle',
          url: 'https://registry.npmjs.org/@hashgraphonline/standards-sdk/-/standards-sdk-latest.tgz',
          digest: 'sha256-demo',
        },
      ],
    };
    const metadataResult = await client.inscribeMetadata({
      metadata: metadataRecord,
    });
    metadataPointer = metadataResult.pointer;
    logger.info('Metadata pointer ready', metadataResult);
  }

  if (!metadataPointer) {
    throw new Error('Failed to resolve metadata pointer');
  }

  logger.info('Creating HCS-21 registry topic');
  const topicId = await client.createRegistryTopic({ ttl: 120 });
  logger.info('Registry topic ready', { topicId });

  logger.info('Publishing package declaration');
  const result = await client.publishDeclaration({
    topicId,
    declaration: {
      op: 'register',
      registry: 'npm',
      t_id: packageTopicId,
      name: packageName,
      description: packageDescription,
      author: packageAuthor,
      tags: packageTags,
      metadata: metadataPointer,
    },
  });
  logger.info('Declaration submitted', result);

  await sleep(3000);

  const declarations = await client.fetchDeclarations(topicId, {
    limit: 1,
    order: 'desc',
  });

  if (!declarations.length) {
    throw new Error('No declarations returned from mirror node');
  }

  logger.info('Latest declaration', declarations[0]);
  setImmediate(() => process.exit(0));
}

main().catch(error => {
  logger.error('HCS-21 demo failed', error as Error);
  process.exit(1);
});
