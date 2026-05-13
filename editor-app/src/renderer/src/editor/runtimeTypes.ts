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

// Заметка режиссёра — редактор-only метаданные, не экспортируются в игру.
export type RuntimeNote = {
  // Уникальный ID заметки.
  id: string

  // Текст заметки.
  text: string

  // Категория заметки (цветовой индикатор).
  category: 'acting' | 'camera' | 'sound' | 'todo' | 'warning'

  // Позиция на холсте.
  x: number
  y: number

  // Закреплена ли заметка поверх холста.
  pinned: boolean

  // Опционально: id ноды, к которой заметка привязана.
  // Если задан, клик по заметке фокусирует канвас на этой ноде.
  nodeId?: string
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

  // Заметки режиссёра — редактор-only, не экспортируются.
  notes: RuntimeNote[]

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
      {
        id: 'n-parallel-start',
        type: 'parallel_start',
        name: 'Parallel Start',
        position: { x: 300, y: 180 },
        params: { joinId: 'n-parallel-join', branches: ['b0', 'b1'] }
      },
      {
        id: 'n-dialogue',
        type: 'dialogue',
        name: 'Node',
        text: 'Hello!',
        position: { x: 550, y: 80 },
        params: { file: 'intro.yarn', node: 'Greeting' }
      },
      {
        id: 'n-move',
        type: 'move',
        name: 'Node (0)',
        position: { x: 550, y: 280 },
        params: { target: 'actor:npc', x: 320, y: 240, speed_px_sec: 60 }
      },
      {
        id: 'n-parallel-join',
        type: 'parallel_join',
        name: 'Parallel Join',
        position: { x: 850, y: 180 },
        params: { pairId: 'n-parallel-start', branches: ['b0', 'b1'] }
      },
      { id: 'n-end', type: 'end', name: 'End', position: { x: 1100, y: 180 } }
    ],
    // Стартовые связи между узлами.
    edges: [
      // Пауза хранится на ребре, а не отдельной нодой.
      { id: 'e-start-parallel', source: 'n-start', target: 'n-parallel-start', waitSeconds: 1.5 },
      { id: 'e-parallel-dialogue', source: 'n-parallel-start', sourceHandle: 'out_b0', target: 'n-dialogue' },
      { id: 'e-parallel-move', source: 'n-parallel-start', sourceHandle: 'out_b1', target: 'n-move' },
      { id: 'e-dialogue-join', source: 'n-dialogue', target: 'n-parallel-join', targetHandle: 'in_b0' },
      { id: 'e-move-join', source: 'n-move', target: 'n-parallel-join', targetHandle: 'in_b1' },
      { id: 'e-pair-parallel', source: 'n-parallel-start', sourceHandle: '__pair', target: 'n-parallel-join', targetHandle: '__pair' },
      { id: 'e-join-end', source: 'n-parallel-join', target: 'n-end' }
    ],
    selectedNodeId: null,
    selectedNodeIds: [],
    selectedEdgeId: null,
    lastSavedAtMs: 0,
    notes: []
  }
}

// Пустая сцена для File -> New Scene.
// Оставляем только start-ноду, чтобы пользователь начинал с чистого листа,
// но при этом сразу видел рабочий холст и мог продолжать строить граф.
export const createEmptyRuntimeState = (): RuntimeState => {
  return {
    schemaVersion: 1,
    title: 'Untitled Cutscene',
    nodes: [{ id: 'n-start', type: 'start', name: 'Start', position: { x: 80, y: 180 } }],
    edges: [],
    selectedNodeId: null,
    selectedNodeIds: [],
    selectedEdgeId: null,
    lastSavedAtMs: 0,
    notes: []
  }
}

