import { memo } from 'react'

// Этот компонент отвечает только за SVG-overlay поверх stitched room preview.
// Здесь нет pointer logic, state sync или IPC — только чистый render visual layers.

type RoomVisualEditorOverlayMeta = {
  room_width: number
  room_height: number
}

// Один actor marker в overlay.
// Храним только те поля, которые реально нужны для отрисовки.
type RoomVisualEditorOverlayActor = {
  id: string
  key: string
  x: number
  y: number
  spriteOrObject: string
  isVirtual?: boolean
}

// Данные sprite preview уже готовы к прямой отрисовке в SVG image.
// Это упрощает основной modal и не заставляет overlay знать про IPC.
type RoomVisualEditorOverlaySpritePreview = {
  dataUrl: string
  width: number
  height: number
  xorigin: number
  yorigin: number
}

// Path point component с memo для предотвращения лишних ререндеров
type PathPointProps = {
  x: number
  y: number
  radius: number
  showLabel: boolean
  index: number
}

const PathPoint = memo(
  ({ x, y, radius, showLabel, index }: PathPointProps): React.JSX.Element => (
    <g key={`${x}-${y}-${index}`}>
      <circle className="roomVisualEditorPathPoint" cx={x} cy={y} r={radius} />
      {showLabel && (
        <text className="roomVisualEditorPathPointLabel" x={x} y={y - 12}>
          {index}
        </text>
      )}
    </g>
  )
)

PathPoint.displayName = 'PathPoint'

// Actor marker component с memo для предотвращения лишних ререндеров
type ActorMarkerProps = {
  actor: RoomVisualEditorOverlayActor
  spritePreview: RoomVisualEditorOverlaySpritePreview | null
  displayPoint: { x: number; y: number }
  isSelected: boolean
  markerRadius: number
}

const ActorMarker = memo(
  ({
    actor,
    spritePreview,
    displayPoint,
    isSelected,
    markerRadius
  }: ActorMarkerProps): React.JSX.Element => (
    <g key={actor.id}>
      {spritePreview ? (
        <image
          className="roomVisualEditorActorSprite"
          href={spritePreview.dataUrl}
          x={displayPoint.x - spritePreview.xorigin}
          y={displayPoint.y - spritePreview.yorigin}
          width={spritePreview.width}
          height={spritePreview.height}
          preserveAspectRatio="none"
        />
      ) : null}
      {!spritePreview || isSelected ? (
        <circle
          className={['roomVisualEditorActorMarker', isSelected ? 'isSelected' : '']
            .filter(Boolean)
            .join(' ')}
          cx={displayPoint.x}
          cy={displayPoint.y}
          r={markerRadius}
        />
      ) : null}
      <text className="roomVisualEditorActorLabel" x={displayPoint.x + 12} y={displayPoint.y - 12}>
        {actor.key}
      </text>
    </g>
  )
)

ActorMarker.displayName = 'ActorMarker'

// Пропсы overlay держим плоскими и явными.
// Так безопаснее переносить уже существующий render-блок без смены поведения.
type RoomVisualEditorOverlayProps = {
  meta: RoomVisualEditorOverlayMeta
  gridPatternId: string
  gridPhaseX: number
  gridPhaseY: number
  pathGridStep: number
  pathEraseRadius: number
  actorMarkerRadius: number
  showGrid: boolean
  showPathLabels: boolean
  draftPathPoints: Array<{ x: number; y: number }>
  draftPathPolyline: string
  draftPathPreviewPolyline: string
  pathPreviewPoint: { x: number; y: number } | null
  pathLineStrokeWidth: number
  pathPreviewStrokeWidth: number
  pathPointRadius: number
  pathPreviewPointRadius: number
  draftActors: RoomVisualEditorOverlayActor[]
  selectedActorId: string | null
  playPreviewPoint: { x: number; y: number } | null
  activeTool: 'select' | 'pencil' | 'eraser' | null
  getActorSpritePreview: (
    actor: RoomVisualEditorOverlayActor
  ) => RoomVisualEditorOverlaySpritePreview | null
  liquidGlassEnabled: boolean
  liquidGlassBlur: number
}

