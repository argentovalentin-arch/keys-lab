import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths: the same build works at a domain root (lab.keysperformance.com)
  // and under a sub-path (<compte>.github.io/keys-lab/).
  base: './',
  server: { port: 5180, strictPort: true },
  build: { target: 'es2022' },
});
