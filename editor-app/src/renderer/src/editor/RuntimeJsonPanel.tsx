import React from 'react'

type RuntimeJsonPanelProps = {
  t: (key: string, fallback: string) => string
  runtimeJsonString: string
}

export const RuntimeJsonPanel = React.memo(function RuntimeJsonPanel({
  t,
  runtimeJsonString
}: RuntimeJsonPanelProps) {
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
