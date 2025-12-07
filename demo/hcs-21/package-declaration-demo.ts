import 'dotenv/config';
import { createHash } from 'crypto';
import { PrivateKey } from '@hashgraph/sdk';
import {
  AdapterManifest,
  HCS21Client,
  HCS21TopicType,
  HRLResolver,
  Logger,
  NetworkType,
  canonicalize,
  verifyArtifactDigest,
  verifyDeclarationSignature,
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

  const artifactBytes = Buffer.from('demo adapter tarball contents');
  const artifactDigestHex = createHash('sha384')
    .update(artifactBytes)
    .digest('hex');
  const artifactIntegrity = `sha384-${artifactDigestHex}`;

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
          digest: artifactIntegrity,
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
      discovery_tags: ['agents', 'marketplaces'],
      communication_channels: ['text', 'x402'],
      extras: {
        locales: ['en', 'es'],
        rate_limit: { requests_per_minute: 120 },
      },
    },
    consensus: {
      state_model: 'hcs-21.generic@1',
      profile_uri: 'ipfs://example-profile',
      entity_schema: 'hcs-21.entity-consensus@1',
      required_fields: ['entity_id', 'registry', 'state_hash', 'epoch'],
      hashing: 'sha384',
    },
  };

  const registryMetadata = {
    version: '1.0.0',
    name: 'Demo Adapter Registry',
    description: 'Sample registry showcasing layered HCS-21 discovery.',
    operator: { account: operatorId },
    entityTypes: ['agent'],
    categories: ['price-feeds'],
  };

  const registryMetadataPointer = await client.inscribeMetadata({
    document: registryMetadata,
  });

  const declarationTopicId =
    process.env.HCS21_REGISTRY_TOPIC_ID ||
    (await client.createRegistryTopic({
      ttl: 3600,
      indexed: 0,
      type: HCS21TopicType.ADAPTER_REGISTRY,
      metaTopicId: registryMetadataPointer.pointer,
    }));

  const versionPointerTopicId =
    process.env.HCS21_VERSION_POINTER_TOPIC_ID ||
    (await client.createAdapterVersionPointerTopic({
      ttl: 3600,
      memoOverride: 'hcs-2:1:3600',
    }));

  const registryOfRegistriesTopicId =
    process.env.HCS21_ROR_TOPIC_ID ||
    (await client.createRegistryDiscoveryTopic({
      ttl: 86400,
      memoOverride: 'hcs-21:0:86400:1',
    }));

  const categoryTopicId =
    process.env.HCS21_CATEGORY_TOPIC_ID ||
    (await client.createAdapterCategoryTopic({
      ttl: 86400,
      indexed: 0,
      metaTopicId: registryMetadataPointer.pointer,
    }));

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

  if (!manifestPointer) {
    throw new Error('Manifest pointer is required');
  }

  await client.registerCategoryTopic({
    discoveryTopicId: registryOfRegistriesTopicId,
    categoryTopicId,
    metadata: registryMetadataPointer.pointer,
    memo: 'adapter-registry:demo',
  });

  await client.publishCategoryEntry({
    categoryTopicId,
    adapterId,
    versionTopicId: versionPointerTopicId,
    memo: `adapter:${adapterId}`,
  });

  await client.publishVersionPointer({
    versionTopicId: versionPointerTopicId,
    declarationTopicId,
    memo: `adapter:${adapterId}`,
  });

  logger.info('Layered registry created', {
    registryOfRegistriesTopicId,
    categoryTopicId,
    versionPointerTopicId,
    declarationTopicId,
  });

  await sleep(5000);

  const resolver = new HRLResolver('info');

  const categoryEntries = await client.fetchCategoryEntries(categoryTopicId);
  const categoryMatch = categoryEntries.find(
    (entry) => entry.adapterId === adapterId,
  );
  if (!categoryMatch) {
    throw new Error('Category entry not found for adapter');
  }
  const versionResolution = await client.resolveVersionPointer(
    versionPointerTopicId,
  );
  if (versionResolution.declarationTopicId !== declarationTopicId) {
    throw new Error('Version pointer mismatch');
  }

  const baseDeclaration = client.buildDeclaration({
    op: 'register',
    adapterId,
    entity: 'agent',
    adapterPackage: {
      registry: 'npm',
      name: '@hashgraphonline/x402-bazaar-adapter',
      version: '1.0.0',
      integrity: artifactIntegrity,
    },
    manifest: manifestPointer,
    manifestSequence,
    config: {
      type: 'custom',
      network,
      registry_topic: declarationTopicId,
    },
    stateModel: 'hcs-21.generic@1',
  });

  const canonicalUnsigned = canonicalize({
    ...baseDeclaration,
    signature: undefined,
  });
  const publisherKey = PrivateKey.fromString(operatorKey);
  const signature = Buffer.from(
    publisherKey.sign(Buffer.from(canonicalUnsigned, 'utf8')),
  ).toString('base64');

  baseDeclaration.signature = signature;

  const publishResult = await client.publishDeclaration({
    topicId: versionResolution.declarationTopicId,
    declaration: baseDeclaration,
  });

  logger.info('Declaration submitted', publishResult);

  await sleep(3000);

  const declarations = await client.fetchDeclarations(declarationTopicId, {
    limit: 1,
    order: 'desc',
  });

  if (!declarations.length) {
    throw new Error('No declarations returned from mirror node');
  }

  const latest = declarations[0].declaration;
  const signatureValid = verifyDeclarationSignature(
    latest,
    publisherKey.publicKey.toString(),
  );
  if (!signatureValid) {
    throw new Error('Declaration signature invalid');
  }

  const digestValid = verifyArtifactDigest(artifactBytes, artifactIntegrity);
  if (!digestValid) {
    throw new Error('Artifact digest mismatch');
  }

  const manifestResult = await resolver.resolve(manifestPointer, { network });
  const remoteManifest =
    typeof manifestResult.content === 'string'
      ? JSON.parse(manifestResult.content)
      : manifestResult.content;
  const remoteCanonical = canonicalize(remoteManifest);
  const localCanonical = canonicalize(manifest);

  if (localCanonical !== remoteCanonical) {
    throw new Error('Manifest mismatch between inscription and local source');
  }

  logger.info('Manifest verified via HRL resolution', {
    manifestPointer,
    sequence: manifestSequence,
    metadataTopic: registryMetadataPointer.pointer,
  });

  logger.info('HCS-21 layered registry demo complete', {
    registryOfRegistriesTopicId,
    versionPointerTopicId,
    registryTopicId,
    manifestPointer,
  });
  setImmediate(() => process.exit(0));
}

main().catch(error => {
  logger.error('HCS-21 demo failed', error as Error);
  process.exit(1);
});
