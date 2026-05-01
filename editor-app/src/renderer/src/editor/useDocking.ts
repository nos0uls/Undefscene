/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useCallback, useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'

import type { DockSlotId, LayoutState, Size, Vec2 } from './layoutTypes'
import type { ResizeKind } from './dockingConstants'
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

export type DockedPanelRenderEntry = {
  id: string
  className: string
  baseStyle: CSSProperties
}

export type UseDockingParams = {
  getPanelTitle: (panelId: string) => string
  showDockDropPreview: boolean
}

export type UseDockingResult = {
  startPanelDrag: (panelId: string) => (event: React.PointerEvent<HTMLElement>) => void
  startResizeDrag: (kind: ResizeKind, panelId?: string) => (event: React.PointerEvent<HTMLElement>) => void
  togglePanel: (panelId: string) => void
  togglePanelCollapse: (panelId: string) => void
  isPanelVisible: (panelId: string) => boolean
  allPanels: Array<{ id: string; label: string }>
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

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max))

const getSlotCapacity = (slot: DockSlotId): number => (slot === 'bottom' ? 1 : 2)

const removeFromAllSlots = (nextDocked: LayoutState['docked'], panelId: string) => {
  nextDocked.left = nextDocked.left.filter((id) => id !== panelId)
  nextDocked.right = nextDocked.right.filter((id) => id !== panelId)
  nextDocked.bottom = nextDocked.bottom.filter((id) => id !== panelId)
}

const insertIntoSlot = (
  nextDocked: LayoutState['docked'],
  slot: 'left' | 'right' | 'bottom',
  panelId: string,
  index: number
) => {
  const list = [...nextDocked[slot]]
  if (list.includes(panelId)) return
  const safeIndex = Math.max(0, Math.min(index, list.length))
  list.splice(safeIndex, 0, panelId)
  nextDocked[slot] = list
}

const enforceSlotCapacity = (
  nextDocked: LayoutState['docked'],
  nextPanels: LayoutState['panels'],
  slot: DockSlotId,
  preferredPanelId?: string
) => {
  const capacity = getSlotCapacity(slot)
  const list = [...nextDocked[slot]]

  if (list.length <= capacity) return

  let keepIds = list.slice(0, capacity)
  let overflowIds = list.slice(capacity)

  if (
    preferredPanelId &&
    list.includes(preferredPanelId) &&
    !keepIds.includes(preferredPanelId)
  ) {
    keepIds = [...keepIds.slice(0, capacity - 1), preferredPanelId]
    overflowIds = list.filter((id) => !keepIds.includes(id))
  }

  nextDocked[slot] = keepIds

  overflowIds.forEach((panelId) => {
    const panel = nextPanels[panelId]
    if (!panel) return

    nextPanels[panelId] = {
      ...panel,
      mode: 'hidden',
      slot: null,
      lastDockedSlot: panel.slot ?? panel.lastDockedSlot ?? slot
    }
  })
}

