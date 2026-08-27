export const logger = {
  perf(scope: string, message: string) {
    if (window.electronAPI?.log) {
      window.electronAPI.log('perf', scope, message)
    }
  },
  info(scope: string, message: string) {
    if (window.electronAPI && window.electronAPI.log) {
      window.electronAPI.log('info', scope, message)
    }
  },
  warn(scope: string, message: string) {
    if (window.electronAPI && window.electronAPI.log) {
      window.electronAPI.log('warn', scope, message)
    }
  },
  error(scope: string, message: string) {
    if (window.electronAPI && window.electronAPI.log) {
      window.electronAPI.log('error', scope, message)
    }
  }
}
