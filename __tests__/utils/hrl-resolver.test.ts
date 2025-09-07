import axios from 'axios';
import { HRLResolver, HRLResolutionOptions, HRLResolutionResult } from '../../src/utils/hrl-resolver';
import { HederaMirrorNode } from '../../src/services/mirror-node';
import { Logger } from '../../src/utils/logger';

jest.mock('axios');
jest.mock('../../src/services/mirror-node');
jest.mock('../../src/utils/logger');

describe('HRLResolver', () => {
  const mockAxios = axios as jest.Mocked<typeof axios>;
  const mockHederaMirrorNode = HederaMirrorNode as jest.MockedClass<typeof HederaMirrorNode>;
  const mockLogger = {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);
  });

  describe('constructor', () => {
    test('should create HRLResolver with default log level', () => {
      const resolver = new HRLResolver();
      expect(resolver).toBeInstanceOf(HRLResolver);
    });

    test('should create HRLResolver with custom log level', () => {
      const resolver = new HRLResolver('debug');
      expect(resolver).toBeInstanceOf(HRLResolver);
    });
  });

  describe('isBinaryContentType', () => {
    let resolver: HRLResolver;

    beforeEach(() => {
      resolver = new HRLResolver();
    });

    test('should identify binary content types', () => {
      const binaryTypes = [
        'image/jpeg',
        'audio/mpeg',
        'video/mp4',
        'application/octet-stream',
        'application/pdf',
        'application/zip',
        'font/woff',
        'application/wasm',
      ];

      binaryTypes.forEach(type => {
        expect((resolver as any).isBinaryContentType(type)).toBe(true);
      });
    });

    test('should identify text content types as non-binary', () => {
      const textTypes = [
        'text/plain',
        'text/html',
        'application/json',
        'application/xml',
      ];

      textTypes.forEach(type => {
        expect((resolver as any).isBinaryContentType(type)).toBe(false);
      });
    });
  });

  describe('parseHRL', () => {
    let resolver: HRLResolver;

    beforeEach(() => {
      resolver = new HRLResolver();
    });

    test('should parse valid HRL', () => {
      const result = resolver.parseHRL('hcs://1/0.0.12345');
      expect(result).toEqual({
        standard: '1',
        topicId: '0.0.12345',
      });
    });

    test('should parse HRL with different standard', () => {
      const result = resolver.parseHRL('hcs://7/0.0.67890');
      expect(result).toEqual({
        standard: '7',
        topicId: '0.0.67890',
      });
    });

    test('should return null for invalid HRL format', () => {
      const invalidHRLs = [
        '',
        'invalid',
        'hcs://invalid',
        'hcs://1/invalid',
        'http://1/0.0.12345',
        'hcs://1/0.0.12345/extra',
      ];

      invalidHRLs.forEach(hrl => {
        expect(resolver.parseHRL(hrl)).toBeNull();
      });
    });

    test('should return null for empty input', () => {
      expect(resolver.parseHRL('')).toBeNull();
    });
  });

  describe('isValidHRL', () => {
    let resolver: HRLResolver;

    beforeEach(() => {
      resolver = new HRLResolver();
    });

    test('should validate correct HRL', () => {
      expect(resolver.isValidHRL('hcs://1/0.0.12345')).toBe(true);
      expect(resolver.isValidHRL('hcs://7/0.0.67890')).toBe(true);
    });

    test('should reject invalid HRLs', () => {
      const invalidHRLs = [
        '',
        'invalid',
        'hcs://invalid',
        'hcs://1/invalid',
        'http://1/0.0.12345',
        null,
        undefined,
      ];

      invalidHRLs.forEach(hrl => {
        expect(resolver.isValidHRL(hrl as any)).toBe(false);
      });
    });

    test('should reject non-string inputs', () => {
      expect(resolver.isValidHRL(null as any)).toBe(false);
      expect(resolver.isValidHRL(undefined as any)).toBe(false);
      expect(resolver.isValidHRL(123 as any)).toBe(false);
    });
  });

  describe('isValidTopicId', () => {
    let resolver: HRLResolver;

    beforeEach(() => {
      resolver = new HRLResolver();
    });

    test('should validate correct topic IDs', () => {
      const validTopicIds = [
        '0.0.12345',
        '1.2.34567',
        '999.999.99999',
      ];

      validTopicIds.forEach(topicId => {
        expect(resolver.isValidTopicId(topicId)).toBe(true);
      });
    });

    test('should reject invalid topic IDs', () => {
      const invalidTopicIds = [
        '',
        'invalid',
        '0.0',
        '0.0.12345.67890',
        'a.b.c',
        '0.0.12345a',
      ];

      invalidTopicIds.forEach(topicId => {
        expect(resolver.isValidTopicId(topicId)).toBe(false);
      });
    });
  });

  describe('resolve', () => {
    let resolver: HRLResolver;
    let mockMirrorNode: jest.Mocked<HederaMirrorNode>;

    beforeEach(() => {
      resolver = new HRLResolver();
      mockMirrorNode = new HederaMirrorNode('testnet') as jest.Mocked<HederaMirrorNode>;
      mockHederaMirrorNode.mockImplementation(() => mockMirrorNode);
    });

    test('should resolve HRL directly', async () => {
      const hrl = 'hcs://1/0.0.12345';
      const options: HRLResolutionOptions = { network: 'testnet' };

      const expectedResult: HRLResolutionResult = {
        content: 'test content',
        contentType: 'text/plain',
        topicId: '0.0.12345',
        isBinary: false,
      };

      const resolveHRLSpy = jest.spyOn(resolver as any, 'resolveHRL').mockResolvedValue(expectedResult);

      const result = await resolver.resolve(hrl, options);

      expect(resolveHRLSpy).toHaveBeenCalledWith(hrl, options);
      expect(result).toEqual(expectedResult);
    });

    test('should resolve topic ID by querying mirror node', async () => {
      const topicId = '0.0.12345';
      const options: HRLResolutionOptions = { network: 'testnet' };

      mockMirrorNode.getTopicInfo.mockResolvedValue({
        memo: 'hcs-7: Test topic',
      });

      const expectedResult: HRLResolutionResult = {
        content: 'test content',
        contentType: 'text/plain',
        topicId: '0.0.12345',
        isBinary: false,
      };

      const resolveHRLSpy = jest.spyOn(resolver as any, 'resolveHRL').mockResolvedValue(expectedResult);

      const result = await resolver.resolve(topicId, options);

      expect(mockHederaMirrorNode).toHaveBeenCalledWith('testnet', mockLogger);
      expect(mockMirrorNode.getTopicInfo).toHaveBeenCalledWith(topicId);
      expect(resolveHRLSpy).toHaveBeenCalledWith('hcs://7/0.0.12345', options);
      expect(result).toEqual(expectedResult);
    });

    test('should fallback to standard 1 when memo parsing fails', async () => {
      const topicId = '0.0.12345';
      const options: HRLResolutionOptions = { network: 'testnet' };

      mockMirrorNode.getTopicInfo.mockResolvedValue({
        memo: 'invalid memo',
      });

      const expectedResult: HRLResolutionResult = {
        content: 'test content',
        contentType: 'text/plain',
        topicId: '0.0.12345',
        isBinary: false,
      };

      const resolveHRLSpy = jest.spyOn(resolver as any, 'resolveHRL').mockResolvedValue(expectedResult);

      const result = await resolver.resolve(topicId, options);

      expect(resolveHRLSpy).toHaveBeenCalledWith('hcs://1/0.0.12345', options);
      expect(result).toEqual(expectedResult);
    });

    test('should fallback to standard 1 when mirror node fails', async () => {
      const topicId = '0.0.12345';
      const options: HRLResolutionOptions = { network: 'testnet' };

      mockMirrorNode.getTopicInfo.mockRejectedValue(new Error('Network error'));

      const expectedResult: HRLResolutionResult = {
        content: 'test content',
        contentType: 'text/plain',
        topicId: '0.0.12345',
        isBinary: false,
      };

      const resolveHRLSpy = jest.spyOn(resolver as any, 'resolveHRL').mockResolvedValue(expectedResult);

      const result = await resolver.resolve(topicId, options);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(resolveHRLSpy).toHaveBeenCalledWith('hcs://1/0.0.12345', options);
      expect(result).toEqual(expectedResult);
    });

    test('should throw error for invalid input', async () => {
      const invalidInput = 'invalid-input';
      const options: HRLResolutionOptions = { network: 'testnet' };

      await expect(resolver.resolve(invalidInput, options)).rejects.toThrow(
        'Invalid HRL or topic ID format: invalid-input'
      );
    });
  });

  describe('getContentWithType', () => {
    let resolver: HRLResolver;

    beforeEach(() => {
      resolver = new HRLResolver();
    });

    test('should resolve HRL content', async () => {
      const hrl = 'hcs://1/0.0.12345';
      const options: HRLResolutionOptions = { network: 'testnet' };

      const expectedResult = {
        content: 'test content',
        contentType: 'application/json',
        topicId: '0.0.12345',
        isBinary: false,
      };

      const resolveHRLSpy = jest.spyOn(resolver as any, 'resolveHRL').mockResolvedValue(expectedResult);

      const result = await resolver.getContentWithType(hrl, options);

      expect(resolveHRLSpy).toHaveBeenCalledWith(hrl, options);
      expect(result).toEqual({
        content: 'test content',
        contentType: 'application/json',
        isBinary: false,
      });
    });

    test('should return plain text for invalid HRL', async () => {
      const invalidHrl = 'not-an-hrl';
      const options: HRLResolutionOptions = { network: 'testnet' };

      const result = await resolver.getContentWithType(invalidHrl, options);

      expect(result).toEqual({
        content: 'not-an-hrl',
        contentType: 'text/plain',
        isBinary: false,
      });
    });

    test('should throw error when HRL resolution fails', async () => {
      const hrl = 'hcs://1/0.0.12345';
      const options: HRLResolutionOptions = { network: 'testnet' };

      const resolveHRLSpy = jest.spyOn(resolver as any, 'resolveHRL').mockRejectedValue(
        new Error('Resolution failed')
      );

      await expect(resolver.getContentWithType(hrl, options)).rejects.toThrow(
        'Error resolving HRL for content and type: Resolution failed'
      );

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('resolveHRL', () => {
    let resolver: HRLResolver;

    beforeEach(() => {
      resolver = new HRLResolver();
    });

    test('should resolve text content', async () => {
      const hrl = 'hcs://1/0.0.12345';
      const options: HRLResolutionOptions = { network: 'testnet' };

      const mockHeadResponse = {
        headers: {
          'content-type': 'text/plain',
        },
      };

      const mockGetResponse = {
        data: 'Hello World',
      };

      mockAxios.head.mockResolvedValue(mockHeadResponse);
      mockAxios.get.mockResolvedValue(mockGetResponse);

      const result = await resolver.resolveHRL(hrl, options);

      expect(mockAxios.head).toHaveBeenCalledWith(
        'https://kiloscribe.com/api/inscription-cdn/0.0.12345?network=testnet'
      );
      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://kiloscribe.com/api/inscription-cdn/0.0.12345?network=testnet'
      );
      expect(result).toEqual({
        content: 'Hello World',
        contentType: 'text/plain',
        topicId: '0.0.12345',
        isBinary: false,
      });
    });

    test('should resolve JSON content', async () => {
      const hrl = 'hcs://1/0.0.12345';
      const options: HRLResolutionOptions = { network: 'testnet' };

      const mockHeadResponse = {
        headers: {
          'content-type': 'application/json',
        },
      };

      const mockGetResponse = {
        data: { message: 'Hello World' },
      };

      mockAxios.head.mockResolvedValue(mockHeadResponse);
      mockAxios.get.mockResolvedValue(mockGetResponse);

      const result = await resolver.resolveHRL(hrl, options);

      expect(result).toEqual({
        content: { message: 'Hello World' },
        contentType: 'application/json',
        topicId: '0.0.12345',
        isBinary: false,
      });
    });

    test('should resolve binary content', async () => {
      const hrl = 'hcs://1/0.0.12345';
      const options: HRLResolutionOptions = { network: 'testnet' };

      const mockHeadResponse = {
        headers: {
          'content-type': 'image/jpeg',
        },
      };

      const mockGetResponse = {
        data: new ArrayBuffer(8),
      };

      mockAxios.head.mockResolvedValue(mockHeadResponse);
      mockAxios.get.mockResolvedValue(mockGetResponse);

      const result = await resolver.resolveHRL(hrl, options);

      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://kiloscribe.com/api/inscription-cdn/0.0.12345?network=testnet',
        { responseType: 'arraybuffer' }
      );
      expect(result).toEqual({
        content: new ArrayBuffer(8),
        contentType: 'image/jpeg',
        topicId: '0.0.12345',
        isBinary: true,
      });
    });

    test('should use custom CDN endpoint', async () => {
      const hrl = 'hcs://1/0.0.12345';
      const options: HRLResolutionOptions = {
        network: 'testnet',
        cdnEndpoint: 'https://custom.cdn.com/api',
      };

      const mockHeadResponse = {
        headers: {
          'content-type': 'text/plain',
        },
      };

      const mockGetResponse = {
        data: 'test content',
      };

      mockAxios.head.mockResolvedValue(mockHeadResponse);
      mockAxios.get.mockResolvedValue(mockGetResponse);

      await resolver.resolveHRL(hrl, options);

      expect(mockAxios.head).toHaveBeenCalledWith(
        'https://custom.cdn.com/api/0.0.12345?network=testnet'
      );
    });

    test('should handle object response data', async () => {
      const hrl = 'hcs://1/0.0.12345';
      const options: HRLResolutionOptions = { network: 'testnet' };

      const mockHeadResponse = {
        headers: {
          'content-type': 'text/plain',
        },
      };

      const mockGetResponse = {
        data: {
          content: 'Hello World',
          extra: 'data',
        },
      };

      mockAxios.head.mockResolvedValue(mockHeadResponse);
      mockAxios.get.mockResolvedValue(mockGetResponse);

      const result = await resolver.resolveHRL(hrl, options);

      expect(result.content).toBe('Hello World');
    });

    test('should return raw response when returnRaw is true', async () => {
      const hrl = 'hcs://1/0.0.12345';
      const options: HRLResolutionOptions = {
        network: 'testnet',
        returnRaw: true,
      };

      const mockHeadResponse = {
        headers: {
          'content-type': 'text/plain',
        },
      };

      const mockGetResponse = {
        data: new ArrayBuffer(8),
      };

      mockAxios.head.mockResolvedValue(mockHeadResponse);
      mockAxios.get.mockResolvedValue(mockGetResponse);

      const result = await resolver.resolveHRL(hrl, options);

      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://kiloscribe.com/api/inscription-cdn/0.0.12345?network=testnet',
        { responseType: 'arraybuffer' }
      );
      expect(result.isBinary).toBe(true);
    });

    test('should throw error for invalid HRL', async () => {
      const invalidHrl = 'invalid-hrl';
      const options: HRLResolutionOptions = { network: 'testnet' };

      await expect(resolver.resolveHRL(invalidHrl, options)).rejects.toThrow(
        'Invalid HRL format: invalid-hrl'
      );
    });

    test('should throw error when CDN request fails', async () => {
      const hrl = 'hcs://1/0.0.12345';
      const options: HRLResolutionOptions = { network: 'testnet' };

      mockAxios.head.mockRejectedValue(new Error('Network error'));

      await expect(resolver.resolveHRL(hrl, options)).rejects.toThrow(
        'Error resolving HRL reference: Network error'
      );

      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should throw error when content is empty', async () => {
      const hrl = 'hcs://1/0.0.12345';
      const options: HRLResolutionOptions = { network: 'testnet' };

      const mockHeadResponse = {
        headers: {
          'content-type': 'text/plain',
        },
      };

      const mockGetResponse = {
        data: null,
      };

      mockAxios.head.mockResolvedValue(mockHeadResponse);
      mockAxios.get.mockResolvedValue(mockGetResponse);

      await expect(resolver.resolveHRL(hrl, options)).rejects.toThrow(
        'Failed to fetch content from topic: 0.0.12345'
      );
    });
  });
});