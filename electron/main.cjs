// Electron main process for the HIKER+ desktop build (Windows installer).
//
// The renderer is the same Vite build the browser and the APK use: `npm run
// build -- --base=./` produces `dist/`, which `electron-builder.yml` packages
// together with this folder.
//
// It is served over a loopback HTTP server rather than loaded from `file://`.
// The app uses BrowserRouter, and a real origin is what lets client-side
// routing (history.pushState) and the Supabase calls behave exactly as they do
// in the browser. Binding to 127.0.0.1 keeps the window local and avoids a
// Windows firewall prompt.
const { app, BrowserWindow, shell } = require('electron')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const DIST_DIR = path.resolve(__dirname, '..', 'dist')
const INDEX_FILE = path.join(DIST_DIR, 'index.html')

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

let staticServer = null
let staticServerPort = 0

// Serves a real file when the request names one and falls back to the app shell
// otherwise, so a deep link such as /labour still boots the SPA.
function resolveRequestPath(requestUrl) {
  const { pathname } = new URL(requestUrl, 'http://127.0.0.1')
  const requested = path.resolve(DIST_DIR, '.' + decodeURIComponent(pathname))

  if (requested.startsWith(DIST_DIR + path.sep)) {
    try {
      if (fs.statSync(requested).isFile()) return requested
    } catch {
      // Not a file (or not there any more): fall through to the app shell.
    }
  }
  return INDEX_FILE
}

function startStaticServer() {
  staticServer = http.createServer((request, response) => {
    const file = resolveRequestPath(request.url)
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(file)] || 'application/octet-stream',
    })
    fs.createReadStream(file)
      .on('error', () => response.destroy())
      .pipe(response)
  })

  return new Promise((resolve, reject) => {
    staticServer.once('error', reject)
    staticServer.listen(0, '127.0.0.1', () => {
      staticServerPort = staticServer.address().port
      resolve(staticServerPort)
    })
  })
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#F4F4F4',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  window.once('ready-to-show', () => window.show())

  // Anything meant for the outside world opens in the system browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  window.loadURL(`http://127.0.0.1:${staticServerPort}/`)
}

app.whenReady().then(async () => {
  await startStaticServer()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (staticServer) staticServer.close()
})
