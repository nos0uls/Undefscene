/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable react-hooks/immutability */
import { useEffect } from 'react'

import type { DockSlotId, Vec2 } from './layoutTypes'
import { useDockingContext } from './DockingContext'
import { getSlotCapacity } from './dockingUtils'

export type UseDockDropPreviewParams = {
  showDockDropPreview: boolean
}

export type UseDockDropPreviewResult = {
  updateDragPreviewDOM: (
    ghostPos: Vec2 | null,
    hoverSlot: DockSlotId | null,
    hoverInsertIndex: number | null
  ) => void
  scheduleDragPreview: (
    ghostPos: Vec2 | null,
    hoverSlot: DockSlotId | null,
    hoverInsertIndex: number | null
  ) => void
}

export function useDockDropPreview(params: UseDockDropPreviewParams): UseDockDropPreviewResult {
  const { showDockDropPreview } = params
  const ctx = useDockingContext()

  const updateDragPreviewDOM = (
    ghostPos: Vec2 | null,
    hoverSlot: DockSlotId | null,
    hoverInsertIndex: number | null
  ) => {
    const ghost = ctx.ghostRef.current
    if (ghost) {
      if (ghostPos) {
        ghost.style.left = `${ghostPos.x}px`
        ghost.style.top = `${ghostPos.y}px`
        ghost.style.display = showDockDropPreview ? 'block' : 'none'
      } else {
        ghost.style.display = 'none'
      }
    }

    if (!showDockDropPreview) {
      for (const slot of ['left', 'right', 'bottom'] as DockSlotId[]) {
        const previewEl = ctx.getDockPreviewElement(slot)
        if (previewEl) previewEl.classList.remove('isVisible')
      }
      ctx.hoverSlotRef.current = hoverSlot
      ctx.hoverInsertIndexRef.current = hoverInsertIndex
      return
    }

    for (const slot of ['left', 'right', 'bottom'] as DockSlotId[]) {
      const previewEl = ctx.getDockPreviewElement(slot)
      if (previewEl) {
        if (slot !== hoverSlot) {
          previewEl.classList.remove('isVisible')
        }
      }
    }

    if (hoverSlot && hoverInsertIndex !== null) {
      const previewEl = ctx.getDockPreviewElement(hoverSlot)
      const capacity = getSlotCapacity(hoverSlot)
      const currentDocked = ctx.layoutRef.current.docked[hoverSlot].filter(
        (id) => ctx.layoutRef.current.panels[id]?.mode === 'docked'
      )

      if (previewEl) {
        previewEl.classList.add('isVisible')
        previewEl.style.left = '4px'
        previewEl.style.right = '4px'

        if (capacity === 1) {
          previewEl.style.top = '4px'
          previewEl.style.height = 'calc(100% - 8px)'
        } else {
          const shouldSplit = currentDocked.length >= 1
          const previewTop = shouldSplit && hoverInsertIndex > 0 ? '50%' : '4px'
          const previewHeight = shouldSplit ? 'calc(50% - 6px)' : 'calc(100% - 8px)'
          previewEl.style.top = previewTop
          previewEl.style.height = previewHeight
        }
      }
    }

    ctx.hoverSlotRef.current = hoverSlot
    ctx.hoverInsertIndexRef.current = hoverInsertIndex
  }

  const scheduleDragPreview = (
    ghostPos: Vec2 | null,
    hoverSlot: DockSlotId | null,
    hoverInsertIndex: number | null
  ) => {
    ctx.pendingGhostPosRef.current = ghostPos
    ctx.pendingHoverSlotRef.current = hoverSlot
    ctx.pendingHoverInsertIndexRef.current = hoverInsertIndex
    if (ctx.dragRafRef.current !== null) return
    ctx.dragRafRef.current = window.requestAnimationFrame(() => {
      ctx.dragRafRef.current = null
      updateDragPreviewDOM(
        ctx.pendingGhostPosRef.current,
        ctx.pendingHoverSlotRef.current,
        ctx.pendingHoverInsertIndexRef.current
      )
    })
  }

  // Очистка RAF при размонтировании компонента
  useEffect(() => {
    return () => {
      if (ctx.dragRafRef.current !== null) {
        window.cancelAnimationFrame(ctx.dragRafRef.current)
        ctx.dragRafRef.current = null
      }
    }
  }, [ctx])

  return { updateDragPreviewDOM, scheduleDragPreview }
}
