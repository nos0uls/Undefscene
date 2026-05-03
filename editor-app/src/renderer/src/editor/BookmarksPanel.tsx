import React, { useCallback, useState } from 'react'
import { usePanelData } from './PanelDataContext'
import type { RuntimeNode } from './runtimeTypes'

export type BookmarksPanelProps = {
  selectNode: (nodeId: string) => void
  t: (key: string, fallback: string) => string
}

// Высота одной строки списка и размер видимого окна.
// Используем windowed-рендер: монтируем только видимые + overscan ряды.
const ROW_HEIGHT = 36
const LIST_HEIGHT = 260
const OVERSCAN = 6

// Одна строка списка. Вынесена в memo-компонент, чтобы при скролле
// перерендеривались только новые ряды, а не весь список целиком.
const BookmarkRow = React.memo(function BookmarkRow({
  node,
  selected,
  top,
  selectNode
}: {
  node: RuntimeNode
  selected: boolean
  top: number
  selectNode: (nodeId: string) => void
}) {
  const label = String(node.name ?? '').trim() ? String(node.name) : node.type
  return (
    <li className="runtimeVirtualListRow" style={{ transform: `translateY(${top}px)`, height: ROW_HEIGHT }}>
      <button
        className={['runtimeListItem', selected ? 'isActive' : ''].filter(Boolean).join(' ')}
        type="button"
        onClick={() => selectNode(node.id)}
      >
        {label}
      </button>
    </li>
  )
})

export const BookmarksPanel = React.memo(function BookmarksPanel({
  selectNode,
  t
}: BookmarksPanelProps) {
  // Читаем актуальный список нод из контекста, а не из пропсов.
  // Это позволяет стабилизировать renderPanelContents callback
  // (DockingLayout не перерендеривается при drag ноды).
  const { runtime, selectedNode } = usePanelData()
  const nodes = runtime.nodes
  const selectedNodeId = selectedNode?.id ?? null
  const [scrollTop, setScrollTop] = useState(0)
  const onScroll = useCallback((e: React.UIEvent<HTMLUListElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  return (
    <div className="runtimeSection">
      <div className="runtimeSectionTitle">{t('editor.nodes', 'Nodes')}</div>
      {nodes.length === 0 ? (
        <div className="runtimeHint">{t('editor.noNodesYet', 'No nodes yet. Click “Add Node”.')}</div>
      ) : (
        <ul
          className="runtimeVirtualList"
          style={{ height: Math.min(nodes.length * ROW_HEIGHT, LIST_HEIGHT), overflowY: 'auto' }}
          onScroll={onScroll}
        >
          <div style={{ height: nodes.length * ROW_HEIGHT, position: 'relative' }}>
            {(() => {
              const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
              const end = Math.min(
                nodes.length,
                Math.ceil((scrollTop + LIST_HEIGHT) / ROW_HEIGHT) + OVERSCAN
              )
              const visible: React.JSX.Element[] = []
              for (let i = start; i < end; i++) {
                const node = nodes[i]
                visible.push(
                  <BookmarkRow
                    key={node.id}
                    node={node}
                    selected={node.id === selectedNodeId}
                    top={i * ROW_HEIGHT}
                    selectNode={selectNode}
                  />
                )
              }
              return visible
            })()}
          </div>
        </ul>
      )}
    </div>
  )
})
