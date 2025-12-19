import 'dotenv/config';
import {
  Client,
  PrivateKey,
  Hbar,
  TransferTransaction,
  ScheduleCreateTransaction,
  ScheduleSignTransaction,
  KeyList,
} from '@hashgraph/sdk';
import { HCS15Client } from '../../src/hcs-15/sdk';
import { HCS10Client } from '../../src/hcs-10/sdk';
import { InboundTopicType } from '../../src/hcs-11/types';
import { HCS16Client } from '../../src/hcs-16/sdk';
import { HCS18Client } from '../../src/hcs-18/sdk';
import type { NetworkType } from '../../src/utils/types';
import { HCS16BaseClient } from '../../src/hcs-16/base-client';
import { Logger } from '../../src/utils/logger';
import {
  buildHcs10CreateConnectionTopicTx,
  buildHcs10SendMessageTx,
  buildHcs10SubmitConnectionRequestTx,
} from '../../src/hcs-10/tx';
import type { HCSMessageWithCommonFields } from '../../src/services/types';
import type { HederaMirrorNode } from '../../src/services/mirror-node';
import {
  buildHcs16FloraJoinRequestTx,
  buildHcs16FloraJoinVoteTx,
  buildHcs16FloraJoinAcceptedTx,
} from '../../src/hcs-16/tx';

type Petal = {
  baseKey: PrivateKey;
  baseAccountId: string | undefined;
  petalAccountId: string;
  inboundTopicId: string;
};

type JoinConnection = {
  connectionRequestId: number;
  connectionTopicId: string;
  connectionSeq: number;
};

/**
 * Simple sequence progress reporter with a text progress bar.
 */
class SequenceProgress {
  private readonly steps: string[];
  private readonly width: number;
  private current: number;
  private readonly logger: Logger;

  constructor(steps: string[], logger: Logger, width = 24) {
    this.steps = steps;
    this.width = width;
    this.current = 0;
    this.logger = logger;
  }

  private bar(done: number): string {
    const filled = Math.round((done / this.steps.length) * this.width);
    const blanks = this.width - filled;
    const left = '#'.repeat(filled);
    const right = '-'.repeat(blanks);
    return `[${left}${right}] ${done}/${this.steps.length}`;
  }

  start(): void {
    this.logger.info(`Sequence start: ${this.steps.length} steps`);
    process.stdout.write(`${this.bar(0)}\r`);
  }

  async run<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const idx = this.current + 1;
    this.logger.info(`Step ${idx}/${this.steps.length}: ${label}`);
    const result = await fn();
    this.current = this.current + 1;
    process.stdout.write(`${this.bar(this.current)}\r`);
    if (this.current === this.steps.length) {
      process.stdout.write(`${this.bar(this.current)}\n`);
      this.logger.info('Sequence completed');
    }
    return result;
  }
}

async function createPetal(h15: HCS15Client, h10: HCS10Client): Promise<Petal> {
  const base = await h15.createBaseAccount({
    initialBalance: 1,
    accountMemo: 'HCS-15 Base',
  });
  const petal = await h15.createPetalAccount({
    basePrivateKey: base.privateKey,
    initialBalance: 0.25,
    accountMemo: 'HCS-15 Petal',
  });
  const inbound = await h10.createInboundTopic(
    petal.accountId!,
    InboundTopicType.PUBLIC,
    300,
  );
  return {
    baseKey: base.privateKey,
    baseAccountId: base.accountId,
    petalAccountId: petal.accountId!,
    inboundTopicId: inbound,
  };
}

/**
 * Wait for a mirror-node message that satisfies the predicate.
 */
