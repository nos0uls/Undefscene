import React, { useCallback } from 'react'
import { NODE_REGISTRY, NODE_TYPES, type NodeField } from '../nodes/nodeRegistry'
import { SearchableSelect } from '../SearchableSelect'
import { FollowPathPreview } from '../FollowPathPreview'
import { AnimatedField } from '../AnimatedField'
import type { NodeInspectorProps } from './types'

export const NodeInspector = React.memo(function NodeInspector({
  selectedNode,
  pendingNodeName,
  setPendingNodeName,
  commitNodeName,
  changeNodeType,
  updateNodeParam,
  actorTargetOptions,
  spriteOrObjectOptions,
  spriteOptions,
  objectOptions,
  resources,
  engineSettings,
  yarnFiles,
  allConditionVars,
  allConditionEquals,
  allNodeNamesObjects,
  incomingCount,
  outgoingCount,
  t
}: NodeInspectorProps): React.JSX.Element {
  // Получаем опции для searchable/select полей в зависимости от типа.
  const getFieldOptions = useCallback(
    (field: NodeField): string[] => {
      if (Array.isArray(field.options)) return field.options
      if (typeof field.options === 'function') return field.options(selectedNode.params ?? {})
      return []
    },
    [selectedNode.params]
  )

  // Рендерим одно поле на основе его типа и конфигурации из registry.
  const renderField = useCallback(
    (field: NodeField, nodeId: string): React.ReactNode => {
      // Проверяем условие видимости поля.
      const isVisible = field.condition ? field.condition(selectedNode.params ?? {}) : true

      const currentValue = selectedNode.params?.[field.key]
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
                  if (field.key === 'wait' && options.some((o) => o.includes('fire and forget'))) {
                    handleChange(e.target.value.startsWith('true'))
                  } else if (options.includes('true') && options.includes('false')) {
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
            <label
              className="runtimeField"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
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
    [selectedNode, getFieldOptions, updateNodeParam, t]
  )

  return (
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
          {!NODE_TYPES.includes(selectedNode.type as (typeof NODE_TYPES)[number]) && (
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
      })()}

      {/* Специальная логика для follow_path (points array) */}
      {selectedNode.type === 'follow_path' && (
        <>
          <div className="runtimeSectionTitle" style={{ marginTop: 4 }}>
            {t('editor.pathPoints', 'Path Points')}
          </div>
          {(() => {
            const points: { x: number; y: number }[] = Array.isArray(
              selectedNode.params?.points
            )
              ? (selectedNode.params.points as { x: number; y: number }[])
              : []
            const setPoints = (next: { x: number; y: number }[]) => {
              updateNodeParam(selectedNode.id, 'points', next)
            }
            return (
              <>
                {points.map((pt, i) => (
                  <div
                    key={i}
                    style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2 }}
                  >
                    <span style={{ fontSize: 11, opacity: 0.5, minWidth: 18 }}>#{i}</span>
                    <input
                      className="runtimeInput"
                      type="number"
                      style={{ width: 64 }}
                      placeholder="x"
                      value={pt.x}
                      onChange={(e) => {
                        const next = [...points]
                        next[i] = { ...next[i], x: Number(e.target.value) }
                        setPoints(next)
                      }}
                    />
                    <input
                      className="runtimeInput"
                      type="number"
                      style={{ width: 64 }}
                      placeholder="y"
                      value={pt.y}
                      onChange={(e) => {
                        const next = [...points]
                        next[i] = { ...next[i], y: Number(e.target.value) }
                        setPoints(next)
                      }}
                    />
                    <button
                      style={{ fontSize: 11, padding: '0 4px', cursor: 'pointer' }}
                      disabled={i === 0}
                      onClick={() => {
                        const next = [...points]
                        ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                        setPoints(next)
                      }}
                    >
                      ↑
                    </button>
                    <button
                      style={{ fontSize: 11, padding: '0 4px', cursor: 'pointer' }}
                      disabled={i === points.length - 1}
                      onClick={() => {
                        const next = [...points]
                        ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
                        setPoints(next)
                      }}
                    >
                      ↓
                    </button>
                    <button
                      style={{
                        fontSize: 11,
                        padding: '0 4px',
                        cursor: 'pointer',
                        color: 'var(--status-error)'
                      }}
                      onClick={() => {
                        setPoints(points.filter((_, idx) => idx !== i))
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  style={{ fontSize: 12, marginTop: 2, cursor: 'pointer' }}
                  onClick={() => {
                    const last = points[points.length - 1]
                    setPoints([
                      ...points,
                      last ? { x: last.x + 32, y: last.y } : { x: 0, y: 0 }
                    ])
                  }}
                >
                  {t('editor.addPoint', '+ Add Point')}
                </button>
                {points.length === 0 && (
                  <div className="runtimeHint" style={{ opacity: 0.5, fontSize: 11 }}>
                    {t(
                      'editor.noWaypointsYet',
                      'No waypoints yet. Click "+ Add Point" to start.'
                    )}
                  </div>
                )}
                <FollowPathPreview
                  points={points}
                  speedPxPerSecond={Number(selectedNode.params?.speed_px_sec ?? 60)}
                  title={t('editor.followPathPreview', 'Preview')}
                  hint={t('editor.followPathPreviewHint', 'Path and waypoint order.')}
                  emptyLabel={t('editor.followPathPreviewNoPoints', 'Add a point to preview.')}
                  worldSpaceLabel={t(
                    'editor.followPathPreviewWorldSpace',
                    'Relative world space.'
                  )}
                />
              </>
            )
          })()}
        </>
      )}

      <div className="runtimeHint" style={{ opacity: 0.6 }}>
        {t('editor.position', 'Position')}:{' '}
        {selectedNode.position
          ? `${Math.round(selectedNode.position.x)}, ${Math.round(selectedNode.position.y)}`
          : '0, 0'}
      </div>
      <div className="runtimeHint" style={{ opacity: 0.6 }}>
        {t('editor.connections', 'Connections')}: {incomingCount}{' '}
        {t('editor.connectionsInOut', 'in / out')} {outgoingCount}
      </div>
    </>
  )
})
