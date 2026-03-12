import { EditorShell } from './editor/EditorShell'
import { useTheme } from './editor/useTheme'

// Главный React-компонент приложения.
// Мы держим его максимально простым: только оболочка редактора.
function App(): React.JSX.Element {
  // Инициализируем тему на верхнем уровне, чтобы она применялась сразу при загрузке.
  useTheme()

  return <EditorShell />
}

export default App
