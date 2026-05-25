import React, { useCallback, useMemo, useState } from 'react'
import type { RuntimeNote } from './runtimeTypes'
import { useConfirm } from './confirmContext'

export type NotesPanelProps = {
  notes: RuntimeNote[]
  // Имя выделенной ноды (для кнопки Link to selected).
  // Передаём `null`, если ничего не выделено.
  selectedNode: { id: string; name: string } | null
  onAddNote: (note: { text: string; category: RuntimeNote['category']; x?: number; y?: number }) => void
  onUpdateNote: (id: string, patch: Partial<Omit<RuntimeNote, 'id'>>) => void
  onDeleteNote: (id: string) => void
  // Центрировать канвас на координатах (для заметок без привязки к ноде).
  onSelectNote: (x: number, y: number) => void
  // Сфокусироваться на конкретной ноде (для заметок с nodeId).
  onFocusNode: (nodeId: string) => void
  // Отобразить имя привязанной ноды (или fallback, если она не найдена).
  resolveNodeName: (nodeId: string) => string | null
  t: (key: string, fallback: string) => string
}

const CATEGORY_COLORS: Record<RuntimeNote['category'], string> = {
  acting: 'hsl(200, 70%, 60%)',
  camera: 'hsl(280, 70%, 60%)',
  sound: 'hsl(150, 70%, 60%)',
  todo: 'hsl(45, 90%, 55%)',
  warning: 'hsl(0, 80%, 60%)'
}

const ALL_CATEGORIES: RuntimeNote['category'][] = ['acting', 'camera', 'sound', 'todo', 'warning']

function categoryLabel(cat: RuntimeNote['category'], t: NotesPanelProps['t']): string {
  // Сначала ищем специфичный ключ для категории заметки, затем fallback
  switch (cat) {
    case 'acting':
      return t('editor.noteCategories.acting', 'Acting')
    case 'camera':
      return t('editor.noteCategories.camera', 'Camera')
    case 'sound':
      return t('editor.noteCategories.sound', 'Sound')
    case 'todo':
      return t('editor.noteCategories.todo', 'Todo')
    case 'warning':
      return t('editor.noteCategories.warning', 'Warning')
    default:
      return cat
  }
}

const NoteRow = React.memo(function NoteRow({
  note,
  selectedNode,
  onUpdateNote,
  onDeleteNote,
  onSelectNote,
  onFocusNode,
  resolveNodeName,
  t
}: {
  note: RuntimeNote
  selectedNode: NotesPanelProps['selectedNode']
  onUpdateNote: NotesPanelProps['onUpdateNote']
  onDeleteNote: NotesPanelProps['onDeleteNote']
  onSelectNote: NotesPanelProps['onSelectNote']
  onFocusNode: NotesPanelProps['onFocusNode']
  resolveNodeName: NotesPanelProps['resolveNodeName']
  t: NotesPanelProps['t']
}) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(note.text)

  const confirm = useConfirm()

  const startEdit = useCallback(() => {
    setEditText(note.text)
    setEditing(true)
  }, [note.text])

  const commitEdit = useCallback(() => {
    setEditing(false)
    if (editText.trim() !== note.text) {
      onUpdateNote(note.id, { text: editText.trim() })
    }
  }, [editText, note.id, note.text, onUpdateNote])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commitEdit()
      } else if (e.key === 'Escape') {
        setEditing(false)
        setEditText(note.text)
      }
    },
    [commitEdit, note.text]
  )

  const handleTogglePin = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onUpdateNote(note.id, { pinned: !note.pinned })
    },
    [note.id, note.pinned, onUpdateNote]
  )

  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      const confirmed = await confirm({
        title: t('editor.confirmDeleteNote', 'Delete Note'),
        message: t('editor.confirmDeleteNoteMessage', 'Are you sure?')
      })
      if (confirmed) onDeleteNote(note.id)
    },
    [note.id, onDeleteNote, confirm, t]
  )

  const handleContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault()
      const confirmed = await confirm({
        title: t('editor.confirmDeleteNote', 'Delete Note'),
        message: t('editor.confirmDeleteNoteMessage', 'Are you sure?')
      })
      if (confirmed) onDeleteNote(note.id)
    },
    [note.id, onDeleteNote, confirm, t]
  )

  // Клик по заметке — если есть привязка к ноде, фокусируемся на ней,
  // иначе центрируем канвас на сохранённых координатах.
  const handleSelect = useCallback(() => {
    if (note.nodeId) {
      onFocusNode(note.nodeId)
      return
    }
    onSelectNote(note.x, note.y)
  }, [note.nodeId, note.x, note.y, onFocusNode, onSelectNote])

  const handleLink = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (note.nodeId) {
        // Повторный клик на "связанной" иконке снимает привязку.
        onUpdateNote(note.id, { nodeId: undefined })
      } else if (selectedNode) {
        onUpdateNote(note.id, { nodeId: selectedNode.id })
      }
    },
    [note.id, note.nodeId, onUpdateNote, selectedNode]
  )

  const linkedName = note.nodeId ? resolveNodeName(note.nodeId) : null

  const color = CATEGORY_COLORS[note.category]
  const catLabel = categoryLabel(note.category, t)

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('application/x-undefscene-note-id', note.id)
      e.dataTransfer.effectAllowed = 'move'
    },
    [note.id]
  )

  return (
    <li
      className="runtimeListItem noteRow"
      draggable
      onDragStart={handleDragStart}
      onContextMenu={handleContextMenu}
    >
      {/* Цветовой индикатор категории */}
      <span
        title={catLabel}
        className="noteRowCategoryDot"
        style={{ background: color }}
        onClick={handleSelect}
      />

      {/* Текст заметки (inline-редактирование) */}
      <div className="noteRowText" onClick={handleSelect}>
        {editing ? (
          <input
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="noteRowInput"
          />
        ) : (
          <span
            onClick={(e) => {
              e.stopPropagation()
              startEdit()
            }}
            className="noteRowTextContent"
          >
            {note.text || t('editor.emptyNoteText', 'Empty note')}
          </span>
        )}
      </div>

      {/* Бейдж категории */}
      <span
        className="noteRowCategoryBadge"
        style={{ background: color }}
      >
        {catLabel}
      </span>

      {/* Привязанная нода или координаты */}
      {note.nodeId && linkedName ? (
        <span
          onClick={handleSelect}
          className="noteRowLinkedNode"
          title={t('editor.focusNode', 'Focus node') + `: ${linkedName}`}
        >
          @ {linkedName}
        </span>
      ) : (
        <span
          onClick={handleSelect}
          className="noteRowCoords"
          title={t('editor.goToPosition', 'Go to position')}
        >
          {Math.round(note.x)}, {Math.round(note.y)}
        </span>
      )}

      <div className="noteRowActions">
        {/* Привязка к выделенной ноде */}
        <button
          type="button"
          onClick={handleLink}
          disabled={!note.nodeId && !selectedNode}
          title={
            note.nodeId
              ? t('editor.unlinkNote', 'Unlink from node')
              : selectedNode
                ? t('editor.linkNote', 'Link to selected node') + `: ${selectedNode.name}`
                : t('editor.linkNoteHint', 'Select a node first to link this note')
          }
          className="noteRowActionBtn noteRowLinkBtn"
          style={{
            color: note.nodeId ? 'var(--ev-c-accent, #4a9eff)' : 'var(--ev-c-text-2)',
            cursor: !note.nodeId && !selectedNode ? 'not-allowed' : 'pointer',
            opacity: !note.nodeId && !selectedNode ? 0.35 : 1
          }}
        >
          {/* chain link icon */}
          {'\u{1F517}'}
        </button>

        {/* Pin toggle */}
        <button
          type="button"
          onClick={handleTogglePin}
          title={note.pinned ? t('editor.unpinNote', 'Unpin') : t('editor.pinNote', 'Pin')}
          className="noteRowActionBtn noteRowPinBtn"
          style={{
            color: note.pinned ? 'var(--ev-c-accent)' : 'var(--ev-c-text-2)'
          }}
        >
          {note.pinned ? '\uD83D\uDCCC' : '\uD83D\uDCCD'}
        </button>

        {/* Удалить */}
        <button
          type="button"
          onClick={handleDelete}
          title={t('editor.deleteNote', 'Delete note')}
          className="noteRowActionBtn noteRowDeleteBtn"
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
    </li>
  )
})

