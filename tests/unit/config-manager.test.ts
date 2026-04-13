/**
 * ConfigManager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConfigManager } from '../../src/lib/config-manager'
import { rm } from 'fs/promises'
import { existsSync } from 'fs'

describe('ConfigManager', () => {
  let configManager: ConfigManager

  beforeEach(async () => {
    configManager = new ConfigManager()
    // Clear any existing config
    const configFile = configManager.getConfigFile()
    if (existsSync(configFile)) {
      await rm(configFile)
    }
  })

  afterEach(async () => {
    // Cleanup
    const configFile = configManager.getConfigFile()
    if (existsSync(configFile)) {
      await rm(configFile)
    }
  })

  it('should load default config', async () => {
    const config = await configManager.load()

    expect(config).toBeDefined()
    expect(config.api_url).toBe('http://localhost:3000')
    expect(config.format).toBe('table')
    expect(config.timeout).toBe(300000)
  })

  it('should set and get config values', async () => {
    await configManager.set('format', 'json')

    const format = await configManager.get('format')
    expect(format).toBe('json')
  })

  it('should validate format values', async () => {
    await expect(
      configManager.set('format', 'invalid')
    ).rejects.toThrow('Format must be one of')
  })

  it('should unset config values', async () => {
    await configManager.set('format', 'json')
    await configManager.unset('format')

    const format = await configManager.get('format')
    expect(format).toBe('table') // Should be default
  })

  it('should reset all config', async () => {
    await configManager.set('format', 'json')
    await configManager.set('timeout', 60000)

    await configManager.reset()

    const config = await configManager.load()
    expect(config.format).toBe('table')
    expect(config.timeout).toBe(300000)
  })

  it('should respect environment variables', async () => {
    process.env.TEAMDAY_API_URL = 'https://custom.api'
    process.env.TEAMDAY_FORMAT = 'yaml'

    const config = await configManager.load()

    expect(config.api_url).toBe('https://custom.api')
    expect(config.format).toBe('yaml')

    // Cleanup
    delete process.env.TEAMDAY_API_URL
    delete process.env.TEAMDAY_FORMAT
  })
})
