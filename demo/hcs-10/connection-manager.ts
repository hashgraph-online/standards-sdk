import { ConnectionsManager, HCS10Client } from '../../src';
import dotenv from 'dotenv';

dotenv.config();

export const main = async () => {
  const operatorId = process.env.BOB_ACCOUNT_ID;
  const operatorPrivateKey = process.env.BOB_PRIVATE_KEY;
  if (!operatorId || !operatorPrivateKey) {
    throw new Error(
      'BOB_ACCOUNT_ID and BOB_PRIVATE_KEY must be set'
    );
  }
  const connectionsManager = new ConnectionsManager({
    baseClient: new HCS10Client({
      network: 'testnet',
      operatorId,
      operatorPrivateKey,
    }),
  });

  const connections = await connectionsManager.fetchConnectionData(operatorId);
  console.log(connections);
};

main();
