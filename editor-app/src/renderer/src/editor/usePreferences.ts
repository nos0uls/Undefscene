// usePreferences.ts — Хук для персистентных настроек редактора.
// Читает/пишет preferences.json через IPC (аналогично layout.json).
// Настройки сохраняются в userData и восстанавливаются при запуске.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

// Тип акцентного цвета: пресет или кастомный HEX.
export type AccentColorId =
  | 'purple'
  | 'cyan'
  | 'blue'
  | 'green'
  | 'orange'
  | 'red'
  | 'pink'
  | 'yellow'
  | 'custom'

// ID действий, для которых мы храним клавиатурные сочетания.
export type HotkeyActionId =
  | 'undo'
  | 'redo'
  | 'save'
  | 'new_scene'
  | 'export_scene'
  | 'toggle_inspector'
  | 'focus_left_dock'
  | 'focus_right_dock'
  | 'focus_bottom_dock'
  | 'toggle_all_dock_panels'
  | 'fit_view'
  | 'zen_mode'

// Словарь hotkeys: action id -> строка combo.
export type EditorKeybindings = Record<HotkeyActionId, string>

// Порядок действий нужен в UI настроек,
// чтобы список сочетаний всегда был стабильным и предсказуемым.
export const HOTKEY_ACTION_IDS: HotkeyActionId[] = [
  'undo',
  'redo',
  'save',
  'new_scene',
  'export_scene',
  'toggle_inspector',
  'focus_left_dock',
  'focus_right_dock',
  'focus_bottom_dock',
  'toggle_all_dock_panels',
  'fit_view',
  'zen_mode'
]

// Дефолтные сочетания держим отдельной константой,
// чтобы и parser, и меню, и rebinding UI читали один источник правды.
export const DEFAULT_KEYBINDINGS: EditorKeybindings = {
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Y',
  save: 'Ctrl+S',
  new_scene: 'Ctrl+N',
  export_scene: 'Ctrl+E',
  toggle_inspector: 'Ctrl+Shift+I',
  focus_left_dock: 'Ctrl+1',
  focus_right_dock: 'Ctrl+2',
  focus_bottom_dock: 'Ctrl+3',
  toggle_all_dock_panels: 'Ctrl+Alt+D',
  fit_view: 'Space',
  zen_mode: import.meta.env.DEV ? 'F11' : 'F12'
}

// Полный набор настроек редактора.
export interface EditorPreferences {
  // Версия схемы (для миграций).
  schemaVersion: 1

  // --- Appearance ---
  // Тема (сохраняется отдельно через useTheme/localStorage, но дублируем для полноты).
  // theme хранится в localStorage через useTheme — тут не трогаем.

  // Акцентный цвет: пресет или кастомный HEX.
  accentColor: AccentColorId

  // Если accentColor === 'custom', этот HEX используется.
  customAccentHex: string

  // --- Canvas ---
  // Размер сетки на холсте.
  gridSize: number

  // Показывать ли мини-карту.
  showMiniMap: boolean

  // Множитель скорости зума (1.0 = стандартный, 2.0 = быстрее).
  zoomSpeed: number

  // Показывать ли предпросмотр целевого места при перетаскивании панелей в доки.
  showDockDropPreview: boolean

  // Путь к кастомному фону холста (null = без фона).
  canvasBackgroundPath: string | null

  // Как показывать фон: 'stretch' = растянуть, 'cover' = обрезать.
  canvasBackgroundMode: 'stretch' | 'cover'

  // К чему привязываем фон:
  // - canvas = фон живёт в области canvas
  // - viewport = фон закреплён на весь экран редактора
  canvasBackgroundAttachment: 'canvas' | 'viewport'

  // Прозрачность кастомного фона на canvas.
  // 0 = полностью прозрачно, 1 = полностью видно.
  canvasBackgroundOpacity: number

  // --- Editor ---
  // Автосохранение включено.
  autoSaveEnabled: boolean

  // Интервал автосохранения (в минутах).
  autoSaveIntervalMinutes: number

