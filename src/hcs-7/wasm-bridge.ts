// TextEncoder and TextDecoder are available globally in modern browsers
// and in Node.js without explicit import
import { Logger, ILogger } from '../utils/logger';

export interface BaseMessage {
  p: string;
  op: string;
  m: string;
  t?: string;
  t_id?: string;
  d?: Record<string, unknown>;
}

export interface EVMConfig extends BaseMessage {
  c: {
    contractAddress: string;
    abi: {
      inputs: Array<{
        name: string;
        type: string;
      }>;
      name: string;
      outputs: Array<{
        name: string;
        type: string;
      }>;
      stateMutability: string;
      type: string;
    };
  };
}

export interface WASMConfig extends BaseMessage {
  c: {
    wasmTopicId: string;
    inputType: {
      stateData: Record<string, string>;
    };
    outputType: {
      type: string;
      format: string;
    };
  };
}

export interface WasmExports extends WebAssembly.Exports {
  __wbindgen_add_to_stack_pointer: (a: number) => number;
  __wbindgen_malloc: (a: number, b: number) => number;
  __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  __wbindgen_free: (a: number, b: number, c: number) => void;
  memory: WebAssembly.Memory;
  process_state: (state_json: string, messages_json: string) => string;
  get_params: () => string;
  [key: string]: any;
}

export class WasmBridge {
  wasm: WasmExports | null = null;
  private WASM_VECTOR_LEN: number = 0;
  private cachedUint8Memory: Uint8Array | null = null;
  private cachedDataViewMemory: DataView | null = null;
  private readonly textEncoder: TextEncoder;
  private readonly textDecoder: TextDecoder;
  private logger: ILogger;

