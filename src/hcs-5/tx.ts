import { TokenMintTransaction, TokenId } from '@hashgraph/sdk';
import { buildHcs1Hrl } from './types';

export function buildHcs5MintTx(params: {
  tokenId: string;
  metadata: string;
  transactionMemo?: string;
}): TokenMintTransaction {
  const tx = new TokenMintTransaction()
    .setTokenId(TokenId.fromString(params.tokenId))
    .setMetadata([Buffer.from(params.metadata)]);
  if (params.transactionMemo) {
    tx.setTransactionMemo(params.transactionMemo);
  }
  return tx;
}

export function buildHcs5MintWithHrlTx(params: {
  tokenId: string;
  metadataTopicId: string;
  transactionMemo?: string;
}): TokenMintTransaction {
  const metadata = buildHcs1Hrl(params.metadataTopicId);
  return buildHcs5MintTx({
    tokenId: params.tokenId,
    metadata,
    transactionMemo: params.transactionMemo,
  });
}
