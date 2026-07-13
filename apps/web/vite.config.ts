import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'apps/web/src');
const PKG = (p: string) => path.join(ROOT, 'packages', p);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: SRC },
      { find: '@de/web-ui', replacement: PKG('ui/src/index.tsx') },
      { find: '@de/web-api', replacement: PKG('api/src/index.ts') },
      { find: '@de/web-types', replacement: PKG('types/src/index.ts') },
      { find: '@de/web-hooks', replacement: PKG('hooks/src/index.ts') },
      { find: '@de/web-utils', replacement: PKG('utils/src/index.ts') },
    ],
  },
  server: { host: true, port: 5173, strictPort: false },
  preview: { host: true, port: 4173 },
  build: { target: 'es2022', sourcemap: true },
});