async function waitForTopicMessage(params: {
  mirror: HederaMirrorNode;
  topicId: string;
  predicate: (message: HCSMessageWithCommonFields) => boolean;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<HCSMessageWithCommonFields> {
  const timeoutMs = params.timeoutMs ?? 60000;
  const intervalMs = params.intervalMs ?? 2000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const messages = await params.mirror.getTopicMessages(params.topicId, {
      limit: 10,
      order: 'desc',
    });
    const match = messages.find(params.predicate);
    if (match) {
      return match;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for mirror message on ${params.topicId}`);
}

/**
 * Create an HCS-10 join connection and return the sequence references.
 */
async function createJoinConnection(params: {
  nodeClient: Client;
  mirror: HederaMirrorNode;
  inboundTopicId: string;
  candidate: Petal;
  memo?: string;
}): Promise<JoinConnection> {
  const requestTx = buildHcs10SubmitConnectionRequestTx({
    inboundTopicId: params.inboundTopicId,
    operatorId: params.candidate.petalAccountId,
    memo: params.memo,
  });
  const requestFrozen = await requestTx.freezeWith(params.nodeClient);
  const requestSigned = await requestFrozen.sign(params.candidate.baseKey);
  await (await requestSigned.execute(params.nodeClient)).getReceipt(
    params.nodeClient,
  );

  const requestMessage = await waitForTopicMessage({
    mirror: params.mirror,
    topicId: params.inboundTopicId,
    predicate: message =>
      message.p === 'hcs-10' &&
      message.op === 'connection_request' &&
      message.operator_id === params.candidate.petalAccountId,
  });
  const connectionRequestId = requestMessage.sequence_number;

  const connectionTx = buildHcs10CreateConnectionTopicTx({
    ttl: 300,
    inboundTopicId: params.inboundTopicId,
    connectionId: connectionRequestId,
  });
  const connectionResp = await connectionTx.execute(params.nodeClient);
  const connectionReceipt = await connectionResp.getReceipt(params.nodeClient);
  const connectionTopicId = connectionReceipt.topicId?.toString();
  if (!connectionTopicId) {
    throw new Error('Failed to create connection topic');
  }

  const proposalTx = buildHcs10SendMessageTx({
    connectionTopicId,
    operatorId: params.candidate.petalAccountId,
    data: JSON.stringify({
      account_id: params.candidate.petalAccountId,
      proposal: 'Join Flora membership',
    }),
    memo: params.memo,
  });
  const proposalFrozen = await proposalTx.freezeWith(params.nodeClient);
  const proposalSigned = await proposalFrozen.sign(params.candidate.baseKey);
  await (await proposalSigned.execute(params.nodeClient)).getReceipt(
    params.nodeClient,
  );

  const proposalMessage = await waitForTopicMessage({
    mirror: params.mirror,
    topicId: connectionTopicId,
    predicate: message =>
      message.p === 'hcs-10' &&
      message.op === 'message' &&
      message.operator_id === params.candidate.petalAccountId,
  });

  return {
    connectionRequestId,
    connectionTopicId,
    connectionSeq: proposalMessage.sequence_number,
  };
}

async function scheduleTransferFromFlora(
  client: Client,
  floraAccountId: string,
  toAccount: string,
  amountHbar: number,
) {
  const transfer = new TransferTransaction()
    .addHbarTransfer(floraAccountId, new Hbar(-amountHbar))
    .addHbarTransfer(toAccount, new Hbar(amountHbar));
  const schedule = new ScheduleCreateTransaction().setScheduledTransaction(
    transfer,
  );
  const resp = await schedule.execute(client);
  const receipt = await resp.getReceipt(client);
  return receipt.scheduleId?.toString();
}

async function main() {
  const log = new Logger({ module: 'HCS-16-E2E', level: 'info' });
  const seq = new SequenceProgress(
    [
      'Create Petal A/B/C accounts (HCS-15)',
      'Announce A on discovery (HCS-18)',
      'Announce B on discovery (HCS-18)',
      'Announce C on discovery (HCS-18)',
      'Propose Flora formation (HCS-18)',
      'Respond B accept (HCS-18)',
      'Respond C accept (HCS-18)',
      'Create Flora account (2/3 keylist)',
      'Create C/T/S topics',
      'Publish flora_created (CTopic)',
      'Publish state_update (STopic)',
      'Schedule transfer 1 HBAR to 0.0.800',
      'Post transaction with schedule_id (TTopic)',
      'Sign schedule A',
      'Sign schedule B (execute)',
      'Create Flora inbound topic (HCS-10)',
      'Create Petal D and post HCS-10 join request',
      'Post flora_join_request proxy (CTopic)',
      'Members A/B post flora_join_vote approvals',
      'Publish flora_join_accepted (STopic)',
      'Mirror readback latest messages',
    ],
    log,
  );
  seq.start();
  const network =
    (process.env.HEDERA_NETWORK as 'mainnet' | 'testnet') || 'testnet';
  const operatorId =
    process.env.HEDERA_OPERATOR_ID || process.env.HEDERA_ACCOUNT_ID;
  const operatorKey =
    process.env.HEDERA_OPERATOR_KEY || process.env.HEDERA_PRIVATE_KEY;
  if (!operatorId || !operatorKey) {
    log.error('Missing HEDERA_OPERATOR_ID/HEDERA_OPERATOR_KEY in environment');
    process.exit(1);
  }

  const nodeClient =
    network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  nodeClient.setOperator(operatorId, operatorKey);

  const h15 = new HCS15Client({ network, operatorId, operatorKey });
  const h10 = new HCS10Client({
    network,
    operatorId,
    operatorPrivateKey: operatorKey,
  } as any);
  const h16 = new HCS16Client({ network, operatorId, operatorKey });
  const h16Base = new HCS16BaseClient({ network });

  const { petalA, petalB, petalC } = await seq.run(
    'Create Petal A/B/C accounts (HCS-15)',
    async () => {
      const pa = await createPetal(h15, h10);
      const pb = await createPetal(h15, h10);
      const pc = await createPetal(h15, h10);
      return { petalA: pa, petalB: pb, petalC: pc };
    },
  );

  const discovery = new HCS18Client({
    network: network as NetworkType,
    operatorId,
    operatorKey,
  });
  const createdDiscovery = await discovery.createDiscoveryTopic({
    ttlSeconds: 300,
  });
  const discoveryTopicId = createdDiscovery.topicId;

  const dcA = new HCS18Client({
    network: network as NetworkType,
    operatorId: petalA.petalAccountId,
    operatorKey: petalA.baseKey,
  });
  const dcB = new HCS18Client({
    network: network as NetworkType,
    operatorId: petalB.petalAccountId,
    operatorKey: petalB.baseKey,
  });
  const dcC = new HCS18Client({
    network: network as NetworkType,
    operatorId: petalC.petalAccountId,
    operatorKey: petalC.baseKey,
  });

  await seq.run('Announce A on discovery (HCS-18)', async () => {
    await dcA.announce({
      discoveryTopicId,
      data: {
        account: petalA.petalAccountId,
        petal: { name: 'A', priority: 600 },
        capabilities: { protocols: ['hcs-16', 'hcs-17', 'hcs-18'] },
        valid_for: 10000,
      },
    });
  });
  await seq.run('Announce B on discovery (HCS-18)', async () => {
    await dcB.announce({
      discoveryTopicId,
      data: {
        account: petalB.petalAccountId,
        petal: { name: 'B', priority: 500 },
        capabilities: { protocols: ['hcs-16', 'hcs-17', 'hcs-18'] },
        valid_for: 10000,
      },
    });
  });
  await seq.run('Announce C on discovery (HCS-18)', async () => {
    await dcC.announce({
      discoveryTopicId,
      data: {
        account: petalC.petalAccountId,
        petal: { name: 'C', priority: 500 },
        capabilities: { protocols: ['hcs-16', 'hcs-17', 'hcs-18'] },
        valid_for: 10000,
      },
    });
  });

  const { sequenceNumber: proposalSeq } = await seq.run(
    'Propose Flora formation (HCS-18)',
    async () => {
      const r = await dcA.propose({
        discoveryTopicId,
        data: {
          proposer: petalA.petalAccountId,
          members: [
            { account: petalA.petalAccountId, priority: 600 },
            { account: petalB.petalAccountId, priority: 500 },
            { account: petalC.petalAccountId, priority: 500 },
          ],
          config: { name: 'Flora E2E', threshold: 2, purpose: 'E2E' },
        },
      });
      return r;
    },
  );

  await seq.run('Respond B accept (HCS-18)', async () => {
    await dcB.respond({
      discoveryTopicId,
      data: {
        responder: petalB.petalAccountId,
        proposal_seq: proposalSeq,
        decision: 'accept',
      },
    });
  });
  await seq.run('Respond C accept (HCS-18)', async () => {
    await dcC.respond({
      discoveryTopicId,
      data: {
        responder: petalC.petalAccountId,
        proposal_seq: proposalSeq,
        decision: 'accept',
      },
    });
  });

  const keyList = await seq.run(
    'Create Flora account (2/3 keylist)',
    async () => {
      const k = await h16.assembleKeyList({
        members: [
          petalA.petalAccountId,
          petalB.petalAccountId,
          petalC.petalAccountId,
        ],
        threshold: 2,
      });
      return k;
    },
  );
  const submitList = new KeyList([], 1) as any;
  for (const p of [petalA, petalB, petalC]) {
    const pub = await h16.mirrorNode.getPublicKey(p.petalAccountId);
    submitList.push(pub);
  }

  const { buildHcs16CreateAccountTx, buildHcs16CreateFloraTopicTx } =
    await import('../../src/hcs-16/tx');
  const accTx = buildHcs16CreateAccountTx({
    keyList,
    initialBalanceHbar: 2,
    maxAutomaticTokenAssociations: -1,
  });
  const accResp = await accTx.execute(nodeClient);
  const accRec = await accResp.getReceipt(nodeClient);
  if (!accRec.accountId) throw new Error('Failed to create Flora account');
  const floraAccountId = accRec.accountId.toString();
  console.log('Flora account:', floraAccountId);

  await seq.run('Create C/T/S topics', async () => {
    return;
  });
  const commTx = buildHcs16CreateFloraTopicTx({
    floraAccountId,
    topicType: 0 as any,
    adminKey: keyList,
    submitKey: submitList,
  });
  const trnTx = buildHcs16CreateFloraTopicTx({
    floraAccountId,
    topicType: 1 as any,
    adminKey: keyList,
    submitKey: submitList,
  });
  const stateTx = buildHcs16CreateFloraTopicTx({
    floraAccountId,
    topicType: 2 as any,
    adminKey: keyList,
    submitKey: submitList,
  });

  for (const tx of [commTx, trnTx, stateTx]) {
    await tx.freezeWith(nodeClient);
    await tx.sign(petalA.baseKey);
    await tx.sign(petalB.baseKey);
    await tx.sign(petalC.baseKey);
  }
  const commId = (
    await (await commTx.execute(nodeClient)).getReceipt(nodeClient)
  ).topicId!.toString();
  const trnId = (
    await (await trnTx.execute(nodeClient)).getReceipt(nodeClient)
  ).topicId!.toString();
  const stateId = (
    await (await stateTx.execute(nodeClient)).getReceipt(nodeClient)
  ).topicId!.toString();
  const topics = { communication: commId, transaction: trnId, state: stateId };
  log.info('Topics ready');

  const floraInboundTopicId = await seq.run(
    'Create Flora inbound topic (HCS-10)',
    async () => {
      return h10.createInboundTopic(floraAccountId, InboundTopicType.PUBLIC, 300);
    },
  );

  await dcA.complete({
    discoveryTopicId,
    data: {
      proposal_seq: proposalSeq,
      flora_account: floraAccountId,
      topics,
      proposer: petalA.petalAccountId,
    },
  });

  await seq.run('Publish flora_created (CTopic)', async () => {
    const { buildHcs16FloraCreatedTx } = await import('../../src/hcs-16/tx');
    const fc = buildHcs16FloraCreatedTx({
      topicId: topics.communication,
      operatorId: `${petalA.petalAccountId}@${floraAccountId}`,
      floraAccountId,
      topics,
    });
    const frozen = await fc.freezeWith(nodeClient);
    const signed = await frozen.sign(petalA.baseKey);
    const resp = await signed.execute(nodeClient);
    await resp.getReceipt(nodeClient);
    return;
  });

  const stateHash = '0x' + Date.now().toString(16);
  await seq.run('Publish state_update (STopic)', async () => {
    const { buildHcs16StateUpdateTx } = await import('../../src/hcs-16/tx');
    const su = buildHcs16StateUpdateTx({
      topicId: topics.state,
      operatorId: `${petalA.petalAccountId}@${floraAccountId}`,
      hash: stateHash,
      epoch: 1,
    });
    const frozen = await su.freezeWith(nodeClient);
    const signed = await frozen.sign(petalA.baseKey);
    const resp = await signed.execute(nodeClient);
    await resp.getReceipt(nodeClient);
    return;
  });

  const scheduleId = await seq.run(
    'Schedule transfer 1 HBAR to 0.0.800',
    async () => {
      const id = await scheduleTransferFromFlora(
        nodeClient,
        floraAccountId,
        '0.0.800',
        1,
      );
      return id || '';
    },
  );
  if (scheduleId) {
    await seq.run('Post transaction with schedule_id (TTopic)', async () => {
      const { buildHcs16TransactionTx } = await import('../../src/hcs-16/tx');
      const tp = buildHcs16TransactionTx({
        topicId: topics.transaction,
        operatorId: `${petalA.petalAccountId}@${floraAccountId}`,
        scheduleId: scheduleId,
        data: 'Send 1 HBAR to 0.0.800',
      });
      const frozen = await tp.freezeWith(nodeClient);
      const signed = await frozen.sign(petalA.baseKey);
      const resp = await signed.execute(nodeClient);
      await resp.getReceipt(nodeClient);
      return;
    });

    await seq.run('Sign schedule A', async () => {
      await h16.signSchedule({ scheduleId, signerKey: petalA.baseKey });
    });
    await seq.run('Sign schedule B (execute)', async () => {
      await h16.signSchedule({ scheduleId, signerKey: petalB.baseKey });
    });
  } else {
    log.warn('Failed to schedule transfer; skipping transaction message');
  }

  console.log('Creating Petal D and issuing flora_join_request...');
  const { petalD, joinContext } = await seq.run(
    'Create Petal D and post HCS-10 join request',
    async () => {
      const pd = await createPetal(h15, h10);
      const join = await createJoinConnection({
        nodeClient,
        mirror: h10.mirrorNode,
        inboundTopicId: floraInboundTopicId,
        candidate: pd,
        memo: 'Request to join Flora',
      });
      return { petalD: pd, joinContext: join };
    },
  );

  await seq.run('Post flora_join_request proxy (CTopic)', async () => {
    const tx = buildHcs16FloraJoinRequestTx({
      topicId: topics.communication,
      operatorId: `${petalA.petalAccountId}@${floraAccountId}`,
      accountId: petalD.petalAccountId,
      connectionRequestId: joinContext.connectionRequestId,
      connectionTopicId: joinContext.connectionTopicId,
      connectionSeq: joinContext.connectionSeq,
    });
    const frozen = await tx.freezeWith(nodeClient);
    const signed = await frozen.sign(petalA.baseKey);
    await (await signed.execute(nodeClient)).getReceipt(nodeClient);
  });

  await seq.run('Members A/B post flora_join_vote approvals', async () => {
    const v1 = buildHcs16FloraJoinVoteTx({
      topicId: topics.communication,
      operatorId: `${petalA.petalAccountId}@${floraAccountId}`,
      accountId: petalD.petalAccountId,
      approve: true,
      connectionRequestId: joinContext.connectionRequestId,
      connectionSeq: joinContext.connectionSeq,
    });
    const v2 = buildHcs16FloraJoinVoteTx({
      topicId: topics.communication,
      operatorId: `${petalB.petalAccountId}@${floraAccountId}`,
      accountId: petalD.petalAccountId,
      approve: true,
      connectionRequestId: joinContext.connectionRequestId,
      connectionSeq: joinContext.connectionSeq,
    });
    const f1 = await v1.freezeWith(nodeClient);
    const s1 = await f1.sign(petalA.baseKey);
    await (await s1.execute(nodeClient)).getReceipt(nodeClient);
    const f2 = await v2.freezeWith(nodeClient);
    const s2 = await f2.sign(petalB.baseKey);
    await (await s2.execute(nodeClient)).getReceipt(nodeClient);
    return;
  });

  await seq.run('Publish flora_join_accepted (STopic)', async () => {
    const acc = buildHcs16FloraJoinAcceptedTx({
      topicId: topics.state,
      operatorId: `${petalA.petalAccountId}@${floraAccountId}`,
      members: [
        petalA.petalAccountId,
        petalB.petalAccountId,
        petalC.petalAccountId,
        petalD.petalAccountId,
      ],
      epoch: 2,
    });
    const f = await acc.freezeWith(nodeClient);
    const s = await f.sign(petalA.baseKey);
    await (await s.execute(nodeClient)).getReceipt(nodeClient);
    return;
  });

  await seq.run('Mirror readback latest messages', async () => {
    const latestCreated = await h16Base.getLatestMessage(
      topics.communication,
      'flora_created',
    );
    const latestState = await h16Base.getLatestMessage(
      topics.state,
      'state_update',
    );
    log.info('Latest flora_created fetched');
    log.info('Latest state_update fetched');
    return { latestCreated, latestState };
  });

  process.exit(0);
}

main().catch(err => {
  console.error('HCS-16 flora e2e demo failed:', err);
  process.exit(1);
});
