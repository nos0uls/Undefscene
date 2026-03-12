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

  // --- Editor ---
  // Автосохранение включено.
  autoSaveEnabled: boolean

  // Интервал автосохранения (в минутах).
  autoSaveIntervalMinutes: number

  // Показывать имя ноды на холсте (true = name, false = только тип).
  showNodeNameOnCanvas: boolean

  // Режим портов у parallel:
  // shared = один общий порт визуально,
  // separate = отдельный порт на каждую ветку.
  parallelBranchPortMode: 'shared' | 'separate'

  // Язык интерфейса (пока только en, ru — заглушка на будущее).
  language: 'en' | 'ru'
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
  autoSaveEnabled: true,
  autoSaveIntervalMinutes: 10,
  showNodeNameOnCanvas: true,
  parallelBranchPortMode: 'shared',
  language: 'en'
}

// Проверяет, что объект похож на EditorPreferences.
// Если данные некорректные — возвращает null.
function parsePreferences(raw: unknown): EditorPreferences | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Partial<EditorPreferences>
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
    showNodeNameOnCanvas:
      typeof c.showNodeNameOnCanvas === 'boolean'
        ? c.showNodeNameOnCanvas
        : DEFAULT_PREFERENCES.showNodeNameOnCanvas,
    parallelBranchPortMode:
      c.parallelBranchPortMode === 'shared' || c.parallelBranchPortMode === 'separate'
        ? c.parallelBranchPortMode
        : DEFAULT_PREFERENCES.parallelBranchPortMode,
    language: c.language === 'en' || c.language === 'ru' ? c.language : DEFAULT_PREFERENCES.language
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
