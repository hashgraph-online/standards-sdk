import type {
  ParsedTransaction,
  TokenAmount,
} from './transaction-parser-types';

export type TransactionSummaryFn = (tx: ParsedTransaction) => string;
export type TransactionSummarySpec = {
  template?: string;
  fn?: TransactionSummaryFn;
};

const getNested = (tx: ParsedTransaction, path: string): unknown => {
  const parts = path.split('.');
  let current: any = tx as any;
  for (const p of parts) {
    if (current == null) {
      return undefined;
    }
    current = current[p];
  }
  return current;
};

const renderTemplate = (template: string, tx: ParsedTransaction): string => {
  return template.replace(/\{([^}]+)\}/g, (_m, path) => {
    const value = getNested(tx, String(path).trim());
    if (value === null || value === undefined) {
      return '(Unknown)';
    }
    return String(value);
  });
};

const summarizeCryptoTransfer = (tx: ParsedTransaction): string => {
  const senders: string[] = [];
  const receivers: string[] = [];

  if (Array.isArray(tx.transfers)) {
    for (const transfer of tx.transfers) {
      const originalAmountFloat = parseFloat(transfer.amount);
      let displayStr = transfer.amount;
      if (displayStr.startsWith('-')) {
        displayStr = displayStr.substring(1);
      }
      displayStr = displayStr.replace(/\s*ℏ$/, '');
      if (originalAmountFloat < 0) {
        senders.push(`${transfer.accountId} (${displayStr} ℏ)`);
      } else if (originalAmountFloat > 0) {
        receivers.push(`${transfer.accountId} (${displayStr} ℏ)`);
      }
    }
  }

  if (senders.length > 0 && receivers.length > 0) {
    return `Transfer of HBAR from ${senders.join(', ')} to ${receivers.join(', ')}`;
  }
  return tx.humanReadableType;
};

const groupTokenTransfers = (
  tokenTransfers: TokenAmount[],
): Record<string, TokenAmount[]> => {
  const groups: Record<string, TokenAmount[]> = {};
  for (const t of tokenTransfers) {
    if (!groups[t.tokenId]) {
      groups[t.tokenId] = [];
    }
    groups[t.tokenId].push(t);
  }
  return groups;
};

const summarizeTokenTransfers = (tx: ParsedTransaction): string => {
  const tokenSummaries: string[] = [];
  const groups = groupTokenTransfers(tx.tokenTransfers || []);
  for (const [tokenId, transfers] of Object.entries(groups)) {
    const tokenSenders: string[] = [];
    const tokenReceivers: string[] = [];
    for (const t of transfers) {
      const amt = parseFloat(String(t.amount));
      if (amt < 0) {
        tokenSenders.push(`${t.accountId} (${Math.abs(amt)})`);
      } else if (amt > 0) {
        tokenReceivers.push(`${t.accountId} (${amt})`);
      }
    }
    if (tokenSenders.length > 0 && tokenReceivers.length > 0) {
      tokenSummaries.push(
        `Transfer of token ${tokenId} from ${tokenSenders.join(', ')} to ${tokenReceivers.join(', ')}`,
      );
    }
  }
  if (tokenSummaries.length > 0) {
    return tokenSummaries.join('; ');
  }
  return tx.humanReadableType;
};

const summarizeContractCall = (tx: ParsedTransaction): string => {
  if (!tx.contractCall) {
    return tx.humanReadableType;
  }
  let summary = `Contract call to ${tx.contractCall.contractId} with ${tx.contractCall.gas} gas`;
  if (tx.contractCall.amount > 0) {
    summary += ` and ${tx.contractCall.amount} HBAR`;
  }
  if (tx.contractCall.functionName) {
    summary += ` calling function ${tx.contractCall.functionName}`;
  }
  return summary;
};

