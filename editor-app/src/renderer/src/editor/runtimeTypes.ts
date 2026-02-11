export type RuntimeNode = {
  // Уникальный ID узла внутри сцены.
  id: string

  // Тип узла (например, реплика, выбор, пауза).
  type: string

  // Имя ноды (то, что видит пользователь в списках и на самой ноде).
  // Это НЕ текст диалога — текст диалога лежит в поле `text` ниже.
  name?: string

  // Текст реплики, если это диалоговый узел.
  text?: string

  // Позиция узла на холсте (x, y).
  position?: { x: number; y: number }

  // Параметры ноды (зависят от типа: seconds, target, x, y, speed и т.д.).
  params?: Record<string, unknown>
}

// Связь между двумя узлами на холсте.
export type RuntimeEdge = {
  // Уникальный ID связи.
  id: string

  // ID узла-источника (откуда идёт стрелка).
  source: string

  // ID handle на source (нужно для multi-выходов: branch/parallel).
  sourceHandle?: string

  // ID узла-приёмника (куда идёт стрелка).
  target: string

  // ID handle на target (нужно для multi-входов: parallel join).
  targetHandle?: string

  // Пауза на линии (в секундах). Это заменяет отдельную wait-ноду.
  waitSeconds?: number

  // --- Условие на ребре (Edge Condition) ---
  // Галочка: включить/выключить условие на этом ребре.
  conditionEnabled?: boolean

  // Имя глобальной переменной (без "global.", просто ключ).
  conditionVar?: string

  // Значение, которое должно совпасть (сравниваем как строку).
  conditionEquals?: string

  // Что делать, если условие false:
  // "skip" — пропустить wait/ветку и идти дальше.
  // "wait_until_true" — ждать, пока условие станет true.
  conditionIfFalse?: 'skip' | 'wait_until_true'

  // --- Когда прекратить ожидание (только для wait_until_true) ---
  // "none" — ждать бесконечно (пока условие не станет true).
  // "global_var" — прекратить, когда другая global-переменная примет нужное значение.
  // "node_reached" — прекратить, когда катсцена дойдёт до определённой ноды.
  // "timeout" — прекратить через N секунд.
  stopWaitingWhen?: 'none' | 'global_var' | 'node_reached' | 'timeout'

  // Поля для end-condition типа "global_var".
  endConditionVar?: string
  endConditionEquals?: string

  // Поле для end-condition типа "node_reached" (имя ноды).
  endNodeName?: string

  // Поле для end-condition типа "timeout" (секунды).
  endTimeoutSeconds?: number
}

// Основное состояние runtime-json, которое мы будем сохранять в файл.
export type RuntimeState = {
  // Версия схемы, чтобы потом делать миграции.
  schemaVersion: 1

  // Заголовок катсцены/проекта (простое поле для примера).
  title: string

  // Массив узлов катсцены.
  nodes: RuntimeNode[]

  // Массив связей между узлами.
  edges: RuntimeEdge[]

  // ID выбранного узла (для инспектора).
  selectedNodeId: string | null

  // Мультивыделение нод на холсте.
  // Если выделена 1 нода — она будет и в selectedNodeId, и в selectedNodeIds.
  // Если выделено несколько — selectedNodeId будет null, а список будет тут.
  selectedNodeIds: string[]

  // ID выбранной связи (для инспектора линий).
  selectedEdgeId: string | null

  // Метка времени последнего сохранения.
  lastSavedAtMs: number
}

// Создаём стартовое состояние, чтобы редактор был предсказуемым.
export const createDefaultRuntimeState = (): RuntimeState => {
  return {
    schemaVersion: 1,
    title: 'Untitled Cutscene',
    // Стартовые узлы — демо разных типов, чтобы холст не был пустым.
    nodes: [
      { id: 'n-start', type: 'start', name: 'Start', position: { x: 50, y: 180 } },
      { id: 'n-dialogue', type: 'dialogue', name: 'Node', text: 'Hello!', position: { x: 360, y: 120 }, params: { file: 'intro.yarn', node: 'Greeting' } },
      { id: 'n-move', type: 'move', name: 'Node (0)', position: { x: 360, y: 260 }, params: { target: 'actor:npc', x: 320, y: 240, speed_px_sec: 60 } },
      { id: 'n-end', type: 'end', name: 'End', position: { x: 650, y: 180 } }
    ],
    // Стартовые связи между узлами.
    edges: [
      // Пауза хранится на ребре, а не отдельной нодой.
      { id: 'e-start-dialogue', source: 'n-start', target: 'n-dialogue', waitSeconds: 1.5 },
      { id: 'e-start-move', source: 'n-start', target: 'n-move', waitSeconds: 1.5 },
      { id: 'e-dialogue-end', source: 'n-dialogue', target: 'n-end' },
      { id: 'e-move-end', source: 'n-move', target: 'n-end' }
    ],
    selectedNodeId: null,
    selectedNodeIds: [],
    selectedEdgeId: null,
    lastSavedAtMs: 0
  }
}

