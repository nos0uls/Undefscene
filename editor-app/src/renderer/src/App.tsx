import { EditorShell } from './editor/EditorShell'

// Главный React-компонент приложения.
// Мы держим его максимально простым: только оболочка редактора.
function App(): React.JSX.Element {
  return <EditorShell />
}

export default App
