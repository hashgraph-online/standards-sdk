import {
  transactionParserRegistry,
  getParserConfig,
  isTransactionTypeSupported,
  getSupportedTransactionTypes,
} from '../../src/utils/transaction-parser-registry';

jest.mock('../../src/utils/parsers/hts-parser', () => ({
  HTSParser: {
    parseTokenCreate: jest.fn(),
    parseTokenMint: jest.fn(),
    parseTokenBurn: jest.fn(),
    parseTokenUpdate: jest.fn(),
    parseTokenDelete: jest.fn(),
    parseTokenAssociate: jest.fn(),
    parseTokenDissociate: jest.fn(),
    parseTokenFreeze: jest.fn(),
    parseTokenUnfreeze: jest.fn(),
    parseTokenGrantKyc: jest.fn(),
    parseTokenRevokeKyc: jest.fn(),
    parseTokenPause: jest.fn(),
    parseTokenUnpause: jest.fn(),
    parseTokenWipeAccount: jest.fn(),
    parseTokenFeeScheduleUpdate: jest.fn(),
    parseTokenAirdropFromProto: jest.fn(),
  },
}));

jest.mock('../../src/utils/parsers/hcs-parser', () => ({
  HCSParser: {
    parseConsensusCreateTopic: jest.fn(),
    parseConsensusSubmitMessage: jest.fn(),
    parseConsensusUpdateTopic: jest.fn(),
    parseConsensusDeleteTopic: jest.fn(),
  },
}));

jest.mock('../../src/utils/parsers/crypto-parser', () => ({
  CryptoParser: {
    parseCryptoCreateAccount: jest.fn(),
    parseCryptoUpdateAccount: jest.fn(),
    parseCryptoDelete: jest.fn(),
    parseCryptoTransfers: jest.fn(),
    parseCryptoApproveAllowance: jest.fn(),
    parseCryptoDeleteAllowance: jest.fn(),
  },
}));

jest.mock('../../src/utils/parsers/file-parser', () => ({
  FileParser: {
    parseFileCreate: jest.fn(),
    parseFileUpdate: jest.fn(),
    parseFileDelete: jest.fn(),
    parseFileAppend: jest.fn(),
  },
}));

jest.mock('../../src/utils/parsers/scs-parser', () => ({
  SCSParser: {
    parseContractCreate: jest.fn(),
    parseContractUpdate: jest.fn(),
    parseContractDelete: jest.fn(),
    parseContractCall: jest.fn(),
    parseEthereumTransaction: jest.fn(),
  },
}));

jest.mock('../../src/utils/parsers/schedule-parser', () => ({
  ScheduleParser: {
    parseScheduleCreateFromProto: jest.fn(),
    parseScheduleSignFromProto: jest.fn(),
    parseScheduleDeleteFromProto: jest.fn(),
  },
}));

jest.mock('../../src/utils/parsers/util-parser', () => ({
  UtilParser: {
    parseUtilPrng: jest.fn(),
    parseFreeze: jest.fn(),
  },
}));