const summarizeTokenMint = (tx: ParsedTransaction): string => {
  if (tx.tokenMint) {
    return `Mint ${tx.tokenMint.amount} tokens for token ${tx.tokenMint.tokenId}`;
  }
  return tx.humanReadableType;
};

const summarizeTokenBurn = (tx: ParsedTransaction): string => {
  if (tx.tokenBurn) {
    return `Burn ${tx.tokenBurn.amount} tokens for token ${tx.tokenBurn.tokenId}`;
  }
  return tx.humanReadableType;
};

const summarizeTokenCreate = (tx: ParsedTransaction): string => {
  if (!tx.tokenCreation) {
    return tx.humanReadableType;
  }
  let summary = `Create token ${tx.tokenCreation.tokenName || '(No Name)'} (${tx.tokenCreation.tokenSymbol || '(No Symbol)'})`;
  if (tx.tokenCreation.initialSupply) {
    summary += ` with initial supply ${tx.tokenCreation.initialSupply}`;
  }
  if (tx.tokenCreation.customFees && tx.tokenCreation.customFees.length > 0) {
    summary += ` including ${tx.tokenCreation.customFees.length} custom fee(s)`;
  }
  return summary;
};

const summarizeConsensusCreateTopic = (tx: ParsedTransaction): string => {
  if (!tx.consensusCreateTopic) {
    return tx.humanReadableType;
  }
  let summary = 'Create new topic';
  if (tx.consensusCreateTopic.memo) {
    summary += ` with memo "${tx.consensusCreateTopic.memo}"`;
  }
  if (tx.consensusCreateTopic.autoRenewAccountId) {
    summary += `, auto-renew by ${tx.consensusCreateTopic.autoRenewAccountId}`;
  }
  return summary;
};

const summarizeConsensusSubmitMessage = (tx: ParsedTransaction): string => {
  if (!tx.consensusSubmitMessage) {
    return tx.humanReadableType;
  }
  let summary = 'Submit message';
  if (tx.consensusSubmitMessage.topicId) {
    summary += ` to topic ${tx.consensusSubmitMessage.topicId}`;
  }
  if (tx.consensusSubmitMessage.message) {
    if (tx.consensusSubmitMessage.messageEncoding === 'utf8') {
      const preview = tx.consensusSubmitMessage.message.substring(0, 70);
      const needsEllipsis = tx.consensusSubmitMessage.message.length > 70;
      summary += `: "${preview}${needsEllipsis ? '...' : ''}"`;
    } else {
      const byteLength = Buffer.from(
        tx.consensusSubmitMessage.message,
        'base64',
      ).length;
      summary += ` (binary message data, length: ${byteLength} bytes)`;
    }
  }
  if (
    tx.consensusSubmitMessage.chunkInfoNumber &&
    tx.consensusSubmitMessage.chunkInfoTotal
  ) {
    summary += ` (chunk ${tx.consensusSubmitMessage.chunkInfoNumber}/${tx.consensusSubmitMessage.chunkInfoTotal})`;
  }
  return summary;
};

const summarizeFileCreate = (tx: ParsedTransaction): string => {
  if (!tx.fileCreate) {
    return tx.humanReadableType;
  }
  let summary = 'Create File';
  if (tx.fileCreate.memo) {
    summary += ` with memo "${tx.fileCreate.memo}"`;
  }
  if (tx.fileCreate.contents) {
    summary += ' (includes content)';
  }
  return summary;
};

const summarizeFileAppend = (tx: ParsedTransaction): string => {
  if (tx.fileAppend) {
    return `Append to File ${tx.fileAppend.fileId || '(Unknown ID)'}`;
  }
  return tx.humanReadableType;
};

const summarizeFileUpdate = (tx: ParsedTransaction): string => {
  if (tx.fileUpdate) {
    return `Update File ${tx.fileUpdate.fileId || '(Unknown ID)'}`;
  }
  return tx.humanReadableType;
};