// Проверяем, что объект похож на RuntimeState.
// Если данные некорректные — возвращаем null.
export const parseRuntimeState = (raw: unknown): RuntimeState | null => {
  if (!raw || typeof raw !== 'object') return null

  const candidate = raw as Partial<RuntimeState>
  if (candidate.schemaVersion !== 1) return null

  // Аккуратно валидируем ноды и сохраняем нужные поля.
  const nodes: RuntimeNode[] = []
  if (Array.isArray(candidate.nodes)) {
    for (const rawNode of candidate.nodes) {
      if (!rawNode || typeof rawNode !== 'object') continue
      const candidateNode = rawNode as Partial<RuntimeNode>
      if (typeof candidateNode.id !== 'string' || typeof candidateNode.type !== 'string') continue

      const node: RuntimeNode = {
        id: candidateNode.id,
        type: candidateNode.type
      }

      // Имя — опционально.
      if (typeof candidateNode.name === 'string') {
        node.name = candidateNode.name
      }

      // Текст — опционально.
      if (typeof candidateNode.text === 'string') {
        node.text = candidateNode.text
      }

      // Позиция — только если есть числа.
      if (candidateNode.position && typeof candidateNode.position === 'object') {
        const pos = candidateNode.position as { x?: unknown; y?: unknown }
        if (typeof pos.x === 'number' && typeof pos.y === 'number') {
          node.position = { x: pos.x, y: pos.y }
        }
      }

      // Параметры ноды — только если это объект.
      if (candidateNode.params && typeof candidateNode.params === 'object') {
        node.params = candidateNode.params as Record<string, unknown>
      }

      nodes.push(node)
    }
  }

  // Парсим связи (edges) из JSON.
  const edges: RuntimeEdge[] = []
  const rawEdges = (candidate as Record<string, unknown>).edges
  if (Array.isArray(rawEdges)) {
    for (const rawEdge of rawEdges) {
      if (!rawEdge || typeof rawEdge !== 'object') continue
      const ce = rawEdge as Partial<RuntimeEdge>
      if (typeof ce.id !== 'string' || typeof ce.source !== 'string' || typeof ce.target !== 'string') continue

      const edge: RuntimeEdge = {
        id: ce.id,
        source: ce.source,
        target: ce.target
      }

      // Handles — опционально.
      if (typeof ce.sourceHandle === 'string') edge.sourceHandle = ce.sourceHandle
      if (typeof ce.targetHandle === 'string') edge.targetHandle = ce.targetHandle

      // Wait — только если число >= 0.
      if (typeof ce.waitSeconds === 'number' && ce.waitSeconds >= 0) {
        edge.waitSeconds = ce.waitSeconds
      }

      // Condition — опционально.
      if (typeof (ce as any).conditionEnabled === 'boolean') {
        edge.conditionEnabled = (ce as any).conditionEnabled
      }
      if (typeof (ce as any).conditionVar === 'string') {
        edge.conditionVar = (ce as any).conditionVar
      }
      if (typeof (ce as any).conditionEquals === 'string') {
        edge.conditionEquals = (ce as any).conditionEquals
      }

      // Поведение при false: skip или wait_until_true.
      const ifFalse = (ce as any).conditionIfFalse
      if (ifFalse === 'skip' || ifFalse === 'wait_until_true') {
        edge.conditionIfFalse = ifFalse
      }

      // Когда прекратить ожидание (для wait_until_true).
      const stopWhen = (ce as any).stopWaitingWhen
      if (stopWhen === 'none' || stopWhen === 'global_var' || stopWhen === 'node_reached' || stopWhen === 'timeout') {
        edge.stopWaitingWhen = stopWhen
      }

      // End-condition поля.
      if (typeof (ce as any).endConditionVar === 'string') {
        edge.endConditionVar = (ce as any).endConditionVar
      }
      if (typeof (ce as any).endConditionEquals === 'string') {
        edge.endConditionEquals = (ce as any).endConditionEquals
      }
      if (typeof (ce as any).endNodeName === 'string') {
        edge.endNodeName = (ce as any).endNodeName
      }
      if (typeof (ce as any).endTimeoutSeconds === 'number' && (ce as any).endTimeoutSeconds >= 0) {
        edge.endTimeoutSeconds = (ce as any).endTimeoutSeconds
      }

      edges.push(edge)
    }
  }

  return {
    schemaVersion: 1,
    title: typeof candidate.title === 'string' ? candidate.title : 'Untitled Cutscene',
    nodes,
    edges,
    selectedNodeId: typeof candidate.selectedNodeId === 'string' ? candidate.selectedNodeId : null,
    // selectedNodeIds — новое поле. Если его нет, но есть selectedNodeId — делаем массив из одного элемента.
    selectedNodeIds: Array.isArray((candidate as any).selectedNodeIds)
      ? ((candidate as any).selectedNodeIds as unknown[]).filter((v) => typeof v === 'string') as string[]
      : (typeof candidate.selectedNodeId === 'string' ? [candidate.selectedNodeId] : []),
    selectedEdgeId: typeof (candidate as any).selectedEdgeId === 'string' ? (candidate as any).selectedEdgeId : null,
    lastSavedAtMs: typeof candidate.lastSavedAtMs === 'number' ? candidate.lastSavedAtMs : 0
  }
}
