/**
 * Directories Commands
 *
 * In TeamDay v3, spaces and agents ARE directories under /sandbox/{orgId}/.
 * This command group browses that filesystem. Declared entities are directories
 * containing .teamday/config.yaml.
 */

import { readFileSync, statSync, existsSync } from 'node:fs'
import { basename, resolve, extname } from 'node:path'
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import type { APIClient } from '../lib/api-client'
import type { AuthManager } from '../lib/auth-manager'
import type { ConfigManager } from '../lib/config-manager'
import { getFormatter } from '../lib/formatters'
import { listDirectories, resolveOrgId, type DirectoryEntry } from '../lib/directories'

const COVER_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

const KIND_ICON: Record<DirectoryEntry['kind'], string> = {
  agent: '🤖',
  space: '📦',
  folder: '📁',
}

function printTable(dirs: DirectoryEntry[]) {
  if (dirs.length === 0) {
    console.log(chalk.yellow('\n  No directories found\n'))
    return
  }

  const nameWidth = Math.max(4, ...dirs.map((d) => d.name.length))
  const kindWidth = 6

  console.log()
  console.log(
    chalk.bold(
      `  ${'NAME'.padEnd(nameWidth)}  ${'KIND'.padEnd(kindWidth)}  ROLE / DESCRIPTION`
    )
  )
  console.log(chalk.gray(`  ${'-'.repeat(nameWidth)}  ${'-'.repeat(kindWidth)}  ${'-'.repeat(40)}`))

  for (const d of dirs) {
    const icon = KIND_ICON[d.kind]
    const subtitle = d.config?.role || d.config?.description || (d.declared ? '' : chalk.gray('(plain folder)'))
    const nameColor = d.kind === 'agent' ? chalk.cyan : d.kind === 'space' ? chalk.magenta : chalk.white
    console.log(
      `  ${nameColor(d.name.padEnd(nameWidth))}  ${icon} ${d.kind.padEnd(kindWidth - 2)}  ${subtitle}`
    )
  }
  console.log()
  console.log(chalk.gray(`  Total: ${dirs.length} directory(s)\n`))
}

