import React, { useCallback, useState } from 'react'
import type { RuntimeNode, RuntimeEdge } from './runtimeTypes'
import type { CutsceneTemplateSnippet } from './templateStorage'
import { useConfirm } from './confirmContext'

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

  const confirm = useConfirm()

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
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      const confirmed = await confirm({
        title: t('editor.confirmDeleteTemplate', 'Delete Template'),
        message: t('editor.confirmDeleteTemplateMessage', 'Are you sure?')
      })
      if (confirmed) onDeleteTemplate(template.id)
    },
    [template.id, onDeleteTemplate, confirm, t]
  )

  return (
    <div className="runtimeListItem templateRow">
      {/* Левая часть: название (inline-редактирование), статистика */}
      <div className="templateRowInfo">
        {editing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="templateRowInput"
          />
        ) : (
          <div
            onClick={(e) => {
              e.stopPropagation()
              startEdit()
            }}
            className="templateRowName"
            title={template.name}
          >
            {template.name}
          </div>
        )}
        <div className="templateRowMeta">
          {template.nodes.length} {t('editor.nodesCount', 'nodes')} ·{' '}
          {template.edges.length} {t('editor.edgesCount', 'edges')} ·{' '}
          {new Date(template.createdAt).toLocaleDateString()}
        </div>
      </div>

      {/* Правая часть: Insert + Delete */}
      <div className="templateRowActions">
        <button
          className="runtimeButton templateRowInsertBtn"
          type="button"
          onClick={() => onInsertTemplate(template.id)}
        >
          {t('editor.insert', 'Insert')}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          title={t('editor.delete', 'Delete')}
          className="templateRowDeleteBtn"
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
      <div className="templateSaveRow">
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder={t('editor.templateNamePlaceholder', 'Template name…')}
          onKeyDown={handleKeyDown}
          className="templateSaveInput"
        />
        <button
          className="runtimeButton templateSaveBtn"
          type="button"
          onClick={handleSave}
          disabled={!canSave}
        >
          {t('editor.saveSelection', 'Save Selection')}
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="runtimeHint">
          {t('editor.templatesEmpty', 'Select nodes and save them as a template.')}
        </div>
      ) : (
        <div className="templateList">
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
