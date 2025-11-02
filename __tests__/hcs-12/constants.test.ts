import {
  TESTNET_EXAMPLES,
  MAINNET_EXAMPLES,
  getExampleTopics,
} from '../../src/hcs-12/constants';

describe('HCS-12 Constants', () => {
  describe('TESTNET_EXAMPLES', () => {
    test('should contain expected action topics', () => {
      expect(TESTNET_EXAMPLES.ACTIONS.CALCULATOR).toBe('0.0.TBD1');
      expect(TESTNET_EXAMPLES.ACTIONS.NFT_MINT).toBe('0.0.TBD2');
      expect(TESTNET_EXAMPLES.ACTIONS.TOKEN_TRANSFER).toBe('0.0.TBD3');
    });

    test('should contain expected block topics', () => {
      expect(TESTNET_EXAMPLES.BLOCKS.BUTTON).toBe('0.0.TBD4');
      expect(TESTNET_EXAMPLES.BLOCKS.NFT_GALLERY).toBe('0.0.TBD5');
      expect(TESTNET_EXAMPLES.BLOCKS.FORM).toBe('0.0.TBD6');
    });

    test('should contain expected assembly topics', () => {
      expect(TESTNET_EXAMPLES.ASSEMBLIES.NFT_MARKETPLACE).toBe('0.0.TBD7');
      expect(TESTNET_EXAMPLES.ASSEMBLIES.TOKEN_DASHBOARD).toBe('0.0.TBD8');
    });
  });

  describe('MAINNET_EXAMPLES', () => {
    test('should contain empty objects for mainnet', () => {
      expect(MAINNET_EXAMPLES.ACTIONS).toEqual({});
      expect(MAINNET_EXAMPLES.BLOCKS).toEqual({});
      expect(MAINNET_EXAMPLES.ASSEMBLIES).toEqual({});
    });
  });

  describe('getExampleTopics', () => {
    test('should return testnet examples for testnet', () => {
      const result = getExampleTopics('testnet');
      expect(result).toBe(TESTNET_EXAMPLES);
    });

    test('should return mainnet examples for mainnet', () => {
      const result = getExampleTopics('mainnet');
      expect(result).toBe(MAINNET_EXAMPLES);
    });

    test('should return testnet examples as default', () => {
      const result = getExampleTopics('testnet' as 'mainnet' | 'testnet');
      expect(result).toBe(TESTNET_EXAMPLES);
    });
  });
});