  // Отключить hardware acceleration на следующем запуске приложения.
  // Меняется в Preferences, но реально применяется только после restart.
  disableHardwareAcceleration: boolean

  // Необязательный override для папки, где editor ищет PNG/meta от screenshot runner.
  // Это полезно, когда GameMaker пишет output не рядом с .yyp, а в Local/AppData или в другой внешний каталог.
  screenshotOutputDir: string | null

  // Технический режим для Visual Editing.
  // В нём показываются debug-поля вроде source/search dirs и прочая служебная информация.
  visualEditorTechMode: boolean

  visualEditorShowGrid: boolean

  visualEditorSnapToGrid: boolean

  // Смещение snap-сетки Visual Editing по X.
  // Это помогает подогнать path grid под реальную геометрию комнаты.
  visualEditorGridOffsetX: number

  // Смещение snap-сетки Visual Editing по Y.
  // Храним отдельно, чтобы можно было точно выставить вертикальную фазу сетки.
  visualEditorGridOffsetY: number

  // Liquid Glass mode: включает эффект матового стекла и динамическую прозрачность
  // для узлов графа и визуального редактора (blur, blending).
  liquidGlassEnabled: boolean

  // Сила размытия Liquid Glass (0.0 - 1.0 -> 0px - 20px).
  liquidGlassBlur: number

  // Множитель визуального размера path line и path points внутри Visual Editing.
  // На сами world-space координаты пути он не влияет — меняется только отображение.
  visualEditorPathSizeMultiplier: number

  // Сохранённые сочетания клавиш.
  // Сейчас используются как foundation и readonly-список в Preferences.
  keybindings: EditorKeybindings

  // Показывать имя ноды на холсте (true = name, false = только тип).
  showNodeNameOnCanvas: boolean

  // Режим портов у parallel:
  // shared = один общий порт визуально,
  // separate = отдельный порт на каждую ветку.
  parallelBranchPortMode: 'shared' | 'separate'

  // Язык интерфейса (пока только en, ru — заглушка на будущее).
  language: 'en' | 'ru'

  // --- Onboarding ---
  // Завершил ли пользователь начальную настройку (язык, тема).
  hasCompletedInitialSetup: boolean

  // Завершил ли пользователь интерактивное обучение.
  hasCompletedTutorial: boolean
}

// Настройки по умолчанию.
export const DEFAULT_PREFERENCES: EditorPreferences = {
  schemaVersion: 1,
  accentColor: 'purple',
  customAccentHex: '#5e6ad2',
  gridSize: 18,
  showMiniMap: true,
  zoomSpeed: 1.5,
  showDockDropPreview: true,
  canvasBackgroundPath: null,
  canvasBackgroundMode: 'cover',
  canvasBackgroundAttachment: 'canvas',
  canvasBackgroundOpacity: 0.42,
  autoSaveEnabled: true,
  autoSaveIntervalMinutes: 10,
  disableHardwareAcceleration: false,
  screenshotOutputDir: null,
  visualEditorTechMode: false,
  visualEditorShowGrid: true,
  visualEditorSnapToGrid: true,
  visualEditorGridOffsetX: 0,
  visualEditorGridOffsetY: 0,
  liquidGlassEnabled: false,
  liquidGlassBlur: 0.4,
  visualEditorPathSizeMultiplier: 1,
  keybindings: DEFAULT_KEYBINDINGS,
  showNodeNameOnCanvas: true,
  parallelBranchPortMode: 'shared',
  language: 'en',
  hasCompletedInitialSetup: false,
  hasCompletedTutorial: false
}

