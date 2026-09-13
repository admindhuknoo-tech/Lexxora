import path from 'path';
import { defineConfig } from 'vite';

/**
 * LexiCore frontend source of truth is index.html.
 * The project intentionally does not mount a parallel React application.
 */
export default defineConfig(() => ({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
}));
