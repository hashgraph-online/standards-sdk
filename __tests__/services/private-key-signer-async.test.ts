import { describe, it, expect } from '@jest/globals';
import { PrivateKey } from '@hashgraph/sdk';
import { createPrivateKeySignerAsync } from '../../src/services/registry-broker/private-key-signer';

describe('createPrivateKeySignerAsync', () => {
  it('creates a signer that can sign payloads', async () => {
    const privateKey = PrivateKey.generateED25519();
    const signer = await createPrivateKeySignerAsync({
      accountId: '0.0.123',
      privateKey: privateKey.toString(),
      network: 'testnet',
    });

    const signatures = await signer.sign([new Uint8Array([1, 2, 3])]);

    expect(signatures).toHaveLength(1);
    expect(signer.getAccountId().toString()).toBe('0.0.123');
    expect(signatures[0]?.signature).toBeInstanceOf(Uint8Array);
  });
});