// SVG-overlay рисует сетку, path и actor markers поверх canvas.
// Компонент намеренно остаётся stateless, чтобы extraction был максимально безопасным.
export const RoomVisualEditorOverlay = memo(
  ({
    meta,
    gridPatternId,
    gridPhaseX,
    gridPhaseY,
    pathGridStep,
    pathEraseRadius,
    actorMarkerRadius,
    showGrid,
    showPathLabels,
    draftPathPoints,
    draftPathPolyline,
    draftPathPreviewPolyline,
    pathPreviewPoint,
    pathLineStrokeWidth,
    pathPreviewStrokeWidth,
    pathPointRadius,
    pathPreviewPointRadius,
    draftActors,
    selectedActorId,
    playPreviewPoint,
    activeTool,
    getActorSpritePreview,
    liquidGlassEnabled,
    liquidGlassBlur
  }: RoomVisualEditorOverlayProps): React.JSX.Element => {
    const arrowId = `arrow-${gridPatternId}`

    return (
      <svg
        className={['roomVisualEditorOverlay', liquidGlassEnabled ? 'isLiquidGlass' : '']
          .filter(Boolean)
          .join(' ')}
        style={
          {
            '--liquid-glass-blur': liquidGlassEnabled ? `${liquidGlassBlur * 12}px` : '0px'
          } as React.CSSProperties
        }
        width={meta.room_width}
        height={meta.room_height}
        viewBox={`0 0 ${meta.room_width} ${meta.room_height}`}
      >
        <defs>
          <pattern
            id={gridPatternId}
            x={gridPhaseX}
            y={gridPhaseY}
            width={pathGridStep}
            height={pathGridStep}
            patternUnits="userSpaceOnUse"
          >
            <path
              className="roomVisualEditorGridPattern"
              d={`M ${pathGridStep} 0 L 0 0 0 ${pathGridStep}`}
            />
          </pattern>

          <marker
            id={arrowId}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255, 209, 102, 0.8)" />
          </marker>
        </defs>

        {/* Видимая сетка помогает сверять snap phase с реальной комнатой. */}
        {showGrid ? (
          <rect
            className="roomVisualEditorGridRect"
            x={0}
            y={0}
            width={meta.room_width}
            height={meta.room_height}
            fill={`url(#${gridPatternId})`}
          />
        ) : null}

        {/* Основная линия path появляется только когда уже есть хотя бы один сегмент. */}
        {draftPathPoints.length > 1 ? (
          <polyline
            className="roomVisualEditorPathLine"
            fill="none"
            points={draftPathPolyline}
            strokeWidth={pathLineStrokeWidth}
            markerEnd={`url(#${arrowId})`}
          />
        ) : null}

        {/* Preview-сегмент показывает будущую линию до отпускания кнопки мыши. */}
        {draftPathPreviewPolyline ? (
          <polyline
            className="roomVisualEditorPathPreviewLine"
            fill="none"
            points={draftPathPreviewPolyline}
            strokeWidth={pathPreviewStrokeWidth}
          />
        ) : null}

        {/* Каждую точку path рисуем отдельно, чтобы сохранить индексы и визуальные labels. */}
        {draftPathPoints.map((point, index) => (
          <PathPoint
            key={`${point.x}-${point.y}-${index}`}
            x={point.x}
            y={point.y}
            radius={pathPointRadius}
            showLabel={showPathLabels}
            index={index}
          />
        ))}

        {/* Preview point работает и для pencil, и для eraser.
            Для eraser радиус берём отдельный, чтобы зона удаления читалась сразу. */}
        {pathPreviewPoint ? (
          <circle
            className={[
              'roomVisualEditorPathPreviewPoint',
              activeTool === 'eraser' ? 'isEraser' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            cx={pathPreviewPoint.x}
            cy={pathPreviewPoint.y}
            r={activeTool === 'eraser' ? pathEraseRadius : pathPreviewPointRadius}
          />
        ) : null}

        {/* Actor layer рисует sprite preview, marker выделения и label key.
            Select tool по-прежнему работает только по actor markers в основном modal logic. */}
        {draftActors.map((actor) => {
          const displayPoint =
            playPreviewPoint && actor.id === selectedActorId
              ? playPreviewPoint
              : { x: actor.x, y: actor.y }
          const spritePreview = getActorSpritePreview(actor)

          return (
            <ActorMarker
              key={actor.id}
              actor={actor}
              spritePreview={spritePreview}
              displayPoint={displayPoint}
              isSelected={actor.id === selectedActorId}
              markerRadius={actorMarkerRadius}
            />
          )
        })}
      </svg>
    )
  }
)

RoomVisualEditorOverlay.displayName = 'RoomVisualEditorOverlay'