  constructor() {
    this.textEncoder = new TextEncoder();
    this.textDecoder = new TextDecoder('utf-8', {
      ignoreBOM: true,
      fatal: true,
    });
    this.textDecoder.decode();
    this.logger = Logger.getInstance({ module: 'WasmBridge' });
  }

  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.logger.setLogLevel(level);
  }

  get wasmInstance(): WasmExports {
    if (!this.wasm) {
      throw new Error('WASM not initialized');
    }
    return this.wasm;
  }

  private getUint8Memory(): Uint8Array {
    if (!this.wasm) {
      throw new Error('WASM not initialized');
    }
    if (
      this.cachedUint8Memory === null ||
      this.cachedUint8Memory.byteLength === 0
    ) {
      this.cachedUint8Memory = new Uint8Array(this.wasm.memory.buffer);
    }
    return this.cachedUint8Memory;
  }

  private getDataViewMemory(): DataView {
    if (!this.wasm) {
      throw new Error('WASM not initialized');
    }
    if (
      this.cachedDataViewMemory === null ||
      this.cachedDataViewMemory.buffer !== this.wasm.memory.buffer
    ) {
      this.cachedDataViewMemory = new DataView(this.wasm.memory.buffer);
    }
    return this.cachedDataViewMemory;
  }

  private encodeString(
    arg: string,
    view: Uint8Array,
  ): { read: number; written: number } {
    if (arg.length === 0) {
      return { read: 0, written: 0 };
    }

    const buf = this.textEncoder.encode(arg);
    view.set(buf);
    return { read: arg.length, written: buf.length };
  }

  private passStringToWasm(
    arg: string,
    malloc: (a: number, b: number) => number,
    realloc?: (a: number, b: number, c: number, d: number) => number,
  ): number {
    if (realloc === undefined) {
      const buf = this.textEncoder.encode(arg);
      const ptr = malloc(buf.length, 1);
      const view = this.getUint8Memory();
      view.set(buf, ptr);
      this.WASM_VECTOR_LEN = buf.length;
      return ptr;
    }

    let len = this.textEncoder.encode(arg).length;
    let ptr = malloc(len, 1);

    const mem = this.getUint8Memory();

    let offset = 0;

    for (; offset < len; offset++) {
      const code = arg.charCodeAt(offset);
      if (code > 0x7f) break;
      mem[ptr + offset] = code;
    }

    if (offset !== len) {
      if (offset !== 0) {
        arg = arg.slice(offset);
      }
      ptr = realloc(
        ptr,
        len,
        (len = offset + this.textEncoder.encode(arg).length * 3),
        1,
      );
      const view = this.getUint8Memory().subarray(ptr + offset, ptr + len);
      const ret = this.encodeString(arg, view);

      offset += ret.written;
    }

    this.WASM_VECTOR_LEN = offset;
    return ptr;
  }

  private getStringFromWasm(ptr: number, len: number): string {
    ptr = ptr >>> 0;
    return this.textDecoder.decode(
      this.getUint8Memory().subarray(ptr, ptr + len),
    );
  }

  createWasmFunction(
    wasmFn: (...args: any[]) => any,
  ): (...args: string[]) => string {
    if (!this.wasm) {
      throw new Error('WASM not initialized');
    }

    return (...args: string[]): string => {
      const retptr = this.wasm!.__wbindgen_add_to_stack_pointer(-16);
      let deferred: [number, number] = [0, 0];

      try {
        const ptrLenPairs = args.map(arg => {
          const ptr = this.passStringToWasm(
            arg,
            this.wasm!.__wbindgen_malloc,
            this.wasm!.__wbindgen_realloc,
          );
          return [ptr, this.WASM_VECTOR_LEN];
        });

        const wasmArgs = [retptr, ...ptrLenPairs.flat()];

        wasmFn.apply(this.wasm, wasmArgs);

        const r0 = this.getDataViewMemory().getInt32(retptr + 4 * 0, true);
        const r1 = this.getDataViewMemory().getInt32(retptr + 4 * 1, true);
        deferred = [r0, r1];

        return this.getStringFromWasm(r0, r1);
      } finally {
        this.wasm!.__wbindgen_add_to_stack_pointer(16);
        this.wasm!.__wbindgen_free(deferred[0], deferred[1], 1);
      }
    };
  }

  async initWasm(wasmBytes: BufferSource): Promise<WasmExports> {
    const bridge = this;
    const imports = {
      __wbindgen_placeholder__: {
        __wbindgen_throw: function (ptr: number, len: number) {
          const message = bridge.getStringFromWasm(ptr, len);
          bridge.logger.error(`WASM error: ${message}`);
          throw new Error(message);
        },
      },
    };

    try {
      this.logger.debug('Compiling WASM module');
      const wasmModule = await WebAssembly.compile(wasmBytes);
      this.logger.debug('Instantiating WASM module');
      const wasmInstance = await WebAssembly.instantiate(wasmModule, imports);
      this.wasm = wasmInstance.exports as WasmExports;
      this.logger.info('WASM module initialized successfully');
      return this.wasm;
    } catch (error) {
      this.logger.error('Failed to initialize WASM module', error);
      throw error;
    }
  }

  createStateData(wasmConfig: WASMConfig, stateData: Record<string, any> = {}) {
    let dynamicStateData: Record<string, any> = {};

    if (wasmConfig?.c?.inputType?.stateData) {
      // Special case: if we have latestRoundData with all the fields we need
      if (
        stateData.latestRoundData &&
        Object.keys(wasmConfig.c.inputType.stateData).every(
          key => key in stateData.latestRoundData,
        )
      ) {
        // Return the nested structure for Chainlink
        dynamicStateData.latestRoundData = {};
        Object.entries(wasmConfig.c.inputType.stateData).forEach(([key, _]) => {
          dynamicStateData.latestRoundData[key] = String(
            stateData.latestRoundData[key],
          );
        });
      } else {
        // Handle flat structure (launchpage case)
        Object.entries(wasmConfig.c.inputType.stateData).forEach(
          ([key, type]) => {
            const result = stateData[key];
            if (
              result &&
              typeof result === 'object' &&
              'values' in result &&
              result.values.length > 0
            ) {
              dynamicStateData[key] = String(result.values[0]);
            } else {
              dynamicStateData[key] = this.getDefaultValueForType(
                type as string,
              );
            }
          },
        );
      }
    }
    return dynamicStateData;
  }

  private getDefaultValueForType(type: string): string {
    if (
      type.startsWith('uint') ||
      type.startsWith('int') ||
      type === 'number'
    ) {
      return '0';
    } else if (type === 'bool') {
      return 'false';
    } else {
      return '';
    }
  }

  executeWasm(stateData: Record<string, any>, messages: BaseMessage[]) {
    if (!this.wasm) {
      this.logger.error('WASM not initialized');
      throw new Error('WASM not initialized');
    }

    try {
      this.logger.debug('Executing WASM with stateData', stateData);
      const fn = this.createWasmFunction(this.wasmInstance.process_state);
      return fn(JSON.stringify(stateData), JSON.stringify(messages));
    } catch (error) {
      this.logger.error('Error executing WASM', error);
      throw error;
    }
  }

  getParams(): string {
    const fn = this.createWasmFunction(this.wasmInstance.get_params);
    return fn();
  }
}
