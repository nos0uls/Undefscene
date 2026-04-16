/* eslint-disable @typescript-eslint/explicit-function-return-type */
import React, { useRef } from 'react'
import type { RuntimeEdge, RuntimeNode, RuntimeState } from './runtimeTypes'
import type { EngineSettings, ProjectResources, YarnFileInfo } from './useProjectResources'
import { SearchableSelect } from './SearchableSelect'
import { FollowPathPreview } from './FollowPathPreview'
import type { NameConflictModalState } from './inspectorTypes'

// Пропсы InspectorPanel — всё, что нужно для рендера inspector.
export type InspectorPanelProps = {
  runtime: RuntimeState
  setRuntime: (next: RuntimeState | ((prev: RuntimeState) => RuntimeState)) => void
  selectedNode: RuntimeNode | null
  actorTargetOptions: string[]
  resources: ProjectResources | null
  engineSettings: EngineSettings | null
  yarnFiles: YarnFileInfo[]
  pendingNodeName: string
  setPendingNodeName: (name: string) => void
  suggestUniqueNodeName: (baseName: string, takenNames: Set<string>) => string
  setNameConflictModal: (state: NameConflictModalState | null) => void
  roomScreenshotSearchDirs: string[]
  shouldFocusEdgeWaitRef: React.MutableRefObject<boolean>
  t: (key: string, fallback: string) => string
  preferences: { language: string }
}

