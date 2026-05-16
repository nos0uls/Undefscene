import React, { useCallback, useEffect, useRef, useState } from 'react'

export type ValidationSeverityOverride = 'error' | 'warn' | 'tip' | 'hidden'

type LogsFilters = {
  errors: boolean
  warnings: boolean
  tips: boolean
}

type LogsData = {
  visibleEntries: Array<{
    severity: 'error' | 'warn' | 'tip'
    defaultSeverity?: 'error' | 'warn' | 'tip'
    ruleId?: string
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
  t: (
    path: string,
    fallbackOrParams?: string | Record<string, string | number | undefined>,
    maybeFallback?: string
  ) => string
  logsData: LogsData
  logsFilters: LogsFilters
  onToggleFilter: (key: keyof LogsFilters) => void
  onSelectNode: (nodeId: string) => void
  onSelectEdge: (edgeId: string) => void
  onSetRuleOverride?: (ruleId: string, severity: ValidationSeverityOverride | 'reset') => void
}

// Высота одной строки log entry и размер видимого окна.
// Windowed-рендер: монтируем только видимые + overscan ряды.
const ROW_HEIGHT = 24
const LIST_HEIGHT = 260
const OVERSCAN = 8
const CONTEXT_MENU_WIDTH = 180
const CONTEXT_MENU_HEIGHT = 116
const SEVERITY_SUBMENU_WIDTH = 140
const SEVERITY_SUBMENU_HEIGHT = 154

// Одна строка лога. Вынесена в memo-компонент, чтобы при скролле
// перерендеривались только новые ряды, а не весь список.
const LogEntryRow = React.memo(function LogEntryRow({
  entry,
  style,
  top,
  onClick,
  onContextMenu
}: {
  entry: LogsData['visibleEntries'][number]
  style: { color: string; bg: string; icon: string }
  top: number
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
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
      onContextMenu={onContextMenu}
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
  onSelectEdge,
  onSetRuleOverride
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

  // --- Контекстное меню для строки лога ---
  // Храним текущую запись, для которой открыто меню, и её экранные координаты.
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    entry: LogsData['visibleEntries'][number]
  } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Закрываем меню при клике вне его или при нажатии Escape.
  useEffect(() => {
    if (!contextMenu) return
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  // Открываем контекстное меню по правому клику на строке лога.
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, entry: LogsData['visibleEntries'][number]) => {
      e.preventDefault()
      e.stopPropagation()
      const margin = 8
      const x = Math.max(
        margin,
        Math.min(e.clientX, window.innerWidth - CONTEXT_MENU_WIDTH - margin)
      )
      const y = Math.max(
        margin,
        Math.min(e.clientY, window.innerHeight - CONTEXT_MENU_HEIGHT - margin)
      )
      setContextMenu({ x, y, entry })
    },
    []
  )

  // Копирование текста сообщения в буфер обмена.
  const handleCopy = useCallback((message: string) => {
    navigator.clipboard?.writeText(message).catch(() => {})
    setContextMenu(null)
  }, [])

  // Переход к ноде или ребру из меню.
  const handleGoTo = useCallback((entry: LogsData['visibleEntries'][number]) => {
    if (entry.nodeId) {
      onSelectNode(entry.nodeId)
    } else if (entry.edgeId) {
      onSelectEdge(entry.edgeId)
    }
    setContextMenu(null)
  }, [onSelectNode, onSelectEdge])

  // Выбор переопределения серьёзности правила.
  const handleSeverityOverride = useCallback(
    (ruleId: string, severity: ValidationSeverityOverride | 'reset') => {
      onSetRuleOverride?.(ruleId, severity)
      setContextMenu(null)
    },
    [onSetRuleOverride]
  )

  // Состояние раскрытия подменю серьёзности (hover-логика).
  const [submenuOpen, setSubmenuOpen] = useState(false)

  return (
    <div className="runtimeSection" style={{ position: 'relative' }}>
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
              // Используем составной key вместо индекса для стабильности React:
              // это предотвращает проблемы при изменении порядка или добавлении элементов.
              for (let i = start; i < end; i++) {
                const entry = visibleEntries[i]
                const t = severityStyle[entry.severity] ?? severityStyle.warn
                rows.push(
                  <LogEntryRow
                    key={`${entry.severity}-${entry.nodeId || entry.edgeId || ''}-${entry.message.slice(0, 20)}-${i}`}
                    entry={entry}
                    style={t}
                    top={i * ROW_HEIGHT}
                    onClick={() => handleEntryClick(entry)}
                    onContextMenu={(e) => handleContextMenu(e, entry)}
                  />
                )
              }
              return rows
            })()}
          </div>
        </div>
      )}

      {/* Контекстное меню рендерится fixed, чтобы не вылезать за край панели/экрана. */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
            background: 'var(--ev-c-bg-1, #1e1e1e)',
            border: '1px solid var(--ev-c-border, #333)',
            borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            padding: '4px 0',
            minWidth: CONTEXT_MENU_WIDTH,
            fontSize: 12
          }}
        >
          {/* Копировать сообщение — доступно всегда. */}
          <div
            style={{ padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
            onClick={() => handleCopy(contextMenu.entry.message)}
            onMouseEnter={() => setSubmenuOpen(false)}
          >
            {t('editor.logs.copy', 'Copy')}
          </div>

          {/* Перейти к ноде или ребру, если применимо. */}
          {(contextMenu.entry.nodeId || contextMenu.entry.edgeId) && (
            <div
              style={{ padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
              onClick={() => handleGoTo(contextMenu.entry)}
              onMouseEnter={() => setSubmenuOpen(false)}
            >
              {contextMenu.entry.nodeId
                ? t('editor.logs.goToNode', 'Go to Node')
                : t('editor.logs.goToEdge', 'Go to Edge')}
            </div>
          )}

          {/* Подменю конфигурации серьёзности — только для записей с ruleId. */}
          {contextMenu.entry.ruleId && onSetRuleOverride && (
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => setSubmenuOpen(true)}
              onMouseLeave={() => setSubmenuOpen(false)}
            >
              <div style={{ padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {t('editor.logs.configureSeverity', { ruleId: contextMenu.entry.ruleId }, "Configure Severity")}
                {' '}
                <span style={{ opacity: 0.6 }}>&rsaquo;</span>
              </div>
              {submenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    left: contextMenu.x + CONTEXT_MENU_WIDTH + SEVERITY_SUBMENU_WIDTH > window.innerWidth
                      ? -SEVERITY_SUBMENU_WIDTH
                      : CONTEXT_MENU_WIDTH,
                    top: contextMenu.y + SEVERITY_SUBMENU_HEIGHT > window.innerHeight
                      ? -SEVERITY_SUBMENU_HEIGHT + 28
                      : 0,
                    background: 'var(--ev-c-bg-1, #1e1e1e)',
                    border: '1px solid var(--ev-c-border, #333)',
                    borderRadius: 4,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    padding: '4px 0',
                    minWidth: SEVERITY_SUBMENU_WIDTH
                  }}
                >
                  <div
                    style={{ padding: '6px 12px', cursor: 'pointer' }}
                    onClick={() => handleSeverityOverride(contextMenu.entry.ruleId!, 'error')}
                  >
                    {t('editor.logs.error', 'Error')}
                  </div>
                  <div
                    style={{ padding: '6px 12px', cursor: 'pointer' }}
                    onClick={() => handleSeverityOverride(contextMenu.entry.ruleId!, 'warn')}
                  >
                    {t('editor.logs.warn', 'Warn')}
                  </div>
                  <div
                    style={{ padding: '6px 12px', cursor: 'pointer' }}
                    onClick={() => handleSeverityOverride(contextMenu.entry.ruleId!, 'tip')}
                  >
                    {t('editor.logs.suggestion', 'Suggestion')}
                  </div>
                  <div
                    style={{ padding: '6px 12px', cursor: 'pointer' }}
                    onClick={() => handleSeverityOverride(contextMenu.entry.ruleId!, 'hidden')}
                  >
                    {t('editor.logs.ignore', 'Ignore')}
                  </div>
                  <div
                    style={{ padding: '6px 12px', cursor: 'pointer', borderTop: '1px solid var(--ev-c-border, #333)' }}
                    onClick={() => handleSeverityOverride(contextMenu.entry.ruleId!, 'reset')}
                  >
                    {t('editor.logs.resetToDefault', 'Reset to Default')}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
