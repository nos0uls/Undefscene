import { useEffect, useMemo, useState } from 'react'

export type FollowPathPoint = {
  x: number
  y: number
}

type FollowPathPreviewProps = {
  // Точки пути в world-space координатах.
  // Мы не меняем их смысл, а только нормализуем для preview-рендера.
  points: FollowPathPoint[]

  // Скорость из editor params в px/sec.
  // Используем её, чтобы marker двигался примерно с тем же темпом,
  // что и в runtime, но внутри безопасного preview.
  speedPxPerSecond: number

  // Тексты приходят сверху через i18n, чтобы компонент не знал про translator напрямую.
  title: string
  hint: string
  emptyLabel: string
  worldSpaceLabel: string
}

type NormalizedPoint = {
  x: number
  y: number
}

type SegmentInfo = {
  length: number
  startLength: number
}

const PREVIEW_WIDTH = 260
const PREVIEW_HEIGHT = 170
const PREVIEW_PADDING = 18

/// @description Возвращает корректное число для preview-математики.
/// @param {unknown} value Любое входное значение.
/// @param {number} fallback Запасное число, если значение невалидно.
/// @returns {number}
function toFiniteNumber(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : fallback
}

/// @description Находит bounds массива точек и гарантирует ненулевые размеры области.
/// @param {FollowPathPoint[]} points World-space точки пути.
/// @returns {{ minX: number; minY: number; width: number; height: number }}
function getPointBounds(points: FollowPathPoint[]): {
  minX: number
  minY: number
  width: number
  height: number
} {
  if (points.length === 0) {
    return { minX: 0, minY: 0, width: 1, height: 1 }
  }

  let minX = points[0].x
  let maxX = points[0].x
  let minY = points[0].y
  let maxY = points[0].y

  for (const pt of points) {
    if (pt.x < minX) minX = pt.x
    if (pt.x > maxX) maxX = pt.x
    if (pt.y < minY) minY = pt.y
    if (pt.y > maxY) maxY = pt.y
  }

  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  }
}

/// @description Нормализует world-space точки внутрь preview SVG с сохранением пропорций.
/// @param {FollowPathPoint[]} points Исходные точки пути.
/// @returns {NormalizedPoint[]}
function normalizePoints(points: FollowPathPoint[]): NormalizedPoint[] {
  if (points.length === 0) return []

  const bounds = getPointBounds(points)
  const usableWidth = PREVIEW_WIDTH - PREVIEW_PADDING * 2
  const usableHeight = PREVIEW_HEIGHT - PREVIEW_PADDING * 2
  const scale = Math.min(usableWidth / bounds.width, usableHeight / bounds.height)

  const contentWidth = bounds.width * scale
  const contentHeight = bounds.height * scale
  const offsetX = (PREVIEW_WIDTH - contentWidth) / 2
  const offsetY = (PREVIEW_HEIGHT - contentHeight) / 2

  return points.map((pt) => ({
    x: offsetX + (pt.x - bounds.minX) * scale,
    y: offsetY + (pt.y - bounds.minY) * scale
  }))
}

/// @description Считает длины сегментов preview-линии.
/// @param {NormalizedPoint[]} points Уже нормализованные точки.
/// @returns {{ segments: SegmentInfo[]; totalLength: number }}
function buildSegments(points: NormalizedPoint[]): {
  segments: SegmentInfo[]
  totalLength: number
} {
  if (points.length < 2) {
    return { segments: [], totalLength: 0 }
  }

  const segments: SegmentInfo[] = []
  let totalLength = 0

  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i]
    const to = points[i + 1]
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy)

    segments.push({
      length,
      startLength: totalLength
    })

    totalLength += length
  }

  return { segments, totalLength }
}

/// @description Возвращает позицию marker по длине пути.
/// @param {NormalizedPoint[]} points Точки preview пути.
/// @param {SegmentInfo[]} segments Длины сегментов.
/// @param {number} distance Дистанция вдоль всего пути.
/// @returns {NormalizedPoint}
function getMarkerPoint(
  points: NormalizedPoint[],
  segments: SegmentInfo[],
  distance: number
): NormalizedPoint {
  if (points.length === 0) {
    return { x: PREVIEW_WIDTH / 2, y: PREVIEW_HEIGHT / 2 }
  }

  if (points.length === 1 || segments.length === 0) {
    return points[0]
  }

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]
    const from = points[i]
    const to = points[i + 1]

    if (distance <= segment.startLength + segment.length || i === segments.length - 1) {
      const local = segment.length <= 0 ? 0 : (distance - segment.startLength) / segment.length
      const t = Math.max(0, Math.min(1, local))
      return {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t
      }
    }
  }

  return points[points.length - 1]
}

