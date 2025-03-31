import { defineConfig } from 'vite';
import path from 'path';
import StringReplace from 'vite-plugin-string-replace';
import dts from 'vite-plugin-dts';

export default defineConfig(() => {
  const format = process.env.BUILD_FORMAT || 'es';
  const outputDir = format === 'umd' ? 'dist/umd' : 'dist/es';

  const externalDependencies = [
    '@hashgraph/proto',
    '@hashgraph/sdk',
    'fetch-retry',
  ];

  const plugins = [
    StringReplace([
      {
        search: 'VITE_BUILD_FORMAT',
        replace: format,
      },
    ]),
    dts({
      insertTypesEntry: true,
      include: ['src/**/*.ts'],
      exclude: ['**/*.d.ts'],
      outputDir: outputDir,
    }),
  ];

  return {
    plugins,
    build: {
      outDir: outputDir,
      lib: {
        entry: path.resolve(__dirname, 'src/index.ts'),
        name: 'StandardsSDK',
        fileName: (format) => `standards-sdk.${format}.js`,
        formats: [format],
      },
      rollupOptions: {
        external: format === 'es' ? externalDependencies : [],
        output: {
          globals: (id) => id,
          preserveModules: format === 'es',
          preserveModulesRoot: 'src',
        },
      },
      minify: 'terser',
      sourcemap: true,
      target: 'es2020',
    },
    define: {
      VITE_BUILD_FORMAT: JSON.stringify(format),
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