// Проверяет, что объект похож на EditorPreferences.
// Если данные некорректные — возвращает null.
function parsePreferences(raw: unknown): EditorPreferences | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (c.schemaVersion !== 1) return null

  // Собираем с fallback на дефолтные значения.
  return {
    schemaVersion: 1,
    accentColor:
      typeof c.accentColor === 'string' && isValidAccentColor(c.accentColor)
        ? c.accentColor
        : DEFAULT_PREFERENCES.accentColor,
    customAccentHex:
      typeof c.customAccentHex === 'string'
        ? c.customAccentHex
        : DEFAULT_PREFERENCES.customAccentHex,
    gridSize:
      typeof c.gridSize === 'number' && c.gridSize >= 8 && c.gridSize <= 64
        ? c.gridSize
        : DEFAULT_PREFERENCES.gridSize,
    showMiniMap:
      typeof c.showMiniMap === 'boolean' ? c.showMiniMap : DEFAULT_PREFERENCES.showMiniMap,
    zoomSpeed:
      typeof c.zoomSpeed === 'number' && c.zoomSpeed >= 0.5 && c.zoomSpeed <= 5
        ? c.zoomSpeed
        : DEFAULT_PREFERENCES.zoomSpeed,
    showDockDropPreview:
      typeof c.showDockDropPreview === 'boolean'
        ? c.showDockDropPreview
        : DEFAULT_PREFERENCES.showDockDropPreview,
    canvasBackgroundPath:
      typeof c.canvasBackgroundPath === 'string' ? c.canvasBackgroundPath : null,
    canvasBackgroundMode:
      c.canvasBackgroundMode === 'stretch' || c.canvasBackgroundMode === 'cover'
        ? c.canvasBackgroundMode
        : DEFAULT_PREFERENCES.canvasBackgroundMode,
    canvasBackgroundAttachment:
      c.canvasBackgroundAttachment === 'canvas' || c.canvasBackgroundAttachment === 'viewport'
        ? c.canvasBackgroundAttachment
        : DEFAULT_PREFERENCES.canvasBackgroundAttachment,
    canvasBackgroundOpacity:
      typeof c.canvasBackgroundOpacity === 'number' &&
      c.canvasBackgroundOpacity >= 0 &&
      c.canvasBackgroundOpacity <= 1
        ? c.canvasBackgroundOpacity
        : DEFAULT_PREFERENCES.canvasBackgroundOpacity,
    autoSaveEnabled:
      typeof c.autoSaveEnabled === 'boolean'
        ? c.autoSaveEnabled
        : DEFAULT_PREFERENCES.autoSaveEnabled,
    autoSaveIntervalMinutes:
      typeof c.autoSaveIntervalMinutes === 'number' &&
      c.autoSaveIntervalMinutes >= 1 &&
      c.autoSaveIntervalMinutes <= 120
        ? c.autoSaveIntervalMinutes
        : DEFAULT_PREFERENCES.autoSaveIntervalMinutes,
    disableHardwareAcceleration:
      typeof c.disableHardwareAcceleration === 'boolean'
        ? c.disableHardwareAcceleration
        : DEFAULT_PREFERENCES.disableHardwareAcceleration,
    screenshotOutputDir:
      typeof c.screenshotOutputDir === 'string' ? c.screenshotOutputDir : null,
    visualEditorTechMode:
      typeof c.visualEditorTechMode === 'boolean'
        ? c.visualEditorTechMode
        : DEFAULT_PREFERENCES.visualEditorTechMode,
    visualEditorShowGrid:
      typeof c.visualEditorShowGrid === 'boolean'
        ? c.visualEditorShowGrid
        : DEFAULT_PREFERENCES.visualEditorShowGrid,
    visualEditorSnapToGrid:
      typeof c.visualEditorSnapToGrid === 'boolean'
        ? c.visualEditorSnapToGrid
        : DEFAULT_PREFERENCES.visualEditorSnapToGrid,
    visualEditorGridOffsetX:
      typeof c.visualEditorGridOffsetX === 'number' && c.visualEditorGridOffsetX >= -200 && c.visualEditorGridOffsetX <= 200
        ? Math.round(c.visualEditorGridOffsetX)
        : DEFAULT_PREFERENCES.visualEditorGridOffsetX,
    visualEditorGridOffsetY:
      typeof c.visualEditorGridOffsetY === 'number' && c.visualEditorGridOffsetY >= -200 && c.visualEditorGridOffsetY <= 200
        ? Math.round(c.visualEditorGridOffsetY)
        : DEFAULT_PREFERENCES.visualEditorGridOffsetY,
    liquidGlassEnabled:
      typeof c.liquidGlassEnabled === 'boolean'
        ? c.liquidGlassEnabled
        : (typeof c.visualEditorTrueRtx === 'boolean' ? c.visualEditorTrueRtx : DEFAULT_PREFERENCES.liquidGlassEnabled),
    liquidGlassBlur:
      typeof c.liquidGlassBlur === 'number' &&
      c.liquidGlassBlur >= 0 &&
      c.liquidGlassBlur <= 1
        ? Number(c.liquidGlassBlur.toFixed(2))
        : (typeof c.liquidGlassOpacity === 'number' ? 0.4 : DEFAULT_PREFERENCES.liquidGlassBlur),
    visualEditorPathSizeMultiplier:
      typeof c.visualEditorPathSizeMultiplier === 'number' &&
      c.visualEditorPathSizeMultiplier >= 0.5 &&
      c.visualEditorPathSizeMultiplier <= 4
        ? Number(c.visualEditorPathSizeMultiplier.toFixed(2))
        : DEFAULT_PREFERENCES.visualEditorPathSizeMultiplier,
    keybindings: parseKeybindings(c.keybindings),
    showNodeNameOnCanvas:
      typeof c.showNodeNameOnCanvas === 'boolean'
        ? c.showNodeNameOnCanvas
        : DEFAULT_PREFERENCES.showNodeNameOnCanvas,
    parallelBranchPortMode:
      c.parallelBranchPortMode === 'shared' || c.parallelBranchPortMode === 'separate'
        ? c.parallelBranchPortMode
        : DEFAULT_PREFERENCES.parallelBranchPortMode,
    language: c.language === 'en' || c.language === 'ru' ? c.language : DEFAULT_PREFERENCES.language,
    hasCompletedInitialSetup:
      typeof c.hasCompletedInitialSetup === 'boolean'
        ? c.hasCompletedInitialSetup
        : DEFAULT_PREFERENCES.hasCompletedInitialSetup,
    hasCompletedTutorial:
      typeof c.hasCompletedTutorial === 'boolean'
        ? c.hasCompletedTutorial
        : DEFAULT_PREFERENCES.hasCompletedTutorial
  }
}

