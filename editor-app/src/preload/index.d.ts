import { ElectronAPI } from '@electron-toolkit/preload'

// Тип состояния раскладки.
// Мы описываем его прямо тут, чтобы этот файл не зависел от alias путей
// (иначе `tsc -p tsconfig.node.json` может не собрать проект).
export type DockSlotId = 'left' | 'right' | 'bottom'
export type PanelMode = 'docked' | 'floating' | 'hidden'

export type Vec2 = { x: number; y: number }
export type Size = { width: number; height: number }

export interface PanelState {
  id: string
  title: string
  mode: PanelMode
  slot: DockSlotId | null
  position: Vec2 | null
  size: Size | null
  zIndex: number
  lastDockedSlot?: DockSlotId | null
  lastFloatingPosition?: Vec2 | null
  lastFloatingSize?: Size | null
}

export interface DockSizes {
  leftWidth: number
  rightWidth: number
  bottomHeight: number
  leftSplit: number
  rightSplit: number
}

export interface LayoutState {
  schemaVersion: 1
  dockSizes: DockSizes
  docked: {
    left: string[]
    right: string[]
    bottom: string[]
  }
  panels: Record<string, PanelState>
  lastSavedAtMs: number
}

// API, которое мы отдаём в renderer через preload.
export interface RendererApi {
  layout: {
    // Читает layout.json. Возвращает null, если файла нет.
    read: () => Promise<LayoutState | null>

    // Сохраняет layout.json.
    write: (next: LayoutState) => Promise<void>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: RendererApi
  }
}
