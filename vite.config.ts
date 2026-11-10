import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(pkg.version),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  build: {
    target: 'es2019',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: 'src/embed.ts',
      formats: ['iife'],
      name: 'EmbedSandboxBundle',
      fileName: () => 'embed.js',
    },
  },
  test: {
    environment: 'jsdom',
    // Process CSS so the ?inline import returns the real stylesheet in tests.
    css: true,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
});
