import { EditorShell } from './editor/EditorShell'
import { VisualEditorWindowApp } from './editor/VisualEditorWindowApp'
import { useTheme } from './editor/useTheme'

// Главный React-компонент приложения.
// Мы держим его максимально простым: он выбирает нужную оболочку по типу окна.
function App(): React.JSX.Element {
  // Инициализируем тему на верхнем уровне, чтобы она применялась сразу при загрузке.
  useTheme()

  // Второе native окно visual editor приходит с query-параметром,
  // чтобы один renderer bundle мог обслуживать оба сценария.
  const windowKind = new URLSearchParams(window.location.search).get('window')

  if (windowKind === 'visual-editor') {
    return <VisualEditorWindowApp />
  }

  return <EditorShell />
}

export default App
