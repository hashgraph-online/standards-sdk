import { createHash } from 'crypto';
import { HederaMirrorNode } from '../services/mirror-node';
import { HRLResolver } from '../utils/hrl-resolver';
import { Logger, type ILogger } from '../utils/logger';
import {
  buildHCS27TopicMemo,
  buildHCS27TransactionMemo,
  parseHCS27TopicMemo,
} from './memos';
import {
  emptyHCS27Root,
  hashHCS27Leaf,
  hashHCS27Node,
  leafHashHexFromEntry,
  merkleRootFromCanonicalEntries,
  merkleRootFromEntries,
  verifyConsistencyProof,
  verifyInclusionProof,
} from './merkle';
import {
  hcs27CheckpointMessageSchema,
  hcs27CheckpointMetadataSchema,
  type HCS27CheckpointMessage,
  type HCS27CheckpointMetadata,
  type HCS27CheckpointRecord,
  type HCS27ClientConfig,
  type HCS27ConsistencyProof,
  type HCS27InclusionProof,
  type HCS27TopicMemo,
  toHCS27CheckpointMessage,
  toHCS27CheckpointMetadata,
} from './types';

export class HCS27BaseClient {
  protected readonly network: HCS27ClientConfig['network'];
  protected readonly logger: ILogger;
  protected readonly mirrorNode: HederaMirrorNode;
  private readonly hrlResolver: HRLResolver;

  constructor(config: HCS27ClientConfig) {
    this.network = config.network;
    this.logger =
      config.logger ??
      Logger.getInstance({
        module: 'HCS27Client',
        level: 'info',
      });
    this.mirrorNode = new HederaMirrorNode(
      this.network,
      this.logger,
      config.mirrorNode,
    );
    this.hrlResolver = new HRLResolver();
  }

  buildTopicMemo(ttlSeconds?: number): string {
    return buildHCS27TopicMemo(ttlSeconds);
  }

  parseTopicMemo(memo: string): HCS27TopicMemo | undefined {
    return parseHCS27TopicMemo(memo);
  }

  buildTransactionMemo(): string {
    return buildHCS27TransactionMemo();
  }

  emptyRoot(): Buffer {
    return emptyHCS27Root();
  }

  /** Strings are treated as UTF-8 canonical entry bytes. */
  hashLeaf(canonicalEntry: Buffer | Uint8Array | string): Buffer {
    const entry =
      typeof canonicalEntry === 'string'
        ? Buffer.from(canonicalEntry, 'utf8')
        : Buffer.from(canonicalEntry);
    return hashHCS27Leaf(entry);
  }

  /** Strings are treated as hex-encoded hash bytes. */
  hashNode(
    left: Buffer | Uint8Array | string,
    right: Buffer | Uint8Array | string,
  ): Buffer {
    const leftBytes =
      typeof left === 'string' ? Buffer.from(left, 'hex') : Buffer.from(left);
    const rightBytes =
      typeof right === 'string'
        ? Buffer.from(right, 'hex')
        : Buffer.from(right);
    return hashHCS27Node(leftBytes, rightBytes);
  }

  merkleRootFromCanonicalEntries(
    entries: ReadonlyArray<Buffer | Uint8Array | string>,
  ): Buffer {
    const canonicalEntries = entries.map(entry =>
      typeof entry === 'string'
        ? Buffer.from(entry, 'utf8')
        : Buffer.from(entry),
    );
    return merkleRootFromCanonicalEntries(canonicalEntries);
  }

  merkleRootFromEntries(entries: ReadonlyArray<unknown>): Buffer {
    return merkleRootFromEntries(entries);
  }

  leafHashHexFromEntry(entry: unknown): string {
    return leafHashHexFromEntry(entry);
  }

  verifyInclusionProof(
    proof:
      | HCS27InclusionProof
      | {
          leafIndex: number;
          treeSize: number;
          leafHashHex: string;
          path: string[];
          expectedRootB64: string;
        },
  ): boolean {
    return verifyInclusionProof(proof);
  }

  verifyConsistencyProof(
    proof:
      | HCS27ConsistencyProof
      | {
          oldTreeSize: number;
          newTreeSize: number;
          oldRootB64: string;
          newRootB64: string;
          consistencyPath: string[];
        },
  ): boolean {
    return verifyConsistencyProof(proof);
  }

