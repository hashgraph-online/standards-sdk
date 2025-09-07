/**
 * HCS-14 Demo with Hiero DID SDK: issue did:hedera via registrar, wrap as UAID, print results.
 */

import 'dotenv/config';
import { Client, PrivateKey } from '@hashgraph/sdk';
import { createDID } from '@hiero-did-sdk/registrar';
import { generateUaidDid, parseHcs14Did, toHederaCaip10 } from '../../src/hcs-14';

function required(name: string, value: string | undefined): string {
  if (!value || !value.trim()) throw new Error(`${name} is required in environment`);
  return value.trim();
}

async function main(): Promise<Client> {
  const network = required('HEDERA_NETWORK', process.env.HEDERA_NETWORK || 'testnet');
  const accountId = required('HEDERA_ACCOUNT_ID', process.env.HEDERA_ACCOUNT_ID);
  const privateKeyStr = required('HEDERA_PRIVATE_KEY', process.env.HEDERA_PRIVATE_KEY);

  const client = Client.forName(network);
  client.setOperator(accountId, PrivateKey.fromString(privateKeyStr));

  const { did, didDocument } = await createDID({ client });

  const nativeId = toHederaCaip10(network as any, accountId);
  const uaid = generateUaidDid(did, { proto: 'hcs-10', nativeId, uid: '0' });
  const parsed = parseHcs14Did(uaid);

  const output = { did, didDocument, uaid, uaidParsed: parsed };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  return client;
}

main()
  .then(client => {
    client.close();
    process.exit(0);
  })
  .catch(err => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
