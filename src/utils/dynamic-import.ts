import { createRequire } from 'module';
import { isBrowser } from './is-browser';

let cachedRequire: NodeRequire | null | undefined;

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
      (lowered.includes('cannot find module') ||
        lowered.includes('module not found') ||
        lowered.includes('cannot find package'))
    ) {
      return lowered.includes(specifier.toLowerCase());
    }
  }

  return false;
}

export async function optionalImport<T>(
  specifier: string,
): Promise<T | null> {
  try {
    const imported = (await import(/* webpackIgnore: true */ specifier)) as T;
    return imported;
  } catch (error) {
    if (isModuleNotFound(specifier, error)) {
      return null;
    }
    if (isBrowser) {
      throw error as Error;
    }
  }

  if (!isBrowser) {
    if (cachedRequire === undefined) {
      try {
        cachedRequire = createRequire(import.meta.url);
      } catch {
        cachedRequire = null;
      }
    }
    if (cachedRequire) {
      try {
        return cachedRequire(specifier) as T;
      } catch (error) {
        if (!isModuleNotFound(specifier, error)) {
          throw error as Error;
        }
      }
    }
  }

  return null;
}
