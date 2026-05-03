import React, { useCallback } from 'react'

type LogsFilters = {
  errors: boolean
  warnings: boolean
  tips: boolean
}

type LogsData = {
  visibleEntries: Array<{
    severity: 'error' | 'warn' | 'tip'
    message: string
    nodeId?: string
    edgeId?: string
  }>
  severityStyle: Record<string, { color: string; bg: string; icon: string }>
  toggleButtons: Array<{
    key: 'errors' | 'warnings' | 'tips'
    label: string
    count: number
    color: string
  }>
}

type LogsPanelProps = {
  t: (key: string, fallback: string) => string
  logsData: LogsData
  logsFilters: LogsFilters
  onToggleFilter: (key: keyof LogsFilters) => void
  onSelectNode: (nodeId: string) => void
  onSelectEdge: (edgeId: string) => void
}

export const LogsPanel = React.memo(function LogsPanel({
  t,
  logsData,
  logsFilters,
  onToggleFilter,
  onSelectNode,
  onSelectEdge
}: LogsPanelProps) {
  const { visibleEntries, severityStyle, toggleButtons } = logsData

  const handleEntryClick = useCallback(
    (entry: LogsData['visibleEntries'][number]) => {
      if (entry.nodeId) {
        onSelectNode(entry.nodeId)
      } else if (entry.edgeId) {
        onSelectEdge(entry.edgeId)
      }
    },
    [onSelectNode, onSelectEdge]
  )

  return (
    <div className="runtimeSection">
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 6,
          flexWrap: 'wrap'
        }}
      >
        {toggleButtons.map((btn) => {
          const isActive = logsFilters[btn.key]
          return (
            <button
              key={btn.key}
              type="button"
              className="logFilterButton"
              onClick={() => onToggleFilter(btn.key)}
              style={{
                color: isActive
                  ? btn.color
                  : `color-mix(in srgb, ${btn.color} 80%, var(--ev-c-text-2) 20%)`,
                background: isActive ? `color-mix(in srgb, ${btn.color} 20%, transparent)` : 'transparent',
                border: `1px solid ${isActive ? `color-mix(in srgb, ${btn.color} 40%, transparent)` : 'transparent'}`
              }}
            >
              {btn.label} ({btn.count})
            </button>
          )
        })}
      </div>

      {visibleEntries.length === 0 ? (
        <div className="runtimeHint" style={{ color: '#6c6' }}>
          {!logsFilters.errors && !logsFilters.warnings && !logsFilters.tips
            ? t('editor.logsEmptyFilters', 'Enable filters to see entries.')
            : t('editor.logsNoMatches', 'No matching entries.')}
        </div>
      ) : (
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          {visibleEntries.map((entry, i) => {
            const s = severityStyle[entry.severity] ?? severityStyle.warn
            return (
              <div
                key={i}
                style={{
                  padding: '3px 6px',
                  marginBottom: 2,
                  fontSize: 12,
                  borderLeft: `3px solid ${s.color}`,
                  background: s.bg,
                  cursor: entry.nodeId || entry.edgeId ? 'pointer' : undefined
                }}
                onClick={() => handleEntryClick(entry)}
              >
                <span style={{ fontWeight: 600, color: s.color }}>{s.icon}</span>{' '}
                {entry.message}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})
