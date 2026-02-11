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

// Типы runtime.json, чтобы renderer мог использовать API без alias путей.
export type RuntimeNode = {
  id: string
  type: string
  text?: string
  // Позиция ноды на холсте.
  position?: { x: number; y: number }
  // Параметры ноды (seconds, target, x, y и т.д.).
  params?: Record<string, unknown>
}

// Связь между двумя нодами на холсте.
export type RuntimeEdge = {
  id: string
  source: string
  // ID handle на source (нужно для multi-выходов: branch/parallel).
  sourceHandle?: string
  target: string
  // ID handle на target (нужно для multi-входов: parallel join).
  targetHandle?: string
  // Пауза на линии (в секундах). Это заменяет отдельную wait-ноду.
  waitSeconds?: number
}

export interface RuntimeState {
  schemaVersion: 1
  title: string
  nodes: RuntimeNode[]
  edges: RuntimeEdge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  lastSavedAtMs: number
}

// Ресурсы из .yyp (для autocomplete и проверки).
export type ProjectResources = {
  yypPath: string
  projectDir: string
  sprites: string[]
  objects: string[]
  sounds: string[]
  rooms: string[]
}

// Информация о .yarn файле: имя файла и список нод внутри.
export type YarnFileInfo = {
  file: string
  nodes: string[]
}

// Настройки движка катсцен (из cutscene_engine_settings.json).
export type EngineSettings = {
  found: boolean
  defaultFps: number
  strictMode: boolean
  defaultActorObject: string
  branchConditions: string[]
  runFunctions: string[]
}

// API, которое мы отдаём в renderer через preload.
export interface RendererApi {
  layout: {
    // Читает layout.json. Возвращает null, если файла нет.
    read: () => Promise<LayoutState | null>

    // Сохраняет layout.json.
    write: (next: LayoutState) => Promise<void>
  }
  runtime: {
    // Читает runtime.json. Возвращает null, если файла нет.
    read: () => Promise<RuntimeState | null>

    // Сохраняет runtime.json.
    write: (next: RuntimeState) => Promise<void>
  }

  // Работа с GameMaker проектом (.yyp).
  project: {
    // Открывает .yyp и возвращает список ресурсов.
    open: () => Promise<ProjectResources | null>
  }

  // Операции с файлом сцены (Open, Save, Save As).
  scene: {
    save: (filePath: string, jsonString: string) => Promise<{ saved: boolean; filePath: string }>
    saveAs: (jsonString: string) => Promise<{ saved: boolean; filePath?: string }>
    open: () => Promise<{ filePath: string; content: string } | null>
  }

  // Чтение настроек движка (whitelists) из datafiles/ проекта.
  settings: {
    readEngine: (projectDir: string) => Promise<EngineSettings>
  }

  // Сканирование .yarn файлов в datafiles/ проекта.
  yarn: {
    scan: (projectDir: string) => Promise<YarnFileInfo[]>
  }

  // Экспорт катсцены в JSON-файл для движка.
  export: {
    save: (jsonString: string) => Promise<{ saved: boolean; filePath?: string }>
  }

  // Автообновление: проверка, установка, подписка на события.
  updater: {
    check: () => Promise<string | null>
    install: () => Promise<void>
    onUpdateAvailable: (cb: (info: { version: string; releaseNotes: string }) => void) => void
    onUpdateNotAvailable: (cb: () => void) => void
    onDownloadProgress: (cb: (progress: { percent: number }) => void) => void
    onUpdateDownloaded: (cb: () => void) => void
    onError: (cb: (msg: string) => void) => void
  }

  // Preview v2 (сейчас отключён). Оставляем API-заглушку, чтобы сборка не падала.
  preview: {
    getPaths: () => Promise<unknown>
    readStatus: () => Promise<unknown>
    writeControl: (control: unknown) => Promise<unknown>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: RendererApi
  }
}
