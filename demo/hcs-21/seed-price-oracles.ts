import 'dotenv/config';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { AdapterManifest, Logger, NetworkType } from '../../src';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  type CreateAdapterRegistryCategoryRequest,
  type SubmitAdapterRegistryAdapterRequest,
} from '../../src/services/registry-broker';

type AdapterSeed = {
  id: string;
  packageName: string;
  version: string;
  description: string;
  artifactFile: string;
  homepage?: string;
  keywords?: string[];
};

const logger = new Logger({ module: 'hcs-21-price-seed', level: 'info' });

function resolveLedgerCredentials(
  network: NetworkType,
): { accountId: string; privateKey: string } | null {
  const prefix = network === 'mainnet' ? 'MAINNET_' : 'TESTNET_';
  const accountId =
    process.env[`${prefix}HEDERA_ACCOUNT_ID`] ||
    process.env.HEDERA_ACCOUNT_ID ||
    process.env.HEDERA_OPERATOR_ID;
  const privateKey =
    process.env[`${prefix}HEDERA_PRIVATE_KEY`] ||
    process.env.HEDERA_PRIVATE_KEY ||
    process.env.HEDERA_OPERATOR_KEY;

  if (!accountId || !privateKey) {
    return null;
  }

  return { accountId, privateKey };
}

async function computeIntegrity(filePath: string): Promise<string> {
  const contents = await readFile(filePath);
  const digest = createHash('sha384').update(contents).digest('hex');
  return `sha384-${digest}`;
}

function buildManifest(seed: AdapterSeed, integrity: string): AdapterManifest {
  const now = new Date().toISOString();
  return {
    meta: {
      spec_version: '1.0',
      adapter_version: seed.version,
      generated: now,
    },
    adapter: {
      name: seed.id,
      id: seed.id,
      maintainers: [{ name: 'Hashgraph Online', contact: 'ops@hol.org' }],
      license: 'Apache-2.0',
      keywords: seed.keywords,
      homepage: seed.homepage,
      description: seed.description,
    },
    package: {
      registry: 'npm',
      dist_tag: 'stable',
      artifacts: [
        {
          url: `npm://${seed.packageName}@${seed.version}`,
          digest: integrity,
        },
      ],
    },
    runtime: {
      platforms: ['node>=20.10.0'],
      primary: 'node',
      entry: 'dist/index.cjs',
      dependencies: [],
    },
    capabilities: {
      discovery: false,
      communication: false,
      protocols: ['price-oracle'],
      discovery_tags: ['price', 'oracle', 'hbar'],
    },
    consensus: {
      state_model: 'hcs-21.generic@1',
      profile_uri: seed.homepage ?? '',
      entity_schema: 'hcs-21.entity-consensus@1',
      required_fields: ['entity_id', 'registry', 'state_hash', 'epoch'],
      hashing: 'sha384',
    },
  };
}

