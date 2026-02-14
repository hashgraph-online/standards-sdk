import type { RegistryBrokerClient } from '../services/registry-broker/client/base-client';
import { getSkillVerificationStatus } from '../services/registry-broker/client/skills';
import type { SkillVerificationStatusResponse } from '../services/registry-broker/types';
import {
  HCS26BaseClient,
  type HCS26ClientConfig,
  type HCS26SkillVerificationProvider,
  type HCS26SkillVerificationStatus,
} from './base-client';

export interface SDKHCS26ClientConfig extends HCS26ClientConfig {
  registryBrokerClient?: RegistryBrokerClient;
}

function mapVerification(
  status: SkillVerificationStatusResponse,
): HCS26SkillVerificationStatus {
  const pendingRequest = status.pendingRequest ?? undefined;
  return {
    name: status.name,
    verified: status.verified,
    previouslyVerified: status.previouslyVerified,
    ...(pendingRequest ? { pendingRequest } : {}),
  };
}

export function createRegistryBrokerVerificationProvider(
  client: RegistryBrokerClient,
): HCS26SkillVerificationProvider {
  return {
    async getSkillVerificationStatus(params: { name: string }) {
      const status = await getSkillVerificationStatus(client, {
        name: params.name,
      });
      return mapVerification(status);
    },
  };
}

export class HCS26Client extends HCS26BaseClient {
  constructor(config: SDKHCS26ClientConfig) {
    const provider =
      config.verificationProvider ??
      (config.registryBrokerClient
        ? createRegistryBrokerVerificationProvider(config.registryBrokerClient)
        : undefined);

    super({
      network: config.network,
      logger: config.logger,
      mirrorNode: config.mirrorNode,
      verificationProvider: provider,
    });
  }
}
