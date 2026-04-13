import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  splitting: false,
  clean: true,
  dts: false,
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: ['keytar'],
})
