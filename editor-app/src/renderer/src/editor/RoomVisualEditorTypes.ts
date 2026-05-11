// Типы visual editor окна, вынесенные из RoomVisualEditorModal.tsx
// для уменьшения размера основного компонента и повторного использования.

// Описание meta.json, который рядом с PNG тайлами пишет GameMaker screenshot runner.
export type RoomScreenshotMeta = {
  room_name: string
  file_prefix: string
  room_width: number
  room_height: number
  capture_width: number
  capture_height: number
  rows: number
  cols: number
  naming: string
}

// Один загруженный tile, уже пришедший из main процесса как data URL.
export type RoomScreenshotTile = {
  row: number
  col: number
  fileName: string
  dataUrl: string
}

// Полный пакет данных для visual editor окна.
export type RoomScreenshotBundle = {
  roomName: string
  sourceDir: string | null
  searchedDirs: string[]
  cacheKey: string | null
  meta: RoomScreenshotMeta | null
  tiles: RoomScreenshotTile[]
  missingTiles: Array<{ row: number; col: number; fileName: string }>
  warning: string | null
}

// Минимальная информация о выбранной ноде,
// чтобы visual editor понимал, что именно он сейчас будет заменять при import.
export type VisualEditorSelectedNode = {
  id: string
  type: string
  name?: string
  params?: Record<string, unknown>
} | null

// Preview actor marker для overlay на room screenshot.
export type VisualEditorActorPreview = {
  id: string
  key: string
  x: number
  y: number
  spriteOrObject: string
  isVirtual?: boolean
}

// Загруженный sprite preview для actor overlay.
// Здесь уже лежит data URL и реальные размеры/origin из GameMaker sprite.
export type LoadedActorSpritePreview = {
  dataUrl: string
  width: number
  height: number
  xorigin: number
  yorigin: number
  resourceName: string
  resourceKind: 'sprite' | 'object'
}
