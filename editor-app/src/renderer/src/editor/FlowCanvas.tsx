import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Position,
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

  // Коллбек, когда пользователь перетащил узел — сохраняем позицию в runtime.
  onNodePositionChange: (nodeId: string, x: number, y: number) => void

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
  const { screenToFlowPosition } = useReactFlow()

  // Флаг, чтобы игнорировать следующий клик по холсту после создания связи.
  const justConnectedRef = useRef(false)
  // Строим узлы React Flow из runtime-данных.
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
      },
      // Поддерживаем и single-select, и multi-select.
      selected: node.id === selectedNodeId || selectedNodeIds.includes(node.id)
    }))
  }, [runtimeNodes, selectedNodeId, selectedNodeIds, onParallelAddBranch])

  // Строим связи React Flow из runtime-данных.
  const initialEdges = useMemo<Edge[]>(() => {
    return runtimeEdges.map((e) => {
      const isInternalPair = e.sourceHandle === '__pair' && e.targetHandle === '__pair'

      return {
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,

        // Подсветка выбранного ребра.
        selected: e.id === selectedEdgeId,

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
  }, [runtimeEdges, selectedEdgeId])

  // Локальное состояние узлов React Flow.
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  // Локальное состояние связей между узлами.
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Синхронизируем локальные узлы, когда runtime меняется извне.
  useEffect(() => {
    setNodes(initialNodes)
  }, [initialNodes, setNodes])

  // Синхронизируем локальные ребра, когда runtime меняется извне.
  useEffect(() => {
    setEdges(initialEdges)
  }, [initialEdges, setEdges])

  // Ref чтобы не пересоздавать коллбек при каждом рендере.
  const positionCallbackRef = useRef(onNodePositionChange)
  positionCallbackRef.current = onNodePositionChange

  // Обёртка над onNodesChange: ловим конец перетаскивания и сохраняем позицию.
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes)

      // Когда пользователь отпустил узел — сохраняем его позицию в runtime.
      for (const change of changes) {
        if (change.type === 'position' && change.dragging === false && change.position) {
          positionCallbackRef.current(change.id, change.position.x, change.position.y)
        }
      }
    },
    [onNodesChange]
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
        onSelectionChange={(sel) => {
          const ids = (sel?.nodes ?? []).map((n: any) => String(n.id))
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
