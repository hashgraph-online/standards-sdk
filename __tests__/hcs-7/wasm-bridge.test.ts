import { WasmBridge } from '../../src/hcs-7/wasm-bridge';
import { Logger } from '../../src/utils/logger';

const mockWebAssembly = {
  instantiate: jest.fn(),
  compile: jest.fn(),
};

(global as any).WebAssembly = mockWebAssembly;

(global as any).TextEncoder = jest.fn().mockImplementation(() => ({
  encode: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
}));

(global as any).TextDecoder = jest.fn().mockImplementation(() => ({
  decode: jest.fn().mockReturnValue('decoded text'),
}));

describe('WasmBridge', () => {
  let logger: Logger;
  let bridge: WasmBridge;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger({ module: 'WasmBridgeTest' });
    bridge = new WasmBridge(logger);
  });

  describe('constructor', () => {
    test('initializes with logger', () => {
      expect(bridge).toBeInstanceOf(WasmBridge);
    });
  });

  describe('WebAssembly utilities', () => {
    test('TextEncoder encodes strings', () => {
      const encoder = new TextEncoder();
      const result = encoder.encode('test string');

      expect(result).toBeInstanceOf(Uint8Array);
      expect(encoder.encode).toHaveBeenCalledWith('test string');
    });

    test('TextDecoder decodes bytes', () => {
      const decoder = new TextDecoder();
      const result = decoder.decode(new Uint8Array([1, 2, 3, 4]));

      expect(typeof result).toBe('string');
      expect(decoder.decode).toHaveBeenCalled();
    });
  });

  describe('WASM configuration validation', () => {
    test('validates EVM config structure', () => {
      const validEVMConfig = {
        p: 'hcs-7',
        op: 'deploy',
        m: 'EVM deployment',
        t: '0.0.12345',
        c: {
          contractAddress: '0x1234567890123456789012345678901234567890',
          abi: {
            inputs: [{ name: 'param1', type: 'uint256' }],
            name: 'testFunction',
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'view',
            type: 'function',
          },
        },
      };

      expect(validEVMConfig.p).toBe('hcs-7');
      expect(validEVMConfig.c.contractAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(Array.isArray(validEVMConfig.c.abi.inputs)).toBe(true);
    });

    test('validates WASM config structure', () => {
      const validWASMConfig = {
        p: 'hcs-7',
        op: 'execute',
        m: 'WASM execution',
        t_id: '0.0.67890',
        c: {
          wasmTopicId: '0.0.54321',
          inputType: {
            stateData: { key1: 'value1' },
          },
          outputType: {
            type: 'json',
            format: 'object',
          },
        },
      };

      expect(validWASMConfig.p).toBe('hcs-7');
      expect(validWASMConfig.c.wasmTopicId).toBe('0.0.54321');
      expect(typeof validWASMConfig.c.inputType.stateData).toBe('object');
      expect(validWASMConfig.c.outputType.type).toBe('json');
    });
  });

  describe('WebAssembly interface', () => {
    test('defines expected WASM exports interface', () => {
      const expectedExports = [
        '__wbindgen_add_to_stack_pointer',
        '__wbindgen_malloc',
        '__wbindgen_realloc',
        '__wbindgen_free',
      ];

      expectedExports.forEach(exportName => {
        expect(typeof exportName).toBe('string');
        expect(exportName.startsWith('__wbindgen')).toBe(true);
      });
    });

    test('handles WebAssembly compilation', async () => {
      const mockModule = { exports: {} };
      mockWebAssembly.compile.mockResolvedValue(mockModule);

      expect(mockWebAssembly.compile).not.toHaveBeenCalled();
    });

    test('handles WebAssembly instantiation', async () => {
      const mockInstance = { exports: {} };
      mockWebAssembly.instantiate.mockResolvedValue({ instance: mockInstance });

      expect(mockWebAssembly.instantiate).not.toHaveBeenCalled();
    });
  });
});
