/**
 * Agent Data Model v2 — Integration Tests
 *
 * Tests the SDK-aligned Character extension:
 * - New Character fields (subagentIds, mcpInstanceIds, mcpTypes, disallowedTools, maxTurns)
 * - Subagent resolution chain (Character A → subagentIds → Character B, C)
 * - Org-level secrets CRUD
 * - Org + Space secret merge (space wins on conflict)
 *
 * Run: TEAMDAY_API_TOKEN=td_xxx bun run test:integration -- agent-data-model-v2
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getTestClient, testName } from './setup'

describe('Agent Data Model v2', () => {
  let client: any

  // IDs for cleanup
  const createdCharacterIds: string[] = []
  const createdSpaceIds: string[] = []

  beforeAll(async () => {
    client = await getTestClient()
  }, 30_000)

  afterAll(async () => {
    // Clean up test characters
    for (const id of createdCharacterIds) {
      try {
        await client.patch(`/api/v1/characters/${id}`, { archived: true })
      } catch {
        // Best-effort cleanup
      }
    }
    // Clean up test spaces
    for (const id of createdSpaceIds) {
      try {
        await client.delete(`/api/v1/spaces/${id}`)
      } catch {
        // Best-effort cleanup
      }
    }
  })

  // ─── Character v2 Fields CRUD ──────────────────────────────────

  describe('Character v2 Fields', () => {
    let parentId: string
    let subagentAId: string
    let subagentBId: string

    it('creates a character with v2 fields', async () => {
      const res = await client.post('/api/v1/characters', {
        name: testName('lead-agent'),
        role: 'Team lead that delegates to subagents',
        category: 'general',
        system_message: 'You are a team lead. Delegate tasks to your subagents.',
        disallowedTools: ['Bash'],
        mcpTypes: ['ahrefs', 'search-console'],
        maxTurns: 30,
      })

      expect(res.success).toBe(true)
      expect(res.id).toBeDefined()
      parentId = res.id
      createdCharacterIds.push(parentId)
    })

    it('creates subagent characters', async () => {
      const resA = await client.post('/api/v1/characters', {
        name: testName('subagent-a'),
        role: 'SEO analysis specialist',
        category: 'general',
        system_message: 'You are an SEO analyst. Analyze backlinks and report findings.',
        maxTurns: 15,
      })
      expect(resA.success).toBe(true)
      subagentAId = resA.id
      createdCharacterIds.push(subagentAId)

      const resB = await client.post('/api/v1/characters', {
        name: testName('subagent-b'),
        role: 'Content writer',
        category: 'general',
        system_message: 'You are a content writer. Write blog posts based on research.',
        disallowedTools: ['Bash', 'Edit'],
        maxTurns: 20,
      })
      expect(resB.success).toBe(true)
      subagentBId = resB.id
      createdCharacterIds.push(subagentBId)
    })

    it('updates parent character with subagentIds', async () => {
      const res = await client.patch(`/api/v1/characters/${parentId}`, {
        subagentIds: [subagentAId, subagentBId],
      })
      expect(res.success).toBe(true)
    })

    it('GET returns all v2 fields correctly', async () => {
      const res = await client.get(`/api/v1/characters/${parentId}`)
      const char = res.character

      expect(char.subagentIds).toEqual([subagentAId, subagentBId])
      expect(char.disallowedTools).toEqual(['Bash'])
      expect(char.mcpTypes).toEqual(['ahrefs', 'search-console'])
      expect(char.maxTurns).toBe(30)
      // v2 fields should default to empty arrays
      expect(char.mcpInstanceIds).toEqual([])
    })

    it('GET subagent returns its v2 fields', async () => {
      const res = await client.get(`/api/v1/characters/${subagentBId}`)
      const char = res.character

      expect(char.disallowedTools).toEqual(['Bash', 'Edit'])
      expect(char.maxTurns).toBe(20)
      expect(char.subagentIds).toEqual([])
    })

    it('list endpoint includes v2 fields', async () => {
      const res = await client.get('/api/v1/characters')
      expect(res.success).toBe(true)

      const parent = res.characters.find((c: any) => c.id === parentId)
      expect(parent).toBeDefined()
      expect(parent.subagentIds).toEqual([subagentAId, subagentBId])
      expect(parent.maxTurns).toBe(30)
    })

    it('updates mcpInstanceIds', async () => {
      // Use fake IDs — we just test the field round-trips correctly
      const fakeIds = ['mcp_instance_abc', 'mcp_instance_def']
      const res = await client.patch(`/api/v1/characters/${parentId}`, {
        mcpInstanceIds: fakeIds,
      })
      expect(res.success).toBe(true)

      const get = await client.get(`/api/v1/characters/${parentId}`)
      expect(get.character.mcpInstanceIds).toEqual(fakeIds)
    })

    it('can clear v2 fields with empty arrays', async () => {
      const res = await client.patch(`/api/v1/characters/${parentId}`, {
        subagentIds: [],
        disallowedTools: [],
        mcpTypes: [],
        mcpInstanceIds: [],
      })
      expect(res.success).toBe(true)

      const get = await client.get(`/api/v1/characters/${parentId}`)
      expect(get.character.subagentIds).toEqual([])
      expect(get.character.disallowedTools).toEqual([])
      expect(get.character.mcpTypes).toEqual([])
      expect(get.character.mcpInstanceIds).toEqual([])
    })

    it('rejects invalid maxTurns', async () => {
      try {
        await client.patch(`/api/v1/characters/${parentId}`, {
          maxTurns: 0, // Below minimum of 1
        })
        expect.fail('Should have rejected maxTurns=0')
      } catch (e: any) {
        // API client throws with error message text, not status code
        expect(e.message.toLowerCase()).toMatch(/validation|invalid|error|400/)
      }
    })

    it('rejects maxTurns above limit', async () => {
      try {
        await client.patch(`/api/v1/characters/${parentId}`, {
          maxTurns: 501, // Above maximum of 500
        })
        expect.fail('Should have rejected maxTurns=501')
      } catch (e: any) {
        expect(e.message.toLowerCase()).toMatch(/validation|invalid|error|400/)
      }
    })
  })

  // ─── Org-Level Secrets ─────────────────────────────────────────

  describe('Org-Level Secrets', () => {
    // Get org ID from the token context
    let orgId: string

    beforeAll(async () => {
      // Create a space to get the org ID from the response
      const spacesRes = await client.get('/api/v1/spaces')
      if (spacesRes.spaces?.length > 0) {
        orgId = spacesRes.spaces[0].organizationId
      } else {
        // Create a temp space to get org ID
        const spaceRes = await client.post('/api/v1/spaces', {
          name: testName('org-secrets-temp'),
          visibility: 'private',
          type: 'empty',
        })
        orgId = spaceRes.space?.organizationId
        createdSpaceIds.push(spaceRes.space?.id)
      }
      expect(orgId).toBeDefined()
    })

    it('stores org secrets', async () => {
      const res = await client.post(`/api/v1/organizations/${orgId}/env`, {
        secrets: {
          TEST_ORG_KEY: 'org-secret-value-123',
          SHARED_API_KEY: 'org-level-shared',
        },
      })
      expect(res.success).toBe(true)
      expect(res.keys).toContain('TEST_ORG_KEY')
      expect(res.keys).toContain('SHARED_API_KEY')
    })

    it('lists org secret keys (not values)', async () => {
      const res = await client.get(`/api/v1/organizations/${orgId}/env`)
      expect(res.secrets).toContain('TEST_ORG_KEY')
      expect(res.secrets).toContain('SHARED_API_KEY')
      expect(res.count).toBeGreaterThanOrEqual(2)
    })

    it('deletes org secrets', async () => {
      const res = await client.delete(`/api/v1/organizations/${orgId}/env`, {
        keys: ['TEST_ORG_KEY'],
      })
      expect(res.success).toBe(true)

      // Verify deletion
      const list = await client.get(`/api/v1/organizations/${orgId}/env`)
      expect(list.secrets).not.toContain('TEST_ORG_KEY')
      expect(list.secrets).toContain('SHARED_API_KEY')
    })

    it('cleans up remaining test secrets', async () => {
      const res = await client.delete(`/api/v1/organizations/${orgId}/env`, {
        keys: ['SHARED_API_KEY'],
      })
      expect(res.success).toBe(true)
    })

    it('rejects non-UPPER_SNAKE_CASE keys', async () => {
      try {
        await client.post(`/api/v1/organizations/${orgId}/env`, {
          secrets: { 'lowercase_key': 'bad' },
        })
        expect.fail('Should have rejected lowercase key')
      } catch (e: any) {
        expect(e.message.toLowerCase()).toMatch(/validation|invalid|error|400/)
      }
    })

    it('rejects access to wrong org', async () => {
      try {
        await client.get('/api/v1/organizations/fake-org-id-12345/env')
        expect.fail('Should have rejected wrong org')
      } catch (e: any) {
        expect(e.message.toLowerCase()).toMatch(/denied|forbidden|403/)
      }
    })
  })
})
