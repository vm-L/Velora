// main.js —— Electron 主进程文件

// 从 electron 模块中导入常用功能
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

// 全局状态管理
let tray = null;
let mainWindow = null;
let closeBehavior = 'tray'; // 默认：关闭主窗口时隐藏至系统托盘

// 简易 16x16 占位托盘图标 (Data URI 格式避免外部依赖)
const iconBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAySURBVDhPY/iPBoB0AOP///8xpE2D0RgagEEoMIIGRA8MA2EwhgbgNQChwAhgBwMDAB1eF1y5w6OaAAAAAElFTkSuQmCC';

// 创建一个函数，用于生成主窗口
function createWindow() {
  // 创建一个新窗口实例
  const win = new BrowserWindow({
    width: 1280,          // 窗口宽度（像素）
    height: 720,         // 窗口高度（像素）
    resizable: true,     // 是否允许用户拖动调整窗口大小（默认 true）
    title: "Hello Electron",  // 窗口标题，会显示在标题栏
    autoHideMenuBar: true, // 隐藏菜单栏
    frame: false, // 取消原生标题栏
    show: false, // 先隐藏窗口，避免首屏白屏或闪烁
    backgroundColor: '#f5f7fa', // 提前设置与网页一致的背景色
    webPreferences: {
      // 网页运行相关配置
      contextIsolation: true,  // 启用上下文隔离（安全推荐）
      nodeIntegration: false,  // 禁止直接在网页中使用 Node.js
      preload: path.join(__dirname, 'preload.js') // 预加载脚本
    }
  });

  mainWindow = win; // 关联至全局变量供托盘交互使用

  // 监听自定义标题栏的控制事件
  ipcMain.on('window-minimize', () => {
    win.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    if (closeBehavior === 'tray') {
      win.hide(); // 隐藏到系统托盘
    } else {
      app.quit(); // 完全退出应用
    }
  });

  // 加载本地的 index.html 文件到窗口中
  // path.join(__dirname, 'index.html') 会返回当前目录下的 index.html 路径
  win.loadFile(path.join(__dirname, 'index.html'));

  // 待渲染进程初次绘制完成后，再展示窗口，大幅优化启动视觉体验
  win.once('ready-to-show', () => {
    win.show();
  });

  // 打开开发者工具（可选，方便调试）
  // win.webContents.openDevTools();
}

// 当 Electron 初始化完成后，会触发 app 的 ready 事件
// app.whenReady() 返回一个 Promise，执行完后调用 createWindow()
app.whenReady().then(() => {
  createWindow();

  // 配置系统托盘与右键菜单
  const trayIcon = nativeImage.createFromDataURL(iconBase64);
  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示应用', click: () => { if (mainWindow) mainWindow.show(); } },
    { type: 'separator' },
    { label: '完全退出', click: () => { app.quit(); } }
  ]);
  tray.setToolTip('Hello Electron');
  tray.setContextMenu(contextMenu);
  
  // 单击托盘图标恢复窗口
  tray.on('click', () => { if (mainWindow) mainWindow.show(); });

  // 暴露设置项的状态同步接口供渲染层读取/修改
  ipcMain.on('set-close-behavior', (event, behavior) => {
    closeBehavior = behavior;
  });
  ipcMain.handle('get-close-behavior', () => closeBehavior);
});

// 当所有窗口关闭时触发（仅在 macOS 外生效）
app.on('window-all-closed', () => {
  // process.platform 返回操作系统平台
  // macOS 的平台值是 'darwin'，在 macOS 上一般保留程序常驻
  if (process.platform !== 'darwin') {
    app.quit(); // 退出应用
  }
});

// macOS 特殊逻辑：点击 Dock 图标时重新创建窗口
app.on('activate', () => {
  // 如果当前没有打开任何窗口，就重新创建一个
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});