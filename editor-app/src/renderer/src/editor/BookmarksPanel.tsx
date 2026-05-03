import React from 'react'
import { usePanelData } from './PanelDataContext'

export type BookmarksPanelProps = {
  selectNode: (nodeId: string) => void
  t: (key: string, fallback: string) => string
}

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
    <div className="runtimeSection">
      <div className="runtimeSectionTitle">{t('editor.nodes', 'Nodes')}</div>
      {nodes.length === 0 ? (
        <div className="runtimeHint">{t('editor.noNodesYet', 'No nodes yet. Click “Add Node”.')}</div>
      ) : (
        <ul className="runtimeList">
          {nodes.map((node) => (
            <li key={node.id}>
              <button
                className={[
                  'runtimeListItem',
                  node.id === selectedNodeId ? 'isActive' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                type="button"
                onClick={() => selectNode(node.id)}
              >
                {String(node.name ?? '').trim() ? String(node.name) : node.type}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})
