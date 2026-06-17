import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { VisualEditorSelectedNode } from './RoomVisualEditorTypes'

// Шаг сетки для path points в room coordinates.
export const PATH_GRID_STEP = 20

// Радиус стирания точек в режиме eraser.
export const PATH_ERASE_RADIUS = 14

// Минимальная дистанция между новыми точками path.
const PATH_APPEND_MIN_DISTANCE = 16

// Визуальный размер waypoint-точек.
export const PATH_POINT_RADIUS = 4
export const PATH_PREVIEW_POINT_RADIUS = 4

// Сравниваем два массива path points без лишней магии.
export function arePathPointsEqual(
  left: Array<{ x: number; y: number }>,
  right: Array<{ x: number; y: number }>
): boolean {
  if (left.length !== right.length) return false
  return left.every((point, index) => point.x === right[index]?.x && point.y === right[index]?.y)
}

// Упрощаем подряд идущие collinear points.
export function simplifyPathPoints(
  points: Array<{ x: number; y: number }>
): Array<{ x: number; y: number }> {
  if (points.length <= 2) {
    return points.map((point) => ({ ...point }))
  }

  const simplified: Array<{ x: number; y: number }> = [{ ...points[0] }, { ...points[1] }]

  for (let index = 2; index < points.length; index += 1) {
    const nextPoint = { ...points[index] }
    const middlePoint = simplified[simplified.length - 1]
    const startPoint = simplified[simplified.length - 2]

    const abx = middlePoint.x - startPoint.x
    const aby = middlePoint.y - startPoint.y
    const bcx = nextPoint.x - middlePoint.x
    const bcy = nextPoint.y - middlePoint.y
    const cross = abx * bcy - aby * bcx
    const dot = abx * bcx + aby * bcy

    if (cross === 0 && dot >= 0) {
      simplified[simplified.length - 1] = nextPoint
      continue
    }

    simplified.push(nextPoint)
  }

  return simplified
}

// Подготовленный сегмент пути для Play preview.
type PreparedPathSegment = {
  startPoint: { x: number; y: number }
  endPoint: { x: number; y: number }
  startDistance: number
  endDistance: number
  length: number
}

// Собираем сегменты пути один раз на изменение draft path.
export function buildPreparedPathSegments(
  points: Array<{ x: number; y: number }>
): PreparedPathSegment[] {
  const segments: PreparedPathSegment[] = []
  let accumulatedDistance = 0

  for (let index = 1; index < points.length; index += 1) {
    const startPoint = points[index - 1]
    const endPoint = points[index]
    const length = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y)
    if (length <= 0) {
      continue
    }

    segments.push({
      startPoint,
      endPoint,
      startDistance: accumulatedDistance,
      endDistance: accumulatedDistance + length,
      length
    })
    accumulatedDistance += length
  }

  return segments
}