export function useDocking(params: UseDockingParams): UseDockingResult {
  const { getPanelTitle, showDockDropPreview } = params
  const ctx = useDockingContext()

  // --- getDockHitTestRect ---
  const getDockHitTestRect = (slot: DockSlotId): DOMRect | null => {
    const dockedCount = ctx.layoutRef.current.docked[slot].filter(
      (id) => ctx.layoutRef.current.panels[id]?.mode === 'docked'
    ).length

    if (slot === 'bottom' && dockedCount === 0) {
      const bottomRect = ctx.getDockElement('bottom')?.getBoundingClientRect()
      if (!bottomRect) return null

      const expandUp = 140
      return new DOMRect(
        bottomRect.x,
        Math.max(0, bottomRect.y - expandUp),
        bottomRect.width,
        bottomRect.height + expandUp
      )
    }

    const targetEl = ctx.isDockCollapsed(slot) ? ctx.getDockHitboxElement(slot) : ctx.getDockElement(slot)
    return targetEl?.getBoundingClientRect() ?? null
  }

  // --- updateDragPreviewDOM ---
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
        if (previewEl) previewEl.style.display = 'none'
      }
      ctx.hoverSlotRef.current = hoverSlot
      ctx.hoverInsertIndexRef.current = hoverInsertIndex
      return
    }

    for (const slot of ['left', 'right', 'bottom'] as DockSlotId[]) {
      const previewEl = ctx.getDockPreviewElement(slot)
      if (previewEl) previewEl.style.display = 'none'
    }

    if (hoverSlot && hoverInsertIndex !== null) {
      const previewEl = ctx.getDockPreviewElement(hoverSlot)
      const capacity = getSlotCapacity(hoverSlot)
      const currentDocked = ctx.layoutRef.current.docked[hoverSlot].filter(
        (id) => ctx.layoutRef.current.panels[id]?.mode === 'docked'
      )

      if (previewEl) {
        previewEl.style.display = 'block'
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

  // --- scheduleDragPreview ---
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

  // --- getHoverSlotAtPoint ---
  const getHoverSlotAtPoint = (clientX: number, clientY: number): DockSlotId | null => {
    const leftRect = getDockHitTestRect('left')
    const rightRect = getDockHitTestRect('right')
    const bottomRect = getDockHitTestRect('bottom')

    const isInside = (r: DOMRect | null): boolean => {
      if (!r) return false
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
    }

    if (isInside(leftRect)) return 'left'
    if (isInside(rightRect)) return 'right'
    if (isInside(bottomRect)) return 'bottom'
    return null
  }

  // --- getFloatingPositionAtPoint ---
  const getFloatingPositionAtPoint = (clientX: number, clientY: number, grabOffset: Vec2): Vec2 => {
    const rootRect = ctx.rootRef.current?.getBoundingClientRect()
    if (!rootRect) return { x: clientX - grabOffset.x, y: clientY - grabOffset.y }
    return {
      x: clientX - rootRect.left - grabOffset.x,
      y: clientY - rootRect.top - grabOffset.y
    }
  }

  // --- getInsertIndexForSlot ---
  const getInsertIndexForSlot = (slot: DockSlotId, clientY: number): number => {
    const rect = getDockHitTestRect(slot)
    const currentDocked = ctx.layoutRef.current.docked[slot]
    const capacity = getSlotCapacity(slot)

    if (!rect) return Math.min(currentDocked.length, Math.max(0, capacity - 1))
    if (capacity === 1) return 0

    const midY = rect.top + rect.height / 2
    return clientY < midY ? 0 : 1
  }

  // --- getVerticalDockRenderState ---
  const getVerticalDockRenderState = useCallback(
    (entries: Array<DockedPanelRenderEntry | null>) => {
      const normalizedEntries = entries.filter(
        (entry): entry is DockedPanelRenderEntry => entry !== null
      )

      if (normalizedEntries.length <= 0) {
        return {
          orderedEntries: [] as DockedPanelRenderEntry[],
          fillRemainingPanelId: null as string | null,
          showSplitter: false
        }
      }

      if (normalizedEntries.length === 1) {
        return {
          orderedEntries: normalizedEntries,
          fillRemainingPanelId: normalizedEntries[0].id,
          showSplitter: false
        }
      }

      const [firstEntry, secondEntry] = normalizedEntries
      const firstCollapsed = Boolean(ctx.layout.panels[firstEntry.id]?.collapsed)
      const secondCollapsed = Boolean(ctx.layout.panels[secondEntry.id]?.collapsed)

      if (firstCollapsed && !secondCollapsed) {
        return {
          orderedEntries: [secondEntry, firstEntry],
          fillRemainingPanelId: secondEntry.id,
          showSplitter: false
        }
      }

      if (!firstCollapsed && secondCollapsed) {
        return {
          orderedEntries: [firstEntry, secondEntry],
          fillRemainingPanelId: firstEntry.id,
          showSplitter: false
        }
      }

      return {
        orderedEntries: normalizedEntries,
        fillRemainingPanelId: normalizedEntries.length === 1 ? normalizedEntries[0].id : null,
        showSplitter: !firstCollapsed && !secondCollapsed
      }
    },
    [ctx.layout.panels]
  )

  // --- getDockedPanelStyle ---
  const getDockedPanelStyle = (
    panelId: string,
    baseStyle?: CSSProperties,
    options?: { fillRemainingSpace?: boolean }
  ): CSSProperties | undefined => {
    const isCollapsed = Boolean(ctx.layout.panels[panelId]?.collapsed)
    if (isCollapsed) {
      return {
        ...(baseStyle ?? {}),
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: COLLAPSED_HEADER_HEIGHT,
        height: COLLAPSED_HEADER_HEIGHT
      }
    }

    if (options?.fillRemainingSpace) {
      return {
        ...(baseStyle ?? {}),
        flexGrow: 1,
        flexBasis: 0,
        minHeight: 0
      }
    }

    return baseStyle
  }

  // --- togglePanelCollapse ---
  const togglePanelCollapse = (panelId: string) => {
    const panel = ctx.layout.panels[panelId]
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

  // --- togglePanel ---
  const togglePanel = (panelId: string) => {
    const current = ctx.layout.panels[panelId]
    if (!current) return

    if (current.mode !== 'hidden') {
      const nextDocked = {
        left: [...ctx.layout.docked.left],
        right: [...ctx.layout.docked.right],
        bottom: [...ctx.layout.docked.bottom]
      }
      removeFromAllSlots(nextDocked, panelId)

      const lastFloatingPosition = current.position ?? current.lastFloatingPosition ?? null
      const lastFloatingSize = current.size ?? current.lastFloatingSize ?? null

      ctx.setLayout({
        ...ctx.layout,
        docked: nextDocked,
        panels: {
          ...ctx.layout.panels,
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
        left: [...ctx.layout.docked.left],
        right: [...ctx.layout.docked.right],
        bottom: [...ctx.layout.docked.bottom]
      }
      const nextPanels = { ...ctx.layout.panels }

      removeFromAllSlots(nextDocked, panelId)
      insertIntoSlot(nextDocked, preferredDockSlot, panelId, nextDocked[preferredDockSlot].length)
      enforceSlotCapacity(nextDocked, nextPanels, preferredDockSlot, panelId)

      if (nextPanels[panelId]?.mode !== 'hidden') {
        ctx.setLayout({
          ...ctx.layout,
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

    const defaultPosition: Vec2 = current.lastFloatingPosition ?? {
      x: rootRect ? Math.max(12, (rootRect.width - clampedWidth) / 2) : 120,
      y: rootRect ? Math.max(60, (rootRect.height - clampedHeight) / 2) : 80
    }

    const maxZ = Math.max(1, ...Object.values(ctx.layout.panels).map((p) => p.zIndex ?? 1))

    ctx.setLayout({
      ...ctx.layout,
      panels: {
        ...ctx.layout.panels,
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
  }

  // --- isPanelVisible ---
  const isPanelVisible = (panelId: string): boolean => {
    const p = ctx.layout.panels[panelId]
    if (!p) return false
    return p.mode !== 'hidden'
  }

  // --- allPanels ---
  const allPanels = useMemo(() => {
    return [
      { id: 'panel.actions', label: getPanelTitle('panel.actions') },
      { id: 'panel.bookmarks', label: getPanelTitle('panel.bookmarks') },
      { id: 'panel.text', label: getPanelTitle('panel.text') },
      { id: 'panel.inspector', label: getPanelTitle('panel.inspector') },
      { id: 'panel.logs', label: getPanelTitle('panel.logs') }
    ]
  }, [getPanelTitle])

  // --- startPanelDrag ---
  const startPanelDrag = (panelId: string) => (event: React.PointerEvent<HTMLElement>) => {
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

    const panelEl = (event.currentTarget as HTMLElement).closest('.dockPanel') as HTMLElement | null
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

    const ghostPosition = getFloatingPositionAtPoint(event.clientX, event.clientY, grabOffset)
    const hoverSlot = getHoverSlotAtPoint(event.clientX, event.clientY)
    const hoverInsertIndex = hoverSlot ? getInsertIndexForSlot(hoverSlot, event.clientY) : null

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
  }

  // --- Drag effect ---
  useEffect(() => {
    if (!ctx.drag) return

    const drag = ctx.drag

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return

      const ghostPosition = getFloatingPositionAtPoint(
        event.clientX,
        event.clientY,
        drag.grabOffset
      )
      const hoverSlot = getHoverSlotAtPoint(event.clientX, event.clientY)
      const hoverInsertIndex = hoverSlot ? getInsertIndexForSlot(hoverSlot, event.clientY) : null

      scheduleDragPreview(ghostPosition, hoverSlot, hoverInsertIndex)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return

      const currentLayout = ctx.layoutRef.current
      const currentPanel = currentLayout.panels[drag.panelId]
      if (!currentPanel) {
        ctx.setDrag(null)
        updateDragPreviewDOM(null, null, null)
        return
      }

      const hoverSlot = getHoverSlotAtPoint(event.clientX, event.clientY)
      const nextDocked = {
        left: [...currentLayout.docked.left],
        right: [...currentLayout.docked.right],
        bottom: [...currentLayout.docked.bottom]
      }

      const nextPanels = { ...currentLayout.panels }

      removeFromAllSlots(nextDocked, drag.panelId)

      if (hoverSlot) {
        const insertIndex = getInsertIndexForSlot(hoverSlot, event.clientY)
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
            size: drag.size,
            zIndex: maxZ + 1,
            lastDockedSlot: currentPanel.slot ?? currentPanel.lastDockedSlot ?? null,
            lastFloatingPosition: floatingPosition,
            lastFloatingSize: drag.size
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

  // --- startResizeDrag ---
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

  // --- Resize effect ---
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
          const maxLeft = Math.max(
            MIN_LEFT_WIDTH,
            rootRect.width - currentLayout.dockSizes.rightWidth - MIN_CENTER_WIDTH
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
          const maxRight = Math.max(
            MIN_RIGHT_WIDTH,
            rootRect.width - currentLayout.dockSizes.leftWidth - MIN_CENTER_WIDTH
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
          const maxBottom = Math.max(
            MIN_BOTTOM_HEIGHT,
            rootRect.height - topBarHeight - MIN_CENTER_HEIGHT
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

  // --- Window resize effect ---
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
        const prevVerticalSpace = Math.max(MIN_BOTTOM_HEIGHT, prevHeight - topBarHeight - MIN_CENTER_HEIGHT)
        const nextVerticalSpace = Math.max(MIN_BOTTOM_HEIGHT, newHeight - topBarHeight - MIN_CENTER_HEIGHT)

        const leftRatio = currentLayout.dockSizes.leftWidth / prevHorizontalSpace
        const rightRatio = currentLayout.dockSizes.rightWidth / prevHorizontalSpace
        const bottomRatio = currentLayout.dockSizes.bottomHeight / prevVerticalSpace

        let nextLeftWidth = isGrowingHorizontally
          ? currentLayout.dockSizes.leftWidth
          : clamp(
            Math.round(nextHorizontalSpace * leftRatio),
            MIN_LEFT_WIDTH,
            Math.max(MIN_LEFT_WIDTH, newWidth - currentLayout.dockSizes.rightWidth - MIN_CENTER_WIDTH)
          )
        let nextRightWidth = isGrowingHorizontally
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

        let horizontalShortage = effectiveLeftWidth + effectiveRightWidth + MIN_CENTER_WIDTH - newWidth
        if (horizontalShortage > 0 && leftDockCount > 0 && !nextCollapsedLeft && nextLeftWidth <= MIN_LEFT_WIDTH + 8) {
          nextCollapsedLeft = true
          effectiveLeftWidth = COLLAPSED_DOCK_SIZE
          horizontalShortage = effectiveLeftWidth + effectiveRightWidth + MIN_CENTER_WIDTH - newWidth
        }
        if (horizontalShortage > 0 && rightDockCount > 0 && !nextCollapsedRight && nextRightWidth <= MIN_RIGHT_WIDTH + 8) {
          nextCollapsedRight = true
          effectiveRightWidth = COLLAPSED_DOCK_SIZE
          horizontalShortage = effectiveLeftWidth + effectiveRightWidth + MIN_CENTER_WIDTH - newWidth
        }
        if (horizontalShortage > 0 && leftDockCount > 0 && !nextCollapsedLeft) {
          nextCollapsedLeft = true
          effectiveLeftWidth = COLLAPSED_DOCK_SIZE
          horizontalShortage = effectiveLeftWidth + effectiveRightWidth + MIN_CENTER_WIDTH - newWidth
        }
        if (horizontalShortage > 0 && rightDockCount > 0 && !nextCollapsedRight) {
          nextCollapsedRight = true
          effectiveRightWidth = COLLAPSED_DOCK_SIZE
        }

        const verticalShortage = effectiveBottomHeight + topBarHeight + MIN_CENTER_HEIGHT - newHeight
        if (verticalShortage > 0 && bottomDockCount > 0 && !nextCollapsedBottom) {
          nextCollapsedBottom = true
          effectiveBottomHeight = COLLAPSED_DOCK_SIZE
        }

        const shouldKeepLeftAutoCollapsed =
          leftDockCount > 0 &&
          effectiveRightWidth + nextLeftWidth + MIN_CENTER_WIDTH > newWidth &&
          nextCollapsedLeft
        const shouldKeepRightAutoCollapsed =
          rightDockCount > 0 &&
          effectiveLeftWidth + nextRightWidth + MIN_CENTER_WIDTH > newWidth &&
          nextCollapsedRight
        const shouldKeepBottomAutoCollapsed =
          bottomDockCount > 0 &&
          nextBottomHeight + topBarHeight + MIN_CENTER_HEIGHT > newHeight &&
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
          left: nextCollapsedLeft && !currentCollapsedDocks.left ? true : shouldKeepLeftAutoCollapsed,
          right: nextCollapsedRight && !currentCollapsedDocks.right ? true : shouldKeepRightAutoCollapsed,
          bottom: nextCollapsedBottom && !currentCollapsedDocks.bottom ? true : shouldKeepBottomAutoCollapsed
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

            const clampedWidth = clamp(panel.size.width, MIN_FLOAT_WIDTH, Math.max(MIN_FLOAT_WIDTH, newWidth - 24))
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
    startPanelDrag,
    startResizeDrag,
    togglePanel,
    togglePanelCollapse,
    isPanelVisible,
    allPanels,
    getVerticalDockRenderState,
    getDockedPanelStyle,
    clamp
  }
}
