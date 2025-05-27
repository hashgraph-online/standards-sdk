import { AccountId, ContractId } from '@hashgraph/sdk';
import { EVMConfig } from './wasm-bridge';
import { ethers } from 'ethers';
import { Logger } from '../utils/logger';

export interface EVMCache {
  get(key: string): Promise<string | undefined> | string | undefined;
  set(key: string, value: string): Promise<void> | void;
  delete(key: string): Promise<void> | void;
  clear(): Promise<void> | void;
}

class MapCache implements EVMCache {
  private cache: Map<string, string>;

  constructor() {
    this.cache = new Map();
  }

  get(key: string): string | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: string): void {
    this.cache.set(key, value);
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

export class EVMBridge {
  public network: string;
  public mirrorNodeUrl: string;
  private cache: EVMCache;
  private logger: Logger;

  constructor(
    network: string = 'mainnet-public',
    mirrorNodeUrl: string = `mirrornode.hedera.com/api/v1/contracts/call`,
    cache?: EVMCache,
  ) {
    this.network = network;
    this.mirrorNodeUrl = mirrorNodeUrl;
    this.cache = cache || new MapCache();
    this.logger = Logger.getInstance({ module: 'EVMBridge' });
  }

  async executeCommands(
    evmConfigs: EVMConfig[],
    initialState: Record<string, string> = {},
  ): Promise<{
    results: Record<string, any>;
    stateData: Record<string, any>;
  }> {
    let stateData: Record<string, any> = { ...initialState };
    const results: Record<string, any> = {};

    for (const config of evmConfigs) {
      const cacheKey = `${config.c.contractAddress}-${config.c.abi.name}`;

      // Check cache first
      const cachedResult = await this.cache.get(cacheKey);
      if (cachedResult) {
        results[config.c.abi.name] = JSON.parse(cachedResult);
        Object.assign(stateData, results[config.c.abi.name]); // Flatten the values into stateData
        continue;
      }

      try {
        const iface = new ethers.Interface([
          {
            ...config.c.abi,
          },
        ]);
        const command = iface.encodeFunctionData(config.c.abi.name);
        const contractId = ContractId.fromSolidityAddress(
          config.c.contractAddress,
        );

        const result = await this.readFromMirrorNode(
          command,
          AccountId.fromString('0.0.800'),
          contractId,
        );

        this.logger.info(
          `Result for ${config.c.contractAddress}:`,
          result?.result,
        );

        if (!result?.result) {
          this.logger.warn(
            `Failed to get result from mirror node for ${config.c.contractAddress}`,
          );
          results[config.c.abi.name] = '0';
          Object.assign(stateData, results[config.c.abi.name]); // Flatten the values into stateData
          continue;
        }

        const decodedResult = iface?.decodeFunctionResult(
          config.c.abi.name,
          result.result,
        );
        let processedResult: Record<string, any> = {
          values: [], // Initialize array for values
        };

        // Handle tuple returns and array-like results
        if (decodedResult) {
          // For tuples, ethers.js provides both array-like and named properties
          // We want to use the array-like access to ensure we get each value in order
          config.c.abi.outputs?.forEach((output, idx) => {
            const value = decodedResult[idx];
            const formattedValue = formatValue(value, output.type);

            // Add to values array
            processedResult.values.push(formattedValue);

            if (output.name) {
              processedResult[output.name] = formattedValue;
            }
          });
        }

        await this.cache.set(cacheKey, JSON.stringify(processedResult));

        results[config.c.abi.name] = processedResult;
        stateData[config.c.abi.name] = processedResult;
      } catch (error) {
        this.logger.error(
          `Error executing command for ${config.c.contractAddress}:`,
          error,
        );
        results[config.c.abi.name] = '0';
        Object.assign(stateData, results[config.c.abi.name]); // Flatten the values into stateData
      }
    }

    return { results, stateData };
  }

  async executeCommand(
    evmConfig: EVMConfig,
    stateData: Record<string, string> = {},
  ): Promise<any> {
    const { results, stateData: newStateData } = await this.executeCommands(
      [evmConfig],
      stateData,
    );
    return {
      result: results[evmConfig.c.abi.name],
      stateData: newStateData,
    };
  }

  async readFromMirrorNode(
    command: string,
    from: AccountId,
    to: ContractId,
  ): Promise<any> {
    try {
      const toAddress = to.toSolidityAddress();
      const fromAddress = from.toSolidityAddress();
      const response = await fetch(
        `https://${this.network}.${this.mirrorNodeUrl}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            block: 'latest',
            data: command,
            estimate: false,
            gas: 300_000,
            gasPrice: 100000000,
            from: fromAddress.startsWith('0x')
              ? fromAddress
              : `0x${fromAddress}`,
            to: toAddress?.startsWith('0x') ? toAddress : `0x${toAddress}`,
            value: 0,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Error reading from mirror node:', error);
      return null;
    }
  }

  // Add method to clear cache if needed
  public async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  // Add method to remove specific cache entry
  public async clearCacheForContract(
    contractAddress: string,
    functionName: string,
  ): Promise<void> {
    await this.cache.delete(`${contractAddress}-${functionName}`);
  }

  // Method to set log level for this bridge instance
  public setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.logger.setLogLevel(level);
  }
}

function formatValue(value: any, type: string): string {
  if (value === null || value === undefined) {
    return '0';
  }

  // Handle BigNumber objects from ethers.js
  if (value._isBigNumber) {
    return value.toString();
  }

  if (type.startsWith('uint') || type.startsWith('int')) {
    return String(value);
  } else if (type === 'bool') {
    return value ? 'true' : 'false';
  } else if (type === 'string') {
    return value;
  } else if (type === 'address') {
    return String(value).toLowerCase();
  } else if (type.endsWith('[]')) {
    // Handle arrays
    // @ts-ignore
    return Array.isArray(value) ? value.map(v => String(v)) : [];
  } else {
    // Default to string conversion for unknown types
    return String(value);
  }
}
