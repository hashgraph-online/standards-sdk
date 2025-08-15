import { proto } from '@hashgraph/proto';

/**
 * Registry for mapping protobuf transaction body fields to transaction type strings
 * This eliminates the massive if-else chain in detectTransactionTypeFromBody
 */
export const protoFieldToTypeRegistry: Partial<
  Record<
    keyof proto.TransactionBody,
    { type: string; humanReadableType: string }
  >
> = {
  tokenCreation: { type: 'TOKENCREATE', humanReadableType: 'Token Creation' },
  tokenAirdrop: { type: 'TOKENAIRDROP', humanReadableType: 'Token Airdrop' },
  tokenMint: { type: 'TOKENMINT', humanReadableType: 'Token Mint' },
  tokenBurn: { type: 'TOKENBURN', humanReadableType: 'Token Burn' },
  tokenUpdate: { type: 'TOKENUPDATE', humanReadableType: 'Token Update' },
  tokenDeletion: { type: 'TOKENDELETE', humanReadableType: 'Token Deletion' },
  tokenAssociate: {
    type: 'TOKENASSOCIATE',
    humanReadableType: 'Token Association',
  },
  tokenDissociate: {
    type: 'TOKENDISSOCIATE',
    humanReadableType: 'Token Dissociation',
  },
  tokenFreeze: { type: 'TOKENFREEZE', humanReadableType: 'Token Freeze' },
  tokenUnfreeze: { type: 'TOKENUNFREEZE', humanReadableType: 'Token Unfreeze' },
  tokenGrantKyc: {
    type: 'TOKENGRANTKYC',
    humanReadableType: 'Token Grant KYC',
  },
  tokenRevokeKyc: {
    type: 'TOKENREVOKEKYC',
    humanReadableType: 'Token Revoke KYC',
  },
  tokenPause: { type: 'TOKENPAUSE', humanReadableType: 'Token Pause' },
  tokenUnpause: { type: 'TOKENUNPAUSE', humanReadableType: 'Token Unpause' },
  tokenWipe: { type: 'TOKENWIPE', humanReadableType: 'Token Wipe' },
  tokenFeeScheduleUpdate: {
    type: 'TOKENFEESCHEDULEUPDATE',
    humanReadableType: 'Token Fee Schedule Update',
  },
  tokenCancelAirdrop: {
    type: 'TOKENCANCELAIRDROP',
    humanReadableType: 'Cancel Token Airdrop',
  },
  tokenClaimAirdrop: {
    type: 'TOKENCLAIMAIRDROP',
    humanReadableType: 'Claim Token Airdrop',
  },
  tokenReject: { type: 'TOKENREJECT', humanReadableType: 'Token Reject' },
  tokenUpdateNfts: {
    type: 'TOKENUPDATENFTS',
    humanReadableType: 'Update NFT Metadata',
  },

  cryptoTransfer: {
    type: 'CRYPTOTRANSFER',
    humanReadableType: 'Crypto Transfer',
  },
  cryptoCreateAccount: {
    type: 'ACCOUNTCREATE',
    humanReadableType: 'Account Creation',
  },
  cryptoUpdateAccount: {
    type: 'ACCOUNTUPDATE',
    humanReadableType: 'Account Update',
  },
  cryptoDelete: {
    type: 'ACCOUNTDELETE',
    humanReadableType: 'Account Deletion',
  },
  cryptoApproveAllowance: {
    type: 'APPROVEALLOWANCE',
    humanReadableType: 'Approve Allowance',
  },
  cryptoDeleteAllowance: {
    type: 'DELETEALLOWANCE',
    humanReadableType: 'Delete Allowance',
  },
  cryptoAddLiveHash: {
    type: 'CRYPTOADDLIVEHASH',
    humanReadableType: 'Add Live Hash',
  },
  cryptoDeleteLiveHash: {
    type: 'CRYPTODELETELIVEHASH',
    humanReadableType: 'Delete Live Hash',
  },

  consensusCreateTopic: {
    type: 'TOPICCREATE',
    humanReadableType: 'Topic Creation',
  },
  consensusSubmitMessage: {
    type: 'CONSENSUSSUBMITMESSAGE',
    humanReadableType: 'Submit Message',
  },
  consensusUpdateTopic: {
    type: 'TOPICUPDATE',
    humanReadableType: 'Topic Update',
  },
  consensusDeleteTopic: {
    type: 'TOPICDELETE',
    humanReadableType: 'Topic Deletion',
  },
  uncheckedSubmit: {
    type: 'UNCHECKEDSUBMIT',
    humanReadableType: 'Unchecked Submit',
  },

  contractCall: { type: 'CONTRACTCALL', humanReadableType: 'Contract Call' },
  contractCreateInstance: {
    type: 'CONTRACTCREATE',
    humanReadableType: 'Contract Creation',
  },
  contractUpdateInstance: {
    type: 'CONTRACTUPDATE',
    humanReadableType: 'Contract Update',
  },
  contractDeleteInstance: {
    type: 'CONTRACTDELETE',
    humanReadableType: 'Contract Deletion',
  },
  ethereumTransaction: {
    type: 'ETHEREUMTRANSACTION',
    humanReadableType: 'Ethereum Transaction',
  },

  fileCreate: { type: 'FILECREATE', humanReadableType: 'File Creation' },
  fileUpdate: { type: 'FILEUPDATE', humanReadableType: 'File Update' },
  fileDelete: { type: 'FILEDELETE', humanReadableType: 'File Deletion' },
  fileAppend: { type: 'FILEAPPEND', humanReadableType: 'File Append' },

  scheduleCreate: {
    type: 'SCHEDULECREATE',
    humanReadableType: 'Schedule Creation',
  },
  scheduleSign: { type: 'SCHEDULESIGN', humanReadableType: 'Schedule Sign' },
  scheduleDelete: {
    type: 'SCHEDULEDELETE',
    humanReadableType: 'Schedule Deletion',
  },

  freeze: { type: 'FREEZE', humanReadableType: 'Network Freeze' },
  systemDelete: { type: 'SYSTEMDELETE', humanReadableType: 'System Delete' },
  systemUndelete: {
    type: 'SYSTEMUNDELETE',
    humanReadableType: 'System Undelete',
  },

  nodeCreate: { type: 'NODECREATE', humanReadableType: 'Node Creation' },
  nodeUpdate: { type: 'NODEUPDATE', humanReadableType: 'Node Update' },
  nodeDelete: { type: 'NODEDELETE', humanReadableType: 'Node Deletion' },
  nodeStakeUpdate: {
    type: 'NODESTAKEUPDATE',
    humanReadableType: 'Node Stake Update',
  },

  utilPrng: { type: 'PRNG', humanReadableType: 'Pseudo Random Number' },

  atomicBatch: { type: 'ATOMICBATCH', humanReadableType: 'Atomic Batch' },

  stateSignatureTransaction: {
    type: 'STATESIGNATURETRANSACTION',
    humanReadableType: 'State Signature',
  },

  historyProofSignature: {
    type: 'HISTORYPROOFSIGNATURE',
    humanReadableType: 'History Proof Signature',
  },
  historyProofKeyPublication: {
    type: 'HISTORYPROOFKEYPUBLICATION',
    humanReadableType: 'History Proof Key Publication',
  },
  historyProofVote: {
    type: 'HISTORYPROOFVOTE',
    humanReadableType: 'History Proof Vote',
  },

  hintsPreprocessingVote: {
    type: 'HINTSPREPROCESSINGVOTE',
    humanReadableType: 'Hints Preprocessing Vote',
  },
  hintsKeyPublication: {
    type: 'HINTSKEYPUBLICATION',
    humanReadableType: 'Hints Key Publication',
  },
  hintsPartialSignature: {
    type: 'HINTSPARTIALSIGNATURE',
    humanReadableType: 'Hints Partial Signature',
  },

  crsPublication: {
    type: 'CRSPUBLICATION',
    humanReadableType: 'CRS Publication',
  },

  transactionID: { type: 'UNKNOWN', humanReadableType: 'Unknown Transaction' },
  nodeAccountID: { type: 'UNKNOWN', humanReadableType: 'Unknown Transaction' },
  transactionFee: { type: 'UNKNOWN', humanReadableType: 'Unknown Transaction' },
  transactionValidDuration: {
    type: 'UNKNOWN',
    humanReadableType: 'Unknown Transaction',
  },
  generateRecord: { type: 'UNKNOWN', humanReadableType: 'Unknown Transaction' },
  memo: { type: 'UNKNOWN', humanReadableType: 'Unknown Transaction' },
  batchKey: { type: 'UNKNOWN', humanReadableType: 'Unknown Transaction' },
  maxCustomFees: { type: 'UNKNOWN', humanReadableType: 'Unknown Transaction' },
} as const;

