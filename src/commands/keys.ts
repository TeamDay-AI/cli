/**
 * Keys Commands
 * Manage Claude API keys and OAuth subscription tokens
 */

import { Command } from 'commander'
import chalk from 'chalk'
import type { APIClient } from '../lib/api-client'
import type { AuthManager } from '../lib/auth-manager'
import type { ConfigManager } from '../lib/config-manager'
import type { KeysStatusResponse } from '../types/api'

/** Map CLI-friendly type names to API credential types */
const TYPE_MAP: Record<string, string> = {
  'oauth': 'claudeCodeOAuthToken',
  'api-key': 'anthropicApiKey',
  'org-oauth': 'organizationOAuthToken',
  'org-api-key': 'organizationApiKey',
}

const VALID_TYPES = Object.keys(TYPE_MAP)
const ORG_TYPES = ['org-oauth', 'org-api-key']

function resolveType(type: string): string {
  const apiType = TYPE_MAP[type]
  if (!apiType) {
    throw new Error(
      `Invalid credential type: ${type}\nValid types: ${VALID_TYPES.join(', ')}`
    )
  }
  return apiType
}

async function resolveOrgId(
  authManager: AuthManager,
  config: ConfigManager,
  explicitOrg?: string
): Promise<string | undefined> {
  if (explicitOrg) return explicitOrg

  // Try config default
  const cfg = await config.load()
  if (cfg.organization) return cfg.organization

  // Try auth state
  const status = await authManager.getStatus()
  return status.organizationId
}

export function createKeysCommands(
  apiClient: APIClient,
  authManager: AuthManager,
  config: ConfigManager
): Command {
  const keys = new Command('keys').description(
    'Manage Claude API keys and OAuth subscription tokens'
  )

  // teamday keys status
  keys
    .command('status')
    .description('Show credential status and active auth tier')
    .option('--org <id>', 'Organization ID (defaults to current org)')
    .action(async (options) => {
      try {
        const orgId = await resolveOrgId(authManager, config, options.org)
        const query = orgId ? `?organizationId=${orgId}` : ''
        const data = await apiClient.get<KeysStatusResponse>(
          `/api/v1/keys/status${query}`
        )

        console.log(chalk.bold('\n  Claude Credential Status\n'))

        // User-level credentials
        console.log(chalk.bold('  User-level:'))
        console.log(
          `    OAuth Token:  ${data.credentials.hasOAuthToken
            ? chalk.green('configured')
            : chalk.gray('not set')}`
        )
        console.log(
          `    API Key:      ${data.credentials.hasApiKey
            ? chalk.green('configured')
            : chalk.gray('not set')}`
        )

        // Org-level credentials
        console.log(chalk.bold('\n  Organization-level:'))
        if (!orgId) {
          console.log(chalk.gray('    (no organization selected)'))
        } else {
          console.log(chalk.gray(`    Org: ${orgId}`))
          console.log(
            `    OAuth Token:  ${data.credentials.hasOrgOAuthToken
              ? chalk.green('configured')
              : chalk.gray('not set')}`
          )
          console.log(
            `    API Key:      ${data.credentials.hasOrgApiKey
              ? chalk.green('configured')
              : chalk.gray('not set')}`
          )
        }

        // Active tier
        console.log(chalk.bold('\n  Active Tier:'))
        if (data.activeTier === 'none') {
          console.log(chalk.yellow(`    none ${data.reason ? `(${data.reason})` : ''}`))
        } else {
          console.log(chalk.green(`    ${data.activeTier}`))
        }

        // Tier priority info
        console.log(chalk.gray('\n  Priority: user-oauth > user-api > org-oauth > org-api > server'))
        console.log()
      } catch (error: any) {
        console.error(chalk.red(`\n  Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday keys set <type> <value>
  keys
    .command('set <type> <value>')
    .description(
      'Set a Claude credential (types: oauth, api-key, org-oauth, org-api-key)'
    )
    .option('--org <id>', 'Organization ID (required for org-* types)')
    .action(async (type, value, options) => {
      try {
        const apiType = resolveType(type)
        const isOrgType = ORG_TYPES.includes(type)

        const body: Record<string, string> = { type: apiType, value }

        if (isOrgType) {
          const orgId = await resolveOrgId(authManager, config, options.org)
          if (!orgId) {
            console.error(chalk.red(
              '\n  Organization ID required for org-level credentials.\n' +
              '  Use --org <id> or set default: teamday config set organization <id>\n'
            ))
            process.exit(1)
          }
          body.organizationId = orgId
        }

        await apiClient.post('/api/v1/keys/set', body)

        console.log(chalk.green(`\n  Credential ${type} saved and encrypted successfully\n`))
      } catch (error: any) {
        console.error(chalk.red(`\n  Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday keys remove <type>
  keys
    .command('remove <type>')
    .description(
      'Remove a Claude credential (types: oauth, api-key, org-oauth, org-api-key)'
    )
    .option('--org <id>', 'Organization ID (required for org-* types)')
    .action(async (type, options) => {
      try {
        const apiType = resolveType(type)
        const isOrgType = ORG_TYPES.includes(type)

        const body: Record<string, string> = { type: apiType }

        if (isOrgType) {
          const orgId = await resolveOrgId(authManager, config, options.org)
          if (!orgId) {
            console.error(chalk.red(
              '\n  Organization ID required for org-level credentials.\n' +
              '  Use --org <id> or set default: teamday config set organization <id>\n'
            ))
            process.exit(1)
          }
          body.organizationId = orgId
        }

        await apiClient.post('/api/v1/keys/remove', body)

        console.log(chalk.green(`\n  Credential ${type} removed successfully\n`))
      } catch (error: any) {
        console.error(chalk.red(`\n  Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  return keys
}
