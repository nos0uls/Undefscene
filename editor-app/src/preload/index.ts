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
    save: (filePath: string, jsonString: string): Promise<unknown> =>
      ipcRenderer.invoke('scene.save', filePath, jsonString),
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
    // Возвращаем функцию отписки (cleanup).
    onUpdateAvailable: (cb: (info: { version: string; releaseNotes: string }) => void) => {
      const listener = (_e: any, info: any) => cb(info)
      ipcRenderer.on('updater:update-available', listener)
      return () => ipcRenderer.removeListener('updater:update-available', listener)
    },
    onUpdateNotAvailable: (cb: () => void) => {
      const listener = () => cb()
      ipcRenderer.on('updater:update-not-available', listener)
      return () => ipcRenderer.removeListener('updater:update-not-available', listener)
    },
    onDownloadProgress: (cb: (progress: { percent: number }) => void) => {
      const listener = (_e: any, progress: any) => cb(progress)
      ipcRenderer.on('updater:download-progress', listener)
      return () => ipcRenderer.removeListener('updater:download-progress', listener)
    },
    onUpdateDownloaded: (cb: () => void) => {
      const listener = () => cb()
      ipcRenderer.on('updater:update-downloaded', listener)
      return () => ipcRenderer.removeListener('updater:update-downloaded', listener)
    },
    onError: (cb: (msg: string) => void) => {
      const listener = (_e: any, msg: any) => cb(msg)
      ipcRenderer.on('updater:error', listener)
      return () => ipcRenderer.removeListener('updater:error', listener)
    }
  },
  // Preview v2 сейчас отключён.
  // Возвращаем понятную ошибку, чтобы случайный вызов не ломал приложение.
  preview: {
    getPaths: (): Promise<unknown> => Promise.reject(new Error('Preview disabled')),
    readStatus: (): Promise<unknown> => Promise.reject(new Error('Preview disabled')),
    writeControl: (_control: unknown): Promise<unknown> =>
      Promise.reject(new Error('Preview disabled'))
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
