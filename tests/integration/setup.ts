/**
 * Integration Test Setup
 *
 * Provides an authenticated API client and cleanup utilities.
 * All test resources use a `__test_` prefix for identification.
 *
 * Requires environment variables:
 *   TEAMDAY_API_TOKEN  - PAT token (td_...)
 *   TEAMDAY_API_URL    - Target API (default: http://localhost:3000)
 */

import { APIClient } from '../../src/lib/api-client'
import { AuthManager } from '../../src/lib/auth-manager'
import { ConfigManager } from '../../src/lib/config-manager'

let _client: APIClient | null = null

const TEST_PREFIX = '__test_'

/**
 * Get or create an authenticated API client for tests.
 * Reuses the same client across all tests in a run.
 */
export async function getTestClient(): Promise<APIClient> {
  if (_client) return _client

  const token = process.env.TEAMDAY_API_TOKEN
  if (!token) {
    throw new Error(
      'TEAMDAY_API_TOKEN is required for integration tests.\n' +
      'Set it via: TEAMDAY_API_TOKEN=td_xxx bun run test:integration'
    )
  }

  const config = new ConfigManager()
  const authManager = new AuthManager(config)
  const client = new APIClient(config, authManager)
  authManager.setApiClient(client)

  await client.init()
  _client = client
  return client
}

/**
 * Get the target API URL for direct fetch calls.
 */
export function getApiUrl(): string {
  return process.env.TEAMDAY_API_URL || 'http://localhost:3000'
}

/**
 * Generate a unique name for test resources to avoid collisions.
 */
export function testName(prefix: string): string {
  const ts = Date.now().toString(36)
  return `${TEST_PREFIX}${prefix}_${ts}`
}

/**
 * Clean up all test resources left over from previous runs.
 * Call this at the start of the test suite to ensure a clean state.
 * Only deletes resources with the __test_ prefix.
 */
export async function cleanupTestResources(): Promise<{ spaces: number; agents: number }> {
  const client = await getTestClient()
  let spacesDeleted = 0
  let agentsDeleted = 0

  // Clean up test spaces
  try {
    const spacesRes = await client.get('/api/v1/spaces')
    const spaces = spacesRes.spaces || []
    for (const space of spaces) {
      if (space.name?.startsWith(TEST_PREFIX)) {
        try {
          await client.delete(`/api/v1/spaces/${space.id}`)
          spacesDeleted++
        } catch {
          // Best-effort
        }
      }
    }
  } catch {
    // Spaces endpoint may fail, continue
  }

  // Clean up test agents
  try {
    const agentsRes = await client.get('/api/v1/agents')
    const agents = agentsRes.agents || []
    for (const agent of agents) {
      if (agent.name?.startsWith(TEST_PREFIX)) {
        try {
          await client.delete(`/api/v1/agents/${agent.id}`)
          agentsDeleted++
        } catch {
          // Best-effort
        }
      }
    }
  } catch {
    // Agents endpoint may fail, continue
  }

  return { spaces: spacesDeleted, agents: agentsDeleted }
}