const summarizeFileDelete = (tx: ParsedTransaction): string => {
  if (tx.fileDelete) {
    return `Delete File ${tx.fileDelete.fileId || '(Unknown ID)'}`;
  }
  return tx.humanReadableType;
};

const summarizeConsensusUpdateTopic = (tx: ParsedTransaction): string => {
  if (tx.consensusUpdateTopic) {
    return `Update Topic ${tx.consensusUpdateTopic.topicId || '(Unknown ID)'}`;
  }
  return tx.humanReadableType;
};

const summarizeConsensusDeleteTopic = (tx: ParsedTransaction): string => {
  if (tx.consensusDeleteTopic) {
    return `Delete Topic ${tx.consensusDeleteTopic.topicId || '(Unknown ID)'}`;
  }
  return tx.humanReadableType;
};

const summarizeTokenFreeze = (tx: ParsedTransaction): string => {
  if (tx.tokenFreeze) {
    return `Freeze Token ${tx.tokenFreeze.tokenId} for Account ${tx.tokenFreeze.accountId}`;
  }
  return tx.humanReadableType;
};

const summarizeTokenUnfreeze = (tx: ParsedTransaction): string => {
  if (tx.tokenUnfreeze) {
    return `Unfreeze Token ${tx.tokenUnfreeze.tokenId} for Account ${tx.tokenUnfreeze.accountId}`;
  }
  return tx.humanReadableType;
};

const summarizeTokenGrantKyc = (tx: ParsedTransaction): string => {
  if (tx.tokenGrantKyc) {
    return `Grant KYC for Token ${tx.tokenGrantKyc.tokenId} to Account ${tx.tokenGrantKyc.accountId}`;
  }
  return tx.humanReadableType;
};

const summarizeTokenRevokeKyc = (tx: ParsedTransaction): string => {
  if (tx.tokenRevokeKyc) {
    return `Revoke KYC for Token ${tx.tokenRevokeKyc.tokenId} from Account ${tx.tokenRevokeKyc.accountId}`;
  }
  return tx.humanReadableType;
};

const summarizeTokenPause = (tx: ParsedTransaction): string => {
  if (tx.tokenPause) {
    return `Pause Token ${tx.tokenPause.tokenId}`;
  }
  return tx.humanReadableType;
};

const summarizeTokenUnpause = (tx: ParsedTransaction): string => {
  if (tx.tokenUnpause) {
    return `Unpause Token ${tx.tokenUnpause.tokenId}`;
  }
  return tx.humanReadableType;
};

const summarizeTokenWipe = (tx: ParsedTransaction): string => {
  if (tx.tokenWipeAccount) {
    let summary = `Wipe Token ${tx.tokenWipeAccount.tokenId} from Account ${tx.tokenWipeAccount.accountId}`;
    if (
      tx.tokenWipeAccount.serialNumbers &&
      tx.tokenWipeAccount.serialNumbers.length > 0
    ) {
      summary += ` (Serials: ${tx.tokenWipeAccount.serialNumbers.join(', ')})`;
    }
    if (tx.tokenWipeAccount.amount) {
      summary += ` (Amount: ${tx.tokenWipeAccount.amount})`;
    }
    return summary;
  }
  return tx.humanReadableType;
};

const summarizeTokenDelete = (tx: ParsedTransaction): string => {
  if (tx.tokenDelete) {
    return `Delete Token ${tx.tokenDelete.tokenId}`;
  }
  return tx.humanReadableType;
};

const summarizeTokenAssociate = (tx: ParsedTransaction): string => {
  if (tx.tokenAssociate) {
    return `Associate Account ${tx.tokenAssociate.accountId} with Tokens: ${(tx.tokenAssociate.tokenIds || []).join(', ')}`;
  }
  return tx.humanReadableType;
};

const summarizeTokenDissociate = (tx: ParsedTransaction): string => {
  if (tx.tokenDissociate) {
    return `Dissociate Account ${tx.tokenDissociate.accountId} from Tokens: ${(tx.tokenDissociate.tokenIds || []).join(', ')}`;
  }
  return tx.humanReadableType;
};

