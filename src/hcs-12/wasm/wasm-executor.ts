/**
 * WASM Executor for HCS-12 HashLinks
 *
 * Handles loading and executing WASM modules for HashLink actions
 */

import { Logger } from '../../utils/logger';
import { ActionRegistration } from '../types';
import { HRLResolver } from '../../utils/hrl-resolver';
import { NetworkType } from '../../utils/types';

export interface WasmExecutionContext {
  method: string;
  params: Record<string, any>;
  state?: Record<string, any>;
}

export interface WasmExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  gasUsed?: number;
}

interface WasmExports {
  GET?: (ptr: number, len: number) => number;
  POST?: (ptr: number, len: number) => number;
  memory?: WebAssembly.Memory;
  __wbindgen_malloc?: (size: number) => number;
  __wbindgen_free?: (ptr: number, size: number) => void;
  [key: string]: any; // Allow dynamic method names
}

/**
 * Executes WASM modules for HCS-12 actions
 */
export class WasmExecutor {
  private logger: Logger;
  private hrlResolver: HRLResolver;
  private network: NetworkType;
  private wasmCache: Map<string, WebAssembly.Instance> = new Map();

  constructor(logger: Logger, network: NetworkType) {
    this.logger = logger;
    this.network = network;
    this.hrlResolver = new HRLResolver();
  }

