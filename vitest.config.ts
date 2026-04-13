import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Integration tests hit real APIs — need longer timeouts
    testTimeout: 30_000,
    hookTimeout: 15_000,

    // Integration tests share mutable API state — must run sequentially.
    // Parallel execution causes race conditions (e.g., cleanup deleting
    // resources that another test file just created).
    fileParallelism: false,

    // Ensure each test file runs its tests in order
    sequence: {
      concurrent: false,
    },
  },
})