const summarizeAccountDelete = (tx: ParsedTransaction): string => {
  if (tx.cryptoDelete) {
    return `Delete Account ${tx.cryptoDelete.deleteAccountId}`;
  }
  return tx.humanReadableType;
};

const summarizeAccountCreate = (tx: ParsedTransaction): string => {
  if (!tx.cryptoCreateAccount) {
    return tx.humanReadableType;
  }
  let summary = 'Create Account';
  if (
    tx.cryptoCreateAccount.initialBalance &&
    tx.cryptoCreateAccount.initialBalance !== '0'
  ) {
    summary += ` with balance ${tx.cryptoCreateAccount.initialBalance}`;
  }
  if (tx.cryptoCreateAccount.alias) {
    summary += ` (Alias: ${tx.cryptoCreateAccount.alias})`;
  }
  return summary;
};

const summarizeAccountUpdate = (tx: ParsedTransaction): string => {
  if (tx.cryptoUpdateAccount) {
    return `Update Account ${tx.cryptoUpdateAccount.accountIdToUpdate || '(Unknown ID)'}`;
  }
  return tx.humanReadableType;
};

const summarizeApproveAllowance = (tx: ParsedTransaction): string => {
  if (tx.cryptoApproveAllowance) {
    let count = 0;
    if (tx.cryptoApproveAllowance.hbarAllowances) {
      count += tx.cryptoApproveAllowance.hbarAllowances.length;
    }
    if (tx.cryptoApproveAllowance.tokenAllowances) {
      count += tx.cryptoApproveAllowance.tokenAllowances.length;
    }
    if (tx.cryptoApproveAllowance.nftAllowances) {
      count += tx.cryptoApproveAllowance.nftAllowances.length;
    }
    return `Approve ${count} Crypto Allowance(s)`;
  }
  return tx.humanReadableType;
};

const summarizeDeleteAllowance = (tx: ParsedTransaction): string => {
  if (tx.cryptoDeleteAllowance) {
    const count = (tx.cryptoDeleteAllowance.nftAllowancesToRemove || []).length;
    return `Delete ${count} NFT Crypto Allowance(s)`;
  }
  return tx.humanReadableType;
};

const summarizeContractCreate = (tx: ParsedTransaction): string => {
  if (tx.contractCreate) {
    let summary = 'Create Contract';
    if (tx.contractCreate.memo) {
      summary += ` (Memo: ${tx.contractCreate.memo})`;
    }
    return summary;
  }
  return tx.humanReadableType;
};

const summarizeContractUpdate = (tx: ParsedTransaction): string => {
  if (tx.contractUpdate) {
    return `Update Contract ${tx.contractUpdate.contractIdToUpdate || '(Unknown ID)'}`;
  }
  return tx.humanReadableType;
};

const summarizeContractDelete = (tx: ParsedTransaction): string => {
  if (tx.contractDelete) {
    let summary = `Delete Contract ${tx.contractDelete.contractIdToDelete || '(Unknown ID)'}`;
    if (tx.contractDelete.transferAccountId) {
      summary += ` (Transfer to Account: ${tx.contractDelete.transferAccountId})`;
    } else if (tx.contractDelete.transferContractId) {
      summary += ` (Transfer to Contract: ${tx.contractDelete.transferContractId})`;
    }
    return summary;
  }
  return tx.humanReadableType;
};

const summarizeTokenUpdate = (tx: ParsedTransaction): string => {
  if (tx.tokenUpdate) {
    return `Update Token ${tx.tokenUpdate.tokenId || '(Unknown ID)'}`;
  }
  return tx.humanReadableType;
};

const summarizeTokenFeeScheduleUpdate = (tx: ParsedTransaction): string => {
  if (tx.tokenFeeScheduleUpdate) {
    return `Update Fee Schedule for Token ${tx.tokenFeeScheduleUpdate.tokenId || '(Unknown ID)'}`;
  }
  return tx.humanReadableType;
};

