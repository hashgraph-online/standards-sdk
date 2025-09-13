import React, { useState } from 'react';
import type { HCS6BrowserClient } from '@hashgraphonline/standards-sdk';
import { Button } from './ui/button';
import { Input } from './ui/input';

type Props = { hcs6: HCS6BrowserClient };

export const HCS6Actions: React.FC<Props> = ({ hcs6 }) => {
  const [registryTopicId, setRegistryTopicId] = useState('');
  const [targetTopicId, setTargetTopicId] = useState('');
  const [log, setLog] = useState('');
  const [jsonText, setJsonText] = useState('');

  const append = (m: string) => setLog(prev => prev + m + '\n');

  const createRegistry = async () => {
    const res = await hcs6.createRegistry({ ttl: 86400 });
    if (res.success && res.topicId) {
      setRegistryTopicId(res.topicId);
      append(`Created registry: ${res.topicId}`);
    } else append(`Create registry failed: ${res.error}`);
  };
  const registerEntry = async () => {
    if (!registryTopicId || !targetTopicId) return;
    const res = await hcs6.registerEntry(registryTopicId, {
      targetTopicId,
      memo: 'Demo entry',
    });
    if (res.success) append(`Registered entry seq: ${res.sequenceNumber}`);
    else append(`Register failed: ${res.error}`);
  };
  const readLatest = async () => {
    if (!registryTopicId) return;
    const reg = await hcs6.getRegistry(registryTopicId);
    append(`Latest entry: ${JSON.stringify(reg.latestEntry)}`);
  };

  const createHashinal = async () => {
    try {
      const text = jsonText.trim().length
        ? jsonText
        : '{"name":"Demo","description":"Sample","type":"json","creator":"demo"}';
      const meta = JSON.parse(text) as Record<string, unknown>;
      const res = await hcs6.createHashinal({
        metadata: meta,
        ttl: 86400,
        memo: 'Browser Hashinal',
        inscriptionOptions: {
          progressCallback: (d: {
            stage?: string;
            message?: string;
            progressPercent?: number;
          }) => {
            const stage = d.stage || 'progress';
            const msg = d.message || '';
            const pct =
              typeof d.progressPercent === 'number'
                ? ` ${d.progressPercent}%`
                : '';
            append(`[${stage}] ${msg}${pct}`);
          },
        },
      });
      if (res.success) {
        append(
          `Hashinal created. Registry: ${res.registryTopicId}, Inscription: ${res.inscriptionTopicId}`,
        );
        if (res.registryTopicId) setRegistryTopicId(res.registryTopicId);
      } else append(`Create hashinal failed: ${res.error}`);
    } catch (e) {
      append(`Create hashinal error: ${String(e)}`);
    }
  };

  return (
    <div className="grid gap-3">
      <Button onClick={createRegistry}>Create HCS-6 Registry</Button>
      <Input
        placeholder="Target HCS-1 Topic Id"
        value={targetTopicId}
        onChange={e => setTargetTopicId(e.target.value)}
      />
      <div className="flex gap-2">
        <Button onClick={registerEntry}>Register Entry</Button>
        <Button onClick={readLatest}>Read Latest</Button>
      </div>
      <div className="grid gap-2">
        <div className="text-sm text-gray-700">
          Paste JSON metadata for createHashinal:
        </div>
        <textarea
          className="w-full rounded-md border border-gray-300 p-2 h-28"
          value={jsonText}
          onChange={e => setJsonText(e.target.value)}
        />
        <Button onClick={createHashinal}>
          Create Hashinal (inscribe + register)
        </Button>
      </div>
      <div>
        <div className="mb-1">
          Registry: <strong>{registryTopicId}</strong>
        </div>
        <pre className="bg-gray-900 text-gray-100 p-3 min-h-28 rounded">
          {log}
        </pre>
      </div>
    </div>
  );
};
