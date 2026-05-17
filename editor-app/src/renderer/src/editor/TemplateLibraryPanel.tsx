import React, { useCallback, useState } from 'react'
import type { RuntimeNode, RuntimeEdge } from './runtimeTypes'
import type { CutsceneTemplateSnippet } from './templateStorage'

// Пропсы панели библиотеки шаблонов.
type TemplateLibraryPanelProps = {
  t: (key: string, fallback: string) => string
  templates: CutsceneTemplateSnippet[]
  selectedNodes: RuntimeNode[]
  selectedEdges: RuntimeEdge[]
  onSaveTemplate: (name: string) => void
  onInsertTemplate: (templateId: string) => void
  onRenameTemplate: (templateId: string, newName: string) => void
  onDeleteTemplate: (templateId: string) => void
}

type TemplateRowProps = {
  template: CutsceneTemplateSnippet
  t: TemplateLibraryPanelProps['t']
  onInsertTemplate: TemplateLibraryPanelProps['onInsertTemplate']
  onRenameTemplate: TemplateLibraryPanelProps['onRenameTemplate']
  onDeleteTemplate: TemplateLibraryPanelProps['onDeleteTemplate']
}

const TemplateRow = React.memo(function TemplateRow({
  template,
  t,
  onInsertTemplate,
  onRenameTemplate,
  onDeleteTemplate
}: TemplateRowProps) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(template.name)

  const startEdit = useCallback(() => {
    setEditName(template.name)
    setEditing(true)
  }, [template.name])

  const commitEdit = useCallback(() => {
    setEditing(false)
    const trimmed = editName.trim()
    if (trimmed && trimmed !== template.name) {
      onRenameTemplate(template.id, trimmed)
    }
  }, [editName, template.id, template.name, onRenameTemplate])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commitEdit()
      } else if (e.key === 'Escape') {
        setEditing(false)
        setEditName(template.name)
      }
    },
    [commitEdit, template.name]
  )

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDeleteTemplate(template.id)
    },
    [template.id, onDeleteTemplate]
  )

  return (
    <div className="runtimeListItem" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
      {/* Левая часть: название (inline-редактирование), статистика */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              fontSize: 12,
              fontWeight: 600,
              background: 'var(--bg-elevated, var(--color-background-soft))',
              color: 'var(--text-primary, var(--ev-c-text-1))',
              border: '1px solid var(--ev-c-accent)',
              borderRadius: 3,
              padding: '2px 4px',
              outline: 'none'
            }}
          />
        ) : (
          <div
            onClick={(e) => {
              e.stopPropagation()
              startEdit()
            }}
            style={{
              fontWeight: 600,
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              cursor: 'text',
              color: 'var(--ev-c-text-1)'
            }}
            title={template.name}
          >
            {template.name}
          </div>
        )}
        <div style={{ color: 'var(--ev-c-text-2)', fontSize: 11, marginTop: 2 }}>
          {template.nodes.length} {t('editor.nodesCount', 'nodes')} ·{' '}
          {template.edges.length} {t('editor.edgesCount', 'edges')} ·{' '}
          {new Date(template.createdAt).toLocaleDateString()}
        </div>
      </div>

      {/* Правая часть: Insert + Delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <button
          className="runtimeButton"
          type="button"
          onClick={() => onInsertTemplate(template.id)}
          style={{ padding: '2px 8px', fontSize: 11 }}
        >
          {t('editor.insert', 'Insert')}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          title={t('editor.delete', 'Delete')}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--ev-c-text-2)',
            fontSize: 13,
            cursor: 'pointer',
            padding: '0 2px',
            lineHeight: 1,
            flexShrink: 0
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.color = 'hsl(0, 80%, 60%)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--ev-c-text-2)'
          }}
        >
          {'\u00D7'}
        </button>
      </div>
    </div>
  )
})

export const TemplateLibraryPanel = React.memo(function TemplateLibraryPanel({
  t,
  templates,
  selectedNodes,
  onSaveTemplate,
  onInsertTemplate,
  onRenameTemplate,
  onDeleteTemplate
}: TemplateLibraryPanelProps) {
  const [draftName, setDraftName] = useState('')

  const canSave = selectedNodes.length > 0

  const handleSave = useCallback(() => {
    const name = draftName.trim() || t('editor.templateDefaultName', 'Template')
    onSaveTemplate(name)
    setDraftName('')
  }, [draftName, onSaveTemplate, t])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && canSave) {
        handleSave()
      }
    },
    [canSave, handleSave]
  )

  return (
    <div className="runtimeSection">
      <div className="runtimeSectionTitle">{t('editor.templates', 'Templates')}</div>

      {/* Строка с полем названия и кнопкой сохранения */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          marginBottom: 8,
          alignItems: 'center'
        }}
      >
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder={t('editor.templateNamePlaceholder', 'Template name…')}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            minWidth: 60,
            fontSize: 12,
            padding: '3px 6px',
            borderRadius: 4,
            border: '1px solid var(--ev-c-gray-2)',
            background: 'var(--color-background-mute)',
            color: 'var(--ev-c-text-1)'
          }}
        />
        <button
          className="runtimeButton"
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          style={{ whiteSpace: 'nowrap' }}
        >
          {t('editor.saveSelection', 'Save Selection')}
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="runtimeHint">
          {t('editor.templatesEmpty', 'Select nodes and save them as a template.')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {templates.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              t={t}
              onInsertTemplate={onInsertTemplate}
              onRenameTemplate={onRenameTemplate}
              onDeleteTemplate={onDeleteTemplate}
            />
          ))}
        </div>
      )}
    </div>
  )
})