const summarizePrng = (tx: ParsedTransaction): string => {
  let summary = 'Generate Random Number';
  if (tx.utilPrng && tx.utilPrng.range && tx.utilPrng.range > 0) {
    summary += ` (range up to ${tx.utilPrng.range - 1})`;
  }
  return summary;
};

const summarizeTokenAirdrop = (tx: ParsedTransaction): string => {
  if (!tx.tokenAirdrop || !tx.tokenAirdrop.tokenTransfers) {
    return tx.humanReadableType;
  }
  let tokenTypes = 0;
  let totalTransfers = 0;
  for (const t of tx.tokenAirdrop.tokenTransfers) {
    tokenTypes += 1;
    totalTransfers += Array.isArray(t.transfers) ? t.transfers.length : 0;
  }
  return `Token Airdrop across ${tokenTypes} token(s), ${totalTransfers} transfer(s)`;
};

const summarizeScheduleCreate = (tx: ParsedTransaction): string => {
  if (!tx.scheduleCreate) {
    return tx.humanReadableType;
  }
  let summary = 'Create Schedule';
  if (tx.scheduleCreate.memo) {
    summary += ` (Memo: ${tx.scheduleCreate.memo})`;
  }
  return summary;
};

const summarizeScheduleSign = (tx: ParsedTransaction): string => {
  if (tx.scheduleSign) {
    return 'Sign Schedule';
  }
  return tx.humanReadableType;
};

const summarizeScheduleDelete = (tx: ParsedTransaction): string => {
  if (tx.scheduleDelete) {
    return 'Delete Schedule';
  }
  return tx.humanReadableType;
};

const summarizeSystemDelete = (tx: ParsedTransaction): string => {
  if (!tx.systemDelete) {
    return tx.humanReadableType;
  }
  if (tx.systemDelete.fileId) {
    return `System Delete File ${tx.systemDelete.fileId}`;
  }
  if (tx.systemDelete.contractId) {
    return `System Delete Contract ${tx.systemDelete.contractId}`;
  }
  return 'System Delete';
};

const summarizeSystemUndelete = (tx: ParsedTransaction): string => {
  if (!tx.systemUndelete) {
    return tx.humanReadableType;
  }
  if (tx.systemUndelete.fileId) {
    return `System Undelete File ${tx.systemUndelete.fileId}`;
  }
  if (tx.systemUndelete.contractId) {
    return `System Undelete Contract ${tx.systemUndelete.contractId}`;
  }
  return 'System Undelete';
};

const summarizeFreeze = (tx: ParsedTransaction): string => {
  return 'Network Freeze';
};

const summarizeEthereumTransaction = (tx: ParsedTransaction): string => {
  return 'Ethereum Transaction';
};

const summarizeUncheckedSubmit = (tx: ParsedTransaction): string => {
  if (tx.uncheckedSubmit && tx.uncheckedSubmit.topicId) {
    return `Unchecked Submit to topic ${tx.uncheckedSubmit.topicId}`;
  }
  return 'Unchecked Submit';
};

const summarizeNodeCreate = (tx: ParsedTransaction): string => {
  return 'Create Node';
};

const summarizeNodeUpdate = (tx: ParsedTransaction): string => {
  return 'Update Node';
};

const summarizeNodeDelete = (tx: ParsedTransaction): string => {
  return 'Delete Node';
};

const summarizeAtomicBatch = (tx: ParsedTransaction): string => {
  const count = Array.isArray(tx.atomicBatch?.transactions)
    ? tx.atomicBatch!.transactions!.length
    : 0;
  return `Atomic Batch (${count} transaction(s))`;
};

export const transactionSummaryRegistry: Record<
  string,
  TransactionSummarySpec
