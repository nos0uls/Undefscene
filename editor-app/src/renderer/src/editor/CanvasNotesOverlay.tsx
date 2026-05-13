import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import type { RuntimeNote } from './runtimeTypes'
import { Drama, Camera, Volume2, ListChecks, AlertTriangle, X } from 'lucide-react'

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

const CATEGORY_ICON: Record<RuntimeNote['category'], React.ElementType> = {
  acting: Drama,
  camera: Camera,
  sound: Volume2,
  todo: ListChecks,
  warning: AlertTriangle
}

const STICKER_SIZE = 28
const SNAP_OFFSET_X = 180
const SNAP_OFFSET_Y = -10

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

export type CanvasNotesOverlayProps = {
  notes: RuntimeNote[]
  onUpdateNote: (id: string, patch: Partial<Omit<RuntimeNote, 'id'>>) => void
  onDeleteNote: (id: string) => void
  onFocusNode?: (nodeId: string) => void
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
  const nodes = useStore((s) => s.nodes)
  const { screenToFlowPosition, getNodes } = useReactFlow()
  const containerRef = useRef<HTMLDivElement>(null)

  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [pinnedOpen, setPinnedOpen] = useState(false)
  const [snapTargetId, setSnapTargetId] = useState<string | null>(null)
  const dragOffset = useRef({ x: 0, y: 0 })

  // Compute render position (snapped to node or free)
  const node = note.nodeId ? nodes.find((n) => n.id === note.nodeId) : undefined
  const renderX = node ? node.position.x + SNAP_OFFSET_X : note.x
  const renderY = node ? node.position.y + SNAP_OFFSET_Y : note.y
  const pos = flowToScreen(renderX, renderY, viewport)

  const open = hovered || pinnedOpen
  const Icon = CATEGORY_ICON[note.category] ?? Drama

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (e.button !== 0) return
      setDragging(true)
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      // If snapped, detach on drag start so we can move freely.
      if (note.nodeId) {
        onUpdateNote(note.id, { nodeId: undefined, x: renderX, y: renderY })
      }
      dragOffset.current = { x: flowPos.x - renderX, y: flowPos.y - renderY }
    },
    [note.nodeId, note.id, onUpdateNote, renderX, renderY, screenToFlowPosition]
  )

  useEffect(() => {
    if (!dragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const newX = flowPos.x - dragOffset.current.x
      const newY = flowPos.y - dragOffset.current.y
      onUpdateNote(note.id, { x: newX, y: newY })

      // Check if hovering over a node for snap preview
      const allNodes = getNodes()
      let found: string | null = null
      for (const n of allNodes) {
        const nx = n.position.x
        const ny = n.position.y
        const nw = n.width ?? 200
        const nh = n.height ?? 80
        if (
          flowPos.x >= nx &&
          flowPos.x <= nx + nw &&
          flowPos.y >= ny &&
          flowPos.y <= ny + nh
        ) {
          found = n.id
          break
        }
      }
      setSnapTargetId(found)
    }

    const handleMouseUp = () => {
      setDragging(false)
      if (snapTargetId) {
        const targetNode = getNodes().find((n) => n.id === snapTargetId)
        if (targetNode) {
          onUpdateNote(note.id, {
            nodeId: snapTargetId,
            x: targetNode.position.x + SNAP_OFFSET_X,
            y: targetNode.position.y + SNAP_OFFSET_Y
          })
        }
      }
      setSnapTargetId(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, note.id, onUpdateNote, screenToFlowPosition, getNodes, snapTargetId])

  // Close pinned tooltip when clicking outside
  useEffect(() => {
    if (!pinnedOpen) return
    const handleDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPinnedOpen(false)
      }
    }
    window.addEventListener('click', handleDocClick)
    return () => window.removeEventListener('click', handleDocClick)
  }, [pinnedOpen])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setPinnedOpen((prev) => !prev)
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

  const glowColor = snapTargetId ? CATEGORY_BORDER[note.category] : 'transparent'

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: STICKER_SIZE,
        height: STICKER_SIZE,
        zIndex: 50,
        pointerEvents: 'auto',
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none'
      }}
    >
      {/* Sticker square */}
      <div
        style={{
          width: STICKER_SIZE,
          height: STICKER_SIZE,
          borderRadius: 4,
          background: CATEGORY_BG[note.category],
          border: `2px solid ${dragging && snapTargetId ? glowColor : CATEGORY_BORDER[note.category]}`,
          boxShadow:
            dragging && snapTargetId
              ? `0 0 10px ${glowColor}`
              : '0 2px 6px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: dragging ? 0.85 : 1
        }}
      >
        <Icon size={14} color={CATEGORY_BORDER[note.category]} strokeWidth={2.5} />
      </div>

      {/* Tooltip / expanded text */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: STICKER_SIZE + 4,
            left: 0,
            width: 180,
            padding: '8px 10px',
            borderRadius: 6,
            background: CATEGORY_BG[note.category],
            border: `2px solid ${CATEGORY_BORDER[note.category]}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            fontSize: 12,
            lineHeight: 1.4,
            color: '#1a1a1a',
            wordBreak: 'break-word',
            zIndex: 60
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 6
            }}
          >
            <span
              style={{
                fontWeight: 700,
                fontSize: 10,
                textTransform: 'uppercase',
                color: CATEGORY_BORDER[note.category]
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
                cursor: 'pointer',
                color: '#666',
                fontSize: 14,
                lineHeight: 1,
                display: 'flex'
              }}
              title="Delete"
            >
              <X size={12} />
            </button>
          </div>
          <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>
            {note.text || 'New note'}
          </div>
          {note.nodeId && (
            <div
              style={{
                marginTop: 4,
                fontSize: 9,
                color: '#4a6fcb',
                fontFamily: 'monospace'
              }}
            >
              @{note.nodeId.slice(0, 12)}
            </div>
          )}
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
