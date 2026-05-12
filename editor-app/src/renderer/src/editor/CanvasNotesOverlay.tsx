import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import type { RuntimeNote } from './runtimeTypes'

const CATEGORY_BG: Record<RuntimeNote['category'], string> = {
  acting: 'hsl(200, 90%, 88%)',
  camera: 'hsl(280, 90%, 88%)',
  sound: 'hsl(150, 90%, 88%)',
  todo: 'hsl(50, 100%, 82%)',
  warning: 'hsl(0, 100%, 88%)'
}

const CATEGORY_BORDER: Record<RuntimeNote['category'], string> = {
  acting: 'hsl(200, 70%, 55%)',
  camera: 'hsl(280, 70%, 55%)',
  sound: 'hsl(150, 70%, 55%)',
  todo: 'hsl(45, 90%, 50%)',
  warning: 'hsl(0, 80%, 55%)'
}

export type CanvasNotesOverlayProps = {
  notes: RuntimeNote[]
  onUpdateNote: (id: string, patch: Partial<Omit<RuntimeNote, 'id'>>) => void
  onDeleteNote: (id: string) => void
  onFocusNode?: (nodeId: string) => void
}

function flowToScreen(
  flowX: number,
  flowY: number,
  viewport: { x: number; y: number; zoom: number }
): { x: number; y: number } {
  return {
    x: (flowX - viewport.x) * viewport.zoom,
    y: (flowY - viewport.y) * viewport.zoom
  }
}

const CanvasNoteSticker = React.memo(function CanvasNoteSticker({
  note,
  viewport,
  onUpdateNote,
  onDeleteNote,
  onFocusNode
}: {
  note: RuntimeNote
  viewport: { x: number; y: number; zoom: number }
  onUpdateNote: CanvasNotesOverlayProps['onUpdateNote']
  onDeleteNote: CanvasNotesOverlayProps['onDeleteNote']
  onFocusNode?: CanvasNotesOverlayProps['onFocusNode']
}) {
  const pos = flowToScreen(note.x, note.y, viewport)
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const { screenToFlowPosition } = useReactFlow()

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (e.button !== 0) return
      setDragging(true)
      dragOffset.current = { x: e.clientX, y: e.clientY }
    },
    []
  )

  useEffect(() => {
    if (!dragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      onUpdateNote(note.id, { x: flowPos.x, y: flowPos.y })
    }

    const handleMouseUp = () => {
      setDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, note.id, onUpdateNote, screenToFlowPosition])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (note.nodeId && onFocusNode) {
        onFocusNode(note.nodeId)
      }
    },
    [note.nodeId, onFocusNode]
  )

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDeleteNote(note.id)
    },
    [note.id, onDeleteNote]
  )

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: 140,
        minHeight: 48,
        padding: '6px 8px',
        borderRadius: 4,
        background: CATEGORY_BG[note.category],
        border: `2px solid ${CATEGORY_BORDER[note.category]}`,
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        fontSize: 11,
        lineHeight: 1.3,
        color: '#1a1a1a',
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        zIndex: 50,
        pointerEvents: 'auto',
        wordBreak: 'break-word',
        opacity: dragging ? 0.85 : 1
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span
          style={{
            fontSize: 9,
            textTransform: 'uppercase',
            fontWeight: 700,
            color: CATEGORY_BORDER[note.category],
            letterSpacing: 0.5
          }}
        >
          {note.category}
        </span>
        <button
          onClick={handleDelete}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            margin: 0,
            fontSize: 10,
            cursor: 'pointer',
            color: '#666',
            lineHeight: 1
          }}
          title="Delete note"
        >
          ×
        </button>
      </div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{note.text || 'New note'}</div>
      {note.nodeId && (
        <div
          style={{
            marginTop: 3,
            fontSize: 9,
            color: '#4a6fcb',
            fontFamily: 'monospace'
          }}
        >
          @{note.nodeId.slice(0, 12)}
        </div>
      )}
    </div>
  )
})

export const CanvasNotesOverlay = React.memo(function CanvasNotesOverlay({
  notes,
  onUpdateNote,
  onDeleteNote,
  onFocusNode
}: CanvasNotesOverlayProps): React.JSX.Element {
  const viewport = useStore((s) => ({ x: s.transform[0], y: s.transform[1], zoom: s.transform[2] }))

  if (!notes || notes.length === 0) return <></>

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 50,
        overflow: 'hidden'
      }}
    >
      {notes.map((note) => (
        <CanvasNoteSticker
          key={note.id}
          note={note}
          viewport={viewport}
          onUpdateNote={onUpdateNote}
          onDeleteNote={onDeleteNote}
          onFocusNode={onFocusNode}
        />
      ))}
    </div>
  )
})
