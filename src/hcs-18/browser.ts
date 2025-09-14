import type { TransactionReceipt } from '@hashgraph/sdk';
import { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import type {
  DiscoveryMessage,
  AnnounceData,
  ProposeData,
  RespondData,
  CompleteMessage,
  WithdrawMessage,
} from './types';
import {
  buildHcs18AnnounceMessage,
  buildHcs18ProposeMessage,
  buildHcs18RespondMessage,
  buildHcs18CompleteMessage,
  buildHcs18WithdrawMessage,
} from './tx';

export interface BrowserHCS18ClientConfig {
  network: 'testnet' | 'mainnet';
  hwc: HashinalsWalletConnectSDK;
}

export class HCS18BrowserClient {
  private readonly hwc: HashinalsWalletConnectSDK;

  constructor(config: BrowserHCS18ClientConfig) {
    this.hwc = config.hwc;
  }

  async submit(
    discoveryTopicId: string,
    message: DiscoveryMessage,
  ): Promise<TransactionReceipt> {
    const receipt = await this.hwc.submitMessageToTopic(
      discoveryTopicId,
      JSON.stringify(message),
    );
    return receipt;
  }

  async announce(params: {
    discoveryTopicId: string;
    data: AnnounceData;
  }): Promise<TransactionReceipt> {
    const message = buildHcs18AnnounceMessage(params.data);
    return this.submit(params.discoveryTopicId, message);
  }

  async propose(params: {
    discoveryTopicId: string;
    data: ProposeData;
  }): Promise<TransactionReceipt> {
    const message = buildHcs18ProposeMessage(params.data);
    return this.submit(params.discoveryTopicId, message);
  }

  async respond(params: {
    discoveryTopicId: string;
    data: RespondData;
  }): Promise<TransactionReceipt> {
    const message = buildHcs18RespondMessage(params.data);
    return this.submit(params.discoveryTopicId, message);
  }

  async complete(params: {
    discoveryTopicId: string;
    data: CompleteMessage['data'];
  }): Promise<TransactionReceipt> {
    const message = buildHcs18CompleteMessage(params.data);
    return this.submit(params.discoveryTopicId, message);
  }

  async withdraw(params: {
    discoveryTopicId: string;
    data: WithdrawMessage['data'];
  }): Promise<TransactionReceipt> {
    const message = buildHcs18WithdrawMessage(params.data);
    return this.submit(params.discoveryTopicId, message);
  }
}