async function main(): Promise<void> {
  const network = (process.env.HEDERA_NETWORK as NetworkType) || 'testnet';

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootDir = path.resolve(__dirname, '../../..');

  const seeds: AdapterSeed[] = [
    {
      id: 'npm/@hol-org/adapter-binance',
      packageName: '@hol-org/adapter-binance',
      version: '0.1.2',
      description:
        'HOL Flora adapter for HBAR-USD pricing via Binance spot ticker (HCS-21).',
      artifactFile: path.join(rootDir, 'hol-org-adapter-binance-0.1.2.tgz'),
      homepage: 'https://github.com/hashgraph-online/flora-price-oracle',
      keywords: ['hol', 'hedera', 'price', 'binance', 'hcs-21'],
    },
    {
      id: 'npm/@hol-org/adapter-coingecko',
      packageName: '@hol-org/adapter-coingecko',
      version: '0.1.2',
      description:
        'HOL Flora adapter for HBAR-USD pricing via Coingecko API (HCS-21).',
      artifactFile: path.join(rootDir, 'hol-org-adapter-coingecko-0.1.2.tgz'),
      homepage: 'https://github.com/hashgraph-online/flora-price-oracle',
      keywords: ['hol', 'hedera', 'price', 'coingecko', 'hcs-21'],
    },
    {
      id: 'npm/@hol-org/adapter-hedera-rate',
      packageName: '@hol-org/adapter-hedera-rate',
      version: '0.1.2',
      description:
        'HOL Flora adapter that reads the Hedera exchange rate API for HBAR pricing (HCS-21).',
      artifactFile: path.join(rootDir, 'hol-org-adapter-hedera-rate-0.1.2.tgz'),
      homepage: 'https://github.com/hashgraph-online/flora-price-oracle',
      keywords: ['hol', 'hedera', 'price', 'exchange-rate', 'hcs-21'],
    },
  ];

  const baseUrl =
    process.env.REGISTRY_BROKER_BASE_URL?.trim() ||
    'http://localhost:4000/api/v1';
  const apiKey =
    process.env.REGISTRY_BROKER_API_KEY?.trim() ||
    process.env.REGISTRY_BROKER_MAINNET_API_KEY?.trim() ||
    process.env.REGISTRY_BROKER_TESTNET_API_KEY?.trim();

  const brokerClient = new RegistryBrokerClient({
    baseUrl,
    apiKey,
  });

  const ledgerCredentials = resolveLedgerCredentials(network);
  let didLedgerAuth = false;

  const authenticateWithLedgerIfAvailable = async (
    error?: unknown,
  ): Promise<boolean> => {
    if (didLedgerAuth || !ledgerCredentials) {
      return false;
    }

    if (error && !(error instanceof RegistryBrokerError)) {
      return false;
    }

    if (error && error.status !== 401) {
      return false;
    }

    logger.info('Authenticating with ledger credentials for adapter seeding');
    brokerClient.setApiKey(undefined);
    await brokerClient.authenticateWithLedgerCredentials({
      accountId: ledgerCredentials.accountId,
      network: `hedera:${network}`,
      hederaPrivateKey: ledgerCredentials.privateKey,
      label: 'price-oracle seeding',
    });
    didLedgerAuth = true;
    return true;
  };

  if (!apiKey) {
    await authenticateWithLedgerIfAvailable();
  }

  const categorySlug = 'price-oracles';
  const categoriesResponse = await brokerClient.adapterRegistryCategories();
  const existingCategory = categoriesResponse.categories.find(
    category => category.slug === categorySlug,
  );

  if (!existingCategory) {
    const categoryRequest: CreateAdapterRegistryCategoryRequest = {
      name: 'Price Oracles',
      slug: categorySlug,
      description: 'Adapters publishing on-chain price data.',
      type: 'adapter-type',
      metadata: {
        version: '1.0',
        name: 'Price Oracles',
        description: 'Adapters publishing on-chain price data.',
        entityTypes: ['price-oracle'],
      },
    };
    let createdCategory;
    try {
      createdCategory =
        await brokerClient.createAdapterRegistryCategory(categoryRequest);
    } catch (error) {
      if (await authenticateWithLedgerIfAvailable(error)) {
        createdCategory =
          await brokerClient.createAdapterRegistryCategory(categoryRequest);
      } else {
        throw error;
      }
    }
    logger.info('Created price oracle category', { category: createdCategory });
  }

  for (const seed of seeds) {
    logger.info(`Publishing adapter ${seed.id}`);
    const integrity = await computeIntegrity(seed.artifactFile);
    const manifest = buildManifest(seed, integrity);

    const submitRequest: SubmitAdapterRegistryAdapterRequest = {
      adapterId: seed.id,
      adapterName: seed.packageName,
      entity: 'price-oracle',
      package: {
        registry: 'npm',
        name: seed.packageName,
        version: seed.version,
        integrity,
      },
      config: {
        type: 'price-oracle',
        network,
      },
      stateModel: 'hcs-21.generic@1',
      manifest,
      keywords: seed.keywords,
      categorySlug,
    };

    let accepted;
    try {
      accepted = await brokerClient.submitAdapterRegistryAdapter(submitRequest);
    } catch (error) {
      if (await authenticateWithLedgerIfAvailable(error)) {
        accepted =
          await brokerClient.submitAdapterRegistryAdapter(submitRequest);
      } else {
        throw error;
      }
    }

    const submissionId = accepted.submissionId;
    logger.info('Adapter submission queued', {
      adapterId: seed.id,
      submissionId,
    });

    const maxAttempts = 240;
    let attempt = 0;
    let completedPayload: Record<string, unknown> | null = null;

    while (attempt < maxAttempts) {
      attempt += 1;
      let statusResponse;
      try {
        statusResponse =
          await brokerClient.adapterRegistrySubmissionStatus(submissionId);
      } catch (error) {
        if (await authenticateWithLedgerIfAvailable(error)) {
          statusResponse =
            await brokerClient.adapterRegistrySubmissionStatus(submissionId);
        } else {
          throw error;
        }
      }

      const submission = statusResponse.submission;
      if (submission.status === 'completed') {
        const payload = submission.resultPayload;
        if (payload && typeof payload === 'object') {
          completedPayload = payload as Record<string, unknown>;
        }
        break;
      }
      if (submission.status === 'failed') {
        throw new Error(
          submission.error ?? 'Adapter submission failed during processing.',
        );
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    if (!completedPayload) {
      throw new Error(`Timed out waiting for submission ${submissionId}`);
    }

    const adapterRecord = completedPayload.adapter;
    const categoryRecord = completedPayload.category;
    const transactionId =
      typeof completedPayload.transactionId === 'string'
        ? completedPayload.transactionId
        : null;

    const declarationTopicId =
      adapterRecord && typeof adapterRecord === 'object'
        ? (adapterRecord as Record<string, unknown>).declarationTopicId
        : null;
    const versionTopicId =
      adapterRecord && typeof adapterRecord === 'object'
        ? (adapterRecord as Record<string, unknown>).versionTopicId
        : null;
    const categoryTopicId =
      categoryRecord && typeof categoryRecord === 'object'
        ? (categoryRecord as Record<string, unknown>).topicId
        : null;

    logger.info('Adapter published via registry broker', {
      adapterId: seed.id,
      transactionId,
      declarationTopicId,
      versionTopicId,
      categoryTopicId,
    });
  }

  logger.info('Price oracle adapters seeded', {
    categorySlug,
    baseUrl,
  });
}

main().catch(error => {
  logger.error('Failed to seed price oracle adapters', error as Error);
  process.exit(1);
});
