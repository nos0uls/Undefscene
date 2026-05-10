/* eslint-disable @typescript-eslint/explicit-function-return-type */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RuntimeEdge, RuntimeNode, RuntimeState } from './runtimeTypes'
import type { EngineSettings, ProjectResources, YarnFileInfo } from './useProjectResources'
import { SearchableSelect } from './SearchableSelect'
import { FollowPathPreview } from './FollowPathPreview'
import type { NameConflictModalState } from './inspectorTypes'
import { NODE_REGISTRY, NODE_TYPES, type NodeField } from './nodes/nodeRegistry'
import { AnimatedField } from './AnimatedField'

// NODE_TYPES импортируется из nodeRegistry — единый источник истины для всех панелей.

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
  shouldFocusEdgeWaitRef: React.MutableRefObject<boolean>
  t: (key: string, fallback: string) => string
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
    shouldFocusEdgeWaitRef,
    t
  } = props

  const edgeWaitInputRef = useRef<HTMLInputElement | null>(null)

  // Локальный стейт для title с debounce: каждый keystroke не должен
  // немедленно обновлять runtime и триггерить валидацию/историю.
  const [localTitle, setLocalTitle] = useState(runtime.title)
  const titleTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    setLocalTitle(runtime.title)
  }, [runtime.title])

  const flushTitle = (value: string) => {
    if (titleTimeoutRef.current) window.clearTimeout(titleTimeoutRef.current)
    titleTimeoutRef.current = null
    // Используем функциональную форму setRuntime для защиты от race condition:
    // это гарантирует, что мы работаем с актуальным состоянием, а не с устаревшим замыканием.
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
          // Сразу применяем имя без модалки.
          return {
            ...prev,
            nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, name: nextName } : n))
          }
        }
        const conflictingWithNodeId =
          prev.nodes.find((n) => n.id !== nodeId && String(n.name ?? '').trim() === nextName)
            ?.id ?? ''
        const suggested = suggestUniqueNodeName(nextName, taken)
        // Модалка конфликта — это side-effect, не может быть в setRuntime.
        // Поэтому обновляем runtime сразу (пока с prevName), а модалку выставляем отдельно.
        // Но мы внутри setRuntime, и нельзя вызвать setNameConflictModal здесь.
        // Возвращаем prev без изменений и выставим модалку через setTimeout.
        window.setTimeout(() => {
          setNameConflictModal({ nodeId, previousName: prevName, conflictingWithNodeId, value: suggested })
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
    (edgeId: string, patch: Partial<(typeof runtime.edges)[number]>) => {
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
    () => Array.from(new Set(runtime.nodes.map((n) => String(n.name ?? '').trim()).filter((v) => v.length > 0))),
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
          'true', 'false', '1', '0',
          ...runtime.edges
            .flatMap((e) => [e.conditionEquals, e.endConditionEquals])
            .map((v) => String(v ?? '').trim())
            .filter((v) => v.length > 0)
        ])
      ),
    [runtime.edges]
  )

  // --- Helper: динамический рендеринг поля из registry ---

  // Получаем опции для searchable/select полей в зависимости от типа.
  const getFieldOptions = useCallback((field: NodeField): string[] => {
    if (Array.isArray(field.options)) return field.options
    if (typeof field.options === 'function') return field.options(selectedNode?.params ?? {})
    return []
  }, [selectedNode?.params])

  // Рендерим одно поле на основе его типа и конфигурации из registry.
  const renderField = useCallback(
    (field: NodeField, nodeId: string): React.ReactNode => {
      // Проверяем условие видимости поля.
      const isVisible = field.condition ? field.condition(selectedNode?.params ?? {}) : true

      const currentValue = selectedNode?.params?.[field.key]
      const options = getFieldOptions(field)

      // Определяем значение для display.
      const displayValue = currentValue !== undefined ? String(currentValue) : ''

      // Обработчик изменения значения.
      const handleChange = (value: unknown) => {
        updateNodeParam(nodeId, field.key, value)
      }

      // Рендерим поле в зависимости от типа.
      const fieldContent = (() => {
        switch (field.type) {
          case 'text':
          case 'json':
            return (
              <input
                className="runtimeInput"
                type="text"
                placeholder={field.placeholder}
                value={displayValue}
                onChange={(e) => handleChange(e.target.value)}
              />
            )
          case 'number':
            return (
              <input
                className="runtimeInput"
                type="number"
                step={field.step ?? 1}
                placeholder={field.placeholder}
                value={displayValue}
                onChange={(e) => {
                  const v = e.target.value
                  handleChange(v === '' ? '' : Number(v))
                }}
              />
            )
          case 'select':
            return (
              <select
                className="runtimeInput"
                value={displayValue}
                onChange={(e) => {
                  // Для boolean значений конвертируем строки 'true'/'false'
                  if (options.includes('true') && options.includes('false')) {
                    handleChange(e.target.value === 'true')
                  } else if (field.key === 'control_type') {
                    handleChange(Number(e.target.value))
                  } else {
                    handleChange(e.target.value)
                  }
                }}
              >
                {options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )
          case 'searchable':
            return (
              <SearchableSelect
                className="runtimeInput"
                options={options}
                placeholder={field.placeholder}
                value={displayValue}
                onChange={(v) => handleChange(v)}
                style={field.style}
              />
            )
          case 'checkbox':
            return (
              <input
                type="checkbox"
                checked={!!currentValue}
                onChange={(e) => handleChange(e.target.checked)}
              />
            )
          default:
            return null
        }
      })()

      // Оборачиваем в AnimatedField для анимации.
      return (
        <AnimatedField key={field.key} visible={isVisible} fieldKey={`${nodeId}-${field.key}`}>
          {field.type === 'checkbox' ? (
            <label className="runtimeField" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {fieldContent}
              <span>{t('nodes.fields.' + field.key, field.label)}</span>
            </label>
          ) : (
            <label className="runtimeField">
              <span>{t('nodes.fields.' + field.key, field.label)}</span>
              {fieldContent}
            </label>
          )}
        </AnimatedField>
      )
    },
    [selectedNode, getFieldOptions, updateNodeParam]
  )

  // --- JSX ---
  return (
    <div className="runtimeSection">
      <div className="runtimeSectionTitle">{t('editor.inspector', 'Inspector')}</div>
      <label className="runtimeField">
        <span>{t('editor.sceneTitle', 'Scene title')}</span>
        <input
          className="runtimeInput"
          value={localTitle}
          onChange={(event) => {
            setLocalTitle(event.target.value)
            debounceTitle(event.target.value)
          }}
          onBlur={() => flushTitle(localTitle)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            flushTitle(localTitle)
            ;(event.currentTarget as HTMLElement).blur()
          }}
        />
      </label>
          {/* Выбранная нода: тип, имя и параметры. ID больше не показываем пользователю. */}
          {selectedNode ? (
            <>
              <label className="runtimeField">
                <span>{t('editor.nodeType', 'Node type')}</span>
                <select
                  className="runtimeInput"
                  value={selectedNode.type}
                  onChange={(event) => changeNodeType(selectedNode.id, event.target.value)}
                >
                  {NODE_TYPES.map((nt) => (
                    <option key={nt} value={nt}>
                      {t('nodes.types.' + nt, nt)}
                    </option>
                  ))}
                  {!NODE_TYPES.includes(selectedNode.type as typeof NODE_TYPES[number]) && (
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
                    ;(event.currentTarget as HTMLElement).blur()
                  }}
                  onBlur={() => commitNodeName(selectedNode.id, pendingNodeName)}
                />
              </label>

              {/* Динамический рендеринг полей из registry */}
              {(() => {
                const nodeDef = NODE_REGISTRY[selectedNode.type]
                if (!nodeDef) return null

                // Для searchable и select полей нужно подставить актуальные опции из ресурсов проекта.
                const fieldsWithResolvedOptions = nodeDef.fields.map((field) => {
                  let resolvedOptions: string[] = []
                  
                  if (field.type === 'searchable' || field.type === 'select') {
                    // 1. Проверяем системные ключи, которые требуют внешних данных (актеры, ресурсы).
                    if (field.key === 'target' || field.key === 'copy_target') {
                      resolvedOptions = actorTargetOptions
                    } else if (field.key === 'actor_sprite') {
                      resolvedOptions = spriteOrObjectOptions
                    } else if (field.key === 'sprite') {
                      resolvedOptions = spriteOptions
                    } else if (field.key === 'object') {
                      resolvedOptions = objectOptions
                    } else if (field.key === 'sound') {
                      resolvedOptions = resources?.sounds ?? []
                    } else if (field.key === 'condition') {
                      resolvedOptions = engineSettings?.branchConditions ?? []
                    } else if (field.key === 'function') {
                      resolvedOptions = engineSettings?.runFunctions ?? []
                    } else if (field.key === 'file') {
                      resolvedOptions = yarnFiles.map((y) => y.file)
                    } else if (field.key === 'node') {
                      const currentFile = String(selectedNode.params?.file ?? '')
                      resolvedOptions = yarnFiles.find((y) => y.file === currentFile)?.nodes ?? []
                    } else if (field.key === 'key' && selectedNode.type === 'set_flag') {
                      resolvedOptions = allConditionVars
                    } else if (field.key === 'value' && selectedNode.type === 'set_flag') {
                      resolvedOptions = allConditionEquals
                    } else if (field.key === 'name' && selectedNode.type === 'mark_node') {
                      resolvedOptions = allNodeNamesObjects
                    }

                    // 2. Если системные ключи не подошли, используем статические опции из Registry.
                    if (resolvedOptions.length === 0) {
                      if (Array.isArray(field.options)) {
                        resolvedOptions = field.options
                      } else if (typeof field.options === 'function') {
                        resolvedOptions = field.options(selectedNode.params ?? {})
                      }
                    }
                  }
                  
                  return { ...field, options: resolvedOptions }
                })

                return fieldsWithResolvedOptions.map((field) => renderField(field, selectedNode.id))
              })()
            }

          {/* Специальная логика для follow_path (points array) */}
          {selectedNode.type === 'follow_path' && (
            <>
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
                    <FollowPathPreview points={points} speedPxPerSecond={Number(selectedNode.params?.speed_px_sec ?? 60)} title={t('editor.followPathPreview', 'Preview')} hint={t('editor.followPathPreviewHint', 'Path and waypoint order.')} emptyLabel={t('editor.followPathPreviewNoPoints', 'Add a point to preview.')} worldSpaceLabel={t('editor.followPathPreviewWorldSpace', 'Relative world space.')} />
                  </>
                )
              })()}
            </>
          )}

            <div className="runtimeHint" style={{ opacity: 0.6 }}>
              {t('editor.position', 'Position')}: {Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)}
            </div>
            {/* Статистика по связям: сколько стрелок входит и выходит из ноды. */}
            <div className="runtimeHint" style={{ opacity: 0.6 }}>
              {t('editor.connections', 'Connections')}: {incomingCount} {t('editor.connectionsInOut', 'in / out')} {outgoingCount}
            </div>
          </>
        ) : (
        <div className="inspectorEmptyState">
          <svg className="inspectorEmptyIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <path d="M17.5 14v6M14.5 17h6" />
          </svg>
          <span className="inspectorEmptyText">{t('editor.inspectNodeHint', 'Select a node to inspect it')}</span>
        </div>
      )}

      {/* Инспектор ребра */}
      {selectedEdge ? (
        <>
          <div className="runtimeSectionTitle" style={{ marginTop: 8 }}>{t('editor.selectedEdge', 'Selected Edge')}</div>
          <label className="runtimeField">
            <span>{t('editor.waitOnEdge', 'Wait on edge (seconds)')}</span>
            <input ref={(el) => { edgeWaitInputRef.current = el; if (el && shouldFocusEdgeWaitRef.current) { shouldFocusEdgeWaitRef.current = false; requestAnimationFrame(() => el.focus()) } }} className="runtimeInput" type="number" step="0.1" value={String(selectedEdge.waitSeconds ?? '')} onChange={(event) => { const v = event.target.value; if (v === '') { updateEdge(selectedEdge.id, { waitSeconds: undefined }) } else { updateEdge(selectedEdge.id, { waitSeconds: Math.max(0, Number(v)) }) } }} />
          </label>
          <label className="runtimeField" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={!!selectedEdge.conditionEnabled} onChange={(event) => { const enabled = event.target.checked; if (enabled) { updateEdge(selectedEdge.id, { conditionEnabled: true, conditionVar: selectedEdge.conditionVar ?? '', conditionEquals: selectedEdge.conditionEquals ?? '', conditionIfFalse: selectedEdge.conditionIfFalse ?? 'skip', stopWaitingWhen: selectedEdge.stopWaitingWhen ?? 'none' }) } else { updateEdge(selectedEdge.id, { conditionEnabled: false }) } }} />
            <span>{t('editor.condition', 'Condition')}</span>
          </label>
          {selectedEdge.conditionEnabled ? (
            <>
              <div className="runtimeField"><span>{t('editor.variable', 'Variable (global key)')}</span><SearchableSelect className="runtimeInput" options={allConditionVars} placeholder="e.g. has_key" value={String(selectedEdge.conditionVar ?? '')} onChange={(v) => updateEdge(selectedEdge.id, { conditionVar: v })} /></div>
              <div className="runtimeField"><span>{t('editor.equals', 'Equals')}</span><SearchableSelect className="runtimeInput" options={allConditionEquals} placeholder="e.g. true / 1 / done" value={String(selectedEdge.conditionEquals ?? '')} onChange={(v) => updateEdge(selectedEdge.id, { conditionEquals: v })} /></div>
              <label className="runtimeField"><span>{t('editor.ifFalse', 'If false')}</span><select className="runtimeInput" value={selectedEdge.conditionIfFalse ?? 'skip'} onChange={(event) => { const val = event.target.value as 'skip' | 'wait_until_true'; updateEdge(selectedEdge.id, { conditionIfFalse: val, stopWaitingWhen: val === 'skip' ? undefined : (selectedEdge.stopWaitingWhen ?? 'none') }) }}><option value="skip">{t('editor.edgeConditionSkip', 'skip (skip branch)')}</option><option value="wait_until_true">{t('editor.edgeConditionWait', 'wait until true (wait)')}</option></select></label>
              {selectedEdge.conditionIfFalse === 'wait_until_true' ? (
                <>
                  <label className="runtimeField"><span>{t('editor.stopWaitingWhen', 'Stop waiting when')}</span><select className="runtimeInput" value={selectedEdge.stopWaitingWhen ?? 'none'} onChange={(event) => updateEdge(selectedEdge.id, { stopWaitingWhen: event.target.value as 'none' | 'global_var' | 'node_reached' | 'timeout' })}><option value="none">{t('editor.stopWaitingNone', 'none (wait forever)')}</option><option value="global_var">{t('editor.stopWaitingGlobalVar', 'global variable')}</option><option value="node_reached">{t('editor.stopWaitingNodeReached', 'node reached')}</option><option value="timeout">{t('editor.stopWaitingTimeout', 'timeout')}</option></select></label>
                  {selectedEdge.stopWaitingWhen === 'global_var' ? (<><div className="runtimeField"><span>{t('editor.endVariable', 'End Variable')}</span><SearchableSelect className="runtimeInput" options={allConditionVars} placeholder="e.g. cutscene_abort" value={String(selectedEdge.endConditionVar ?? '')} onChange={(v) => updateEdge(selectedEdge.id, { endConditionVar: v })} /></div><div className="runtimeField"><span>{t('editor.endEquals', 'End Equals')}</span><SearchableSelect className="runtimeInput" options={allConditionEquals} placeholder="e.g. true" value={String(selectedEdge.endConditionEquals ?? '')} onChange={(v) => updateEdge(selectedEdge.id, { endConditionEquals: v })} /></div></>) : null}
                  {selectedEdge.stopWaitingWhen === 'node_reached' ? (<div className="runtimeField"><span>{t('editor.nodeName', 'Node name')}</span><SearchableSelect className="runtimeInput" options={allNodeNamesObjects} placeholder="e.g. End" value={String(selectedEdge.endNodeName ?? '')} onChange={(v) => updateEdge(selectedEdge.id, { endNodeName: v })} style={selectedEdge.endNodeName && !allNodeNamesObjects.includes(String(selectedEdge.endNodeName)) ? { borderColor: '#e05050' } : undefined} /></div>) : null}
                  {selectedEdge.stopWaitingWhen === 'timeout' ? (<label className="runtimeField"><span>{t('editor.timeoutSeconds', 'Timeout (seconds)')}</span><input className="runtimeInput" type="number" step="0.1" placeholder="5" value={String(selectedEdge.endTimeoutSeconds ?? '')} onChange={(event) => { const v = event.target.value; if (v === '') { updateEdge(selectedEdge.id, { endTimeoutSeconds: undefined }) } else { updateEdge(selectedEdge.id, { endTimeoutSeconds: Math.max(0, Number(v)) }) } }} /></label>) : null}
                </>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {/* Информация о загруженном проекте: статистика ресурсов и название файла .yyp. */}
      <div className="runtimeSectionTitle" style={{ marginTop: 8 }}>{t('editor.project', 'Project')}</div>
      {resources ? (
        <div className="runtimeHint">
          {/* Показываем только имя файла проекта, полный путь пользователю не нужен. */}
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {resources.yypPath.split(/[\\/]/).pop()}
          </div>
          
          {/* Компактная статистика ресурсов проекта. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', fontSize: 11, opacity: 0.8 }}>
            <span>{t('editor.sprites', 'Sprites')}: {resources.sprites.length}</span>
            <span>{t('editor.objects', 'Objects')}: {resources.objects.length}</span>
            <span>{t('editor.rooms', 'Rooms')}: {resources.rooms.length}</span>
            <span>{t('editor.yarnFiles', 'Yarn Files')}: {yarnFiles.length}</span>
          </div>
        </div>
      ) : (
        <div className="runtimeHint">{t('editor.noProjectLoaded', 'Project not loaded.')}</div>
      )}
    </div>
  )
})
