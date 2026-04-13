/**
 * Output Formatters
 * Format data as Table, JSON, or YAML
 */

import Table from 'cli-table3'
import yaml from 'js-yaml'
import chalk from 'chalk'

export interface Formatter {
  format(data: any): string
}

export class TableFormatter implements Formatter {
  format(data: any): string {
    if (Array.isArray(data)) {
      return this.formatArray(data)
    }
    return this.formatObject(data)
  }

  private formatArray(items: any[]): string {
    if (items.length === 0) {
      return chalk.yellow('No results found')
    }

    // Get all unique keys from all items
    const allKeys = new Set<string>()
    items.forEach((item) => {
      Object.keys(item).forEach((key) => allKeys.add(key))
    })

    const keys = Array.from(allKeys)

    // Create table
    const table = new Table({
      head: keys.map((k) => chalk.cyan.bold(k)),
      style: {
        head: [],
        border: ['gray'],
      },
      wordWrap: true,
      wrapOnWordBoundary: false,
    })

    // Add rows
    items.forEach((item) => {
      table.push(
        keys.map((k) => {
          const value = item[k]

          // Handle different value types
          if (value === null || value === undefined) {
            return chalk.gray('-')
          }

          if (Array.isArray(value)) {
            return value.length > 0 ? value.join(', ') : chalk.gray('[]')
          }

          if (typeof value === 'object') {
            return JSON.stringify(value)
          }

          if (typeof value === 'boolean') {
            return value ? chalk.green('✓') : chalk.red('✗')
          }

          return String(value)
        })
      )
    })

    return table.toString()
  }

  private formatObject(obj: any): string {
    const table = new Table({
      colWidths: [30, 70],
      wordWrap: true,
      style: {
        border: ['gray'],
      },
    })

    Object.entries(obj).forEach(([key, value]) => {
      let displayValue: string

      if (value === null || value === undefined) {
        displayValue = chalk.gray('-')
      } else if (Array.isArray(value)) {
        displayValue = value.length > 0 ? value.join(', ') : chalk.gray('[]')
      } else if (typeof value === 'object') {
        displayValue = JSON.stringify(value, null, 2)
      } else if (typeof value === 'boolean') {
        displayValue = value ? chalk.green('true') : chalk.red('false')
      } else {
        displayValue = String(value)
      }

      table.push([chalk.cyan.bold(key), displayValue])
    })

    return table.toString()
  }
}

export class JSONFormatter implements Formatter {
  format(data: any): string {
    return JSON.stringify(data, null, 2)
  }
}

export class YAMLFormatter implements Formatter {
  format(data: any): string {
    return yaml.dump(data, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    })
  }
}

/**
 * Get formatter by format type
 */
export function getFormatter(
  format: 'table' | 'json' | 'yaml'
): Formatter {
  switch (format) {
    case 'json':
      return new JSONFormatter()
    case 'yaml':
      return new YAMLFormatter()
    case 'table':
    default:
      return new TableFormatter()
  }
}
