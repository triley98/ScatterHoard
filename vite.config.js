import { defineConfig } from 'vite';

export default defineConfig({
  // Relative URLs let the same build run on GitHub Pages or another static host.
  base: './',
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } } },
});
