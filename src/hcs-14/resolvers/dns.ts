import { optionalImport } from '../../utils/dynamic-import';

type DnsResolveTxt = (hostname: string) => Promise<string[][]>;

type DnsPromisesModule = {
  resolveTxt?: DnsResolveTxt;
};

export type DnsTxtLookup = (hostname: string) => Promise<string[]>;

let resolveTxtLoader: Promise<DnsResolveTxt | null> | null = null;

function isNoRecordError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = Reflect.get(error, 'code');
  if (typeof code !== 'string') {
    return false;
  }
  return (
    code === 'ENOTFOUND' ||
    code === 'ENODATA' ||
    code === 'ENOENT' ||
    code === 'ENONAME' ||
    code === 'NXDOMAIN'
  );
}

async function loadResolveTxt(): Promise<DnsResolveTxt | null> {
  if (!resolveTxtLoader) {
    resolveTxtLoader = (async () => {
      const nodeDnsModule = await optionalImport<DnsPromisesModule>(
        'node:dns/promises',
        { preferImport: true },
      );
      if (nodeDnsModule?.resolveTxt) {
        return nodeDnsModule.resolveTxt;
      }

      const dnsModule = await optionalImport<DnsPromisesModule>(
        'dns/promises',
        { preferImport: true },
      );
      return dnsModule?.resolveTxt ?? null;
    })();
  }

  return resolveTxtLoader;
}

export const nodeDnsTxtLookup: DnsTxtLookup = async hostname => {
  const resolveTxt = await loadResolveTxt();
  if (!resolveTxt) {
    return [];
  }

  try {
    const response = await resolveTxt(hostname);
    return response.map(chunks => chunks.join(''));
  } catch (error) {
    if (isNoRecordError(error)) {
      return [];
    }
    throw error as Error;
  }
};
