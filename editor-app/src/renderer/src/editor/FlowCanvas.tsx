import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Position,
  SelectionMode,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { RuntimeEdge, RuntimeNode } from './runtimeTypes'
import { cutsceneNodeTypes } from './nodes'

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

  // Коллбек: удалить ноду и все её связи (ПКМ по ноде).
  onNodeDelete: (nodeId: string) => void

  // Коллбек: создать новую ноду в указанной позиции (MMB по холсту).
  onPaneClickCreate: (x: number, y: number) => void

  // Коллбек: удалить связь (ПКМ по связи).
  onEdgeDelete: (edgeId: string) => void

  // Коллбек: двойной клик по ребру — выбрать и сфокусировать wait input.
  onEdgeDoubleClick?: (edgeId: string) => void
}

// Внутренний компонент холста (нужен useReactFlow, который работает только внутри ReactFlowProvider).
const FlowCanvasInner = ({
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
  onNodeDelete,
  onPaneClickCreate,
  onEdgeDelete,
  onEdgeDoubleClick
}: FlowCanvasProps): React.JSX.Element => {
  // Нужен для конвертации экранных координат в координаты холста.
  const { screenToFlowPosition, getNodes } = useReactFlow()

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
  selectedNodeIdRef.current = selectedNodeId
  selectedNodeIdsRef.current = selectedNodeIds
  selectedEdgeIdRef.current = selectedEdgeId

  // Строим узлы React Flow из runtime-данных.
  // ВАЖНО: НЕ включаем selected сюда — выделение синхронизируем отдельным эффектом.
  // Это разрывает цикл: runtime → initialNodes → setNodes → StoreUpdater → onSelectionChange → setRuntime.
  const initialNodes = useMemo<Node[]>(() => {
    return runtimeNodes.map((node, index) => ({
      id: node.id,
      // Используем кастомный тип ноды, если он зарегистрирован.
      // Если нет — React Flow покажет дефолтный узел.
      type: node.type in cutsceneNodeTypes ? (node.type as any) : undefined,
      // Если позиция сохранена — берём её, иначе раскладываем по сетке.
      position: node.position ?? { x: 120 + index * 250, y: 150 },
      // Точки соединения слева/справа — поток читается слева направо.
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      data: {
        // Метка для отображения в ноде.
        label: node.name && node.name.length > 0 ? node.name : node.type,
        // Параметры ноды (для кастомных компонентов).
        params: node.params ?? {},
        // Коллбек для parallel — не сохраняем в runtime.json, это чисто UI.
        onAddParallelBranch: onParallelAddBranch
      }
    }))
  }, [runtimeNodes])

  // Строим связи React Flow из runtime-данных.
  // Аналогично нодам — без selected, чтобы не создавать петлю.
  const initialEdges = useMemo<Edge[]>(() => {
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

  // Локальное состояние узлов React Flow.
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  // Локальное состояние связей между узлами.
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Синхронизируем данные нод (без выделения) когда runtime меняется.
  useEffect(() => {
    setNodes((prev) => {
      // Сохраняем текущее выделение React Flow при обновлении данных.
      const selectionMap = new Map<string, boolean>()
      for (const n of prev) {
        if (n.selected) selectionMap.set(n.id, true)
      }
      return initialNodes.map((n) => ({
        ...n,
        selected: selectionMap.get(n.id) ?? false
      }))
    })
  }, [initialNodes, setNodes])

  // Синхронизируем данные рёбер (без выделения) когда runtime меняется.
  useEffect(() => {
    setEdges((prev) => {
      const selectionMap = new Map<string, boolean>()
      for (const e of prev) {
        if (e.selected) selectionMap.set(e.id, true)
      }
      return initialEdges.map((e) => ({
        ...e,
        selected: selectionMap.get(e.id) ?? false
      }))
    })
  }, [initialEdges, setEdges])

  // Отдельно синхронизируем выделение нод, когда selection в runtime меняется.
  // Это разделение — ключ к отсутствию бесконечного цикла.
  useEffect(() => {
    const nodeIdSet = new Set(selectedNodeIds ?? [])
    if (selectedNodeId) nodeIdSet.add(selectedNodeId)
    setNodes((prev) =>
      prev.map((n) => {
        const shouldSelect = nodeIdSet.has(n.id)
        if (n.selected === shouldSelect) return n
        return { ...n, selected: shouldSelect }
      })
    )
  }, [selectedNodeId, selectedNodeIds, setNodes])

  // Отдельно синхронизируем выделение рёбер.
  useEffect(() => {
    setEdges((prev) =>
      prev.map((e) => {
        const shouldSelect = e.id === selectedEdgeId
        if (e.selected === shouldSelect) return e
        return { ...e, selected: shouldSelect }
      })
    )
  }, [selectedEdgeId, setEdges])

  // Ref чтобы не пересоздавать коллбек при каждом рендере.
  const positionCallbackRef = useRef(onNodePositionChange)
  positionCallbackRef.current = onNodePositionChange

  // Ref для runtimeNodes, чтобы handleNodesChange не зависел от замыкания.
  const runtimeNodesRef = useRef(runtimeNodes)
  runtimeNodesRef.current = runtimeNodes

  // Обёртка над onNodesChange: ловим конец перетаскивания и сохраняем позицию.
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes)

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
    [getNodes, onNodesChange]
  )

  // При соединении нод — создаём ребро и сообщаем runtime.
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const newEdge: RuntimeEdge = {
        id: `edge-${connection.source}-${connection.sourceHandle ?? 'out'}-${connection.target}-${connection.targetHandle ?? 'in'}`,
        source: connection.source,
        sourceHandle: connection.sourceHandle ?? undefined,
        target: connection.target,
        targetHandle: connection.targetHandle ?? undefined
      }
      setEdges((prev) => addEdge(connection, prev))
      onEdgeAdd(newEdge)
      // Устанавливаем флаг, чтобы следующий клик по холсту не создавал ноду.
      justConnectedRef.current = true
    },
    [setEdges, onEdgeAdd]
  )

  // При удалении рёбер — сообщаем runtime.
  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes)

      for (const change of changes) {
        if (change.type === 'remove') {
          onEdgeRemove(change.id)
        }
      }
    },
    [onEdgesChange, onEdgeRemove]
  )

  // ПКМ по ноде — удаляем её и все связанные рёбра.
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault()
      onNodeDelete(node.id)
    },
    [onNodeDelete]
  )

  // ЛКМ по холсту — создаём новую ноду в позиции курсора.
  // ПКМ по холсту — React Flow сам панорамирует (panOnDrag={[2]).
  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
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
        onSelectEdge(null)
        onSelectNodes([])
      }
    },
    [onSelectEdge, onSelectNodes]
  )

  // MMB по холсту — создаём новую ноду.
  // Используем MouseDown, потому что "click" обычно срабатывает только для ЛКМ.
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Только MMB.
      if (event.button !== 1) return

      // Разрешаем создание ноды только если клик пришёл по пустому месту (pane).
      const target = event.target as HTMLElement | null
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

      onPaneClickCreate(flowPosition.x, flowPosition.y)
    },
    [screenToFlowPosition, onPaneClickCreate]
  )

  return (
    <div
      className="flowCanvas"
      // Запрещаем стандартное контекстное меню браузера на холсте.
      onContextMenu={(e) => e.preventDefault()}
      // MMB по пустому месту — создаём ноду.
      onMouseDown={handleMouseDown}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={cutsceneNodeTypes as any}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        fitView
        // Убираем водяной знак React Flow.
        proOptions={{ hideAttribution: true }}
        // Панорамирование холста — только ПКМ (кнопка 2).
        panOnDrag={[2]}

        // ЛКМ drag по пустому месту — рамка выделения (area select).
        selectionOnDrag
        // Режим выделения: достаточно задеть кусочек ноды, не нужно полное покрытие.
        selectionMode={SelectionMode.Partial}
        // ЛКМ по ноде — выбираем.
        onNodeClick={(_, node) => {
          onSelectEdge(null)
          onSelectNodes([node.id])
        }}
        // ПКМ по ноде — удаляем.
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeClick={(_, edge) => {
          if ((edge as any).selectable === false) return
          onSelectNodes([])
          onSelectEdge(edge.id)
        }}
        // ПКМ по связи — удаляем.
        onEdgeContextMenu={(_, edge) => {
          onEdgeDelete(edge.id)
        }}
        // Двойной клик по ребру — выбираем и фокусируем wait input.
        onEdgeDoubleClick={(_, edge) => {
          if ((edge as any).selectable === false) return
          onSelectNodes([])
          onSelectEdge(edge.id)
          onEdgeDoubleClick?.(edge.id)
        }}
        // ЛКМ по холсту — создаём ноду.
        onPaneClick={handlePaneClick}

        // Когда пользователь выделяет рамкой — синхронизируем мультивыделение.
        // Дополнительно защищаемся от бесконечного цикла: не вызываем onSelectNodes,
        // если фактическое выделение не изменилось относительно пропсов.
        onSelectionChange={(sel) => {
          const ids = (sel?.nodes ?? []).map((n: any) => String(n.id))

          // Если мы сами пытаемся снять выделение — игнорируем события,
          // пока React Flow не пришлёт пустое выделение.
          if (ignoreSelectionUntilEmptyRef.current) {
            if (ids.length === 0) {
              ignoreSelectionUntilEmptyRef.current = false
            }
            return
          }

          // Используем refs, чтобы всегда сравнивать с актуальным состоянием,
          // а не с устаревшим замыканием (stale closure). Это ключ к отсутствию петли.
          const nextSelectedNodeId = ids.length === 1 ? ids[0] : null
          const prevIds = selectedNodeIdsRef.current ?? []
          const currentNodeId = selectedNodeIdRef.current

          const sameLength = prevIds.length === ids.length
          const sameSet =
            sameLength &&
            ids.every((id) => prevIds.includes(id)) &&
            prevIds.every((id) => ids.includes(id))

          if (sameSet && currentNodeId === nextSelectedNodeId) {
            return
          }

          onSelectNodes(ids)
        }}
      >
        <Background color="#262b2f" gap={18} size={1} />
        <MiniMap
          zoomable
          pannable
          nodeColor="#7ea4ff"
          maskColor="rgba(7, 10, 12, 0.6)"
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

// Обёртка: useReactFlow работает только внутри ReactFlowProvider.
// Поэтому экспортируем FlowCanvas, который оборачивает FlowCanvasInner.
export const FlowCanvas = (props: FlowCanvasProps): React.JSX.Element => {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
