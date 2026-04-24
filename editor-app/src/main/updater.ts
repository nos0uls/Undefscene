// updater.ts — Автообновление через electron-updater.
// Проверяет GitHub Releases на наличие новой версии.
// Для NSIS-установки — скачивает и устанавливает автоматически.
// Для portable — только уведомляет пользователя (через IPC).

import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain, app } from 'electron'
import * as semver from 'semver'

// Флаг: приложение запущено как portable (нет installer).
// В portable режиме мы НЕ запускаем auto-install, только проверяем наличие обновления.
let isPortable = false
// Сохраняем главное окно, чтобы слать IPC безопасно.
let mainWindowRef: BrowserWindow | null = null
// Один раз регистрируем слушатели autoUpdater и отмечаем инициализацию.
let initialized = false

// Проверяем, что available-версия действительно старше текущей.
function isNewerVersion(available: string, current: string): boolean {
  const a = semver.valid(available)
  const c = semver.valid(current)
  if (!a || !c) {
    console.warn('[updater] Invalid semver, skip comparison:', { available, current })
    return false
  }
  return semver.gt(a, c)
}

// Безопасная отправка события в renderer (если окно есть).
function sendToRenderer(channel: string, payload?: unknown): void {
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

    // Сравниваем semver: только если релиз действительно новее.
    if (!isNewerVersion(nextVersion, currentVersion)) {
      console.log('[updater] No newer version:', nextVersion, '<=', currentVersion)
      return { status: 'none' as const }
    }

    console.log('[updater] New version available:', nextVersion, '(current:', currentVersion + ')')
    return { status: 'available' as const, version: nextVersion }
  } catch (err) {
    return {
      status: 'error' as const,
      message: err instanceof Error ? err.message : 'Unknown error'
    }
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
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false

  // Логируем события в консоль для отладки.
  autoUpdater.logger = console

  // --- События обновления ---

  // Найдена новая версия.
  autoUpdater.on('update-available', (info) => {
    const currentVersion = app.getVersion()
    if (!isNewerVersion(info.version, currentVersion)) {
      console.log('[updater] Ignoring update-available for older/equal version:', info.version, 'vs', currentVersion)
      return
    }
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
