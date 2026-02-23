/**
 * HCS-14 Demo with Hiero DID SDK: issue did:hedera via registrar, wrap as UAID, print results.
 */

import 'dotenv/config';
import { HCS14Client, isUaidProfileResolverAdapter } from '../../src/hcs-14';
import { Client } from '@hashgraph/sdk';

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
  const accountId = required(
    'HEDERA_ACCOUNT_ID',
    process.env.HEDERA_ACCOUNT_ID,
  );
  const privateKeyStr = required(
    'HEDERA_PRIVATE_KEY',
    process.env.HEDERA_PRIVATE_KEY,
  );
  const hcs14 = new HCS14Client({
    network,
    operatorId: accountId,
    privateKey: privateKeyStr,
  });
  const didResolverIds = hcs14
    .filterAdapters({
      capability: 'did-resolver',
    })
    .map(record => record.adapter.meta?.id || 'unknown');
  const didProfileResolverIds = hcs14
    .filterAdapters({
      capability: 'did-profile-resolver',
    })
    .map(record => record.adapter.meta?.id || 'unknown');
  const uaidProfileResolverIds = hcs14
    .filterAdapters({
      capability: 'uaid-profile-resolver',
    })
    .map(record => record.adapter)
    .filter(isUaidProfileResolverAdapter)
    .map(adapter => adapter.profile);

  const client = Client.forName(network);
  client.setOperator(accountId, privateKeyStr);
  const { did, uaid, parsed } = await hcs14.createDidWithUaid({
    issue: { method: 'hedera', client },
    proto: 'hcs-10',
  });
  const didProfile = await hcs14.resolveDidProfile(did);
  const uaidProfile = await hcs14.resolveUaidProfile(uaid);

  const output = {
    did,
    uaid,
    uaidParsed: parsed,
    adapters: {
      didResolverIds,
      didProfileResolverIds,
      uaidProfileResolverIds,
    },
    resolved: {
      didProfile,
      uaidProfile,
    },
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
