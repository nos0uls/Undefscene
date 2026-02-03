export type DockSlotId = 'left' | 'right' | 'bottom'
export type PanelMode = 'docked' | 'floating'

export type Vec2 = { x: number; y: number }
export type Size = { width: number; height: number }

// Это состояние одной панели редактора (окошка).
// Панель может быть прикреплена (docked) или плавать поверх (floating).
export interface PanelState {
  // Уникальный ID панели, чтобы мы могли сохранять/восстанавливать раскладку.
  id: string

  // Заголовок для шапки панели.
  title: string

  // Текущий режим панели.
  mode: PanelMode

  // Если панель docked — в каком слоте она лежит.
  slot: DockSlotId | null

  // Если панель floating — позиция внутри окна приложения (CSS-пиксели).
  position: Vec2 | null

  // Если панель floating — размер панели (CSS-пиксели).
  size: Size | null

  // Порядок “поверх/под” для плавающих окон.
  zIndex: number

  // Эти поля помогают аккуратно возвращать панель назад,
  // когда пользователь снова докает/андокает её.
  lastDockedSlot?: DockSlotId | null
  lastFloatingPosition?: Vec2 | null
  lastFloatingSize?: Size | null
}

// Размеры доков и внутренние сплиты.
export interface DockSizes {
  // Ширина левого дока.
  leftWidth: number

  // Ширина правого дока.
  rightWidth: number

  // Высота нижнего дока.
  bottomHeight: number

  // Сплит внутри левого дока: доля (0..1) для верхней панели (Actions).
  leftSplit: number

  // Сплит внутри правого дока: доля (0..1) для верхней панели (Text).
  rightSplit: number
}

// Полное состояние раскладки (то, что мы будем сохранять в layout.json).
export interface LayoutState {
  schemaVersion: 1

  // Все размеры, которые меняются перетаскиванием сплиттеров.
  dockSizes: DockSizes

  // Какие панели сейчас прикреплены к слотам.
  // left/right содержат 2 панели в порядке сверху вниз.
  // bottom обычно содержит 1 панель.
  docked: {
    left: string[]
    right: string[]
    bottom: string[]
  }

  // Состояние каждой панели по ID.
  panels: Record<string, PanelState>

  // Просто метка времени, чтобы понимать когда мы сохраняли.
  lastSavedAtMs: number
}
