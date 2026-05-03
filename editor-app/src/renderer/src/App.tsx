import { EditorShell } from './editor/EditorShell'
import { VisualEditorWindowApp } from './editor/VisualEditorWindowApp'
import { applyTheme } from './editor/useTheme'
import { usePreferences } from './editor/usePreferences'
import { PreferencesProvider } from './editor/PreferencesContext'
import { ToastProvider } from './editor/ToastHub'
import { ConfirmProvider } from './editor/ConfirmDialog'
import { useCallback, useEffect, useRef } from 'react'

// Главный React-компонент приложения.
// Мы держим его максимально простым: он выбирает нужную оболочку по типу окна.
function App(): React.JSX.Element {
  // Инициализируем настройки, чтобы вытянуть глобальный true rtx flag и тему.
  const { preferences, loaded: preferencesLoaded, updatePreferences } = usePreferences()

  // Обработка глобального масштаба интерфейса приложения.
  // Храним zoom в ref, а не в state, чтобы wheel/keyboard не триггерили
  // re-render всего дерева при каждом событии.
  const zoomRef = useRef(1)

  const applyZoom = useCallback((next: number) => {
    const clamped = Math.max(0.5, Math.min(next, 3))
    if (clamped !== zoomRef.current) {
      zoomRef.current = clamped
      window.api?.appInfo?.setZoomFactor?.(clamped)
    }
  }, [])

  // Применяем тему из preferences.json (единый источник правды).
  useEffect(() => {
    if (preferencesLoaded) {
      applyTheme(preferences.theme)
    }
  }, [preferencesLoaded, preferences.theme])

  useEffect(() => {
    if (preferences.liquidGlassEnabled) {
      document.body.classList.add('isTrueRtx')
    } else {
      document.body.classList.remove('isTrueRtx')
    }
  }, [preferences.liquidGlassEnabled])

  useEffect(() => {
    const handleZoom = (e: KeyboardEvent) => {
      // Игнорируем события, если зажат не только Ctrl
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return

      // Используем e.code для layout-agnostic распознавания (JCUKEN / QWERTY и т.д.)
      const code = e.code
      if (code === 'Equal' || code === 'NumpadAdd') {
        e.preventDefault()
        applyZoom(zoomRef.current + 0.1)
      } else if (code === 'Minus' || code === 'NumpadSubtract') {
        e.preventDefault()
        applyZoom(zoomRef.current - 0.1)
      } else if (code === 'Digit0' || code === 'Numpad0') {
        e.preventDefault()
        applyZoom(1)
      }
    }

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        // Запрещаем дефолтный scale страницы в браузере
        e.preventDefault()
        const delta = e.deltaY > 0 ? -0.1 : 0.1
        applyZoom(zoomRef.current + delta)
      }
    }

    window.addEventListener('keydown', handleZoom)
    window.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      window.removeEventListener('keydown', handleZoom)
      window.removeEventListener('wheel', handleWheel)
    }
  }, [applyZoom])

  // Второе native окно visual editor приходит с query-параметром,
  // чтобы один renderer bundle мог обслуживать оба сценария.
  const windowKind = new URLSearchParams(window.location.search).get('window')

  if (windowKind === 'visual-editor') {
    return <VisualEditorWindowApp />
  }

  return (
    <ToastProvider>
      <ConfirmProvider>
        <PreferencesProvider value={{ preferences, updatePreferences }}>
          <EditorShell />
        </PreferencesProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
}

export default App
