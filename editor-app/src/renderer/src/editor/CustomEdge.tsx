// CustomEdge.tsx — кастомное ребро для React Flow.
// Добавляет: стрелку на конце, hover glow, timing badge с фоном.
// Подключается через edgeTypes в FlowCanvas.

import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
  type EdgeProps
} from '@xyflow/react'

// SVG marker id для стрелки — единый для всего приложения.
export const CUSTOM_EDGE_MARKER_ID = 'undefscene-arrowhead'

// Компонент SVG-маркера, который нужно вставить один раз в <defs>.
// Рендерится через ReactFlowProvider → не надо вставлять в каждое ребро.
export function ArrowheadDefs(): React.JSX.Element {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }}>
      <defs>
        {/* Стандартная стрелка — цвет задаётся через fill="context-stroke" */}
        <marker
          id={CUSTOM_EDGE_MARKER_ID}
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L8,3 z" fill="context-stroke" />
        </marker>
        {/* Акцентная стрелка (selected / hover) */}
        <marker
          id={`${CUSTOM_EDGE_MARKER_ID}-accent`}
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L8,3 z" fill="context-stroke" />
        </marker>
      </defs>
    </svg>
  )
}

// Кастомный тип ребра — подменяем дефолтный React Flow bezier.
const CustomEdgeInner = memo(function CustomEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
  style = {},
  markerEnd: _markerEnd  // игнорируем дефолтный, ставим свой
}: EdgeProps): React.JSX.Element {
  const targetInset = 10
  const adjustedTargetX = targetPosition === Position.Left
    ? targetX - targetInset
    : targetPosition === Position.Right
      ? targetX + targetInset
      : targetX
  const adjustedTargetY = targetPosition === Position.Top
    ? targetY - targetInset
    : targetPosition === Position.Bottom
      ? targetY + targetInset
      : targetY

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX: adjustedTargetX,
    targetY: adjustedTargetY,
    targetPosition
  })

  const isInternalPair = (data as Record<string, unknown> | undefined)?.isInternalPair === true
  const timingLabel = (data as Record<string, unknown> | undefined)?.timingLabel as string | undefined

  // Цвета: акцентный если выбрано, стандартный иначе.
  const strokeColor = selected
    ? 'var(--ev-c-accent)'
    : 'var(--edge-default, hsl(220, 10%, 35%))'

  const markerUrl = `url(#${CUSTOM_EDGE_MARKER_ID})`

  // Пунктир для internal pair-рёбер (parallel).
  const pairStyle: React.CSSProperties = isInternalPair
    ? { strokeDasharray: '6 4', opacity: 0.35 }
    : {}

  // Hover glow через filter.
  const glowFilter = selected
    ? 'drop-shadow(0 0 3px var(--ev-c-accent))'
    : undefined

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          ...pairStyle,
          stroke: strokeColor,
          strokeWidth: selected ? 2.5 : 1.8,
          filter: glowFilter,
          transition: 'stroke 0.15s, stroke-width 0.15s, filter 0.15s'
        }}
        markerEnd={isInternalPair ? undefined : markerUrl}
      />

      {/* Timing badge */}
      {timingLabel && !isInternalPair && (
        <EdgeLabelRenderer>
          <div
            className="edgeTimingBadge nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none'
            }}
          >
            {timingLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

export const CustomEdge = CustomEdgeInner
