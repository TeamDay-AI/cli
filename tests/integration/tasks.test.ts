/**
 * Task Lifecycle Tests
 *
 * Tests task CRUD and status transitions.
 *
 * KNOWN GAPS (as of 2026-02-19):
 * - GET  /api/v1/tasks/:id  → NOT IMPLEMENTED (404)
 * - PATCH /api/v1/tasks/:id → NOT IMPLEMENTED (404)
 * - DELETE /api/v1/tasks/:id → NOT IMPLEMENTED (404)
 * Only list and create work. The CLI exposes commands for all operations.
 */

import { describe, it, expect } from 'vitest'
import { getTestClient, testName } from './setup'

describe('Tasks', () => {
  it('creates a task', async () => {
    const client = await getTestClient()

    const res = await client.post('/api/v1/tasks', {
      title: testName('task'),
      description: 'Integration test task — safe to delete',
      priority: 'low',
    })

    expect(res.id).toBeDefined()
    expect(res.title).toContain('__test_task_')
    expect(res.status).toBe('pending')
  })

  it('lists tasks and finds the created one', async () => {
    const client = await getTestClient()

    const res = await client.get('/api/v1/tasks')

    const tasks = Array.isArray(res) ? res : res.tasks
    expect(Array.isArray(tasks)).toBe(true)
    // Should have at least the one we just created
    const testTasks = tasks.filter((t: any) => t.title?.includes('__test_'))
    expect(testTasks.length).toBeGreaterThan(0)
  })

  // These tests document missing API routes — they SHOULD pass once implemented
  it.todo('gets task details by ID — route not implemented')
  it.todo('updates task status — route not implemented')
  it.todo('deletes a task — route not implemented')
})