> = {
  CRYPTOTRANSFER: { fn: summarizeCryptoTransfer },
  cryptoTransfer: { fn: summarizeCryptoTransfer },
  CONTRACTCALL: { fn: summarizeContractCall },
  contractCall: { fn: summarizeContractCall },
  TOKENMINT: { fn: summarizeTokenMint },
  tokenMint: { fn: summarizeTokenMint },
  TOKENBURN: { fn: summarizeTokenBurn },
  tokenBurn: { fn: summarizeTokenBurn },
  TOKENCREATE: { fn: summarizeTokenCreate },
  tokenCreation: { fn: summarizeTokenCreate },
  TOPICCREATE: { fn: summarizeConsensusCreateTopic },
  consensusCreateTopic: { fn: summarizeConsensusCreateTopic },
  CONSENSUSSUBMITMESSAGE: { fn: summarizeConsensusSubmitMessage },
  consensusSubmitMessage: { fn: summarizeConsensusSubmitMessage },
  TOPICUPDATE: { fn: summarizeConsensusUpdateTopic },
  consensusUpdateTopic: { fn: summarizeConsensusUpdateTopic },
  TOPICDELETE: { fn: summarizeConsensusDeleteTopic },
  consensusDeleteTopic: { fn: summarizeConsensusDeleteTopic },
  FILECREATE: { fn: summarizeFileCreate },
  fileCreate: { fn: summarizeFileCreate },
  FILEAPPEND: { fn: summarizeFileAppend },
  fileAppend: { fn: summarizeFileAppend },
  FILEUPDATE: { fn: summarizeFileUpdate },
  fileUpdate: { fn: summarizeFileUpdate },
  FILEDELETE: { fn: summarizeFileDelete },
  fileDelete: { fn: summarizeFileDelete },
  TOKENUPDATE: { fn: summarizeTokenUpdate },
  tokenUpdate: { fn: summarizeTokenUpdate },
  TOKENFEESCHEDULEUPDATE: { fn: summarizeTokenFeeScheduleUpdate },
  tokenFeeScheduleUpdate: { fn: summarizeTokenFeeScheduleUpdate },
  TOKENFREEZE: { fn: summarizeTokenFreeze },
  tokenFreeze: { fn: summarizeTokenFreeze },
  TOKENUNFREEZE: { fn: summarizeTokenUnfreeze },
  tokenUnfreeze: { fn: summarizeTokenUnfreeze },
  TOKENGRANTKYC: { fn: summarizeTokenGrantKyc },
  tokenGrantKyc: { fn: summarizeTokenGrantKyc },
  TOKENREVOKEKYC: { fn: summarizeTokenRevokeKyc },
  tokenRevokeKyc: { fn: summarizeTokenRevokeKyc },
  TOKENPAUSE: { fn: summarizeTokenPause },
  tokenPause: { fn: summarizeTokenPause },
  TOKENUNPAUSE: { fn: summarizeTokenUnpause },
  tokenUnpause: { fn: summarizeTokenUnpause },
  TOKENWIPE: { fn: summarizeTokenWipe },
  TOKENWIPEACCOUNT: { fn: summarizeTokenWipe },
  tokenWipe: { fn: summarizeTokenWipe },
  tokenWipeAccount: { fn: summarizeTokenWipe },
  TOKENDELETE: { fn: summarizeTokenDelete },
  tokenDelete: { fn: summarizeTokenDelete },
  TOKENASSOCIATE: { fn: summarizeTokenAssociate },
  tokenAssociate: { fn: summarizeTokenAssociate },
  TOKENDISSOCIATE: { fn: summarizeTokenDissociate },
  tokenDissociate: { fn: summarizeTokenDissociate },
  ACCOUNTDELETE: { fn: summarizeAccountDelete },
  cryptoDelete: { fn: summarizeAccountDelete },
  ACCOUNTCREATE: { fn: summarizeAccountCreate },
  cryptoCreateAccount: { fn: summarizeAccountCreate },
  ACCOUNTUPDATE: { fn: summarizeAccountUpdate },
  cryptoUpdateAccount: { fn: summarizeAccountUpdate },
  APPROVEALLOWANCE: { fn: summarizeApproveAllowance },
  cryptoApproveAllowance: { fn: summarizeApproveAllowance },
  DELETEALLOWANCE: { fn: summarizeDeleteAllowance },
  cryptoDeleteAllowance: { fn: summarizeDeleteAllowance },
  CONTRACTCREATE: { fn: summarizeContractCreate },
  contractCreate: { fn: summarizeContractCreate },
  CONTRACTUPDATE: { fn: summarizeContractUpdate },
  contractUpdate: { fn: summarizeContractUpdate },
  CONTRACTDELETE: { fn: summarizeContractDelete },
  contractDelete: { fn: summarizeContractDelete },
  TOKENAIRDROP: { fn: summarizeTokenAirdrop },
  tokenAirdrop: { fn: summarizeTokenAirdrop },
  SCHEDULECREATE: { fn: summarizeScheduleCreate },
  scheduleCreate: { fn: summarizeScheduleCreate },
  SCHEDULESIGN: { fn: summarizeScheduleSign },
  scheduleSign: { fn: summarizeScheduleSign },
  SCHEDULEDELETE: { fn: summarizeScheduleDelete },
  scheduleDelete: { fn: summarizeScheduleDelete },
  SYSTEMDELETE: { fn: summarizeSystemDelete },
  systemDelete: { fn: summarizeSystemDelete },
  SYSTEMUNDELETE: { fn: summarizeSystemUndelete },
  systemUndelete: { fn: summarizeSystemUndelete },
  FREEZE: { fn: summarizeFreeze },
  freeze: { fn: summarizeFreeze },
  ETHEREUMTRANSACTION: { fn: summarizeEthereumTransaction },
  ethereumTransaction: { fn: summarizeEthereumTransaction },
  UNCHECKEDSUBMIT: { fn: summarizeUncheckedSubmit },
  uncheckedSubmit: { fn: summarizeUncheckedSubmit },
  NODECREATE: { fn: summarizeNodeCreate },
  nodeCreate: { fn: summarizeNodeCreate },
  NODEUPDATE: { fn: summarizeNodeUpdate },
  nodeUpdate: { fn: summarizeNodeUpdate },
  NODEDELETE: { fn: summarizeNodeDelete },
  nodeDelete: { fn: summarizeNodeDelete },
  ATOMICBATCH: { fn: summarizeAtomicBatch },
  atomicBatch: { fn: summarizeAtomicBatch },
};

/**
 * Resolve a human-readable summary string for a parsed transaction using the summary registry.
 */
export const resolveTransactionSummary = (tx: ParsedTransaction): string => {
  const spec = transactionSummaryRegistry[tx.type];
  if (spec) {
    if (spec.fn) {
      return spec.fn(tx);
    }
    if (spec.template) {
      return renderTemplate(spec.template, tx);
    }
  }
  const hrSpec = transactionSummaryRegistry[tx.humanReadableType];
  if (hrSpec) {
    if (hrSpec.fn) {
      return hrSpec.fn(tx);
    }
    if (hrSpec.template) {
      return renderTemplate(hrSpec.template, tx);
    }
  }
  if (tx.type === 'cryptoTransfer' || tx.type === 'CRYPTOTRANSFER') {
    return summarizeCryptoTransfer(tx);
  }
  if (tx.contractCall) {
    return summarizeContractCall(tx);
  }
  if (Array.isArray(tx.tokenTransfers) && tx.tokenTransfers.length > 0) {
    return summarizeTokenTransfers(tx);
  }
  if (tx.humanReadableType && tx.humanReadableType !== 'Unknown Transaction') {
    return tx.humanReadableType;
  }
  return 'Unknown Transaction';
};
