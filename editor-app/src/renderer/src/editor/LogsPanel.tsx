import React, { useCallback, useState } from 'react'

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
  // Counts из единого прохода logsData (EditorShell), чтобы не фильтровать повторно.
  errorCount: number
  warnCount: number
  tipCount: number
}

type LogsPanelProps = {
  t: (key: string, fallback: string) => string
  logsData: LogsData
  logsFilters: LogsFilters
  onToggleFilter: (key: keyof LogsFilters) => void
  onSelectNode: (nodeId: string) => void
  onSelectEdge: (edgeId: string) => void
}

// Высота одной строки log entry и размер видимого окна.
// Windowed-рендер: монтируем только видимые + overscan ряды.
const ROW_HEIGHT = 24
const LIST_HEIGHT = 260
const OVERSCAN = 8

// Одна строка лога. Вынесена в memo-компонент, чтобы при скролле
// перерендеривались только новые ряды, а не весь список.
const LogEntryRow = React.memo(function LogEntryRow({
  entry,
  style,
  top,
  onClick
}: {
  entry: LogsData['visibleEntries'][number]
  style: { color: string; bg: string; icon: string }
  top: number
  onClick: () => void
}) {
  return (
    <div
      className="runtimeVirtualListRow"
      style={{
        transform: `translateY(${top}px)`,
        padding: '3px 6px',
        fontSize: 12,
        borderLeft: `3px solid ${style.color}`,
        background: style.bg,
        cursor: entry.nodeId || entry.edgeId ? 'pointer' : undefined,
        lineHeight: '18px'
      }}
      onClick={onClick}
    >
      <span style={{ fontWeight: 600, color: style.color }}>{style.icon}</span>{' '}
      {entry.message}
    </div>
  )
})

export const LogsPanel = React.memo(function LogsPanel({
  t,
  logsData,
  logsFilters,
  onToggleFilter,
  onSelectNode,
  onSelectEdge
}: LogsPanelProps) {
  const { visibleEntries, severityStyle, toggleButtons } = logsData

  // Состояние скролла для windowed-рендера логов.
  const [scrollTop, setScrollTop] = useState(0)
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  // Обработчик клика по entry — стабилизирован через useCallback.
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
        // Windowed-список: монтируем только видимые + overscan ряды,
        // чтобы не тратить время на сотни DOM-элементов при большом числе логов.
        <div
          className="runtimeVirtualList"
          style={{ height: Math.min(visibleEntries.length * ROW_HEIGHT, LIST_HEIGHT), overflowY: 'auto' }}
          onScroll={onScroll}
        >
          <div style={{ height: visibleEntries.length * ROW_HEIGHT, position: 'relative' }}>
            {(() => {
              const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
              const end = Math.min(
                visibleEntries.length,
                Math.ceil((scrollTop + LIST_HEIGHT) / ROW_HEIGHT) + OVERSCAN
              )
              const rows: React.JSX.Element[] = []
              for (let i = start; i < end; i++) {
                const entry = visibleEntries[i]
                const s = severityStyle[entry.severity] ?? severityStyle.warn
                rows.push(
                  <LogEntryRow
                    key={i}
                    entry={entry}
                    style={s}
                    top={i * ROW_HEIGHT}
                    onClick={() => handleEntryClick(entry)}
                  />
                )
              }
              return rows
            })()}
          </div>
        </div>
      )}
    </div>
  )
})
