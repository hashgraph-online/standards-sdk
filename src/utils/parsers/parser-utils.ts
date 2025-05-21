import { proto } from '@hashgraph/proto';
import { ContractId } from '@hashgraph/sdk';
import { Buffer } from 'buffer';

export function parseKey(
  key: proto.IKey | null | undefined
): string | undefined {
  if (!key) {
    return undefined;
  }

  if (key.contractID) {
    return `ContractID: ${new ContractId(
      key.contractID.shardNum ?? 0,
      key.contractID.realmNum ?? 0,
      key.contractID.contractNum ?? 0
    ).toString()}`;
  }
  if (key.ed25519) {
    return `ED25519: ${Buffer.from(key.ed25519).toString('hex')}`;
  }
  if (key.ECDSASecp256k1) {
    return `ECDSA_secp256k1: ${Buffer.from(key.ECDSASecp256k1).toString(
      'hex'
    )}`;
  }
  if (key?.keyList?.keys?.length > 0) {
    const keys = key.keyList.keys.map((k) => parseKey(k)).filter(Boolean);
    return `KeyList (${keys.length} keys): [${keys.join(', ')}]`;
  }
  if (key?.thresholdKey?.keys?.keys?.length > 0) {
    const keys = key.thresholdKey.keys.keys
      .map((k) => parseKey(k))
      .filter(Boolean);
    return `ThresholdKey (${key.thresholdKey.threshold} of ${
      keys.length
    }): [${keys.join(', ')}]`;
  }
  if (key.delegatableContractId) {
    return `DelegatableContractID: ${new ContractId(
      key.delegatableContractId.shardNum ?? 0,
      key.delegatableContractId.realmNum ?? 0,
      key.delegatableContractId.contractNum ?? 0
    ).toString()}`;
  }
  if (Object.keys(key).length === 0) {
    return 'Empty Key Structure';
  }

  return 'Unknown or Unset Key Type';
}