export function createDirsCommands(
  apiClient: APIClient,
  authManager: AuthManager,
  config: ConfigManager
): Command {
  const dirs = new Command('dirs').description('Browse directories (v3: spaces and agents live here)')

  // teamday dirs list [--path <sub>]
  dirs
    .command('list')
    .description('List top-level directories in the org sandbox')
    .option('--path <path>', 'Subdirectory to list (default: org root)', '/')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (options) => {
      const spinner = ora('Listing directories...').start()
      try {
        const orgId = await resolveOrgId(apiClient, authManager)
        const entries = await listDirectories(apiClient, orgId, options.path)
        spinner.stop()

        const format = options.format || (await config.get('format'))
        if (format === 'json' || format === 'yaml') {
          console.log('\n' + getFormatter(format).format(entries) + '\n')
          return
        }
        printTable(entries)
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to list directories'))
        console.error(chalk.red(`\n  Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday dirs get <path> — show one directory's config + children
  dirs
    .command('get <path>')
    .description('Show a directory\'s .teamday/config.yaml and its children')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (path: string, options) => {
      const spinner = ora('Reading directory...').start()
      try {
        const orgId = await resolveOrgId(apiClient, authManager)
        const normalized = path.startsWith('/') ? path : `/${path}`
        const children = await listDirectories(apiClient, orgId, normalized)
        // The parent's own config comes from listing its container and matching name,
        // but simpler: read it directly as a one-element listDirectories at its parent
        const lastSlash = normalized.lastIndexOf('/')
        const parent = lastSlash <= 0 ? '/' : normalized.slice(0, lastSlash)
        const leaf = normalized.slice(lastSlash + 1)
        const siblings = await listDirectories(apiClient, orgId, parent)
        const self = siblings.find((d) => d.name === leaf) || null
        spinner.stop()

        const format = options.format || (await config.get('format'))
        if (format === 'json' || format === 'yaml') {
          console.log('\n' + getFormatter(format).format({ self, children }) + '\n')
          return
        }

        if (self) {
          console.log(chalk.bold(`\n  ${KIND_ICON[self.kind]}  ${self.name}  ${chalk.gray(self.path)}`))
          if (self.config) {
            if (self.config.type) console.log(chalk.gray(`  Type: ${self.config.type}`))
            if (self.config.role) console.log(chalk.gray(`  Role: ${self.config.role}`))
            if (self.config.description) console.log(chalk.gray(`  Description: ${self.config.description}`))
            if (self.config.model) console.log(chalk.gray(`  Model: ${self.config.model}`))
          } else {
            console.log(chalk.gray('  (plain folder — no .teamday/config.yaml)'))
          }
        } else {
          console.log(chalk.yellow(`\n  Directory not found at parent listing — showing children only.`))
        }
        console.log(chalk.bold('\n  Children:'))
        printTable(children)
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to read directory'))
        console.error(chalk.red(`\n  Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday dirs set-cover <path> <file>
  dirs
    .command('set-cover <dirPath> <file>')
    .description('Upload a cover image for a directory — writes to {dirPath}/.teamday/cover.<ext>')
    .action(async (dirPath: string, file: string) => {
      const abs = resolve(file)
      if (!existsSync(abs) || !statSync(abs).isFile()) {
        console.error(chalk.red(`\n  Not a file: ${abs}\n`))
        process.exit(1)
      }
      const ext = extname(abs).toLowerCase()
      const mime = COVER_MIME[ext]
      if (!mime) {
        console.error(
          chalk.red(`\n  Unsupported extension: ${ext} (allowed: ${Object.keys(COVER_MIME).join(', ')})\n`)
        )
        process.exit(1)
      }
      if (statSync(abs).size > 10 * 1024 * 1024) {
        console.error(chalk.red('\n  File exceeds 10MB limit\n'))
        process.exit(1)
      }

      const spinner = ora('Uploading cover...').start()
      try {
        const orgId = await resolveOrgId(apiClient, authManager)
        const form = new FormData()
        const blob = new Blob([readFileSync(abs)], { type: mime })
        form.append('file', blob, basename(abs))
        const qs = new URLSearchParams({ orgId, path: dirPath })

        const res = await apiClient.upload<{ coverPath: string; serveUrl: string }>(
          `/api/directories/cover-image?${qs.toString()}`,
          form
        )
        spinner.succeed(chalk.green('Cover uploaded'))
        console.log(chalk.cyan(`\n  Wrote: ${res.coverPath}`))
        console.log(chalk.gray(`  Serve: ${res.serveUrl}\n`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to upload cover'))
        console.error(chalk.red(`\n  Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday dirs unset-cover <path>
  dirs
    .command('unset-cover <dirPath>')
    .description('Remove cover image from a directory (any extension)')
    .action(async (dirPath: string) => {
      await runUnsetAsset(apiClient, authManager, dirPath, 'cover-image', 'cover')
    })

  // teamday dirs set-avatar <dirPath> <file>
  dirs
    .command('set-avatar <dirPath> <file>')
    .description('Upload an avatar image for a directory — writes to {dirPath}/.teamday/avatar.<ext>')
    .action(async (dirPath: string, file: string) => {
      await runSetAsset(apiClient, authManager, dirPath, file, 'avatar', 5 * 1024 * 1024)
    })

  // teamday dirs unset-avatar <path>
  dirs
    .command('unset-avatar <dirPath>')
    .description('Remove avatar image from a directory (any extension)')
    .action(async (dirPath: string) => {
      await runUnsetAsset(apiClient, authManager, dirPath, 'avatar', 'avatar')
    })

  // ─── teamday dirs config <sub> ─────────────────────────────
  const cfg = new Command('config').description('Read/write a directory\'s .teamday/config.yaml')

  cfg
    .command('get <dirPath>')
    .description('Print the parsed config.yaml for a directory')
    .option('--format <format>', 'Output format (json|yaml)', 'yaml')
    .action(async (dirPath: string, options) => {
      const spinner = ora('Reading config...').start()
      try {
        const orgId = await resolveOrgId(apiClient, authManager)
        const qs = new URLSearchParams({ orgId, path: dirPath })
        const res = await apiClient.get<{ config: Record<string, unknown> | null; configPath: string; declared: boolean }>(
          `/api/directories/config?${qs.toString()}`
        )
        spinner.stop()
        if (!res.declared || !res.config) {
          console.log(chalk.yellow(`\n  No .teamday/config.yaml at ${dirPath}\n`))
          return
        }
        console.log('\n' + getFormatter(options.format).format(res.config) + '\n')
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to read config'))
        console.error(chalk.red(`\n  Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  cfg
    .command('set <dirPath> <pairs...>')
    .description('Merge key=value pairs into config.yaml (use `--replace` to overwrite; `key=null` removes)')
    .option('--replace', 'Replace the entire file instead of merging')
    .action(async (dirPath: string, pairs: string[], options) => {
      const patch: Record<string, unknown> = {}
      for (const pair of pairs) {
        const eq = pair.indexOf('=')
        if (eq === -1) {
          console.error(chalk.red(`\n  Invalid pair "${pair}" — expected key=value\n`))
          process.exit(1)
        }
        const key = pair.slice(0, eq)
        const rawValue = pair.slice(eq + 1)
        patch[key] = coerceScalar(rawValue)
      }

      const spinner = ora('Updating config...').start()
      try {
        const orgId = await resolveOrgId(apiClient, authManager)
        const res = await apiClient.patch<{ configPath: string; config: Record<string, unknown> }>(
          '/api/directories/config',
          { orgId, path: dirPath, patch, replace: !!options.replace }
        )
        spinner.succeed(chalk.green(`Wrote ${res.configPath}`))
        console.log()
        console.log(getFormatter('yaml').format(res.config))
        console.log()
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to update config'))
        console.error(chalk.red(`\n  Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  dirs.addCommand(cfg)

  return dirs
}

/** Value coercion for CLI `key=value` pairs. YAML-ish: bare words stay strings, numbers/bools parse, `null` clears. */
function coerceScalar(raw: string): unknown {
  if (raw === 'null') return null
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (/^-?\d+$/.test(raw)) return Number(raw)
  if (/^-?\d+\.\d+$/.test(raw)) return Number(raw)
  return raw
}

async function runSetAsset(
  apiClient: APIClient,
  authManager: AuthManager,
  dirPath: string,
  file: string,
  asset: 'cover-image' | 'avatar',
  maxBytes: number
) {
  const abs = resolve(file)
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    console.error(chalk.red(`\n  Not a file: ${abs}\n`))
    process.exit(1)
  }
  const ext = extname(abs).toLowerCase()
  const mime = COVER_MIME[ext]
  if (!mime) {
    console.error(chalk.red(`\n  Unsupported extension: ${ext} (allowed: ${Object.keys(COVER_MIME).join(', ')})\n`))
    process.exit(1)
  }
  if (statSync(abs).size > maxBytes) {
    console.error(chalk.red(`\n  File exceeds ${Math.round(maxBytes / 1024 / 1024)}MB limit\n`))
    process.exit(1)
  }

  const spinner = ora(`Uploading ${asset === 'avatar' ? 'avatar' : 'cover'}...`).start()
  try {
    const orgId = await resolveOrgId(apiClient, authManager)
    const form = new FormData()
    const blob = new Blob([readFileSync(abs)], { type: mime })
    form.append('file', blob, basename(abs))
    const qs = new URLSearchParams({ orgId, path: dirPath })
    const res = await apiClient.upload<{ serveUrl: string; coverPath?: string; avatarPath?: string }>(
      `/api/directories/${asset}?${qs.toString()}`,
      form
    )
    const wrote = res.coverPath || res.avatarPath
    spinner.succeed(chalk.green(`${asset === 'avatar' ? 'Avatar' : 'Cover'} uploaded`))
    console.log(chalk.cyan(`\n  Wrote: ${wrote}`))
    console.log(chalk.gray(`  Serve: ${res.serveUrl}\n`))
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to upload ${asset}`))
    console.error(chalk.red(`\n  Error: ${error.message}\n`))
    process.exit(1)
  }
}

async function runUnsetAsset(
  apiClient: APIClient,
  authManager: AuthManager,
  dirPath: string,
  asset: 'cover-image' | 'avatar',
  label: string
) {
  const spinner = ora(`Removing ${label}...`).start()
  try {
    const orgId = await resolveOrgId(apiClient, authManager)
    const qs = new URLSearchParams({ orgId, path: dirPath })
    const res = await apiClient.delete<{ removed: string[]; count: number }>(
      `/api/directories/${asset}?${qs.toString()}`
    )
    if (res.count === 0) {
      spinner.succeed(chalk.gray(`No ${label} present`))
    } else {
      spinner.succeed(chalk.green(`Removed ${res.count} file(s)`))
      for (const p of res.removed) console.log(chalk.gray(`  - ${p}`))
      console.log()
    }
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to remove ${label}`))
    console.error(chalk.red(`\n  Error: ${error.message}\n`))
    process.exit(1)
  }
}
