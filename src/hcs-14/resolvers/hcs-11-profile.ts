import { HCS11Client } from '../../hcs-11/client';
import { parseHederaCaip10 } from '../caip';
import type {
  DidProfileResolver,
  DidProfileResolverContext,
  DidResolutionProfile,
  DidService,
} from './types';
import type { AdapterMeta } from '../adapters/types';

type Hcs11Network = 'mainnet' | 'testnet';

function toHcs11Network(network: string): Hcs11Network | null {
  if (network === 'mainnet' || network === 'testnet') {
    return network;
  }
  return null;
}

function parseNativeIdNetworkAndAccount(
  nativeId: string,
): { network: Hcs11Network; accountId: string } | null {
  try {
    const parsed = parseHederaCaip10(nativeId);
    const network = toHcs11Network(parsed.network);
    if (!network) {
      return null;
    }
    return { network, accountId: parsed.accountId };
  } catch (_error) {
    return null;
  }
}

function getDidNetworkAndAccount(
  did: string,
  context?: DidProfileResolverContext,
): { network: Hcs11Network; accountId: string } | null {
  const nativeId = context?.parsedUaid?.params['nativeId'];
  if (nativeId) {
    const resolvedNativeId = parseNativeIdNetworkAndAccount(nativeId);
    if (resolvedNativeId) {
      return resolvedNativeId;
    }
  }

  const didMatch = did.match(/^did:hedera:(mainnet|testnet):(.+)$/);
  if (!didMatch) {
    return null;
  }

  const network = toHcs11Network(didMatch[1]);
  if (!network) {
    return null;
  }

  return {
    network,
    accountId: didMatch[2],
  };
}

function buildHcs10Service(
  id: string,
  network: Hcs11Network,
  accountId: string,
  topicInfo?: {
    inboundTopic: string;
    outboundTopic: string;
    profileTopicId: string;
  },
): DidService | null {
  if (!topicInfo) {
    return null;
  }

  return {
    id: `${id}#hcs10`,
    type: 'HCS10Service',
    serviceEndpoint: {
      network,
      accountId,
      inboundTopicId: topicInfo.inboundTopic || undefined,
      outboundTopicId: topicInfo.outboundTopic || undefined,
      profileTopicId: topicInfo.profileTopicId || undefined,
    },
  };
}

export class HCS11ProfileResolver implements DidProfileResolver {
  readonly adapterKind: 'did-profile-resolver' = 'did-profile-resolver';
  readonly meta: AdapterMeta = {
    id: 'hedera/hcs11-profile-resolver',
    didMethods: ['hedera'],
    caip2Networks: ['hedera:mainnet', 'hedera:testnet'],
    caip10Namespaces: ['hedera'],
    displayName: 'Hedera (HCS-11 Profile Resolver)',
    description:
      'Resolves HCS-11 protocol profiles and HCS-10 service metadata for did:hedera identifiers.',
  };

  supports(did: string): boolean {
    return /^did:hedera:(mainnet|testnet):/.test(did);
  }

  async resolveProfile(
    did: string,
    context?: DidProfileResolverContext,
  ): Promise<DidResolutionProfile | null> {
    const networkAndAccount = getDidNetworkAndAccount(did, context);
    if (!networkAndAccount) {
      return null;
    }

    const { network, accountId } = networkAndAccount;
    const client = new HCS11Client({
      network,
      auth: { operatorId: accountId },
      silent: true,
    });
    const fetched = await client.fetchProfileByAccountId(accountId, network);
    if (!fetched.success || !fetched.profile) {
      return null;
    }

    const subjectId = context?.uaid ?? did;
    const existingServices = context?.didDocument?.service ?? [];
    const hcs10Service = buildHcs10Service(
      subjectId,
      network,
      accountId,
      fetched.topicInfo,
    );
    const service = hcs10Service
      ? [...existingServices, hcs10Service]
      : existingServices;

    return {
      id: subjectId,
      did,
      service: service.length > 0 ? service : undefined,
      profiles: {
        hcs11: {
          protocol: 'hcs-11',
          network,
          accountId,
          profile: fetched.profile,
          topicInfo: fetched.topicInfo,
        },
      },
    };
  }
}
