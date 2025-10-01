export interface Balance {
  balance: number;
  timestamp: string;
  tokens: TokenBalance[];
}

export interface TokenBalance {
  token_id: string;
  balance: number;
}

export interface Key {
  _type: string;
  key: string;
}

export interface AccountResponse {
  account: string;
  alias: string;
  auto_renew_period: number;
  balance: Balance;
  created_timestamp: string;
  decline_reward: boolean;
  deleted: boolean;
  ethereum_nonce: number;
  evm_address: string;
  expiry_timestamp: string;
  key: Key;
  max_automatic_token_associations: number;
  memo: string;
  pending_reward: number;
  receiver_sig_required: boolean;
  staked_account_id: string | null;
  staked_node_id: string | null;
  stake_period_start: string | null;
  transactions: Transaction[];
  links: Links;
}

export interface Transaction {
  bytes: string | null;
  charged_tx_fee: number;
  consensus_timestamp: string;
  entity_id: string | null;
  max_fee: string;
  memo_base64: string;
  name: string;
  nft_transfers: NftTransfer[];
  node: string;
  nonce: number;
  parent_consensus_timestamp: string | null;
  result: string;
  scheduled: boolean;
  staking_reward_transfers: Transfer[];
  token_transfers: TokenTransfer[];
  transaction_hash: string;
  transaction_id: string;
  transfers: Transfer[];
  valid_duration_seconds: string;
  valid_start_timestamp: string;
}

export interface Transfer {
  account: string;
  amount: number;
  is_approval: boolean;
}

export interface TokenTransfer {
  token_id: string;
  account: string;
  amount: string;
  is_approval: boolean;
}

export interface NftTransfer {
  receiver_account_id: string;
  sender_account_id: string;
  serial_number: number;
  is_approval: boolean;
}

export interface Links {
  next: string;
}

export interface TopicInfo {
  inboundTopic: string;
  outboundTopic: string;
  profileTopicId: string;
}

export interface TopicMessage {
  consensus_timestamp: string;
  topic_id: string;
  message: string;
  sequence_number: number;
  running_hash: string;
  running_hash_version: number;
  payer_account_id: string;
  chunk_info?: {
    initial_transaction_id: {
      account_id: string;
      nonce: number;
      scheduled: boolean;
      transaction_valid_start: string;
    } | null;
    number: number;
    total: number;
  } | null;
}

export interface TopicMessagesResponse {
  messages: TopicMessage[];
  links: {
    next?: string;
  };
}

export interface TopicResponse {
  admin_key: Key;
  auto_renew_account: string;
  auto_renew_period: number;
  created_timestamp: string;
  custom_fees: CustomFees;
  deleted: boolean;
  fee_exempt_key_list: Key[];
  fee_schedule_key: Key;
  memo: string;
  submit_key: Key;
  timestamp: Timestamp;
  topic_id: string;
}

export interface Key {
  _type: string;
  key: string;
}

export interface CustomFees {
  created_timestamp: string;
  fixed_fees: FixedFee[];
}

export interface FixedFee {
  amount: number;
  collector_account_id: string;
  denominating_token_id: string;
}

export interface Timestamp {
  from: string;
  to: string;
}

export interface TRate {
  cent_equivalent: number;
  expiration_time: number;
  hbar_equivalent: number;
}

export interface HBARPrice {
  current_rate: TRate;
  next_rate: TRate;
  timestamp: string;
}

export interface TokenInfoResponse {
  admin_key: Key | null;
  auto_renew_account: string | null;
  auto_renew_period: number | null;
  created_timestamp: string;
  decimals: string;
  deleted: boolean;
  expiry_timestamp: string | null;
  fee_schedule_key: Key | null;
  freeze_default: boolean;
  freeze_key: Key | null;
  initial_supply: string;
  kyc_key: Key | null;
  max_supply: string;
  memo: string;
  modified_timestamp: string;
  name: string;
  pause_key: Key | null;
  pause_status: string;
  supply_key: Key | null;
  supply_type: string;
  symbol: string;
  token_id: string;
  total_supply: string;
  treasury_account_id: string;
  type: string;
  wipe_key: Key | null;
  custom_fees?: CustomFees;
}

export interface ScheduleInfo {
  admin_key: AdminKey;
  consensus_timestamp: string;
  creator_account_id: string;
  deleted: boolean;
  executed_timestamp: string;
  expiration_time: string;
  memo: string;
  payer_account_id: string;
  schedule_id: string;
  signatures: Signature[];
  transaction_body: string;
  wait_for_expiry: boolean;
}

export interface AdminKey {
  _type: string;
  key: string;
}

export interface Signature {
  consensus_timestamp: string;
  public_key_prefix: string;
  signature: string;
  type: string;
}

