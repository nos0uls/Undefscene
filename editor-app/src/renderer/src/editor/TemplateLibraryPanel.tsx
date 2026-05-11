import React, { useCallback, useState } from 'react'
import type { RuntimeNode, RuntimeEdge } from './runtimeTypes'
import type { CutsceneTemplateSnippet } from './templateStorage'

// Пропсы панели библиотеки шаблонов.
// Все обработчики поднимаются вверх (в EditorShell), а панель остаётся "глупой" — только рендер.
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

export const TemplateLibraryPanel = React.memo(function TemplateLibraryPanel({
  t,
  templates,
  selectedNodes,
  onSaveTemplate,
  onInsertTemplate,
  onRenameTemplate,
  onDeleteTemplate
}: TemplateLibraryPanelProps) {
  // Текущее значение поля ввода названия нового шаблона.
  const [draftName, setDraftName] = useState('')

  const canSave = selectedNodes.length > 0

  // Сохраняем выделенные ноды как шаблон и очищаем поле ввода.
  const handleSave = useCallback(() => {
    const name = draftName.trim() || t('editor.templateDefaultName', 'Template')
    onSaveTemplate(name)
    setDraftName('')
  }, [draftName, onSaveTemplate, t])

  // Обработка нажатия Enter в поле названия — быстрое сохранение.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && canSave) {
        handleSave()
      }
    },
    [canSave, handleSave]
  )

  // Переименование через стандартный prompt — самый простой способ без лишнего состояния.
  const handleRename = useCallback(
    (templateId: string, currentName: string) => {
      const newName = window.prompt(
        t('editor.renameTemplatePrompt', 'Rename template:'),
        currentName
      )
      if (newName && newName.trim() && newName.trim() !== currentName) {
        onRenameTemplate(templateId, newName.trim())
      }
    },
    [onRenameTemplate, t]
  )

  return (
    <div className="runtimeSection">
      {/* Заголовок панели */}
      <div className="runtimeSectionTitle">{t('editor.templates', 'Templates')}</div>

      {/* Строка с полем названия и кнопкой сохранения выделенных нод */}
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
            border: '1px solid var(--ev-c-border)',
            background: 'var(--ev-c-bg-soft)',
            color: 'var(--ev-c-text-1)'
          }}
        />
        <button
          className="runtimeButton"
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          style={{ opacity: canSave ? 1 : 0.45, whiteSpace: 'nowrap' }}
        >
          {t('editor.saveSelection', 'Save Selection')}
        </button>
      </div>

      {/* Если шаблонов ещё нет — показываем подсказку */}
      {templates.length === 0 ? (
        <div className="runtimeHint">
          {t('editor.templatesEmpty', 'Select nodes and save them as a template.')}
        </div>
      ) : (
        /* Список сохранённых шаблонов */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {templates.map((template) => (
            <div
              key={template.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 4,
                background: 'var(--ev-c-bg-soft)',
                fontSize: 12
              }}
            >
              {/* Левая часть: название, статистика, дата создания */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={template.name}
                >
                  {template.name}
                </div>
                <div style={{ color: 'var(--ev-c-text-2)', fontSize: 11, marginTop: 2 }}>
                  {template.nodes.length} {t('editor.nodesCount', 'nodes')} ·{' '}
                  {template.edges.length} {t('editor.edgesCount', 'edges')} ·{' '}
                  {new Date(template.createdAt).toLocaleDateString()}
                </div>
              </div>

              {/* Правая часть: кнопки управления шаблоном */}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button
                  className="runtimeButton"
                  type="button"
                  onClick={() => onInsertTemplate(template.id)}
                  style={{ padding: '2px 8px', fontSize: 11 }}
                >
                  {t('editor.insert', 'Insert')}
                </button>
                <button
                  className="runtimeButton"
                  type="button"
                  onClick={() => handleRename(template.id, template.name)}
                  style={{ padding: '2px 8px', fontSize: 11 }}
                >
                  {t('editor.rename', 'Rename')}
                </button>
                <button
                  className="runtimeButton"
                  type="button"
                  onClick={() => onDeleteTemplate(template.id)}
                  style={{
                    padding: '2px 8px',
                    fontSize: 11,
                    color: '#e55'
                  }}
                >
                  {t('editor.delete', 'Delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
