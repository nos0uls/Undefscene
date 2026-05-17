import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useReactFlow, useStore, useStoreApi } from '@xyflow/react'
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
const SNAP_OFFSET_X = 115
const SNAP_OFFSET_Y = -10

export type CanvasNotesOverlayProps = {
  notes: RuntimeNote[]
  onUpdateNote: (id: string, patch: Partial<Omit<RuntimeNote, 'id'>>) => void
  onFocusNode?: (nodeId: string) => void
}

type CanvasNoteStickerProps = {
  note: RuntimeNote
  onUpdateNote: CanvasNotesOverlayProps['onUpdateNote']
  onFocusNode?: CanvasNotesOverlayProps['onFocusNode']
  registerSticker: (id: string, el: HTMLDivElement | null) => void
}

const ALL_CATEGORIES: RuntimeNote['category'][] = ['acting', 'camera', 'sound', 'todo', 'warning']

const CanvasNoteSticker = React.memo(function CanvasNoteSticker({
  note,
  onUpdateNote,
  onFocusNode,
  registerSticker
}: CanvasNoteStickerProps) {
  const nodes = useStore((s) => s.nodes)
  const { screenToFlowPosition, getNodes } = useReactFlow()
  const containerRef = useRef<HTMLDivElement>(null)

  const [dragging, setDragging] = useState(false)
  // Ref для throttling обновлений позиции через requestAnimationFrame
  const rafRef = useRef<number | null>(null)
  const pendingPositionRef = useRef<{ x: number; y: number } | null>(null)
  const [hovered, setHovered] = useState(false)
  const [pinnedOpen, setPinnedOpen] = useState(false)
  const [snapTargetId, setSnapTargetId] = useState<string | null>(null)
  const snapTargetRef = useRef<string | null>(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  // Ref для актуальных render координат, чтобы handleMouseDown не пересоздавался
  const renderPosRef = useRef({ x: 0, y: 0 })

  // Compute render position (snapped to node or free)
  const node = note.nodeId ? nodes.find((n) => n.id === note.nodeId) : undefined
  const renderX = node ? node.position.x + SNAP_OFFSET_X : note.x
  const renderY = node ? node.position.y + SNAP_OFFSET_Y : note.y

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    registerSticker(note.id, el)
    return () => registerSticker(note.id, null)
  }, [note.id, registerSticker])

  // Обновляем ref при изменении render координат
  useEffect(() => {
    renderPosRef.current = { x: renderX, y: renderY }
  }, [renderX, renderY])

  const open = hovered || pinnedOpen
  const Icon = CATEGORY_ICON[note.category] ?? Drama

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (e.button !== 0) return
      setDragging(true)
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const { x: currentRenderX, y: currentRenderY } = renderPosRef.current
      // If snapped, detach on drag start so we can move freely.
      if (note.nodeId) {
        onUpdateNote(note.id, { nodeId: undefined, x: currentRenderX, y: currentRenderY })
      }
      dragOffset.current = { x: flowPos.x - currentRenderX, y: flowPos.y - currentRenderY }
    },
    [note.nodeId, note.id, onUpdateNote, screenToFlowPosition]
  )

  useEffect(() => {
    // Cleanup RAF when dragging stops or component unmounts
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [dragging])

  useEffect(() => {
    if (!dragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const newX = flowPos.x - dragOffset.current.x
      const newY = flowPos.y - dragOffset.current.y

      // Throttle обновление позиции через requestAnimationFrame
      pendingPositionRef.current = { x: newX, y: newY }
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          if (pendingPositionRef.current) {
            onUpdateNote(note.id, pendingPositionRef.current)
            pendingPositionRef.current = null
          }
          rafRef.current = null
        })
      }

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
      snapTargetRef.current = found
    }

    const handleMouseUp = () => {
      setDragging(false)
      // Cancel pending RAF if exists
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
        // Apply final position immediately
        if (pendingPositionRef.current) {
          onUpdateNote(note.id, pendingPositionRef.current)
          pendingPositionRef.current = null
        }
      }

      const currentSnapTargetId = snapTargetRef.current
      if (currentSnapTargetId) {
        const targetNode = getNodes().find((n) => n.id === currentSnapTargetId)
        if (targetNode) {
          onUpdateNote(note.id, {
            nodeId: currentSnapTargetId,
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
      // Cleanup RAF on unmount
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [dragging, note.id, onUpdateNote, screenToFlowPosition, getNodes])

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

  // Cleanup RAF on component unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

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

  const handleCloseTooltip = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setPinnedOpen(false)
      setHovered(false)
    },
    []
  )

  const handleCategoryChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      e.stopPropagation()
      onUpdateNote(note.id, { category: e.target.value as RuntimeNote['category'] })
    },
    [note.id, onUpdateNote]
  )

  const handleMouseEnter = useCallback(() => setHovered(true), [])
  const handleMouseLeave = useCallback(() => setHovered(false), [])

  const glowColor = snapTargetId ? CATEGORY_BORDER[note.category] : 'transparent'

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: STICKER_SIZE,
        height: STICKER_SIZE,
        zIndex: 50,
        pointerEvents: 'auto',
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        willChange: 'transform',
        transformOrigin: '0 0'
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
            <select
              value={note.category}
              onChange={handleCategoryChange}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                fontWeight: 700,
                fontSize: 10,
                textTransform: 'uppercase',
                color: CATEGORY_BORDER[note.category],
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                outline: 'none',
                appearance: 'none',
                WebkitAppearance: 'none',
                maxWidth: 80
              }}
            >
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <button
              onClick={handleCloseTooltip}
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
              title="Close"
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
  onFocusNode
}: CanvasNotesOverlayProps): React.JSX.Element {
  const storeApi = useStoreApi()
  const stickerRefs = useRef(new Map<string, HTMLDivElement>())
  const notesRef = useRef(notes)
  notesRef.current = notes

  const registerSticker = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) stickerRefs.current.set(id, el)
    else stickerRefs.current.delete(id)
  }, [])

  // Единая функция обновления позиций через transform (не вызывает layout).
  const updatePositions = useCallback(() => {
    const state = storeApi.getState()
    const [x, y, zoom] = state.transform
    const map = stickerRefs.current
    for (const note of notesRef.current) {
      const el = map.get(note.id)
      if (!el) continue
      const node = note.nodeId
        ? state.nodes.find((n) => n.id === note.nodeId)
        : undefined
      const renderX = node ? node.position.x + SNAP_OFFSET_X : note.x
      const renderY = node ? node.position.y + SNAP_OFFSET_Y : note.y
      const screenX = renderX * zoom + x
      const screenY = renderY * zoom + y
      if (zoom < 0.15) {
        el.style.display = 'none'
      } else {
        el.style.display = ''
        el.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) scale(${zoom})`
      }
    }
  }, [storeApi])

  // Обновляем позиции сразу после рендера (mount, drag заметки, snap и т.д.)
  useLayoutEffect(() => {
    updatePositions()
  }, [notes, updatePositions])

  // Подписываемся на zustand store для pan/zoom — обновляем через transform,
  // чтобы не конфликтовать с React-рендером left/top.
  useEffect(() => {
    const unsub = storeApi.subscribe(updatePositions)
    return unsub
  }, [storeApi, updatePositions])

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
          onUpdateNote={onUpdateNote}
          onFocusNode={onFocusNode}
          registerSticker={registerSticker}
        />
      ))}
    </div>
  )
})
