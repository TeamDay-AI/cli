/**
 * Smoke Tests
 *
 * Absolute basics — if these fail, nothing else matters.
 * Tests: API reachable, auth works, basic endpoints respond.
 */

import { describe, it, expect } from 'vitest'
import { getTestClient, getApiUrl } from './setup'

describe('Smoke', () => {
  it('API health check responds', async () => {
    const url = getApiUrl()
    const res = await fetch(`${url}/api/health`)
    expect(res.status).toBe(200)
  })

  it('authenticated request succeeds', async () => {
    const client = await getTestClient()
    // List spaces — simplest authenticated endpoint
    const res = await client.get('/api/v1/spaces')
    expect(res).toBeDefined()
    expect(res.success).toBe(true)
  })

  it('unauthenticated request is rejected', async () => {
    const url = getApiUrl()
    const res = await fetch(`${url}/api/v1/spaces`)
    expect(res.status).toBe(401)
  })

  it('agents list endpoint works', async () => {
    const client = await getTestClient()
    const res = await client.get('/api/v1/agents')
    expect(res.success).toBe(true)
    expect(Array.isArray(res.agents)).toBe(true)
  })
})