/**
 * Registry for human-readable transaction type names
 * This eliminates the conditional logic in getHumanReadableType
 */
export const humanReadableTypeRegistry: Record<string, string> = {
  cryptoTransfer: 'HBAR Transfer',
  CRYPTOTRANSFER: 'HBAR Transfer',
  cryptoCreateAccount: 'Create Account',
  ACCOUNTCREATE: 'Create Account',
  cryptoUpdateAccount: 'Update Account',
  ACCOUNTUPDATE: 'Update Account',
  cryptoDeleteAccount: 'Delete Account',
  cryptoDelete: 'Delete Account',
  ACCOUNTDELETE: 'Delete Account',
  cryptoApproveAllowance: 'Approve Allowance',
  APPROVEALLOWANCE: 'Approve Allowance',
  cryptoDeleteAllowance: 'Delete Allowance',
  DELETEALLOWANCE: 'Delete Allowance',
  CRYPTOADDLIVEHASH: 'Add Live Hash',
  CRYPTODELETELIVEHASH: 'Delete Live Hash',

  consensusCreateTopic: 'Create Topic',
  TOPICCREATE: 'Create Topic',
  consensusUpdateTopic: 'Update Topic',
  TOPICUPDATE: 'Update Topic',
  consensusSubmitMessage: 'Submit Message',
  CONSENSUSSUBMITMESSAGE: 'Submit Message',
  consensusDeleteTopic: 'Delete Topic',
  TOPICDELETE: 'Delete Topic',
  UNCHECKEDSUBMIT: 'Unchecked Submit',

  fileCreate: 'Create File',
  FILECREATE: 'Create File',
  fileAppend: 'Append File',
  FILEAPPEND: 'Append File',
  fileUpdate: 'Update File',
  FILEUPDATE: 'Update File',
  fileDelete: 'Delete File',
  FILEDELETE: 'Delete File',

  contractCall: 'Contract Call',
  CONTRACTCALL: 'Contract Call',
  contractCreate: 'Create Contract',
  CONTRACTCREATE: 'Create Contract',
  contractUpdate: 'Update Contract',
  CONTRACTUPDATE: 'Update Contract',
  contractDelete: 'Delete Contract',
  CONTRACTDELETE: 'Delete Contract',
  ethereumTransaction: 'Ethereum Transaction',
  ETHEREUMTRANSACTION: 'Ethereum Transaction',

  tokenCreate: 'Create Token',
  TOKENCREATE: 'Create Token',
  tokenUpdate: 'Update Token',
  TOKENUPDATE: 'Update Token',
  tokenDelete: 'Delete Token',
  TOKENDELETE: 'Delete Token',
  tokenAssociate: 'Associate Token',
  TOKENASSOCIATE: 'Associate Token',
  tokenDissociate: 'Dissociate Token',
  TOKENDISSOCIATE: 'Dissociate Token',
  tokenMint: 'Mint Token',
  TOKENMINT: 'Mint Token',
  tokenBurn: 'Burn Token',
  TOKENBURN: 'Burn Token',
  tokenFeeScheduleUpdate: 'Update Token Fee Schedule',
  TOKENFEESCHEDULEUPDATE: 'Update Token Fee Schedule',
  tokenFreeze: 'Freeze Token',
  TOKENFREEZE: 'Freeze Token',
  tokenUnfreeze: 'Unfreeze Token',
  TOKENUNFREEZE: 'Unfreeze Token',
  tokenGrantKyc: 'Grant KYC',
  TOKENGRANTKYC: 'Grant KYC',
  tokenRevokeKyc: 'Revoke KYC',
  TOKENREVOKEKYC: 'Revoke KYC',
  tokenPause: 'Pause Token',
  TOKENPAUSE: 'Pause Token',
  tokenUnpause: 'Unpause Token',
  TOKENUNPAUSE: 'Unpause Token',
  tokenWipe: 'Wipe Token',
  TOKENWIPE: 'Wipe Token',
  tokenAirdrop: 'Token Airdrop',
  TOKENAIRDROP: 'Token Airdrop',
  TOKENCANCELAIRDROP: 'Cancel Token Airdrop',
  TOKENCLAIMAIRDROP: 'Claim Token Airdrop',
  TOKENREJECT: 'Token Reject',
  TOKENUPDATENFTS: 'Update NFT Metadata',

  scheduleCreate: 'Create Schedule',
  SCHEDULECREATE: 'Create Schedule',
  scheduleSign: 'Sign Schedule',
  SCHEDULESIGN: 'Sign Schedule',
  SCHEDULEDELETE: 'Delete Schedule',

  FREEZE: 'Network Freeze',
  SYSTEMDELETE: 'System Delete',
  SYSTEMUNDELETE: 'System Undelete',

  NODECREATE: 'Create Node',
  NODEUPDATE: 'Update Node',
  NODEDELETE: 'Delete Node',
  NODESTAKEUPDATE: 'Update Node Stake',

  utilPrng: 'Generate Random Number',
  PRNG: 'Generate Random Number',

  ATOMICBATCH: 'Atomic Batch',
  STATESIGNATURETRANSACTION: 'State Signature',
  HISTORYPROOFSIGNATURE: 'History Proof Signature',
  HISTORYPROOFKEYPUBLICATION: 'History Proof Key Publication',
  HISTORYPROOFVOTE: 'History Proof Vote',
  HINTSPREPROCESSINGVOTE: 'Hints Preprocessing Vote',
  HINTSKEYPUBLICATION: 'Hints Key Publication',
  HINTSPARTIALSIGNATURE: 'Hints Partial Signature',
  CRSPUBLICATION: 'CRS Publication',

  unknown: 'Unknown Transaction',
  UNKNOWN: 'Unknown Transaction',
} as const;

