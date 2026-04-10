import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

type PackageExportTarget =
  | string
  | {
      types?: string;
      import?: string;
      browser?: string | PackageExportTarget;
      require?: string;
      default?: string;
    };

type PackageJsonShape = {
  browser?: string;
  exports?: Record<string, PackageExportTarget>;
  scripts?: Record<string, string>;
};

function readPackageJson(): PackageJsonShape {
  const packagePath = path.resolve(process.cwd(), 'package.json');
  const raw = readFileSync(packagePath, 'utf8');
  return JSON.parse(raw) as PackageJsonShape;
}

describe('published package contract', () => {
  it('keeps browser entrypoints exported for consumers', () => {
    const packageJson = readPackageJson();
    const rootExport = packageJson.exports?.['.'];
    const browserExport = packageJson.exports?.['./browser'];

    expect(packageJson.browser).toBe(
      './dist/browser-root/standards-sdk.root-browser.js',
    );
    expect(rootExport).toEqual(
      expect.objectContaining({
        browser: expect.objectContaining({
          types: './dist/browser-root/browser-root.d.ts',
          default: './dist/browser-root/standards-sdk.root-browser.js',
        }),
      }),
    );
    expect(browserExport).toEqual(
      expect.objectContaining({
        types: './dist/browser/browser.d.ts',
        import: './dist/browser/standards-sdk.browser.js',
        browser: './dist/browser/standards-sdk.browser.js',
        default: './dist/browser/standards-sdk.browser.js',
      }),
    );
  });

  it('builds the browser bundles that back those exports', () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts).toEqual(
      expect.objectContaining({
        'build:browser-root': 'BUILD_FORMAT=browser-root vite build',
        'build:browser': 'BUILD_FORMAT=browser vite build',
      }),
    );
    expect(packageJson.scripts?.build).toContain('pnpm run build:browser-root');
    expect(packageJson.scripts?.build).toContain('pnpm run build:browser');
    expect(packageJson.scripts?.prepublishOnly).toContain(
      'pnpm run build:browser-root',
    );
    expect(packageJson.scripts?.prepublishOnly).toContain(
      'pnpm run build:browser',
    );
  });

  it('retains the browser-root source entry used by the root browser export', () => {
    const browserRootPath = path.resolve(process.cwd(), 'src/browser-root.ts');

    expect(existsSync(browserRootPath)).toBe(true);
  });
});
