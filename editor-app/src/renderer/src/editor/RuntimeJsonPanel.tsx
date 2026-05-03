import React, { useMemo } from 'react'
import { usePanelData } from './PanelDataContext'

type RuntimeJsonPanelProps = {
  t: (key: string, fallback: string) => string
}

// JSON.stringify делается лениво — только когда панель смонтирована.
// На больших графах stringify может занимать десятки мс,
// поэтому не считаем его в EditorShell, если панель не открыта.
export const RuntimeJsonPanel = React.memo(function RuntimeJsonPanel({
  t
}: RuntimeJsonPanelProps) {
  const { runtime } = usePanelData()

  // Исключаем editor-only поля (selectedNodeId, selectedNodeIds, selectedEdgeId),
  // которые меняются при каждом клике и вызывают бессмысленную пересериализацию.
  const runtimeJsonString = useMemo(
    () =>
      JSON.stringify(
        {
          schemaVersion: runtime.schemaVersion,
          title: runtime.title,
          nodes: runtime.nodes,
          edges: runtime.edges,
          lastSavedAtMs: runtime.lastSavedAtMs
        },
        null,
        2
      ),
    [runtime.schemaVersion, runtime.title, runtime.nodes, runtime.edges, runtime.lastSavedAtMs]
  )

  return (
    <div className="runtimeSection" style={{ height: '100%' }}>
      <div className="runtimeHint">
        {t(
          'editor.runtimeJsonHint',
          'Raw editor scene state with node positions, selection, and editor-only fields.'
        )}
      </div>
      <div className="runtimeSectionTitle">
        {t('editor.runtimeJsonContent', 'Runtime JSON content')}
      </div>
      <pre className="runtimeCode runtimeCodeFill">{runtimeJsonString}</pre>
    </div>
  )
})
