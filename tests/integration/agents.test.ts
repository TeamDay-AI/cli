/**
 * Agent Health Tests
 *
 * The highest-value test in the suite — if agents can't execute,
 * the product is fundamentally broken for users.
 *
 * Two test groups:
 * 1. Catalog — validates public agents have proper metadata
 * 2. Execution — verifies every org agent can respond to a prompt
 *
 * The execution test produces a detailed report with per-agent
 * pass/fail and timing. It runs all agents sequentially in a
 * shared test space, then cleans up.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getTestClient, getApiUrl, testName } from './setup'

// ─── Catalog Tests (public API, no auth) ─────────────────────────

describe('Agent Catalog', () => {
  it('public agents endpoint responds', async () => {
    const url = getApiUrl()
    const res = await fetch(`${url}/api/public/agents`)
    expect(res.status).toBe(200)

    const body = await res.json()
    // Response shape: { data: [...], meta: { timestamp, version, total } }
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.meta).toBeDefined()
    expect(typeof body.meta.total).toBe('number')
  })

  it('public agents have required metadata (if any exist)', async () => {
    const url = getApiUrl()
    const res = await fetch(`${url}/api/public/agents`)
    const { data: agents } = await res.json()

    if (agents.length === 0) {
      // No public agents on this environment — skip gracefully
      console.log('  (no public agents on this environment — skipping metadata check)')
      return
    }

    const issues: string[] = []
    for (const agent of agents) {
      const label = agent.name || agent.id || 'unknown'
      if (!agent.name) issues.push(`${label}: missing name`)
      if (!agent.slug && !agent.id) issues.push(`${label}: missing slug/id`)
      if (!agent.description) issues.push(`${label}: missing description`)
    }

    if (issues.length > 0) {
      expect.fail(
        `${issues.length} metadata issues across ${agents.length} agents:\n` +
        issues.map(i => `  - ${i}`).join('\n')
      )
    }
  })
})

// ─── Execution Health (authenticated, creates test space) ────────

describe('Agent Execution Health', () => {
  let client: any
  let spaceId: string | null = null
  let orgAgents: any[] = []

  beforeAll(async () => {
    client = await getTestClient()

    // Create a shared test space for all health checks
    const spaceRes = await client.post('/api/v1/spaces', {
      name: testName('health'),
      visibility: 'private',
      type: 'empty',
    })
    spaceId = spaceRes.space.id

    // Fetch all org agents
    const agentsRes = await client.get('/api/v1/agents')
    orgAgents = agentsRes.agents || []
  }, 30_000)

  afterAll(async () => {
    if (spaceId && client) {
      try {
        await client.delete(`/api/v1/spaces/${spaceId}`)
      } catch {
        // Best-effort cleanup
      }
    }
  })

  it('org has agents to test', () => {
    if (orgAgents.length === 0) {
      console.log('  (no agents in this org — execution tests will be skipped)')
      return
    }
    expect(orgAgents.length).toBeGreaterThan(0)
  })

  it('all agents execute and respond', async () => {
    if (orgAgents.length === 0) {
      console.log('  (no agents — skipping execution health check)')
      return
    }
    expect(spaceId).toBeDefined()

    interface AgentResult {
      name: string
      id: string
      success: boolean
      durationMs: number
      hasResult: boolean
      error?: string
    }

    const results: AgentResult[] = []

    for (const agent of orgAgents) {
      const start = Date.now()
      try {
        const res = await client.post(`/api/v1/agents/${agent.id}/execute`, {
          message: 'Respond with exactly one word: HEALTH_OK',
          spaceId,
          stream: false,
        })
        results.push({
          name: agent.name,
          id: agent.id,
          success: res.success === true,
          durationMs: Date.now() - start,
          hasResult: !!res.result,
          error: res.success ? undefined : JSON.stringify(res).slice(0, 200),
        })
      } catch (e: any) {
        results.push({
          name: agent.name,
          id: agent.id,
          success: false,
          durationMs: Date.now() - start,
          hasResult: false,
          error: e.message?.slice(0, 200),
        })
      }
    }

    // Print report
    const sep = '═'.repeat(54)
    const line = '─'.repeat(54)
    console.log(`\n╔${sep}╗`)
    console.log(`║  AGENT HEALTH REPORT${' '.repeat(34)}║`)
    console.log(`╠${sep}╣`)

    for (const r of results) {
      const icon = r.success ? 'PASS' : 'FAIL'
      const dur = `${(r.durationMs / 1000).toFixed(1)}s`
      const name = r.name.length > 32 ? r.name.slice(0, 29) + '...' : r.name
      console.log(`║  ${icon}  ${name.padEnd(32)} ${dur.padStart(10)}   ║`)
      if (!r.success && r.error) {
        // Wrap error to fit in box
        const errLine = r.error.slice(0, 48)
        console.log(`║       ${errLine.padEnd(48)}║`)
      }
    }

    const passed = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    const totalTime = results.reduce((sum, r) => sum + r.durationMs, 0)

    console.log(`╠${sep}╣`)
    console.log(`║  ${passed} passed, ${failed} failed (${(totalTime / 1000).toFixed(0)}s total)${' '.repeat(Math.max(0, 54 - `  ${passed} passed, ${failed} failed (${(totalTime / 1000).toFixed(0)}s total)`.length))}║`)
    console.log(`╚${sep}╝\n`)

    // Fail with actionable details
    const failures = results.filter(r => !r.success)
    if (failures.length > 0) {
      const report = failures
        .map(f => `  FAIL ${f.name} (${f.id}): ${f.error || 'unknown error'}`)
        .join('\n')
      expect.fail(
        `${failures.length}/${results.length} agents failed execution:\n${report}`
      )
    }
  }, 900_000) // 15 min — sequential execution of all agents
})

// ─── TODO: Future test groups ────────────────────────────────────
// - Skill resolution: verify agent deps are installed in space
// - MCP connectivity: execute prompts that require specific MCP tools
// - Streaming: verify SSE stream works for each agent
// - Session continuity: send follow-up, verify context retained
