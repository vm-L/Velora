import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export type LogLevel = 'info' | 'warn' | 'error' | 'perf'

class Logger {
  private logPath: string
  private isDev: boolean

  constructor() {
    let baseDir = process.cwd();
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      baseDir = process.env.PORTABLE_EXECUTABLE_DIR;
    } else if (app.isPackaged) {
      baseDir = path.dirname(app.getPath('exe'));
    }
    this.logPath = path.join(baseDir, 'app.log')
    this.isDev = !app.isPackaged
  }

  perf(scope: string, message: string) {
    this.write('PERF', scope, message)
  }

  info(scope: string, message: string) {
    if (this.isDev || scope.toLowerCase().includes('perf')) {
      this.write('INFO', scope, message)
    }
  }

  warn(scope: string, message: string) {
    this.write('WARN', scope, message)
  }

  error(scope: string, message: string) {
    this.write('ERROR', scope, message)
  }

  private getLocalTimestamp(): string {
    const d = new Date()
    const pad = (n: number, z = 2) => String(n).padStart(z, '0')
    const year = d.getFullYear()
    const month = pad(d.getMonth() + 1)
    const day = pad(d.getDate())
    const hours = pad(d.getHours())
    const minutes = pad(d.getMinutes())
    const seconds = pad(d.getSeconds())
    const ms = pad(d.getMilliseconds(), 3)
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`
  }

  private write(level: string, scope: string, message: string) {
    const timestamp = this.getLocalTimestamp()
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
