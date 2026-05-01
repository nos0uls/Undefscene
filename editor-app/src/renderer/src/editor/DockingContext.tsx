import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { DockSlotId, LayoutState } from './layoutTypes'
import type { Vec2 } from './layoutTypes'
import type { DragState, ResizeDragState } from './dockingConstants'

export type CollapsedDocksState = {
  left: boolean
  right: boolean
  bottom: boolean
}

export type DockingContextValue = {
  layout: LayoutState
  setLayout: (l: LayoutState) => void
  collapsedDocks: CollapsedDocksState
  setCollapsedDocks: React.Dispatch<React.SetStateAction<CollapsedDocksState>>
  collapsedDocksRef: React.MutableRefObject<CollapsedDocksState>
  autoCollapsedDocksRef: React.MutableRefObject<CollapsedDocksState>
  drag: DragState | null
  setDrag: React.Dispatch<React.SetStateAction<DragState | null>>
  resizeDrag: ResizeDragState | null
  setResizeDrag: React.Dispatch<React.SetStateAction<ResizeDragState | null>>
  rootRef: React.RefObject<HTMLDivElement | null>
  layoutRef: React.MutableRefObject<LayoutState>
  leftDockRef: React.MutableRefObject<HTMLElement | null>
  rightDockRef: React.MutableRefObject<HTMLElement | null>
  bottomDockRef: React.MutableRefObject<HTMLElement | null>
  leftDockHitboxRef: React.MutableRefObject<HTMLDivElement | null>
  rightDockHitboxRef: React.MutableRefObject<HTMLDivElement | null>
  bottomDockHitboxRef: React.MutableRefObject<HTMLDivElement | null>
  leftDockPreviewRef: React.MutableRefObject<HTMLDivElement | null>
  rightDockPreviewRef: React.MutableRefObject<HTMLDivElement | null>
  bottomDockPreviewRef: React.MutableRefObject<HTMLDivElement | null>
  ghostRef: React.MutableRefObject<HTMLDivElement | null>
  dragRafRef: React.MutableRefObject<number | null>
  pendingGhostPosRef: React.MutableRefObject<Vec2 | null>
  pendingHoverSlotRef: React.MutableRefObject<DockSlotId | null>
  pendingHoverInsertIndexRef: React.MutableRefObject<number | null>
  hoverSlotRef: React.MutableRefObject<DockSlotId | null>
  hoverInsertIndexRef: React.MutableRefObject<number | null>
  prevWindowSizeRef: React.MutableRefObject<{ width: number; height: number }>
  getDockElement: (slot: DockSlotId) => HTMLElement | null
  getDockHitboxElement: (slot: DockSlotId) => HTMLDivElement | null
  getDockPreviewElement: (slot: DockSlotId) => HTMLDivElement | null
  isDockCollapsed: (slot: DockSlotId) => boolean
}

const DockingContext = React.createContext<DockingContextValue | null>(null)

export { DockingContext }

export type DockingProviderProps = React.PropsWithChildren<{
  layout: LayoutState
  setLayout: (l: LayoutState) => void
  rootRef: React.RefObject<HTMLDivElement | null>
}>

