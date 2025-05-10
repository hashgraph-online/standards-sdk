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
