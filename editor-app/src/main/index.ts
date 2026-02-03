import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'

// Simple dev/prod flag.
// We avoid @electron-toolkit/utils here because it can resolve `electron` incorrectly
// in some dev setups and crash before the app starts.
const isDev = !app.isPackaged

// In some Windows setups, `localhost` may resolve to IPv6 (::1) first.
// Vite might only be listening on IPv4, which can cause ERR_CONNECTION_REFUSED.
// This helper forces an IPv4 URL when we are in dev.
function getDevRendererUrl(): string | undefined {
  const url = process.env['ELECTRON_RENDERER_URL']
  if (!url) return undefined

  return url.replace('localhost', '127.0.0.1')
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer based on electron-vite CLI.
  // Load the remote URL for development or the local html file for production.
  const devUrl = isDev ? getDevRendererUrl() : undefined
  if (devUrl) {
    // If the dev server isn't fully ready yet, Electron can fail the first load.
    // In dev we do a few retries to avoid a crash loop.
    let retryLeft = 20
    mainWindow.webContents.on('did-fail-load', (_event, _errorCode, errorDescription) => {
      if (retryLeft <= 0) return
      if (typeof errorDescription === 'string' && !errorDescription.includes('ERR_CONNECTION_REFUSED')) {
        return
      }

      retryLeft -= 1
      setTimeout(() => {
        mainWindow.loadURL(devUrl)
      }, 250)
    })

    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for Windows notifications/taskbar grouping.
  // In dev we use the current executable path to avoid Windows quirks.
  if (process.platform === 'win32') {
    app.setAppUserModelId(isDev ? process.execPath : 'com.electron')
  }

  // Basic shortcuts.
  // - Dev: F12 toggles DevTools.
  // - Prod: blocks reload/devtools shortcuts.
  app.on('browser-window-created', (_, window) => {
    const { webContents } = window

    webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return

      if (isDev) {
        if (input.code === 'F12') {
          if (webContents.isDevToolsOpened()) webContents.closeDevTools()
          else webContents.openDevTools({ mode: 'undocked' })
          event.preventDefault()
        }
        return
      }

      // Production: prevent reload and DevTools.
      if (input.code === 'KeyR' && (input.control || input.meta)) {
        event.preventDefault()
      }
      if (input.code === 'KeyI' && ((input.alt && input.meta) || (input.control && input.shift))) {
        event.preventDefault()
      }
    })
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
