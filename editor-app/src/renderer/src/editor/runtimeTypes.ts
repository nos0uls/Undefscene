export type RuntimeNode = {
  // Уникальный ID узла внутри сцены.
  id: string

  // Тип узла (например, реплика, выбор, пауза).
  type: string

  // Текст реплики, если это диалоговый узел.
  text?: string
}

// Основное состояние runtime-json, которое мы будем сохранять в файл.
export type RuntimeState = {
  // Версия схемы, чтобы потом делать миграции.
  schemaVersion: 1

  // Заголовок катсцены/проекта (простое поле для примера).
  title: string

  // Массив узлов катсцены.
  nodes: RuntimeNode[]

  // ID выбранного узла (для инспектора).
  selectedNodeId: string | null

  // Метка времени последнего сохранения.
  lastSavedAtMs: number
}

// Создаём стартовое состояние, чтобы редактор был предсказуемым.
export const createDefaultRuntimeState = (): RuntimeState => {
  return {
    schemaVersion: 1,
    title: 'Untitled Cutscene',
    // Стартовые узлы, чтобы холст не был пустым
    nodes: [
      { id: 'node-start', type: 'start', text: 'Start' },
      { id: 'node-dialogue-1', type: 'dialogue', text: 'Hello from the editor' }
    ],
    selectedNodeId: null,
    lastSavedAtMs: 0
  }
}

// Проверяем, что объект похож на RuntimeState.
// Если данные некорректные — возвращаем null.
export const parseRuntimeState = (raw: unknown): RuntimeState | null => {
  if (!raw || typeof raw !== 'object') return null

  const candidate = raw as Partial<RuntimeState>
  if (candidate.schemaVersion !== 1) return null

  const nodes = Array.isArray(candidate.nodes)
    ? candidate.nodes.filter((node): node is RuntimeNode => {
        if (!node || typeof node !== 'object') return false
        const candidateNode = node as Partial<RuntimeNode>
        return typeof candidateNode.id === 'string' && typeof candidateNode.type === 'string'
      })
    : []

  return {
    schemaVersion: 1,
    title: typeof candidate.title === 'string' ? candidate.title : 'Untitled Cutscene',
    nodes,
    selectedNodeId: typeof candidate.selectedNodeId === 'string' ? candidate.selectedNodeId : null,
    lastSavedAtMs: typeof candidate.lastSavedAtMs === 'number' ? candidate.lastSavedAtMs : 0
  }
}
