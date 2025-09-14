import 'dotenv/config';
import {
  HCS15Client,
  HCS10Client,
  Logger,
  NetworkType,
  AgentBuilder,
  InboundTopicType,
  AIAgentCapability,
} from '../../src';

async function main(): Promise<void> {
  const logger = new Logger({ module: 'hcs-15-demo', level: 'info' });

  const network = (process.env.HEDERA_NETWORK as NetworkType) || 'testnet';
  const operatorId =
    process.env.HEDERA_OPERATOR_ID || process.env.HEDERA_ACCOUNT_ID;
  const operatorKey =
    process.env.HEDERA_OPERATOR_KEY || process.env.HEDERA_PRIVATE_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error(
      'Missing HEDERA_OPERATOR_ID/HEDERA_OPERATOR_KEY in environment',
    );
  }

  const hcs15 = new HCS15Client({
    network,
    operatorId,
    operatorKey,
    logLevel: 'info',
  });

  logger.info('Creating HCS-15 base account (ECDSA + alias) ...');
  const base = await hcs15.createBaseAccount({ initialBalance: 1, accountMemo: 'HCS-15 Base' });
  logger.info('Base account created', {
    accountId: base.accountId,
    evm: base.evmAddress,
  });

  logger.info('Creating HCS-15 petal account (shared key) ...');
  const petal = await hcs15.createPetalAccount({
    basePrivateKey: base.privateKey,
    initialBalance: 0.5,
    accountMemo: 'HCS-15 Petal',
  });
  logger.info('Petal account created', { accountId: petal.accountId });

  const verified = await hcs15.verifyPetalAccount(
    petal.accountId,
    base.accountId,
  );
  logger.info('Petal verification result', { verified });


  logger.info('Inscribe HCS-11 agent profile for petal');
  const hcs10 = new HCS10Client({
    network,
    operatorId: base.accountId,
    operatorPrivateKey: base.privateKey.toString(),
    keyType: 'ecdsa',
  });
  const agentBuilder = new AgentBuilder()
    .setName('HCS-15 Demo Petal')
    .setBio('A demo petal account with shared key')
    .setCapabilities([AIAgentCapability.TEXT_GENERATION])
    .setInboundTopicType(InboundTopicType.PUBLIC)
    .setBaseAccount(base.accountId)
    .setNetwork(network);
  const profile = await hcs10.createAgent(agentBuilder, 60);

  logger.info('Petal HCS-11 profile created', {
    profileTopicId: profile.profileTopicId,
    inboundTopicId: profile.inboundTopicId,
    outboundTopicId: profile.outboundTopicId,
  });

  // Cleanup SDK clients to avoid lingering channels
  try {
    await hcs15.close();
  } catch {}
  try {
    hcs10.getClient().close();
  } catch {}

  logger.info('Done');
  setImmediate(() => process.exit(0));
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error('HCS-15 demo failed:', err);
  process.exit(1);
});
