/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useCallback, useEffect } from 'react'
import type { CSSProperties } from 'react'

import type { LayoutState } from './layoutTypes'
import {
  COLLAPSED_HEADER_HEIGHT,
  COLLAPSED_DOCK_SIZE,
  MIN_LEFT_WIDTH,
  MIN_RIGHT_WIDTH,
  MIN_BOTTOM_HEIGHT,
  MIN_CENTER_WIDTH,
  MIN_CENTER_HEIGHT,
  MIN_FLOAT_WIDTH,
  MIN_FLOAT_HEIGHT
} from './dockingConstants'
import { useDockingContext } from './DockingContext'
import {
  clamp,
  getDockedPanelStyle as getDockedPanelStyleImpl,
  getVerticalDockRenderState as getVerticalDockRenderStateImpl,
  removeFromAllSlots,
  insertIntoSlot,
  enforceSlotCapacity
} from './dockingUtils'
import type { DockedPanelRenderEntry } from './dockingUtils'

export type UseDockLayoutResult = {
  togglePanel: (panelId: string) => void
  togglePanelCollapse: (panelId: string) => void
  isPanelVisible: (panelId: string) => boolean
  getVerticalDockRenderState: (entries: Array<DockedPanelRenderEntry | null>) => {
    orderedEntries: DockedPanelRenderEntry[]
    fillRemainingPanelId: string | null
    showSplitter: boolean
  }
  getDockedPanelStyle: (
    panelId: string,
    baseStyle?: CSSProperties,
    options?: { fillRemainingSpace?: boolean }
  ) => CSSProperties | undefined
  clamp: (value: number, min: number, max: number) => number
}

