/**
 * CLI Configuration Types
 */

export interface CLIConfig {
  /** API endpoint URL (for self-hosted instances) */
  api_url?: string

  /** Default organization ID */
  organization?: string

  /** Default space ID */
  default_space?: string

  /** Default character ID (used when `teamday` is run with no args) */
  default_character?: string

  /** Output format preference */
  format?: 'table' | 'json' | 'yaml'

  /** Disable colored output */
  no_color?: boolean

  /** Request timeout in milliseconds */
  timeout?: number

  /** Enable verbose logging */
  verbose?: boolean
}

export const defaultConfig: CLIConfig = {
  api_url: 'https://cc.teamday.ai',
  format: 'table',
  no_color: false,
  timeout: 300000, // 5 minutes
  verbose: false,
}
