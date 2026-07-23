import re
import os

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

# 1. Update main.ts
main_ts = read_file('electron/main.ts')
# Remove protocol handle for 'velora'
main_ts = re.sub(r"protocol\.handle\('velora', async \(request\) => \{.*?\}\)\n", "", main_ts, flags=re.DOTALL)
# Remove privileged scheme
main_ts = re.sub(r"protocol\.registerSchemesAsPrivileged\(\[\s*\{\s*scheme:\s*'velora'.*?\}\s*\]\)\n", "", main_ts, flags=re.DOTALL)
# Remove unused imports if any
main_ts = main_ts.replace("import { fileURLToPath, pathToFileURL } from 'url'\n", "")
main_ts = main_ts.replace("import { Readable } from 'stream'\n", "")
# Add http server code
http_server_code = """import http from 'http'

let streamServerPort = 0;
const mediaServer = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
    if (urlObj.pathname === '/stream') {
      const filePath = urlObj.searchParams.get('path');
      if (!filePath) {
        res.writeHead(400);
        return res.end('Missing path');
      }
      
      const stat = await fs.promises.stat(filePath);
      const rangeHeader = req.headers['range'];
      
      let contentType = 'application/octet-stream';
      const ext = filePath.split('.').pop()?.toLowerCase();
      if (ext === 'mp4') contentType = 'video/mp4';
      else if (ext === 'm3u8') contentType = 'application/x-mpegURL';
      else if (ext === 'ts') contentType = 'video/MP2T';
      else if (ext === 'mp3') contentType = 'audio/mpeg';
      else if (ext === 'webm') contentType = 'video/webm';
      else if (ext === 'png') contentType = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
      else if (ext === 'webp') contentType = 'image/webp';
      else if (ext === 'gif') contentType = 'image/gif';
      
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      
      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = (end - start) + 1;
        
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': chunksize,
        });
        const fileStream = fs.createReadStream(filePath, { start, end });
        fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
        });
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (err: any) {
    logger.error('Protocol', `Local media server error: ${err.message}`);
    res.writeHead(404);
    res.end('File not found');
  }
});

mediaServer.listen(0, '127.0.0.1', () => {
  streamServerPort = (mediaServer.address() as any).port;
  logger.info('System', `Local media server listening on port ${streamServerPort}`);
});
"""

main_ts = main_ts.replace("import fs from 'fs'\n", "import fs from 'fs'\n" + http_server_code + "\n")
main_ts = main_ts.replace("ipcMain.handle('select-folder', async () => {", "ipcMain.handle('get-server-port', () => streamServerPort)\n\n  ipcMain.handle('select-folder', async () => {")
write_file('electron/main.ts', main_ts)

# 2. Update preload.ts
preload = read_file('electron/preload.ts')
preload = preload.replace("  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath)", "  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),\n  getServerPort: () => ipcRenderer.invoke('get-server-port')")
write_file('electron/preload.ts', preload)

# 3. Update env.d.ts
env_ts = read_file('src/env.d.ts')
env_ts = env_ts.replace("  openFile: (filePath: string) => Promise<boolean>", "  openFile: (filePath: string) => Promise<boolean>\n  getServerPort: () => Promise<number>")
# add window.__SERVER_PORT__
env_ts = env_ts + "\n\ndeclare global {\n  interface Window {\n    __SERVER_PORT__?: number;\n  }\n}\n"
write_file('src/env.d.ts', env_ts)

# 4. Update main.ts (vue entry point)
src_main = read_file('src/main.ts')
src_main = src_main.replace("app.mount('#app')", """
const initApp = async () => {
  if (window.electronAPI) {
    window.__SERVER_PORT__ = await window.electronAPI.getServerPort();
  }
  app.mount('#app');
}
initApp();
""")
write_file('src/main.ts', src_main)

# 5. Update Dialogs formatMediaSrc
def update_format_media_src(content):
    replacement = """const formatMediaSrc = (url: string) => {
  if (!url) return '';
  let cleanPath = url.trim().replace(/\\\\/g, '/');
  
  if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
    return cleanPath;
  }
  
  if (cleanPath.startsWith('velora://local/')) {
    cleanPath = decodeURIComponent(cleanPath.slice('velora://local/'.length));
  }
  
  const port = window.__SERVER_PORT__;
  return `http://127.0.0.1:${port}/stream?path=${encodeURIComponent(cleanPath)}`;
}"""
    # use regex to replace the whole function block
    content = re.sub(r"const formatMediaSrc = \(url: string\) => \{[\s\S]*?return[^}]*\}", replacement, content)
    return content

for file_path in [
    'src/components/features/VideoPlayerDialog.vue',
    'src/components/features/AudioPlayerDialog.vue',
    'src/components/features/ImagePreviewDialog.vue'
]:
    content = read_file(file_path)
    content = update_format_media_src(content)
    write_file(file_path, content)

print("Refactoring complete.")
