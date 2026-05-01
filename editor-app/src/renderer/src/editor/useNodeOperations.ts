/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { startTransition, useCallback } from 'react'
import type { RuntimeNode, RuntimeEdge, RuntimeState } from './runtimeTypes'

// Простой генератор уникального имени.
// Если имя уже занято — добавляем постфикс ` (0)`, ` (1)` и т.д.
export const suggestUniqueNodeName = (baseName: string, takenNames: Set<string>): string => {
  const trimmed = baseName.trim()
  if (!trimmed) return ''
  if (!takenNames.has(trimmed)) return trimmed
  let i = 0
  while (takenNames.has(`${trimmed} (${i})`)) i++
  return `${trimmed} (${i})`
}

// Параметры, которые нужны хуку для работы с нодами.
type UseNodeOperationsDeps = {
  // Текущее runtime-состояние (читаем для создания нод с привязкой к выбранной).
  runtime: RuntimeState
  // Обновление runtime.
  setRuntime: React.Dispatch<React.SetStateAction<RuntimeState>>
  // Ref на флаг фокусировки wait-input после двойного клика по ребру.
  shouldFocusEdgeWaitRef: React.MutableRefObject<boolean>
}

// Хук управляет всеми операциями с нодами на холсте:
// создание нод разных типов, удаление, добавление/удаление parallel веток,
// обработка выбора нод/рёбер, позиционирование при drag.
// Дефолтные параметры для каждого типа ноды.
// Вынесены за пределы хука, чтобы не аллоцировать десятки вложенных
// объектов/массивов на каждое создание ноды (O(1) вместо O(типы нод)).
const DEFAULT_PARAMS_BY_TYPE: Record<string, Record<string, unknown>> = {
  dialogue: { file: '', node: '' },
  wait_for_dialogue: { dialogue_controller: '' },
  move: { target: 'player', x: 0, y: 0, speed_px_sec: 60, collision: false },
  follow_path: { target: 'player', points: [], speed_px_sec: 60, collision: false },
  set_position: { target: 'player', x: 0, y: 0 },
  actor_create: { key: '', sprite_or_object: '', copy_from: '', x: 0, y: 0 },
  actor_destroy: { target: 'player' },
  animate: { target: 'player', sprite: '', image_index: 0, image_speed: 1 },
  camera_track: { target: 'player', seconds: 1, offset_x: 0, offset_y: 0 },
  camera_track_until_stop: { target: 'player', offset_x: 0, offset_y: 0 },
  camera_pan: { x: 0, y: 0, seconds: 1 },
  camera_pan_obj: { target: 'player', seconds: 1 },
  camera_center: { x: 0, y: 0 },
  set_depth: { target: 'player', depth: 0 },
  set_facing: { target: 'player', direction: 'right' },
  branch: { condition: '' },
  run_function: { function: '', args: '' },
  camera_shake: { seconds: 1, magnitude: 4 },
  auto_facing: { target: 'player', enabled: true },
  auto_walk: { target: 'player', enabled: true },
  tween: { kind: 'instance', target: 'player', property: 'x', to: 0, seconds: 1, easing: 'linear' },
  tween_camera: { property: 'x', to_value: 0, seconds: 1, easing: 'linear', from_value: undefined },
  set_property: { kind: 'instance', target: 'player', property: 'image_alpha', value: 1 },
  fade_in: { seconds: 0.5, color: 'black' },
  fade_out: { seconds: 0.5, color: 'black' },
  play_sfx: { sound: '', volume: 1, pitch: 1 },
  emote: { target: 'player', sprite: '', seconds: 1, offset_x: 0, offset_y: -24, scale: 1, wait: false },
  jump: { target: 'player', x: 0, y: 0, seconds: 0.5, height: 16, easing: 'linear' },
  halt: { target: 'player' },
  flip: { target: 'player', flipped: true },
  spin: { target: 'player', speed: 10, seconds: 1 },
  shake_object: { target: 'player', seconds: 0.5, magnitude: 4 },
  set_visible: { target: 'player', visible: true },
  instant_mode: { enabled: true },
  mark_node: { name: '' }
}

