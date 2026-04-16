import { EditorShell } from './editor/EditorShell'
import { VisualEditorWindowApp } from './editor/VisualEditorWindowApp'
import { useTheme } from './editor/useTheme'
import { usePreferences } from './editor/usePreferences'
import { useEffect, useState } from 'react'

// Главный React-компонент приложения.
// Мы держим его максимально простым: он выбирает нужную оболочку по типу окна.
function App(): React.JSX.Element {
  // Инициализируем тему на верхнем уровне, чтобы она применялась сразу при загрузке.
  useTheme()

  // Инициализируем настройки, чтобы вытянуть глобальный true rtx flag
  const { preferences } = usePreferences()

  // Обработка глобального масштаба интерфейса приложения
  const [globalZoom, setGlobalZoom] = useState(1)

  useEffect(() => {
    if (preferences.visualEditorTrueRtx) {
      document.body.classList.add('isTrueRtx')
    } else {
      document.body.classList.remove('isTrueRtx')
    }
  }, [preferences.visualEditorTrueRtx])

  useEffect(() => {
    // Применяем встроенный Electron webFrame zoom,
    // который масштабирует весь UI корректно (включая шрифты, меню и отступы),
    // как на обычном веб-сайте, а не ломает верстку как CSS property `zoom`.
    window.api?.appInfo?.setZoomFactor?.(globalZoom)
  }, [globalZoom])

  useEffect(() => {
    const handleZoom = (e: KeyboardEvent) => {
      // Игнорируем события, если зажат не только Ctrl
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return

      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        setGlobalZoom((prev) => Math.min(prev + 0.1, 3))
      } else if (e.key === '-') {
        e.preventDefault()
        setGlobalZoom((prev) => Math.max(prev - 0.1, 0.5))
      } else if (e.key === '0') {
        e.preventDefault()
        setGlobalZoom(1)
      }
    }

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        // Запрещаем дефолтный scale страницы в браузере
        e.preventDefault()
        setGlobalZoom((prev) => {
          const delta = e.deltaY > 0 ? -0.1 : 0.1
          return Math.max(0.5, Math.min(prev + delta, 3))
        })
      }
    }

    window.addEventListener('keydown', handleZoom, { passive: false })
    window.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      window.removeEventListener('keydown', handleZoom)
      window.removeEventListener('wheel', handleWheel)
    }
  }, [])

  // Второе native окно visual editor приходит с query-параметром,
  // чтобы один renderer bundle мог обслуживать оба сценария.
  const windowKind = new URLSearchParams(window.location.search).get('window')

  if (windowKind === 'visual-editor') {
    return <VisualEditorWindowApp />
  }

  return <EditorShell />
}

export default App
