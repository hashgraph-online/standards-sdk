import React, { useEffect, useState } from 'react';
import { Card } from './components/ui/card';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { WalletConnectButton } from './components/WalletConnectButton';
import { HCS6Actions } from './components/HCS6Actions';
import { initClients, resolveSigner, buildClientWithSigner } from './lib/sdk';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';

export const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [clients, setClients] = useState<Awaited<
    ReturnType<typeof initClients>
  > | null>(null);

  useEffect(() => {
    const pid = (import.meta as any).env?.VITE_WALLETCONNECT_PROJECT_ID || '';
    setProjectId(pid);
    if (pid) void boot(pid);
  }, []);

  const boot = async (pid?: string) => {
    const id = pid ?? projectId;
    const metadata = {
      name: 'HCS-6 Browser Demo',
      description: 'WalletConnect + Standards SDK',
      url: 'https://hashgraphonline.com',
      icons: ['https://hashgraphonline.com/icon.png'],
    };
    const c = await initClients(id, metadata);
    const signer = resolveSigner(c.hwc);
    const client = signer ? buildClientWithSigner(c.hwc, signer) : c.hcs6;
    setClients({ hwc: c.hwc, hcs6: client });
    setReady(true);
  };

  return (
    <div className="container">
      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">HCS-6 Browser Demo</h2>
        {!ready ? (
          <div className="space-y-2">
            <Input
              placeholder="WalletConnect Project ID"
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
            />
            <Button disabled={!projectId} onClick={() => boot()}>
              Initialize
            </Button>
          </div>
        ) : (
          clients && (
            <div className="space-y-4">
              <WalletConnectButton
                hwc={clients.hwc}
                onConnected={(accountId: string, signer: DAppSigner) => {
                  const next = buildClientWithSigner(clients.hwc, signer);
                  setClients({ hwc: clients.hwc, hcs6: next });
                }}
              />
              <HCS6Actions hcs6={clients.hcs6} />
            </div>
          )
        )}
      </Card>
    </div>
  );
};
