import type { BrowserWindow } from 'electron'
import { join } from 'path'
import { app } from 'electron'

// Минимальный bridge-state для отдельного native окна Visual Editing.
// Main хранит последний snapshot и маршрутизирует его между окнами через IPC.
export type VisualEditorBridgeState = {
  rooms: string[]
  screenshotRooms: string[]
  projectDir: string | null
  roomScreenshotsDir: string | null
  visualEditorTechMode: boolean
  selectedNode: {
    id: string
    type: string
    name?: string
  } | null
  selectedActorTarget: string | null
  selectedPathPoints: Array<{ x: number; y: number }>
  actorPreviews: Array<{
    id: string
    key: string
    x: number
    y: number
    spriteOrObject: string
    isVirtual?: boolean
  }>
  language: 'en' | 'ru'
}

// Минимальные данные sprite preview для actor overlay в Visual Editing.
// Храним уже готовый data URL и размеры кадра, чтобы renderer ничего не читал с диска.
export type ActorSpritePreview = {
  dataUrl: string
  width: number
  height: number
  xorigin: number
  yorigin: number
  resourceName: string
  resourceKind: 'sprite' | 'object'
}

// Ссылки на главное окно редактора и отдельное окно visual editing.
// Они нужны для focus/open и для обратной доставки import path в EditorShell.
export const appState = {
  mainWindowRef: null as BrowserWindow | null,
  visualEditorWindowRef: null as BrowserWindow | null,
  latestVisualEditorState: null as VisualEditorBridgeState | null
}

const LOG_FILE_NAME = 'undefscene.log'

// Возвращает абсолютный путь к лог-файлу по индексу ротации.
export function getLogPath(index = 0): string {
  const base = join(app.getPath('userData'), LOG_FILE_NAME)
  return index === 0 ? base : `${base}.${index}`
}
