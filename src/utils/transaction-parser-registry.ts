import { proto } from '@hashgraph/proto';
import { HTSParser } from './parsers/hts-parser';
import { HCSParser } from './parsers/hcs-parser';
import { CryptoParser } from './parsers/crypto-parser';
import { FileParser } from './parsers/file-parser';
import { SCSParser } from './parsers/scs-parser';
import { ScheduleParser } from './parsers/schedule-parser';
import { UtilParser } from './parsers/util-parser';
import type { ParsedTransaction } from './transaction-parser-types';

/**
 * Registry mapping transaction types to their parser functions
 * This scalable approach allows easy addition of new transaction types
 * without modifying the core parsing logic
 */
export const transactionParserRegistry: Record<
  string,
  {
    bodyField: keyof proto.TransactionBody;
    parser: (data: any) => any;
    resultField: keyof Partial<ParsedTransaction>;
    spreadResult?: boolean;
  }
> = {
  TOKENCREATE: {
    bodyField: 'tokenCreation',
    parser: HTSParser.parseTokenCreate,
    resultField: 'tokenCreation',
  },
  TOKENMINT: {
    bodyField: 'tokenMint',
    parser: HTSParser.parseTokenMint,
    resultField: 'tokenMint',
  },
  TOKENBURN: {
    bodyField: 'tokenBurn',
    parser: HTSParser.parseTokenBurn,
    resultField: 'tokenBurn',
  },
  TOKENUPDATE: {
    bodyField: 'tokenUpdate',
    parser: HTSParser.parseTokenUpdate,
    resultField: 'tokenUpdate',
  },
  TOKENDELETE: {
    bodyField: 'tokenDeletion',
    parser: HTSParser.parseTokenDelete,
    resultField: 'tokenDelete',
  },
  TOKENASSOCIATE: {
    bodyField: 'tokenAssociate',
    parser: HTSParser.parseTokenAssociate,
    resultField: 'tokenAssociate',
  },
  TOKENDISSOCIATE: {
    bodyField: 'tokenDissociate',
    parser: HTSParser.parseTokenDissociate,
    resultField: 'tokenDissociate',
  },
  TOKENFREEZE: {
    bodyField: 'tokenFreeze',
    parser: HTSParser.parseTokenFreeze,
    resultField: 'tokenFreeze',
  },
  TOKENUNFREEZE: {
    bodyField: 'tokenUnfreeze',
    parser: HTSParser.parseTokenUnfreeze,
    resultField: 'tokenUnfreeze',
  },
  TOKENGRANTKYC: {
    bodyField: 'tokenGrantKyc',
    parser: HTSParser.parseTokenGrantKyc,
    resultField: 'tokenGrantKyc',
  },
  TOKENREVOKEKYC: {
    bodyField: 'tokenRevokeKyc',
    parser: HTSParser.parseTokenRevokeKyc,
    resultField: 'tokenRevokeKyc',
  },
  TOKENPAUSE: {
    bodyField: 'tokenPause',
    parser: HTSParser.parseTokenPause,
    resultField: 'tokenPause',
  },
  TOKENUNPAUSE: {
    bodyField: 'tokenUnpause',
    parser: HTSParser.parseTokenUnpause,
    resultField: 'tokenUnpause',
  },
  TOKENWIPEACCOUNT: {
    bodyField: 'tokenWipe',
    parser: HTSParser.parseTokenWipeAccount,
    resultField: 'tokenWipeAccount',
  },
  TOKENFEESCHEDULEUPDATE: {
    bodyField: 'tokenFeeScheduleUpdate',
    parser: HTSParser.parseTokenFeeScheduleUpdate,
    resultField: 'tokenFeeScheduleUpdate',
  },
  TOKENAIRDROP: {
    bodyField: 'tokenAirdrop',
    parser: HTSParser.parseTokenAirdropFromProto,
    resultField: 'tokenAirdrop',
  },

  TOPICCREATE: {
    bodyField: 'consensusCreateTopic',
    parser: HCSParser.parseConsensusCreateTopic,
    resultField: 'consensusCreateTopic',
  },
  CONSENSUSSUBMITMESSAGE: {
    bodyField: 'consensusSubmitMessage',
    parser: HCSParser.parseConsensusSubmitMessage,
    resultField: 'consensusSubmitMessage',
  },
  TOPICUPDATE: {
    bodyField: 'consensusUpdateTopic',
    parser: HCSParser.parseConsensusUpdateTopic,
    resultField: 'consensusUpdateTopic',
  },
  TOPICDELETE: {
    bodyField: 'consensusDeleteTopic',
    parser: HCSParser.parseConsensusDeleteTopic,
    resultField: 'consensusDeleteTopic',
  },

  ACCOUNTCREATE: {
    bodyField: 'cryptoCreateAccount',
    parser: CryptoParser.parseCryptoCreateAccount,
    resultField: 'cryptoCreateAccount',
  },
  ACCOUNTUPDATE: {
    bodyField: 'cryptoUpdateAccount',
    parser: CryptoParser.parseCryptoUpdateAccount,
    resultField: 'cryptoUpdateAccount',
  },
  ACCOUNTDELETE: {
    bodyField: 'cryptoDelete',
    parser: CryptoParser.parseCryptoDelete,
    resultField: 'cryptoDelete',
  },
  CRYPTOTRANSFER: {
    bodyField: 'cryptoTransfer',
    parser: (body: proto.ICryptoTransferTransactionBody) => {
      const result: Partial<ParsedTransaction> = {
        transfers: [],
        tokenTransfers: [],
      };
      CryptoParser.parseCryptoTransfers(body, result as ParsedTransaction);
      return result;
    },
    resultField: 'transfers' as keyof Partial<ParsedTransaction>,
    spreadResult: true,
  },
  APPROVEALLOWANCE: {
    bodyField: 'cryptoApproveAllowance',
    parser: CryptoParser.parseCryptoApproveAllowance,
    resultField: 'cryptoApproveAllowance',
  },
  DELETEALLOWANCE: {
    bodyField: 'cryptoDeleteAllowance',
    parser: CryptoParser.parseCryptoDeleteAllowance,
    resultField: 'cryptoDeleteAllowance',
  },

  FILECREATE: {
    bodyField: 'fileCreate',
    parser: FileParser.parseFileCreate,
    resultField: 'fileCreate',
  },
  FILEUPDATE: {
    bodyField: 'fileUpdate',
    parser: FileParser.parseFileUpdate,
    resultField: 'fileUpdate',
  },
  FILEDELETE: {
    bodyField: 'fileDelete',
    parser: FileParser.parseFileDelete,
    resultField: 'fileDelete',
  },
  FILEAPPEND: {
    bodyField: 'fileAppend',
    parser: FileParser.parseFileAppend,
    resultField: 'fileAppend',
  },

  CONTRACTCREATE: {
    bodyField: 'contractCreateInstance',
    parser: SCSParser.parseContractCreate,
    resultField: 'contractCreate',
  },
  CONTRACTUPDATE: {
    bodyField: 'contractUpdateInstance',
    parser: SCSParser.parseContractUpdate,
    resultField: 'contractUpdate',
  },
  CONTRACTDELETE: {
    bodyField: 'contractDeleteInstance',
    parser: SCSParser.parseContractDelete,
    resultField: 'contractDelete',
  },
  CONTRACTCALL: {
    bodyField: 'contractCall',
    parser: SCSParser.parseContractCall,
    resultField: 'contractCall',
  },
  ETHEREUMTRANSACTION: {
    bodyField: 'ethereumTransaction',
    parser: SCSParser.parseEthereumTransaction,
    resultField: 'ethereumTransaction',
  },

  SCHEDULECREATE: {
    bodyField: 'scheduleCreate',
    parser: ScheduleParser.parseScheduleCreateFromProto,
    resultField: 'scheduleCreate',
  },
  SCHEDULESIGN: {
    bodyField: 'scheduleSign',
    parser: ScheduleParser.parseScheduleSignFromProto,
    resultField: 'scheduleSign',
  },
  SCHEDULEDELETE: {
    bodyField: 'scheduleDelete',
    parser: ScheduleParser.parseScheduleDeleteFromProto,
    resultField: 'scheduleDelete',
  },

  PRNG: {
    bodyField: 'utilPrng',
    parser: UtilParser.parseUtilPrng,
    resultField: 'utilPrng',
  },
  FREEZE: {
    bodyField: 'freeze',
    parser: UtilParser.parseFreeze,
    resultField: 'freeze',
  },

  SYSTEMDELETE: {
    bodyField: 'systemDelete',
    parser: (body: proto.ISystemDeleteTransactionBody) => ({
      fileId: body.fileID
        ? `${body.fileID.shardNum}.${body.fileID.realmNum}.${body.fileID.fileNum}`
        : undefined,
      contractId: body.contractID
        ? `${body.contractID.shardNum}.${body.contractID.realmNum}.${body.contractID.contractNum}`
        : undefined,
      expirationTime: body.expirationTime?.seconds
        ? body.expirationTime.seconds.toString()
        : undefined,
    }),
    resultField: 'systemDelete',
  },
  SYSTEMUNDELETE: {
    bodyField: 'systemUndelete',
    parser: (body: proto.ISystemUndeleteTransactionBody) => ({
      fileId: body.fileID
        ? `${body.fileID.shardNum}.${body.fileID.realmNum}.${body.fileID.fileNum}`
        : undefined,
      contractId: body.contractID
        ? `${body.contractID.shardNum}.${body.contractID.realmNum}.${body.contractID.contractNum}`
        : undefined,
    }),
    resultField: 'systemUndelete',
  },

  TOKENCANCELAIRDROP: {
    bodyField: 'tokenCancelAirdrop',
    parser: (body: any) => ({
      pendingAirdrops: body.pendingAirdrops || [],
    }),
    resultField: 'tokenCancelAirdrop',
  },
  TOKENCLAIMAIRDROP: {
    bodyField: 'tokenClaimAirdrop',
    parser: (body: any) => ({
      pendingAirdrops: body.pendingAirdrops || [],
    }),
    resultField: 'tokenClaimAirdrop',
  },
  TOKENREJECT: {
    bodyField: 'tokenReject',
    parser: (body: any) => ({
      owner: body.owner
        ? `${body.owner.shardNum}.${body.owner.realmNum}.${body.owner.accountNum}`
        : undefined,
      rejections: body.rejections || [],
    }),
    resultField: 'tokenReject',
  },
  TOKENUPDATENFTS: {
    bodyField: 'tokenUpdateNfts',
    parser: (body: any) => ({
      tokenId: body.token
        ? `${body.token.shardNum}.${body.token.realmNum}.${body.token.tokenNum}`
        : undefined,
      serialNumbers: body.serialNumbers || [],
      metadata: body.metadata,
    }),
    resultField: 'tokenUpdateNfts',
  },
  TOKENWIPE: {
    bodyField: 'tokenWipe',
    parser: HTSParser.parseTokenWipeAccount,
    resultField: 'tokenWipeAccount',
  },

  CRYPTOADDLIVEHASH: {
    bodyField: 'cryptoAddLiveHash',
    parser: (body: any) => ({
      accountId: body.accountID
        ? `${body.accountID.shardNum}.${body.accountID.realmNum}.${body.accountID.accountNum}`
        : undefined,
      liveHash: body.liveHash,
    }),
    resultField: 'cryptoAddLiveHash',
  },
  CRYPTODELETELIVEHASH: {
    bodyField: 'cryptoDeleteLiveHash',
    parser: (body: any) => ({
      accountId: body.accountOfLiveHash
        ? `${body.accountOfLiveHash.shardNum}.${body.accountOfLiveHash.realmNum}.${body.accountOfLiveHash.accountNum}`
        : undefined,
      liveHashToDelete: body.liveHashToDelete,
    }),
    resultField: 'cryptoDeleteLiveHash',
  },

  UNCHECKEDSUBMIT: {
    bodyField: 'uncheckedSubmit',
    parser: (body: any) => ({
      topicId: body.topicID
        ? `${body.topicID.shardNum}.${body.topicID.realmNum}.${body.topicID.topicNum}`
        : undefined,
      message: body.message,
    }),
    resultField: 'uncheckedSubmit',
  },

  NODECREATE: {
    bodyField: 'nodeCreate',
    parser: (body: any) => ({
      accountId: body.accountId
        ? `${body.accountId.shardNum}.${body.accountId.realmNum}.${body.accountId.accountNum}`
        : undefined,
      description: body.description,
      gossipEndpoint: body.gossipEndpoint,
      serviceEndpoint: body.serviceEndpoint,
      gossipCaCertificate: body.gossipCaCertificate,
      grpcCertificateHash: body.grpcCertificateHash,
      adminKey: body.adminKey,
    }),
    resultField: 'nodeCreate',
  },
  NODEUPDATE: {
    bodyField: 'nodeUpdate',
    parser: (body: any) => ({
      nodeId: body.nodeId?.toString(),
      accountId: body.accountId
        ? `${body.accountId.shardNum}.${body.accountId.realmNum}.${body.accountId.accountNum}`
        : undefined,
      description: body.description,
      gossipEndpoint: body.gossipEndpoint,
      serviceEndpoint: body.serviceEndpoint,
      gossipCaCertificate: body.gossipCaCertificate,
      grpcCertificateHash: body.grpcCertificateHash,
      adminKey: body.adminKey,
    }),
    resultField: 'nodeUpdate',
  },
  NODEDELETE: {
    bodyField: 'nodeDelete',
    parser: (body: any) => ({
      nodeId: body.nodeId?.toString(),
    }),
    resultField: 'nodeDelete',
  },
  NODESTAKEUPDATE: {
    bodyField: 'nodeStakeUpdate',
    parser: (body: any) => ({
      nodeId: body.nodeId?.toString(),
      maxStake: body.maxStake?.toString(),
      minStake: body.minStake?.toString(),
      rewardRate: body.rewardRate?.toString(),
    }),
    resultField: 'nodeStakeUpdate',
  },

  ATOMICBATCH: {
    bodyField: 'atomicBatch',
    parser: (body: any) => ({
      transactions: body.transactions || [],
    }),
    resultField: 'atomicBatch',
  },

  STATESIGNATURETRANSACTION: {
    bodyField: 'stateSignatureTransaction',
    parser: (body: any) => ({
      signature: body.signature,
      round: body.round?.toString(),
    }),
    resultField: 'stateSignatureTransaction',
  },

  HISTORYPROOFSIGNATURE: {
    bodyField: 'historyProofSignature',
    parser: (body: any) => ({
      signature: body.signature,
      round: body.round?.toString(),
    }),
    resultField: 'historyProofSignature',
  },
  HISTORYPROOFKEYPUBLICATION: {
    bodyField: 'historyProofKeyPublication',
    parser: (body: any) => ({
      publicKey: body.publicKey,
      round: body.round?.toString(),
    }),
    resultField: 'historyProofKeyPublication',
  },
  HISTORYPROOFVOTE: {
    bodyField: 'historyProofVote',
    parser: (body: any) => ({
      vote: body.vote,
      round: body.round?.toString(),
    }),
    resultField: 'historyProofVote',
  },

  HINTSPREPROCESSINGVOTE: {
    bodyField: 'hintsPreprocessingVote',
    parser: (body: any) => ({
      vote: body.vote,
      round: body.round?.toString(),
    }),
    resultField: 'hintsPreprocessingVote',
  },
  HINTSKEYPUBLICATION: {
    bodyField: 'hintsKeyPublication',
    parser: (body: any) => ({
      publicKey: body.publicKey,
      round: body.round?.toString(),
    }),
    resultField: 'hintsKeyPublication',
  },
  HINTSPARTIALSIGNATURE: {
    bodyField: 'hintsPartialSignature',
    parser: (body: any) => ({
      signature: body.signature,
      round: body.round?.toString(),
    }),
    resultField: 'hintsPartialSignature',
  },

  CRSPUBLICATION: {
    bodyField: 'crsPublication',
    parser: (body: any) => ({
      crs: body.crs,
      round: body.round?.toString(),
    }),
    resultField: 'crsPublication',
  },
};

/**
 * Get parser configuration for a transaction type
 */
export function getParserConfig(transactionType: string) {
  return transactionParserRegistry[transactionType];
}

/**
 * Check if a transaction type is supported
 */
export function isTransactionTypeSupported(transactionType: string): boolean {
  return transactionType in transactionParserRegistry;
}

/**
 * Get all supported transaction types
 */
export function getSupportedTransactionTypes(): string[] {
  return Object.keys(transactionParserRegistry);
}
