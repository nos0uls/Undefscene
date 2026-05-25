import { memo } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { RoomVisualEditorOverlay } from './RoomVisualEditorOverlay'
import type { VisualEditorActorPreview, LoadedActorSpritePreview, RoomScreenshotBundle } from './RoomVisualEditorTypes'

type RoomVisualEditorViewportProps = {
  viewportRef: React.RefObject<HTMLDivElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  zoom: number
  offset: { x: number; y: number }
  activeTool: 'select' | 'pencil' | 'eraser' | null
  isActorPlacementMode: boolean
  bundle: RoomScreenshotBundle | null
  gridPatternId: string
  gridPhaseX: number
  gridPhaseY: number
  PATH_GRID_STEP: number
  PATH_ERASE_RADIUS: number
  ACTOR_MARKER_RADIUS: number
  visualEditorShowGrid: boolean
  draftPathPoints: Array<{ x: number; y: number }>
  draftPathPolyline: string
  draftPathPreviewPolyline: string
  pathPreviewPoint: { x: number; y: number } | null
  pathLineStrokeWidth: number
  pathPreviewStrokeWidth: number
  pathPointRadius: number
  pathPreviewPointRadius: number
  draftActors: VisualEditorActorPreview[]
  selectedActorId: string | null
  playPreviewPoint: { x: number; y: number } | null
  getActorSpritePreview: (actor: VisualEditorActorPreview) => LoadedActorSpritePreview | null
  preferences: {
    liquidGlassEnabled: boolean
    liquidGlassBlur: number
    visualEditorShowPathLabels: boolean
  }
  handleViewportPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  handleViewportPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  handleViewportPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void
  handleViewportPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void
  handleViewportPointerLeave: () => void
  handleViewportWheel: (event: ReactWheelEvent<HTMLDivElement>) => void
  handleViewportClick: (event: ReactPointerEvent<HTMLDivElement>) => void
}

export const RoomVisualEditorViewport = memo(
  ({
    viewportRef,
    canvasRef,
    zoom,
    offset,
    activeTool,
    isActorPlacementMode,
    bundle,
    gridPatternId,
    gridPhaseX,
    gridPhaseY,
    PATH_GRID_STEP,
    PATH_ERASE_RADIUS,
    ACTOR_MARKER_RADIUS,
    visualEditorShowGrid,
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
    getActorSpritePreview,
    preferences,
    handleViewportPointerDown,
    handleViewportPointerMove,
    handleViewportPointerUp,
    handleViewportPointerCancel,
    handleViewportPointerLeave,
    handleViewportWheel,
    handleViewportClick
  }: RoomVisualEditorViewportProps) => {
    return (
      <div
        ref={viewportRef}
        className={[
          'roomVisualEditorViewport',
          activeTool === 'select' ? 'isSelectMode' : '',
          activeTool === 'pencil' || activeTool === 'eraser' ? 'isPathDrawMode' : '',
          activeTool === 'eraser' ? 'isPathEraseMode' : '',
          isActorPlacementMode ? 'isActorPlacementMode' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onPointerCancel={handleViewportPointerCancel}
        onPointerLeave={handleViewportPointerLeave}
        onWheel={handleViewportWheel}
        onClick={handleViewportClick}
      >
        <div
          className="roomVisualEditorCanvasWrap"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: 'top left'
          }}
        >
          <canvas ref={canvasRef} className="roomVisualEditorCanvas" />

          {/* SVG-overlay вынесен в отдельный component,
              чтобы основной modal был короче и легче читался.
              Логику pointer/state мы при этом не меняем. */}
          {bundle?.meta ? (
            <RoomVisualEditorOverlay
              meta={bundle.meta}
              gridPatternId={gridPatternId}
              gridPhaseX={gridPhaseX}
              gridPhaseY={gridPhaseY}
              pathGridStep={PATH_GRID_STEP}
              pathEraseRadius={PATH_ERASE_RADIUS}
              actorMarkerRadius={ACTOR_MARKER_RADIUS}
              showGrid={visualEditorShowGrid}
              draftPathPoints={draftPathPoints}
              draftPathPolyline={draftPathPolyline}
              draftPathPreviewPolyline={draftPathPreviewPolyline}
              pathPreviewPoint={pathPreviewPoint}
              pathLineStrokeWidth={pathLineStrokeWidth}
              pathPreviewStrokeWidth={pathPreviewStrokeWidth}
              pathPointRadius={pathPointRadius}
              pathPreviewPointRadius={pathPreviewPointRadius}
              draftActors={draftActors}
              selectedActorId={selectedActorId}
              playPreviewPoint={playPreviewPoint}
              activeTool={activeTool}
              getActorSpritePreview={getActorSpritePreview}
              liquidGlassEnabled={preferences.liquidGlassEnabled}
              liquidGlassBlur={preferences.liquidGlassBlur}
              showPathLabels={preferences.visualEditorShowPathLabels}
            />
          ) : null}
        </div>
      </div>
    )
  }
)

RoomVisualEditorViewport.displayName = 'RoomVisualEditorViewport'
