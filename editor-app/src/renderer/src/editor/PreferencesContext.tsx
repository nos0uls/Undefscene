// PreferencesContext.tsx — React Context для доступа к настройкам редактора.
// Позволяет компонентам (например, нодам на холсте) читать настройки без prop drilling.

import { createContext, useContext } from 'react'
import type { EditorPreferences } from './usePreferences'
import { DEFAULT_PREFERENCES } from './usePreferences'

// Контекст с настройками редактора.
const PreferencesContext = createContext<EditorPreferences>(DEFAULT_PREFERENCES)

// Провайдер для оборачивания дерева компонентов.
export const PreferencesProvider = PreferencesContext.Provider

// Хук для чтения настроек из контекста.
export function usePreferencesContext(): EditorPreferences {
  return useContext(PreferencesContext)
}
