/**
 * Configuration Manager
 * Handles CLI configuration file operations
 */

import { join } from 'path'
import { homedir } from 'os'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import type { CLIConfig } from '../types/config'
import { defaultConfig } from '../types/config'

const CONFIG_DIR = join(homedir(), '.teamday')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export class ConfigManager {
  private config: CLIConfig | null = null

  /**
   * Load configuration from file and environment variables
   */
  async load(): Promise<CLIConfig> {
    if (this.config) {
      return this.config
    }

    // Start with defaults
    this.config = { ...defaultConfig }

    // Load from file if exists
    if (existsSync(CONFIG_FILE)) {
      try {
        const json = await readFile(CONFIG_FILE, 'utf-8')
        const fileConfig = JSON.parse(json)
        this.config = { ...defaultConfig, ...fileConfig }
      } catch (error) {
        // If file is corrupt, use defaults
        console.warn('Warning: Could not read config file, using defaults')
      }
    }

    // Override with environment variables
    if (process.env.TEAMDAY_API_URL) {
      this.config.api_url = process.env.TEAMDAY_API_URL
    }
    if (process.env.TEAMDAY_FORMAT) {
      this.config.format = process.env.TEAMDAY_FORMAT as 'table' | 'json' | 'yaml'
    }
    if (process.env.TEAMDAY_NO_COLOR) {
      this.config.no_color = true
    }
    if (process.env.TEAMDAY_TIMEOUT) {
      this.config.timeout = parseInt(process.env.TEAMDAY_TIMEOUT, 10)
    }
    if (process.env.TEAMDAY_VERBOSE) {
      this.config.verbose = process.env.TEAMDAY_VERBOSE === 'true'
    }

    return this.config
  }

  /**
   * Set a configuration value
   */
  async set(key: string, value: any): Promise<void> {
    const config = await this.load()

    // Validate key exists in schema
    if (!(key in defaultConfig)) {
      throw new Error(`Invalid config key: ${key}`)
    }

    // Type validation for specific keys
    if (key === 'format' && !['table', 'json', 'yaml'].includes(value)) {
      throw new Error('Format must be one of: table, json, yaml')
    }
    if (key === 'timeout' && typeof value !== 'number') {
      throw new Error('Timeout must be a number')
    }
    if (key === 'no_color' && typeof value !== 'boolean') {
      throw new Error('no_color must be a boolean')
    }

    // Update config
    ;(config as any)[key] = value

    // Save to file
    await this.save(config)

    this.config = config
  }

  /**
   * Get a configuration value
   */
  async get(key: string): Promise<any> {
    const config = await this.load()
    return (config as any)[key]
  }

  /**
   * Get all configuration
   */
  async getAll(): Promise<CLIConfig> {
    return this.load()
  }

  /**
   * Unset a configuration value (restore default)
   */
  async unset(key: string): Promise<void> {
    const config = await this.load()

    if (key in defaultConfig) {
      ;(config as any)[key] = (defaultConfig as any)[key]
      await this.save(config)
      this.config = config
    }
  }

  /**
   * Reset all configuration to defaults
   */
  async reset(): Promise<void> {
    this.config = { ...defaultConfig }
    await this.save(this.config)
  }

  /**
   * Save configuration to file
   */
  private async save(config: CLIConfig): Promise<void> {
    // Ensure config directory exists
    if (!existsSync(CONFIG_DIR)) {
      await mkdir(CONFIG_DIR, { recursive: true })
    }

    // Write config file
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
  }

  /**
   * Get config directory path
   */
  getConfigDir(): string {
    return CONFIG_DIR
  }

  /**
   * Get config file path
   */
  getConfigFile(): string {
    return CONFIG_FILE
  }
}
