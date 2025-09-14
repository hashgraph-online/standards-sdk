import { HCS16BaseClient } from '../src/hcs-16/base-client';
import { FloraTopicType } from '../src/hcs-16/types';

describe('HCS-16 memo parsing', () => {
  it('parses valid hcs-16 flora memo', () => {
    const fam = new HCS16BaseClient({ network: 'testnet' });
    const result = fam.parseTopicMemo('hcs-16:0.0.12345:2');
    expect(result).not.toBeNull();
    expect(result?.protocol).toBe('hcs-16');
    expect(result?.floraAccountId).toBe('0.0.12345');
    expect(result?.topicType).toBe(FloraTopicType.STATE);
  });

  it('parses other topic types', () => {
    const fam = new HCS16BaseClient({ network: 'testnet' });
    const comm = fam.parseTopicMemo('hcs-16:0.0.12345:0');
    const tx = fam.parseTopicMemo('hcs-16:0.0.12345:1');
    expect(comm?.topicType).toBe(0);
    expect(tx?.topicType).toBe(1);
  });

  it('returns null for invalid memo', () => {
    const fam = new HCS16BaseClient({ network: 'testnet' });
    const result = fam.parseTopicMemo('hcs-16:badmemo');
    expect(result).toBeNull();
  });

  it('returns null for invalid topic type', () => {
    const fam = new HCS16BaseClient({ network: 'testnet' });
    const result = fam.parseTopicMemo('hcs-16:0.0.12345:x');
    expect(result).toBeNull();
  });
});
