import React, { useState } from 'react';
import type { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';
import { Button } from './ui/button';

type Props = {
  hwc: HashinalsWalletConnectSDK;
  onConnected?: (accountId: string, signer: DAppSigner) => void;
};

export const WalletConnectButton: React.FC<Props> = ({ hwc, onConnected }) => {
  const [connected, setConnected] = useState(false);
  const [accountId, setAccountId] = useState<string | undefined>();

  const connect = async () => {
    const session = await hwc.connect();
    if (session) {
      const s = hwc.dAppConnector?.signers?.[0];
      const id = s?.getAccountId()?.toString();
      if (id) setAccountId(id);
      setConnected(true);
      if (id && s && onConnected) onConnected(id, s);
    }
  };
  const disconnect = async () => {
    await hwc.disconnect();
    setConnected(false);
    setAccountId(undefined);
  };

  return (
    <div className="flex items-center gap-3">
      {connected ? (
        <>
          <span className="text-sm text-gray-600">Connected: {accountId}</span>
          <Button onClick={disconnect}>Disconnect</Button>
        </>
      ) : (
        <Button onClick={connect}>Connect Wallet</Button>
      )}
    </div>
  );
};
