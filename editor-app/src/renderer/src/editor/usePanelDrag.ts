/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useCallback, useEffect } from 'react'
import type React from 'react'

import type { LayoutState, Size, Vec2 } from './layoutTypes'
import { useDockingContext } from './DockingContext'
import { useDockDropPreview } from './useDockDropPreview'
import {
  getFloatingPositionAtPoint,
  getHoverSlotAtPoint,
  getInsertIndexForSlot,
  removeFromAllSlots,
  insertIntoSlot,
  enforceSlotCapacity
} from './dockingUtils'

export type UsePanelDragParams = {
  showDockDropPreview: boolean
}

export type UsePanelDragResult = {
  startPanelDrag: (panelId: string) => (event: React.PointerEvent<HTMLElement>) => void
}

export function usePanelDrag(params: UsePanelDragParams): UsePanelDragResult {
  const { showDockDropPreview } = params
  const ctx = useDockingContext()
  const { updateDragPreviewDOM, scheduleDragPreview } = useDockDropPreview({ showDockDropPreview })

  const startPanelDrag = useCallback(
    (panelId: string) => (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return

      const currentPanel = ctx.layoutRef.current.panels[panelId]
      if (!currentPanel || currentPanel.mode === 'hidden') return

      event.preventDefault()
      event.stopPropagation()

      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // setPointerCapture can fail in some browser contexts
      }

      const panelEl = (event.currentTarget as HTMLElement).closest(
        '.dockPanel'
      ) as HTMLElement | null
      const panelRect = panelEl?.getBoundingClientRect() ?? null

      const grabOffset: Vec2 = panelRect
        ? { x: event.clientX - panelRect.left, y: event.clientY - panelRect.top }
        : { x: 12, y: 12 }

      const size: Size = panelRect
        ? {
            width: Math.max(120, Math.round(panelRect.width)),
            height: Math.max(80, Math.round(panelRect.height))
          }
        : { width: 320, height: 220 }

      const ghostPosition = getFloatingPositionAtPoint(
        ctx,
        event.clientX,
        event.clientY,
        grabOffset
      )
      const hoverSlot = getHoverSlotAtPoint(ctx, event.clientX, event.clientY)
      const hoverInsertIndex = hoverSlot
        ? getInsertIndexForSlot(ctx, hoverSlot, event.clientY)
        : null

      if (currentPanel.mode === 'floating') {
        const panelValues = Object.values(ctx.layoutRef.current.panels) as Array<
          LayoutState['panels'][string]
        >
        const maxZ = Math.max(1, ...panelValues.map((p) => p.zIndex ?? 1))
        if (currentPanel.zIndex < maxZ) {
          ctx.setLayout({
            ...ctx.layoutRef.current,
            panels: {
              ...ctx.layoutRef.current.panels,
              [panelId]: {
                ...currentPanel,
                zIndex: maxZ + 1
              }
            }
          })
        }
      }

      ctx.setDrag({
        panelId,
        pointerId: event.pointerId,
        grabOffset,
        size
      })

      scheduleDragPreview(ghostPosition, hoverSlot, hoverInsertIndex)
    },
    [ctx, scheduleDragPreview]
  )

  useEffect(() => {
    if (!ctx.drag) return

    const drag = ctx.drag

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return

      const ghostPosition = getFloatingPositionAtPoint(
        ctx,
        event.clientX,
        event.clientY,
        drag.grabOffset
      )
      const hoverSlot = getHoverSlotAtPoint(ctx, event.clientX, event.clientY)
      const hoverInsertIndex = hoverSlot
        ? getInsertIndexForSlot(ctx, hoverSlot, event.clientY)
        : null

      scheduleDragPreview(ghostPosition, hoverSlot, hoverInsertIndex)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return
      try {
        if (event.target instanceof HTMLElement) {
          event.target.releasePointerCapture(event.pointerId)
        }
      } catch {
        // releasePointerCapture can fail in some browser contexts
      }

      const currentLayout = ctx.layoutRef.current
      const currentPanel = currentLayout.panels[drag.panelId]
      if (!currentPanel) {
        ctx.setDrag(null)
        updateDragPreviewDOM(null, null, null)
        return
      }

      const hoverSlot = getHoverSlotAtPoint(ctx, event.clientX, event.clientY)
      const nextDocked = {
        left: [...currentLayout.docked.left],
        right: [...currentLayout.docked.right],
        bottom: [...currentLayout.docked.bottom]
      }

      const nextPanels = { ...currentLayout.panels }

      removeFromAllSlots(nextDocked, drag.panelId)

      if (hoverSlot) {
        const insertIndex = getInsertIndexForSlot(ctx, hoverSlot, event.clientY)
        insertIntoSlot(nextDocked, hoverSlot, drag.panelId, insertIndex)
        enforceSlotCapacity(nextDocked, nextPanels, hoverSlot, drag.panelId)

        ctx.setLayout({
          ...currentLayout,
          docked: nextDocked,
          panels: {
            ...nextPanels,
            [drag.panelId]: {
              ...currentPanel,
              mode: 'docked',
              slot: hoverSlot,
              position: null,
              size: null,
              lastDockedSlot: hoverSlot,
              lastFloatingPosition:
                currentPanel.position ?? currentPanel.lastFloatingPosition ?? null,
              lastFloatingSize: currentPanel.size ?? currentPanel.lastFloatingSize ?? null
            }
          }
        })

        ctx.setDrag(null)
        updateDragPreviewDOM(null, null, null)
        return
      }

      const floatingPosition = getFloatingPositionAtPoint(
        ctx,
        event.clientX,
        event.clientY,
        drag.grabOffset
      )
      const panelVals = Object.values(currentLayout.panels) as Array<LayoutState['panels'][string]>
      const maxZ = Math.max(1, ...panelVals.map((p) => p.zIndex ?? 1))

      ctx.setLayout({
        ...currentLayout,
        docked: nextDocked,
        panels: {
          ...currentLayout.panels,
          [drag.panelId]: {
            ...currentPanel,
            mode: 'floating',
            slot: null,
            position: floatingPosition,
            size: currentPanel.lastFloatingSize ?? drag.size,
            zIndex: maxZ + 1,
            lastDockedSlot: currentPanel.slot ?? currentPanel.lastDockedSlot ?? null,
            lastFloatingPosition: floatingPosition,
            lastFloatingSize: currentPanel.lastFloatingSize ?? drag.size
          }
        }
      })

      ctx.setDrag(null)
      updateDragPreviewDOM(null, null, null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [ctx.drag, ctx.setLayout])

  return { startPanelDrag }
}
