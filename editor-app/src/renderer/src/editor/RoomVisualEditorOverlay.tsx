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
}

// SVG-overlay рисует сетку, path и actor markers поверх canvas.
// Компонент намеренно остаётся stateless, чтобы extraction был максимально безопасным.
export function RoomVisualEditorOverlay({
  meta,
  gridPatternId,
  gridPhaseX,
  gridPhaseY,
  pathGridStep,
  pathEraseRadius,
  actorMarkerRadius,
  showGrid,
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
  getActorSpritePreview
}: RoomVisualEditorOverlayProps) {
  return (
    <svg
      className="roomVisualEditorOverlay"
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
        <g key={`${point.x}-${point.y}-${index}`}>
          <circle className="roomVisualEditorPathPoint" cx={point.x} cy={point.y} r={pathPointRadius} />
          <text className="roomVisualEditorPathPointLabel" x={point.x} y={point.y - 12}>
            {index}
          </text>
        </g>
      ))}

      {/* Preview point работает и для pencil, и для eraser.
          Для eraser радиус берём отдельный, чтобы зона удаления читалась сразу. */}
      {pathPreviewPoint ? (
        <circle
          className={['roomVisualEditorPathPreviewPoint', activeTool === 'eraser' ? 'isEraser' : '']
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
          playPreviewPoint && actor.id === selectedActorId ? playPreviewPoint : { x: actor.x, y: actor.y }
        const spritePreview = getActorSpritePreview(actor)

        return (
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
            {!spritePreview || actor.id === selectedActorId ? (
              <circle
                className={['roomVisualEditorActorMarker', actor.id === selectedActorId ? 'isSelected' : '']
                  .filter(Boolean)
                  .join(' ')}
                cx={displayPoint.x}
                cy={displayPoint.y}
                r={actorMarkerRadius}
              />
            ) : null}
            <text className="roomVisualEditorActorLabel" x={displayPoint.x + 12} y={displayPoint.y - 12}>
              {actor.key}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