  async validateCheckpointMessage(
    message: HCS27CheckpointMessage,
    resolver?: (reference: string) => Promise<Buffer>,
  ): Promise<HCS27CheckpointMetadata> {
    const parsedMessage = toHCS27CheckpointMessage(
      hcs27CheckpointMessageSchema.parse(message),
    );
    const effectiveResolver =
      resolver ?? (reference => this.resolveHCS1Reference(reference));

    let metadataBytes: Buffer | undefined;
    let metadata: HCS27CheckpointMetadata;

    if (typeof parsedMessage.metadata === 'string') {
      metadataBytes = await effectiveResolver(parsedMessage.metadata);
      metadata = toHCS27CheckpointMetadata(
        hcs27CheckpointMetadataSchema.parse(
          JSON.parse(metadataBytes.toString('utf8')),
        ),
      );
    } else {
      metadata = toHCS27CheckpointMetadata(
        hcs27CheckpointMetadataSchema.parse(parsedMessage.metadata),
      );
    }

    if (parsedMessage.metadata_digest) {
      if (!metadataBytes) {
        throw new Error(
          'metadata_digest requires metadata reference resolution',
        );
      }
      const digest = createHash('sha256')
        .update(metadataBytes)
        .digest('base64url');
      if (digest !== parsedMessage.metadata_digest.b64u) {
        throw new Error('metadata digest does not match resolved payload');
      }
    }

    return metadata;
  }

  validateCheckpointChain(records: ReadonlyArray<HCS27CheckpointRecord>): void {
    const streams = new Map<
      string,
      { treeSize: bigint; rootHashB64u: string }
    >();

    for (const record of records) {
      const streamId = `${record.effectiveMetadata.stream.registry}::${record.effectiveMetadata.stream.log_id}`;
      const currentTreeSize = BigInt(record.effectiveMetadata.root.treeSize);
      const previous = streams.get(streamId);

      if (previous) {
        if (currentTreeSize < previous.treeSize) {
          throw new Error(`tree size decreased for stream ${streamId}`);
        }
        if (!record.effectiveMetadata.prev) {
          throw new Error(`missing prev linkage for stream ${streamId}`);
        }
        const previousTreeSize = BigInt(record.effectiveMetadata.prev.treeSize);
        if (previousTreeSize !== previous.treeSize) {
          throw new Error(`prev.treeSize mismatch for stream ${streamId}`);
        }
        if (
          record.effectiveMetadata.prev.rootHashB64u !== previous.rootHashB64u
        ) {
          throw new Error(`prev.rootHashB64u mismatch for stream ${streamId}`);
        }
      }

      streams.set(streamId, {
        treeSize: currentTreeSize,
        rootHashB64u: record.effectiveMetadata.root.rootHashB64u,
      });
    }
  }

  async getCheckpoints(topicId: string): Promise<HCS27CheckpointRecord[]> {
    const messages = await this.mirrorNode.getTopicMessages(topicId, {
      order: 'asc',
    });
    const records: HCS27CheckpointRecord[] = [];

    for (const item of messages) {
      try {
        const message = toHCS27CheckpointMessage(
          hcs27CheckpointMessageSchema.parse({
            p: item.p,
            op: item.op,
            metadata: item.metadata,
            metadata_digest: item.metadata_digest,
            m: item.m,
          }),
        );

        const effectiveMetadata = await this.validateCheckpointMessage(message);
        records.push({
          topicId,
          sequence: item.sequence_number,
          consensusTimestamp: item.consensus_timestamp ?? '',
          payer:
            typeof item.payer_account_id === 'string'
              ? item.payer_account_id
              : item.payer,
          message,
          effectiveMetadata,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Skipping invalid HCS-27 checkpoint message: ${detail}`,
        );
      }
    }

    return records;
  }

  async resolveHCS1Reference(reference: string): Promise<Buffer> {
    const trimmed = reference.trim();
    if (!/^hcs:\/\/1\/\d+\.\d+\.\d+$/.test(trimmed)) {
      throw new Error(`Invalid HCS-1 reference: ${reference}`);
    }

    const resolved = await this.hrlResolver.resolveHRL(trimmed, {
      network: this.network,
      returnRaw: true,
    });
    if (typeof resolved.content === 'string') {
      return Buffer.from(resolved.content, 'utf8');
    }
    return Buffer.from(resolved.content);
  }
}
