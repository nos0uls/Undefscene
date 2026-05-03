import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  Position,
  SelectionMode,
  addEdge,
  useReactFlow,
  useStore,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus } from 'lucide-react'
import type { RuntimeEdge, RuntimeNode } from './runtimeTypes'
import { cutsceneNodeTypes } from './nodes'
import { usePreferencesContext } from './PreferencesContext'
import { NodeActionsProvider } from './NodeActionsContext'

// Собственный MIME-type для drag-and-drop из палитры нод.
// Он позволяет не путать наши payload'ы с обычным text/plain drag из браузера.
const NODE_PALETTE_DRAG_MIME = 'application/x-undefscene-node-type'

// Singleton для нод без параметров — избегаем O(N) allocations при каждом rebuild initialNodes.
const EMPTY_PARAMS: Record<string, unknown> = {}

// Стабильные ссылки для ReactFlow-пропсов: если передавать объекты/массивы
// литералами прямо в JSX, они получают новую identity каждый render. xyflow
// внутренне может реагировать на смену ссылок (useEffect-ами, memo-чеками),
// что на большом графе приводит к цепочке пере-инициализаций и росту числа
// event listener'ов. Выносим константы наверх — ссылки стабильны навсегда.
const RF_PRO_OPTIONS = { hideAttribution: true } as const
const RF_PAN_ON_DRAG: number[] = [2]
const RF_STYLE: React.CSSProperties = { background: 'transparent', position: 'relative', zIndex: 1 }
const RF_MINIMAP_STYLE: React.CSSProperties = { cursor: 'default', overflow: 'hidden' }
const RF_FAB_PANEL_STYLE: React.CSSProperties = { marginLeft: 74, marginBottom: 15 }

// Пропсы для холста: узлы, связи, выбор и коллбеки для синхронизации с runtime.
type FlowCanvasProps = {
  // Узлы runtime-json, которые показываем на холсте.
  runtimeNodes: RuntimeNode[]

  // Связи runtime-json между узлами.
  runtimeEdges: RuntimeEdge[]

  // ID выбранного узла (для подсветки и инспектора).
  selectedNodeId: string | null

  // ID выбранных нод (мультивыделение).
  selectedNodeIds: string[]

  // ID выбранной связи.
  selectedEdgeId: string | null

  // Коллбек, когда пользователь выбирает одну или несколько нод.
  // Пустой массив = снять выделение.
  onSelectNodes: (nodeIds: string[]) => void

  // Коллбек, когда пользователь выбирает связь.
  onSelectEdge: (edgeId: string | null) => void

  // Коллбек, когда пользователь перетащил узлы — сохраняем позиции в runtime.
  // Массив, чтобы при мультидраге все позиции обновились за один вызов.
  onNodePositionChange: (changes: Array<{ id: string; x: number; y: number }>) => void

  // Коллбек, когда пользователь создал новую связь.
  onEdgeAdd: (edge: RuntimeEdge) => void

  // Коллбек, когда пользователь удалил связь.
  onEdgeRemove: (edgeId: string) => void

  // Коллбек: добавить ещё одну "ветку" у parallel (пара нод).
  onParallelAddBranch: (parallelStartId: string) => void

  // Коллбек: удалить последнюю ветку у parallel.
  // При этом сами ноды внутри ветки не удаляем — только branch slot и его рёбра.
  onParallelRemoveBranch: (parallelStartId: string) => void

  // Коллбек: удалить ноду и все её связи (ПКМ по ноде).
  onNodeDelete: (nodeId: string) => void

  // Коллбек: создать новую ноду в указанной позиции (MMB по холсту).
  onPaneClickCreate: (x: number, y: number) => void

  // Коллбек: создать новую ноду по drop из палитры в указанной позиции.
  onPaneDropCreate?: (type: string, x: number, y: number) => void

  // Коллбек: удалить связь (ПКМ по связи).
  onEdgeDelete: (edgeId: string) => void

  // Коллбек: двойной клик по ребру — выбрать и сфокусировать wait input.
  onEdgeDoubleClick?: (edgeId: string) => void
}

// Компонент для фона: размер точек масштабируется вместе с зумом холста.
// Обёрнут в memo, чтобы не ререндериться при несвязанных изменениях preferences.
const ScaledBackground = memo(function ScaledBackground() {
  const zoom = useStore((s) => s.transform[2])
  const { preferences: prefs } = usePreferencesContext()
  return <Background color="#262b2f" gap={prefs.gridSize} size={Math.max(1, zoom * 1.5)} />
})

// LOD-контроллер: единственный компонент, который подписывается на zoom из store
// и выставляет класс на корне .react-flow. Это ключевая оптимизация для 500+ нод:
// вместо того, чтобы каждая нода перерендеривалась при zoom, мы просто меняем
// один класс, а CSS-правила отключают тяжёлый paint (body, header, box-shadow, color-mix)
// на далёком зуме, где детали всё равно нечитаемы.
//
// Используем только ОДИН порог zoomLow. Второй порог (zoomVeryLow / display:none
// на всё содержимое) создавал рывок при пересечении — все 500 нод
// одновременно re-lay-out'ились, и это ощущалось как "скачок".
// Лучше иметь одну плавную границу, чем две с спайками.
const ZoomLODController = memo(function ZoomLODController(): null {
  const zoom = useStore((s) => s.transform[2])

  // Кэшируем последнее применённое состояние, чтобы не дёргать classList
  // при каждом микро-изменении zoom (wheel zoom шлёт много frame'ов подряд).
  // Без этого браузер делает style invalidation на каждый frame zoom,
  // хотя класс фактически не меняется.
  const lastLowRef = useRef<boolean | null>(null)

  useEffect(() => {
    const isLow = zoom < 0.4

    // Идемпотентность: мутируем DOM только если порог реально пересекли.
    if (lastLowRef.current === isLow) return
    lastLowRef.current = isLow

    const root = document.querySelector('.react-flow') as HTMLElement | null
    if (!root) return

    root.classList.toggle('zoomLow', isLow)
  }, [zoom])

  return null
})

