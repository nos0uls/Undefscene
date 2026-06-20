import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { appState } from './appState'

const isDev = !app.isPackaged

// In some Windows setups, `localhost` may resolve to IPv6 (::1) first.
// Vite might only be listening on IPv4, which can cause ERR_CONNECTION_REFUSED.
// This helper forces an IPv4 URL when we are in dev.
function getDevRendererUrl(): string | undefined {
  const url = process.env['ELECTRON_RENDERER_URL']
  if (!url) return undefined

  return url.replace('localhost', '127.0.0.1')
}

// Собираем URL renderer для конкретного окна.
// Так один renderer bundle может рендерить и main editor, и visual editor окно.
function getRendererUrlForWindow(windowKind: 'main' | 'visual-editor'): string | undefined {
  const baseUrl = getDevRendererUrl()
  if (!baseUrl) return undefined
  if (windowKind === 'main') return baseUrl

  const url = new URL(baseUrl)
  url.searchParams.set('window', windowKind)
  return url.toString()
}

// Общий loader renderer для всех окон.
// В dev повторяем загрузку, если electron-vite сервер ещё не успел подняться.
function loadRendererWindow(
  targetWindow: BrowserWindow,
  windowKind: 'main' | 'visual-editor'
): void {
  const devUrl = isDev ? getRendererUrlForWindow(windowKind) : undefined
  if (devUrl) {
    let retryLeft = 20
    targetWindow.webContents.on('did-fail-load', (_event, _errorCode, errorDescription) => {
      if (retryLeft <= 0) return
      if (
        typeof errorDescription === 'string' &&
        !errorDescription.includes('ERR_CONNECTION_REFUSED')
      ) {
        return
      }

      retryLeft -= 1
      setTimeout(() => {
        void targetWindow.loadURL(devUrl)
      }, 250)
    })

    void targetWindow.loadURL(devUrl)
    return
  }

  void targetWindow.loadFile(join(__dirname, '../renderer/index.html'), {
    query: windowKind === 'main' ? undefined : { window: windowKind }
  })
}

// Создаём отдельное native окно Visual Editing.
// Это окно живёт отдельно в Alt+Tab и получает состояние через IPC bridge.
function createVisualEditorWindow(): BrowserWindow {
  if (appState.visualEditorWindowRef && !appState.visualEditorWindowRef.isDestroyed()) {
    appState.visualEditorWindowRef.focus()
    return appState.visualEditorWindowRef
  }

  const visualWindow = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Undefscene - Visual Editing',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // TODO: sandbox should be true, but it fails to load the preload script under sandbox because the imported '@electron-toolkit/preload' module fails to resolve (Module not found: @electron-toolkit/preload) inside the sandboxed renderer environment.
      sandbox: false
    }
  })

  appState.visualEditorWindowRef = visualWindow

  visualWindow.on('ready-to-show', () => {
    visualWindow.show()
    visualWindow.focus()
    if (appState.latestVisualEditorState) {
      visualWindow.webContents.send('visualEditor.stateUpdated', appState.latestVisualEditorState)
    }
  })

  visualWindow.on('closed', () => {
    if (appState.visualEditorWindowRef === visualWindow) {
      appState.visualEditorWindowRef = null
    }

    appState.latestVisualEditorState = null

    if (appState.mainWindowRef && !appState.mainWindowRef.isDestroyed()) {
      appState.mainWindowRef.focus()
      appState.mainWindowRef.webContents.send('visualEditor.windowClosed')
    }
  })

  visualWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRendererWindow(visualWindow, 'visual-editor')
  return visualWindow
}

export { loadRendererWindow, createVisualEditorWindow }
