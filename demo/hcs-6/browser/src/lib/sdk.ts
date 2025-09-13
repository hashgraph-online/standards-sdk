import { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import { HCS6BrowserClient } from '@hashgraphonline/standards-sdk';
import { LedgerId } from '@hashgraph/sdk';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';

export type DemoClients = {
  hwc: HashinalsWalletConnectSDK;
  hcs6: HCS6BrowserClient;
};

export async function initClients(
  projectId: string,
  metadata: { name: string; description: string; url: string; icons: string[] },
): Promise<DemoClients> {
  const hwc = HashinalsWalletConnectSDK.getInstance();
  await hwc.init(projectId, metadata as any, LedgerId.TESTNET);
  const hcs6 = new HCS6BrowserClient({ network: 'testnet', hwc });
  return { hwc, hcs6 };
}

export function resolveSigner(
  hwc: HashinalsWalletConnectSDK,
): DAppSigner | undefined {
  const signers = hwc.dAppConnector?.signers;
  if (!signers || signers.length === 0) return undefined;
  return signers[0];
}

export function buildClientWithSigner(
  hwc: HashinalsWalletConnectSDK,
  signer: DAppSigner,
): HCS6BrowserClient {
  return new HCS6BrowserClient({ network: 'testnet', hwc, signer });
}