// Проверяет, что строка — валидный AccentColorId.
function isValidAccentColor(value: string): value is AccentColorId {
  return [
    'purple',
    'cyan',
    'blue',
    'green',
    'orange',
    'red',
    'pink',
    'yellow',
    'custom'
  ].includes(value)
}

// Собираем keybindings с fallback на дефолтные значения.
// Это позволяет добавлять новые action id без поломки старого preferences.json.
function parseKeybindings(raw: unknown): EditorKeybindings {
  const defaults = DEFAULT_KEYBINDINGS
  if (!raw || typeof raw !== 'object') {
    return { ...defaults }
  }

  const candidate = raw as Partial<Record<HotkeyActionId, unknown>>
  return {
    undo: typeof candidate.undo === 'string' ? candidate.undo : defaults.undo,
    redo: typeof candidate.redo === 'string' ? candidate.redo : defaults.redo,
    save: typeof candidate.save === 'string' ? candidate.save : defaults.save,
    new_scene:
      typeof candidate.new_scene === 'string' ? candidate.new_scene : defaults.new_scene,
    export_scene:
      typeof candidate.export_scene === 'string' ? candidate.export_scene : defaults.export_scene,
    toggle_inspector:
      typeof candidate.toggle_inspector === 'string'
        ? candidate.toggle_inspector
        : defaults.toggle_inspector,
    focus_left_dock:
      typeof candidate.focus_left_dock === 'string'
        ? candidate.focus_left_dock
        : defaults.focus_left_dock,
    focus_right_dock:
      typeof candidate.focus_right_dock === 'string'
        ? candidate.focus_right_dock
        : defaults.focus_right_dock,
    focus_bottom_dock:
      typeof candidate.focus_bottom_dock === 'string'
        ? candidate.focus_bottom_dock
        : defaults.focus_bottom_dock,
    toggle_all_dock_panels:
      typeof candidate.toggle_all_dock_panels === 'string'
        ? candidate.toggle_all_dock_panels
        : defaults.toggle_all_dock_panels,
    fit_view: typeof candidate.fit_view === 'string' ? candidate.fit_view : defaults.fit_view,
    zen_mode: typeof candidate.zen_mode === 'string' ? candidate.zen_mode : defaults.zen_mode
  }
}

