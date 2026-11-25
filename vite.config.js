import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the production build in dist/ also works when opened from any folder.
  base: './',
  server: {
    port: 5173,
    strictPort: false,
    open: false,
  },
  preview: {
    port: 4173,
  },
  // three and katex ship native ES modules; serving them unbundled avoids dev-server
  // re-optimisation reloads when a new three/addons import appears.
  optimizeDeps: {
    exclude: ['three', 'katex'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    // three.js and KaTeX are bundled into the site; their MIT notices ship with it in this file
    // (not under the default .vite/, which GitHub Pages' upload step would skip as a dot-folder)
    license: { fileName: 'THIRD-PARTY-LICENSES.md' },
  },
});
