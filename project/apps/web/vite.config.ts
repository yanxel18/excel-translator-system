import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { normalizeWebBasePath } from './src/config/paths';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    base: normalizeWebBasePath(env.VITE_BASE_PATH),
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
