// PreferencesContext.tsx — React Context для доступа к настройкам редактора.
// Позволяет компонентам (например, нодам на холсте) читать настройки без prop drilling.

import { createContext, useContext } from 'react'
import type { EditorPreferences } from './usePreferences'
import { DEFAULT_PREFERENCES } from './usePreferences'

type PreferencesContextValue = {
  // Текущие настройки редактора.
  preferences: EditorPreferences
  // Функция для обновления настроек (аналогично usePreferences hook).
  updatePreferences: (patch: Partial<EditorPreferences>) => void
}

// Контекст с настройками редактора и функцией обновления.
const PreferencesContext = createContext<PreferencesContextValue>({
  preferences: DEFAULT_PREFERENCES,
  updatePreferences: () => undefined
})

// Провайдер для оборачивания дерева компонентов.
export const PreferencesProvider = PreferencesContext.Provider

// Хук для чтения настроек из контекста.
export function usePreferencesContext(): PreferencesContextValue {
  return useContext(PreferencesContext)
}
