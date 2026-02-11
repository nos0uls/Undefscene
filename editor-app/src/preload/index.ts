import { contextBridge, ipcRenderer } from 'electron'
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
    open: (): Promise<unknown> => ipcRenderer.invoke('project.open')
  },
  // Операции с файлом сцены (New, Open, Save, Save As).
  scene: {
    save: (filePath: string, jsonString: string): Promise<unknown> => ipcRenderer.invoke('scene.save', filePath, jsonString),
    saveAs: (jsonString: string): Promise<unknown> => ipcRenderer.invoke('scene.saveAs', jsonString),
    open: (): Promise<unknown> => ipcRenderer.invoke('scene.open')
  },
  // Чтение настроек движка (whitelists и т.д.) из datafiles/ проекта.
  settings: {
    readEngine: (projectDir: string): Promise<unknown> => ipcRenderer.invoke('settings.readEngine', projectDir)
  },
  // Сканирование .yarn файлов в datafiles/ проекта.
  yarn: {
    scan: (projectDir: string): Promise<unknown> => ipcRenderer.invoke('yarn.scan', projectDir)
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
    onUpdateAvailable: (cb: (info: { version: string; releaseNotes: string }) => void) => {
      ipcRenderer.on('updater:update-available', (_e, info) => cb(info))
    },
    onUpdateNotAvailable: (cb: () => void) => {
      ipcRenderer.on('updater:update-not-available', () => cb())
    },
    onDownloadProgress: (cb: (progress: { percent: number }) => void) => {
      ipcRenderer.on('updater:download-progress', (_e, progress) => cb(progress))
    },
    onUpdateDownloaded: (cb: () => void) => {
      ipcRenderer.on('updater:update-downloaded', () => cb())
    },
    onError: (cb: (msg: string) => void) => {
      ipcRenderer.on('updater:error', (_e, msg) => cb(msg))
    }
  },
  // Preview v2 сейчас отключён.
  // Возвращаем понятную ошибку, чтобы случайный вызов не ломал приложение.
  preview: {
    getPaths: (): Promise<unknown> => Promise.reject(new Error('Preview disabled')),
    readStatus: (): Promise<unknown> => Promise.reject(new Error('Preview disabled')),
    writeControl: (_control: unknown): Promise<unknown> => Promise.reject(new Error('Preview disabled'))
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
