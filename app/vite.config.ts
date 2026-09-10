import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri's dev server: fixed port so tauri.conf.json's devUrl and LAKELET_DEV_ORIGIN agree.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: ['es2022', 'safari16'], sourcemap: false },
  test: { environment: 'jsdom', include: ['src/**/*.test.tsx'], setupFiles: ['src/test-setup.ts'] },
});
