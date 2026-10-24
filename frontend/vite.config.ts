import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Design tokens live in ../design-system
  server: { fs: { allow: ['..'] } },
});