// Проверяем, что объект похож на RuntimeState.
export function parseRuntimeState(raw: unknown): RuntimeState | null {
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
  // Старые версии редактора могли сохранить "null" как текстовый handle или endpoint.
  // Такие значения не являются настоящими портами React Flow, поэтому чистим их при загрузке.
  const edges: RuntimeEdge[] = []
  const rawEdges = (candidate as Record<string, unknown>).edges
  const nodeIds = new Set(nodes.map((node) => node.id))
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  if (Array.isArray(rawEdges)) {
    for (const rawEdge of rawEdges) {
      if (!rawEdge || typeof rawEdge !== 'object') continue
      const ce = rawEdge as Partial<RuntimeEdge>
      if (
        typeof ce.id !== 'string' ||
        typeof ce.source !== 'string' ||
        typeof ce.target !== 'string'
      )
        continue
      if (!ce.id || ce.id === 'null' || ce.source === 'null' || ce.target === 'null') continue
      if (!nodeIds.has(ce.source) || !nodeIds.has(ce.target)) continue

      const edge: RuntimeEdge = {
        id: ce.id,
        source: ce.source,
        target: ce.target
      }

      // Handles — опционально. Пустые/"null" значения считаем отсутствующими.
      if (typeof ce.sourceHandle === 'string' && ce.sourceHandle && ce.sourceHandle !== 'null') {
        edge.sourceHandle = ce.sourceHandle
      }
      if (typeof ce.targetHandle === 'string' && ce.targetHandle && ce.targetHandle !== 'null') {
        edge.targetHandle = ce.targetHandle
      }

      // Миграция: старые версии сохраняли параллельные handle без префикса (b0, b1).
      // Новый формат требует out_/in_ префиксы для parallel_start/parallel_join.
      if (
        edge.sourceHandle &&
        edge.sourceHandle !== '__pair' &&
        !edge.sourceHandle.startsWith('out_')
      ) {
        const sourceNode = nodeMap.get(edge.source)
        if (sourceNode?.type === 'parallel_start') {
          edge.sourceHandle = `out_${edge.sourceHandle}`
        }
      }
      if (
        edge.targetHandle &&
        edge.targetHandle !== '__pair' &&
        !edge.targetHandle.startsWith('in_')
      ) {
        const targetNode = nodeMap.get(edge.target)
        if (targetNode?.type === 'parallel_join') {
          edge.targetHandle = `in_${edge.targetHandle}`
        }
      }

      // Wait — только если число >= 0.
      if (typeof ce.waitSeconds === 'number' && ce.waitSeconds >= 0) {
        edge.waitSeconds = ce.waitSeconds
      }

      // Condition — опционально.
      if (typeof ce.conditionEnabled === 'boolean') {
        edge.conditionEnabled = ce.conditionEnabled
      }
      if (typeof ce.conditionVar === 'string') {
        edge.conditionVar = ce.conditionVar
      }
      if (typeof ce.conditionEquals === 'string') {
        edge.conditionEquals = ce.conditionEquals
      }

      // Поведение при false: skip или wait_until_true.
      const ifFalse = ce.conditionIfFalse
      if (ifFalse === 'skip' || ifFalse === 'wait_until_true') {
        edge.conditionIfFalse = ifFalse
      }

      // Когда прекратить ожидание (для wait_until_true).
      const stopWhen = ce.stopWaitingWhen
      if (
        stopWhen === 'none' ||
        stopWhen === 'global_var' ||
        stopWhen === 'node_reached' ||
        stopWhen === 'timeout'
      ) {
        edge.stopWaitingWhen = stopWhen
      }

      // End-condition поля.
      if (typeof ce.endConditionVar === 'string') {
        edge.endConditionVar = ce.endConditionVar
      }
      if (typeof ce.endConditionEquals === 'string') {
        edge.endConditionEquals = ce.endConditionEquals
      }
      if (typeof ce.endNodeName === 'string') {
        edge.endNodeName = ce.endNodeName
      }
      if (typeof ce.endTimeoutSeconds === 'number' && ce.endTimeoutSeconds >= 0) {
        edge.endTimeoutSeconds = ce.endTimeoutSeconds
      }

      edges.push(edge)
    }
  }

  // Парсим заметки режиссёра.
  const notes: RuntimeNote[] = []
  const rawNotes = (candidate as Record<string, unknown>).notes
  if (Array.isArray(rawNotes)) {
    for (const rawNote of rawNotes) {
      if (!rawNote || typeof rawNote !== 'object') continue
      const cn = rawNote as Partial<RuntimeNote>
      if (typeof cn.id !== 'string') continue
      const category = cn.category
      if (
        category !== 'acting' &&
        category !== 'camera' &&
        category !== 'sound' &&
        category !== 'todo' &&
        category !== 'warning'
      )
        continue
      if (typeof cn.x !== 'number' || typeof cn.y !== 'number') continue
      const note: RuntimeNote = {
        id: cn.id,
        text: typeof cn.text === 'string' ? cn.text : '',
        category,
        x: cn.x,
        y: cn.y,
        pinned: typeof cn.pinned === 'boolean' ? cn.pinned : false
      }
      if (typeof cn.nodeId === 'string' && cn.nodeId) {
        note.nodeId = cn.nodeId
      }
      notes.push(note)
    }
  }

  return {
    schemaVersion: 1,
    title: typeof candidate.title === 'string' ? candidate.title : 'Untitled Cutscene',
    nodes,
    edges,
    notes,
    selectedNodeId: typeof candidate.selectedNodeId === 'string' ? candidate.selectedNodeId : null,
    // selectedNodeIds — новое поле. Если его нет, но есть selectedNodeId — делаем массив из одного элемента.
    selectedNodeIds: Array.isArray(candidate.selectedNodeIds)
      ? (candidate.selectedNodeIds.filter((v) => typeof v === 'string') as string[])
      : typeof candidate.selectedNodeId === 'string'
        ? [candidate.selectedNodeId]
        : [],
    selectedEdgeId: typeof candidate.selectedEdgeId === 'string' ? candidate.selectedEdgeId : null,
    lastSavedAtMs: typeof candidate.lastSavedAtMs === 'number' ? candidate.lastSavedAtMs : 0
  }
}
