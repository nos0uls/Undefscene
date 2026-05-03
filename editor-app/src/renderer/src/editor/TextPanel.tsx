import React, { useCallback } from 'react'
import type { RuntimeNode } from './runtimeTypes'
import type { ParsedYarnNode } from './yarnPreview'

type TextPanelProps = {
  t: (key: string, fallback: string) => string
  selectedNode: RuntimeNode | null
  yarnPreviewNodes: ParsedYarnNode[]
  yarnPreviewLoading: boolean
  selectedYarnPreviewTitle: string | null
  onSelectYarnPreviewTitle: (title: string | null) => void
  projectDir?: string
}

export const TextPanel = React.memo(function TextPanel({
  t,
  selectedNode,
  yarnPreviewNodes,
  yarnPreviewLoading,
  selectedYarnPreviewTitle,
  onSelectYarnPreviewTitle,
  projectDir
}: TextPanelProps) {
  const selectedYarnFile =
    selectedNode?.type === 'dialogue' ? String(selectedNode.params?.file ?? '').trim() : ''
  const activePreviewNode =
    yarnPreviewNodes.find((entry) => entry.title === selectedYarnPreviewTitle) ??
    yarnPreviewNodes[0] ??
    null

  const handleSelectTitle = useCallback(
    (title: string) => () => {
      onSelectYarnPreviewTitle(title)
    },
    [onSelectYarnPreviewTitle]
  )

  return (
    <div className="runtimeSection">
      <div className="runtimeSectionTitle">{t('editor.yarnPreview', 'Yarn Preview')}</div>
      {!selectedNode ? (
        <div className="runtimeHint">{t('editor.selectDialogueNode', 'Select a dialogue node.')}</div>
      ) : selectedNode.type !== 'dialogue' ? (
        <div className="runtimeHint">{t('editor.textPanelReserved', 'Dialogue preview only.')}</div>
      ) : !projectDir ? (
        <div className="runtimeHint">{t('editor.openProjectForYarn', 'Open a project.')}</div>
      ) : !selectedYarnFile ? (
        <div className="runtimeHint">{t('editor.setDialogueFile', 'Set the dialogue File field.')}</div>
      ) : yarnPreviewLoading ? (
        <div className="runtimeHint">{t('editor.loadingYarnPreview', 'Loading Yarn preview...')}</div>
      ) : yarnPreviewNodes.length === 0 ? (
        <div className="runtimeHint">
          {t('editor.noYarnNodes', 'No previewable Yarn nodes found in this file.')}
        </div>
      ) : (
        <>
          <div className="runtimeHint" style={{ marginBottom: 6 }}>
            {t('editor.file', 'File')}: {selectedYarnFile}
          </div>
          <div style={{ display: 'flex', gap: 8, minHeight: 220 }}>
            <div
              style={{
                width: 180,
                minWidth: 180,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                overflowY: 'auto'
              }}
            >
              {yarnPreviewNodes.map((entry) => (
                <button
                  key={entry.title}
                  type="button"
                  className={[
                    'runtimeListItem',
                    activePreviewNode?.title === entry.title ? 'isActive' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={handleSelectTitle(entry.title)}
                  style={{ textAlign: 'left' }}
                >
                  {entry.title}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="runtimeHint" style={{ marginBottom: 6 }}>
                {t('editor.node', 'Node')}: {activePreviewNode?.title ?? t('editor.unknown', 'Unknown')}
              </div>
              <pre className="runtimeCode" style={{ minHeight: 220, margin: 0 }}>
                {activePreviewNode?.body || t('editor.emptyNodeBody', '(Empty node body)')}
              </pre>
            </div>
          </div>
        </>
      )}
    </div>
  )
})
