import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Кастомные API для renderer.
// Важно: renderer не должен напрямую иметь доступ к Node.js/fs.
// Поэтому чтение/запись layout.json и runtime.json делаем через IPC.
const api = {
  layout: {
    // Читаем layout.json (main решает где он лежит).
    read: (): Promise<unknown> => ipcRenderer.invoke('layout.read'),

    // Пишем layout.json атомарно (main сделает temp → rename).
    write: (next: unknown): Promise<unknown> => ipcRenderer.invoke('layout.write', next)
  },
  runtime: {
    // Читаем runtime.json (main решает где он лежит).
    read: (): Promise<unknown> => ipcRenderer.invoke('runtime.read'),

    // Пишем runtime.json атомарно (main сделает temp → rename).
    write: (next: unknown): Promise<unknown> => ipcRenderer.invoke('runtime.write', next)
  },
  // Работа с GameMaker проектом (.yyp).
  project: {
    // Открываем .yyp через main процесс.
    open: (): Promise<unknown> => ipcRenderer.invoke('project.open'),
    restoreLast: (): Promise<unknown> => ipcRenderer.invoke('project.restoreLast'),

    // Получаем только те комнаты, для которых main уже нашёл screenshot bundle.
    availableScreenshotRooms: (
      projectDir: string,
      roomNames: string[],
      roomScreenshotsDir?: string | null
    ): Promise<unknown> =>
      ipcRenderer.invoke('project.availableScreenshotRooms', projectDir, roomNames, roomScreenshotsDir),

    // Читаем stitched room screenshot bundle для visual editing окна.
    // Main сам загружает meta.json и PNG tiles, а renderer получает уже безопасный payload.
    readRoomScreenshotBundle: (
      projectDir: string,
      roomName: string,
      roomScreenshotsDir?: string | null
    ): Promise<unknown> =>
      ipcRenderer.invoke('project.readRoomScreenshotBundle', projectDir, roomName, roomScreenshotsDir),

    // Читаем первый frame actor sprite preview.
    // Main сам резолвит object -> sprite и возвращает уже готовый data URL.
    readActorSpritePreview: (projectDir: string, spriteOrObject: string): Promise<unknown> =>
      ipcRenderer.invoke('project.readActorSpritePreview', projectDir, spriteOrObject)
  },
  // Операции с файлом сцены (New, Open, Save, Save As).
  scene: {
    save: (filePath: string, jsonString: string): Promise<unknown> =>
      ipcRenderer.invoke('scene.save', filePath, jsonString),
    autosave: (filePath: string | null, jsonString: string, backupCount: number): Promise<unknown> =>
      ipcRenderer.invoke('scene.autosave', { filePath, jsonString, backupCount }),
    saveAs: (jsonString: string): Promise<unknown> =>
      ipcRenderer.invoke('scene.saveAs', jsonString),
    open: (): Promise<unknown> => ipcRenderer.invoke('scene.open')
  },
  // Чтение настроек движка (whitelists и т.д.) из datafiles/ проекта.
  settings: {
    readEngine: (projectDir: string): Promise<unknown> =>
      ipcRenderer.invoke('settings.readEngine', projectDir)
  },
  // Сканирование .yarn файлов в datafiles/ проекта.
  yarn: {
    scan: (projectDir: string): Promise<unknown> => ipcRenderer.invoke('yarn.scan', projectDir),
    readFile: (projectDir: string, fileName: string): Promise<unknown> =>
      ipcRenderer.invoke('yarn.readFile', projectDir, fileName)
  },
  // Экспорт катсцены в JSON-файл для движка.
  export: {
    save: (jsonString: string): Promise<unknown> => ipcRenderer.invoke('export.save', jsonString)
  },
  // Автообновление: проверка, установка, подписка на события.
  updater: {
    check: (): Promise<unknown> => ipcRenderer.invoke('updater:check'),
    install: (): Promise<unknown> => ipcRenderer.invoke('updater:install'),
    // Подписка на события обновления от main процесса.
    // Возвращаем функцию отписки (cleanup).
    onUpdateAvailable: (
      cb: (info: { version: string; releaseNotes: string }) => void
    ): (() => void) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        info: { version: string; releaseNotes: string }
      ): void => cb(info)
      ipcRenderer.on('updater:update-available', listener)
      return (): void => {
        ipcRenderer.removeListener('updater:update-available', listener)
      }
    },
    onUpdateNotAvailable: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('updater:update-not-available', listener)
      return (): void => {
        ipcRenderer.removeListener('updater:update-not-available', listener)
      }
    },
    onDownloadProgress: (cb: (progress: { percent: number }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, progress: { percent: number }): void =>
        cb(progress)
      ipcRenderer.on('updater:download-progress', listener)
      return (): void => {
        ipcRenderer.removeListener('updater:download-progress', listener)
      }
    },
    onUpdateDownloaded: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('updater:update-downloaded', listener)
      return (): void => {
        ipcRenderer.removeListener('updater:update-downloaded', listener)
      }
    },
    onError: (cb: (msg: string) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, msg: string): void => cb(msg)
      ipcRenderer.on('updater:error', listener)
      return (): void => {
        ipcRenderer.removeListener('updater:error', listener)
      }
    }
  },
  // Preview v2 сейчас отключён.
  // Возвращаем понятную ошибку, чтобы случайный вызов не ломал приложение.
  preview: {
    getPaths: (): Promise<unknown> => Promise.reject(new Error('Preview disabled')),
    readStatus: (): Promise<unknown> => Promise.reject(new Error('Preview disabled')),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    writeControl: (_control: unknown): Promise<unknown> =>
      Promise.reject(new Error('Preview disabled'))
  },
  // Персистентные настройки редактора (preferences.json).
  preferences: {
    read: (): Promise<unknown> => ipcRenderer.invoke('preferences.read'),
    write: (next: unknown): Promise<unknown> => ipcRenderer.invoke('preferences.write', next),
    chooseScreenshotOutputDir: (): Promise<unknown> =>
      ipcRenderer.invoke('preferences.chooseScreenshotOutputDir'),
    chooseCanvasBackground: (): Promise<unknown> =>
      ipcRenderer.invoke('preferences.chooseCanvasBackground'),
    readCanvasBackgroundDataUrl: (filePath: string): Promise<unknown> =>
      ipcRenderer.invoke('preferences.readCanvasBackgroundDataUrl', filePath)
  },
  // Базовая информация о приложении для About modal и внешних ссылок.
  visualEditor: {
    // Открываем отдельное native окно visual editor и передаём туда snapshot состояния.
    open: (next: unknown): Promise<unknown> => ipcRenderer.invoke('visualEditor.open', next),
    // Обновляем state snapshot без повторного открытия окна.
    syncState: (next: unknown): Promise<unknown> => ipcRenderer.invoke('visualEditor.syncState', next),
    // Отдаём последнюю bridge-state standalone renderer-окну.
    getState: (): Promise<unknown> => ipcRenderer.invoke('visualEditor.getState'),
    // Возвращаем path обратно в главное окно редактора.
    importPath: (points: unknown): Promise<unknown> => ipcRenderer.invoke('visualEditor.importPath', points),
    // Возвращаем actor marker positions обратно в главное окно редактора.
    importActors: (actors: unknown): Promise<unknown> => ipcRenderer.invoke('visualEditor.importActors', actors),
    // Закрываем отдельное окно по запросу renderer.
    close: (): Promise<unknown> => ipcRenderer.invoke('visualEditor.close'),
    // Подписка на обновление state snapshot из main процесса.
    onStateUpdated: (cb: (state: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: unknown): void => cb(state)
      ipcRenderer.on('visualEditor.stateUpdated', listener)
      return (): void => {
        ipcRenderer.removeListener('visualEditor.stateUpdated', listener)
      }
    },
    // Подписка на import path из отдельного окна обратно в EditorShell.
    onImportPath: (cb: (points: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, points: unknown): void => cb(points)
      ipcRenderer.on('visualEditor.importPath', listener)
      return (): void => {
        ipcRenderer.removeListener('visualEditor.importPath', listener)
      }
    },
    // Подписка на import actor positions из отдельного окна обратно в EditorShell.
    onImportActors: (cb: (actors: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, actors: unknown): void => cb(actors)
      ipcRenderer.on('visualEditor.importActors', listener)
      return (): void => {
        ipcRenderer.removeListener('visualEditor.importActors', listener)
      }
    },
    // Сигнал, что отдельное окно закрыто.
    onWindowClosed: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('visualEditor.windowClosed', listener)
      return (): void => {
        ipcRenderer.removeListener('visualEditor.windowClosed', listener)
      }
    }
  },
  appInfo: {
    getVersion: (): Promise<unknown> => ipcRenderer.invoke('app.getVersion'),
    openExternal: (url: string): Promise<unknown> => ipcRenderer.invoke('app.openExternal', url),
    openDevTools: (): Promise<unknown> => ipcRenderer.invoke('app.openDevTools'),
    copyLogToClipboard: (): Promise<unknown> => ipcRenderer.invoke('app.copyLogToClipboard'),
    setZoomFactor: (factor: number): void => webFrame.setZoomFactor(factor)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
