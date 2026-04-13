/**
 * Space Lifecycle Tests
 *
 * Tests the full space lifecycle as a user would experience it:
 * create → list → get details → delete
 */

import { describe, it, expect, afterAll } from 'vitest'
import { getTestClient, testName } from './setup'

// Track created resources for cleanup
const createdSpaceIds: string[] = []

afterAll(async () => {
  const client = await getTestClient()
  for (const id of createdSpaceIds) {
    try {
      await client.delete(`/api/v1/spaces/${id}`)
    } catch {
      // Best-effort cleanup
    }
  }
})

describe('Spaces', () => {
  it('creates a new space', async () => {
    const client = await getTestClient()
    const name = testName('space')

    const res = await client.post('/api/v1/spaces', {
      name,
      visibility: 'private',
      type: 'empty',
    })

    expect(res.success).toBe(true)
    expect(res.space).toBeDefined()
    expect(res.space.id).toBeDefined()
    expect(typeof res.space.id).toBe('string')
    expect(res.space.name).toBe(name)
    createdSpaceIds.push(res.space.id)
  })

  it('lists spaces and finds the created one', async () => {
    const client = await getTestClient()
    expect(createdSpaceIds.length).toBeGreaterThan(0)

    const res = await client.get('/api/v1/spaces')

    expect(res.success).toBe(true)
    expect(Array.isArray(res.spaces)).toBe(true)

    const found = res.spaces.find((s: any) => s.id === createdSpaceIds[0])
    expect(found).toBeDefined()
  })

  it('gets space details by ID', async () => {
    const client = await getTestClient()
    const spaceId = createdSpaceIds[0]

    const res = await client.get(`/api/v1/spaces/${spaceId}`)

    expect(res.success).toBe(true)
    expect(res.space).toBeDefined()
    expect(res.space.id).toBe(spaceId)
  })

  it('deletes the space', async () => {
    const client = await getTestClient()
    const spaceId = createdSpaceIds[0]

    const res = await client.delete(`/api/v1/spaces/${spaceId}`)

    expect(res.success).toBe(true)

    // Remove from cleanup list since we deleted it
    const idx = createdSpaceIds.indexOf(spaceId)
    if (idx >= 0) createdSpaceIds.splice(idx, 1)
  })
})
