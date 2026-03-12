// useTheme.ts — Хук для управления темой редактора.
// Сохраняет выбор в localStorage и применяет data-theme атрибут к document.

import { useState, useEffect, useCallback } from 'react'

// Доступные темы редактора.
export type ThemeId = 'dark' | 'dark-cyan' | 'gray' | 'light'

// Информация о теме для отображения в UI.
export interface ThemeInfo {
  id: ThemeId
  label: string
  description: string
}

// Список всех доступных тем.
export const THEMES: ThemeInfo[] = [
  {
    id: 'dark',
    label: 'Dark',
    description: 'Default dark theme with purple accent'
  },
  {
    id: 'dark-cyan',
    label: 'Dark Cyan',
    description: 'Dark theme with cyan accent (Persona 3 Reload style)'
  },
  {
    id: 'gray',
    label: 'Gray',
    description: 'Neutral gray theme with blue accent'
  },
  {
    id: 'light',
    label: 'Light',
    description: 'Light theme for daytime use'
  }
]

// Ключ для localStorage.
const STORAGE_KEY = 'undefscene-theme'

// Тема по умолчанию.
const DEFAULT_THEME: ThemeId = 'dark'

// Проверяет, является ли значение валидным ThemeId.
function isValidTheme(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((t) => t.id === value)
}

// Читает тему из localStorage или возвращает дефолтную.
function getStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && isValidTheme(stored)) {
      return stored
    }
  } catch {
    // localStorage может быть недоступен (например, в iframe).
  }
  return DEFAULT_THEME
}

// Сохраняет тему в localStorage.
function storeTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Игнорируем ошибки записи.
  }
}

// Применяет тему к document.documentElement.
function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute('data-theme', theme)
}

// Тип возвращаемого значения хука.
export interface UseThemeReturn {
  // Текущая тема.
  theme: ThemeId
  // Установить новую тему.
  setTheme: (theme: ThemeId) => void
  // Список всех доступных тем.
  themes: ThemeInfo[]
}

// Хук для управления темой.
export function useTheme(): UseThemeReturn {
  // Инициализируем состояние из localStorage.
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const stored = getStoredTheme()
    // Применяем тему сразу при инициализации.
    applyTheme(stored)
    return stored
  })

  // Обработчик смены темы.
  const setTheme = useCallback((newTheme: ThemeId): void => {
    if (!isValidTheme(newTheme)) return
    setThemeState(newTheme)
    storeTheme(newTheme)
    applyTheme(newTheme)
  }, [])

  // При монтировании убеждаемся, что тема применена.
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return {
    theme,
    setTheme,
    themes: THEMES
  }
}