export const NotesPanel = React.memo(function NotesPanel({
  notes,
  selectedNode,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onSelectNote,
  onFocusNode,
  resolveNodeName,
  t
}: NotesPanelProps) {
  const [filter, setFilter] = useState<RuntimeNote['category'] | null>(null)

  const filteredNotes = useMemo(() => {
    if (!filter) return notes
    return notes.filter((n) => n.category === filter)
  }, [notes, filter])

  const sortedNotes = useMemo(() => {
    return [...filteredNotes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
  }, [filteredNotes])

  const handleAdd = useCallback(() => {
    const category = filter ?? 'todo'
    onAddNote({ text: t('editor.newNoteText', 'New note'), category })
  }, [onAddNote, t, filter])

  return (
    <div className="runtimeSection" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Заголовок с кнопкой добавления */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
        <div className="runtimeSectionTitle">
          {t('editor.notesTitle', 'Director Notes')}
        </div>
        <button
          type="button"
          onClick={handleAdd}
          title={t('editor.addNote', 'Add note')}
          className="noteAddBtn"
        >
          +
        </button>
      </div>

      {/* Фильтр по категориям */}
      <div className="noteFilterChips">
        <FilterChip
          label={t('editor.all', 'All')}
          color="var(--ev-c-text-2)"
          active={filter === null}
          onClick={() => setFilter(null)}
        />
        {ALL_CATEGORIES.map((cat) => (
          <FilterChip
            key={cat}
            label={categoryLabel(cat, t)}
            color={CATEGORY_COLORS[cat]}
            active={filter === cat}
            onClick={() => setFilter(cat)}
          />
        ))}
      </div>

      {/* Список заметок */}
      {sortedNotes.length === 0 ? (
        <div className="runtimeHint" style={{ padding: '8px 4px' }}>
          {t('editor.noNotesYet', 'No notes yet. Click + to add.')}
        </div>
      ) : (
        <ul
          className="runtimeList"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0 0', margin: 0, listStyle: 'none' }}
        >
          {sortedNotes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              selectedNode={selectedNode}
              onUpdateNote={onUpdateNote}
              onDeleteNote={onDeleteNote}
              onSelectNote={onSelectNote}
              onFocusNode={onFocusNode}
              resolveNodeName={resolveNodeName}
              t={t}
            />
          ))}
        </ul>
      )}
    </div>
  )
})

function FilterChip({
  label,
  color,
  active,
  onClick
}: {
  label: string
  color: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="noteFilterChip"
      style={{
        border: `1px solid ${active ? color : 'transparent'}`,
        background: active ? `${color}22` : 'transparent',
        color: active ? 'var(--ev-c-text-1)' : 'var(--ev-c-text-2)'
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = 'var(--ev-c-gray-3)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = 'transparent'
        }
      }}
    >
      {label}
    </button>
  )
}
