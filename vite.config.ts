import { defineConfig } from 'vite';

// The SPA is plain TypeScript, no framework: the prototype's code already works and a
// port to React would buy nothing before Thursday.
export default defineConfig({
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173 },
});
