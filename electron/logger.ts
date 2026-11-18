import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export type LogLevel = 'info' | 'warn' | 'error' | 'perf'

class Logger {
  private logPath: string
  private isDev: boolean
  private buffer: string[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private isFlushing = false
  private writtenBytes = 0
  private readonly MAX_LOG_BYTES = 10 * 1024 * 1024 // 10MB 单文件上限

  constructor() {
    let baseDir = process.cwd()
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      baseDir = process.env.PORTABLE_EXECUTABLE_DIR
    } else if (app?.isPackaged && typeof app.getPath === 'function') {
      baseDir = path.dirname(app.getPath('exe'))
    }
    this.logPath = path.join(baseDir, 'app.log')
    this.isDev = !app?.isPackaged

    // 每次程序启动时清空旧日志并重新记录，若安装目录只读则回退至 userData
    try {
      fs.writeFileSync(this.logPath, '', 'utf8')
    } catch {
      try {
        if (app && typeof app.getPath === 'function') {
          const fallbackDir = app.getPath('userData')
          if (!fs.existsSync(fallbackDir)) {
            fs.mkdirSync(fallbackDir, { recursive: true })
          }
          this.logPath = path.join(fallbackDir, 'app.log')
          fs.writeFileSync(this.logPath, '', 'utf8')
        }
      } catch (err) {
        process.stderr.write(`Failed to initialize log file: ${err}\n`)
      }
    }
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

  private scheduleFlush() {
    if (this.buffer.length >= 50) {
      if (this.flushTimer) {
        clearTimeout(this.flushTimer)
        this.flushTimer = null
      }
      void this.flush()
      return
    }
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        void this.flush()
      }, 200)
    }
  }

  private async rotateIfNeeded(): Promise<void> {
    if (this.writtenBytes < this.MAX_LOG_BYTES) return
    try {
      const oldPath = `${this.logPath}.old`
      try {
        await fs.promises.unlink(oldPath)
      } catch {}
      await fs.promises.rename(this.logPath, oldPath)
      this.writtenBytes = 0
    } catch {
      try {
        await fs.promises.truncate(this.logPath, 0)
        this.writtenBytes = 0
      } catch {}
    }
  }

  private async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) return
    this.isFlushing = true
    try {
      while (this.buffer.length > 0) {
        await this.rotateIfNeeded()
        const chunk = this.buffer.splice(0, this.buffer.length).join('')
        await fs.promises.appendFile(this.logPath, chunk, 'utf8')
        this.writtenBytes += Buffer.byteLength(chunk, 'utf8')
      }
    } catch (err) {
      process.stderr.write(`Failed to flush log to file: ${err}\n`)
    } finally {
      this.isFlushing = false
      if (this.buffer.length > 0) {
        this.scheduleFlush()
      }
    }
  }

  flushSync() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.buffer.length === 0) return
    try {
      const chunk = this.buffer.splice(0, this.buffer.length).join('')
      fs.appendFileSync(this.logPath, chunk, 'utf8')
      this.writtenBytes += Buffer.byteLength(chunk, 'utf8')
    } catch (err) {
      process.stderr.write(`Failed to flushSync log to file: ${err}\n`)
    }
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
      this.buffer.push(logLine)
      this.scheduleFlush()
    } catch (err) {
      process.stderr.write(`Failed to enqueue log: ${err}\n`)
    }
  }
}

export const logger = new Logger()
