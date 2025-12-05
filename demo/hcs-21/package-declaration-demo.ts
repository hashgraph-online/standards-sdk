import 'dotenv/config';
import { Client, TopicCreateTransaction } from '@hashgraph/sdk';
import {
  AdapterManifest,
  HCS21Client,
  HCS21TopicType,
  Logger,
  NetworkType,
} from '../../src';
import { sleep } from '../../src/utils/sleep';

const logger = new Logger({ module: 'hcs-21-demo', level: 'info' });

async function createTopic(client: Client, memo?: string): Promise<string> {
  const tx = new TopicCreateTransaction();
  if (memo) {
    tx.setTopicMemo(memo);
  }
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  if (!receipt.topicId) {
    throw new Error('Failed to create topic');
  }
  return receipt.topicId.toString();
}

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

  const floraAccount = process.env.HCS21_FLORA_ACCOUNT_ID || operatorId;
  const floraThreshold = process.env.HCS21_FLORA_THRESHOLD || '2-of-3';

  const consensusTopicId =
    process.env.HCS21_CONSENSUS_TOPIC_ID ||
    (await createTopic(hederaClient, 'hcs-16:ctopic'));
  const txTopicId =
    process.env.HCS21_THRESHOLD_TOPIC_ID ||
    (await createTopic(hederaClient, 'hcs-16:ttopic'));
  const stateTopicId =
    process.env.HCS21_STATE_TOPIC_ID ||
    (await createTopic(hederaClient, 'hcs-16:stopic'));

  const adapterId = 'npm/@hashgraphonline/x402-bazaar-adapter@1.0.0';
  const manifest: AdapterManifest = {
    meta: {
      spec_version: '1.0',
      adapter_version: '1.0.0',
      generated: new Date().toISOString(),
    },
    adapter: {
      name: 'X402 Bazaar Agent Adapter',
      id: adapterId,
      maintainers: [
        { name: 'Hashgraph Online', contact: 'ops@hashgraph.online' },
      ],
      license: 'Apache-2.0',
    },
    package: {
      registry: 'npm',
      dist_tag: 'stable',
      artifacts: [
        {
          url: 'npm://@hashgraphonline/x402-bazaar-adapter@1.0.0',
          digest: 'sha384-demo-digest',
          signature: 'demo-signature',
        },
      ],
    },
    runtime: {
      platforms: ['node>=20.10.0'],
      primary: 'node',
      entry: 'dist/index.js',
      dependencies: ['@hashgraphonline/standards-sdk@^1.8.0'],
      env: ['X402_API_KEY'],
    },
    capabilities: {
      discovery: true,
      communication: true,
      protocols: ['x402', 'uaid'],
  },
  consensus: {
    state_model: 'hcs-21.generic@1',
    profile_uri: 'ipfs://example-profile',
    entity_schema: 'hcs-21.entity-consensus@1',
    required_fields: ['entity_id', 'registry', 'state_hash', 'epoch'],
    hashing: 'sha384',
  },
};

  const manifestInscribeResult =
    process.env.HCS21_MANIFEST_POINTER || process.env.HCS21_MANIFEST_SEQUENCE
      ? {
          pointer: process.env.HCS21_MANIFEST_POINTER ?? '',
          manifestSequence: process.env.HCS21_MANIFEST_SEQUENCE
            ? Number(process.env.HCS21_MANIFEST_SEQUENCE)
            : undefined,
        }
      : await client.inscribeMetadata({
          document: manifest,
        });

  const manifestPointer = manifestInscribeResult.pointer;
  const manifestSequence = manifestInscribeResult.manifestSequence;

  const registryTopicId = await client.createRegistryTopic({
    ttl: 120,
    indexed: 0,
    type: HCS21TopicType.ADAPTER_REGISTRY,
  });

  logger.info('Manifest pointer ready', { manifestPointer });
  logger.info('Registry topic ready', { registryTopicId });

  const publishResult = await client.publishDeclaration({
    topicId: registryTopicId,
    declaration: {
      op: 'register',
      adapterId,
      entity: 'agent',
      adapterPackage: {
        registry: 'npm',
        name: '@hashgraphonline/x402-bazaar-adapter',
        version: '1.0.0',
        integrity: 'sha384-demo-digest',
      },
      manifest: manifestPointer,
      manifestSequence,
      config: {
        type: 'flora',
        account: floraAccount,
        threshold: floraThreshold,
        ctopic: consensusTopicId,
        ttopic: txTopicId,
        stopic: stateTopicId,
      },
      stateModel: 'hcs-21.entity-consensus@1',
    },
  });

  logger.info('Declaration submitted', publishResult);

  await sleep(3000);

  const declarations = await client.fetchDeclarations(registryTopicId, {
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
