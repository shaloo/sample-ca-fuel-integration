// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Explicitly polyfill the 'buffer' module
      buffer: true,
    }),
  ],
  // Optimize dependencies that may cause issues
  optimizeDeps: {
    include: ['buffer', 'fuels', '@arcana/ca-sdk'],
  },
  // Ensure browser-compatible builds
  build: {
    rollupOptions: {
      external: [],
    },
  },
});
