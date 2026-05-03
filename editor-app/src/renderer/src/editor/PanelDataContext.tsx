import { createContext, useContext } from 'react'
import type { RuntimeState, RuntimeNode } from './runtimeTypes'

// Тип данных, которые передаются панелям через PanelDataContext.
// Вынесли в отдельный контекст, чтобы панели могли читать актуальные
// данные без необходимости пересоздавать renderPanelContents callback.
// Это предотвращает re-render DockingLayout при каждом изменении runtime.
type PanelDataContextValue = {
  // Текущий runtime (ноды, рёбра, выделение).
  runtime: RuntimeState

  // Выбранная нода (для inspector / text panels).
  selectedNode: RuntimeNode | null
}

// Контекст для данных панелей.
// Создаём один раз — значение обновляется через Provider в EditorShell.
const PanelDataContext = createContext<PanelDataContextValue | null>(null)

// Хук для чтения данных панели из контекста.
// Гарантирует, что используется только внутри Provider.
export function usePanelData(): PanelDataContextValue {
  const ctx = useContext(PanelDataContext)
  if (!ctx) {
    throw new Error('usePanelData must be used inside PanelDataProvider')
  }
  return ctx
}

// Provider — обёртка для передачи данных панелям.
// Экспортируем как переименованный стандартный Provider,
// чтобы не плодить лишние обёртки в JSX.
export const PanelDataProvider = PanelDataContext.Provider
