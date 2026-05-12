import React, { useCallback, useMemo, useState } from 'react'
import type { RuntimeNote } from './runtimeTypes'

export type NotesPanelProps = {
  notes: RuntimeNote[]
  onAddNote: (note: { text: string; category: RuntimeNote['category']; x?: number; y?: number }) => void
  onUpdateNote: (id: string, patch: Partial<Omit<RuntimeNote, 'id'>>) => void
  onDeleteNote: (id: string) => void
  onSelectNote: (x: number, y: number) => void
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
  onUpdateNote,
  onDeleteNote,
  onSelectNote,
  t
}: {
  note: RuntimeNote
  onUpdateNote: NotesPanelProps['onUpdateNote']
  onDeleteNote: NotesPanelProps['onDeleteNote']
  onSelectNote: NotesPanelProps['onSelectNote']
  t: NotesPanelProps['t']
}) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(note.text)

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
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDeleteNote(note.id)
    },
    [note.id, onDeleteNote]
  )

  const handleSelect = useCallback(() => {
    onSelectNote(note.x, note.y)
  }, [note.x, note.y, onSelectNote])

  const color = CATEGORY_COLORS[note.category]
  const catLabel = categoryLabel(note.category, t)

  return (
    <li className="runtimeListItem" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
      {/* Цветовой индикатор категории */}
      <span
        title={catLabel}
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
          cursor: 'pointer'
        }}
        onClick={handleSelect}
      />

      {/* Текст заметки (inline-редактирование) */}
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={handleSelect}>
        {editing ? (
          <input
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              fontSize: 12,
              background: 'var(--bg-elevated, var(--color-background-soft))',
              color: 'var(--text-primary, var(--ev-c-text-1))',
              border: '1px solid var(--ev-c-accent)',
              borderRadius: 3,
              padding: '2px 4px',
              outline: 'none'
            }}
          />
        ) : (
          <span
            onClick={(e) => {
              e.stopPropagation()
              startEdit()
            }}
            style={{
              fontSize: 12,
              color: 'var(--ev-c-text-1)',
              wordBreak: 'break-word'
            }}
          >
            {note.text || t('editor.emptyNoteText', 'Empty note')}
          </span>
        )}
      </div>

      {/* Бейдж категории */}
      <span
        style={{
          fontSize: 10,
          padding: '1px 5px',
          borderRadius: 3,
          background: color,
          color: '#111',
          fontWeight: 600,
          flexShrink: 0,
          opacity: 0.85
        }}
      >
        {catLabel}
      </span>

      {/* Позиция */}
      <span
        onClick={handleSelect}
        style={{
          fontSize: 10,
          color: 'var(--ev-c-text-2)',
          opacity: 0.7,
          flexShrink: 0,
          cursor: 'pointer',
          fontFamily: 'monospace'
        }}
        title={t('editor.goToPosition', 'Go to position')}
      >
        {Math.round(note.x)}, {Math.round(note.y)}
      </span>

      {/* Pin toggle */}
      <button
        type="button"
        onClick={handleTogglePin}
        title={note.pinned ? t('editor.unpinNote', 'Unpin') : t('editor.pinNote', 'Pin')}
        style={{
          background: 'transparent',
          border: 'none',
          color: note.pinned ? 'var(--ev-c-accent)' : 'var(--ev-c-text-2)',
          fontSize: 13,
          cursor: 'pointer',
          padding: '0 2px',
          lineHeight: 1,
          flexShrink: 0
        }}
      >
        {note.pinned ? '\uD83D\uDCCC' : '\uD83D\uDCCD'}
      </button>

      {/* Удалить */}
      <button
        type="button"
        onClick={handleDelete}
        title={t('editor.deleteNote', 'Delete note')}
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
        \u00D7
      </button>
    </li>
  )
})

export const NotesPanel = React.memo(function NotesPanel({
  notes,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onSelectNote,
  t
}: NotesPanelProps) {
  const [filter, setFilter] = useState<RuntimeNote['category'] | null>(null)

  const filteredNotes = useMemo(() => {
    if (!filter) return notes
    return notes.filter((n) => n.category === filter)
  }, [notes, filter])

  const handleAdd = useCallback(() => {
    onAddNote({ text: t('editor.newNoteText', 'New note'), category: 'todo' })
  }, [onAddNote, t])

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
          style={{
            background: 'transparent',
            border: '1px solid var(--ev-c-gray-3)',
            color: 'var(--ev-c-text-1)',
            borderRadius: 4,
            width: 22,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: 0
          }}
        >
          +
        </button>
      </div>

      {/* Фильтр по категориям */}
      <div style={{ display: 'flex', gap: 4, padding: '4px 4px 0', flexWrap: 'wrap' }}>
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
      {filteredNotes.length === 0 ? (
        <div className="runtimeHint" style={{ padding: '8px 4px' }}>
          {t('editor.noNotesYet', 'No notes yet. Click + to add.')}
        </div>
      ) : (
        <ul
          className="runtimeList"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0 0', margin: 0, listStyle: 'none' }}
        >
          {filteredNotes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              onUpdateNote={onUpdateNote}
              onDeleteNote={onDeleteNote}
              onSelectNote={onSelectNote}
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
      style={{
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 3,
        border: `1px solid ${active ? color : 'transparent'}`,
        background: active ? `${color}22` : 'transparent',
        color: active ? 'var(--ev-c-text-1)' : 'var(--ev-c-text-2)',
        cursor: 'pointer',
        lineHeight: 1.3
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
