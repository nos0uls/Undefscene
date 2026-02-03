import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Кастомные API для renderer.
// Важно: renderer не должен напрямую иметь доступ к Node.js/fs.
// Поэтому чтение/запись layout.json делаем через IPC.
const api = {
  layout: {
    // Читаем layout.json (main решает где он лежит).
    read: (): Promise<unknown> => ipcRenderer.invoke('layout.read'),

    // Пишем layout.json атомарно (main сделает temp → rename).
    write: (next: unknown): Promise<unknown> => ipcRenderer.invoke('layout.write', next)
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
