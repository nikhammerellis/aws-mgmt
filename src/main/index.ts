import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpcHandlers, setOnProfilesUpdated } from './ipc-handlers'
import { startFileWatchers, stopFileWatchers, broadcastExpiriesChanged } from './services/file-watcher'
import { createTray, updateTrayMenu, destroyTray } from './services/tray'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    title: `AWS Profile Manager ${app.getVersion()}`,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Sandbox the renderer process at the OS level. Our preload uses
      // only contextBridge + ipcRenderer, both of which work under sandbox,
      // so we get defense-in-depth against a compromised renderer without
      // losing any functionality.
      sandbox: true
    }
  })

  // Show window once ready to avoid flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Harden against a compromised renderer trying to navigate the window
  // away from the bundled UI, or to pop a window.open() to an attacker URL.
  // This app is fully local — no remote navigation is ever legitimate.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  // Close-to-tray: hide window instead of destroying it
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const getWindow = () => mainWindow

// Suppress noisy Chromium GPU shader cache errors on Windows. This app is a
// utility rendering forms — GPU shader caching provides no benefit.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

// Only allow one running instance. A second launch focuses the existing
// window instead of spawning a duplicate — otherwise two copies would both
// watch ~/.aws/, both own a tray icon, and both race on file writes.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })
}

let trayRefreshHandle: ReturnType<typeof setInterval> | null = null

app.whenReady().then(() => {
  registerIpcHandlers()
  startFileWatchers()
  createWindow()
  createTray(getWindow)

  // Keep tray menu in sync when profiles are changed via the UI
  setOnProfilesUpdated(() => updateTrayMenu(getWindow))

  // Refresh tray every minute so the expiry countdown in the tooltip stays
  // roughly current, and push an expiries-changed event so the renderer
  // can re-fetch without running its own polling timer. This covers SSO
  // cache files, which we don't watch directly.
  trayRefreshHandle = setInterval(() => {
    updateTrayMenu(getWindow).catch(() => {
      /* transient failure — try again next tick */
    })
    broadcastExpiriesChanged()
  }, 60_000)

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
    } else {
      createWindow()
    }
  })
})

// When the user chooses Quit from tray or Cmd+Q on Mac
app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  // On macOS, app stays in dock until explicit quit
  // On Windows/Linux, the tray keeps the app alive, so don't quit here
})

app.on('quit', () => {
  if (trayRefreshHandle) clearInterval(trayRefreshHandle)
  stopFileWatchers()
  destroyTray()
})
