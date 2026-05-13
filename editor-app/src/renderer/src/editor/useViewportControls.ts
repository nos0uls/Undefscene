import { useCallback, useRef, useState } from 'react'
import type { RoomScreenshotBundle } from './RoomVisualEditorTypes'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

type UseViewportControlsProps = {
  bundle: RoomScreenshotBundle | null
  stopPlayPreview: () => void
  clearTransientInteractionState: () => void
}

export function useViewportControls({
  bundle,
  stopPlayPreview,
  clearTransientInteractionState
}: UseViewportControlsProps) {
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 24, y: 24 })

  const viewportRef = useRef<HTMLDivElement>(null)
  const dragPanRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startOffsetX: number
    startOffsetY: number
  } | null>(null)

  // Сброс viewport к начальному состоянию.
  const resetView = useCallback((): void => {
    stopPlayPreview()
    clearTransientInteractionState()
    setZoom(1)
    setOffset({ x: 24, y: 24 })
  }, [stopPlayPreview, clearTransientInteractionState])

  // Fit рассчитывает zoom так, чтобы вся room влезла в viewport.
  const fitToViewport = useCallback((): void => {
    const meta = bundle?.meta
    const viewport = viewportRef.current
    if (!meta || !viewport) return

    const innerWidth = Math.max(120, viewport.clientWidth - 32)
    const innerHeight = Math.max(120, viewport.clientHeight - 32)
    const nextZoom = Math.min(
      innerWidth / meta.room_width,
      innerHeight / meta.room_height
    )
    const clampedZoom = clamp(Number(nextZoom.toFixed(3)), MIN_ZOOM, MAX_ZOOM)

    setZoom(clampedZoom)
    setOffset({
      x: Math.round((innerWidth - meta.room_width * clampedZoom) / 2),
      y: Math.round((innerHeight - meta.room_height * clampedZoom) / 2)
    })
  }, [bundle])

  // Zoom вокруг точки на экране.
  const zoomAroundClientPoint = useCallback(
    (clientX: number, clientY: number, nextZoom: number): void => {
      const viewport = viewportRef.current
      const meta = bundle?.meta
      if (!viewport || !meta) return

      const rect = viewport.getBoundingClientRect()
      const clampedZoom = clamp(Number(nextZoom.toFixed(3)), MIN_ZOOM, MAX_ZOOM)

      const worldX = (clientX - rect.left - offset.x) / zoom
      const worldY = (clientY - rect.top - offset.y) / zoom

      setOffset({
        x: Math.round(clientX - rect.left - worldX * clampedZoom),
        y: Math.round(clientY - rect.top - worldY * clampedZoom)
      })
      setZoom(clampedZoom)
    },
    [bundle, offset, zoom]
  )

  // Простые zoom controls кнопками.
  const zoomIn = useCallback((): void => {
    setZoom((prev) => clamp(Number((prev * 1.25).toFixed(3)), MIN_ZOOM, MAX_ZOOM))
  }, [])

  const zoomOut = useCallback((): void => {
    setZoom((prev) => clamp(Number((prev / 1.25).toFixed(3)), MIN_ZOOM, MAX_ZOOM))
  }, [])

  // Колесо мыши и жесты тачпада масштабируют viewport.
  const handleViewportWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>): void => {
      event.preventDefault()

      const scaleFactor = Math.exp(-event.deltaY * 0.0015)
      zoomAroundClientPoint(event.clientX, event.clientY, zoom * scaleFactor)
    },
    [zoom, zoomAroundClientPoint]
  )

  return {
    // State
    zoom,
    offset,
    // Refs
    viewportRef,
    dragPanRef,
    // Actions
    setZoom,
    setOffset,
    resetView,
    fitToViewport,
    zoomAroundClientPoint,
    zoomIn,
    zoomOut,
    handleViewportWheel,
    // Constants
    MIN_ZOOM,
    MAX_ZOOM
  }
}
