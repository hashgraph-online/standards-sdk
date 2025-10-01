import {
  WasmExecutor,
  WasmExecutionContext,
  WasmExecutionResult,
} from '../../../src/hcs-12/wasm/wasm-executor';
import { Logger } from '../../../src/utils/logger';
import { HRLResolver } from '../../../src/utils/hrl-resolver';
import { NetworkType } from '../../../src/utils/types';
import { ActionRegistration } from '../../../src/hcs-12/types';

jest.mock('../../../src/utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
  })),
}));
jest.mock('../../../src/utils/hrl-resolver', () => ({
  HRLResolver: jest.fn().mockImplementation(() => ({
    resolve: jest.fn(),
  })),
}));

describe('WasmExecutor', () => {
  let mockLogger: jest.Mocked<Logger>;
  let mockHrlResolver: jest.Mocked<HRLResolver>;
  let wasmExecutor: WasmExecutor;
  let originalFunction: any;
  let originalURL: any;
  let originalBlob: any;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      trace: jest.fn(),
    } as any;

    mockHrlResolver = {
      resolve: jest.fn(),
    } as any;

    (Logger as jest.MockedClass<typeof Logger>).mockImplementation(
      () => mockLogger,
    );
    (HRLResolver as jest.MockedClass<typeof HRLResolver>).mockImplementation(
      () => mockHrlResolver,
    );

    wasmExecutor = new WasmExecutor(mockLogger, 'testnet' as NetworkType);

    originalFunction = global.Function;
    originalURL = global.URL;
    originalBlob = global.Blob;
  });

  afterEach(() => {
    jest.clearAllMocks();
    global.Function = originalFunction;
    global.URL = originalURL;
    global.Blob = originalBlob;
  });

  describe('constructor', () => {
    test('should initialize with logger and network', () => {
      expect(wasmExecutor).toBeDefined();
      expect(HRLResolver).toHaveBeenCalledWith();
    });
  });

  describe('execute', () => {
    const mockAction: ActionRegistration = {
      t_id: '0.0.12345',
      js_t_id: '0.0.67890',
      name: 'test-action',
      description: 'Test action',
      schema: {},
    };

    const mockContext: WasmExecutionContext = {
      method: 'POST',
      params: { operation: 'test-op', value: 42 },
      state: { counter: 1 },
    };

    test('should execute JavaScript wrapper when js_t_id is present', async () => {
      const mockModule = {
        default: () => Promise.resolve(),
        WasmInterface: class {
          async POST() {
            return '{"result": "success"}';
          }
          free() {}
        },
      };

      global.Function = jest.fn().mockImplementation(() => (url: string) => Promise.resolve(mockModule));
      global.Blob = jest.fn().mockImplementation(function () { return {}; } as any) as any;
      global.URL = {
        createObjectURL: jest.fn().mockReturnValue('blob:test-url'),
        revokeObjectURL: jest.fn(),
      } as any;
      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: `
          export class WasmInterface {
            async POST(actionName, paramsJson, network, state) {
              return '{"result": "success"}';
            }
          }
          export default function init() {
            return Promise.resolve();
          }
        `,
        contentType: 'application/javascript',
        hash: 'mock-hash',
      });

      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: new ArrayBuffer(100),
        contentType: 'application/wasm',
        hash: 'wasm-hash',
      });
      const mockModule2 = {
        WasmInterface: class {
          async POST() {
            return '{"result": "success"}';
          }
          free() {}
        },
        default: jest.fn().mockResolvedValue(undefined),
      } as any;
      const originalFuncLocal = global.Function;
      global.Function = jest.fn().mockImplementation(() => (url: string) => Promise.resolve(mockModule2)) as any;
      (global as any).window = {};
      const result = await wasmExecutor.execute(mockAction, mockContext);
      global.Function = originalFuncLocal as any;
      delete (global as any).window;
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'success' });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Executing WASM action',
        expect.any(Object),
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Loading JavaScript wrapper',
        expect.any(Object),
      );
    });

    test('should handle JavaScript wrapper in browser environment', async () => {
      const originalWindow = global.window;
      global.window = {} as any;
      const mockUrl = 'blob:test-url';
      global.URL = {
        createObjectURL: jest.fn().mockReturnValue(mockUrl),
        revokeObjectURL: jest.fn(),
      } as any;
      const mockModule = {
        default: () => Promise.resolve(),
        WasmInterface: class {
          async POST() {
            return '{"success": true}';
          }
          free() {}
        },
      };
      global.Function = jest.fn().mockImplementation(() => (url: string) => Promise.resolve(mockModule));

      mockHrlResolver.resolve.mockResolvedValueOnce({
        content:
          'console.log("test"); export default () => {}; export class WasmInterface {}',
        contentType: 'application/javascript',
        hash: 'mock-hash',
      });

      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: new ArrayBuffer(100),
        contentType: 'application/wasm',
        hash: 'wasm-hash',
      });

      const result = await wasmExecutor.execute(mockAction, mockContext);

      expect(result.success).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Module imported, exports:',
        expect.any(Array),
      );
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);
      global.Function = originalFunction as any;
      (global as any).window = originalWindow;
    });

    test('should handle GET method calls', async () => {
      const getContext: WasmExecutionContext = {
        method: 'GET',
        params: { operation: 'read-op' },
      };

      const mockModule = {
        default: () => Promise.resolve(),
        WasmInterface: class {
          async GET() {
            return '{"data": "read-result"}';
          }
          free() {}
        },
      };
      global.Function = jest.fn().mockImplementation(() => (url: string) => Promise.resolve(mockModule));
      global.Blob = jest.fn().mockImplementation(function () { return {}; } as any) as any;
      global.URL = {
        createObjectURL: jest.fn().mockReturnValue('blob:test-url'),
        revokeObjectURL: jest.fn(),
      } as any;

      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: `
          export class WasmInterface {
            async GET(actionName, paramsJson, network) {
              return '{"data": "read-result"}';
            }
          }
          export default function init() {
            return Promise.resolve();
          }
        `,
        contentType: 'application/javascript',
        hash: 'mock-hash',
      });

      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: new ArrayBuffer(100),
        contentType: 'application/wasm',
        hash: 'wasm-hash',
      });

      const originalFunction3 = global.Function;
      global.Function = jest.fn().mockImplementation(() => (url: string) => Promise.resolve({
        WasmInterface: class { async GET(){ return '{"data":"read-result"}'; } free(){} },
        default: jest.fn().mockResolvedValue(undefined),
      })) as any;
      (global as any).window = {} as any;
      const result = await wasmExecutor.execute(mockAction, getContext);
      global.Function = originalFunction3 as any;
      delete (global as any).window;

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'read-result' });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Calling GET method',
        expect.any(Object),
      );
    });

    test('should handle INFO method calls', async () => {
      const infoContext: WasmExecutionContext = {
        method: 'INFO',
        params: {},
      };

      const mockModule = {
        default: () => Promise.resolve(),
        WasmInterface: class {
          INFO() {
            return '{"version": "1.0.0"}';
          }
          free() {}
        },
      };
      global.Function = jest.fn().mockImplementation(() => (url: string) => Promise.resolve(mockModule));
      global.Blob = jest.fn().mockImplementation(function () { return {}; } as any) as any;
      global.URL = {
        createObjectURL: jest.fn().mockReturnValue('blob:test-url'),
        revokeObjectURL: jest.fn(),
      } as any;

      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: `
          export class WasmInterface {
            INFO() {
              return '{"version": "1.0.0"}';
            }
          }
          export default function init() {
            return Promise.resolve();
          }
        `,
        contentType: 'application/javascript',
        hash: 'mock-hash',
      });

      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: new ArrayBuffer(100),
        contentType: 'application/wasm',
        hash: 'wasm-hash',
      });

      const originalFunction4 = global.Function;
      global.Function = jest.fn().mockImplementation(() => (url: string) => Promise.resolve({
        WasmInterface: class { INFO(){ return '{"version":"1.0.0"}'; } free(){} },
        default: jest.fn().mockResolvedValue(undefined),
      })) as any;
      (global as any).window = {} as any;
      const result = await wasmExecutor.execute(mockAction, infoContext);
      global.Function = originalFunction4 as any;
      delete (global as any).window;

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ version: '1.0.0' });
      expect(mockLogger.debug).toHaveBeenCalledWith('Calling INFO method');
    });

    test('should throw error for unsupported methods', async () => {
      const unsupportedContext: WasmExecutionContext = {
        method: 'UNSUPPORTED',
        params: {},
      };

      const mockModule = {
        default: () => Promise.resolve(),
        WasmInterface: class {
          async GET() { return '{}'; }
          free() {}
        },
      };
      global.Function = jest.fn().mockImplementation(() => (url: string) => Promise.resolve(mockModule));
      global.Blob = jest.fn().mockImplementation(function () { return {}; } as any) as any;
      global.URL = {
        createObjectURL: jest.fn().mockReturnValue('blob:test-url'),
        revokeObjectURL: jest.fn(),
      } as any;

      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: `
          export class WasmInterface {
            async GET() { return '{}'; }
          }
          export default function init() {
            return Promise.resolve();
          }
        `,
        contentType: 'application/javascript',
        hash: 'mock-hash',
      });

      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: new ArrayBuffer(100),
        contentType: 'application/wasm',
        hash: 'wasm-hash',
      });

      const originalFunctionLocal = global.Function;
      (global as any).window = {} as any;
      global.Function = jest.fn().mockImplementation(() => (url: string) => Promise.resolve({
        WasmInterface: class { async GET(){ return '{}'; } free(){} },
        default: jest.fn().mockResolvedValue(undefined),
      })) as any;
      const result = await wasmExecutor.execute(mockAction, unsupportedContext);
      global.Function = originalFunctionLocal as any;
      delete (global as any).window;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Method UNSUPPORTED not supported');
    });

    test('should throw error when JavaScript module fails to load', async () => {
      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: null,
        contentType: 'application/javascript',
        hash: 'mock-hash',
      });

      const originalFunction5 = global.Function;
      global.Function = jest.fn().mockImplementation(() => (url: string) => Promise.resolve({ default: undefined })) as any;
      (global as any).window = {} as any;
      const result = await wasmExecutor.execute(mockAction, mockContext);
      global.Function = originalFunction5 as any;
      delete (global as any).window;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load JavaScript module');
    });

    test('should throw error when no init function found', async () => {
      const emptyModule = {};
      global.Function = jest.fn().mockImplementation(() => (url: string) => Promise.resolve(emptyModule));
      global.Blob = jest.fn().mockImplementation(function () { return {}; } as any) as any;
      global.URL = {
        createObjectURL: jest.fn().mockReturnValue('blob:test-url'),
        revokeObjectURL: jest.fn(),
      } as any;
      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: `export const someExport = 'value';`,
        contentType: 'application/javascript',
        hash: 'mock-hash',
      });

      const originalFunction6 = global.Function;
      global.Function = jest.fn().mockImplementation(() => (url: string) => Promise.resolve({ default: jest.fn().mockResolvedValue(undefined) })) as any;
      (global as any).window = {} as any;
      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: new ArrayBuffer(10),
        contentType: 'application/wasm',
        hash: 'wasm-hash',
      });
      const result = await wasmExecutor.execute(mockAction, mockContext);
      global.Function = originalFunction6 as any;
      delete (global as any).window;

      expect(result.success).toBe(false);
      expect(result.error).toContain('WasmInterface not found');
    });

    test('should throw error when WasmInterface not found', async () => {
      const noInterfaceModule = { default: () => Promise.resolve(), otherExport: 'value' };
      global.Function = jest.fn().mockImplementation(() => (url: string) => Promise.resolve(noInterfaceModule));
      global.Blob = jest.fn().mockImplementation(function () { return {}; } as any) as any;
      global.URL = {
        createObjectURL: jest.fn().mockReturnValue('blob:test-url'),
        revokeObjectURL: jest.fn(),
      } as any;
      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: `export default function init() { return Promise.resolve(); }`,
        contentType: 'application/javascript',
        hash: 'mock-hash',
      });
      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: new ArrayBuffer(8),
        contentType: 'application/wasm',
        hash: 'wasm-hash',
      });

      const originalFunction7 = global.Function;
      global.Function = jest.fn().mockImplementation(() => (url: string) => Promise.resolve({
        WasmInterface: class { async POST(){ return 'invalid json'; } free(){} },
        default: jest.fn().mockResolvedValue(undefined),
      })) as any;
      (global as any).window = {} as any;
      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: new ArrayBuffer(10),
        contentType: 'application/wasm',
        hash: 'wasm-hash',
      });
      const result = await wasmExecutor.execute(mockAction, mockContext);
      global.Function = originalFunction7 as any;

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: 'invalid json' });
    });

    test('should handle raw WASM execution error', async () => {
      const actionWithoutJs: ActionRegistration = {
        ...mockAction,
        js_t_id: undefined,
      };

      const result = await wasmExecutor.execute(actionWithoutJs, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Raw WASM execution is not supported');
    });

    test('should handle Node.js/SSR environment', async () => {
      const originalWindow = global.window;
      delete global.window;

      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: 'console.log("test");',
        contentType: 'application/javascript',
        hash: 'mock-hash',
      });

      const result = await wasmExecutor.execute(mockAction, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'WASM execution in Node.js/SSR environment is not supported',
      );

      global.window = originalWindow;
    });

    test('should handle JSON parsing errors gracefully', async () => {
      const mockModule = {
        default: () => Promise.resolve(),
        WasmInterface: class {
          async POST() { return 'invalid json'; }
          free() {}
        },
      };
      global.Function = jest.fn().mockImplementation(() => (url: string) => Promise.resolve(mockModule));
      global.Blob = jest.fn().mockImplementation(function () { return {}; } as any) as any;
      global.URL = {
        createObjectURL: jest.fn().mockReturnValue('blob:test-url'),
        revokeObjectURL: jest.fn(),
      } as any;
      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: `export default function init() { return Promise.resolve(); }`,
        contentType: 'application/javascript',
        hash: 'mock-hash',
      });

      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: new ArrayBuffer(100),
        contentType: 'application/wasm',
        hash: 'wasm-hash',
      });

      mockHrlResolver.resolve.mockResolvedValueOnce({
        content: new ArrayBuffer(10),
        contentType: 'application/wasm',
        hash: 'wasm-hash',
      });
      const result = await wasmExecutor.execute(mockAction, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: 'invalid json' });
    });

    test('should log errors when logger is available', async () => {
      mockHrlResolver.resolve.mockRejectedValueOnce(new Error('Network error'));

      const result = await wasmExecutor.execute(mockAction, mockContext);

      expect(result.success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'JavaScript execution failed',
        expect.any(Object),
      );
    });

    test('should fallback to console when logger methods are not available', async () => {
      const originalConsoleError = console.error;
      console.error = jest.fn();

      mockLogger.error = undefined as any;

      mockHrlResolver.resolve.mockRejectedValueOnce(new Error('Network error'));

      const result = await wasmExecutor.execute(mockAction, mockContext);

      expect(result.success).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'JavaScript execution failed',
        expect.any(Object),
      );

      console.error = originalConsoleError;
    });
  });

  describe('readWasmString', () => {
    test('should read null-terminated string from WASM memory', () => {
      const memory = new WebAssembly.Memory({ initial: 1 });
      const mem = new Uint8Array(memory.buffer);
      const testString = 'hello';
      const ptr = 10;

      for (let i = 0; i < testString.length; i++) {
        mem[ptr + i] = testString.charCodeAt(i);
      }
      mem[ptr + testString.length] = 0;

      const result = (wasmExecutor as any).readWasmString(memory, ptr);

      expect(result).toBe('hello');
    });
  });

  describe('clearCache', () => {
    test('should clear the WASM cache', () => {
      const cache = (wasmExecutor as any).wasmCache;
      cache.set('test-key', {} as any);

      expect(cache.size).toBe(1);

      wasmExecutor.clearCache();

      expect(cache.size).toBe(0);
    });
  });
});
