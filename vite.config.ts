import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative URLs, so the build works from any path or from a file server.
  base: './',
  server: { port: 5180 },
  preview: { port: 5181 },
  build: { outDir: 'dist', target: 'es2022', sourcemap: true },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
