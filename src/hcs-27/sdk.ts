import {
  AccountId,
  Client,
  KeyList,
  PrivateKey,
  PublicKey,
  TopicCreateTransaction,
  TopicId,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import { createHash, randomUUID } from 'crypto';
import { InscriptionSDK } from '@kiloscribe/inscription-sdk';
import {
  createNodeOperatorContext,
  type NodeOperatorContext,
} from '../common/node-operator-resolver';
import { inscribe } from '../inscribe/inscriber';
import { getTopicId } from '../utils/topic-id-utils';
import { HCS27BaseClient } from './base-client';
import {
  hcs27CheckpointMetadataSchema,
  type HCS27CheckpointMessage,
  type HCS27CheckpointMetadata,
  type HCS27CreateCheckpointTopicOptions,
  type HCS27CreateCheckpointTopicResult,
  type HCS27PublishCheckpointResult,
  type HCS27TopicKey,
  type SDKHCS27ClientConfig,
  toHCS27CheckpointMetadata,
} from './types';

const MAX_PAYLOAD_BYTES = 1024;

export class HCS27Client extends HCS27BaseClient {
  private readonly client: Client;
  private readonly operatorId: AccountId;
  private readonly operatorCtx: NodeOperatorContext;
  private inscriptionSDK?: InscriptionSDK;
  private readonly topicSubmitKeySigners = new Map<string, PrivateKey>();

  constructor(config: SDKHCS27ClientConfig) {
    super(config);
    this.operatorId =
      typeof config.operatorId === 'string'
        ? AccountId.fromString(config.operatorId)
        : config.operatorId;

    let resolvedClient = config.client;
    if (!resolvedClient) {
      if (config.network === 'mainnet') {
        resolvedClient = Client.forMainnet();
      } else {
        resolvedClient = Client.forTestnet();
      }
    }

    this.operatorCtx = createNodeOperatorContext({
      network: this.network,
      operatorId: this.operatorId,
      operatorKey: config.operatorKey,
      keyType: config.keyType,
      mirrorNode: this.mirrorNode,
      logger: this.logger,
      client: resolvedClient,
    });
    this.client = this.operatorCtx.client;
  }

  getKeyType(): 'ed25519' | 'ecdsa' {
    return this.operatorCtx.keyType;
  }

  async createCheckpointTopic(
    options: HCS27CreateCheckpointTopicOptions = {},
  ): Promise<HCS27CreateCheckpointTopicResult> {
    await this.operatorCtx.ensureInitialized();

    const transaction = new TopicCreateTransaction().setTopicMemo(
      this.buildTopicMemo(options.ttl),
    );

    const adminKeyMaterial = this.resolveTopicKeyMaterial(options.adminKey);
    this.assertSignableTopicKey(options.adminKey, adminKeyMaterial, 'adminKey');
    if (adminKeyMaterial.publicKey) {
      transaction.setAdminKey(adminKeyMaterial.publicKey);
    }

    const submitKeyMaterial = this.resolveTopicKeyMaterial(options.submitKey);
    this.assertSignableTopicKey(
      options.submitKey,
      submitKeyMaterial,
      'submitKey',
    );
    if (submitKeyMaterial.publicKey) {
      transaction.setSubmitKey(submitKeyMaterial.publicKey);
    }

    if (options.transactionMemo?.trim()) {
      transaction.setTransactionMemo(options.transactionMemo.trim());
    }

    let response;
    if (adminKeyMaterial.signer || submitKeyMaterial.signer) {
      const frozenTransaction = await transaction.freezeWith(this.client);
      let signedTransaction = frozenTransaction;
      if (adminKeyMaterial.signer) {
        signedTransaction = await signedTransaction.sign(
          adminKeyMaterial.signer,
        );
      }
      if (submitKeyMaterial.signer) {
        signedTransaction = await signedTransaction.sign(
          submitKeyMaterial.signer,
        );
      }
      response = await signedTransaction.execute(this.client);
    } else {
      response = await transaction.execute(this.client);
    }
    const receipt = await response.getReceipt(this.client);
    if (!receipt.topicId) {
      throw new Error('Failed to create checkpoint topic: topicId empty');
    }
    if (submitKeyMaterial.signer) {
      this.topicSubmitKeySigners.set(
        receipt.topicId.toString(),
        submitKeyMaterial.signer,
      );
    }

    return {
      topicId: receipt.topicId.toString(),
      transactionId: response.transactionId.toString(),
    };
  }

  async publishCheckpoint(
    topicId: string,
    metadata: HCS27CheckpointMetadata,
    messageMemo?: string,
    transactionMemo?: string,
  ): Promise<HCS27PublishCheckpointResult> {
    await this.operatorCtx.ensureInitialized();
    const parsedMetadata = toHCS27CheckpointMetadata(
      hcs27CheckpointMetadataSchema.parse(metadata),
    );
    const { message, inlineResolvedMetadata } =
      await this.prepareCheckpointPayload(parsedMetadata, messageMemo);

    if (typeof message.metadata === 'string' && inlineResolvedMetadata) {
      await this.validateCheckpointMessage(message, async reference => {
        if (reference === message.metadata) {
          return inlineResolvedMetadata;
        }
        return this.resolveHCS1Reference(reference);
      });
    } else {
      await this.validateCheckpointMessage(message);
    }

    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(JSON.stringify(message))
      .setTransactionMemo(
        transactionMemo?.trim() || this.buildTransactionMemo(),
      );
    const submitKeySigner = this.topicSubmitKeySigners.get(topicId);
    const response = submitKeySigner
      ? await (await transaction.freezeWith(this.client))
          .sign(submitKeySigner)
          .then(signedTransaction => signedTransaction.execute(this.client))
      : await transaction.execute(this.client);

    const receipt = await response.getReceipt(this.client);

    return {
      transactionId: response.transactionId.toString(),
      sequenceNumber: this.parseSequenceNumber(receipt.topicSequenceNumber),
      receipt,
    };
  }

  registerTopicSubmitKey(topicId: string, submitKey: HCS27TopicKey): void {
    const submitKeyMaterial = this.resolveTopicKeyMaterial(submitKey);
    if (!submitKeyMaterial.signer) {
      throw new Error(
        'submitKey must include a private key so the client can sign private-topic submissions',
      );
    }
    this.topicSubmitKeySigners.set(
      TopicId.fromString(topicId).toString(),
      submitKeyMaterial.signer,
    );
  }

  private resolveTopicKeyMaterial(input?: HCS27TopicKey): {
    publicKey?: PublicKey | KeyList;
    signer?: PrivateKey;
  } {
    if (!input) {
      return {};
    }
    if (input instanceof PublicKey || input instanceof KeyList) {
      return { publicKey: input };
    }
    if (input instanceof PrivateKey) {
      return { publicKey: input.publicKey, signer: input };
    }
    if (typeof input === 'boolean') {
      return input ? { publicKey: this.operatorCtx.operatorKey.publicKey } : {};
    }
    if (typeof input === 'string') {
      try {
        return { publicKey: PublicKey.fromString(input) };
      } catch (publicKeyError) {
        try {
          const signer = PrivateKey.fromString(input);
          return { publicKey: signer.publicKey, signer };
        } catch (privateKeyError) {
          throw new Error(
            `Failed to parse topic key as PublicKey or PrivateKey: ${String(
              publicKeyError,
            )}; ${String(privateKeyError)}`,
          );
        }
      }
    }
    return {};
  }

  private assertSignableTopicKey(
    input: HCS27TopicKey | undefined,
    material: { publicKey?: PublicKey | KeyList; signer?: PrivateKey },
    fieldName: 'adminKey' | 'submitKey',
  ): void {
    if (!input || typeof input === 'boolean' || material.signer) {
      return;
    }
    if (
      material.publicKey &&
      !this.operatorCanSignTopicKey(material.publicKey)
    ) {
      throw new Error(
        `${fieldName} must include a private key or use true to reuse the operator key`,
      );
    }
  }

  private operatorCanSignTopicKey(publicKey: PublicKey | KeyList): boolean {
    if (publicKey instanceof PublicKey) {
      return this.operatorCtx.operatorKey.publicKey.equals(publicKey);
    }
    return this.operatorCanSignKeyList(publicKey);
  }

  private operatorCanSignKeyList(keyList: KeyList): boolean {
    const keys = keyList.toArray();
    const threshold = keyList.threshold ?? keys.length;
    if (threshold > 1 || keys.length === 0) {
      return false;
    }

    return keys.some(key => {
      if (key instanceof PublicKey) {
        return this.operatorCtx.operatorKey.publicKey.equals(key);
      }
      if (key instanceof KeyList) {
        return this.operatorCanSignKeyList(key);
      }
      return false;
    });
  }

  private parseSequenceNumber(
    value: { toString(): string } | number | bigint | string,
  ): number {
    const parsed = BigInt(value.toString());
    if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(
        'topicSequenceNumber exceeds Number.MAX_SAFE_INTEGER and cannot be represented safely',
      );
    }
    return Number(parsed);
  }

  private async prepareCheckpointPayload(
    metadata: HCS27CheckpointMetadata,
    messageMemo?: string,
  ): Promise<{
    message: HCS27CheckpointMessage;
    inlineResolvedMetadata?: Buffer;
  }> {
    const inlineMessage: HCS27CheckpointMessage = {
      p: 'hcs-27',
      op: 'register',
      metadata,
      ...(messageMemo?.trim() ? { m: messageMemo.trim() } : {}),
    };
    const inlinePayload = JSON.stringify(inlineMessage);
    if (Buffer.byteLength(inlinePayload, 'utf8') <= MAX_PAYLOAD_BYTES) {
      return { message: inlineMessage };
    }

    const metadataBytes = Buffer.from(JSON.stringify(metadata), 'utf8');
    const reference = await this.publishMetadataHCS1(metadataBytes);
    const digest = this.sha256Base64Url(metadataBytes);
    const overflowMessage: HCS27CheckpointMessage = {
      p: 'hcs-27',
      op: 'register',
      metadata: reference,
      metadata_digest: {
        alg: 'sha-256',
        b64u: digest,
      },
      ...(messageMemo?.trim() ? { m: messageMemo.trim() } : {}),
    };
    const overflowPayload = JSON.stringify(overflowMessage);
    if (Buffer.byteLength(overflowPayload, 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new Error(
        `checkpoint overflow pointer message still exceeds ${MAX_PAYLOAD_BYTES} bytes`,
      );
    }

    return {
      message: overflowMessage,
      inlineResolvedMetadata: metadataBytes,
    };
  }

  private async publishMetadataHCS1(metadataBytes: Buffer): Promise<string> {
    if (this.network !== 'testnet' && this.network !== 'mainnet') {
      throw new Error(
        `HCS-1 metadata publication is only supported on testnet and mainnet, got ${this.network}`,
      );
    }

    const authOptions = {
      accountId: this.operatorId.toString(),
      privateKey: this.operatorCtx.operatorKey,
      network: this.network,
    };

    if (!this.inscriptionSDK) {
      this.inscriptionSDK = await InscriptionSDK.createWithAuth({
        type: 'server',
        ...authOptions,
      });
    }

    const response = await inscribe(
      {
        type: 'buffer',
        buffer: metadataBytes,
        fileName: `hcs27-checkpoint-${randomUUID()}.json`,
        mimeType: 'application/json',
      },
      authOptions,
      {
        mode: 'file',
        fileStandard: 'hcs-1',
        waitForConfirmation: true,
        waitMaxAttempts: 120,
        waitIntervalMs: 2000,
      },
      this.inscriptionSDK,
    );

    const topicId = getTopicId(response.inscription);
    if (!topicId) {
      throw new Error(
        'Failed to inscribe overflow HCS-27 metadata: no topic ID returned',
      );
    }

    return `hcs://1/${topicId}`;
  }

  private sha256Base64Url(payload: Buffer): string {
    return createHash('sha256').update(payload).digest('base64url');
  }
}
