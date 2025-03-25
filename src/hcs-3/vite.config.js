import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  plugins: [],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'HCSRecusionSDK',
      fileName: (format) => format === 'es' ? `hcs-recursion-sdk.esm.js` : `hcs-recursion-sdk.js`,
      formats: ['umd', 'es'],
    },
    rollupOptions: {
      external: [], // No externals, include everything
    },
    commonjsOptions: {
      include: [/node_modules/],
    },
    minify: 'terser',
    sourcemap: false,
    terserOptions: {
      format: {
        comments: false
      },
    },
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
});
