import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  base: './',
  plugins: [react(), nodePolyfills()],
  define: {
    'process.env': {},
    global: 'globalThis',
  },
});