export function useDockLayout(): UseDockLayoutResult {
  const ctx = useDockingContext()

  const togglePanelCollapse = (panelId: string) => {
    const panel = ctx.layoutRef.current.panels[panelId]
    if (!panel) return

    const nextCollapsed = !panel.collapsed
    const currentSize = panel.size ?? panel.lastFloatingSize ?? { width: 360, height: 240 }

    const nextPanelState =
      panel.mode === 'floating'
        ? {
            ...panel,
            collapsed: nextCollapsed,
            size: nextCollapsed
              ? { width: currentSize.width, height: COLLAPSED_HEADER_HEIGHT }
              : (panel.lastFloatingSize ?? currentSize),
            lastFloatingSize: nextCollapsed ? currentSize : panel.lastFloatingSize
          }
        : {
            ...panel,
            collapsed: nextCollapsed
          }

    ctx.setLayout({
      ...ctx.layout,
      panels: {
        ...ctx.layout.panels,
        [panelId]: nextPanelState
      }
    })
  }

  const togglePanel = useCallback((panelId: string) => {
    const layout = ctx.layoutRef.current
    const current = layout.panels[panelId]
    if (!current) return

    if (current.mode !== 'hidden') {
      const nextDocked = {
        left: [...layout.docked.left],
        right: [...layout.docked.right],
        bottom: [...layout.docked.bottom]
      }
      removeFromAllSlots(nextDocked, panelId)

      const lastFloatingPosition = current.position ?? current.lastFloatingPosition ?? null
      const lastFloatingSize = current.size ?? current.lastFloatingSize ?? null

      ctx.setLayout({
        ...layout,
        docked: nextDocked,
        panels: {
          ...layout.panels,
          [panelId]: {
            ...current,
            mode: 'hidden',
            lastDockedSlot: current.slot ?? current.lastDockedSlot ?? null,
            slot: null,
            position: null,
            size: null,
            lastFloatingPosition,
            lastFloatingSize
          }
        }
      })
      return
    }

    const preferredDockSlot = current.lastDockedSlot
    if (preferredDockSlot) {
      const nextDocked = {
        left: [...layout.docked.left],
        right: [...layout.docked.right],
        bottom: [...layout.docked.bottom]
      }
      const nextPanels = { ...layout.panels }

      removeFromAllSlots(nextDocked, panelId)
      insertIntoSlot(nextDocked, preferredDockSlot, panelId, nextDocked[preferredDockSlot].length)
      enforceSlotCapacity(nextDocked, nextPanels, preferredDockSlot, panelId)

      if (nextPanels[panelId]?.mode !== 'hidden') {
        ctx.setLayout({
          ...layout,
          docked: nextDocked,
          panels: {
            ...nextPanels,
            [panelId]: {
              ...current,
              mode: 'docked',
              slot: preferredDockSlot,
              position: null,
              size: null,
              lastDockedSlot: preferredDockSlot
            }
          }
        })
        return
      }
    }

    const rootRect = ctx.rootRef.current?.getBoundingClientRect()
    const fallbackSize = current.lastFloatingSize ?? { width: 360, height: 240 }

    const clampedWidth = clamp(
      fallbackSize.width,
      MIN_FLOAT_WIDTH,
      rootRect?.width ?? fallbackSize.width
    )
    const clampedHeight = clamp(
      fallbackSize.height,
      MIN_FLOAT_HEIGHT,
      rootRect?.height ?? fallbackSize.height
    )

    const defaultPosition: LayoutState['panels'][string]['position'] =
      current.lastFloatingPosition ?? {
        x: rootRect ? Math.max(12, (rootRect.width - clampedWidth) / 2) : 120,
        y: rootRect ? Math.max(60, (rootRect.height - clampedHeight) / 2) : 80
      }

    const maxZ = Math.max(1, ...Object.values(layout.panels).map((p) => p.zIndex ?? 1))

    ctx.setLayout({
      ...layout,
      panels: {
        ...layout.panels,
        [panelId]: {
          ...current,
          mode: 'floating',
          slot: null,
          position: defaultPosition,
          size: { width: clampedWidth, height: clampedHeight },
          zIndex: maxZ + 1
        }
      }
    })
  }, [])

  const isPanelVisible = useCallback((panelId: string): boolean => {
    const p = ctx.layoutRef.current.panels[panelId]
    if (!p) return false
    return p.mode !== 'hidden'
  }, [])

  const getVerticalDockRenderState = useCallback(
    (entries: Array<DockedPanelRenderEntry | null>) => {
      return getVerticalDockRenderStateImpl(ctx, entries)
    },
    [ctx.layout.panels]
  )

  const getDockedPanelStyle = (
    panelId: string,
    baseStyle?: CSSProperties,
    options?: { fillRemainingSpace?: boolean }
  ): CSSProperties | undefined => {
    return getDockedPanelStyleImpl(ctx, panelId, baseStyle, options)
  }

  // Window resize effect
  useEffect(() => {
    let resizeFrameId: number | null = null

    const handleResize = () => {
      if (resizeFrameId !== null) return
      resizeFrameId = requestAnimationFrame(() => {
        resizeFrameId = null
        const prevWidth = ctx.prevWindowSizeRef.current.width
        const prevHeight = ctx.prevWindowSizeRef.current.height
        const rootRect = ctx.rootRef.current?.getBoundingClientRect()
        const newWidth = rootRect?.width ?? window.innerWidth
        const newHeight = rootRect?.height ?? window.innerHeight

        const currentLayout = ctx.layoutRef.current
        const currentCollapsedDocks = ctx.collapsedDocksRef.current
        const topBarHeight = 30
        const isGrowingHorizontally = newWidth > prevWidth
        const isGrowingVertically = newHeight > prevHeight

        const leftDockCount = currentLayout.docked.left.filter(
          (id) => currentLayout.panels[id]?.mode === 'docked'
        ).length
        const rightDockCount = currentLayout.docked.right.filter(
          (id) => currentLayout.panels[id]?.mode === 'docked'
        ).length
        const bottomDockCount = currentLayout.docked.bottom.filter(
          (id) => currentLayout.panels[id]?.mode === 'docked'
        ).length

        const prevHorizontalSpace = Math.max(
          MIN_LEFT_WIDTH + MIN_RIGHT_WIDTH,
          prevWidth - MIN_CENTER_WIDTH
        )
        const nextHorizontalSpace = Math.max(
          MIN_LEFT_WIDTH + MIN_RIGHT_WIDTH,
          newWidth - MIN_CENTER_WIDTH
        )
        const prevVerticalSpace = Math.max(
          MIN_BOTTOM_HEIGHT,
          prevHeight - topBarHeight - MIN_CENTER_HEIGHT
        )
        const nextVerticalSpace = Math.max(
          MIN_BOTTOM_HEIGHT,
          newHeight - topBarHeight - MIN_CENTER_HEIGHT
        )

        const leftRatio = currentLayout.dockSizes.leftWidth / prevHorizontalSpace
        const rightRatio = currentLayout.dockSizes.rightWidth / prevHorizontalSpace
        const bottomRatio = currentLayout.dockSizes.bottomHeight / prevVerticalSpace

        let nextLeftWidth = isGrowingHorizontally
          ? currentLayout.dockSizes.leftWidth
          : clamp(
              Math.round(nextHorizontalSpace * leftRatio),
              MIN_LEFT_WIDTH,
              Math.max(
                MIN_LEFT_WIDTH,
                newWidth - currentLayout.dockSizes.rightWidth - MIN_CENTER_WIDTH
              )
            )
        const nextRightWidth = isGrowingHorizontally
          ? currentLayout.dockSizes.rightWidth
          : clamp(
              Math.round(nextHorizontalSpace * rightRatio),
              MIN_RIGHT_WIDTH,
              Math.max(MIN_RIGHT_WIDTH, newWidth - nextLeftWidth - MIN_CENTER_WIDTH)
            )

        nextLeftWidth = clamp(
          nextLeftWidth,
          MIN_LEFT_WIDTH,
          Math.max(MIN_LEFT_WIDTH, newWidth - nextRightWidth - MIN_CENTER_WIDTH)
        )

        const nextBottomHeight = isGrowingVertically
          ? clamp(
              currentLayout.dockSizes.bottomHeight,
              MIN_BOTTOM_HEIGHT,
              Math.max(MIN_BOTTOM_HEIGHT, newHeight - topBarHeight - MIN_CENTER_HEIGHT)
            )
          : clamp(
              Math.round(nextVerticalSpace * bottomRatio),
              MIN_BOTTOM_HEIGHT,
              Math.max(MIN_BOTTOM_HEIGHT, newHeight - topBarHeight - MIN_CENTER_HEIGHT)
            )

        let nextCollapsedLeft = currentCollapsedDocks.left
        let nextCollapsedRight = currentCollapsedDocks.right
        let nextCollapsedBottom = currentCollapsedDocks.bottom
        let effectiveLeftWidth = nextCollapsedLeft ? COLLAPSED_DOCK_SIZE : nextLeftWidth
        let effectiveRightWidth = nextCollapsedRight ? COLLAPSED_DOCK_SIZE : nextRightWidth
        let effectiveBottomHeight = nextCollapsedBottom ? COLLAPSED_DOCK_SIZE : nextBottomHeight

        let horizontalShortage =
          effectiveLeftWidth + effectiveRightWidth + MIN_CENTER_WIDTH - newWidth
        if (
          horizontalShortage > 0 &&
          leftDockCount > 0 &&
          !nextCollapsedLeft &&
          nextLeftWidth <= MIN_LEFT_WIDTH + 8
        ) {
          nextCollapsedLeft = true
          effectiveLeftWidth = COLLAPSED_DOCK_SIZE
          horizontalShortage =
            effectiveLeftWidth + effectiveRightWidth + MIN_CENTER_WIDTH - newWidth
        }
        if (
          horizontalShortage > 0 &&
          rightDockCount > 0 &&
          !nextCollapsedRight &&
          nextRightWidth <= MIN_RIGHT_WIDTH + 8
        ) {
          nextCollapsedRight = true
          effectiveRightWidth = COLLAPSED_DOCK_SIZE
          horizontalShortage =
            effectiveLeftWidth + effectiveRightWidth + MIN_CENTER_WIDTH - newWidth
        }
        if (horizontalShortage > 0 && leftDockCount > 0 && !nextCollapsedLeft) {
          nextCollapsedLeft = true
          effectiveLeftWidth = COLLAPSED_DOCK_SIZE
          horizontalShortage =
            effectiveLeftWidth + effectiveRightWidth + MIN_CENTER_WIDTH - newWidth
        }
        if (horizontalShortage > 0 && rightDockCount > 0 && !nextCollapsedRight) {
          nextCollapsedRight = true
          effectiveRightWidth = COLLAPSED_DOCK_SIZE
        }

        const verticalShortage =
          effectiveBottomHeight + topBarHeight + MIN_CENTER_HEIGHT - newHeight
        if (verticalShortage > 0 && bottomDockCount > 0 && !nextCollapsedBottom) {
          nextCollapsedBottom = true
          effectiveBottomHeight = COLLAPSED_DOCK_SIZE
        }

        const shouldKeepLeftAutoCollapsed =
          leftDockCount > 0 &&
          effectiveRightWidth + effectiveLeftWidth + MIN_CENTER_WIDTH > newWidth &&
          nextCollapsedLeft
        const shouldKeepRightAutoCollapsed =
          rightDockCount > 0 &&
          effectiveLeftWidth + effectiveRightWidth + MIN_CENTER_WIDTH > newWidth &&
          nextCollapsedRight
        const shouldKeepBottomAutoCollapsed =
          bottomDockCount > 0 &&
          effectiveBottomHeight + topBarHeight + MIN_CENTER_HEIGHT > newHeight &&
          nextCollapsedBottom

        if (ctx.autoCollapsedDocksRef.current.left && !shouldKeepLeftAutoCollapsed) {
          nextCollapsedLeft = false
          effectiveLeftWidth = nextLeftWidth
        }
        if (ctx.autoCollapsedDocksRef.current.right && !shouldKeepRightAutoCollapsed) {
          nextCollapsedRight = false
          effectiveRightWidth = nextRightWidth
        }
        if (ctx.autoCollapsedDocksRef.current.bottom && !shouldKeepBottomAutoCollapsed) {
          nextCollapsedBottom = false
          effectiveBottomHeight = nextBottomHeight
        }

        ctx.autoCollapsedDocksRef.current = {
          left:
            nextCollapsedLeft && !currentCollapsedDocks.left ? true : shouldKeepLeftAutoCollapsed,
          right:
            nextCollapsedRight && !currentCollapsedDocks.right
              ? true
              : shouldKeepRightAutoCollapsed,
          bottom:
            nextCollapsedBottom && !currentCollapsedDocks.bottom
              ? true
              : shouldKeepBottomAutoCollapsed
        }

        const leftChanged = Math.abs(nextLeftWidth - currentLayout.dockSizes.leftWidth) > 1
        const rightChanged = Math.abs(nextRightWidth - currentLayout.dockSizes.rightWidth) > 1
        const bottomChanged = Math.abs(nextBottomHeight - currentLayout.dockSizes.bottomHeight) > 1
        const collapsedChanged =
          nextCollapsedLeft !== currentCollapsedDocks.left ||
          nextCollapsedRight !== currentCollapsedDocks.right ||
          nextCollapsedBottom !== currentCollapsedDocks.bottom

        let floatingPanelsChanged = false
        const nextPanels = Object.fromEntries(
          Object.entries(currentLayout.panels).map(([panelId, panel]) => {
            if (panel.mode !== 'floating' || !panel.position || !panel.size) {
              return [panelId, panel]
            }

            const clampedWidth = clamp(
              panel.size.width,
              MIN_FLOAT_WIDTH,
              Math.max(MIN_FLOAT_WIDTH, newWidth - 24)
            )
            const clampedHeight = clamp(
              panel.size.height,
              MIN_FLOAT_HEIGHT,
              Math.max(MIN_FLOAT_HEIGHT, newHeight - 24)
            )
            const clampedX = clamp(panel.position.x, 0, Math.max(0, newWidth - clampedWidth))
            const clampedY = clamp(panel.position.y, 0, Math.max(0, newHeight - clampedHeight))

            if (
              clampedWidth !== panel.size.width ||
              clampedHeight !== panel.size.height ||
              clampedX !== panel.position.x ||
              clampedY !== panel.position.y
            ) {
              floatingPanelsChanged = true
              return [
                panelId,
                {
                  ...panel,
                  position: { x: clampedX, y: clampedY },
                  size: { width: clampedWidth, height: clampedHeight },
                  lastFloatingPosition: { x: clampedX, y: clampedY },
                  lastFloatingSize: { width: clampedWidth, height: clampedHeight }
                }
              ]
            }

            return [panelId, panel]
          })
        ) as LayoutState['panels']

        if (leftChanged || rightChanged || bottomChanged || floatingPanelsChanged) {
          ctx.setLayout({
            ...currentLayout,
            dockSizes: {
              ...currentLayout.dockSizes,
              leftWidth: nextLeftWidth,
              rightWidth: nextRightWidth,
              bottomHeight: nextBottomHeight
            },
            panels: nextPanels
          })
        }

        if (collapsedChanged) {
          ctx.setCollapsedDocks({
            left: nextCollapsedLeft,
            right: nextCollapsedRight,
            bottom: nextCollapsedBottom
          })
        }

        ctx.prevWindowSizeRef.current = { width: newWidth, height: newHeight }
      })
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeFrameId !== null) cancelAnimationFrame(resizeFrameId)
    }
  }, [ctx.setLayout])

  return {
    togglePanel,
    togglePanelCollapse,
    isPanelVisible,
    getVerticalDockRenderState,
    getDockedPanelStyle,
    clamp
  }
}
