import {
  canonicalizeAgentData,
  CanonicalizationResult,
} from '../../src/hcs-14/canonical';
import {
  CanonicalAgentDataSchema,
  CanonicalAgentData,
} from '../../src/hcs-14/types';

describe('HCS-14 Canonical Agent Data', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('canonicalizeAgentData', () => {
    test('should canonicalize valid agent data correctly', () => {
      const input = {
        registry: 'Hashgraph',
        name: '  TestAgent  ',
        version: '1.0.0',
        protocol: 'HCS-14',
        nativeId: '0.0.12345',
        skills: [3, 1, 2],
      };

      const result = canonicalizeAgentData(input);

      expect(result.normalized).toEqual({
        registry: 'hashgraph',
        name: 'TestAgent',
        version: '1.0.0',
        protocol: 'hcs-14',
        nativeId: '0.0.12345',
        skills: [1, 2, 3], // Sorted
      });

      expect(result.canonicalJson).toBe(
        '{"skills":[1,2,3],"name":"TestAgent","nativeId":"0.0.12345","protocol":"hcs-14","registry":"hashgraph","version":"1.0.0"}',
      );
    });

    test('should handle empty strings and trim them', () => {
      const input = {
        registry: '   REGISTRY   ',
        name: '\t\n  Agent Name  \t',
        version: '  v2.0  ',
        protocol: ' PROTOCOL ',
        nativeId: '  0.0.67890  ',
        skills: [5, 2, 8, 1],
      };

      const result = canonicalizeAgentData(input);

      expect(result.normalized).toEqual({
        registry: 'registry',
        name: 'Agent Name',
        version: 'v2.0',
        protocol: 'protocol',
        nativeId: '0.0.67890',
        skills: [1, 2, 5, 8], // Sorted
      });
    });

    test('should handle single skill', () => {
      const input = {
        registry: 'TestRegistry',
        name: 'SingleSkillAgent',
        version: '1.0',
        protocol: 'hcs-14',
        nativeId: '0.0.11111',
        skills: [42],
      };

      const result = canonicalizeAgentData(input);

      expect(result.normalized.skills).toEqual([42]);
      expect(result.canonicalJson).toContain('"skills":[42]');
    });

    test('should handle empty skills array', () => {
      const input = {
        registry: 'EmptyRegistry',
        name: 'NoSkillsAgent',
        version: '1.0',
        protocol: 'hcs-14',
        nativeId: '0.0.22222',
        skills: [],
      };

      const result = canonicalizeAgentData(input);

      expect(result.normalized.skills).toEqual([]);
      expect(result.canonicalJson).toContain('"skills":[]');
    });

    test('should maintain consistent canonical JSON structure', () => {
      const input1 = {
        registry: 'reg1',
        name: 'name1',
        version: 'v1',
        protocol: 'proto1',
        nativeId: 'id1',
        skills: [1, 3, 2],
      };

      const input2 = {
        registry: 'reg2',
        name: 'name2',
        version: 'v2',
        protocol: 'proto2',
        nativeId: 'id2',
        skills: [2, 1, 3],
      };

      const result1 = canonicalizeAgentData(input1);
      const result2 = canonicalizeAgentData(input2);

      expect(result1.canonicalJson).toMatch(
        /^\{"skills":\[1,2,3\],"name":"name1","nativeId":"id1","protocol":"proto1","registry":"reg1","version":"v1"\}$/,
      );
      expect(result2.canonicalJson).toMatch(
        /^\{"skills":\[1,2,3\],"name":"name2","nativeId":"id2","protocol":"proto2","registry":"reg2","version":"v2"\}$/,
      );
    });

    test('should throw if schema validation fails', () => {
      const invalidInput = {
        registry: '', // Empty string should fail min(1) validation
        name: 'test',
        version: '1.0',
        protocol: 'hcs-14',
        nativeId: '0.0.123',
        skills: [1, 2, 3],
      };

      expect(() => canonicalizeAgentData(invalidInput)).toThrow();
    });

    test('should handle case sensitivity in registry and protocol', () => {
      const input = {
        registry: 'MiXeDcase',
        name: 'Test',
        version: '1.0',
        protocol: 'MiXeDprotocol',
        nativeId: '0.0.123',
        skills: [1],
      };

      const result = canonicalizeAgentData(input);

      expect(result.normalized.registry).toBe('mixedcase');
      expect(result.normalized.protocol).toBe('mixedprotocol');
    });

    test('should preserve numeric skill IDs', () => {
      const input = {
        registry: 'test',
        name: 'agent',
        version: '1.0',
        protocol: 'hcs-14',
        nativeId: '0.0.123',
        skills: [0, 100, 999, 1000],
      };

      const result = canonicalizeAgentData(input);

      expect(result.normalized.skills).toEqual([0, 100, 999, 1000]);
    });
  });

  describe('result structure', () => {
    test('should return CanonicalizationResult with correct properties', () => {
      const input = {
        registry: 'test',
        name: 'agent',
        version: '1.0',
        protocol: 'hcs-14',
        nativeId: '0.0.123',
        skills: [1, 2, 3],
      };

      const result = canonicalizeAgentData(input);

      expect(result).toHaveProperty('normalized');
      expect(result).toHaveProperty('canonicalJson');
      expect(typeof result.canonicalJson).toBe('string');
      expect(result.normalized).toHaveProperty('registry');
      expect(result.normalized).toHaveProperty('name');
      expect(result.normalized).toHaveProperty('version');
      expect(result.normalized).toHaveProperty('protocol');
      expect(result.normalized).toHaveProperty('nativeId');
      expect(result.normalized).toHaveProperty('skills');
      expect(Array.isArray(result.normalized.skills)).toBe(true);
    });
  });
});
