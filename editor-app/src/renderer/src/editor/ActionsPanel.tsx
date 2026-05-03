import React, { useCallback } from 'react'

// Собственный MIME-type для drag-and-drop из палитры нод.
const NODE_PALETTE_DRAG_MIME = 'application/x-undefscene-node-type'

const PALETTE_NODE_TYPES = [
  'start',
  'end',
  'move',
  'follow_path',
  'actor_create',
  'actor_destroy',
  'animate',
  'dialogue',
  'wait_for_dialogue',
  'camera_track',
  'camera_track_until_stop',
  'camera_pan',
  'camera_pan_obj',
  'camera_center',
  'parallel_start',
  'branch',
  'run_function',
  'set_position',
  'set_depth',
  'set_facing',
  'camera_shake',
  'auto_facing',
  'auto_walk',
  'tween',
  'tween_camera',
  'set_property',
  'fade_in',
  'fade_out',
  'play_sfx',
  'emote',
  'jump',
  'halt',
  'flip',
  'spin',
  'shake_object',
  'set_visible',
  'instant_mode',
  'mark_node',
  'partial_control',
  'wait_for_interact',
  'set_flag',
  'spawn_entity',
  'destroy_entity'
] as const

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
        {PALETTE_NODE_TYPES.map((type) => (
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
