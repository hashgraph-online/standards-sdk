import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig(async () => {
  const format = process.env.BUILD_FORMAT || 'es';
  const isBrowserBundle = format === 'browser';
  const viteFormat = isBrowserBundle ? 'es' : format;
  let outputDir;

  if (format === 'umd') {
    outputDir = 'dist/umd';
  } else if (format === 'cjs') {
    outputDir = 'dist/cjs';
  } else if (isBrowserBundle) {
    outputDir = 'dist/browser';
  } else {
    outputDir = 'dist/es';
  }

  const externalDependencies = [
    '@hashgraphonline/conversational-agent',
    '@hashgraph/proto',
    '@hashgraph/sdk',
    'fetch-retry',
  ];

  const plugins = [
    dts({
      insertTypesEntry: true,
      include: ['src/**/*.ts'],
      exclude: ['**/*.d.ts', '**/__tests__/**', '**/__mocks__/**'],
      outputDir: outputDir,
    }),
  ];

  if (format === 'umd') {
    const { nodePolyfills } = await import('vite-plugin-node-polyfills');
    plugins.push(
      nodePolyfills({
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
        protocolImports: true,
        modules: {
          buffer: true,
        },
      }),
    );
  }

  return {
    plugins,
    build: {
      outDir: outputDir,
      lib: {
        entry: resolve(
          __dirname,
          isBrowserBundle ? 'src/browser.ts' : 'src/index.ts',
        ),
        name: format === 'umd' ? 'StandardsSDK' : undefined,
        fileName: fmt => {
          if (isBrowserBundle) {
            return 'standards-sdk.browser.js';
          }
          return `standards-sdk.${fmt === 'cjs' ? 'cjs' : fmt + '.js'}`;
        },
        formats: [viteFormat],
      },
      rollupOptions: {
        external: id => {
          // Always externalize Node.js built-in modules
          if (
            id === 'fs' ||
            id === 'path' ||
            id === 'crypto' ||
            id === 'stream' ||
            id === 'buffer'
          ) {
            return true;
          }
          if (id.startsWith('@kiloscribe/inscription-sdk')) {
            return false;
          }
          if (format === 'umd') {
            return false;
          }
          if (isBrowserBundle) {
            return externalDependencies.some(
              dep => id === dep || id.startsWith(dep + '/'),
            );
          }
          return (
            externalDependencies.some(
              dep => id === dep || id.startsWith(dep + '/'),
            ) ||
            (!id.startsWith('.') &&
              !id.startsWith('/') &&
              !id.includes(__dirname))
          );
        },
        output:
          format === 'cjs'
            ? {
                exports: 'named',
                format: 'cjs',
                inlineDynamicImports: true,
                manualChunks: undefined,
              }
            : {
                globals: id => id,
                preserveModules: format === 'es',
                preserveModulesRoot: format === 'es' ? 'src' : undefined,
                exports: 'named',
                inlineDynamicImports: format === 'umd' || isBrowserBundle,
                manualChunks: isBrowserBundle ? undefined : void 0,
                name: format === 'umd' ? 'StandardsSDK' : undefined,
              },
      },
      minify: 'terser',
      sourcemap: true,
      target: 'es2020',
    },
    define: {
      VITE_BUILD_FORMAT: JSON.stringify(format),
      ...(format === 'cjs' ? { Buffer: 'globalThis.Buffer' } : {}),
    },
    resolve: {
      alias: {
        util: 'util',
      },
    },
    ssr: {
      noExternal: [
        '@hashgraphonline/hashinal-wc',
        '@kiloscribe/inscription-sdk',
      ],
      external: externalDependencies,
    },
  };
});