describe('Transaction Parser Registry', () => {
  describe('transactionParserRegistry', () => {
    test('should be a non-empty object', () => {
      expect(typeof transactionParserRegistry).toBe('object');
      expect(Object.keys(transactionParserRegistry).length).toBeGreaterThan(0);
    });

    test('should contain expected transaction types', () => {
      const expectedTypes = [
        'TOKENCREATE',
        'TOKENMINT',
        'TOKENBURN',
        'TOPICCREATE',
        'CONSENSUSSUBMITMESSAGE',
        'ACCOUNTCREATE',
        'ACCOUNTUPDATE',
        'CRYPTOTRANSFER',
        'FILECREATE',
        'FILEUPDATE',
        'CONTRACTCREATE',
        'CONTRACTUPDATE',
        'SCHEDULECREATE',
        'SCHEDULESIGN',
        'PRNG',
        'FREEZE',
        'SYSTEMDELETE',
        'SYSTEMUNDELETE',
        'TOKENWIPE',
        'NODECREATE',
        'NODEUPDATE',
        'ATOMICBATCH',
        'STATESIGNATURETRANSACTION',
      ];

      expectedTypes.forEach(type => {
        expect(transactionParserRegistry).toHaveProperty(type);
        expect(typeof transactionParserRegistry[type]).toBe('object');
        expect(transactionParserRegistry[type]).toHaveProperty('bodyField');
        expect(transactionParserRegistry[type]).toHaveProperty('parser');
        expect(transactionParserRegistry[type]).toHaveProperty('resultField');
        expect(typeof transactionParserRegistry[type].bodyField).toBe('string');
        expect(typeof transactionParserRegistry[type].parser).toBe('function');
        expect(typeof transactionParserRegistry[type].resultField).toBe(
          'string',
        );
      });
    });

    test('should have valid bodyField values', () => {
      Object.values(transactionParserRegistry).forEach(config => {
        expect(config.bodyField).toBeDefined();
        expect(typeof config.bodyField).toBe('string');
        expect(config.bodyField.length).toBeGreaterThan(0);
      });
    });

    test('should have valid parser functions', () => {
      Object.values(transactionParserRegistry).forEach(config => {
        expect(config.parser).toBeDefined();
        expect(typeof config.parser).toBe('function');
      });
    });

    test('should have valid resultField values', () => {
      Object.values(transactionParserRegistry).forEach(config => {
        expect(config.resultField).toBeDefined();
        expect(typeof config.resultField).toBe('string');
        expect(config.resultField.length).toBeGreaterThan(0);
      });
    });

    test('should handle spreadResult flag correctly', () => {
      const spreadResultEntries = Object.entries(
        transactionParserRegistry,
      ).filter(([, config]) => config.spreadResult === true);

      expect(spreadResultEntries.length).toBeGreaterThan(0);

      spreadResultEntries.forEach(([type, config]) => {
        expect(config.spreadResult).toBe(true);
        expect(config.resultField).toBeDefined();
      });
    });

    test('should have mostly unique bodyField values', () => {
      const bodyFields = Object.values(transactionParserRegistry).map(
        config => config.bodyField,
      );
      const uniqueBodyFields = new Set(bodyFields);

      expect(uniqueBodyFields.size).toBeGreaterThan(bodyFields.length - 2);
    });

    test('should have mostly unique resultField values', () => {
      const resultFields = Object.values(transactionParserRegistry).map(
        config => config.resultField,
      );
      const uniqueResultFields = new Set(resultFields);

      expect(uniqueResultFields.size).toBeGreaterThan(resultFields.length - 2);
    });

    test('should contain all major transaction categories', () => {
      const types = Object.keys(transactionParserRegistry);

      const htsTypes = types.filter(type => type.startsWith('TOKEN'));
      expect(htsTypes.length).toBeGreaterThan(10);

      const hcsTypes = types.filter(type =>
        [
          'TOPICCREATE',
          'CONSENSUSSUBMITMESSAGE',
          'TOPICUPDATE',
          'TOPICDELETE',
        ].includes(type),
      );
      expect(hcsTypes.length).toBeGreaterThanOrEqual(4);

      const cryptoTypes = types.filter(type =>
        [
          'ACCOUNTCREATE',
          'ACCOUNTUPDATE',
          'ACCOUNTDELETE',
          'CRYPTOTRANSFER',
        ].includes(type),
      );
      expect(cryptoTypes.length).toBeGreaterThanOrEqual(4);

      const fileTypes = types.filter(type =>
        ['FILECREATE', 'FILEUPDATE', 'FILEDELETE', 'FILEAPPEND'].includes(type),
      );
      expect(fileTypes.length).toBeGreaterThanOrEqual(4);

      const contractTypes = types.filter(type =>
        [
          'CONTRACTCREATE',
          'CONTRACTUPDATE',
          'CONTRACTDELETE',
          'CONTRACTCALL',
        ].includes(type),
      );
      expect(contractTypes.length).toBeGreaterThanOrEqual(4);
    });

    test('should have consistent naming conventions', () => {
      const types = Object.keys(transactionParserRegistry);

      types.forEach(type => {
        expect(type).toMatch(/^[A-Z]+$/);
        expect(type).not.toMatch(/[\s_-]/);
      });
    });

    test('should have CRYPTOTRANSFER with spreadResult', () => {
      const cryptoTransferConfig = transactionParserRegistry['CRYPTOTRANSFER'];
      expect(cryptoTransferConfig).toBeDefined();
      expect(cryptoTransferConfig.spreadResult).toBe(true);
      expect(cryptoTransferConfig.resultField).toBe('transfers');
    });

    test('should have valid bodyField paths for all entries', () => {
      Object.entries(transactionParserRegistry).forEach(([type, config]) => {
        expect(config.bodyField).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/);
        expect(config.bodyField).not.toMatch(/^[0-9]/);
      });
    });
  });

  describe('getParserConfig', () => {
    test('should return parser config for valid transaction type', () => {
      const config = getParserConfig('TOKENCREATE');

      expect(config).toBeDefined();
      expect(config.bodyField).toBe('tokenCreation');
      expect(config.resultField).toBe('tokenCreation');
      expect(typeof config.parser).toBe('function');
    });

    test('should return undefined for invalid transaction type', () => {
      const config = getParserConfig('INVALID_TYPE');

      expect(config).toBeUndefined();
    });

    test('should be case sensitive', () => {
      const configUpper = getParserConfig('TOKENCREATE');
      const configLower = getParserConfig('tokencreate');

      expect(configUpper).toBeDefined();
      expect(configLower).toBeUndefined();
    });
  });

  describe('isTransactionTypeSupported', () => {
    test('should return true for supported transaction types', () => {
      expect(isTransactionTypeSupported('TOKENCREATE')).toBe(true);
      expect(isTransactionTypeSupported('TOPICCREATE')).toBe(true);
      expect(isTransactionTypeSupported('ACCOUNTCREATE')).toBe(true);
      expect(isTransactionTypeSupported('CRYPTOTRANSFER')).toBe(true);
    });

    test('should return false for unsupported transaction types', () => {
      expect(isTransactionTypeSupported('INVALID_TYPE')).toBe(false);
      expect(isTransactionTypeSupported('')).toBe(false);
      expect(isTransactionTypeSupported('tokencreate')).toBe(false);
    });

    test('should handle edge cases', () => {
      expect(isTransactionTypeSupported(undefined as any)).toBe(false);
      expect(isTransactionTypeSupported(null as any)).toBe(false);
      expect(isTransactionTypeSupported('')).toBe(false);
    });
  });

  describe('getSupportedTransactionTypes', () => {
    test('should return array of all supported transaction types', () => {
      const supportedTypes = getSupportedTransactionTypes();

      expect(Array.isArray(supportedTypes)).toBe(true);
      expect(supportedTypes.length).toBeGreaterThan(0);
      expect(supportedTypes).toContain('TOKENCREATE');
      expect(supportedTypes).toContain('TOPICCREATE');
      expect(supportedTypes).toContain('ACCOUNTCREATE');
    });

    test('should return all transaction types from registry', () => {
      const supportedTypes = getSupportedTransactionTypes();
      const registryTypes = Object.keys(transactionParserRegistry);

      expect(supportedTypes).toHaveLength(registryTypes.length);
      expect(new Set(supportedTypes)).toEqual(new Set(registryTypes));
    });

    test('should be consistent with isTransactionTypeSupported', () => {
      const supportedTypes = getSupportedTransactionTypes();

      supportedTypes.forEach(type => {
        expect(isTransactionTypeSupported(type)).toBe(true);
      });

      expect(isTransactionTypeSupported('UNSUPPORTED_TYPE')).toBe(false);
    });

    test('should return array that can be sorted', () => {
      const supportedTypes = getSupportedTransactionTypes();

      expect(supportedTypes.every(type => typeof type === 'string')).toBe(true);

      const sortedTypes = [...supportedTypes].sort();
      expect(sortedTypes).toBeDefined();
      expect(sortedTypes.length).toBe(supportedTypes.length);
    });
  });

  describe('registry integrity', () => {
    test('should have no duplicate transaction types', () => {
      const types = Object.keys(transactionParserRegistry);
      const uniqueTypes = new Set(types);

      expect(uniqueTypes.size).toBe(types.length);
    });

    test('should have no empty or invalid configurations', () => {
      Object.entries(transactionParserRegistry).forEach(([type, config]) => {
        expect(config.bodyField).toBeTruthy();
        expect(config.parser).toBeTruthy();
        expect(config.resultField).toBeTruthy();
        expect(typeof config.bodyField).toBe('string');
        expect(typeof config.parser).toBe('function');
        expect(typeof config.resultField).toBe('string');
      });
    });

    test('should have reasonable number of transaction types', () => {
      const types = Object.keys(transactionParserRegistry);

      expect(types.length).toBeGreaterThanOrEqual(20);

      expect(types.length).toBeLessThan(200);
    });

    test('should have all transaction types as strings', () => {
      Object.keys(transactionParserRegistry).forEach(type => {
        expect(typeof type).toBe('string');
        expect(type.length).toBeGreaterThan(0);
      });
    });
  });
});
