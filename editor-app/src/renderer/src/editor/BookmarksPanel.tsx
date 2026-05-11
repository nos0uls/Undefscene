import React from 'react'
import { usePanelData } from './PanelDataContext'
import type { RuntimeNode } from './runtimeTypes'

export type BookmarksPanelProps = {
  selectNode: (nodeId: string) => void
  t: (key: string, fallback: string) => string
}

const BookmarkRow = React.memo(function BookmarkRow({
  node,
  selected,
  selectNode
}: {
  node: RuntimeNode
  selected: boolean
  selectNode: (nodeId: string) => void
}) {
  const label = String(node.name ?? '').trim() ? String(node.name) : node.type
  return (
    <li>
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

  return (
    <div className="runtimeSection" style={{ height: '100%' }}>
      <div className="runtimeSectionTitle">{t('editor.nodes', 'Nodes')}</div>
      {nodes.length === 0 ? (
        <div className="runtimeHint">{t('editor.noNodesYet', 'No nodes yet. Click “Add Node”.')}</div>
      ) : (
        <ul
          className="runtimeList"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 0, margin: 0, listStyle: 'none' }}
        >
          {nodes.map((node) => (
            <BookmarkRow
              key={node.id}
              node={node}
              selected={node.id === selectedNodeId}
              selectNode={selectNode}
            />
          ))}
        </ul>
      )}
    </div>
  )
})
