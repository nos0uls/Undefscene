/* eslint-disable @typescript-eslint/explicit-function-return-type */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RuntimeEdge, RuntimeNode } from '../runtimeTypes'
import { SceneTitleEditor } from './SceneTitleEditor'
import { NodeInspector } from './NodeInspector'
import { EdgeInspector } from './EdgeInspector'
import { InspectorEmptyState } from './InspectorEmptyState'
import type { InspectorPanelProps } from './types'

export const InspectorPanel = React.memo(function InspectorPanel(props: InspectorPanelProps) {
  const {
    runtime,
    setRuntime,
    selectedNode,
    actorTargetOptions,
    resources,
    engineSettings,
    yarnFiles,
    pendingNodeName,
    setPendingNodeName,
    suggestUniqueNodeName,
    setNameConflictModal,
    shouldFocusEdgeWaitRef,
    t
  } = props

  // Локальный стейт для title с debounce: каждый keystroke не должен
  // немедленно обновлять runtime и триггерить валидацию/историю.
  const [localTitle, setLocalTitle] = useState(runtime.title)
  const titleTimeoutRef = useRef<number | null>(null)
  const nameConflictTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (titleTimeoutRef.current) window.clearTimeout(titleTimeoutRef.current)
      if (nameConflictTimeoutRef.current) window.clearTimeout(nameConflictTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    setLocalTitle(runtime.title)
  }, [runtime.title])

  const flushTitle = (value: string) => {
    if (titleTimeoutRef.current) window.clearTimeout(titleTimeoutRef.current)
    titleTimeoutRef.current = null
    setRuntime((prev) => {
      if (value !== prev.title) {
        return { ...prev, title: value }
      }
      return prev
    })
  }

  const debounceTitle = (value: string) => {
    if (titleTimeoutRef.current) window.clearTimeout(titleTimeoutRef.current)
    titleTimeoutRef.current = window.setTimeout(() => {
      flushTitle(value)
    }, 200)
  }

  // --- Helpers (дословно из EditorShell.renderPanelContents) ---

  const updateNode = useCallback(
    (nodeId: string, patch: Partial<RuntimeNode>) => {
      setRuntime((prev) => ({
        ...prev,
        nodes: prev.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node))
      }))
    },
    [setRuntime]
  )

  const stripParallelParams = (params?: RuntimeNode['params']) => {
    if (!params) return undefined
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { joinId, pairId, branches, ...rest } = params
    return rest
  }

  const removeParallelPair = (node: RuntimeNode, nodes: RuntimeNode[], edges: RuntimeEdge[]) => {
    const jId = typeof node.params?.joinId === 'string' ? node.params.joinId : ''
    const pId = typeof node.params?.pairId === 'string' ? node.params.pairId : ''
    const counterpartId =
      node.type === 'parallel_start' ? jId : node.type === 'parallel_join' ? pId : ''

    if (!counterpartId) return { nodes, edges }

    const nextNodes = nodes.filter((n) => n.id !== counterpartId)
    const nextEdges = edges.filter((e) => {
      const isPairEdge =
        e.source === node.id &&
        e.target === counterpartId &&
        e.sourceHandle === '__pair' &&
        e.targetHandle === '__pair'
      return e.source !== counterpartId && e.target !== counterpartId && !isPairEdge
    })

    return { nodes: nextNodes, edges: nextEdges }
  }

  const changeNodeType = useCallback(
    (nodeId: string, nextType: string) => {
      setRuntime((prev) => {
        const currentNode = prev.nodes.find((node) => node.id === nodeId)
        if (!currentNode) return prev

        const takenNames = new Set<string>(
          prev.nodes
            .filter((n) => n.id !== nodeId)
            .map((n) => String(n.name ?? '').trim())
            .filter((v) => v.length > 0)
        )

        let nextNodes = prev.nodes
        let nextEdges = prev.edges
        if (currentNode.type === 'parallel_start' || currentNode.type === 'parallel_join') {
          const cleaned = removeParallelPair(currentNode, nextNodes, nextEdges)
          nextNodes = cleaned.nodes
          nextEdges = cleaned.edges
        }

        const anchorPos = currentNode.position ?? { x: 100, y: 150 }

        if (nextType === 'parallel_start') {
          const newJoinId = `pjoin-${Date.now()}-${Math.floor(Math.random() * 1000)}`
          const joinName = suggestUniqueNodeName('Node', takenNames)

          nextNodes = nextNodes.map((node) =>
            node.id === nodeId
              ? { ...node, type: 'parallel_start', params: { joinId: newJoinId, branches: ['b0'] } }
              : node
          )

          nextNodes = [
            ...nextNodes,
            {
              id: newJoinId,
              type: 'parallel_join',
              name: joinName,
              position: { x: anchorPos.x + 300, y: anchorPos.y },
              params: { pairId: nodeId, branches: ['b0'] }
            } as RuntimeNode
          ]

          nextEdges = [
            ...nextEdges,
            {
              id: `edge-pair-${nodeId}-${newJoinId}`,
              source: nodeId,
              sourceHandle: '__pair',
              target: newJoinId,
              targetHandle: '__pair'
            } as RuntimeEdge
          ]
        } else {
          nextNodes = nextNodes.map((node) =>
            node.id === nodeId
              ? { ...node, type: nextType, params: stripParallelParams(node.params) }
              : node
          )
        }

        return { ...prev, nodes: nextNodes, edges: nextEdges }
      })
    },
    [setRuntime, suggestUniqueNodeName]
  )

  const commitNodeName = useCallback(
    (nodeId: string, nextNameRaw: string) => {
      const nextName = nextNameRaw.trim()
      if (!nextName) {
        updateNode(nodeId, { name: '' })
        return
      }
      setRuntime((prev) => {
        const prevName = prev.nodes.find((n) => n.id === nodeId)?.name ?? ''
        const taken = new Set(
          prev.nodes
            .filter((n) => n.id !== nodeId)
            .map((n) => String(n.name ?? '').trim())
            .filter((v) => v.length > 0)
        )
        if (!taken.has(nextName)) {
          return {
            ...prev,
            nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, name: nextName } : n))
          }
        }
        const conflictingWithNodeId =
          prev.nodes.find((n) => n.id !== nodeId && String(n.name ?? '').trim() === nextName)?.id ??
          ''
        const suggested = suggestUniqueNodeName(nextName, taken)
        if (nameConflictTimeoutRef.current) window.clearTimeout(nameConflictTimeoutRef.current)
        nameConflictTimeoutRef.current = window.setTimeout(() => {
          setNameConflictModal({
            nodeId,
            previousName: prevName,
            conflictingWithNodeId,
            value: suggested
          })
        }, 0)
        return prev
      })
    },
    [setRuntime, suggestUniqueNodeName, updateNode, setNameConflictModal]
  )

  const updateNodeParam = useCallback(
    (nodeId: string, key: string, value: unknown) => {
      setRuntime((prev) => {
        const target = prev.nodes.find((node) => node.id === nodeId)
        if (!target) return prev
        const nextParams = { ...(target.params ?? {}) }
        nextParams[key] = value
        return {
          ...prev,
          nodes: prev.nodes.map((node) =>
            node.id === nodeId ? { ...node, params: nextParams } : node
          )
        }
      })
    },
    [setRuntime]
  )

  const updateEdge = useCallback(
    (edgeId: string, patch: Partial<RuntimeEdge>) => {
      setRuntime((prev) => ({
        ...prev,
        edges: prev.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e))
      }))
    },
    [setRuntime]
  )

  // --- Computed ---
  const incomingCount = useMemo(
    () => (selectedNode ? runtime.edges.filter((e) => e.target === selectedNode.id).length : 0),
    [selectedNode, runtime.edges]
  )
  const outgoingCount = useMemo(
    () => (selectedNode ? runtime.edges.filter((e) => e.source === selectedNode.id).length : 0),
    [selectedNode, runtime.edges]
  )
  const selectedEdge = useMemo(
    () => runtime.edges.find((e) => e.id === runtime.selectedEdgeId) ?? null,
    [runtime.edges, runtime.selectedEdgeId]
  )
  const objectOptions = resources?.objects ?? []
  const spriteOptions = resources?.sprites ?? []
  const spriteOrObjectOptions = useMemo(
    () => [...objectOptions, ...spriteOptions],
    [objectOptions, spriteOptions]
  )

  const allNodeNamesObjects = useMemo(
    () =>
      Array.from(
        new Set(runtime.nodes.map((n) => String(n.name ?? '').trim()).filter((v) => v.length > 0))
      ),
    [runtime.nodes]
  )

  const allConditionVars = useMemo(
    () =>
      Array.from(
        new Set(
          runtime.edges
            .flatMap((e) => [e.conditionVar, e.endConditionVar])
            .map((v) => String(v ?? '').trim())
            .filter((v) => v.length > 0)
        )
      ),
    [runtime.edges]
  )

  const allConditionEquals = useMemo(
    () =>
      Array.from(
        new Set([
          'true',
          'false',
          '1',
          '0',
          ...runtime.edges
            .flatMap((e) => [e.conditionEquals, e.endConditionEquals])
            .map((v) => String(v ?? '').trim())
            .filter((v) => v.length > 0)
        ])
      ),
    [runtime.edges]
  )

  return (
    <div className="runtimeSection">
      <div className="runtimeSectionTitle">{t('editor.inspector', 'Inspector')}</div>
      <SceneTitleEditor
        localTitle={localTitle}
        setLocalTitle={setLocalTitle}
        flushTitle={flushTitle}
        debounceTitle={debounceTitle}
        t={t}
      />
      {selectedNode ? (
        <NodeInspector
          selectedNode={selectedNode}
          pendingNodeName={pendingNodeName}
          setPendingNodeName={setPendingNodeName}
          commitNodeName={commitNodeName}
          changeNodeType={changeNodeType}
          updateNodeParam={updateNodeParam}
          actorTargetOptions={actorTargetOptions}
          spriteOrObjectOptions={spriteOrObjectOptions}
          spriteOptions={spriteOptions}
          objectOptions={objectOptions}
          resources={resources}
          engineSettings={engineSettings}
          yarnFiles={yarnFiles}
          allConditionVars={allConditionVars}
          allConditionEquals={allConditionEquals}
          allNodeNamesObjects={allNodeNamesObjects}
          incomingCount={incomingCount}
          outgoingCount={outgoingCount}
          t={t}
        />
      ) : (
        <InspectorEmptyState t={t} />
      )}

      {selectedEdge && (
        <EdgeInspector
          selectedEdge={selectedEdge}
          updateEdge={updateEdge}
          shouldFocusEdgeWaitRef={shouldFocusEdgeWaitRef}
          allConditionVars={allConditionVars}
          allConditionEquals={allConditionEquals}
          allNodeNamesObjects={allNodeNamesObjects}
          t={t}
        />
      )}

      {/* Информация о загруженном проекте: статистика ресурсов и название файла .yyp. */}
      <div className="runtimeSectionTitle" style={{ marginTop: 8 }}>
        {t('editor.project', 'Project')}
      </div>
      {resources ? (
        <div className="runtimeHint">
          {/* Показываем только имя файла проекта, полный путь пользователю не нужен. */}
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {resources.yypPath.split(/[\\/]/).pop()}
          </div>

          {/* Компактная статистика ресурсов проекта. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '2px 8px',
              fontSize: 11,
              opacity: 0.8
            }}
          >
            <span>
              {t('editor.sprites', 'Sprites')}: {resources.sprites.length}
            </span>
            <span>
              {t('editor.objects', 'Objects')}: {resources.objects.length}
            </span>
            <span>
              {t('editor.rooms', 'Rooms')}: {resources.rooms.length}
            </span>
            <span>
              {t('editor.yarnFiles', 'Yarn Files')}: {yarnFiles.length}
            </span>
          </div>
        </div>
      ) : (
        <div className="runtimeHint">{t('editor.noProjectLoaded', 'Project not loaded.')}</div>
      )}
    </div>
  )
})
