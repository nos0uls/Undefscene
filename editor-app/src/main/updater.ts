// updater.ts — Автообновление через electron-updater.
// Проверяет GitHub Releases на наличие новой версии.
// Для NSIS-установки — скачивает и устанавливает автоматически.
// Для portable — только уведомляет пользователя (через IPC).

import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain, app } from 'electron'

// Флаг: приложение запущено как portable (нет installer).
// В portable режиме мы НЕ запускаем auto-install, только проверяем наличие обновления.
let isPortable = false
// Сохраняем главное окно, чтобы слать IPC безопасно.
let mainWindowRef: BrowserWindow | null = null
// Один раз регистрируем слушатели autoUpdater и отмечаем инициализацию.
let initialized = false

// Безопасная отправка события в renderer (если окно есть).
function sendToRenderer(channel: string, payload?: any) {
  const win = mainWindowRef
  if (!win || win.isDestroyed()) return
  win.webContents.send(channel, payload)
}

// --- IPC от renderer ---
// Регистрируем хэндлеры сразу, чтобы renderer всегда мог вызвать Check for Updates.
ipcMain.handle('updater:check', async () => {
  if (!initialized) {
    return { status: 'error' as const, message: 'Updater not initialized' }
  }

  try {
    // checkForUpdates() возвращает updateInfo даже если обновления нет,
    // поэтому мы сравниваем версию релиза с текущей версией приложения.
    const result = await autoUpdater.checkForUpdates()
    const currentVersion = app.getVersion()
    const nextVersion = result?.updateInfo?.version ?? null

    if (!nextVersion) {
      return { status: 'none' as const }
    }

    // Если версия релиза равна текущей — значит обновления нет.
    if (nextVersion === currentVersion) {
      return { status: 'none' as const }
    }

    return { status: 'available' as const, version: nextVersion }
  } catch (err) {
    return { status: 'error' as const, message: err instanceof Error ? err.message : 'Unknown error' }
  }
})

ipcMain.handle('updater:install', () => {
  if (!initialized) {
    return { status: 'error' as const, message: 'Updater not initialized' }
  }
  autoUpdater.quitAndInstall(false, true)
  return { status: 'ok' as const }
})

// Инициализация автообновления.
// Вызывается один раз после создания главного окна.
export function initAutoUpdater(mainWindow: BrowserWindow, portable: boolean): void {
  // Если уже инициализировали — просто обновим ссылку на окно (например, после recreate).
  if (initialized) {
    mainWindowRef = mainWindow
    return
  }

  isPortable = portable
  mainWindowRef = mainWindow
  initialized = true

  // Не показываем диалоги electron-updater — всё через IPC.
  autoUpdater.autoDownload = !isPortable
  autoUpdater.autoInstallOnAppQuit = !isPortable

  // Логируем события в консоль для отладки.
  autoUpdater.logger = console

  // --- События обновления ---

  // Найдена новая версия.
  autoUpdater.on('update-available', (info) => {
    sendToRenderer('updater:update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes ?? ''
    })
  })

  // Нет обновлений.
  autoUpdater.on('update-not-available', () => {
    sendToRenderer('updater:update-not-available')
  })

  // Прогресс скачивания (только для NSIS).
  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('updater:download-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total
    })
  })

  // Обновление скачано и готово к установке.
  autoUpdater.on('update-downloaded', () => {
    sendToRenderer('updater:update-downloaded')
  })

  // Ошибка при проверке/скачивании.
  autoUpdater.on('error', (err) => {
    sendToRenderer('updater:error', err?.message ?? 'Unknown error')
  })

  // Первая проверка при запуске — с задержкой, чтобы окно успело загрузиться.
  setTimeout(() => {
    // В dev (когда приложение не упаковано) electron-updater обычно не работает.
    // Поэтому автопроверку делаем только в packaged режиме.
    if (!app.isPackaged) return

    autoUpdater.checkForUpdates().catch(() => {
      // Сеть может быть недоступна — игнорируем.
    })
  }, 5000)
}
