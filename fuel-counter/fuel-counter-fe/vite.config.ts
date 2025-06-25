//import { defineConfig } from 'vite'
import { defineConfig, Plugin } from "vite";
import react from '@vitejs/plugin-react'

import { nodePolyfills, PolyfillOptions } from "vite-plugin-node-polyfills";

const nodePolyfillsFix = (options?: PolyfillOptions | undefined): Plugin => {
  return {
    ...nodePolyfills(options),
    resolveId(source: string) {
      const m =
        /^vite-plugin-node-polyfills\/shims\/(buffer|global|process)$/.exec(
          source,
        );
      if (m) {
        return `node_modules/vite-plugin-node-polyfills/shims/${m[1]}/dist/index.cjs`;
      }
    },
  };
};
// https://vite.dev/config/
export default defineConfig({
  define: {
    "process.env": process.env,
  },
  plugins: [
    react(),
    nodePolyfillsFix({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      include: ["buffer"],
    }),
  ],
})
