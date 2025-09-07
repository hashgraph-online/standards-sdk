/**
 * HCS-14 Demo: Issue a real did:hedera, wrap as UAID, then resolve it via the resolver framework.
 */

import 'dotenv/config';
import { Client, PrivateKey } from '@hashgraph/sdk';
import { createDID } from '@hiero-did-sdk/registrar';
import { generateUaidDid, parseHcs14Did, toHederaCaip10, defaultResolverRegistry, HieroDidResolver } from '../../src/hcs-14';

function required(name: string, value: string | undefined): string {
  if (!value || !value.trim())
    throw new Error(`${name} is required in environment`);
  return value.trim();
}

async function main() {
  const network = required(
    'HEDERA_NETWORK',
    process.env.HEDERA_NETWORK || 'testnet',
  );
  const accountId = required(
    'HEDERA_ACCOUNT_ID',
    process.env.HEDERA_ACCOUNT_ID,
  );
  const privateKeyStr = required(
    'HEDERA_PRIVATE_KEY',
    process.env.HEDERA_PRIVATE_KEY,
  );

  const client = Client.forName(network);
  client.setOperator(accountId, PrivateKey.fromString(privateKeyStr));

  const { did: didIdentifier } = await createDID({ client });

  const nativeId = toHederaCaip10(network as any, accountId);
  const uaid = generateUaidDid(didIdentifier, {
    proto: 'hcs-10',
    nativeId,
    uid: '0',
  });

  defaultResolverRegistry.register(new HieroDidResolver());
  let resolved = await defaultResolverRegistry.resolveUaid(uaid);
  if (!resolved) {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      resolved = await defaultResolverRegistry.resolveUaid(uaid);
      if (resolved) break;
    }
  }

  const parsed = parseHcs14Did(uaid);
  const output = {
    did: didIdentifier,
    uaid,
    uaidParsed: parsed,
    resolvedId: resolved?.id || null,
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
