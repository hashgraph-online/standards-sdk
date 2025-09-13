import { Logger } from '../../src';
import { HCS10Client } from '../../src/hcs-10/sdk';
import { createMCPServer } from './utils';

export const main = async () => {
  const logger = new Logger({
    level: 'debug',
    module: 'create-mcp-server',
  });

  logger.info('Creating MCP server');

  const baseClient = new HCS10Client({
    network: 'testnet',
    operatorId: process.env.HEDERA_ACCOUNT_ID!,
    operatorPrivateKey: process.env.HEDERA_PRIVATE_KEY!,
  });

  const result = await createMCPServer(logger, baseClient, 'test-mcp');
  console.log('result', result);
};

main();
