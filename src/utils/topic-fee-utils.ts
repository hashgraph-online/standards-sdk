import { PublicKey } from '@hashgraph/sdk';
import { Logger } from './logger';
import { HederaMirrorNode } from '../services/mirror-node';

/**
 * Converts account IDs to public keys for fee exemption
 * @param client Hedera client instance
 * @param accountIds Array of account IDs to convert to public keys
 * @param network The network to use for retrieving public keys
 * @param logger Optional logger instance
 * @returns Array of public keys
 */
export async function accountIdsToExemptKeys(
  accountIds: string[],
  network: string,
  logger?: Logger,
): Promise<PublicKey[]> {
  const mirrorNode = new HederaMirrorNode(
    network as 'mainnet' | 'testnet',
    logger,
  );
  const exemptKeys: PublicKey[] = [];

  for (const accountId of accountIds) {
    try {
      const publicKey = await mirrorNode.getPublicKey(accountId);
      exemptKeys.push(publicKey);
    } catch (error) {
      if (logger) {
        logger.warn(
          `Could not get public key for account ${accountId}: ${error}`,
        );
      }
    }
  }

  return exemptKeys;
}
