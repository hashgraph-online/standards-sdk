import { isBrowser } from './is-browser';

let nodeRequire: NodeRequire | null | undefined;

const isNodeRuntime = (): boolean =>
  typeof process !== 'undefined' && Boolean(process.versions?.node);

type NodeModuleNamespace = {
  createRequire: (path: string | URL) => NodeRequire;
};

function getNodeRequireSync(): NodeRequire | null {
  try {
    const moduleNamespace = (
      process as typeof process & {
        getBuiltinModule?: (name: string) => unknown;
      }
    ).getBuiltinModule?.('module') as Partial<NodeModuleNamespace> | undefined;
    if (typeof moduleNamespace?.createRequire === 'function') {
      const requireFromCwd = moduleNamespace.createRequire(
        `${process.cwd()}/package.json`,
      );
      if (typeof requireFromCwd.resolve === 'function') {
        return requireFromCwd;
      }
    }

    const globalObject =
      typeof global !== 'undefined'
        ? (global as typeof globalThis)
        : globalThis;
    const runtimeRequire =
      globalObject.process?.mainModule?.require ??
      (globalObject as { require?: NodeRequire }).require ??
      Function('return typeof require === "function" ? require : undefined;')();

    if (
      typeof runtimeRequire === 'function' &&
      typeof (runtimeRequire as NodeRequire).resolve === 'function'
    ) {
      return runtimeRequire as NodeRequire;
    }
  } catch {
    return null;
  }

  return null;
}

function isModuleNotFound(specifier: string, error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = Reflect.get(error, 'code');
  const message = Reflect.get(error, 'message');
  const messageText = typeof message === 'string' ? message : '';

  if (typeof code === 'string' && code.includes('MODULE_NOT_FOUND')) {
    return messageText.includes(specifier);
  }

  if (messageText) {
    const lowered = messageText.toLowerCase();
    if (
      lowered.includes('cannot find module') ||
      lowered.includes('module not found') ||
      lowered.includes('cannot find package')
    ) {
      return lowered.includes(specifier.toLowerCase());
    }
  }

  return false;
}

async function resolveNodeRequire(): Promise<NodeRequire | null> {
  if (nodeRequire !== undefined) {
    return nodeRequire;
  }

  if (isBrowser && !isNodeRuntime()) {
    nodeRequire = null;
    return nodeRequire;
  }

  try {
    nodeRequire = getNodeRequireSync();
  } catch {
    nodeRequire = null;
  }

  return nodeRequire;
}

async function dynamicImport<T>(specifier: string): Promise<T | null> {
  try {
    return (await import(/* webpackIgnore: true */ specifier)) as T;
  } catch (error) {
    if (isModuleNotFound(specifier, error)) {
      return null;
    }
    throw error as Error;
  }
}

type OptionalImportOptions = {
  preferImport?: boolean;
};

export async function optionalImport<T>(
  specifier: string,
  options: OptionalImportOptions = {},
): Promise<T | null> {
  if (isBrowser && !isNodeRuntime()) {
    return dynamicImport<T>(specifier);
  }

  if (!options.preferImport) {
    const requireFn = await resolveNodeRequire();
    if (requireFn) {
      try {
        return requireFn(specifier) as T;
      } catch (error) {
        if (!isModuleNotFound(specifier, error)) {
          throw error as Error;
        }
      }
    }
  }

  return dynamicImport<T>(specifier);
}

export function optionalImportSync<T>(specifier: string): T | null {
  if (isBrowser && !isNodeRuntime()) {
    return null;
  }

  try {
    const requireFn = getNodeRequireSync();
    if (requireFn) {
      return requireFn(specifier) as T;
    }
  } catch (error) {
    if (!isModuleNotFound(specifier, error)) {
      throw error as Error;
    }
  }

  return null;
}