export function DockingProvider(props: DockingProviderProps): React.JSX.Element {
  const { layout, setLayout, rootRef, children } = props

  // Collapsed docks state + sync ref
  const [collapsedDocks, setCollapsedDocks] = useState<CollapsedDocksState>({
    left: false,
    right: false,
    bottom: false
  })

  const collapsedDocksRef = useRef<CollapsedDocksState>(collapsedDocks)
  useEffect(() => {
    collapsedDocksRef.current = collapsedDocks
  }, [collapsedDocks])

  const autoCollapsedDocksRef = useRef<CollapsedDocksState>({
    left: false,
    right: false,
    bottom: false
  })

  // Drag + resize state
  const [drag, setDrag] = useState<DragState | null>(null)
  const [resizeDrag, setResizeDrag] = useState<ResizeDragState | null>(null)

  // DOM refs
  const leftDockRef = useRef<HTMLElement | null>(null)
  const rightDockRef = useRef<HTMLElement | null>(null)
  const bottomDockRef = useRef<HTMLElement | null>(null)

  const leftDockHitboxRef = useRef<HTMLDivElement | null>(null)
  const rightDockHitboxRef = useRef<HTMLDivElement | null>(null)
  const bottomDockHitboxRef = useRef<HTMLDivElement | null>(null)

  const leftDockPreviewRef = useRef<HTMLDivElement | null>(null)
  const rightDockPreviewRef = useRef<HTMLDivElement | null>(null)
  const bottomDockPreviewRef = useRef<HTMLDivElement | null>(null)

  const ghostRef = useRef<HTMLDivElement | null>(null)

  // Layout ref synced via useEffect
  const layoutRef = useRef<LayoutState>(layout)
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

  // RAF + pending refs
  const dragRafRef = useRef<number | null>(null)
  const pendingGhostPosRef = useRef<Vec2 | null>(null)
  const pendingHoverSlotRef = useRef<DockSlotId | null>(null)
  const pendingHoverInsertIndexRef = useRef<number | null>(null)

  // Hover refs
  const hoverSlotRef = useRef<DockSlotId | null>(null)
  const hoverInsertIndexRef = useRef<number | null>(null)

  // Window resize ref
  const prevWindowSizeRef = useRef<{ width: number; height: number }>({
    width: window.innerWidth,
    height: window.innerHeight
  })

  // Helper functions (stable, plain closures)
  const getDockElement = (slot: DockSlotId): HTMLElement | null => {
    if (slot === 'left') return leftDockRef.current
    if (slot === 'right') return rightDockRef.current
    return bottomDockRef.current
  }

  const getDockHitboxElement = (slot: DockSlotId): HTMLDivElement | null => {
    if (slot === 'left') return leftDockHitboxRef.current
    if (slot === 'right') return rightDockHitboxRef.current
    return bottomDockHitboxRef.current
  }

  const getDockPreviewElement = (slot: DockSlotId): HTMLDivElement | null => {
    if (slot === 'left') return leftDockPreviewRef.current
    if (slot === 'right') return rightDockPreviewRef.current
    return bottomDockPreviewRef.current
  }

  const isDockCollapsed = (slot: DockSlotId): boolean => {
    if (slot === 'left') return collapsedDocks.left
    if (slot === 'right') return collapsedDocks.right
    return collapsedDocks.bottom
  }

  // Memoized context value — не создаём новый объект каждый рендер Provider'а.
  const value = useMemo<DockingContextValue>(
    () => ({
      layout,
      setLayout,
      collapsedDocks,
      setCollapsedDocks,
      collapsedDocksRef,
      autoCollapsedDocksRef,
      drag,
      setDrag,
      resizeDrag,
      setResizeDrag,
      rootRef,
      layoutRef,
      leftDockRef,
      rightDockRef,
      bottomDockRef,
      leftDockHitboxRef,
      rightDockHitboxRef,
      bottomDockHitboxRef,
      leftDockPreviewRef,
      rightDockPreviewRef,
      bottomDockPreviewRef,
      ghostRef,
      dragRafRef,
      pendingGhostPosRef,
      pendingHoverSlotRef,
      pendingHoverInsertIndexRef,
      hoverSlotRef,
      hoverInsertIndexRef,
      prevWindowSizeRef,
      getDockElement,
      getDockHitboxElement,
      getDockPreviewElement,
      isDockCollapsed
    }),
    [
      layout,
      setLayout,
      collapsedDocks,
      drag,
      resizeDrag,
      rootRef,
      getDockElement,
      getDockHitboxElement,
      getDockPreviewElement,
      isDockCollapsed
    ]
  )

  return (
    <DockingContext.Provider value={value}>
      {children}
    </DockingContext.Provider>
  )
}

export function useDockingContext(): DockingContextValue {
  const ctx = useContext(DockingContext)
  if (!ctx) {
    throw new Error('useDockingContext must be used within DockingProvider')
  }
  return ctx
}