// Возвращает реальный HEX акцентного цвета для CSS-переменных.
// Этот helper нужен в одном месте, чтобы modal и shell не расходились по логике.
export function getAccentColorHex(preferences: Pick<EditorPreferences, 'accentColor' | 'customAccentHex'>): string {
  if (preferences.accentColor === 'custom') {
    return preferences.customAccentHex
  }

  const presetMap: Record<Exclude<AccentColorId, 'custom'>, string> = {
    purple: '#5e6ad2',
    cyan: '#00c8ff',
    blue: '#4a8fd9',
    green: '#3cb371',
    orange: '#e6a020',
    red: '#d9534f',
    pink: '#d94a8c',
    yellow: '#e6c820'
  }

  return presetMap[preferences.accentColor]
}

// Небольшой helper для hover/pressed оттенков акцента.
// Держим его рядом с preferences, чтобы все окна редактора считали цвет одинаково.
function adjustAccentBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(2.55 * percent)))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(2.55 * percent)))
  const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(2.55 * percent)))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

// Собирает полный набор CSS variables для accent color.
// Это нужно, чтобы и основное окно, и standalone Visual Editor не расходились по палитре.
export function getAccentCssVariables(
  preferences: Pick<EditorPreferences, 'accentColor' | 'customAccentHex'>
): Record<string, string> {
  const hex = getAccentColorHex(preferences)
  return {
    '--accent-default': hex,
    '--accent-hover': adjustAccentBrightness(hex, 15),
    '--accent-pressed': adjustAccentBrightness(hex, -10),
    '--accent-muted': `${hex}26`,
    '--focus-ring': hex,
    '--ev-c-accent': hex,
    '--ev-c-accent-soft': `${hex}26`,
    '--ev-c-accent-hover': adjustAccentBrightness(hex, 15)
  }
}

// Возвращаемый тип хука.
export interface UsePreferencesReturn {
  // Текущие настройки.
  preferences: EditorPreferences

  // Обновить одно или несколько полей настроек.
  updatePreferences: (patch: Partial<EditorPreferences>) => void

  // Флаг: настройки уже загружены из файла.
  loaded: boolean
}

// Хук для управления персистентными настройками.
export function usePreferences(): UsePreferencesReturn {
  const defaults = useMemo(() => ({ ...DEFAULT_PREFERENCES }), [])
  const [preferences, setPreferences] = useState<EditorPreferences>(defaults)
  const [loaded, setLoaded] = useState(false)

  // Флаг: не записывать настройки до первой загрузки.
  const didLoadRef = useRef(false)

  // Загрузка настроек при монтировании.
  useEffect(() => {
    if (!window.api?.preferences) {
      // Не в Electron — используем дефолт.
      didLoadRef.current = true
      setLoaded(true)
      return
    }

    let cancelled = false

    window.api.preferences
      .read()
      .then((raw) => {
        if (cancelled) return
        const parsed = parsePreferences(raw)
        if (parsed) {
          setPreferences(parsed)
        }
        didLoadRef.current = true
        setLoaded(true)
      })
      .catch((err) => {
        console.warn('Failed to read preferences.json:', err)
        didLoadRef.current = true
        setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Автосохранение при изменении настроек (с debounce 300ms).
  useEffect(() => {
    if (!didLoadRef.current || !window.api?.preferences) return

    const timer = window.setTimeout(() => {
      window.api.preferences.write(preferences).catch((err) => {
        console.warn('Failed to write preferences.json:', err)
      })
    }, 300)

    return () => window.clearTimeout(timer)
  }, [preferences])

  // Обновляет одно или несколько полей, сохраняя остальные.
  const updatePreferences = useCallback((patch: Partial<EditorPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...patch }))
  }, [])

  return { preferences, updatePreferences, loaded }
}