/**
 * Represents detailed information about a token associated with an account.
 */
export interface AccountTokenBalance {
  token_id: string;
  balance: number;
  decimals: number;
}

/**
 * Response structure for an account's token balances from the mirror node.
 */
export interface AccountTokensResponse {
  tokens: AccountTokenBalance[];
  links: Links;
}

/**
 * Represents the details of an NFT.
 */
export interface NftDetail {
  account_id: string | null;
  created_timestamp: string;
  delegating_spender: string | null;
  deleted: boolean;
  metadata: string; // base64 encoded
  modified_timestamp: string;
  serial_number: number;
  spender: string | null;
  token_id: string;
  token_uri?: string; // Decoded metadata, can be added post-fetch
}

/**
 * Response structure for an account's NFTs from the mirror node.
 */
export interface AccountNftsResponse {
  nfts: NftDetail[];
  links: Links;
}

/**
 * Response structure for a read-only smart contract query (contracts/call).
 */
export interface ContractCallQueryResponse {
  result: string;
}

/**
 * Represents a token airdrop.
 */
export interface TokenAirdrop {
  amount: number;
  receiver_account_id: string;
  sender_account_id: string;
  serial_number?: number;
  timestamp: string;
  token_id: string;
}

/**
 * Response structure for token airdrops from the mirror node.
 */
export interface TokenAirdropsResponse {
  airdrops: TokenAirdrop[];
  links: Links;
}

/**
 * Represents a block on the Hedera network.
 */
export interface Block {
  count: number;
  hapi_version: string;
  hash: string;
  name: string;
  number: number;
  previous_hash: string;
  size: number;
  timestamp: Timestamp;
  gas_used?: number;
  logs_bloom?: string;
}

/**
 * Response structure for blocks from the mirror node.
 */
export interface BlocksResponse {
  blocks: Block[];
  links: Links;
}

/**
 * Represents a contract result/execution.
 */
export interface ContractResult {
  access_list?: string;
  address: string;
  amount: number;
  block_gas_used?: number;
  block_hash?: string;
  block_number?: number;
  bloom?: string;
  call_result?: string;
  chain_id?: string;
  contract_id: string;
  created_contract_ids?: string[];
  error_message?: string;
  failed_initcode?: string;
  from: string;
  function_parameters?: string;
  gas_consumed?: number;
  gas_limit: number;
  gas_price?: string;
  gas_used?: number;
  hash: string;
  max_fee_per_gas?: string;
  max_priority_fee_per_gas?: string;
  nonce?: number;
  r?: string;
  result: string;
  s?: string;
  status?: number;
  timestamp: string;
  to?: string;
  transaction_index?: number;
  type?: number;
  v?: number;
  logs?: ContractLog[];
  state_changes?: ContractStateChange[];
}

/**
 * Response structure for contract results from the mirror node.
 */
export interface ContractResultsResponse {
  results: ContractResult[];
  links: Links;
}

/**
 * Represents a contract log entry.
 */
export interface ContractLog {
  address: string;
  bloom?: string;
  contract_id: string;
  data: string;
  index: number;
  topics: string[];
  block_hash?: string;
  block_number?: number;
  root_contract_id?: string;
  timestamp: string;
  transaction_hash?: string;
  transaction_index?: number;
}

/**
 * Response structure for contract logs from the mirror node.
 */
export interface ContractLogsResponse {
  logs: ContractLog[];
  links: Links;
}

/**
 * Represents a contract state change.
 */
export interface ContractStateChange {
  address: string;
  contract_id: string;
  slot: string;
  value_read?: string;
  value_written?: string;
}

/**
 * Represents a contract action.
 */
export interface ContractAction {
  call_depth: number;
  call_operation_type: string;
  call_type: string;
  caller: string;
  caller_type: string;
  from: string;
  gas: number;
  gas_used: number;
  index: number;
  input: string;
  recipient: string;
  recipient_type: string;
  result_data: string;
  result_data_type: string;
  timestamp: string;
  to: string;
  value: number;
}

/**
 * Response structure for contract actions from the mirror node.
 */
export interface ContractActionsResponse {
  actions: ContractAction[];
  links: Links;
}

/**
 * Represents a contract entity.
 */
export interface ContractEntity {
  admin_key?: Key;
  auto_renew_account?: string;
  auto_renew_period?: number;
  bytecode?: string;
  contract_id: string;
  created_timestamp: string;
  deleted: boolean;
  evm_address: string;
  expiration_timestamp?: string;
  file_id?: string;
  max_automatic_token_associations?: number;
  memo?: string;
  obtainer_id?: string;
  permanent_removal?: boolean;
  proxy_account_id?: string;
  runtime_bytecode?: string;
  solidity_address?: string;
  timestamp: Timestamp;
}

