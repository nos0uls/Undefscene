import { app, shell, BrowserWindow, Menu } from 'electron'
import { readFileSync } from 'fs'
import { rename, unlink, appendFile, stat } from 'fs/promises'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { initAutoUpdater } from './updater'
import { appState, getLogPath } from './appState'
import { loadRendererWindow } from './windowManager'
import { registerIpcHandlers } from './ipc'

// Simple dev/prod flag.
// We avoid @electron-toolkit/utils here because it can resolve `electron` incorrectly
// in some dev setups and crash before the app starts.
const isDev = !app.isPackaged

// Лог-файлы приложения в userData.
// Используем простую ротацию: undefscene.log, undefscene.log.1, undefscene.log.2
// Максимум 3 файла по ~1MB каждый.
const LOG_MAX_BYTES = 1024 * 1024
const LOG_ROTATION_COUNT = 3

// Безопасно превращаем любые console args в одну строку для файла логов.
function stringifyLogPart(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

// Ротация логов при превышении лимита размера.
async function rotateLogsIfNeeded(): Promise<void> {
  try {
    const currentStat = await stat(getLogPath(0))
    if (currentStat.size < LOG_MAX_BYTES) return
  } catch {
    return
  }

  for (let index = LOG_ROTATION_COUNT - 1; index >= 1; index -= 1) {
    const sourcePath = getLogPath(index - 1)
    const targetPath = getLogPath(index)

    try {
      await unlink(targetPath)
    } catch {
      // Старый rotated-файл может отсутствовать — это нормально.
    }

    try {
      await rename(sourcePath, targetPath)
    } catch {
      // Если source ещё не существует — просто пропускаем.
    }
  }
}

// Параметры буферизации логов: макс строк в памяти и интервал сброса на диск.
const LOG_BUFFER_MAX_LINES = 50
const LOG_BUFFER_FLUSH_MS = 100

// In-memory buffer для лог-строк. Сбрасываем batch'ами на диск,
// чтобы не делать appendFile syscall на каждый console.log.
let logBuffer: string[] = []
let logFlushTimer: NodeJS.Timeout | null = null

// Сбрасываем накопленные строки в лог-файл одним write.
async function flushLogBuffer(): Promise<void> {
  if (logBuffer.length === 0) return
  const lines = logBuffer.join('')
  logBuffer = []
  logFlushTimer = null

  try {
    await rotateLogsIfNeeded()
    await appendFile(getLogPath(0), lines, 'utf-8')
  } catch {
    // Никогда не валим приложение из-за ошибок логгера.
  }
}

// Ставим отложенный flush, если его ещё нет.
function scheduleLogFlush(): void {
  if (logFlushTimer) return
  logFlushTimer = setTimeout(() => {
    void flushLogBuffer()
  }, LOG_BUFFER_FLUSH_MS)
}

// Добавляем строку в буфер. При переполнении — сбрасываем сразу.
function writeLogLine(level: 'log' | 'warn' | 'error', parts: unknown[]): void {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] [${level.toUpperCase()}] ${parts.map(stringifyLogPart).join(' ')}\n`
  logBuffer.push(line)

  if (logBuffer.length >= LOG_BUFFER_MAX_LINES) {
    void flushLogBuffer()
  } else {
    scheduleLogFlush()
  }
}

// Включаем запись console.log/warn/error в файл.
function installFileLogger(): void {
  const originalLog = console.log.bind(console)
  const originalWarn = console.warn.bind(console)
  const originalError = console.error.bind(console)

  console.log = (...parts: unknown[]) => {
    originalLog(...parts)
    void writeLogLine('log', parts)
  }

  console.warn = (...parts: unknown[]) => {
    originalWarn(...parts)
    void writeLogLine('warn', parts)
  }

  console.error = (...parts: unknown[]) => {
    originalError(...parts)
    void writeLogLine('error', parts)
  }

  process.on('uncaughtException', (error) => {
    originalError(error)
    writeLogLine('error', ['uncaughtException', error])
    void flushLogBuffer()
  })

  process.on('unhandledRejection', (reason) => {
    originalError(reason)
    writeLogLine('error', ['unhandledRejection', reason])
    void flushLogBuffer()
  })

  // При shutdown сбрасываем остаток буфера.
  process.on('beforeExit', () => {
    void flushLogBuffer()
  })
}

installFileLogger()

// Гарантируем flush оставшихся логов перед выходом приложения.
app.on('before-quit', () => {
  void flushLogBuffer()
})

// Читаем preferences.json как можно раньше.
// Это нужно для флага disableHardwareAcceleration, который Electron должен получить
// ещё до ready/createWindow, иначе настройка не применится на текущем запуске.
try {
  const earlyPreferencesPath = join(app.getPath('userData'), 'preferences.json')
  const earlyRaw = readFileSync(earlyPreferencesPath, 'utf-8')
  const earlyPrefs = JSON.parse(earlyRaw) as { disableHardwareAcceleration?: unknown }

  if (earlyPrefs?.disableHardwareAcceleration === true) {
    app.disableHardwareAcceleration()
  }
} catch {
  // Если preferences.json ещё нет или он битый, просто используем дефолтный режим.
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
      // TODO: sandbox should be true, but it fails to load the preload script under sandbox because the imported '@electron-toolkit/preload' module fails to resolve (Module not found: @electron-toolkit/preload) inside the sandboxed renderer environment.
      sandbox: false
    }
  })

  // Держим ref на главное окно, чтобы слать туда import path из отдельного visual editor.
  appState.mainWindowRef = mainWindow

  // --- IPC: GameMaker project (.yyp) ---
  // Moved to app.whenReady to avoid duplicate registration on re-create.

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()

    // Подключаем автообновление.
    // Даже в dev полезно зарегистрировать IPC-хэндлеры, чтобы кнопка "Check for Updates"
    // не "молчала" и могла показать ошибку/статус.
    // Portable сборка устанавливает эту env-переменную.
    const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR
    initAutoUpdater(mainWindow, isPortable)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    if (appState.mainWindowRef === mainWindow) {
      appState.mainWindowRef = null
    }

    if (appState.visualEditorWindowRef && !appState.visualEditorWindowRef.isDestroyed()) {
      appState.visualEditorWindowRef.close()
    }
  })

  loadRendererWindow(mainWindow, 'main')
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

  // В production убираем нативное меню, чтобы Alt не открывал его.
  // В dev оставляем для удобства (F12 → DevTools).
  if (!isDev) {
    Menu.setApplicationMenu(null)
  }

  registerIpcHandlers()

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
