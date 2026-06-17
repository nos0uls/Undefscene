import React, { useRef } from 'react'
import { SearchableSelect } from '../SearchableSelect'
import type { EdgeInspectorProps } from './types'

export const EdgeInspector = React.memo(function EdgeInspector({
  selectedEdge,
  updateEdge,
  shouldFocusEdgeWaitRef,
  allConditionVars,
  allConditionEquals,
  allNodeNamesObjects,
  t
}: EdgeInspectorProps): React.JSX.Element {
  const edgeWaitInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <>
      <div className="runtimeSectionTitle" style={{ marginTop: 8 }}>
        {t('editor.selectedEdge', 'Selected Edge')}
      </div>
      <label className="runtimeField">
        <span>{t('editor.waitOnEdge', 'Wait on edge (seconds)')}</span>
        <input
          ref={(el) => {
            edgeWaitInputRef.current = el
            if (el && shouldFocusEdgeWaitRef.current) {
              shouldFocusEdgeWaitRef.current = false
              requestAnimationFrame(() => el.focus())
            }
          }}
          className="runtimeInput"
          type="number"
          step="0.1"
          value={String(selectedEdge.waitSeconds ?? '')}
          onChange={(event) => {
            const v = event.target.value
            if (v === '') {
              updateEdge(selectedEdge.id, { waitSeconds: undefined })
            } else {
              const num = Number(v)
              updateEdge(selectedEdge.id, {
                waitSeconds: Number.isFinite(num) ? Math.max(0, num) : undefined
              })
            }
          }}
        />
      </label>
      <label
        className="runtimeField"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <input
          type="checkbox"
          checked={!!selectedEdge.conditionEnabled}
          onChange={(event) => {
            const enabled = event.target.checked
            if (enabled) {
              updateEdge(selectedEdge.id, {
                conditionEnabled: true,
                conditionVar: selectedEdge.conditionVar ?? '',
                conditionEquals: selectedEdge.conditionEquals ?? '',
                conditionIfFalse: selectedEdge.conditionIfFalse ?? 'skip',
                stopWaitingWhen: selectedEdge.stopWaitingWhen ?? 'none'
              })
            } else {
              updateEdge(selectedEdge.id, { conditionEnabled: false })
            }
          }}
        />
        <span>{t('editor.condition', 'Condition')}</span>
      </label>
      {selectedEdge.conditionEnabled ? (
        <>
          <div className="runtimeField">
            <span>{t('editor.variable', 'Variable (global key)')}</span>
            <SearchableSelect
              className="runtimeInput"
              options={allConditionVars}
              placeholder="e.g. has_key"
              value={String(selectedEdge.conditionVar ?? '')}
              onChange={(v) => updateEdge(selectedEdge.id, { conditionVar: v })}
            />
          </div>
          <div className="runtimeField">
            <span>{t('editor.equals', 'Equals')}</span>
            <SearchableSelect
              className="runtimeInput"
              options={allConditionEquals}
              placeholder="e.g. true / 1 / done"
              value={String(selectedEdge.conditionEquals ?? '')}
              onChange={(v) => updateEdge(selectedEdge.id, { conditionEquals: v })}
            />
          </div>
          <label className="runtimeField">
            <span>{t('editor.ifFalse', 'If false')}</span>
            <select
              className="runtimeInput"
              value={selectedEdge.conditionIfFalse ?? 'skip'}
              onChange={(event) => {
                const val = event.target.value as 'skip' | 'wait_until_true'
                updateEdge(selectedEdge.id, {
                  conditionIfFalse: val,
                  stopWaitingWhen:
                    val === 'skip' ? undefined : (selectedEdge.stopWaitingWhen ?? 'none')
                })
              }}
            >
              <option value="skip">
                {t('editor.edgeConditionSkip', 'skip (skip branch)')}
              </option>
              <option value="wait_until_true">
                {t('editor.edgeConditionWait', 'wait until true (wait)')}
              </option>
            </select>
          </label>
          {selectedEdge.conditionIfFalse === 'wait_until_true' ? (
            <>
              <label className="runtimeField">
                <span>{t('editor.stopWaitingWhen', 'Stop waiting when')}</span>
                <select
                  className="runtimeInput"
                  value={selectedEdge.stopWaitingWhen ?? 'none'}
                  onChange={(event) =>
                    updateEdge(selectedEdge.id, {
                      stopWaitingWhen: event.target.value as
                        | 'none'
                        | 'global_var'
                        | 'node_reached'
                        | 'timeout'
                    })
                  }
                >
                  <option value="none">
                    {t('editor.stopWaitingNone', 'none (wait forever)')}
                  </option>
                  <option value="global_var">
                    {t('editor.stopWaitingGlobalVar', 'global variable')}
                  </option>
                  <option value="node_reached">
                    {t('editor.stopWaitingNodeReached', 'node reached')}
                  </option>
                  <option value="timeout">{t('editor.stopWaitingTimeout', 'timeout')}</option>
                </select>
              </label>
              {selectedEdge.stopWaitingWhen === 'global_var' ? (
                <>
                  <div className="runtimeField">
                    <span>{t('editor.endVariable', 'End Variable')}</span>
                    <SearchableSelect
                      className="runtimeInput"
                      options={allConditionVars}
                      placeholder="e.g. cutscene_abort"
                      value={String(selectedEdge.endConditionVar ?? '')}
                      onChange={(v) => updateEdge(selectedEdge.id, { endConditionVar: v })}
                    />
                  </div>
                  <div className="runtimeField">
                    <span>{t('editor.endEquals', 'End Equals')}</span>
                    <SearchableSelect
                      className="runtimeInput"
                      options={allConditionEquals}
                      placeholder="e.g. true"
                      value={String(selectedEdge.endConditionEquals ?? '')}
                      onChange={(v) => updateEdge(selectedEdge.id, { endConditionEquals: v })}
                    />
                  </div>
                </>
              ) : null}
              {selectedEdge.stopWaitingWhen === 'node_reached' ? (
                <div className="runtimeField">
                  <span>{t('editor.nodeName', 'Node name')}</span>
                  <SearchableSelect
                    className="runtimeInput"
                    options={allNodeNamesObjects}
                    placeholder="e.g. End"
                    value={String(selectedEdge.endNodeName ?? '')}
                    onChange={(v) => updateEdge(selectedEdge.id, { endNodeName: v })}
                    style={
                      selectedEdge.endNodeName &&
                      !allNodeNamesObjects.includes(String(selectedEdge.endNodeName))
                        ? { borderColor: 'var(--status-error)' }
                        : undefined
                    }
                  />
                </div>
              ) : null}
              {selectedEdge.stopWaitingWhen === 'timeout' ? (
                <label className="runtimeField">
                  <span>{t('editor.timeoutSeconds', 'Timeout (seconds)')}</span>
                  <input
                    className="runtimeInput"
                    type="number"
                    step="0.1"
                    placeholder="5"
                    value={String(selectedEdge.endTimeoutSeconds ?? '')}
                    onChange={(event) => {
                      const v = event.target.value
                      if (v === '') {
                        updateEdge(selectedEdge.id, { endTimeoutSeconds: undefined })
                      } else {
                        updateEdge(selectedEdge.id, {
                          endTimeoutSeconds: Math.max(0, Number(v))
                        })
                      }
                    }}
                  />
                </label>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </>
  )
})