/**
 * Response structure for contract entities from the mirror node.
 */
export interface ContractsResponse {
  contracts: ContractEntity[];
  links: Links;
}

/**
 * Represents contract state information.
 */
export interface ContractState {
  address: string;
  contract_id: string;
  timestamp: string;
  slot: string;
  value: string;
}

/**
 * Response structure for contract state from the mirror node.
 */
export interface ContractStateResponse {
  state: ContractState[];
  links: Links;
}

/**
 * Represents an NFT with additional information.
 */
export interface NftInfo {
  account_id: string;
  created_timestamp: string;
  delegating_spender?: string;
  deleted: boolean;
  metadata?: string;
  modified_timestamp: string;
  serial_number: number;
  spender?: string;
  token_id: string;
}

/**
 * Response structure for NFT information from the mirror node.
 */
export interface NftInfoResponse {
  nft: NftInfo;
}

/**
 * Response structure for multiple NFTs from the mirror node.
 */
export interface NftsResponse {
  nfts: NftInfo[];
  links: Links;
}

/**
 * Represents opcode trace information.
 */
export interface Opcode {
  depth: number;
  gas: number;
  gas_cost: number;
  memory?: string[];
  op: string;
  pc: number;
  reason?: string;
  stack?: string[];
  storage?: Record<string, string>;
}

/**
 * Response structure for opcode traces from the mirror node.
 */
export interface OpcodesResponse {
  address: string;
  contract_id: string;
  failed: boolean;
  gas: number;
  opcodes: Opcode[];
  return_value: string;
}

/**
 * Represents network information.
 */
export interface NetworkInfo {
  ledger_id: string;
  network_name: string;
}

/**
 * Represents network fees.
 */
export interface NetworkFees {
  current: FeeSchedule;
  next?: FeeSchedule;
  timestamp: string;
}

/**
 * Represents a fee schedule.
 */
export interface FeeSchedule {
  expiry_time: string;
  fee_schedule: FeeData[];
}

/**
 * Represents fee data.
 */
export interface FeeData {
  fees: FeeComponents[];
  hederaFunctionality: string;
}

/**
 * Represents fee components.
 */
export interface FeeComponents {
  bpr: number;
  bpt: number;
  constant: number;
  gas: number;
  max: number;
  min: number;
  rbh: number;
  sbh: number;
  sbpr: number;
  vpt: number;
}

/**
 * Represents network supply information.
 */
export interface NetworkSupply {
  released_supply: string;
  timestamp: string;
  total_supply: string;
}

/**
 * Represents network stake information.
 */
export interface NetworkStake {
  max_stake_rewarded: number;
  max_staking_reward_rate_per_hbar: number;
  max_total_reward: number;
  node_reward_fee_denominator: number;
  node_reward_fee_numerator: number;
  reserved_staking_rewards: number;
  reward_balance_threshold: number;
  stake_total: number;
  staking_period: StakingPeriod;
  staking_period_duration: number;
  staking_periods_stored: number;
  staking_reward_fee_denominator: number;
  staking_reward_fee_numerator: number;
  staking_reward_rate: number;
  staking_start_threshold: number;
  unreserved_staking_reward_balance: number;
}

/**
 * Represents a staking period.
 */
export interface StakingPeriod {
  from: string;
  to: string;
}

type HCSProtocol =
  | 'hcs-1'
  | 'hcs-2'
  | 'hcs-3'
  | 'hcs-5'
  | 'hcs-6'
  | 'hcs-7'
  | 'hcs-8'
  | 'hcs-9'
  | 'hcs-10'
  | 'hcs-11'
  | 'hcs-12'
  | 'hcs-13'
  | 'hcs-14'
  | 'hcs-15'
  | 'hcs-16'
  | 'hcs-17'
  | 'hcs-18'
  | 'hcs-19'
  | 'hcs-20';

export interface HCSMessageWithCommonFields {
  p: HCSProtocol;
  op: string;
  data?: string;
  created?: Date;
  chunk_info?: {
    initial_transaction_id: {
      account_id: string;
      nonce: number;
      scheduled: boolean;
      transaction_valid_start: string;
    } | null;
  };
  running_hash?: string;
  running_hash_version?: number;
  topic_id?: string;
  consensus_timestamp?: string;
  m?: string;
  payer: string;
  payer_account_id?: string;
  outbound_topic_id?: string;
  connection_request_id?: number;
  confirmed_request_id?: number;
  connection_topic_id?: string;
  connected_account_id?: string;
  requesting_account_id?: string;
  connection_id?: number;
  sequence_number: number;
  operator_id?: string;
  reason?: string;
  close_method?: string;
  schedule_id?: string;
  account_id?: string;
  uid?: string;
  t_id?: string;
  transaction_id?: string;
}
