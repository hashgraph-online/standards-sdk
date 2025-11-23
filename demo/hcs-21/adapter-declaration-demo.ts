import 'dotenv/config';
import { HCS21Client, Logger, NetworkType } from '../../src';
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

  let metadataPointer = process.env.HCS21_METADATA_POINTER;

  if (metadataPointer) {
    logger.info('Using metadata pointer from environment', {
      pointer: metadataPointer,
    });
  } else {
    logger.info('Inscribing adapter metadata via HCS-1');
    const metadataRecord = {
      name: 'Standards SDK Adapter',
      pkg: '@hashgraphonline/standards-sdk@latest',
      registry: 'npm',
      kind: 'web2' as const,
      description:
        'Demo adapter declaration showcasing HCS-21 register + update operations.',
      website: 'https://hashgraph.online',
      source: 'https://github.com/hashgraph-online/standards-sdk',
      tags: ['demo', 'registry-broker', 'hcs-21'],
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

  logger.info('Publishing adapter declaration');
  const result = await client.publishDeclaration({
    topicId,
    declaration: {
      op: 'register',
      registry: 'npm',
      pkg: '@hashgraphonline/standards-sdk@latest',
      name: 'Standards SDK Adapter',
      kind: 'web2',
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
