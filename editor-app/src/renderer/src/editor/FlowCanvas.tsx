import { useEffect, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { RuntimeNode } from './runtimeTypes'

// Пропсы для холста: список узлов и выбранный узел.
type FlowCanvasProps = {
  // Узлы runtime-json, которые показываем на холсте.
  runtimeNodes: RuntimeNode[]

  // ID выбранного узла (для подсветки и инспектора).
  selectedNodeId: string | null

  // Коллбек, когда пользователь выбирает узел.
  onSelectNode: (nodeId: string | null) => void
}

// Простой холст React Flow для первого запуска.
export const FlowCanvas = ({ runtimeNodes, selectedNodeId, onSelectNode }: FlowCanvasProps): React.JSX.Element => {
  // Строим узлы React Flow из runtime-данных.
  const initialNodes = useMemo<Node[]>(() => {
    return runtimeNodes.map((node, index) => {
      return {
        id: node.id,
        position: { x: 120 + index * 180, y: 120 + index * 80 },
        data: {
          // Если текста нет — показываем тип, чтобы узел был виден.
          label: node.text && node.text.length > 0 ? node.text : node.type
        },
        selected: node.id === selectedNodeId
      }
    })
  }, [runtimeNodes, selectedNodeId])

  // Для стартовой версии создаём связи между соседними узлами.
  const initialEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = []
    for (let i = 1; i < runtimeNodes.length; i += 1) {
      const source = runtimeNodes[i - 1].id
      const target = runtimeNodes[i].id
      // Связь просто показывает порядок узлов на холсте.
      edges.push({ id: `edge-${source}-${target}`, source, target })
    }
    return edges
  }, [runtimeNodes])

  // Локальное состояние узлов React Flow.
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  // Локальное состояние связей между узлами.
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Синхронизируем локальные узлы, когда runtime меняется.
  useEffect(() => {
    setNodes(initialNodes)
  }, [initialNodes, setNodes])

  // Синхронизируем локальные ребра с runtime-узлами.
  useEffect(() => {
    setEdges(initialEdges)
  }, [initialEdges, setEdges])

  // При соединении нод создаём локальное ребро (пока без сохранения в runtime-json).
  const onConnect = (connection: Connection) => {
    setEdges((prev) => addEdge(connection, prev))
  }

  return (
    <div className="flowCanvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onPaneClick={() => onSelectNode(null)}
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
