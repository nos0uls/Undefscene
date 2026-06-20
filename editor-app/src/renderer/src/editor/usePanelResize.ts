/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useEffect } from 'react'
import type React from 'react'

import type { ResizeKind } from './dockingConstants'
import {
  MIN_LEFT_WIDTH,
  MIN_RIGHT_WIDTH,
  MIN_BOTTOM_HEIGHT,
  MIN_CENTER_WIDTH,
  MIN_CENTER_HEIGHT,
  MIN_FLOAT_WIDTH,
  MIN_FLOAT_HEIGHT
} from './dockingConstants'
import { useDockingContext } from './DockingContext'
import { clamp } from './dockingUtils'

export type UsePanelResizeResult = {
  startResizeDrag: (
    kind: ResizeKind,
    panelId?: string
  ) => (event: React.PointerEvent<HTMLElement>) => void
}

export function usePanelResize(): UsePanelResizeResult {
  const ctx = useDockingContext()

  const startResizeDrag =
    (kind: ResizeKind, panelId?: string) => (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return

      event.preventDefault()
      event.stopPropagation()

      const currentLayout = ctx.layoutRef.current
      const panel = panelId ? currentLayout.panels[panelId] : null

      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // pointer capture may not be available
      }

      ctx.setResizeDrag({
        kind,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startDockSizes: { ...currentLayout.dockSizes },
        panelId,
        startPanelPosition: panel?.position ?? null,
        startPanelSize: panel?.size ?? null
      })
    }

  useEffect(() => {
    let frameId: number | null = null

    if (!ctx.resizeDrag) return

    const resizeDrag = ctx.resizeDrag

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== resizeDrag.pointerId) return

      if (frameId !== null) return
      frameId = requestAnimationFrame(() => {
        frameId = null
        const currentLayout = ctx.layoutRef.current
        const rootRect = ctx.rootRef.current?.getBoundingClientRect()
        if (!rootRect) return

        const dx = event.clientX - resizeDrag.startX
        const dy = event.clientY - resizeDrag.startY

        // Для dock-ресайза обновляем CSS-переменные напрямую (DOM-first),
        // чтобы избежать React ре-рендеров на каждый кадр.
        // setLayout вызываем один раз на pointerup.
        if (resizeDrag.kind === 'dock-left') {
          const maxLeft = Math.min(
            Math.max(
              MIN_LEFT_WIDTH,
              rootRect.width - currentLayout.dockSizes.rightWidth - MIN_CENTER_WIDTH
            ),
            rootRect.width * 0.8
          )
          const nextLeftWidth = clamp(
            resizeDrag.startDockSizes.leftWidth + dx,
            MIN_LEFT_WIDTH,
            maxLeft
          )

          ctx.rootRef.current?.style.setProperty('--leftDockWidth', `${nextLeftWidth}px`)
          ctx.layoutRef.current.dockSizes = {
            ...ctx.layoutRef.current.dockSizes,
            leftWidth: nextLeftWidth
          }
          return
        }

        if (resizeDrag.kind === 'dock-right') {
          const maxRight = Math.min(
            Math.max(
              MIN_RIGHT_WIDTH,
              rootRect.width - currentLayout.dockSizes.leftWidth - MIN_CENTER_WIDTH
            ),
            rootRect.width * 0.8
          )
          const nextRightWidth = clamp(
            resizeDrag.startDockSizes.rightWidth - dx,
            MIN_RIGHT_WIDTH,
            maxRight
          )

          ctx.rootRef.current?.style.setProperty('--rightDockWidth', `${nextRightWidth}px`)
          ctx.layoutRef.current.dockSizes = {
            ...ctx.layoutRef.current.dockSizes,
            rightWidth: nextRightWidth
          }
          return
        }

        if (resizeDrag.kind === 'dock-bottom') {
          const topBarHeight = 30
          const maxBottom = Math.min(
            Math.max(MIN_BOTTOM_HEIGHT, rootRect.height - topBarHeight - MIN_CENTER_HEIGHT),
            rootRect.height * 0.8
          )
          const nextBottomHeight = clamp(
            resizeDrag.startDockSizes.bottomHeight - dy,
            MIN_BOTTOM_HEIGHT,
            maxBottom
          )

          ctx.rootRef.current?.style.setProperty('--bottomDockHeight', `${nextBottomHeight}px`)
          ctx.layoutRef.current.dockSizes = {
            ...ctx.layoutRef.current.dockSizes,
            bottomHeight: nextBottomHeight
          }
          return
        }

        if (resizeDrag.kind === 'split-left') {
          const leftRect = ctx.leftDockRef.current?.getBoundingClientRect()
          if (!leftRect) return
          const ratio = clamp((event.clientY - leftRect.top) / leftRect.height, 0.15, 0.85)

          ctx.setLayout({
            ...currentLayout,
            dockSizes: {
              ...currentLayout.dockSizes,
              leftSplit: ratio
            }
          })
          return
        }

        if (resizeDrag.kind === 'split-right') {
          const rightRect = ctx.rightDockRef.current?.getBoundingClientRect()
          if (!rightRect) return
          const ratio = clamp((event.clientY - rightRect.top) / rightRect.height, 0.15, 0.85)

          ctx.setLayout({
            ...currentLayout,
            dockSizes: {
              ...currentLayout.dockSizes,
              rightSplit: ratio
            }
          })
          return
        }

        if (resizeDrag.kind.startsWith('float-') && resizeDrag.panelId) {
          const panel = currentLayout.panels[resizeDrag.panelId]
          if (!panel || !resizeDrag.startPanelSize || !resizeDrag.startPanelPosition) return

          const maxWidth = Math.max(MIN_FLOAT_WIDTH, rootRect.width - 24)
          const maxHeight = Math.max(MIN_FLOAT_HEIGHT, rootRect.height - 24)

          const affectsTop = resizeDrag.kind.includes('n')
          const affectsBottom = resizeDrag.kind.includes('s')
          const affectsLeft = resizeDrag.kind.includes('w')
          const affectsRight = resizeDrag.kind.includes('e')

          const startPos = resizeDrag.startPanelPosition
          const startSize = resizeDrag.startPanelSize

          let nextWidth = startSize.width
          let nextHeight = startSize.height
          let nextX = startPos.x
          let nextY = startPos.y

          if (affectsRight) {
            nextWidth = startSize.width + dx
          }

          if (affectsBottom) {
            nextHeight = startSize.height + dy
          }

          if (affectsLeft) {
            nextWidth = startSize.width - dx
            nextX = startPos.x + dx
          }

          if (affectsTop) {
            nextHeight = startSize.height - dy
            nextY = startPos.y + dy
          }

          const clampedWidth = clamp(nextWidth, MIN_FLOAT_WIDTH, maxWidth)
          const clampedHeight = clamp(nextHeight, MIN_FLOAT_HEIGHT, maxHeight)

          if (affectsLeft) {
            nextX = startPos.x + (startSize.width - clampedWidth)
          }

          if (affectsTop) {
            nextY = startPos.y + (startSize.height - clampedHeight)
          }

          const maxX = Math.max(0, rootRect.width - clampedWidth)
          const maxY = Math.max(0, rootRect.height - clampedHeight)

          nextX = clamp(nextX, 0, maxX)
          nextY = clamp(nextY, 0, maxY)

          ctx.setLayout({
            ...currentLayout,
            panels: {
              ...currentLayout.panels,
              [resizeDrag.panelId]: {
                ...panel,
                position: { x: nextX, y: nextY },
                size: { width: clampedWidth, height: clampedHeight }
              }
            }
          })
        }
      })
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== resizeDrag.pointerId) return
      try {
        if (event.target instanceof HTMLElement) {
          event.target.releasePointerCapture(event.pointerId)
        }
      } catch {
        // releasePointerCapture can fail in some browser contexts
      }

      if (frameId !== null) cancelAnimationFrame(frameId)

      const currentLayout = ctx.layoutRef.current

      if (resizeDrag.kind.startsWith('float-') && resizeDrag.panelId) {
        const panel = currentLayout.panels[resizeDrag.panelId]
        if (panel?.size && panel.position) {
          ctx.setLayout({
            ...currentLayout,
            panels: {
              ...currentLayout.panels,
              [resizeDrag.panelId]: {
                ...panel,
                lastFloatingSize: panel.size,
                lastFloatingPosition: panel.position
              }
            }
          })
        }
      }

      // Для dock-ресайза: сохраняем финальные размеры из ref в React state.
      // Во время drag мы обновляли CSS-переменные напрямую (минуя React).
      if (
        resizeDrag.kind === 'dock-left' ||
        resizeDrag.kind === 'dock-right' ||
        resizeDrag.kind === 'dock-bottom'
      ) {
        ctx.setLayout({
          ...ctx.layoutRef.current,
          dockSizes: { ...ctx.layoutRef.current.dockSizes }
        })
      }

      ctx.setResizeDrag(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [ctx.resizeDrag, ctx.setLayout])

  return { startResizeDrag }
}