  /**
   * Execute a WASM action
   */
  async execute(
    action: ActionRegistration,
    context: WasmExecutionContext,
  ): Promise<WasmExecutionResult> {
    try {
      if (this.logger && typeof this.logger.debug === 'function') {
        this.logger.debug('Executing WASM action', {
          actionId: action.t_id,
          method: context.method,
          hasJavaScript: !!action.js_t_id,
        });
      }

      // If JavaScript wrapper exists, use it instead of raw WASM
      if (action.js_t_id) {
        return await this.executeJavaScript(action, context);
      }

      // For wasm-bindgen modules, a JavaScript wrapper is required
      throw new Error('Raw WASM execution is not supported for wasm-bindgen modules. JavaScript wrapper is required.');
    } catch (error) {
      if (this.logger && typeof this.logger.error === 'function') {
        this.logger.error('WASM execution failed', {
          actionId: action.t_id,
          error: error.message,
        });
      } else {
        console.error('WASM execution failed', {
          actionId: action.t_id,
          error: error.message,
        });
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Load a WASM instance
   */

  /**
   * Read a string from WASM memory
   */
  private readWasmString(memory: WebAssembly.Memory, ptr: number): string {
    const mem = new Uint8Array(memory.buffer);

    // Find string length (null-terminated)
    let len = 0;
    while (mem[ptr + len] !== 0) {
      len++;
    }

    // Decode string
    const decoder = new TextDecoder();
    return decoder.decode(mem.slice(ptr, ptr + len));
  }


  /**
   * Execute JavaScript wrapper
   */
  private async executeJavaScript(
    action: ActionRegistration,
    context: WasmExecutionContext,
  ): Promise<WasmExecutionResult> {
    try {
      if (this.logger && typeof this.logger.debug === 'function') {
        this.logger.debug('Loading JavaScript wrapper', {
          jsTopicId: action.js_t_id,
        });
      }

      // In browser environment, we need to dynamically import the ES module
      if (typeof window !== 'undefined') {

        // Create a dynamic import using a data URL
        const jsResult = await this.hrlResolver.resolve(action.js_t_id!, {
          network: this.network,
          returnRaw: false,
        });

        if (!jsResult.content || typeof jsResult.content !== 'string') {
          throw new Error('Failed to load JavaScript module: invalid content');
        }

        // Create a blob URL for the module
        const blob = new Blob([jsResult.content], { type: 'application/javascript' });
        const moduleUrl = URL.createObjectURL(blob);

        try {
          // Dynamically import the module
          if (this.logger && typeof this.logger.debug === 'function') {
            this.logger.debug('Importing JavaScript module from blob URL');
          }
          const module = await import(moduleUrl);

          if (this.logger && typeof this.logger.debug === 'function') {
            this.logger.debug('Module imported, exports:', Object.keys(module));
          }

          // Initialize the WASM module
          if (module.default || module.init) {
            const init = module.default || module.init;

            if (this.logger && typeof this.logger.debug === 'function') {
              this.logger.debug('Loading WASM bytes from topic:', action.t_id);
            }

            // Load the WASM bytes
            const wasmResult = await this.hrlResolver.resolve(action.t_id, {
              network: this.network,
              returnRaw: true,
            });

            if (this.logger && typeof this.logger.debug === 'function') {
              const size = wasmResult.content instanceof ArrayBuffer 
                ? wasmResult.content.byteLength 
                : wasmResult.content.length;
              this.logger.debug('WASM bytes loaded, size:', size);
            }

            // Call init with proper wasm-bindgen format (object parameter)
            await init({ module_or_path: wasmResult.content });
            
            if (this.logger && typeof this.logger.debug === 'function') {
              this.logger.debug('WASM module initialized successfully');
            }
          } else {
            throw new Error('No init function found in JavaScript module');
          }

          // Create instance of the wrapper class
          const WasmInterface = module.WasmInterface;
          if (!WasmInterface) {
            throw new Error('WasmInterface not found in module exports. Available exports: ' + Object.keys(module).join(', '));
          }

          if (this.logger && typeof this.logger.debug === 'function') {
            this.logger.debug('Creating WasmInterface instance');
          }
          const wasmInterface = new WasmInterface();

          let result: string;

          if (context.method === 'POST' && wasmInterface.POST) {
            // Extract action from params
            const actionName = context.params.operation || 'default';
            
            // Pass all params and state - let the WASM module decide what it needs
            const allParams = {
              ...context.params,
              ...context.state
            };
            
            const paramsJson = JSON.stringify(allParams);

            if (this.logger && typeof this.logger.debug === 'function') {
              this.logger.debug('Calling POST method', { actionName, paramsJson, allParams });
            } else {
              console.log('WASM POST params:', { actionName, paramsJson, allParams });
            }

            // Call the POST method with proper parameters
            result = await wasmInterface.POST(
              actionName,
              paramsJson,
              this.network.toString(),
              ''  // hash_link_memo (empty for now)
            );
          } else if (context.method === 'GET' && wasmInterface.GET) {
            const actionName = context.params.operation || 'default';
            const paramsJson = JSON.stringify(context.params);

            if (this.logger && typeof this.logger.debug === 'function') {
              this.logger.debug('Calling GET method', { actionName, paramsJson });
            }

            result = await wasmInterface.GET(
              actionName,
              paramsJson,
              this.network.toString()
            );
          } else if (context.method === 'INFO' && wasmInterface.INFO) {
            if (this.logger && typeof this.logger.debug === 'function') {
              this.logger.debug('Calling INFO method');
            }
            result = wasmInterface.INFO();
          } else {
            throw new Error(`Method ${context.method} not supported by WASM module`);
          }

          // Parse result
          let parsedResult: any;
          try {
            parsedResult = JSON.parse(result);
          } catch {
            parsedResult = { value: result };
          }

          // Clean up
          if (wasmInterface.free) {
            wasmInterface.free();
          }

          URL.revokeObjectURL(moduleUrl);

          return {
            success: true,
            data: parsedResult,
          };
        } catch (e) {
          URL.revokeObjectURL(moduleUrl);
          throw e;
        }
      } else {
        // Node.js environment - use eval to execute the JavaScript wrapper
        if (this.logger && typeof this.logger.info === 'function') {
          this.logger.info('Executing JavaScript wrapper in Node.js environment');
        }

        // Load the JavaScript wrapper content
        const jsResult = await this.hrlResolver.resolve(action.js_t_id!, {
          network: this.network,
          returnRaw: false,
        });

        if (!jsResult.content || typeof jsResult.content !== 'string') {
          throw new Error('Failed to load JavaScript module: invalid content');
        }

        // Load the WASM bytes
        const wasmResult = await this.hrlResolver.resolve(action.t_id, {
          network: this.network,
          returnRaw: true,
        });

        // Create a context to execute the JavaScript wrapper
        const moduleContext = {
          exports: {} as any,
          module: { exports: {} as any },
          require: () => { throw new Error('require not supported'); },
          global: global,
          globalThis: globalThis,
          self: undefined as any,
          window: undefined as any,
          fetch: undefined as any,
          Response: undefined as any,
          WebAssembly: WebAssembly,
          Promise: Promise,
          Function: Function,
          console: console,
          queueMicrotask: queueMicrotask,
          TextDecoder: TextDecoder,
          TextEncoder: TextEncoder,
          FinalizationRegistry: (typeof (globalThis as any).FinalizationRegistry !== 'undefined') ? (globalThis as any).FinalizationRegistry : undefined as any,
          URL: URL
        };

        // Execute the JavaScript wrapper in the context
        const moduleFunction = new Function('exports', 'module', 'global', 'globalThis', 'self', 'window', 'fetch', 'Response', 'WebAssembly', 'Promise', 'Function', 'console', 'queueMicrotask', 'TextDecoder', 'TextEncoder', 'FinalizationRegistry', 'URL', jsResult.content);
        
        moduleFunction(
          moduleContext.exports,
          moduleContext.module,
          moduleContext.global,
          moduleContext.globalThis,
          moduleContext.self,
          moduleContext.window,
          moduleContext.fetch,
          moduleContext.Response,
          moduleContext.WebAssembly,
          moduleContext.Promise,
          moduleContext.Function,
          moduleContext.console,
          moduleContext.queueMicrotask,
          moduleContext.TextDecoder,
          moduleContext.TextEncoder,
          moduleContext.FinalizationRegistry,
          moduleContext.URL
        );

        // Get the init function and WasmInterface from exports
        const initFunction = (moduleContext.exports as any).default || (moduleContext.module.exports as any).default;
        const WasmInterface = (moduleContext.exports as any).WasmInterface || (moduleContext.module.exports as any).WasmInterface;

        if (!initFunction) {
          throw new Error('No init function found in JavaScript wrapper');
        }

        if (!WasmInterface) {
          throw new Error('No WasmInterface class found in JavaScript wrapper');
        }

        // Initialize the WASM module using the wrapper's init function
        await initFunction({ module_or_path: wasmResult.content });

        // Create instance of the wrapper class
        const wasmInterface = new WasmInterface();

        let result: string;

        if (context.method === 'POST' && wasmInterface.POST) {
          // Extract action from params
          const actionName = context.params.operation || 'default';
          const paramsJson = JSON.stringify({
            ...context.params,
            ...context.state
          });

          // Call the POST method with proper parameters
          result = await wasmInterface.POST(
            actionName,
            paramsJson,
            this.network.toString(),
            ''  // hash_link_memo (empty for now)
          );
        } else if (context.method === 'GET' && wasmInterface.GET) {
          const actionName = context.params.operation || 'default';
          const paramsJson = JSON.stringify(context.params);

          result = await wasmInterface.GET(
            actionName,
            paramsJson,
            this.network.toString()
          );
        } else if (context.method === 'INFO' && wasmInterface.INFO) {
          result = wasmInterface.INFO();
        } else {
          throw new Error(`Method ${context.method} not supported by WASM module`);
        }

        // Parse result
        let parsedResult: any;
        try {
          parsedResult = JSON.parse(result);
        } catch {
          parsedResult = { value: result };
        }

        // Clean up the instance
        if (wasmInterface.free) {
          wasmInterface.free();
        }

        return {
          success: true,
          data: parsedResult,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      if (this.logger && typeof this.logger.error === 'function') {
        this.logger.error('JavaScript execution failed', {
          jsTopicId: action.js_t_id,
          error: errorMessage,
          stack: errorStack,
          fullError: error
        });
      } else {
        console.error('JavaScript execution failed', {
          jsTopicId: action.js_t_id,
          error: errorMessage,
          stack: errorStack,
          fullError: error
        });
      }

      return {
        success: false,
        error: errorMessage || 'Unknown error',
      };
    }
  }

  /**
   * Clear the WASM cache
   */
  clearCache(): void {
    this.wasmCache.clear();
  }
}
