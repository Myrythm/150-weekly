import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'app',
  plugins: [vue()],
  server: { host: '127.0.0.1', port: 8160, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: [fileURLToPath(new URL('./test/setup.js', import.meta.url))]
  }
});
