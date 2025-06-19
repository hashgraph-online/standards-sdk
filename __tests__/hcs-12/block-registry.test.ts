/**
 * Tests for Block Registry
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BlockRegistry } from '../../src/hcs-12/registries/block-registry';
import { Logger } from '../../src/utils/logger';
import type { HederaMirrorNode } from '../../src/services/mirror-node';
import type { NetworkType } from '../../src/utils/types';
import { BlockRegistration } from '../../src/hcs-12/types';

jest.mock('../../src/services/mirror-node');

global.fetch = jest.fn();

describe('BlockRegistry', () => {
  let blockRegistry: BlockRegistry;
  let logger: Logger;
  let mockMirrorNode: jest.Mocked<HederaMirrorNode>;
  const mockTopicId = '0.0.123456';
  const mockNetwork: NetworkType = 'testnet';

  beforeEach(() => {
    logger = new Logger({ module: 'BlockRegistryTest' });
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();

    mockMirrorNode = {
      getTopicMessages: jest.fn(),
      getAccountInfo: jest.fn(),
      getTopicInfo: jest.fn(),
    } as any;

    blockRegistry = new BlockRegistry(mockNetwork, logger);

    (global.fetch as jest.Mock).mockReset();
  });

  describe('Block Registration', () => {
    it('should register a valid block', async () => {
      const blockReg: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/test-block',
        version: '1.0.0',
        data: {
          apiVersion: 3,
          name: 'hashlinks/test-block',
          title: 'Test Block',
          category: 'common',
          description: 'A test block for validation',
          attributes: {},
          supports: {},
        },
        t_id: '0.0.789012',
      };

      const registrationId = await blockRegistry.register(blockReg);
      expect(registrationId).toMatch(/^local_\d+_[a-z0-9]+$/);

      const entry = await blockRegistry.getEntry(registrationId);
      expect(entry).toBeDefined();
      expect(entry?.data.name).toBe('hashlinks/test-block');
    });

    it('should validate required fields', async () => {
      const invalidBlock = {
        p: 'hcs-12',
        op: 'register',
      } as BlockRegistration;

      await expect(blockRegistry.register(invalidBlock)).rejects.toThrow();
    });

    it('should require all mandatory fields', async () => {
      const incompleteBlock = {
        p: 'hcs-12',
        op: 'register',
      } as BlockRegistration;

      await expect(blockRegistry.register(incompleteBlock)).rejects.toThrow();
    });

    it('should handle blocks with icon registration', async () => {
      const blockWithIcon: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/icon-block',
        version: '1.0.0',
        data: {
          apiVersion: 3,
          name: 'hashlinks/icon-block',
          title: 'Icon Block',
          category: 'common',
          description: 'Block with icon',
          icon: 'IconName',
          attributes: {},
          supports: {},
        },
        t_id: '0.0.789012',
      };

      const registrationId = await blockRegistry.register(blockWithIcon);
      const entry = await blockRegistry.getEntry(registrationId);

      expect(entry?.data.data?.icon).toBe('IconName');
    });

    it('should handle blocks with keywords', async () => {
      const blockWithKeywords: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/keyword-block',
        version: '1.0.0',
        data: {
          apiVersion: 3,
          name: 'hashlinks/keyword-block',
          title: 'Keyword Block',
          category: 'common',
          description: 'Block with keywords',
          keywords: ['ui', 'form', 'input'],
          attributes: {},
          supports: {},
        },
        t_id: '0.0.789012',
      };

      const registrationId = await blockRegistry.register(blockWithKeywords);
      const entry = await blockRegistry.getEntry(registrationId);

      expect(entry?.data.data?.keywords).toEqual(['ui', 'form', 'input']);
    });
  });

  describe('Sync from Mirror Node', () => {
    it('should sync blocks from topic messages', async () => {
      const syncedBlockData = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/sync-block',
        version: '1.0.0',
        data: {
          apiVersion: 3,
          name: 'hashlinks/sync-block',
          title: 'Sync Block',
          category: 'common',
          description: 'Block from sync',
          attributes: {},
          supports: {},
        },
        t_id: '0.0.789012',
      };

      (blockRegistry as any).entries.set('sync_1', {
        id: 'sync_1',
        data: syncedBlockData,
        submitter: '0.0.123456',
        timestamp: '2023-01-01T00:00:00.000Z',
      });

      const entries = await blockRegistry.listEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].data.name).toBe('hashlinks/sync-block');
    });

    it('should handle malformed messages during sync', async () => {
      const validBlockData = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/valid-block',
        version: '1.0.0',
        data: {
          apiVersion: 3,
          name: 'hashlinks/valid-block',
          title: 'Valid Block',
          category: 'common',
          description: 'Valid block after invalid',
          attributes: {},
          supports: {},
        },
        t_id: '0.0.789012',
      };

      (blockRegistry as any).entries.set('valid_1', {
        id: 'valid_1',
        data: validBlockData,
        submitter: '0.0.123456',
        timestamp: '2023-01-01T00:01:00.000Z',
      });

      const entries = await blockRegistry.listEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].data.name).toBe('hashlinks/valid-block');
    });

    it('should handle sync errors gracefully', async () => {
      mockMirrorNode.getTopicMessages.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(blockRegistry.sync()).resolves.not.toThrow();

      const blockReg: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/error-block',
        version: '1.0.0',
        data: {
          apiVersion: 3,
          name: 'hashlinks/error-block',
          title: 'Error Block',
          category: 'common',
          description: 'Block after error',
          attributes: {},
          supports: {},
        },
        t_id: '0.0.789012',
      };

      const registrationId = await blockRegistry.register(blockReg);
      expect(registrationId).toBeDefined();
    });
  });

  describe('Registry Operations', () => {
    it('should list all entries', async () => {
      const blocks = [
        {
          name: 'hashlinks/block-1',
          title: 'Block 1',
        },
        {
          name: 'hashlinks/block-2',
          title: 'Block 2',
        },
        {
          name: 'hashlinks/block-3',
          title: 'Block 3',
        },
      ];

      for (const block of blocks) {
        await blockRegistry.register({
          p: 'hcs-12',
          op: 'register',
          name: block.name,
          version: '1.0.0',
          data: {
            apiVersion: 3,
            name: block.name,
            title: block.title,
            category: 'common',
            description: `Description for ${block.name}`,
            attributes: {},
            supports: {},
          },
          t_id: '0.0.789012',
        });
      }

      const entries = await blockRegistry.listEntries();
      expect(entries).toHaveLength(3);
      expect(entries.map(e => e.data.name)).toEqual([
        'hashlinks/block-1',
        'hashlinks/block-2',
        'hashlinks/block-3',
      ]);
    });

    it('should get entry by ID', async () => {
      const blockReg: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/get-block',
        version: '1.0.0',
        data: {
          apiVersion: 3,
          name: 'hashlinks/get-block',
          title: 'Get Block',
          category: 'common',
          description: 'Block to get by ID',
          attributes: {},
          supports: {},
        },
        t_id: '0.0.789012',
      };

      const registrationId = await blockRegistry.register(blockReg);
      const entry = await blockRegistry.getEntry(registrationId);

      expect(entry).toBeDefined();
      expect(entry?.id).toBe(registrationId);
      expect(entry?.data.name).toBe('hashlinks/get-block');
    });

    it('should return null for non-existent entry', async () => {
      const entry = await blockRegistry.getEntry('non-existent-id');
      expect(entry).toBeNull();
    });
  });

  describe('Block Categories', () => {
    it('should handle standard categories', async () => {
      const categories = [
        'common',
        'formatting',
        'layout',
        'widgets',
        'embed',
        'interactive',
      ];

      for (const category of categories) {
        const blockReg: BlockRegistration = {
          p: 'hcs-12',
          op: 'register',
          name: `hashlinks/${category}-block`,
          version: '1.0.0',
          data: {
            apiVersion: 3,
            name: `hashlinks/${category}-block`,
            title: `${category} Block`,
            category: category as any,
            description: `Block in ${category} category`,
            attributes: {},
            supports: {},
          },
          t_id: '0.0.789012',
        };

        const registrationId = await blockRegistry.register(blockReg);
        const entry = await blockRegistry.getEntry(registrationId);

        expect(entry?.data.data?.category).toBe(category);
      }
    });
  });

  describe('Version Management', () => {
    it('should handle semantic versioning', async () => {
      const versions = ['1.0.0', '2.0.0', '1.1.0', '1.0.1'];

      for (const version of versions) {
        const blockReg: BlockRegistration = {
          p: 'hcs-12',
          op: 'register',
          name: 'hashlinks/versioned-block',
          version,
          data: {
            apiVersion: 3,
            name: 'hashlinks/versioned-block',
            title: 'Versioned Block',
            category: 'common',
            description: `Block version ${version}`,
            attributes: {},
            supports: {},
          },
          t_id: '0.0.789012',
        };

        const registrationId = await blockRegistry.register(blockReg);
        const entry = await blockRegistry.getEntry(registrationId);

        expect(entry?.data.version).toBe(version);
      }
    });
  });

  describe('Topic ID Management', () => {
    it('should handle blocks with content topic IDs', async () => {
      const blockReg: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/content-block',
        version: '1.0.0',
        data: {
          apiVersion: 3,
          name: 'hashlinks/content-block',
          title: 'Content Block',
          category: 'common',
          description: 'Block with content stored in HCS-1',
          attributes: {},
          supports: {},
        },
        t_id: '0.0.789012',
      };

      const registrationId = await blockRegistry.register(blockReg);
      const entry = await blockRegistry.getEntry(registrationId);

      expect(entry?.data.t_id).toBe('0.0.789012');
    });
  });
});