// Отдельный компонент inspector-панели, вынесенный из EditorShell,
// чтобы изолировать ререндеры при изменении выбранной ноды.
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
    roomScreenshotSearchDirs,
    shouldFocusEdgeWaitRef,
    t
  } = props

  const edgeWaitInputRef = useRef<HTMLInputElement | null>(null)

  // --- Helpers (дословно из EditorShell.renderPanelContents) ---

  const updateNode = (nodeId: string, patch: Partial<RuntimeNode>) => {
    setRuntime({
      ...runtime,
      nodes: runtime.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node))
    })
  }

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

  const changeNodeType = (nodeId: string, nextType: string) => {
    const currentNode = runtime.nodes.find((node) => node.id === nodeId)
    if (!currentNode) return

    const takenNames = new Set<string>(
      runtime.nodes
        .filter((n) => n.id !== nodeId)
        .map((n) => String(n.name ?? '').trim())
        .filter((v) => v.length > 0)
    )

    let nextNodes = runtime.nodes
    let nextEdges = runtime.edges
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
        }
      ]

      nextEdges = [
        ...nextEdges,
        {
          id: `edge-pair-${nodeId}-${newJoinId}`,
          source: nodeId,
          sourceHandle: '__pair',
          target: newJoinId,
          targetHandle: '__pair'
        }
      ]
    } else {
      nextNodes = nextNodes.map((node) =>
        node.id === nodeId
          ? { ...node, type: nextType, params: stripParallelParams(node.params) }
          : node
      )
    }

    setRuntime({ ...runtime, nodes: nextNodes, edges: nextEdges })
  }

  const commitNodeName = (nodeId: string, nextNameRaw: string) => {
    const nextName = nextNameRaw.trim()
    if (!nextName) {
      updateNode(nodeId, { name: '' })
      return
    }
    const prev = runtime.nodes.find((n) => n.id === nodeId)?.name ?? ''
    const taken = new Set(
      runtime.nodes
        .filter((n) => n.id !== nodeId)
        .map((n) => String(n.name ?? '').trim())
        .filter((v) => v.length > 0)
    )
    if (!taken.has(nextName)) {
      updateNode(nodeId, { name: nextName })
      return
    }
    const conflictingWithNodeId =
      runtime.nodes.find((n) => n.id !== nodeId && String(n.name ?? '').trim() === nextName)
        ?.id ?? ''
    const suggested = suggestUniqueNodeName(nextName, taken)
    setNameConflictModal({ nodeId, previousName: prev, conflictingWithNodeId, value: suggested })
  }

  const updateNodeParam = (nodeId: string, key: string, value: unknown) => {
    const target = runtime.nodes.find((node) => node.id === nodeId)
    if (!target) return
    const nextParams = { ...(target.params ?? {}) }
    nextParams[key] = value
    updateNode(nodeId, { params: nextParams })
  }

  const updateEdge = (edgeId: string, patch: Partial<(typeof runtime.edges)[number]>) => {
    setRuntime({
      ...runtime,
      edges: runtime.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e))
    })
  }

  // --- Computed ---
  const nodeTypes = [
    'start', 'end', 'move', 'follow_path', 'actor_create', 'actor_destroy',
    'animate', 'dialogue', 'camera_track', 'camera_pan', 'camera_shake',
    'parallel_start', 'branch', 'run_function', 'set_position', 'set_depth',
    'set_facing', 'auto_facing', 'auto_walk'
  ]

  const incomingCount = selectedNode
    ? runtime.edges.filter((e) => e.target === selectedNode.id).length : 0
  const outgoingCount = selectedNode
    ? runtime.edges.filter((e) => e.source === selectedNode.id).length : 0
  const selectedEdge = runtime.edges.find((e) => e.id === runtime.selectedEdgeId) ?? null
  const objectOptions = resources?.objects ?? []
  const spriteOptions = resources?.sprites ?? []
  const spriteOrObjectOptions = [...objectOptions, ...spriteOptions]

  const allNodeNamesObjects = Array.from(new Set(runtime.nodes.map((n) => String(n.name ?? '').trim()).filter((v) => v.length > 0)))
  
  const allConditionVars = Array.from(new Set(
    runtime.edges
      .flatMap((e) => [e.conditionVar, e.endConditionVar])
      .map((v) => String(v ?? '').trim())
      .filter((v) => v.length > 0)
  ))

  const allConditionEquals = Array.from(new Set([
    'true', 'false', '1', '0',
    ...runtime.edges.flatMap((e) => [e.conditionEquals, e.endConditionEquals])
      .map((v) => String(v ?? '').trim())
      .filter((v) => v.length > 0)
  ]))

  // --- JSX ---
  return (
    <div className="runtimeSection">
      <div className="runtimeSectionTitle">{t('editor.inspector', 'Inspector')}</div>
      <label className="runtimeField">
        <span>{t('editor.sceneTitle', 'Scene title')}</span>
        <input
          className="runtimeInput"
          value={runtime.title}
          onChange={(event) => setRuntime({ ...runtime, title: event.target.value })}
        />
      </label>
      {selectedNode ? (
        <>
          <div className="runtimeHint" style={{ opacity: 0.6 }}>ID: {selectedNode.id}</div>
          <label className="runtimeField">
            <span>{t('editor.nodeType', 'Node type')}</span>
            <select
              className="runtimeInput"
              value={selectedNode.type}
              onChange={(event) => changeNodeType(selectedNode.id, event.target.value)}
            >
              {nodeTypes.map((nt) => (
                <option key={nt} value={nt}>{nt}</option>
              ))}
              {!nodeTypes.includes(selectedNode.type) && (
                <option value={selectedNode.type}>{selectedNode.type} (custom)</option>
              )}
            </select>
          </label>
          <label className="runtimeField">
            <span>{t('editor.nodeName', 'Node name')}</span>
            <input
              className="runtimeInput"
              value={pendingNodeName}
              placeholder={t('editor.node', 'Node')}
              onChange={(event) => setPendingNodeName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                commitNodeName(selectedNode.id, pendingNodeName)
              }}
              onBlur={() => commitNodeName(selectedNode.id, pendingNodeName)}
            />
          </label>

          {/* --- move / set_position --- */}
          {['move', 'set_position'].includes(selectedNode.type) && (
            <>
              <label className="runtimeField">
                <span>Target</span>
                <SearchableSelect className="runtimeInput" options={actorTargetOptions} placeholder="actor key / player" value={String((selectedNode.params?.target as string) ?? '')} onChange={(v) => updateNodeParam(selectedNode.id, 'target', v)} />
              </label>
              <label className="runtimeField">
                <span>X</span>
                <input className="runtimeInput" type="number" value={String((selectedNode.params?.x as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'x', Number(event.target.value))} />
              </label>
              <label className="runtimeField">
                <span>Y</span>
                <input className="runtimeInput" type="number" value={String((selectedNode.params?.y as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'y', Number(event.target.value))} />
              </label>
              {selectedNode.type === 'move' && (
                <>
                  <label className="runtimeField">
                    <span>Speed (px/sec)</span>
                    <input className="runtimeInput" type="number" placeholder="60" value={String((selectedNode.params?.speed_px_sec as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'speed_px_sec', Number(event.target.value))} />
                  </label>
                  <label className="runtimeField">
                    <span>Collision</span>
                    <select className="runtimeInput" value={String(selectedNode.params?.collision ?? 'false')} onChange={(event) => updateNodeParam(selectedNode.id, 'collision', event.target.value === 'true')}>
                      <option value="false">false</option>
                      <option value="true">true</option>
                    </select>
                  </label>
                </>
              )}
            </>
          )}

          {/* --- follow_path --- */}
          {selectedNode.type === 'follow_path' && (
            <>
              <label className="runtimeField">
                <span>Target</span>
                <SearchableSelect className="runtimeInput" options={actorTargetOptions} placeholder="actor key / player" value={String((selectedNode.params?.target as string) ?? '')} onChange={(v) => updateNodeParam(selectedNode.id, 'target', v)} />
              </label>
              <label className="runtimeField">
                <span>Speed (px/sec)</span>
                <input className="runtimeInput" type="number" placeholder="60" value={String((selectedNode.params?.speed_px_sec as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'speed_px_sec', Number(event.target.value))} />
              </label>
              <label className="runtimeField">
                <span>Collision</span>
                <select className="runtimeInput" value={String(selectedNode.params?.collision ?? 'false')} onChange={(event) => updateNodeParam(selectedNode.id, 'collision', event.target.value === 'true')}>
                  <option value="false">false</option>
                  <option value="true">true</option>
                </select>
              </label>
              <div className="runtimeSectionTitle" style={{ marginTop: 4 }}>{t('editor.pathPoints', 'Path Points')}</div>
              {(() => {
                const points: { x: number; y: number }[] = Array.isArray(selectedNode.params?.points) ? (selectedNode.params.points as { x: number; y: number }[]) : []
                const setPoints = (next: { x: number; y: number }[]) => { updateNodeParam(selectedNode.id, 'points', next) }
                return (
                  <>
                    {points.map((pt, i) => (
                      <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ fontSize: 11, opacity: 0.5, minWidth: 18 }}>#{i}</span>
                        <input className="runtimeInput" type="number" style={{ width: 64 }} placeholder="x" value={pt.x} onChange={(e) => { const next = [...points]; next[i] = { ...next[i], x: Number(e.target.value) }; setPoints(next) }} />
                        <input className="runtimeInput" type="number" style={{ width: 64 }} placeholder="y" value={pt.y} onChange={(e) => { const next = [...points]; next[i] = { ...next[i], y: Number(e.target.value) }; setPoints(next) }} />
                        <button style={{ fontSize: 11, padding: '0 4px', cursor: 'pointer' }} disabled={i === 0} onClick={() => { const next = [...points]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setPoints(next) }}>↑</button>
                        <button style={{ fontSize: 11, padding: '0 4px', cursor: 'pointer' }} disabled={i === points.length - 1} onClick={() => { const next = [...points]; [next[i], next[i + 1]] = [next[i + 1], next[i]]; setPoints(next) }}>↓</button>
                        <button style={{ fontSize: 11, padding: '0 4px', cursor: 'pointer', color: '#e05050' }} onClick={() => { setPoints(points.filter((_, idx) => idx !== i)) }}>✕</button>
                      </div>
                    ))}
                    <button style={{ fontSize: 12, marginTop: 2, cursor: 'pointer' }} onClick={() => { const last = points[points.length - 1]; setPoints([...points, last ? { x: last.x + 32, y: last.y } : { x: 0, y: 0 }]) }}>{t('editor.addPoint', '+ Add Point')}</button>
                    {points.length === 0 && <div className="runtimeHint" style={{ opacity: 0.5, fontSize: 11 }}>{t('editor.noWaypointsYet', 'No waypoints yet. Click "+ Add Point" to start.')}</div>}
                    <FollowPathPreview points={points} speedPxPerSecond={Number(selectedNode.params?.speed_px_sec ?? 60)} title={t('editor.followPathPreview', 'Path Preview')} hint={t('editor.followPathPreviewHint', 'Animated editor preview of the path shape and waypoint order.')} emptyLabel={t('editor.followPathPreviewNoPoints', 'Add at least one point to preview the path.')} worldSpaceLabel={t('editor.followPathPreviewWorldSpace', 'Points are shown in normalized world-space proportions.')} />
                  </>
                )
              })()}
            </>
          )}

          {/* --- actor_create --- */}
          {selectedNode.type === 'actor_create' && (
            <>
              <label className="runtimeField"><span>Key</span><input className="runtimeInput" placeholder="npc_guide" value={String((selectedNode.params?.key as string) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'key', event.target.value)} /></label>
              <label className="runtimeField"><span>Sprite / Object</span><SearchableSelect className="runtimeInput" options={spriteOrObjectOptions} value={String((selectedNode.params?.sprite_or_object as string) ?? '')} onChange={(v) => updateNodeParam(selectedNode.id, 'sprite_or_object', v)} placeholder="obj_actor / spr_..." style={selectedNode.params?.sprite_or_object && !spriteOrObjectOptions.includes(String(selectedNode.params.sprite_or_object)) ? { borderColor: '#e05050' } : undefined} /></label>
              <label className="runtimeField"><span>X</span><input className="runtimeInput" type="number" value={String((selectedNode.params?.x as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'x', Number(event.target.value))} /></label>
              <label className="runtimeField"><span>Y</span><input className="runtimeInput" type="number" value={String((selectedNode.params?.y as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'y', Number(event.target.value))} /></label>
            </>
          )}

          {/* --- actor_destroy --- */}
          {selectedNode.type === 'actor_destroy' && (
            <label className="runtimeField"><span>Target</span><SearchableSelect className="runtimeInput" options={actorTargetOptions} placeholder="actor key" value={String((selectedNode.params?.target as string) ?? '')} onChange={(v) => updateNodeParam(selectedNode.id, 'target', v)} /></label>
          )}

          {/* --- animate --- */}
          {selectedNode.type === 'animate' && (
            <>
              <label className="runtimeField"><span>Target</span><SearchableSelect className="runtimeInput" options={actorTargetOptions} placeholder="actor key / player" value={String((selectedNode.params?.target as string) ?? '')} onChange={(v) => updateNodeParam(selectedNode.id, 'target', v)} /></label>
              <label className="runtimeField"><span>Sprite</span><SearchableSelect className="runtimeInput" options={spriteOptions} value={String((selectedNode.params?.sprite as string) ?? '')} onChange={(v) => updateNodeParam(selectedNode.id, 'sprite', v)} placeholder="spr_..." style={selectedNode.params?.sprite && !spriteOptions.includes(String(selectedNode.params.sprite)) ? { borderColor: '#e05050' } : undefined} /></label>
              <label className="runtimeField"><span>Image Index</span><input className="runtimeInput" type="number" placeholder="0" value={String((selectedNode.params?.image_index as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'image_index', Number(event.target.value))} /></label>
              <label className="runtimeField"><span>Image Speed</span><input className="runtimeInput" type="number" step="0.1" placeholder="1" value={String((selectedNode.params?.image_speed as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'image_speed', Number(event.target.value))} /></label>
            </>
          )}

          {/* --- dialogue --- */}
          {selectedNode.type === 'dialogue' && (() => {
            const yarnFileOptions = yarnFiles.map((y) => y.file)
            const currentFile = String(selectedNode.params?.file ?? '')
            const yarnNodeOptions = yarnFiles.find((y) => y.file === currentFile)?.nodes ?? []
            return (
              <>
                <label className="runtimeField"><span>File</span><SearchableSelect className="runtimeInput" options={yarnFileOptions} value={currentFile} onChange={(v) => updateNodeParam(selectedNode.id, 'file', v)} placeholder="dialogue" /></label>
                <label className="runtimeField"><span>Node</span><SearchableSelect className="runtimeInput" options={yarnNodeOptions} value={String((selectedNode.params?.node as string) ?? '')} onChange={(v) => updateNodeParam(selectedNode.id, 'node', v)} placeholder="Intro" /></label>
              </>
            )
          })()}

          {/* --- camera_track --- */}
          {selectedNode.type === 'camera_track' && (
            <>
              <label className="runtimeField"><span>Target</span><SearchableSelect className="runtimeInput" options={actorTargetOptions} placeholder="actor key / player" value={String((selectedNode.params?.target as string) ?? '')} onChange={(v) => updateNodeParam(selectedNode.id, 'target', v)} /></label>
              <label className="runtimeField"><span>Seconds</span><input className="runtimeInput" type="number" step="0.1" placeholder="2" value={String((selectedNode.params?.seconds as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'seconds', Number(event.target.value))} /></label>
              <label className="runtimeField"><span>Offset X</span><input className="runtimeInput" type="number" value={String((selectedNode.params?.offset_x as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'offset_x', Number(event.target.value))} /></label>
              <label className="runtimeField"><span>Offset Y</span><input className="runtimeInput" type="number" value={String((selectedNode.params?.offset_y as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'offset_y', Number(event.target.value))} /></label>
            </>
          )}

          {/* --- camera_pan --- */}
          {selectedNode.type === 'camera_pan' && (
            <>
              <label className="runtimeField"><span>X</span><input className="runtimeInput" type="number" value={String((selectedNode.params?.x as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'x', Number(event.target.value))} /></label>
              <label className="runtimeField"><span>Y</span><input className="runtimeInput" type="number" value={String((selectedNode.params?.y as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'y', Number(event.target.value))} /></label>
              <label className="runtimeField"><span>Seconds</span><input className="runtimeInput" type="number" step="0.1" placeholder="1" value={String((selectedNode.params?.seconds as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'seconds', Number(event.target.value))} /></label>
            </>
          )}

          {/* --- set_depth --- */}
          {selectedNode.type === 'set_depth' && (
            <>
              <label className="runtimeField"><span>Target</span><SearchableSelect className="runtimeInput" options={actorTargetOptions} placeholder="actor key / player" value={String((selectedNode.params?.target as string) ?? '')} onChange={(v) => updateNodeParam(selectedNode.id, 'target', v)} /></label>
              <label className="runtimeField"><span>Depth</span><input className="runtimeInput" type="number" placeholder="0" value={String((selectedNode.params?.depth as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'depth', Number(event.target.value))} /></label>
            </>
          )}

          {/* --- set_facing --- */}
          {selectedNode.type === 'set_facing' && (
            <>
              <label className="runtimeField"><span>Target</span><SearchableSelect className="runtimeInput" options={actorTargetOptions} placeholder="actor key / player" value={String((selectedNode.params?.target as string) ?? '')} onChange={(v) => updateNodeParam(selectedNode.id, 'target', v)} /></label>
              <label className="runtimeField"><span>Direction</span><select className="runtimeInput" value={String((selectedNode.params?.direction as string) ?? 'right')} onChange={(event) => updateNodeParam(selectedNode.id, 'direction', event.target.value)}><option value="left">left</option><option value="right">right</option><option value="up">up</option><option value="down">down</option></select></label>
            </>
          )}

          {/* --- branch --- */}
          {selectedNode.type === 'branch' && (
            <label className="runtimeField"><span>Condition</span><SearchableSelect className="runtimeInput" options={engineSettings?.branchConditions ?? []} value={String((selectedNode.params?.condition as string) ?? '')} onChange={(v) => updateNodeParam(selectedNode.id, 'condition', v)} placeholder="e.g. has_item_key" /></label>
          )}

          {/* --- run_function --- */}
          {selectedNode.type === 'run_function' && (
            <>
              <label className="runtimeField"><span>Function Name</span><SearchableSelect className="runtimeInput" options={engineSettings?.runFunctions ?? []} value={String((selectedNode.params?.function as string) ?? (selectedNode.params?.function_name as string) ?? '')} onChange={(v) => updateNodeParam(selectedNode.id, 'function', v)} placeholder="my_cutscene_func" /></label>
              <label className="runtimeField"><span>Args (JSON)</span><input className="runtimeInput" placeholder='["arg1", 42]' value={String((selectedNode.params?.args as string) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'args', event.target.value)} /></label>
            </>
          )}

          {/* --- camera_shake --- */}
          {selectedNode.type === 'camera_shake' && (
            <>
              <label className="runtimeField"><span>Duration (seconds)</span><input className="runtimeInput" type="number" step="0.1" placeholder="1" value={String((selectedNode.params?.seconds as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'seconds', Number(event.target.value))} /></label>
              <label className="runtimeField"><span>Magnitude (px)</span><input className="runtimeInput" type="number" placeholder="4" value={String((selectedNode.params?.magnitude as number) ?? '')} onChange={(event) => updateNodeParam(selectedNode.id, 'magnitude', Number(event.target.value))} /></label>
            </>
          )}

          {/* --- auto_facing --- */}
          {selectedNode.type === 'auto_facing' && (
            <>
              <label className="runtimeField"><span>Target</span><SearchableSelect className="runtimeInput" options={actorTargetOptions} placeholder="actor key / player" value={String((selectedNode.params?.target as string) ?? '')} onChange={(v) => updateNodeParam(selectedNode.id, 'target', v)} /></label>
              <label className="runtimeField"><span>Enabled</span><select className="runtimeInput" value={String(selectedNode.params?.enabled ?? 'true')} onChange={(event) => updateNodeParam(selectedNode.id, 'enabled', event.target.value === 'true')}><option value="true">true</option><option value="false">false</option></select></label>
            </>
          )}

          {/* --- auto_walk --- */}
          {selectedNode.type === 'auto_walk' && (
            <>
              <label className="runtimeField"><span>Target</span><SearchableSelect className="runtimeInput" options={actorTargetOptions} placeholder="actor key / player" value={String((selectedNode.params?.target as string) ?? '')} onChange={(v) => updateNodeParam(selectedNode.id, 'target', v)} /></label>
              <label className="runtimeField"><span>Enabled</span><select className="runtimeInput" value={String(selectedNode.params?.enabled ?? 'true')} onChange={(event) => updateNodeParam(selectedNode.id, 'enabled', event.target.value === 'true')}><option value="true">true</option><option value="false">false</option></select></label>
            </>
          )}

          {selectedNode.position && (
            <div className="runtimeHint" style={{ opacity: 0.6 }}>
              Position: {Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)}
            </div>
          )}
          <div className="runtimeHint" style={{ opacity: 0.6 }}>
            Edges: {incomingCount} in / {outgoingCount} out
          </div>
        </>
      ) : (
        <div className="runtimeHint">{t('editor.inspectNodeHint', 'Select a node on the canvas to inspect it.')}</div>
      )}

      {/* Инспектор ребра */}
      {selectedEdge ? (
        <>
          <div className="runtimeSectionTitle" style={{ marginTop: 8 }}>{t('editor.selectedEdge', 'Selected Edge')}</div>
          <div className="runtimeHint" style={{ opacity: 0.6 }}>ID: {selectedEdge.id}</div>
          <label className="runtimeField">
            <span>{t('editor.waitOnEdge', 'Wait on edge (seconds)')}</span>
            <input ref={(el) => { edgeWaitInputRef.current = el; if (el && shouldFocusEdgeWaitRef.current) { shouldFocusEdgeWaitRef.current = false; requestAnimationFrame(() => el.focus()) } }} className="runtimeInput" type="number" step="0.1" value={String(selectedEdge.waitSeconds ?? '')} onChange={(event) => { const v = event.target.value; if (v === '') { updateEdge(selectedEdge.id, { waitSeconds: undefined }) } else { updateEdge(selectedEdge.id, { waitSeconds: Math.max(0, Number(v)) }) } }} />
          </label>
          <label className="runtimeField" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={!!selectedEdge.conditionEnabled} onChange={(event) => { const enabled = event.target.checked; if (enabled) { updateEdge(selectedEdge.id, { conditionEnabled: true, conditionVar: selectedEdge.conditionVar ?? '', conditionEquals: selectedEdge.conditionEquals ?? '', conditionIfFalse: selectedEdge.conditionIfFalse ?? 'skip', stopWaitingWhen: selectedEdge.stopWaitingWhen ?? 'none' }) } else { updateEdge(selectedEdge.id, { conditionEnabled: false }) } }} />
            <span>Condition</span>
          </label>
          {selectedEdge.conditionEnabled ? (
            <>
              <label className="runtimeField"><span>Variable (global key)</span><SearchableSelect className="runtimeInput" options={allConditionVars} placeholder="e.g. has_key" value={String(selectedEdge.conditionVar ?? '')} onChange={(v) => updateEdge(selectedEdge.id, { conditionVar: v })} /></label>
              <label className="runtimeField"><span>Equals</span><SearchableSelect className="runtimeInput" options={allConditionEquals} placeholder="e.g. true / 1 / done" value={String(selectedEdge.conditionEquals ?? '')} onChange={(v) => updateEdge(selectedEdge.id, { conditionEquals: v })} /></label>
              <label className="runtimeField"><span>If false</span><select className="runtimeInput" value={selectedEdge.conditionIfFalse ?? 'skip'} onChange={(event) => { const val = event.target.value as 'skip' | 'wait_until_true'; updateEdge(selectedEdge.id, { conditionIfFalse: val, stopWaitingWhen: val === 'skip' ? undefined : (selectedEdge.stopWaitingWhen ?? 'none') }) }}><option value="skip">skip (пропустить)</option><option value="wait_until_true">wait until true (ждать)</option></select></label>
              {selectedEdge.conditionIfFalse === 'wait_until_true' ? (
                <>
                  <label className="runtimeField"><span>Stop waiting when</span><select className="runtimeInput" value={selectedEdge.stopWaitingWhen ?? 'none'} onChange={(event) => updateEdge(selectedEdge.id, { stopWaitingWhen: event.target.value as 'none' | 'global_var' | 'node_reached' | 'timeout' })}><option value="none">none (ждать бесконечно)</option><option value="global_var">global variable</option><option value="node_reached">node reached</option><option value="timeout">timeout</option></select></label>
                  {selectedEdge.stopWaitingWhen === 'global_var' ? (<><label className="runtimeField"><span>End Variable (global key)</span><SearchableSelect className="runtimeInput" options={allConditionVars} placeholder="e.g. cutscene_abort" value={String(selectedEdge.endConditionVar ?? '')} onChange={(v) => updateEdge(selectedEdge.id, { endConditionVar: v })} /></label><label className="runtimeField"><span>End Equals</span><SearchableSelect className="runtimeInput" options={allConditionEquals} placeholder="e.g. true" value={String(selectedEdge.endConditionEquals ?? '')} onChange={(v) => updateEdge(selectedEdge.id, { endConditionEquals: v })} /></label></>) : null}
                  {selectedEdge.stopWaitingWhen === 'node_reached' ? (<label className="runtimeField"><span>Node name</span><SearchableSelect className="runtimeInput" options={allNodeNamesObjects} placeholder="e.g. End" value={String(selectedEdge.endNodeName ?? '')} onChange={(v) => updateEdge(selectedEdge.id, { endNodeName: v })} style={selectedEdge.endNodeName && !allNodeNamesObjects.includes(String(selectedEdge.endNodeName)) ? { borderColor: '#e05050' } : undefined} /></label>) : null}
                  {selectedEdge.stopWaitingWhen === 'timeout' ? (<label className="runtimeField"><span>Timeout (seconds)</span><input className="runtimeInput" type="number" step="0.1" placeholder="5" value={String(selectedEdge.endTimeoutSeconds ?? '')} onChange={(event) => { const v = event.target.value; if (v === '') { updateEdge(selectedEdge.id, { endTimeoutSeconds: undefined }) } else { updateEdge(selectedEdge.id, { endTimeoutSeconds: Math.max(0, Number(v)) }) } }} /></label>) : null}
                </>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {/* Информация о проекте */}
      <div className="runtimeSectionTitle" style={{ marginTop: 8 }}>{t('editor.project', 'Project')}</div>
      {resources ? (
        <div className="runtimeHint">
          {resources.yypPath}<br />
          {t('editor.sprites', 'Sprites')}: {resources.sprites.length}<br />
          {t('editor.objects', 'Objects')}: {resources.objects.length}<br />
          {t('editor.rooms', 'Rooms')}: {resources.rooms.length}<br />
          {t('editor.yarnFiles', 'Yarn Files')}: {yarnFiles.length}
          {resources.restoredFromLastSession ? (<><br />{t('editor.projectCacheRestored', 'Restored the last cached GameMaker project.')}</>) : null}<br />
          {resources.cacheStatus === 'warm' ? t('editor.projectCacheWarmOpen', 'Project resources were restored from cache.') : t('editor.projectCacheColdOpen', 'Project resources were read directly from disk.')}<br />
          {t('editor.projectCacheScreenshots', 'Room screenshots cache folder is ready for future previews.')}<br />
          {t('editor.visualEditingSearchDirs', 'Search Dirs')}: {roomScreenshotSearchDirs.length > 0 ? roomScreenshotSearchDirs.join(' | ') : '—'}
        </div>
      ) : (
        <div className="runtimeHint">{t('editor.noProjectLoaded', 'No project loaded. File → Open Project...')}</div>
      )}
    </div>
  )
})
