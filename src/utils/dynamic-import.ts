import { isBrowser } from './is-browser';

let nodeRequire: NodeRequire | null | undefined;

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

  if (isBrowser) {
    nodeRequire = null;
    return nodeRequire;
  }

  try {
    const globalObject =
      typeof global !== 'undefined'
        ? (global as typeof globalThis)
        : globalThis;
    const req =
      globalObject.process?.mainModule?.require ??
      (globalObject as { require?: NodeRequire }).require;

    nodeRequire =
      typeof req === 'function' &&
      typeof (req as NodeRequire).resolve === 'function'
        ? (req as NodeRequire)
        : null;
  } catch {
    nodeRequire = null;
  }

  return nodeRequire;
}

async function dynamicImport<T>(specifier: string): Promise<T | null> {
  try {
    return (await import(specifier)) as T;
  } catch (error) {
    if (isModuleNotFound(specifier, error)) {
      return null;
    }
    throw error as Error;
  }
}

export async function optionalImport<T>(specifier: string): Promise<T | null> {
  if (isBrowser) {
    return dynamicImport<T>(specifier);
  }

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

  return dynamicImport<T>(specifier);
}