/**
 * Registry for schedulable transaction body field to transaction type mapping
 * This eliminates the conditional logic in getTransactionType
 */
export const schedulableTransactionTypeRegistry: Record<string, string> = {
  tokenCreation: 'tokenCreate',
  tokenAirdrop: 'tokenAirdrop',
  cryptoTransfer: 'cryptoTransfer',
  consensusSubmitMessage: 'consensusSubmitMessage',
  contractCall: 'contractCall',
  cryptoCreateAccount: 'cryptoCreateAccount',
  cryptoUpdateAccount: 'cryptoUpdateAccount',
  cryptoApproveAllowance: 'cryptoApproveAllowance',
  cryptoDeleteAllowance: 'cryptoDeleteAllowance',
  cryptoDelete: 'cryptoDelete',
  consensusCreateTopic: 'consensusCreateTopic',
  consensusUpdateTopic: 'consensusUpdateTopic',
  consensusDeleteTopic: 'consensusDeleteTopic',
  fileCreate: 'fileCreate',
  fileAppend: 'fileAppend',
  fileUpdate: 'fileUpdate',
  fileDelete: 'fileDelete',
  contractCreateInstance: 'contractCreate',
  contractUpdateInstance: 'contractUpdate',
  contractDeleteInstance: 'contractDelete',
  tokenUpdate: 'tokenUpdate',
  tokenDeletion: 'tokenDelete',
  tokenAssociate: 'tokenAssociate',
  tokenDissociate: 'tokenDissociate',
  tokenMint: 'tokenMint',
  tokenBurn: 'tokenBurn',
  tokenFeeScheduleUpdate: 'tokenFeeScheduleUpdate',
  tokenFreeze: 'tokenFreeze',
  tokenUnfreeze: 'tokenUnfreeze',
  tokenGrantKyc: 'tokenGrantKyc',
  tokenRevokeKyc: 'tokenRevokeKyc',
  tokenPause: 'tokenPause',
  tokenUnpause: 'tokenUnpause',
  tokenWipe: 'tokenWipe',
  utilPrng: 'utilPrng',
} as const;

/**
 * Get transaction type and human readable type from protobuf transaction body
 * Replaces the massive if-else chain in detectTransactionTypeFromBody
 */
export function getTransactionTypeFromBody(txBody: proto.TransactionBody): {
  type: string;
  humanReadableType: string;
} {
  for (const [field, typeInfo] of Object.entries(protoFieldToTypeRegistry)) {
    if (txBody[field as keyof proto.TransactionBody]) {
      return typeInfo;
    }
  }

  return { type: 'UNKNOWN', humanReadableType: 'Unknown Transaction' };
}

/**
 * Get transaction type from schedulable transaction body
 * Replaces the conditional logic in getTransactionType
 */
export function getSchedulableTransactionType(
  txBody: proto.SchedulableTransactionBody,
): string {
  for (const [field, type] of Object.entries(
    schedulableTransactionTypeRegistry,
  )) {
    if (txBody[field as keyof proto.SchedulableTransactionBody]) {
      return type;
    }
  }

  return 'unknown';
}

/**
 * Get human readable transaction type
 * Replaces the conditional logic in getHumanReadableType
 */
export function getHumanReadableTransactionType(type: string): string {
  return humanReadableTypeRegistry[type] || 'Unknown Transaction';
}
