/**
 * Directory listing helpers for the v3 filesystem model.
 *
 * In v3 there are no "spaces" — a space/agent IS a directory under
 * /sandbox/{orgId}/. A directory is "declared" (promoted to an entity)
 * if it contains .teamday/config.yaml. Everything else is just a folder.
 */

import yaml from 'js-yaml'
import type { APIClient } from './api-client'
import type { AuthManager } from './auth-manager'
import { getCliOptions } from './cli-options'

export interface TeamdayConfig {
  type?: 'agent' | 'space' | string
  name?: string
  role?: string
  description?: string
  model?: string
  avatar?: string
  [k: string]: unknown
}

export interface DirectoryEntry {
  /** Directory name as it appears under the org root (e.g. "marketing") */
  name: string
  /** Full path relative to org root, e.g. "/marketing" */
  path: string
  /** Parsed .teamday/config.yaml if present, else null */
  config: TeamdayConfig | null
  /** Convenience: true when config.yaml declares this as an entity */
  declared: boolean
  /** Convenience: kind inferred from config.type — "agent" | "space" | "folder" */
  kind: 'agent' | 'space' | 'folder'
}

export async function resolveOrgId(apiClient: APIClient, authManager: AuthManager): Promise<string> {
  const override = getCliOptions().orgOverride
  if (override) return override
  const status = await authManager.getStatus()
  if (!status.organizationId) {
    throw new Error('No organization — authenticate with `teamday auth login` or pass --org <id>')
  }
  return status.organizationId
}

interface BrowseEntry {
  name: string
  type: 'file' | 'directory' | string
}

async function browse(
  apiClient: APIClient,
  orgId: string,
  path: string,
  showHidden = false
): Promise<BrowseEntry[]> {
  const qs = new URLSearchParams({
    spaceId: '_root',
    organizationId: orgId,
    path,
  })
  if (showHidden) qs.set('showHidden', 'true')
  const res = await apiClient.get<{ contents?: BrowseEntry[] }>(
    `/api/files/browse?${qs.toString()}`
  )
  return res?.contents ?? []
}

async function readConfigYaml(
  apiClient: APIClient,
  orgId: string,
  dirPath: string
): Promise<TeamdayConfig | null> {
  const qs = new URLSearchParams({
    spaceId: '_root',
    organizationId: orgId,
    path: `${dirPath}/.teamday/config.yaml`,
  })
  try {
    const res = await apiClient.get<{ content?: string }>(
      `/api/files/read?${qs.toString()}`
    )
    if (!res?.content) return null
    const parsed = yaml.load(res.content)
    return (parsed && typeof parsed === 'object') ? (parsed as TeamdayConfig) : null
  } catch {
    // 404 or parse error — not every dir has a config.yaml
    return null
  }
}

function classify(cfg: TeamdayConfig | null): DirectoryEntry['kind'] {
  if (!cfg) return 'folder'
  if (cfg.type === 'agent') return 'agent'
  if (cfg.type === 'space') return 'space'
  return 'folder'
}

/**
 * List directories directly under a given path (default: org root).
 * For each directory, fetches its .teamday/config.yaml in parallel.
 */
export async function listDirectories(
  apiClient: APIClient,
  orgId: string,
  subPath: string = '/'
): Promise<DirectoryEntry[]> {
  const entries = await browse(apiClient, orgId, subPath, false)
  const dirs = entries.filter((e) => e.type === 'directory' && !e.name.startsWith('.'))

  const base = subPath.endsWith('/') ? subPath.slice(0, -1) : subPath
  const configs = await Promise.all(
    dirs.map((d) => readConfigYaml(apiClient, orgId, `${base}/${d.name}`))
  )

  return dirs.map((d, i) => {
    const cfg = configs[i]
    return {
      name: d.name,
      path: `${base}/${d.name}`,
      config: cfg,
      declared: cfg !== null,
      kind: classify(cfg),
    }
  })
}
