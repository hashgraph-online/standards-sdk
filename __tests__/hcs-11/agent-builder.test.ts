import { AgentBuilder } from '../../src/hcs-11/agent-builder';
import { InboundTopicType } from '../../src/hcs-11/types';

describe('AgentBuilder', () => {
  test('builds minimal agent with defaults', () => {
    const b = new AgentBuilder()
      .setName('Test')
      .setBio('bio')
      .setNetwork('testnet' as any)
      .setInboundTopicType(InboundTopicType.PUBLIC);
    const cfg = b.build();
    expect(cfg.name).toBe('Test');
    expect(cfg.bio).toBe('bio');
    expect(cfg.metadata?.type).toBe('manual');
    expect(cfg.inboundTopicType).toBe(InboundTopicType.PUBLIC);
    expect(Array.isArray(cfg.capabilities)).toBe(true);
  });

  test('fee-based requires fee config', () => {
    const b = new AgentBuilder()
      .setName('Test')
      .setBio('bio')
      .setNetwork('testnet' as any)
      .setInboundTopicType(InboundTopicType.FEE_BASED);
    expect(() => b.build()).toThrow(/Fee configuration/);
  });

  test('respects existing pfpTopicId and social properties', () => {
    const b = new AgentBuilder()
      .setName('A')
      .setBio('B')
      .setNetwork('testnet' as any)
      .setInboundTopicType(InboundTopicType.PUBLIC)
      .setModel('gpt')
      .setCreator('me')
      .addSocial('twitter' as any, 'handle')
      .addProperty('k', 'v')
      .setExistingProfilePicture('0.0.123');
    const cfg = b.build();
    expect(cfg.existingPfpTopicId).toBe('0.0.123');
    expect(cfg.metadata?.socials?.twitter).toBe('handle');
    expect(cfg.metadata?.properties?.k).toBe('v');
    expect(cfg.metadata?.model).toBe('gpt');
    expect(cfg.metadata?.creator).toBe('me');
  });
});

