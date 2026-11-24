import { app } from 'electron'
import fs from 'fs'
import path from 'path'

// 启动渲染与图形硬件加速配置
app.commandLine.appendSwitch('disable-http-cache', 'false')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

// 配置本地绿色同级目录数据存储路径 (dev 及打包便携版数据均归集于程序同级目录的 data/ 文件夹内)
const getLocalDataDir = (): string => {
  let baseDir = process.cwd()
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    baseDir = process.env.PORTABLE_EXECUTABLE_DIR
  } else if (app.isPackaged) {
    baseDir = path.dirname(app.getPath('exe'))
  }
  const dataDir = path.join(baseDir, 'data')
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true })
    } catch {
      // ignore
    }
  }
  return dataDir
}

export const localDataPath = getLocalDataDir()
app.setPath('userData', localDataPath)
app.setPath('sessionData', path.join(localDataPath, 'session'))

// 设置 Windows 任务栏应用唯一 AppUserModelId，确保任务栏图标与主程序图标统一关联
if (process.platform === 'win32') {
  app.setAppUserModelId('com.velora.app')
}
