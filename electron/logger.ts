import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export type LogLevel = 'info' | 'warn' | 'error'

class Logger {
  private logPath: string
  private isDev: boolean

  constructor() {
    this.logPath = path.join(process.cwd(), 'app.log')
    this.isDev = !app.isPackaged
  }

  info(scope: string, message: string) {
    if (this.isDev) {
      this.write('INFO', scope, message)
    }
  }

  warn(scope: string, message: string) {
    if (this.isDev) {
      this.write('WARN', scope, message)
    }
  }

  error(scope: string, message: string) {
    this.write('ERROR', scope, message)
  }

  private write(level: string, scope: string, message: string) {
    const timestamp = new Date().toISOString()
    const logLine = `[${timestamp}] [${level}] [${scope}] ${message}\n`
    try {
      if (level === 'ERROR') {
        process.stderr.write(logLine)
      } else {
        process.stdout.write(logLine)
      }
      fs.appendFileSync(this.logPath, logLine, 'utf8')
    } catch (err) {
      process.stderr.write(`Failed to write log to file: ${err}\n`)
    }
  }
}

export const logger = new Logger()
