import React, { useCallback } from 'react'
import { NODE_TYPES } from './nodes/nodeRegistry'

// Собственный MIME-type для drag-and-drop из палитры нод.
// NODE_TYPES импортируется из nodeRegistry — единый источник истины для всех панелей.
const NODE_PALETTE_DRAG_MIME = 'application/x-undefscene-node-type'
type ActionsPanelProps = {
  t: (key: string, fallback: string) => string
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onAddNode: (type: string) => void
}

export const ActionsPanel = React.memo(function ActionsPanel({
  t,
  onSave,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAddNode
}: ActionsPanelProps) {
  // Стабильные коллбеки для кнопок палитры, чтобы не ререндерить каждую кнопку
  // при изменении hover/focus состояния других кнопок.
  const handleDragStart = useCallback((event: React.DragEvent<HTMLButtonElement>, type: string) => {
    event.dataTransfer.setData(NODE_PALETTE_DRAG_MIME, type)
    event.dataTransfer.setData('text/plain', type)
    event.dataTransfer.effectAllowed = 'copy'
  }, [])

  const handlePaletteClick = useCallback(
    (type: string) => () => {
      onAddNode(type)
    },
    [onAddNode]
  )

  return (
    <div className="runtimeSection runtimeSectionActions">
      <div className="runtimeSectionTitle">{t('editor.actions', 'Actions')}</div>
      <div className="runtimeRow">
        <button className="runtimeButton" type="button" onClick={onSave}>
          {t('menu.save', 'Save')}
        </button>
        <button className="runtimeButton" type="button" onClick={onUndo} disabled={!canUndo}>
          {t('menu.undo', 'Undo')}
        </button>
        <button className="runtimeButton" type="button" onClick={onRedo} disabled={!canRedo}>
          {t('menu.redo', 'Redo')}
        </button>
      </div>
      <div className="runtimeSectionTitle" style={{ marginTop: 6 }}>
        {t('editor.nodePalette', 'Node Palette')}
      </div>
      <ul className="runtimeList runtimeListScrollable">
        {NODE_TYPES.map((type) => (
          <li key={type}>
            <button
              className="runtimeListItem"
              type="button"
              draggable
              onDragStart={(event) => handleDragStart(event, type)}
              onClick={handlePaletteClick(type)}
            >
              {type}
            </button>
          </li>
        ))}
      </ul>
      <div className="runtimeHint">{t('editor.actionsHint', 'New nodes appear to the right of the selected node.')}</div>
    </div>
  )
})
