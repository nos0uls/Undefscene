// PreferencesContext.tsx — React Context для доступа к настройкам редактора.
// Позволяет компонентам (например, нодам на холсте) читать настройки без prop drilling.

import { createContext, useContext } from 'react'
import type { EditorPreferences } from './usePreferences'

type PreferencesContextValue = {
  // Текущие настройки редактора.
  preferences: EditorPreferences
  // Функция для обновления настроек (аналогично usePreferences hook).
  updatePreferences: (patch: Partial<EditorPreferences>) => void
  // Флаг: настройки уже загружены из файла.
  loaded: boolean
}

// Контекст с настройками редактора и функцией обновления.
// undefined используется для проверки, что компонент обёрнут в Provider.
const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined)

// Провайдер для оборачивания дерева компонентов.
export const PreferencesProvider = PreferencesContext.Provider

// Хук для чтения настроек из контекста.
export function usePreferencesContext(): PreferencesContextValue {
  const context = useContext(PreferencesContext)
  // Проверяем, что компонент обёрнут в PreferencesProvider.
  // Если нет — выбрасываем ошибку, чтобы избежать скрытых багов.
  if (context === undefined) {
    throw new Error('usePreferencesContext должен использоваться внутри PreferencesProvider')
  }
  return context
}
