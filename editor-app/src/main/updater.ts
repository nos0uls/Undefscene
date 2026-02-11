// updater.ts — Автообновление через electron-updater.
// Проверяет GitHub Releases на наличие новой версии.
// Для NSIS-установки — скачивает и устанавливает автоматически.
// Для portable — только уведомляет пользователя (через IPC).

import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'

// Флаг: приложение запущено как portable (нет installer).
// В portable режиме мы НЕ запускаем auto-install, только проверяем наличие обновления.
let isPortable = false

// Инициализация автообновления.
// Вызывается один раз после создания главного окна.
export function initAutoUpdater(mainWindow: BrowserWindow, portable: boolean): void {
  isPortable = portable

  // Не показываем диалоги electron-updater — всё через IPC.
  autoUpdater.autoDownload = !isPortable
  autoUpdater.autoInstallOnAppQuit = !isPortable

  // Логируем события в консоль для отладки.
  autoUpdater.logger = console

  // --- События обновления ---

  // Найдена новая версия.
  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('updater:update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes ?? ''
    })
  })

  // Нет обновлений.
  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('updater:update-not-available')
  })

  // Прогресс скачивания (только для NSIS).
  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('updater:download-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total
    })
  })

  // Обновление скачано и готово к установке.
  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('updater:update-downloaded')
  })

  // Ошибка при проверке/скачивании.
  autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('updater:error', err?.message ?? 'Unknown error')
  })

  // --- IPC от renderer ---

  // Ручная проверка обновлений (например, из меню Help → Check for Updates).
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return result?.updateInfo?.version ?? null
    } catch {
      return null
    }
  })

  // Установить скачанное обновление (перезапуск приложения).
  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  // Первая проверка при запуске — с задержкой, чтобы окно успело загрузиться.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // Сеть может быть недоступна — игнорируем.
    })
  }, 5000)
}
