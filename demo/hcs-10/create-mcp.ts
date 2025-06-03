import { Client, PrivateKey } from '@hashgraph/sdk';
import { Logger, HCS10Client } from '../../src';
import { createMCPServer } from './utils';
import {
  HederaAgentKit,
  HederaConversationalAgent,
  ServerSigner,
} from '@hashgraphonline/hedera-agent-kit';

export const main = async () => {
  const logger = new Logger({
    level: 'debug',
    module: 'create-mcp-server',
  });

  logger.info('Creating MCP server');

  const agentSigner = new ServerSigner(
    process.env.HEDERA_ACCOUNT_ID!,
    process.env.HEDERA_PRIVATE_KEY!,
    'testnet',
  );

  // const hederaAgent = new HederaAgentKit(agentSigner);

  // await hederaAgent.initialize();

  // const newPK = PrivateKey.generateECDSA();
  // console.log('newPK', newPK.toStringRaw());
  // const builder = hederaAgent.accounts();
  // const account = await builder
  //   .createAccount({
  //     initialBalance: 50,
  //     key: PrivateKey.generateECDSA().publicKey,
  //   })
  //   .execute();

  // const accountId = account.receipt?.accountId;

  const baseClient = new HCS10Client({
    network: 'testnet',
    operatorId: process.env.HEDERA_ACCOUNT_ID!,
    operatorPrivateKey: process.env.HEDERA_PRIVATE_KEY!,
  });

  const result = await createMCPServer(logger, baseClient, 'test-mcp');
  console.log('result', result);
};

main();
