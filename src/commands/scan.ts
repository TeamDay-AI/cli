/**
 * Scan Commands
 * Social media scanning and opportunity discovery
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import type { APIClient } from '../lib/api-client'
import type { ConfigManager } from '../lib/config-manager'

interface ScanResult {
  platform: 'reddit' | 'hackernews'
  title: string
  author: string
  score: number
  comments: number
  age: string
  permalink: string
  preview: string
  subreddit?: string
  relevanceScore: number
}

interface ScanResponse {
  results: ScanResult[]
  scannedAt: string
  topicsCovered: string[]
  platformsScanned: string[]
}

export function createScanCommands(
  apiClient: APIClient,
  config: ConfigManager,
): Command {
  const scan = new Command('scan').description('Scan social media for opportunities')

  // teamday scan <topics>
  scan
    .argument('<topics>', 'Comma-separated topics to scan (e.g. "ai agents,mcp server")')
    .option('--time <range>', 'Time range: day, week, month, year', 'week')
    .option('--limit <n>', 'Results per platform per topic', '10')
    .option('--platforms <list>', 'Platforms: reddit,hackernews', 'reddit,hackernews')
    .option('--format <format>', 'Output format (table|json)')
    .action(async (topics: string, options) => {
      const spinner = ora(`Scanning Reddit & Hacker News for: ${chalk.cyan(topics)}`).start()

      try {
        const params = new URLSearchParams({
          topics,
          timeRange: options.time,
          limit: options.limit,
          platforms: options.platforms,
        })

        const data = await apiClient.get<ScanResponse>(
          `/api/v1/social-media/scan?${params}`,
        )

        spinner.stop()

        if (options.format === 'json') {
          console.log(JSON.stringify(data, null, 2))
          return
        }

        // Header
        console.log()
        console.log(chalk.bold(`  Social Media Scan`))
        console.log(chalk.gray(`  Topics: ${data.topicsCovered.join(', ')}`))
        console.log(chalk.gray(`  Platforms: ${data.platformsScanned.join(', ')}`))
        console.log(chalk.gray(`  Scanned: ${new Date(data.scannedAt).toLocaleString()}`))
        console.log(chalk.gray(`  ${data.results.length} opportunities found`))
        console.log()

        if (data.results.length === 0) {
          console.log(chalk.yellow('  No results found. Try broader topics or longer time range.\n'))
          return
        }

        // Results
        for (const [i, r] of data.results.entries()) {
          const platformLabel = r.platform === 'reddit'
            ? chalk.hex('#FF4500')(`Reddit r/${r.subreddit}`)
            : chalk.hex('#FF6600')('Hacker News')

          const scoreColor = r.relevanceScore > 1000 ? chalk.green : r.relevanceScore > 100 ? chalk.yellow : chalk.gray
          console.log(`  ${chalk.gray(`${i + 1}.`)} ${scoreColor(`[${r.relevanceScore}]`)} ${platformLabel}`)
          console.log(`     ${chalk.white(r.title)}`)
          console.log(`     ${chalk.gray(`${r.score} pts | ${r.comments} comments | ${r.age} | by ${r.author}`)}`)
          if (r.preview) {
            const short = r.preview.length > 100 ? r.preview.slice(0, 100) + '...' : r.preview
            console.log(`     ${chalk.gray.italic(short)}`)
          }
          console.log(`     ${chalk.blue.underline(r.permalink)}`)
          console.log()
        }
      } catch (error: any) {
        spinner.fail(chalk.red('Scan failed'))
        console.error(chalk.red(`\n  Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  return scan
}
