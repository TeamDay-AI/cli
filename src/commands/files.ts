/**
 * Files Commands
 * Read/write/upload/list/delete files inside spaces via the TeamDay API.
 * All endpoints honor the CLI's PAT automatically (Authorization: Bearer …).
 */

import { readFileSync, statSync, existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import type { APIClient } from '../lib/api-client'
import type { ConfigManager } from '../lib/config-manager'

export function createFileCommands(apiClient: APIClient, _config: ConfigManager): Command {
  const files = new Command('files')
    .description('Read, write, upload, list and delete files inside a space')

  // ── teamday files ls <spaceId> [path] ────────────────────────────────────
  files
    .command('ls <spaceId> [path]')
    .description('Browse files in a space directory')
    .option('-r, --recursive', 'List recursively')
    .option('-a, --all', 'Show hidden files')
    .action(async (spaceId: string, path: string | undefined, opts) => {
      const spinner = ora('Listing files...').start()
      try {
        const qs = new URLSearchParams({ spaceId })
        if (path) qs.set('path', path)
        if (opts.recursive) qs.set('recursive', 'true')
        if (opts.all) qs.set('showHidden', 'true')
        const res = await apiClient.get<any>(`/api/files/browse?${qs.toString()}`)
        spinner.stop()
        // Computer service returns { success, type: 'directory', contents: [{name, type, size, modified}] }
        const entries = res?.contents || res?.entries || (Array.isArray(res) ? res : [])
        if (!entries.length) {
          console.log(chalk.gray('  (empty)'))
          return
        }
        for (const entry of entries) {
          const name = entry.name || entry.path || String(entry)
          const isDir = entry.type === 'directory'
          console.log(isDir ? chalk.blue(`📁 ${name}/`) : `   ${name}`)
        }
      } catch (err: any) {
        spinner.fail(chalk.red(`Failed to list: ${err.message}`))
        process.exit(1)
      }
    })

  // ── teamday files cat <spaceId> <path> ───────────────────────────────────
  files
    .command('cat <spaceId> <path>')
    .description('Print the contents of a file')
    .action(async (spaceId: string, path: string) => {
      try {
        const qs = new URLSearchParams({ spaceId, path })
        const res = await apiClient.get<any>(`/api/files/read?${qs.toString()}`)
        const content = res?.content ?? ''
        process.stdout.write(content)
        if (!content.endsWith('\n')) process.stdout.write('\n')
      } catch (err: any) {
        console.error(chalk.red(`❌ ${err.message}`))
        process.exit(1)
      }
    })

  // ── teamday files upload <spaceId> <file> [--path <dest>] ────────────────
  files
    .command('upload <spaceId> <file>')
    .description('Upload a local file into a space')
    .option('-p, --path <dest>', 'Destination path inside the space (defaults to filename)')
    .action(async (spaceId: string, file: string, opts) => {
      const abs = resolve(file)
      if (!existsSync(abs) || !statSync(abs).isFile()) {
        console.error(chalk.red(`❌ Not a file: ${abs}`))
        process.exit(1)
      }
      const destDir = opts.path || ''
      const spinner = ora(`Uploading ${basename(abs)}...`).start()
      try {
        const buf = readFileSync(abs)
        const blob = new Blob([buf])
        const form = new FormData()
        form.append('file', blob, basename(abs))
        const qs = new URLSearchParams({ spaceId, ...(destDir ? { path: destDir } : {}) })
        const res = await apiClient.upload<any>(`/api/files/upload?${qs.toString()}`, form)
        spinner.succeed(chalk.green(`Uploaded ${res?.results?.[0]?.filePath || basename(abs)}`))
      } catch (err: any) {
        spinner.fail(chalk.red(`Upload failed: ${err.message}`))
        process.exit(1)
      }
    })

  // ── teamday files write <spaceId> <path> --content <s> | --from <file> ───
  files
    .command('write <spaceId> <path>')
    .description('Write text content to a file in a space (creates or replaces)')
    .option('-c, --content <string>', 'Literal content to write')
    .option('-f, --from <localFile>', 'Read content from a local file')
    .action(async (spaceId: string, path: string, opts) => {
      let content: string
      if (opts.from) {
        content = readFileSync(resolve(opts.from), 'utf-8')
      } else if (typeof opts.content === 'string') {
        content = opts.content
      } else {
        console.error(chalk.red('❌ Provide --content <s> or --from <file>'))
        process.exit(1)
      }
      const spinner = ora(`Writing ${path}...`).start()
      try {
        await apiClient.post('/api/files/write', { spaceId, path, content })
        spinner.succeed(chalk.green(`Wrote ${path}`))
      } catch (err: any) {
        spinner.fail(chalk.red(`Write failed: ${err.message}`))
        process.exit(1)
      }
    })

  // ── teamday files rm <spaceId> <path> ────────────────────────────────────
  files
    .command('rm <spaceId> <path>')
    .description('Delete a file in a space')
    .action(async (spaceId: string, path: string) => {
      const spinner = ora(`Deleting ${path}...`).start()
      try {
        await apiClient.post('/api/files/delete', { spaceId, path })
        spinner.succeed(chalk.green(`Deleted ${path}`))
      } catch (err: any) {
        spinner.fail(chalk.red(`Delete failed: ${err.message}`))
        process.exit(1)
      }
    })

  return files
}
