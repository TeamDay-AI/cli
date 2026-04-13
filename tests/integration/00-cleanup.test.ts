/**
 * Pre-suite Cleanup
 *
 * Runs first (00- prefix ensures alphabetical ordering) to sweep
 * any orphaned test resources from previous runs. This prevents
 * test pollution and keeps the org clean.
 *
 * All test resources use the `__test_` prefix so they're safe to delete.
 */

import { describe, it, expect } from 'vitest'
import { cleanupTestResources } from './setup'

describe('Cleanup', () => {
  it('removes orphaned test resources', async () => {
    const { spaces, agents } = await cleanupTestResources()

    if (spaces > 0 || agents > 0) {
      console.log(`  Cleaned up: ${spaces} spaces, ${agents} agents`)
    }

    // This test always passes — cleanup is best-effort
    expect(true).toBe(true)
  })
})