export function useNodeOperations(deps: UseNodeOperationsDeps) {
  const { runtime, setRuntime, shouldFocusEdgeWaitRef } = deps

  // Стабильные коллбеки для FlowCanvas — обязательно useCallback,
  // иначе каждый рендер EditorShell будет создавать новые функции,
  // и memo(FlowCanvas) не сработает, вызывая перерендер 500+ нод.
  // Все используют функциональную форму setRuntime, чтобы не зависеть от runtime.

  // Выбор нод на холсте — обновляет selectedNodeId/selectedNodeIds.
  const handleSelectNodes = useCallback(
    (nodeIds: string[]) => {
      const nextSelectedNodeId = nodeIds.length === 1 ? nodeIds[0] : null
      startTransition(() => {
        setRuntime((prev) => {
          const currentIds = prev.selectedNodeIds ?? []
          const sameLength = currentIds.length === nodeIds.length
          let sameIds = sameLength
          if (sameIds && nodeIds.length > 0) {
            const currentSet = new Set(currentIds)
            sameIds = nodeIds.every((id) => currentSet.has(id))
          }
          if (
            prev.selectedEdgeId === null &&
            prev.selectedNodeId === nextSelectedNodeId &&
            sameIds
          ) {
            return prev
          }
          return {
            ...prev,
            selectedNodeId: nextSelectedNodeId,
            selectedNodeIds: nodeIds,
            selectedEdgeId: null
          }
        })
      })
    },
    [setRuntime]
  )

  // Выбор ребра на холсте.
  const handleSelectEdge = useCallback(
    (edgeId: string | null) => {
      startTransition(() => {
        setRuntime((prev) => {
          if (
            prev.selectedEdgeId === edgeId &&
            prev.selectedNodeId === null &&
            (prev.selectedNodeIds?.length ?? 0) === 0
          ) {
            return prev
          }
          return {
            ...prev,
            selectedNodeId: null,
            selectedNodeIds: [],
            selectedEdgeId: edgeId
          }
        })
      })
    },
    [setRuntime]
  )

  // Обновление позиций нод при drag на холсте.
  // Используем startTransition, чтобы не блокировать UI.
  const handleNodePositionChange = useCallback(
    (changes: Array<{ id: string; x: number; y: number }>) => {
      const posMap = new Map(changes.map((c) => [c.id, { x: c.x, y: c.y }]))
      startTransition(() => {
        setRuntime((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => {
            const newPos = posMap.get(n.id)
            return newPos ? { ...n, position: newPos } : n
          })
        }))
      })
    },
    [setRuntime]
  )

  // Добавление нового ребра (соединение между нодами).
  const handleEdgeAdd = useCallback(
    (edge: RuntimeEdge) => {
      setRuntime((prev) => {
        if (prev.edges.some((e) => e.id === edge.id)) return prev
        return { ...prev, edges: [...prev.edges, edge] }
      })
    },
    [setRuntime]
  )

  // Удаление ребра по id.
  const handleEdgeRemove = useCallback(
    (edgeId: string) => {
      setRuntime((prev) => ({
        ...prev,
        edges: prev.edges.filter((e) => e.id !== edgeId)
      }))
    },
    [setRuntime]
  )

  // Удаление ноды по id — также удаляет все рёбра, связанные с этой нодой.
  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      setRuntime((prev) => {
        const nextSelectedNodeIds = (prev.selectedNodeIds ?? []).filter((id) => id !== nodeId)
        return {
          ...prev,
          nodes: prev.nodes.filter((n) => n.id !== nodeId),
          edges: prev.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
          selectedNodeId: prev.selectedNodeId === nodeId ? null : prev.selectedNodeId,
          selectedNodeIds: nextSelectedNodeIds,
          selectedEdgeId: null
        }
      })
    },
    [setRuntime]
  )

  // Удаление ребра по id (из контекстного меню или клавишей).
  const handleEdgeDelete = useCallback(
    (edgeId: string) => {
      setRuntime((prev) => ({
        ...prev,
        edges: prev.edges.filter((e) => e.id !== edgeId),
        selectedEdgeId: prev.selectedEdgeId === edgeId ? null : prev.selectedEdgeId
      }))
    },
    [setRuntime]
  )

  // Двойной клик по ребру — ставим флаг для фокусировки на wait input.
  const handleEdgeDoubleClick = useCallback(() => {
    shouldFocusEdgeWaitRef.current = true
  }, [shouldFocusEdgeWaitRef])

  // Универсальное создание ноды по типу и позиции.
  // Это общий источник правды для palette click, MMB create и DnD placement на canvas.
  const createNodeAtPosition = useCallback(
    (type: string, position: { x: number; y: number }, connectFromNodeId?: string | null) => {
      const takenNames = new Set<string>(
        runtime.nodes.map((n) => String(n.name ?? '').trim()).filter((value) => value.length > 0)
      )

      // Для parallel_start создаём пару (start + join) + внутреннее ребро.
      if (type === 'parallel_start') {
        const startId = `pstart-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        const joinId = `pjoin-${Date.now()}-${Math.floor(Math.random() * 1000)}`

        const startName = suggestUniqueNodeName('Node', takenNames)
        takenNames.add(startName)
        const joinName = suggestUniqueNodeName('Node', takenNames)

        const startNode: RuntimeNode = {
          id: startId,
          type: 'parallel_start',
          name: startName,
          position: { x: position.x, y: position.y },
          params: { joinId, branches: ['b0'] }
        }

        const joinNode: RuntimeNode = {
          id: joinId,
          type: 'parallel_join',
          name: joinName,
          position: { x: position.x + 300, y: position.y },
          params: { pairId: startId, branches: ['b0'] }
        }

        // Внутреннее ребро, связывающее start и join (pair handle).
        const pairEdge: RuntimeEdge = {
          id: `edge-pair-${startId}-${joinId}`,
          source: startId,
          sourceHandle: '__pair',
          target: joinId,
          targetHandle: '__pair'
        }

        // Дополнительное ребро от выбранной ноды к новой parallel_start.
        const extraEdges = connectFromNodeId
          ? [{ id: `edge-${connectFromNodeId}-${startId}`, source: connectFromNodeId, target: startId }]
          : []

        setRuntime((prev) => ({
          ...prev,
          nodes: [...prev.nodes, startNode, joinNode],
          edges: [...prev.edges, ...extraEdges, pairEdge],
          selectedNodeId: startId,
          selectedNodeIds: [startId],
          selectedEdgeId: null
        }))
        return
      }

      const newId = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`

      const newNode: RuntimeNode = {
        id: newId,
        type,
        name: suggestUniqueNodeName('Node', takenNames),
        text: '',
        position: { x: position.x, y: position.y },
        params: DEFAULT_PARAMS_BY_TYPE[type]
      }

      // Если указана нода-источник — добавляем ребро от неё к новой ноде.
      const newEdges = connectFromNodeId
        ? [...runtime.edges, { id: `edge-${connectFromNodeId}-${newId}`, source: connectFromNodeId, target: newId }]
        : runtime.edges

      setRuntime((prev) => ({
        ...prev,
        nodes: [...prev.nodes, newNode],
        edges: newEdges,
        selectedNodeId: newId,
        selectedNodeIds: [newId],
        selectedEdgeId: null
      }))
    },
    [runtime, setRuntime]
  )

  // Palette-click добавляет ноду справа от выбранного узла,
  // сохраняя старое удобное поведение для быстрого graph-building.
  const addNode = useCallback(
    (type: string) => {
      const anchor =
        runtime.nodes.find((n) => n.id === runtime.selectedNodeId) ??
        runtime.nodes[runtime.nodes.length - 1] ??
        null

      const anchorPos = anchor?.position ?? { x: 100, y: 150 }
      createNodeAtPosition(type, { x: anchorPos.x + 250, y: anchorPos.y }, anchor?.id ?? null)
    },
    [createNodeAtPosition, runtime.nodes, runtime.selectedNodeId]
  )

  // MMB-create — быстрый способ поставить dialogue ноду в точку курсора.
  const createDefaultPaneNode = useCallback(
    (x: number, y: number) => {
      createNodeAtPosition('dialogue', { x, y }, null)
    },
    [createNodeAtPosition]
  )

  // Drop из palette создаёт ноду указанного типа в точке drop.
  const createPaletteDropNode = useCallback(
    (type: string, x: number, y: number) => {
      createNodeAtPosition(type, { x, y }, null)
    },
    [createNodeAtPosition]
  )

  // Добавляем новую ветку в параллель (start+join).
  // Меняем branches сразу в обоих нодах, чтобы handles совпадали.
  const onParallelAddBranch = useCallback(
    (parallelStartId: string) => {
      setRuntime((prevRuntime) => {
        const startNode = prevRuntime.nodes.find((n) => n.id === parallelStartId)
        if (!startNode) return prevRuntime
        const joinId =
          typeof startNode.params?.joinId === 'string' ? (startNode.params?.joinId as string) : ''
        const joinNode = prevRuntime.nodes.find((n) => n.id === joinId)
        if (!joinNode) return prevRuntime

        const branches = (
          Array.isArray(startNode.params?.branches) ? startNode.params?.branches : ['b0']
        ) as string[]
        const newBranchId = `b${branches.length}`
        const nextBranches = [...branches, newBranchId]

        const nextNodes = prevRuntime.nodes.map((n) => {
          if (n.id === startNode.id) {
            return { ...n, params: { ...(n.params ?? {}), branches: nextBranches } }
          }
          if (n.id === joinNode.id) {
            return { ...n, params: { ...(n.params ?? {}), branches: nextBranches } }
          }
          return n
        })

        return {
          ...prevRuntime,
          nodes: nextNodes
        }
      })
    },
    [setRuntime]
  )

  // Удаляем последнюю ветку у parallel.
  // Важно: сами ноды внутри ветки не трогаем — убираем только slot ветки и связанные рёбра.
  const onParallelRemoveBranch = useCallback(
    (parallelStartId: string) => {
      setRuntime((prevRuntime) => {
        const startNode = prevRuntime.nodes.find((n) => n.id === parallelStartId)
        if (!startNode) return prevRuntime

        const joinId =
          typeof startNode.params?.joinId === 'string' ? (startNode.params?.joinId as string) : ''
        const joinNode = prevRuntime.nodes.find((n) => n.id === joinId)
        if (!joinNode) return prevRuntime

        const branches = (
          Array.isArray(startNode.params?.branches) ? startNode.params?.branches : ['b0']
        ) as string[]

        if (branches.length <= 1) return prevRuntime

        const removedBranchId = branches[branches.length - 1]
        const nextBranches = branches.slice(0, -1)
        const removedSourceHandle = `out_${removedBranchId}`
        const removedTargetHandle = `in_${removedBranchId}`

        const nextNodes = prevRuntime.nodes.map((n) => {
          if (n.id === startNode.id) {
            return { ...n, params: { ...(n.params ?? {}), branches: nextBranches } }
          }
          if (n.id === joinNode.id) {
            return { ...n, params: { ...(n.params ?? {}), branches: nextBranches } }
          }
          return n
        })

        // Удаляем рёбра, связанные с удалённой веткой.
        const removedEdgeIds = new Set(
          prevRuntime.edges
            .filter(
              (edge) =>
                (edge.source === startNode.id && edge.sourceHandle === removedSourceHandle) ||
                (edge.target === joinNode.id && edge.targetHandle === removedTargetHandle)
            )
            .map((edge) => edge.id)
        )

        const nextEdges = prevRuntime.edges.filter((edge) => !removedEdgeIds.has(edge.id))

        return {
          ...prevRuntime,
          nodes: nextNodes,
          edges: nextEdges,
          selectedEdgeId:
            prevRuntime.selectedEdgeId && removedEdgeIds.has(prevRuntime.selectedEdgeId)
              ? null
              : prevRuntime.selectedEdgeId
        }
      })
    },
    [setRuntime]
  )

  // Создаём новую follow_path-ноду из visual editor path import.
  // Позицию ставим правее выбранного узла или последнего узла.
  const createFollowPathNodeFromVisualEditing = useCallback(
    (points: Array<{ x: number; y: number }>) => {
      setRuntime((prev) => {
        const newId = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        const takenNames = new Set<string>(
          prev.nodes.map((n) => String(n.name ?? '').trim()).filter((value) => value.length > 0)
        )

        const anchor =
          prev.nodes.find((node) => node.id === prev.selectedNodeId) ??
          prev.nodes[prev.nodes.length - 1] ??
          null
        const anchorPos = anchor?.position ?? { x: 100, y: 150 }

        const newNode: RuntimeNode = {
          id: newId,
          type: 'follow_path',
          name: suggestUniqueNodeName('Node', takenNames),
          text: '',
          position: { x: anchorPos.x + 250, y: anchorPos.y },
          params: {
            target: '',
            speed_px_sec: 60,
            collision: false,
            points
          }
        }

        const newEdges = anchor
          ? [...prev.edges, { id: `edge-${anchor.id}-${newId}`, source: anchor.id, target: newId }]
          : prev.edges

        return {
          ...prev,
          nodes: [...prev.nodes, newNode],
          edges: newEdges,
          selectedNodeId: newId,
          selectedNodeIds: [newId],
          selectedEdgeId: null
        }
      })
    },
    [setRuntime]
  )

  return {
    handleSelectNodes,
    handleSelectEdge,
    handleNodePositionChange,
    handleEdgeAdd,
    handleEdgeRemove,
    handleNodeDelete,
    handleEdgeDelete,
    handleEdgeDoubleClick,
    createNodeAtPosition,
    addNode,
    createDefaultPaneNode,
    createPaletteDropNode,
    onParallelAddBranch,
    onParallelRemoveBranch,
    createFollowPathNodeFromVisualEditing
  }
}
