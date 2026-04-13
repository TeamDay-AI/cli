/**
 * Space Commands
 * Space and workspace management
 */

import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import type { APIClient } from '../lib/api-client'
import type { ConfigManager } from '../lib/config-manager'
import { getFormatter } from '../lib/formatters'
import { ChatSession } from '../lib/interactive'
import type { SecretsListResponse } from '../types/api'

/**
 * Register an add/remove resource pair for a space.
 * Avoids duplicating the same pattern 6 times (mcp, skill, agent).
 */
function registerResourceCommands(
  spaces: Command,
  apiClient: APIClient,
  resource: string,
  patchAddKey: string,
  patchRemoveKey: string
) {
  spaces
    .command(`add-${resource} <id> <resourceIds...>`)
    .description(`Add ${resource}(s) to a space`)
    .action(async (id: string, resourceIds: string[]) => {
      const spinner = ora(`Adding ${resource}(s)...`).start()

      try {
        await apiClient.patch(`/api/v1/spaces/${id}`, {
          [patchAddKey]: resourceIds,
        })
        spinner.succeed(chalk.green(`Added ${resourceIds.length} ${resource}(s)`))
        console.log(chalk.green(`\n  ${resourceIds.join(', ')} added to space ${id}\n`))
      } catch (error: any) {
        spinner.fail(chalk.red(`Failed to add ${resource}(s)`))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  spaces
    .command(`remove-${resource} <id> <resourceIds...>`)
    .description(`Remove ${resource}(s) from a space`)
    .action(async (id: string, resourceIds: string[]) => {
      const spinner = ora(`Removing ${resource}(s)...`).start()

      try {
        await apiClient.patch(`/api/v1/spaces/${id}`, {
          [patchRemoveKey]: resourceIds,
        })
        spinner.succeed(chalk.green(`Removed ${resourceIds.length} ${resource}(s)`))
        console.log(chalk.green(`\n  ${resourceIds.join(', ')} removed from space ${id}\n`))
      } catch (error: any) {
        spinner.fail(chalk.red(`Failed to remove ${resource}(s)`))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })
}

export function createSpaceCommands(
  apiClient: APIClient,
  config: ConfigManager
): Command {
  const spaces = new Command('spaces').description('Manage spaces and workspaces')

  // teamday spaces list
  spaces
    .command('list')
    .description('List all spaces')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (options) => {
      const spinner = ora('Fetching spaces...').start()

      try {
        const response = await apiClient.get('/api/v1/spaces')
        spinner.stop()

        const spaceList = Array.isArray(response) ? response : response.spaces || []

        const format = options.format || (await config.get('format'))
        const formatter = getFormatter(format)

        if (spaceList.length === 0) {
          console.log(chalk.yellow('\nNo spaces found\n'))
          return
        }

        console.log('\n' + formatter.format(spaceList) + '\n')
        console.log(chalk.gray(`Total: ${spaceList.length} space(s)\n`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch spaces'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday spaces get <id>
  spaces
    .command('get <id>')
    .description('Get space details (includes resources, secrets)')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (id: string, options) => {
      const spinner = ora('Fetching space...').start()

      try {
        const response = await apiClient.get(`/api/v1/spaces/${id}`)
        const space = response.space || response
        spinner.stop()

        const format = options.format || (await config.get('format'))

        if (format === 'json' || format === 'yaml') {
          const formatter = getFormatter(format)
          console.log('\n' + formatter.format(space) + '\n')
          return
        }

        // Rich table display for default format
        console.log(chalk.bold(`\n  Space: ${space.name}`))
        console.log(chalk.gray(`  ID: ${space.id}`))
        if (space.description) console.log(chalk.gray(`  Description: ${space.description}`))
        console.log(chalk.gray(`  Visibility: ${space.visibility}`))
        console.log(chalk.gray(`  Archived: ${space.archived ? 'Yes' : 'No'}`))

        // Resources summary
        const skills = space.skillRefs || []
        const mcpRefs = space.mcpRefs || []
        const agents = space.agentRefs || []
        const secrets = space.secretKeys || []

        console.log(chalk.bold('\n  Resources:'))
        console.log(chalk.gray(`  Skills: ${skills.length > 0 ? skills.map((r: any) => r.skillId).join(', ') : 'none'}`))
        console.log(chalk.gray(`  MCPs: ${mcpRefs.length > 0 ? mcpRefs.map((r: any) => r.mcpId).join(', ') : 'none'}`))
        console.log(chalk.gray(`  Agents: ${agents.length > 0 ? agents.map((r: any) => r.agentId || r.characterId).join(', ') : 'none'}`))
        console.log(chalk.gray(`  Secrets: ${secrets.length > 0 ? secrets.join(', ') : 'none'}`))

        if (space.instructions) {
          console.log(chalk.bold('\n  Instructions:'))
          console.log(chalk.gray(`  ${space.instructions.slice(0, 200)}${space.instructions.length > 200 ? '...' : ''}`))
        }

        console.log()
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch space'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday spaces create
  spaces
    .command('create')
    .description('Create a new space')
    .requiredOption('--name <name>', 'Space name')
    .option('--description <desc>', 'Space description')
    .option('--visibility <vis>', 'Visibility (private|organization|public)', 'private')
    .option('--type <type>', 'Type (empty|git|starterKit)', 'empty')
    .option('--git-url <url>', 'Git repository URL (for type=git)')
    .option('--git-branch <branch>', 'Git branch (for type=git)', 'main')
    .option('--kit <kit>', 'Starter kit name (for type=starterKit)')
    .action(async (options) => {
      const spinner = ora('Creating space...').start()

      try {
        // Get current organization from auth status
        const authManager = (apiClient as any).authManager
        if (authManager) {
          const status = await authManager.getStatus()

          const body: any = {
            name: options.name,
            visibility: options.visibility,
            organizationId: status.organizationId,
          }

          if (options.description) body.description = options.description

          const response = await apiClient.post('/api/v1/spaces', body)
          const space = response.space || response

          spinner.succeed(chalk.green('Space created successfully'))

          console.log(chalk.green(`\n  Space created:`))
          console.log(chalk.cyan(`   ID: ${space.id}`))
          console.log(chalk.gray(`   Name: ${space.name}\n`))

          // Initialize space if not empty
          if (options.type !== 'empty') {
            const initSpinner = ora('Initializing space...').start()

            try {
              const initBody: any = {
                type: options.type,
                orgId: status.organizationId,
                spaceName: space.name,
              }

              if (options.type === 'git') {
                initBody.url = options.gitUrl
                initBody.branch = options.gitBranch
              } else if (options.type === 'starterKit') {
                initBody.kit = options.kit
              }

              await apiClient.post(`/api/spaces/${space.id}/init`, initBody)
              initSpinner.succeed(chalk.green('Space initialized'))
            } catch (error: any) {
              initSpinner.fail(chalk.yellow('Space created but initialization failed'))
              console.warn(chalk.yellow(`   ${error.message}`))
            }
          }
        } else {
          throw new Error('Authentication required')
        }
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to create space'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday spaces delete <id>
  spaces
    .command('delete <id>')
    .description('Delete a space')
    .action(async (id: string) => {
      const spinner = ora('Deleting space...').start()

      try {
        await apiClient.delete(`/api/v1/spaces/${id}`)
        spinner.succeed(chalk.green('Space deleted'))

        console.log(chalk.green('\n  Space archived\n'))
        console.log(chalk.gray('   Note: Space is archived, not permanently deleted\n'))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to delete space'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // --- Resource management (add/remove mcp, skill, agent) ---
  registerResourceCommands(spaces, apiClient, 'mcp', 'addMcps', 'removeMcps')
  registerResourceCommands(spaces, apiClient, 'skill', 'addSkills', 'removeSkills')
  registerResourceCommands(spaces, apiClient, 'agent', 'addCharacters', 'removeCharacters')

  // --- Secrets management ---

  // teamday spaces secrets <id>
  spaces
    .command('secrets <id>')
    .description('List secret keys in a space')
    .action(async (id: string) => {
      const spinner = ora('Fetching secrets...').start()

      try {
        const response = await apiClient.get<SecretsListResponse>(
          `/api/v1/spaces/${id}/secrets`
        )
        spinner.stop()

        if (response.count === 0) {
          console.log(chalk.yellow('\nNo secrets configured\n'))
          return
        }

        console.log(chalk.bold(`\n  Secrets for space ${id}:`))
        for (const key of response.secrets) {
          console.log(chalk.gray(`   - ${key}`))
        }
        console.log(chalk.gray(`\n  Total: ${response.count} secret(s)\n`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch secrets'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday spaces set-secret <id> <KEY=value...>
  spaces
    .command('set-secret <id> <pairs...>')
    .description('Set secrets (KEY=VALUE pairs)')
    .action(async (id: string, pairs: string[]) => {
      // Parse KEY=VALUE pairs
      const secrets: Record<string, string> = {}
      for (const pair of pairs) {
        const eqIndex = pair.indexOf('=')
        if (eqIndex === -1) {
          console.error(chalk.red(`\n Invalid format: "${pair}" — expected KEY=VALUE\n`))
          process.exit(1)
        }
        secrets[pair.slice(0, eqIndex)] = pair.slice(eqIndex + 1)
      }

      const spinner = ora('Setting secrets...').start()

      try {
        await apiClient.post(`/api/v1/spaces/${id}/secrets`, { secrets })
        spinner.succeed(chalk.green(`Set ${Object.keys(secrets).length} secret(s)`))
        console.log(chalk.green(`\n  Keys set: ${Object.keys(secrets).join(', ')}\n`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to set secrets'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday spaces remove-secret <id> <KEY...>
  spaces
    .command('remove-secret <id> <keys...>')
    .description('Remove secrets by key name')
    .action(async (id: string, keys: string[]) => {
      const spinner = ora('Removing secrets...').start()

      try {
        await apiClient.delete(`/api/v1/spaces/${id}/secrets`, { keys })
        spinner.succeed(chalk.green(`Removed ${keys.length} secret(s)`))
        console.log(chalk.green(`\n  Keys removed: ${keys.join(', ')}\n`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to remove secrets'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // --- Chat in space context ---

  // teamday spaces chat <id> [--agent <agentId>] [--message <msg>]
  spaces
    .command('chat <id>')
    .description('Start interactive chat in space context')
    .option('--agent <agentId>', 'Agent to chat with (auto-detected from space if omitted)')
    .option('--character <agentId>', 'Agent to chat with (deprecated, use --agent)')
    .option('--message <msg>', 'Send a single message and exit (non-interactive)')
    .action(async (id: string, options) => {
      try {
        let agentId = options.agent || options.character

        // Auto-detect agent from space if not provided
        if (!agentId) {
          const spinner = ora('Detecting agent...').start()
          try {
            const spaceResponse = await apiClient.get(`/api/v1/spaces/${id}`)
            const space = spaceResponse.space || spaceResponse

            // Pick first enabled agent from space's agentRefs
            const agentRefs = space.agentRefs || []
            const enabledRef = agentRefs.find((r: any) => r.enabled !== false)

            if (enabledRef) {
              agentId = enabledRef.agentId || enabledRef.characterId
            }

            // Fallback: fetch org agents and pick the first one
            if (!agentId) {
              const agentsResponse = await apiClient.get('/api/v1/agents')
              const agents = agentsResponse.agents || []
              if (agents.length > 0) {
                agentId = agents[0].id
              }
            }

            if (!agentId) {
              spinner.fail(chalk.red('No agent found'))
              console.error(chalk.red('\n  No agents available. Use --agent <id> or add an agent to the space.\n'))
              process.exit(1)
            }

            spinner.succeed(chalk.gray(`Using agent: ${agentId}`))
          } catch (error: any) {
            spinner.fail(chalk.red('Failed to detect agent'))
            console.error(chalk.red(`\n  Error: ${error.message}\n`))
            process.exit(1)
          }
        }

        const session = new ChatSession(apiClient, agentId, id)

        if (options.message) {
          // Non-interactive: send single message and exit
          await session.sendSingleMessage(options.message)
        } else {
          await session.start()
        }
      } catch (error: any) {
        if (error.statusCode === 401) {
          process.exit(1)
        }
      }
    })

  // --- File browsing ---

  // teamday spaces ls <id> [path]
  spaces
    .command('ls <id> [path]')
    .description('List files in space')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (id: string, path: string = '/', options: any) => {
      const spinner = ora('Listing files...').start()

      try {
        const params = new URLSearchParams()
        params.append('path', path)

        const authManager = (apiClient as any).authManager
        if (authManager) {
          const status = await authManager.getStatus()
          params.append('organizationId', status.organizationId)
        }

        const files = await apiClient.get(
          `/api/spaces/${id}/files/browse?${params.toString()}`
        )
        spinner.stop()

        const format = options.format || (await config.get('format'))
        const formatter = getFormatter(format)

        console.log('\n' + formatter.format(files) + '\n')
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to list files'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday spaces git <id> <...args>
  spaces
    .command('git <id> <args...>')
    .description('Run git command in space')
    .allowUnknownOption()
    .action(async (id: string, args: string[]) => {
      const spinner = ora(`Running git ${args.join(' ')}...`).start()

      try {
        const gitCommand = args[0]
        const gitArgs = args.slice(1)

        const authManager = (apiClient as any).authManager
        if (authManager) {
          const status = await authManager.getStatus()

          // Map git commands to API endpoints
          let endpoint = `/api/spaces/${id}/git/${gitCommand}`
          let method = 'GET'
          let body: any = { orgId: status.organizationId }

          // Special handling for different git commands
          if (gitCommand === 'status') {
            endpoint = `/api/spaces/${id}/git/status?orgId=${status.organizationId}`
            method = 'GET'
          } else if (gitCommand === 'clone' || gitCommand === 'pull' || gitCommand === 'push') {
            method = 'POST'
            if (gitArgs.length > 0) {
              body.args = gitArgs
            }
          }

          let result
          if (method === 'GET') {
            result = await apiClient.get(endpoint)
          } else {
            result = await apiClient.post(endpoint, body)
          }

          spinner.stop()

          console.log('\n' + (typeof result === 'string' ? result : JSON.stringify(result, null, 2)) + '\n')
        } else {
          throw new Error('Authentication required')
        }
      } catch (error: any) {
        spinner.fail(chalk.red('Git command failed'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // --- Share (publish/unpublish as static site) ---

  // teamday spaces share <id> <slug>
  spaces
    .command('share <id> <slug>')
    .description('Publish space as a static site at <slug>.apps.teamday.ai')
    .option('--user <username>', 'Protect with basic auth (requires --pass)')
    .option('--pass <password>', 'Password for basic auth (requires --user)')
    .action(async (id: string, slug: string, options: { user?: string; pass?: string }) => {
      // Validate auth options
      if ((options.user && !options.pass) || (!options.user && options.pass)) {
        console.error(chalk.red('\n  Both --user and --pass are required for basic auth\n'))
        process.exit(1)
      }

      const spinner = ora('Publishing...').start()

      try {
        const body: Record<string, string> = { slug }
        if (options.user && options.pass) {
          body.username = options.user
          body.password = options.pass
        }

        const result = await apiClient.post<{ siteUrl: string; slug: string }>(
          `/api/spaces/${id}/publish`,
          body
        )

        spinner.succeed(chalk.green('Space published'))
        console.log(chalk.cyan(`\n  URL: ${result.siteUrl}`))
        if (options.user) {
          console.log(chalk.yellow(`  Auth: ${options.user} / ${'*'.repeat(options.pass!.length)}`))
        }
        console.log()

        // Quick health check
        const checkSpinner = ora('Checking site...').start()
        try {
          const response = await fetch(result.siteUrl, {
            method: 'HEAD',
            redirect: 'follow',
            headers: options.user
              ? { 'Authorization': 'Basic ' + Buffer.from(`${options.user}:${options.pass}`).toString('base64') }
              : {},
          })
          if (response.ok) {
            checkSpinner.succeed(chalk.green(`Site is live (${response.status})`))
          } else if (response.status === 401) {
            checkSpinner.succeed(chalk.yellow(`Site is live (401 — basic auth active)`))
          } else if (response.status === 404) {
            checkSpinner.warn(chalk.yellow(`Site responds but no index.html found (${response.status})`))
          } else {
            checkSpinner.warn(chalk.yellow(`Site returned ${response.status}`))
          }
        } catch {
          checkSpinner.warn(chalk.yellow('Could not reach site (DNS may need time to propagate)'))
        }
        console.log()
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to publish'))
        console.error(chalk.red(`\n  Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday spaces unshare <id>
  spaces
    .command('unshare <id>')
    .description('Unpublish a shared space')
    .action(async (id: string) => {
      const spinner = ora('Unpublishing...').start()

      try {
        await apiClient.post(`/api/spaces/${id}/unpublish`)
        spinner.succeed(chalk.green('Space unpublished'))
        console.log()
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to unpublish'))
        console.error(chalk.red(`\n  Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // --- Cover image upload ---

  // teamday spaces upload-cover <id> <filePath>
  spaces
    .command('upload-cover <id> <filePath>')
    .description('Upload a cover image for a space')
    .action(async (id: string, filePath: string) => {
      const absPath = resolve(filePath)

      // Validate file exists
      let stat
      try {
        stat = statSync(absPath)
      } catch {
        console.error(chalk.red(`\n  File not found: ${absPath}\n`))
        process.exit(1)
      }

      if (stat.size > 10 * 1024 * 1024) {
        console.error(chalk.red('\n  File size exceeds 10MB limit\n'))
        process.exit(1)
      }

      // Detect content type from extension
      const ext = absPath.split('.').pop()?.toLowerCase()
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
      }
      const contentType = mimeMap[ext || '']
      if (!contentType) {
        console.error(chalk.red(`\n  Unsupported file type: .${ext} (allowed: jpg, png, gif, webp)\n`))
        process.exit(1)
      }

      const spinner = ora('Uploading cover image...').start()

      try {
        const fileBuffer = readFileSync(absPath)
        const blob = new Blob([fileBuffer], { type: contentType })
        const formData = new FormData()
        formData.append('file', blob, absPath.split('/').pop()!)

        const result = await apiClient.upload<{ url: string }>(
          `/api/spaces/${id}/cover-image`,
          formData
        )

        spinner.succeed(chalk.green('Cover image uploaded'))
        console.log(chalk.cyan(`\n  URL: ${result.url}\n`))

        // Apply it to the space
        const applySpinner = ora('Applying to space...').start()
        await apiClient.patch(`/api/v1/spaces/${id}`, {
          coverImage: result.url,
          coverImageAttribution: { source: 'upload' },
        })
        applySpinner.succeed(chalk.green('Cover image applied to space'))
        console.log()
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to upload cover image'))
        console.error(chalk.red(`\n  Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  return spaces
}
