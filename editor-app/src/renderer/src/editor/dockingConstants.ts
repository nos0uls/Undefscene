import type { Size, Vec2 } from './layoutTypes'
import type { DockSizes } from './layoutTypes'

// Состояние активного drag одной панели.
// Панель «прилипает» к курсору и рисуется через ghost-элемент.
export type DragState = {
  // Какая панель сейчас перетаскивается.
  panelId: string

  // Какой pointerId мы захватили (нужно, чтобы не ловить чужие события).
  pointerId: number

  // Размер панели во время перетаскивания.
  // Мы берём его из DOM в момент старта.
  size: Size

  // Смещение курсора относительно левого верхнего угла панели.
  // Нужно, чтобы панель "прилипала" к курсору одинаково.
  grabOffset: Vec2
}

// Высота шапки панели в свёрнутом состоянии.
export const COLLAPSED_HEADER_HEIGHT = 28

// Размер видимой полоски у полностью свёрнутого дока.
// Сам layout схлопывается до этой величины, а расширенный hitbox живёт отдельно.
export const COLLAPSED_DOCK_SIZE = 12

// Виды ресайза, которые поддерживает система docking.
export type ResizeKind =
  | 'dock-left'
  | 'dock-right'
  | 'dock-bottom'
  | 'split-left'
  | 'split-right'
  | 'float-n'
  | 'float-s'
  | 'float-e'
  | 'float-w'
  | 'float-ne'
  | 'float-nw'
  | 'float-se'
  | 'float-sw'

// Состояние drag при ресайзе дока или floating-панели.
export type ResizeDragState = {
  // Какой тип ресайза мы делаем.
  kind: ResizeKind

  // ID pointer, чтобы не ловить чужие события.
  pointerId: number

  // Стартовая позиция курсора.
  startX: number
  startY: number

  // Запоминаем размеры доков в момент старта.
  startDockSizes: DockSizes

  // Для floating ресайза нам нужен ID панели и её стартовый размер.
  panelId?: string
  startPanelPosition?: Vec2 | null
  startPanelSize?: Size | null
}

// Минимальные размеры, чтобы UI не "схлопывался".
export const MIN_LEFT_WIDTH = 220
export const MIN_RIGHT_WIDTH = 260
export const MIN_BOTTOM_HEIGHT = 140
export const MIN_CENTER_WIDTH = 360
export const MIN_CENTER_HEIGHT = 220
export const MIN_FLOAT_WIDTH = 240
export const MIN_FLOAT_HEIGHT = 80