// Короткий key для сравнения path по содержимому.
export function getPathPointsSyncKey(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${Math.round(point.x)}:${Math.round(point.y)}`).join('|')
}

type UsePathEditorLogicProps = {
  open: boolean
  selectedPathPoints: Array<{ x: number; y: number }>
  selectedNode: VisualEditorSelectedNode | null
  onImportPath: (points: Array<{ x: number; y: number }>) => void
  clearTransientInteractionState: () => void
  pathDrawRef?: React.MutableRefObject<{
    pointerId: number
    tool: 'pencil' | 'eraser'
    anchorPoint: { x: number; y: number } | null
    latestPoint: { x: number; y: number }
    isStraightSegment: boolean
  } | null>
}

export function usePathEditorLogic({
  open,
  selectedPathPoints,
  selectedNode,
  onImportPath,
  clearTransientInteractionState,
  pathDrawRef: externalPathDrawRef
}: UsePathEditorLogicProps) {
  const [draftPathPoints, setDraftPathPoints] = useState<Array<{ x: number; y: number }>>([])
  const [pathPreviewPoint, setPathPreviewPoint] = useState<{ x: number; y: number } | null>(null)

  const draftPathPointsRef = useRef<Array<{ x: number; y: number }>>([])
  const pathHistoryRef = useRef<Array<Array<{ x: number; y: number }>>>([])
  const pathHistoryIndexRef = useRef(0)
  const lastSyncedPathKeyRef = useRef('')
  const internalPathDrawRef = useRef<{
    pointerId: number
    tool: 'pencil' | 'eraser'
    anchorPoint: { x: number; y: number } | null
    latestPoint: { x: number; y: number }
    isStraightSegment: boolean
  } | null>(null)
  const pathDrawRef = externalPathDrawRef ?? internalPathDrawRef

  // Когда меняется выбранная follow_path-нода, синхронизируем draft path.
  useEffect(() => {
    if (!open) return
    const nextPoints = selectedPathPoints.map((point) => ({ x: point.x, y: point.y }))
    const nextPathKey = `${selectedNode?.id ?? 'none'}::${getPathPointsSyncKey(nextPoints)}`
    if (lastSyncedPathKeyRef.current === nextPathKey) {
      return
    }

    lastSyncedPathKeyRef.current = nextPathKey
    setDraftPathPoints(nextPoints)
    draftPathPointsRef.current = nextPoints
    pathHistoryRef.current = [nextPoints.map((point) => ({ ...point }))]
    pathHistoryIndexRef.current = 0
  }, [open, selectedPathPoints, selectedNode?.id])

  // Синхронизируем ref с актуальным React-state после любых изменений.
  useEffect(() => {
    draftPathPointsRef.current = draftPathPoints
  }, [draftPathPoints])

  // Центральный helper для обновления path points и записи history snapshot'ов.
  const commitDraftPathPoints = useCallback(
    (nextPoints: Array<{ x: number; y: number }>, options?: { recordHistory?: boolean }): void => {
      const normalizedNext = simplifyPathPoints(
        nextPoints.map((point) => ({ x: point.x, y: point.y }))
      )
      if (arePathPointsEqual(draftPathPointsRef.current, normalizedNext)) return

      draftPathPointsRef.current = normalizedNext
      setDraftPathPoints(normalizedNext)

      if (options?.recordHistory === false) return

      const trimmedHistory = pathHistoryRef.current.slice(0, pathHistoryIndexRef.current + 1)
      const lastSnapshot = trimmedHistory[trimmedHistory.length - 1] ?? []
      if (arePathPointsEqual(lastSnapshot, normalizedNext)) return

      trimmedHistory.push(normalizedNext.map((point) => ({ ...point })))
      pathHistoryRef.current = trimmedHistory
      pathHistoryIndexRef.current = trimmedHistory.length - 1
    },
    []
  )

  // Добавляем новую точку только если она реально отличается от предыдущей.
  const appendDraftPathPoint = useCallback(
    (point: { x: number; y: number }): void => {
      const prev = draftPathPointsRef.current
      const lastPoint = prev[prev.length - 1]
      if (lastPoint && lastPoint.x === point.x && lastPoint.y === point.y) {
        return
      }

      if (
        lastPoint &&
        Math.hypot(lastPoint.x - point.x, lastPoint.y - point.y) < PATH_APPEND_MIN_DISTANCE
      ) {
        return
      }

      commitDraftPathPoints([...prev, point])
    },
    [commitDraftPathPoints]
  )

  // Eraser удаляет точки вокруг курсора по небольшому радиусу.
  const eraseDraftPathPoints = useCallback(
    (point: { x: number; y: number }): void => {
      const nextPoints = draftPathPointsRef.current.filter(
        (candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) > PATH_ERASE_RADIUS
      )
      commitDraftPathPoints(nextPoints)
    },
    [commitDraftPathPoints]
  )

  const clearDraftPath = useCallback((): void => {
    clearTransientInteractionState()
    commitDraftPathPoints([])
  }, [commitDraftPathPoints, clearTransientInteractionState])

  const importDraftPath = useCallback((): void => {
    onImportPath(simplifyPathPoints(draftPathPoints))
  }, [draftPathPoints, onImportPath])

  // Undo/redo для path history.
  const undoPath = useCallback((): void => {
    const nextIndex = pathHistoryIndexRef.current - 1
    if (nextIndex < 0) return

    const nextPoints = (pathHistoryRef.current[nextIndex] ?? []).map((point) => ({ ...point }))
    pathHistoryIndexRef.current = nextIndex
    draftPathPointsRef.current = nextPoints
    setDraftPathPoints(nextPoints)
  }, [])

  const redoPath = useCallback((): void => {
    const nextIndex = pathHistoryIndexRef.current + 1
    if (nextIndex >= pathHistoryRef.current.length) return

    const nextPoints = (pathHistoryRef.current[nextIndex] ?? []).map((point) => ({ ...point }))
    pathHistoryIndexRef.current = nextIndex
    draftPathPointsRef.current = nextPoints
    setDraftPathPoints(nextPoints)
  }, [])

  // Подготовленные сегменты для Play preview.
  const preparedDraftPathSegments = useMemo(
    () => buildPreparedPathSegments(draftPathPoints),
    [draftPathPoints]
  )

  // Общая длина подготовленного пути.
  const preparedDraftPathTotalLength = useMemo(
    () => preparedDraftPathSegments[preparedDraftPathSegments.length - 1]?.endDistance ?? 0,
    [preparedDraftPathSegments]
  )

  // SVG polyline для отрисовки.
  const draftPathPolyline = useMemo(
    () => draftPathPoints.map((point) => `${point.x},${point.y}`).join(' '),
    [draftPathPoints]
  )

  return {
    // State
    draftPathPoints,
    pathPreviewPoint,
    preparedDraftPathSegments,
    preparedDraftPathTotalLength,
    draftPathPolyline,
    // Refs
    draftPathPointsRef,
    pathDrawRef,
    // Actions
    setPathPreviewPoint,
    commitDraftPathPoints,
    appendDraftPathPoint,
    eraseDraftPathPoints,
    clearDraftPath,
    importDraftPath,
    undoPath,
    redoPath,
    // Constants
    PATH_GRID_STEP,
    PATH_ERASE_RADIUS,
    PATH_APPEND_MIN_DISTANCE,
    PATH_POINT_RADIUS,
    PATH_PREVIEW_POINT_RADIUS
  }
}