// Компонент показывает безопасный editor-side preview пути.
// Он не зависит от layout canvas и не подменяет реальные room coordinates.
export function FollowPathPreview(props: FollowPathPreviewProps): React.JSX.Element {
  const { points, speedPxPerSecond, title, hint, emptyLabel, worldSpaceLabel } = props

  // Нормализуем входные точки один раз на набор points.
  const normalizedPoints = useMemo(() => normalizePoints(points), [points])

  // Подготавливаем polyline и сегменты для animation marker.
  const { polylinePoints, totalLength, markerPoint, pointBounds } = useMemo(() => {
    const bounds = getPointBounds(points)
    const { segments, totalLength } = buildSegments(normalizedPoints)
    const polylinePoints = normalizedPoints.map((pt) => `${pt.x},${pt.y}`).join(' ')

    return {
      polylinePoints,
      totalLength,
      pointBounds: bounds,
      markerPoint: (distance: number) => getMarkerPoint(normalizedPoints, segments, distance)
    }
  }, [normalizedPoints, points])

  // Храним текущую дистанцию marker вдоль пути.
  const [previewDistance, setPreviewDistance] = useState(0)

  useEffect(() => {
    setPreviewDistance(0)
  }, [points])

  useEffect(() => {
    if (totalLength <= 0) return

    let frameId = 0
    let lastTime = performance.now()
    const speed = Math.max(12, toFiniteNumber(speedPxPerSecond, 60))

    const tick = (time: number) => {
      const deltaSeconds = Math.max(0, (time - lastTime) / 1000)
      lastTime = time

      setPreviewDistance((prev) => {
        const next = prev + speed * deltaSeconds
        return totalLength <= 0 ? 0 : next % totalLength
      })

      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [speedPxPerSecond, totalLength])

  const marker = markerPoint(previewDistance)

  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        border: '1px solid var(--ev-c-gray-3)',
        borderRadius: 10,
        background: 'var(--color-background-soft)'
      }}
    >
      <div className="runtimeSectionTitle">{title}</div>
      <div className="runtimeHint">{hint}</div>

      {points.length === 0 ? (
        <div className="runtimeHint" style={{ marginTop: 6 }}>
          {emptyLabel}
        </div>
      ) : (
        <>
          <svg
            width="100%"
            viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
            style={{
              marginTop: 8,
              borderRadius: 8,
              background: 'var(--color-background)',
              border: '1px solid var(--ev-c-gray-3)'
            }}
          >
            <rect
              x="0"
              y="0"
              width={PREVIEW_WIDTH}
              height={PREVIEW_HEIGHT}
              fill="var(--color-background)"
            />

            {normalizedPoints.length > 1 ? (
              <polyline
                fill="none"
                stroke="var(--ev-c-accent)"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={polylinePoints}
              />
            ) : null}

            {normalizedPoints.map((pt, index) => (
              <g key={`${pt.x}-${pt.y}-${index}`}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={index === 0 ? 6 : 5}
                  fill={index === 0 ? 'var(--ev-c-accent)' : 'var(--color-background-soft)'}
                  stroke="var(--ev-c-accent)"
                  strokeWidth="2"
                />
                <text
                  x={pt.x}
                  y={pt.y - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--ev-c-text-2)"
                >
                  {index}
                </text>
              </g>
            ))}

            <circle cx={marker.x} cy={marker.y} r="4.5" fill="#ffd166" stroke="#8a5a00" strokeWidth="1.2" />
          </svg>

          <div className="runtimeHint" style={{ marginTop: 6 }}>
            {worldSpaceLabel}
            <br />
            x: {Math.round(pointBounds.minX)} → {Math.round(pointBounds.minX + pointBounds.width)}
            <br />
            y: {Math.round(pointBounds.minY)} → {Math.round(pointBounds.minY + pointBounds.height)}
          </div>
        </>
      )}
    </div>
  )
}