// Внутренний компонент холста (нужен useReactFlow, который работает только внутри ReactFlowProvider).
const FlowCanvasInner = memo(function FlowCanvasInner({
  runtimeNodes,
  runtimeEdges,
  selectedNodeId,
  selectedNodeIds,
  selectedEdgeId,
  onSelectNodes,
  onSelectEdge,
  onNodePositionChange,
  onEdgeAdd,
  onEdgeRemove,
  onParallelAddBranch,
  onParallelRemoveBranch,
  onNodeDelete,
  onPaneClickCreate,
  onPaneDropCreate,
  onEdgeDelete,
  onEdgeDoubleClick
}: FlowCanvasProps): React.JSX.Element {
  // Нужен для конвертации экранных координат в координаты холста.
  const { screenToFlowPosition, getNodes, getViewport, setViewport, fitView } = useReactFlow()

  // Читаем только те настройки, которые реально нужны холсту.
  // Деструктуризация не предотвращает ререндер при смене других полей,
  // но готовит почву для дальнейшей изоляции через refs / вынесение в sub-components.
  const { preferences, updatePreferences: updatePreferencesFromContext } = usePreferencesContext()
  const {
    zoomSpeed,
    parallelBranchPortMode,
    showNodeNameOnCanvas,
    canvasBackgroundPath,
    showMiniMap,
    liquidGlassEnabled,
    liquidGlassBlur,
    canvasBackgroundAttachment,
    canvasBackgroundMode,
    canvasBackgroundOpacity
  } = preferences

  // Ref для zoomSpeed, чтобы handleWheel не пересоздавался при смене preferences.
  const zoomSpeedRef = useRef(zoomSpeed)
  useEffect(() => {
    zoomSpeedRef.current = zoomSpeed
  }, [zoomSpeed])

  // Data URL кастомного фонового изображения.
  // Читаем его через main IPC, потому что прямой file:// доступ из renderer может блокироваться.
  const [canvasBackgroundUrl, setCanvasBackgroundUrl] = useState<string | null>(null)

  useEffect(() => {
    setCanvasBackgroundUrl(null)

    if (!canvasBackgroundPath || !window.api?.preferences?.readCanvasBackgroundDataUrl) {
      return
    }

    const requestedPath = canvasBackgroundPath
    let cancelled = false
    window.api.preferences
      .readCanvasBackgroundDataUrl(requestedPath)
      .then((dataUrl) => {
        if (cancelled) return
        if (typeof dataUrl === 'string') {
          setCanvasBackgroundUrl(dataUrl)
        } else {
          setCanvasBackgroundUrl(null)
          // Файл фона удалён или повреждён — сбрасываем путь в настройках.
          updatePreferencesFromContext({ canvasBackgroundPath: null })
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('Failed to load canvas background image:', err)
        setCanvasBackgroundUrl(null)
        // При ошибке чтения тоже сбрасываем путь, чтобы UI не показывал "битый" фон.
        updatePreferencesFromContext({ canvasBackgroundPath: null })
      })

    return () => {
      cancelled = true
    }
  }, [canvasBackgroundPath])

  // Храним ref на DOM-обёртку canvas, чтобы повесить native non-passive wheel listener.
  // Это нужно для trackpad/pinch и чтобы браузер не ругался на preventDefault в passive listener.
  const flowCanvasRef = useRef<HTMLDivElement | null>(null)

  // Когда мы сами синхронизируем selected-флаги обратно в React Flow store,
  // временно игнорируем echo-события onSelectionChange, чтобы не словить цикл.
  const suppressSelectionEchoRef = useRef(false)

  // Флаг, чтобы игнорировать следующий клик по холсту после создания связи.
  const justConnectedRef = useRef(false)

  // Этот флаг нужен, чтобы не словить цикл выделения.
  // Когда мы сами снимаем выделение (клик по пустому месту), React Flow может
  // на мгновение прислать старое выделение обратно через onSelectionChange.
  // Мы игнорируем такие события, пока не увидим пустое выделение.
  const ignoreSelectionUntilEmptyRef = useRef(false)

  // Refs для актуального состояния выделения.
  // Нужны, чтобы коллбеки (onSelectionChange, handleNodesChange) всегда видели
  // свежие значения, а не устаревшие замыкания (stale closures).
  const selectedNodeIdRef = useRef(selectedNodeId)
  const selectedNodeIdsRef = useRef(selectedNodeIds)
  const selectedEdgeIdRef = useRef(selectedEdgeId)

  // Обновляем selection refs в useEffect.
  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
    selectedNodeIdsRef.current = selectedNodeIds
    selectedEdgeIdRef.current = selectedEdgeId
  }, [selectedNodeId, selectedNodeIds, selectedEdgeId])

  // Стабилизируем все внешние коллбеки, чтобы не пересоздавать ReactFlow props
  // на каждом рендере и не триггерить лишние store.setState внутри xyflow.
  const onSelectNodesRef = useRef(onSelectNodes)
  const onSelectEdgeRef = useRef(onSelectEdge)
  const onEdgeAddRef = useRef(onEdgeAdd)
  const onEdgeRemoveRef = useRef(onEdgeRemove)
  const onParallelRemoveBranchRef = useRef(onParallelRemoveBranch)
  const onNodeDeleteRef = useRef(onNodeDelete)
  const onPaneClickCreateRef = useRef(onPaneClickCreate)
  const onPaneDropCreateRef = useRef(onPaneDropCreate)
  const onEdgeDeleteRef = useRef(onEdgeDelete)
  const onEdgeDoubleClickRef = useRef(onEdgeDoubleClick)

  // Обновляем refs в useEffect, чтобы не нарушать правила React Hooks.
  useEffect(() => {
    onSelectNodesRef.current = onSelectNodes
    onSelectEdgeRef.current = onSelectEdge
    onEdgeAddRef.current = onEdgeAdd
    onEdgeRemoveRef.current = onEdgeRemove
    onParallelRemoveBranchRef.current = onParallelRemoveBranch
    onNodeDeleteRef.current = onNodeDelete
    onPaneClickCreateRef.current = onPaneClickCreate
    onPaneDropCreateRef.current = onPaneDropCreate
    onEdgeDeleteRef.current = onEdgeDelete
    onEdgeDoubleClickRef.current = onEdgeDoubleClick
  }, [
    onSelectNodes,
    onSelectEdge,
    onEdgeAdd,
    onEdgeRemove,
    onParallelRemoveBranch,
    onNodeDelete,
    onPaneClickCreate,
    onPaneDropCreate,
    onEdgeDelete,
    onEdgeDoubleClick
  ])

  // Drag preview показывает, где именно окажется нода после drop.
  // Храним и screen-space, и flow-space координаты, чтобы пользователю было проще ориентироваться.
  const [dragPreview, setDragPreview] = useState<{
    type: string
    localX: number
    localY: number
    flowX: number
    flowY: number
  } | null>(null)

  // Аккуратно вытаскиваем тип ноды из DnD payload.
  // Если drag пришёл не из нашей палитры, возвращаем null и не вмешиваемся.
  const getDraggedNodeType = useCallback((dataTransfer: DataTransfer | null): string | null => {
    if (!dataTransfer) return null

    const customType = dataTransfer.getData(NODE_PALETTE_DRAG_MIME).trim()
    if (customType) return customType

    const fallbackType = dataTransfer.getData('text/plain').trim()
    return fallbackType || null
  }, [])

  // На стадии dragover Chromium/Electron может ещё не отдавать getData(...),
  // но список MIME-types уже доступен. Этого достаточно, чтобы разрешить drop.
  const hasDraggedNodeType = useCallback((dataTransfer: DataTransfer | null): boolean => {
    if (!dataTransfer) return false

    const dragTypes = Array.from(dataTransfer.types ?? [])
    return dragTypes.includes(NODE_PALETTE_DRAG_MIME) || dragTypes.includes('text/plain')
  }, [])

  // Проверяем, что курсор находится над основной рабочей областью canvas.
  // Не требуем строго `.react-flow__pane`, потому что drag может идти поверх background,
  // viewport-слоёв или других внутренних DOM-обёрток React Flow.
  // Но сознательно исключаем overlay-элементы вроде minimap и controls,
  // чтобы drop там не создавал ноду в неожиданном месте.
  const isCanvasDropTarget = useCallback((target: EventTarget | null, container: HTMLDivElement | null): boolean => {
    const element = target instanceof Element ? target : null
    if (!container) return false

    // Если браузер отдаёт dragover/drop прямо на корневой canvas-контейнер,
    // это всё равно валидная зона для создания ноды.
    if (!element) {
      return true
    }

    if (element.closest('.react-flow__minimap, .react-flow__controls')) {
      return false
    }

    // Достаточно того, что target живёт внутри нашего canvas-контейнера.
    // Слишком узкая проверка по внутренним классам React Flow ломала DnD
    // и давала пользователю запрещённый cursor почти на всей рабочей области.
    return element === container || container.contains(element)
  }, [])

  // Строим узлы React Flow из runtime-данных.
  // ВАЖНО: НЕ включаем selected сюда — выделение синхронизируем отдельным эффектом.
  // Это разрывает цикл: runtime → initialNodes → setNodes → StoreUpdater → onSelectionChange → setRuntime.
  const initialNodes = useMemo<Node[]>(() => {
    if (!runtimeNodes) return []
    return runtimeNodes.map((node, index) => ({
      id: node.id,
      // Используем кастомный тип ноды, если он зарегистрирован.
      // Если нет — React Flow покажет дефолтный узел.
      type: node.type in cutsceneNodeTypes ? node.type : undefined,
      // Если позиция сохранена — берём её, иначе раскладываем по сетке.
      position: node.position ?? { x: 120 + index * 250, y: 150 },
      // Точки соединения слева/справа — поток читается слева направо.
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      data: {
        // Метка для отображения в ноде.
        label: node.name && node.name.length > 0 ? node.name : node.type,
        // Параметры ноды (для кастомных компонентов).
        params: node.params || EMPTY_PARAMS
      }
    }))
  }, [runtimeNodes])

  // Строим связи React Flow из runtime-данных.
  // Аналогично нодам — без selected, чтобы не создавать петлю.
  const initialEdges = useMemo<Edge[]>(() => {
    if (!runtimeEdges) return []
    return runtimeEdges.map((e) => {
      const isInternalPair = e.sourceHandle === '__pair' && e.targetHandle === '__pair'

      return {
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,

        // Показываем wait прямо на линии.
        label: typeof e.waitSeconds === 'number' ? `${e.waitSeconds}s` : undefined,
        labelShowBg: true,
        labelBgStyle: { fill: 'rgba(0,0,0,0.55)' },
        labelStyle: { fill: '#d4d4d4', fontSize: 11 },

        // Внутренняя линия для пары parallel (если мы её используем).
        style: isInternalPair ? { strokeDasharray: '6 4', opacity: 0.35 } : undefined,
        selectable: !isInternalPair
      }
    })
  }, [runtimeEdges])

  // Локальное состояние React Flow.
  // Мы используем Uncontrolled Mode (без controlled props nodes/edges),
  // чтобы React Flow сам супер-быстро обновлял узлы при мультидраге через Zustand,
  // не вызывая дорогой re-render всего компонента FlowCanvasInner 60 раз в секунду.
  // Для внешних апдейтов (undo/redo) мы всё равно можем вызывать setNodes/setEdges.
  const { setNodes, setEdges } = useReactFlow()

  // Синхронизируем данные нод (без выделения) когда runtime меняется.
  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((node) => [node.id, node]))
      let changed = prev.length !== initialNodes.length

      const next = initialNodes.map((node) => {
        const prevNode = prevById.get(node.id)
        const selected = prevNode?.selected ?? false

        if (
          prevNode &&
          prevNode.type === node.type &&
          prevNode.position.x === node.position.x &&
          prevNode.position.y === node.position.y &&
          prevNode.targetPosition === node.targetPosition &&
          prevNode.sourcePosition === node.sourcePosition &&
          prevNode.data?.label === node.data.label &&
          prevNode.selected === selected
        ) {
          // Shallow compare для params — React Flow может клонировать data-объекты,
          // поэтому строгое === на params ломается. Сравниваем по ключам.
          const prevParams = prevNode.data?.params as Record<string, unknown> | undefined
          const nextParams = node.data?.params as Record<string, unknown> | undefined
          if (
            (!prevParams && !nextParams) ||
            (prevParams === nextParams) ||
            (prevParams && nextParams &&
              Object.keys(prevParams).length === Object.keys(nextParams).length &&
              Object.keys(prevParams).every((k) => prevParams[k] === nextParams[k]))
          ) {
            return prevNode
          }
        }

        changed = true
        return {
          ...node,
          selected
        }
      })

      return changed ? next : prev
    })
  }, [initialNodes, setNodes])

  // Синхронизируем данные рёбер (без выделения) когда runtime меняется.
  useEffect(() => {
    setEdges((prev) => {
      const prevById = new Map(prev.map((edge) => [edge.id, edge]))
      let changed = prev.length !== initialEdges.length

      const next = initialEdges.map((edge) => {
        const prevEdge = prevById.get(edge.id)
        const selected = prevEdge?.selected ?? false

        if (
          prevEdge &&
          prevEdge.source === edge.source &&
          prevEdge.sourceHandle === edge.sourceHandle &&
          prevEdge.target === edge.target &&
          prevEdge.targetHandle === edge.targetHandle &&
          prevEdge.label === edge.label &&
          prevEdge.selectable === edge.selectable &&
          prevEdge.selected === selected
        ) {
          return prevEdge
        }

        changed = true
        return {
          ...edge,
          selected
        }
      })

      return changed ? next : prev
    })
  }, [initialEdges, setEdges])

  // Отдельно синхронизируем выделение нод, когда selection в runtime меняется.
  // Это разделение — ключ к отсутствию бесконечного цикла.
  useEffect(() => {
    const nodeIdSet = new Set(selectedNodeIds ?? [])
    if (selectedNodeId) nodeIdSet.add(selectedNodeId)

    let changed = false
    setNodes((prev) => {
      const next = prev.map((n) => {
        const shouldSelect = nodeIdSet.has(n.id)
        if (n.selected === shouldSelect) return n
        changed = true
        return { ...n, selected: shouldSelect }
      })
      return changed ? next : prev
    })

    if (changed) {
      suppressSelectionEchoRef.current = true
      window.requestAnimationFrame(() => {
        suppressSelectionEchoRef.current = false
      })
    }
  }, [selectedNodeId, selectedNodeIds, setNodes])

  // Отдельно синхронизируем выделение рёбер.
  useEffect(() => {
    let changed = false
    setEdges((prev) => {
      const next = prev.map((e) => {
        const shouldSelect = e.id === selectedEdgeId
        if (e.selected === shouldSelect) return e
        changed = true
        return { ...e, selected: shouldSelect }
      })
      return changed ? next : prev
    })

    if (changed) {
      suppressSelectionEchoRef.current = true
      window.requestAnimationFrame(() => {
        suppressSelectionEchoRef.current = false
      })
    }
  }, [selectedEdgeId, setEdges])

  // Ref чтобы не пересоздавать коллбек при каждом рендере.
  const positionCallbackRef = useRef(onNodePositionChange)
  useEffect(() => {
    positionCallbackRef.current = onNodePositionChange
  }, [onNodePositionChange])

  // Ref для runtimeNodes, чтобы handleNodesChange не зависел от замыкания.
  const runtimeNodesRef = useRef(runtimeNodes)
  useEffect(() => {
    runtimeNodesRef.current = runtimeNodes
  }, [runtimeNodes])

  // Ref для runtimeEdges, чтобы onConnect мог видеть актуально занятые ветки parallel.
  const runtimeEdgesRef = useRef(runtimeEdges)
  useEffect(() => {
    runtimeEdgesRef.current = runtimeEdges
  }, [runtimeEdges])

  // Для shared-режима у parallel у нас один видимый порт.
  // Здесь мы автоматически выбираем реальный branch handle по порядку подключений.
  const resolveParallelConnection = useCallback(
    (connection: Connection): Connection | null => {
      if (!connection.source || !connection.target) return null

      const sourceNode = runtimeNodesRef.current.find((node) => node.id === connection.source)
      const targetNode = runtimeNodesRef.current.find((node) => node.id === connection.target)
      const nextConnection: Connection = { ...connection }
      const currentEdges = runtimeEdgesRef.current

      if (connection.sourceHandle === 'out_shared' && sourceNode?.type === 'parallel_start') {
        const branches = Array.isArray(sourceNode.params?.branches)
          ? (sourceNode.params?.branches as string[])
          : ['b0']

        const usedHandles = new Set(
          currentEdges
            .filter(
              (edge) =>
                edge.source === sourceNode.id &&
                edge.sourceHandle &&
                edge.sourceHandle !== '__pair' &&
                edge.sourceHandle.startsWith('out_')
            )
            .map((edge) => edge.sourceHandle as string)
        )

        const freeBranch = branches.find((branchId) => !usedHandles.has(`out_${branchId}`))
        if (!freeBranch) return null
        nextConnection.sourceHandle = `out_${freeBranch}`
      }

      if (connection.targetHandle === 'in_shared' && targetNode?.type === 'parallel_join') {
        const branches = Array.isArray(targetNode.params?.branches)
          ? (targetNode.params?.branches as string[])
          : ['b0']

        const usedHandles = new Set(
          currentEdges
            .filter(
              (edge) =>
                edge.target === targetNode.id &&
                edge.targetHandle &&
                edge.targetHandle !== '__pair' &&
                edge.targetHandle.startsWith('in_')
            )
            .map((edge) => edge.targetHandle as string)
        )

        const freeBranch = branches.find((branchId) => !usedHandles.has(`in_${branchId}`))
        if (!freeBranch) return null
        nextConnection.targetHandle = `in_${freeBranch}`
      }

      // В strict separate-режиме не даём занять тот же branch handle второй раз.
      if (parallelBranchPortMode === 'separate') {
        const sourceHandleBusy =
          nextConnection.sourceHandle?.startsWith('out_') &&
          currentEdges.some(
            (edge) =>
              edge.source === nextConnection.source &&
              edge.sourceHandle === (nextConnection.sourceHandle ?? undefined)
          )

        const targetHandleBusy =
          nextConnection.targetHandle?.startsWith('in_') &&
          currentEdges.some(
            (edge) =>
              edge.target === nextConnection.target &&
              edge.targetHandle === (nextConnection.targetHandle ?? undefined)
          )

        const duplicateBranchEdge = currentEdges.some(
          (edge) =>
            edge.source === nextConnection.source &&
            edge.target === nextConnection.target &&
            edge.sourceHandle === (nextConnection.sourceHandle ?? undefined) &&
            edge.targetHandle === (nextConnection.targetHandle ?? undefined)
        )

        if (sourceHandleBusy || targetHandleBusy || duplicateBranchEdge) return null
      }

      return nextConnection
    },
    [parallelBranchPortMode]
  )

  // Обёртка над onNodesChange: ловим конец перетаскивания и сохраняем позицию.
  // Обработчик любых изменений узлов в React Flow (перетаскивание, выделение и т.д.).
  // Здесь мы ловим момент, когда пользователь закончил тянуть узел, и сохраняем 
  // его новые координаты (X и Y) в наше основное состояние (runtime).
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // В Uncontrolled Mode React Flow САМ применяет изменения к своим нодам.
      // Наша задача — только поймать конец drag и сохранить финальные позиции в runtime.

      // Если закончили drag хотя бы одной ноды — сохраняем позиции всех выделенных.
      const didStopDragging = changes.some((c) => c.type === 'position' && c.dragging === false)

      if (didStopDragging) {
        // Берём актуальные позиции прямо из стора React Flow.
        const latestNodes = getNodes()
        const currentRuntimeNodes = runtimeNodesRef.current

        // Используем refs, чтобы не зависеть от замыкания.
        const idsToSave = new Set<string>()
        for (const id of selectedNodeIdsRef.current ?? []) idsToSave.add(id)
        if (selectedNodeIdRef.current) idsToSave.add(selectedNodeIdRef.current)

        // Добавляем все ноды, которые React Flow отметил как "dragging=false".
        for (const c of changes) {
          if (c.type === 'position' && c.dragging === false) {
            idsToSave.add(c.id)
          }
        }

        // Собираем все реально изменённые позиции в один массив.
        const batch: Array<{ id: string; x: number; y: number }> = []
        for (const id of idsToSave) {
          const flowNode = latestNodes.find((n) => n.id === id)
          if (!flowNode) continue

          const nextPos = flowNode.position
          const runtimeNode = currentRuntimeNodes.find((n) => n.id === id)
          const prevPos = runtimeNode?.position

          if (prevPos && prevPos.x === nextPos.x && prevPos.y === nextPos.y) {
            continue
          }

          batch.push({ id, x: nextPos.x, y: nextPos.y })
        }

        if (batch.length > 0) {
          positionCallbackRef.current(batch)
        }

        return
      }

      // Одиночный drag (fallback).
      const singleBatch: Array<{ id: string; x: number; y: number }> = []
      for (const change of changes) {
        if (change.type !== 'position' || change.dragging !== false || !change.position) {
          continue
        }

        const runtimeNode = runtimeNodesRef.current.find((n) => n.id === change.id)
        const prevPos = runtimeNode?.position

        if (prevPos && prevPos.x === change.position.x && prevPos.y === change.position.y) {
          continue
        }

        singleBatch.push({ id: change.id, x: change.position.x, y: change.position.y })
      }

      if (singleBatch.length > 0) {
        positionCallbackRef.current(singleBatch)
      }
    },
    [getNodes]
  )

  // При соединении нод — создаём ребро и сообщаем runtime.
  // Когда пользователь протягивает линию от одного узла к другому.
  // Мы создаем объект "ребра" (edge) и сохраняем его в runtime, чтобы связь не потерялась.
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const resolvedConnection = resolveParallelConnection(connection)
      if (!resolvedConnection?.source || !resolvedConnection?.target) return

      const newEdge: RuntimeEdge = {
        id: `edge-${resolvedConnection.source}-${resolvedConnection.sourceHandle ?? 'out'}-${resolvedConnection.target}-${resolvedConnection.targetHandle ?? 'in'}`,
        source: resolvedConnection.source,
        sourceHandle: resolvedConnection.sourceHandle ?? undefined,
        target: resolvedConnection.target,
        targetHandle: resolvedConnection.targetHandle ?? undefined
      }
      setEdges((prev) => addEdge(resolvedConnection, prev))
      onEdgeAddRef.current(newEdge)
      // Устанавливаем флаг, чтобы следующий клик по холсту не создавал ноду.
      justConnectedRef.current = true
    },
    [resolveParallelConnection, setEdges]
  )

  // При удалении рёбер — сообщаем runtime.
  const handleEdgesChange = useCallback(
    (changes: Parameters<NonNullable<React.ComponentProps<typeof ReactFlow>['onEdgesChange']>>[0]) => {
      // В Uncontrolled Mode React Flow САМ удаляет ребро визуально.
      // Нам остаётся только уведомить runtimeState.
      for (const change of changes) {
        if (change.type === 'remove') {
          onEdgeRemoveRef.current(change.id)
        }
      }
    },
    []
  )

  // ПКМ по ноде — удаляем её и все связанные рёбра.
  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault()
    onNodeDeleteRef.current(node.id)
  }, [])

  // ЛКМ по холсту — снимаем выделение.
  // Мы игнорируем этот клик, если он пришёл из интерактивного элемента (инпут, селект и т.д.).
  const handlePaneClick = useCallback((event: React.MouseEvent) => {
    // Проверяем, не кликнули ли мы по элементу управления (инспектору, кнопкам).
    const target = event.target as HTMLElement | null
    const interactiveTarget = target?.closest('textarea, input, select, button, [contenteditable="true"]')
    if (interactiveTarget) return

    // Если только что создали связь — игнорируем этот клик и сбрасываем флаг.
    if (justConnectedRef.current) {
      justConnectedRef.current = false
      return
    }

    // ЛКМ по пустому месту: просто снимаем выделение.
    // Создание ноды перенесли на MMB.
    if (event.button === 0) {
      // Включаем защиту от "отката" выделения через onSelectionChange.
      // Это особенно важно, когда уже выделено несколько нод.
      ignoreSelectionUntilEmptyRef.current = true
      onSelectEdgeRef.current(null)
      onSelectNodesRef.current([])
    }
  }, [])

  // MMB по холсту — создаём новую ноду.
  // Используем MouseDown, потому что "click" обычно срабатывает только для ЛКМ.
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Только MMB (колёсико).
      if (event.button !== 1) return

      // Проверяем, не кликнули ли мы по UI-панелям.
      // Если клик пришел из инспектора или палитры, мы его полностью игнорируем здесь.
      const target = event.target as HTMLElement | null
      const isUiClick = target?.closest('textarea, input, select, button, [contenteditable="true"], .editorLeftDock, .editorRightDock, .editorBottomDock, .prefsOverlay, .topMenuBar, .floatingLayer')
      if (isUiClick) return

      // Разрешаем создание ноды только если клик пришёл по пустому месту (pane).
      const clickedPane = !!target?.closest('.react-flow__pane')
      if (!clickedPane) return

      // Если только что создали связь — игнорируем.
      if (justConnectedRef.current) {
        justConnectedRef.current = false
        return
      }

      event.preventDefault()

      const flowPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      })

      onPaneClickCreateRef.current(flowPosition.x, flowPosition.y)
    },
    [screenToFlowPosition]
  )

  // Drag-over нужен для live preview и разрешения drop.
  // Preview показываем только когда drag действительно пришёл из нашей node palette.
  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasDraggedNodeType(event.dataTransfer)) return

      if (!isCanvasDropTarget(event.target, flowCanvasRef.current)) {
        setDragPreview(null)
        return
      }

      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'

      const nodeType = getDraggedNodeType(event.dataTransfer) ?? 'node'

      const canvasRect = flowCanvasRef.current?.getBoundingClientRect()
      if (!canvasRect) return

      const flowPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      })

      setDragPreview({
        type: nodeType,
        localX: event.clientX - canvasRect.left,
        localY: event.clientY - canvasRect.top,
        flowX: Math.round(flowPosition.x),
        flowY: Math.round(flowPosition.y)
      })
    },
    [getDraggedNodeType, hasDraggedNodeType, isCanvasDropTarget, screenToFlowPosition]
  )

  // Если курсор вышел за пределы canvas-контейнера, прячем preview,
  // чтобы он не зависал поверх интерфейса.
  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as globalThis.Node | null
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return
    }

    setDragPreview(null)
  }, [])

  // Drop создаёт ноду выбранного типа прямо на canvas-позиции preview.
  // Остальную семантику (имя, selection, special cases) оставляем EditorShell.
  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const nodeType = getDraggedNodeType(event.dataTransfer)
      setDragPreview(null)
      if (!nodeType) return

      if (!isCanvasDropTarget(event.target, flowCanvasRef.current)) return

      event.preventDefault()

      const flowPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      })

      onPaneDropCreateRef.current?.(nodeType, flowPosition.x, flowPosition.y)
    },
    [getDraggedNodeType, isCanvasDropTarget, screenToFlowPosition]
  )

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    if ((edge as Edge & { selectable?: boolean }).selectable === false) return
    onSelectNodesRef.current([])
    onSelectEdgeRef.current(edge.id)
  }, [])

  const handleEdgeContextMenu = useCallback((_: React.MouseEvent, edge: Edge) => {
    onEdgeDeleteRef.current(edge.id)
  }, [])

  const handleEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    if ((edge as Edge & { selectable?: boolean }).selectable === false) return
    onSelectNodesRef.current([])
    onSelectEdgeRef.current(edge.id)
    onEdgeDoubleClickRef.current?.(edge.id)
  }, [])

  // Дебаунсер для выделения: когда мы тянем рамку выделения (box select),
  // React Flow спамит onSelectionChange на каждый кадр. Мы не хотим перерисовывать
  // весь EditorShell 60 раз в секунду.
  const selectionTimeoutRef = useRef<number | null>(null)
  const handleSelectionChange = useCallback((sel: { nodes?: Array<{ id: string }> }) => {
    const ids = (sel?.nodes ?? []).map((n) => String(n.id))

    // Если событие пришло от нашей синхронизации selected-флагов,
    // не отправляем его обратно в runtime state.
    if (suppressSelectionEchoRef.current) return

    // Если мы сами пытаемся снять выделение — игнорируем события,
    // пока React Flow не пришлёт пустое выделение.
    if (ignoreSelectionUntilEmptyRef.current) {
      if (ids.length === 0) {
        ignoreSelectionUntilEmptyRef.current = false
        return
      }

      ignoreSelectionUntilEmptyRef.current = false
    }

    // Используем refs, чтобы всегда сравнивать с актуальным состоянием,
    // а не с устаревшим замыканием (stale closure). Это ключ к отсутствию петли.
    const nextSelectedNodeId = ids.length === 1 ? ids[0] : null
    const prevIds = selectedNodeIdsRef.current ?? []
    const currentNodeId = selectedNodeIdRef.current

    const sameLength = prevIds.length === ids.length
    let sameSet = sameLength
    if (sameSet && ids.length > 0) {
      const prevSet = new Set(prevIds)
      sameSet = ids.every((id) => prevSet.has(id))
    }

    if (sameSet && currentNodeId === nextSelectedNodeId) {
      return
    }

    if (selectionTimeoutRef.current !== null) {
      window.clearTimeout(selectionTimeoutRef.current)
    }

    selectionTimeoutRef.current = window.setTimeout(() => {
      onSelectNodesRef.current(ids)
    }, 100)
  }, [])

  // Управляем wheel zoom вручную, потому что у React Flow нет прямого prop для zoom speed.
  // Важно: используем публичные viewport API, а не внутренние поля библиотеки.
  const handleWheel = useCallback(
    (event: WheelEvent) => {
      const target = event.target as HTMLElement | null
      const flowCanvas = flowCanvasRef.current
      if (!flowCanvas) return
      const canvasRect = flowCanvas.getBoundingClientRect()
      const insideViewport =
        event.clientX >= canvasRect.left &&
        event.clientX <= canvasRect.right &&
        event.clientY >= canvasRect.top &&
        event.clientY <= canvasRect.bottom

      if (!insideViewport) return

      // Если курсор сейчас над интерактивным HTML-элементом внутри canvas,
      // не ломаем его нативный scroll/number input/select.
      const interactiveTarget = target?.closest('textarea, input, select, button, [contenteditable="true"]')
      if (interactiveTarget) return

      // Для тачпада и мыши всегда используем один и тот же zoom path.
      // Важно: preventDefault здесь теперь законен, потому что listener non-passive.
      event.preventDefault()
      event.stopPropagation()

      const currentViewport = getViewport()
      const currentZoom = currentViewport.zoom
      const zoomFactor = Math.exp(-event.deltaY * 0.001 * zoomSpeedRef.current)
      const nextZoom = Math.max(0.1, Math.min(4, currentZoom * zoomFactor))

      if (Math.abs(nextZoom - currentZoom) < 0.0001) return

      const flowPoint = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      })

      const nextViewportX = event.clientX - canvasRect.left - flowPoint.x * nextZoom
      const nextViewportY = event.clientY - canvasRect.top - flowPoint.y * nextZoom

      void setViewport(
        {
          x: nextViewportX,
          y: nextViewportY,
          zoom: nextZoom
        },
        { duration: 0 }
      )
    },
    [getViewport, screenToFlowPosition, setViewport]
  )

  // Навешиваем native wheel listener вручную.
  // React synthetic wheel в этом месте мог стать passive, из-за чего preventDefault ломался.
  useEffect(() => {
    const element = flowCanvasRef.current
    if (!element) return

    const listener = (event: WheelEvent) => {
      handleWheel(event)
    }

    element.addEventListener('wheel', listener, { capture: true, passive: false })
    return () => {
      element.removeEventListener('wheel', listener, { capture: true })
    }
  }, [handleWheel])

  // Обрабатываем Space прямо внутри холста: вызываем fitView без подъёма
  // запроса через state/props. Это предотвращает ре-рендер EditorShell
  // при каждом нажатии Space на большом графе.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return

      // Не перехватываем Space если фокус в поле ввода.
      const target = event.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName
      if (tag === 'TEXTAREA' || tag === 'SELECT') return
      if (tag === 'INPUT') {
        const inputType = (target as HTMLInputElement).type?.toLowerCase()
        if (!['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(inputType)) {
          return
        }
      }
      if (target.closest('[contenteditable="true"]')) return

      event.preventDefault()
      void fitView({ duration: 180, padding: 0.18 })
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [fitView])

  // Initial fitView после первого монтирования: раньше это делал boolean prop
  // `fitView` на <ReactFlow>, но он мог перестреливать на смену nodes-массива.
  // Делаем один раз в rAF, чтобы xyflow успел померить ноды и посчитать bounds.
  const didInitialFitRef = useRef(false)
  useEffect(() => {
    if (didInitialFitRef.current) return
    didInitialFitRef.current = true
    // rAF даёт шанс xyflow замерить размеры нод перед первым fit.
    const raf = window.requestAnimationFrame(() => {
      void fitView({ duration: 0, padding: 0.18 })
    })
    return () => window.cancelAnimationFrame(raf)
  }, [fitView])

  // Liquid-glass CSS-переменные ставим ОДИН раз на wrapper — они наследуются
  // всеми .customNode через CSS cascade. Раньше мы вычисляли их на каждой из
  // 500 нод в inline style → 500 object allocations на mount. Теперь один.
  useEffect(() => {
    const el = flowCanvasRef.current
    if (!el) return
    if (liquidGlassEnabled) {
      el.style.setProperty('--liquid-glass-blur', `${liquidGlassBlur * 20}px`)
      el.style.setProperty('--liquid-glass-alpha', String(0.4 + (1 - liquidGlassBlur) * 0.5))
    } else {
      el.style.setProperty('--liquid-glass-blur', '0px')
      el.style.setProperty('--liquid-glass-alpha', '1')
    }
  }, [liquidGlassEnabled, liquidGlassBlur])

  const handleFabAdd = useCallback(() => {
    const rect = flowCanvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const screenCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const flowCenter = screenToFlowPosition(screenCenter)
    onPaneClickCreateRef.current?.(flowCenter.x, flowCenter.y)
  }, [screenToFlowPosition])

  return (
    <div
      ref={flowCanvasRef}
      className={`flowCanvas${showNodeNameOnCanvas ? ' show-node-labels' : ''}${liquidGlassEnabled ? ' liquid-glass-enabled' : ''}`}
      // Запрещаем стандартное контекстное меню браузера на холсте.
      onContextMenu={(e) => e.preventDefault()}
      // MMB по пустому месту — создаём ноду.
      onMouseDown={handleMouseDown}
      // DnD из палитры нод даёт более точный placement прямо на canvas.
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ position: 'relative', minWidth: 0, minHeight: 0 }}
    >
      {dragPreview ? (
        <div
          className="flowCanvasDropPreview"
          style={{
            left: dragPreview.localX,
            top: dragPreview.localY
          }}
        >
          <div className="flowCanvasDropPreviewLabel">{dragPreview.type}</div>
          <div className="flowCanvasDropPreviewMeta">
            {dragPreview.flowX}, {dragPreview.flowY}
          </div>
        </div>
      ) : null}

      {canvasBackgroundUrl ? (
        <div
          className="flowCanvasBackgroundLayer"
          style={{
            // В режиме viewport фон не живёт внутри canvas bounds,
            // а закрепляется на весь экран редактора.
            position: canvasBackgroundAttachment === 'viewport' ? 'fixed' : 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage: `url("${canvasBackgroundUrl}")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundSize:
              canvasBackgroundMode === 'stretch' ? '100% 100%' : 'cover',
            // Прозрачность управляется из Preferences,
            // чтобы фон не мешал читать граф и сетку.
            opacity: canvasBackgroundOpacity
          }}
        />
      ) : null}
      <NodeActionsProvider addBranch={onParallelAddBranch} removeBranch={onParallelRemoveBranch}>
        <ReactFlow
          defaultNodes={initialNodes}
          defaultEdges={initialEdges}
          nodeTypes={cutsceneNodeTypes as NodeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
        // Initial fitView делаем через rAF после монтирования, чтобы xyflow успел
        // замерить ноды и посчитать bounds. Убираем водяной знак React Flow.
        proOptions={RF_PRO_OPTIONS}
        // Панорамирование холста — только ПКМ (кнопка 2).
        panOnDrag={RF_PAN_ON_DRAG}
        // Явно разрешаем выделение элементов и рамочное выделение,
        // чтобы xyflow не зависел от внутренних дефолтов между версиями.
        elementsSelectable
        selectNodesOnDrag={false}
        // ЛКМ drag по пустому месту — рамка выделения (area select).
        selectionOnDrag
        // Режим выделения: достаточно задеть кусочек ноды, не нужно полное покрытие.
        selectionMode={SelectionMode.Partial}
        // Настройки зума: увеличенный диапазон.
        minZoom={0.1}
        maxZoom={4}
        // Держим ноды смонтированными во время pan/fitView.
        // Встроенная visible-elements виртуализация пересчитывала видимость на каждом движении viewport
        // и могла давать дорогой mount/unmount + paint spike на больших графах.
        // Отключаем встроенный wheel zoom, чтобы не было конфликта с нашим handler.
        zoomOnScroll={false}
        // ПКМ по ноде — удаляем.
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeClick={handleEdgeClick}
        // ПКМ по связи — удаляем.
        onEdgeContextMenu={handleEdgeContextMenu}
        // Двойной клик по ребру — выбираем и фокусируем wait input.
        onEdgeDoubleClick={handleEdgeDoubleClick}
        // ЛКМ по холсту — создаём ноду.
        onPaneClick={handlePaneClick}
        // Когда пользователь выделяет рамкой — синхронизируем мультивыделение.
        // Дополнительно защищаемся от бесконечного цикла: не вызываем onSelectNodes,
        // если фактическое выделение не изменилось относительно пропсов.
        onSelectionChange={handleSelectionChange}
        // Отключаем встроенное удаление, потому что мы обрабатываем Backspace/Delete глобально
        // в useEditorShortcuts и удаляем элементы из runtime state (Single Source of Truth).
        deleteKeyCode={null}
        style={RF_STYLE}
      >
        {/* Размер сетки теперь реально читается из Preferences,
            чтобы настройка grid size меняла canvas, а не висела мёртвым полем. */}
        <ScaledBackground />
        {/* LOD: переключает zoomLow/zoomVeryLow классы на корне .react-flow.
            Подписывается на zoom через useStore, не трогая ноды. */}
        <ZoomLODController />
        {showMiniMap ? (
          <MiniMap
            nodeColor="#7ea4ff"
            nodeStrokeColor="#4a6fcb"
            nodeBorderRadius={2}
            nodeStrokeWidth={1}
            maskColor="rgba(0, 0, 0, 0.5)"
            maskStrokeColor="rgba(126, 164, 255, 0.35)"
            maskStrokeWidth={1}
            style={RF_MINIMAP_STYLE}
          />
        ) : null}
        <Controls showInteractive={false} />
        {/* Кнопка создания ноды, вынесенная рядом с Controls в нижний левый угол */}
        <Panel position="bottom-left" style={RF_FAB_PANEL_STYLE}>
          <button
            className="actionButtonPlus"
            onClick={handleFabAdd}
            title="Add New Node (Middle Click)"
            aria-label="Add Node"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </Panel>
        </ReactFlow>
      </NodeActionsProvider>
    </div>
  )
})

// Обёртка: useReactFlow работает только внутри ReactFlowProvider.
// Поэтому экспортируем FlowCanvas, который оборачивает FlowCanvasInner.
// Главный компонент холста, который мы экспортируем.
// Он оборачивает внутреннюю логику в FlowCanvasInner и добавляет ReactFlowProvider,
// без которого инструменты React Flow не будут работать.
export const FlowCanvas = memo((props: FlowCanvasProps): React.JSX.Element => {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  )
})
