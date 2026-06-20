/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { CSSProperties } from 'react'
import type { DockSlotId, LayoutState, Vec2 } from './layoutTypes'
import { COLLAPSED_HEADER_HEIGHT } from './dockingConstants'
import type { DockingContextValue } from './DockingContext'

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max))

export const getSlotCapacity = (slot: DockSlotId): number => (slot === 'bottom' ? 1 : 2)

export const removeFromAllSlots = (nextDocked: LayoutState['docked'], panelId: string) => {
  nextDocked.left = nextDocked.left.filter((id) => id !== panelId)
  nextDocked.right = nextDocked.right.filter((id) => id !== panelId)
  nextDocked.bottom = nextDocked.bottom.filter((id) => id !== panelId)
}

export const insertIntoSlot = (
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

export const enforceSlotCapacity = (
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

  if (preferredPanelId && list.includes(preferredPanelId) && !keepIds.includes(preferredPanelId)) {
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

export const getDockHitTestRect = (ctx: DockingContextValue, slot: DockSlotId): DOMRect | null => {
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

  if (ctx.isDockCollapsed(slot)) return null

  const targetEl = ctx.getDockElement(slot)
  return targetEl?.getBoundingClientRect() ?? null
}

export const getHoverSlotAtPoint = (
  ctx: DockingContextValue,
  clientX: number,
  clientY: number
): DockSlotId | null => {
  const leftRect = getDockHitTestRect(ctx, 'left')
  const rightRect = getDockHitTestRect(ctx, 'right')
  const bottomRect = getDockHitTestRect(ctx, 'bottom')

  const isInside = (r: DOMRect | null): boolean => {
    if (!r) return false
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
  }

  if (isInside(leftRect)) return 'left'
  if (isInside(rightRect)) return 'right'
  if (isInside(bottomRect)) return 'bottom'
  return null
}

export const getFloatingPositionAtPoint = (
  ctx: DockingContextValue,
  clientX: number,
  clientY: number,
  grabOffset: Vec2
): Vec2 => {
  const rootRect = ctx.rootRef.current?.getBoundingClientRect()
  if (!rootRect) return { x: clientX - grabOffset.x, y: clientY - grabOffset.y }
  return {
    x: clientX - rootRect.left - grabOffset.x,
    y: clientY - rootRect.top - grabOffset.y
  }
}

export const getInsertIndexForSlot = (
  ctx: DockingContextValue,
  slot: DockSlotId,
  clientY: number
): number => {
  const rect = getDockHitTestRect(ctx, slot)
  const currentDocked = ctx.layoutRef.current.docked[slot]
  const capacity = getSlotCapacity(slot)

  if (!rect) return Math.min(currentDocked.length, Math.max(0, capacity - 1))
  if (capacity === 1) return 0

  const midY = rect.top + rect.height / 2
  return clientY < midY ? 0 : 1
}

export type DockedPanelRenderEntry = {
  id: string
  className: string
  baseStyle: CSSProperties
}

export const getVerticalDockRenderState = (
  ctx: DockingContextValue,
  entries: Array<DockedPanelRenderEntry | null>
) => {
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
}

export const getDockedPanelStyle = (
  ctx: DockingContextValue,
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
