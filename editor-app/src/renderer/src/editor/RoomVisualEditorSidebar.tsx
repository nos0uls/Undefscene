import { memo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type {
  VisualEditorActorPreview,
  VisualEditorSelectedNode,
  RoomScreenshotBundle
} from './RoomVisualEditorTypes'

type RoomVisualEditorSidebarProps = {
  techMode: boolean
  selectedNode: VisualEditorSelectedNode | null
  projectDir: string | null
  isLoading: boolean
  errorMessage: string | null
  bundle: RoomScreenshotBundle | null
  visualEditorShowGrid: boolean
  visualEditorSnapToGrid: boolean
  visualGridOffsetX: number
  visualGridOffsetY: number
  visualPathSizeMultiplier: number
  handleShowGridChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  handleSnapToGridChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  handleGridOffsetXChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  handleGridOffsetYChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  handlePathSizeMultiplierChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  activeTool: 'select' | 'pencil' | 'eraser' | null
  draftPathPoints: Array<{ x: number; y: number }>
  clearDraftPath: () => void
  importDraftPath: () => void
  stopPlayPreview: () => void
  clearTransientInteractionState: () => void
  setActiveTool: Dispatch<SetStateAction<'select' | 'pencil' | 'eraser' | null>>
  setIsActorPlacementMode: Dispatch<SetStateAction<boolean>>
  draftActors: VisualEditorActorPreview[]
  selectedActorId: string | null
  selectedActor: VisualEditorActorPreview | null
  actorOptionEntries: Array<{ id: string; label: string }>
  isActorPlacementMode: boolean
  isPlayPreviewRunning: boolean
  togglePlayPreview: () => void
  hasImportableActors: boolean
  importDraftActors: () => void
  zoom: number
  availableRooms: string[]
  selectedRoom: string
  setSelectedActorId: (id: string | null) => void
  t: (key: string, fallback: string) => string
}

export const RoomVisualEditorSidebar = memo(
  ({
    techMode,
    selectedNode,
    projectDir,
    isLoading,
    errorMessage,
    bundle,
    visualEditorShowGrid,
    visualEditorSnapToGrid,
    visualGridOffsetX,
    visualGridOffsetY,
    visualPathSizeMultiplier,
    handleShowGridChange,
    handleSnapToGridChange,
    handleGridOffsetXChange,
    handleGridOffsetYChange,
    handlePathSizeMultiplierChange,
    activeTool,
    draftPathPoints,
    clearDraftPath,
    importDraftPath,
    stopPlayPreview,
    clearTransientInteractionState,
    setActiveTool,
    setIsActorPlacementMode,
    draftActors,
    selectedActorId,
    selectedActor,
    actorOptionEntries,
    isActorPlacementMode,
    isPlayPreviewRunning,
    togglePlayPreview,
    hasImportableActors,
    importDraftActors,
    zoom,
    availableRooms,
    selectedRoom,
    setSelectedActorId,
    t
  }: RoomVisualEditorSidebarProps) => {
    return (
      <div className="roomVisualEditorSidebar runtimeSection">
        <div className="runtimeSectionTitle">{t('editor.visualEditingInfo', 'Info')}</div>

        <div className="runtimeField roomVisualEditorField">
          <span>{t('editor.visualEditingSelectedNode', 'Selected Node')}</span>
          <code className="roomVisualEditorCode">
            {selectedNode
              ? `${String(selectedNode.name ?? selectedNode.type)} · ${selectedNode.type}`
              : t('editor.visualEditingNoNodeSelected', 'No node selected')}
          </code>
        </div>

        {!projectDir ? (
          <div className="runtimeHint">{t('editor.visualEditingNoProject', 'Open a project.')}</div>
        ) : null}

        {isLoading ? (
          <div className="runtimeHint">
            {t('editor.visualEditingLoading', 'Loading screenshots...')}
          </div>
        ) : null}

        {errorMessage ? <div className="runtimeHint">{errorMessage}</div> : null}

        {bundle?.warning ? <div className="runtimeHint">{bundle.warning}</div> : null}

        {/* Техническая информация о скриншотах: размеры комнаты, сетка тайлов и т.д. */}
        {techMode && bundle?.meta ? (
          <>
            <div className="runtimeField roomVisualEditorField">
              <span>{t('editor.visualEditingRoomSize', 'Room Size')}</span>
              <code className="roomVisualEditorCode">
                {bundle.meta.room_width} × {bundle.meta.room_height}
              </code>
            </div>
            <div className="runtimeField roomVisualEditorField">
              <span>{t('editor.visualEditingGrid', 'Tile Grid')}</span>
              <code className="roomVisualEditorCode">
                {bundle.meta.rows} × {bundle.meta.cols}
              </code>
            </div>
            <div className="runtimeField roomVisualEditorField">
              <span>{t('editor.visualEditingTilesLoaded', 'Tiles Loaded')}</span>
              <code className="roomVisualEditorCode">{bundle.tiles.length}</code>
            </div>
            <div className="runtimeField roomVisualEditorField">
              <span>{t('editor.visualEditingZoomLabel', 'Zoom')}</span>
              <code className="roomVisualEditorCode">{Math.round(zoom * 100)}%</code>
            </div>
          </>
        ) : projectDir && selectedRoom && !isLoading && !bundle?.meta ? (
          <div className="runtimeHint">
            {t('editor.visualEditingNoMeta', 'No room screenshot data found.')}
          </div>
        ) : null}

        {!projectDir ? null : !isLoading && availableRooms.length <= 0 ? (
          <div className="runtimeHint">
            {t('editor.visualEditingNoScreenshotRooms', 'No rooms with screenshots.')}
          </div>
        ) : null}

        <div className="runtimeSectionTitle" style={{ marginTop: 12 }}>
          {t('editor.visualEditingPathTools', 'Path Tools')}
        </div>

        <label
          className="runtimeField"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <input type="checkbox" checked={visualEditorShowGrid} onChange={handleShowGridChange} />
          <span>{t('editor.visualEditingShowGrid', 'Show Grid')}</span>
        </label>

        <label
          className="runtimeField"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <input
            type="checkbox"
            checked={visualEditorSnapToGrid}
            onChange={handleSnapToGridChange}
          />
          <span>{t('editor.visualEditingSnapToGrid', 'Snap to Grid')}</span>
        </label>

        {visualEditorSnapToGrid ? (
          <>
            <div className="runtimeField roomVisualEditorField">
              <span>{t('editor.visualEditingGridOffsetX', 'Grid Offset X')}</span>
              <input
                className="runtimeInput"
                type="number"
                step={1}
                value={visualGridOffsetX}
                onChange={handleGridOffsetXChange}
              />
            </div>

            <div className="runtimeField roomVisualEditorField">
              <span>{t('editor.visualEditingGridOffsetY', 'Grid Offset Y')}</span>
              <input
                className="runtimeInput"
                type="number"
                step={1}
                value={visualGridOffsetY}
                onChange={handleGridOffsetYChange}
              />
            </div>
          </>
        ) : null}

        <div className="runtimeField roomVisualEditorField">
          <span>{t('editor.visualEditingPathSizeMultiplier', 'Path Size Multiplier')}</span>
          <input
            className="runtimeInput"
            type="number"
            min={0.5}
            max={4}
            step={0.1}
            value={visualPathSizeMultiplier}
            onChange={handlePathSizeMultiplierChange}
          />
        </div>

        <div className="roomVisualEditorActions roomVisualEditorSidebarActions">
          <button
            className={['runtimeButton', activeTool === 'pencil' ? 'isActive' : '']
              .filter(Boolean)
              .join(' ')}
            type="button"
            onClick={() => {
              stopPlayPreview()
              clearTransientInteractionState()
              setActiveTool((prev) => (prev === 'pencil' ? null : 'pencil'))
              setIsActorPlacementMode(false)
            }}
          >
            {t('editor.visualEditingPencil', 'Pencil')}
          </button>
          <button
            className={['runtimeButton', activeTool === 'eraser' ? 'isActive' : '']
              .filter(Boolean)
              .join(' ')}
            type="button"
            onClick={() => {
              stopPlayPreview()
              clearTransientInteractionState()
              setActiveTool((prev) => (prev === 'eraser' ? null : 'eraser'))
              setIsActorPlacementMode(false)
            }}
          >
            {t('editor.visualEditingEraser', 'Eraser')}
          </button>
          <button
            className="runtimeButton"
            type="button"
            onClick={clearDraftPath}
            disabled={draftPathPoints.length <= 0}
          >
            {t('editor.visualEditingClearPath', 'Clear Path')}
          </button>
          <button
            className="runtimeButton"
            type="button"
            onClick={importDraftPath}
            disabled={draftPathPoints.length <= 0}
          >
            {t('editor.visualEditingImportPath', 'Import Path')}
          </button>
        </div>

        <div className="runtimeHint">
          {t(
            'editor.visualEditingPathHint',
            'B: Pencil · G: Eraser · Ctrl+E: Import Path · Shift: straight line'
          )}
        </div>

        <div className="runtimeSectionTitle" style={{ marginTop: 12 }}>
          {t('editor.visualEditingActorTools', 'Actor Preview')}
        </div>
        <label className="runtimeField roomVisualEditorField">
          <span>{t('editor.visualEditingActorPicker', 'Actor')}</span>
          <select
            className="runtimeInput"
            value={selectedActorId ?? ''}
            onChange={(event) => {
              const nextActorId = event.target.value.trim()
              setSelectedActorId(nextActorId.length > 0 ? nextActorId : null)
            }}
            disabled={draftActors.length <= 0}
          >
            {draftActors.length <= 0 ? (
              <option value="">{t('editor.visualEditingChooseActor', 'Choose actor...')}</option>
            ) : null}
            {actorOptionEntries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        {draftActors.length <= 0 ? (
          <div className="runtimeHint">
            {t('editor.visualEditingNoActors', 'No actors available.')}
          </div>
        ) : null}

        {selectedActor ? (
          <div className="runtimeField roomVisualEditorField">
            <span>{t('editor.visualEditingActorPosition', 'Actor Position')}</span>
            <code className="roomVisualEditorCode">{`${selectedActor.x}, ${selectedActor.y}`}</code>
          </div>
        ) : null}

        <div className="roomVisualEditorActions roomVisualEditorSidebarActions">
          <button
            className={['runtimeButton', activeTool === 'select' ? 'isActive' : '']
              .filter(Boolean)
              .join(' ')}
            type="button"
            onClick={() => {
              clearTransientInteractionState()
              setActiveTool((prev) => (prev === 'select' ? null : 'select'))
              setIsActorPlacementMode(false)
            }}
            disabled={draftActors.length <= 0}
          >
            {t('editor.visualEditingSelect', 'Select')}
          </button>
          <button
            className={['runtimeButton', isActorPlacementMode ? 'isActive' : '']
              .filter(Boolean)
              .join(' ')}
            type="button"
            onClick={() => {
              stopPlayPreview()
              clearTransientInteractionState()
              setIsActorPlacementMode((prev) => !prev)
            }}
            disabled={!selectedActor}
          >
            {isActorPlacementMode
              ? t('editor.visualEditingStopActorPlacement', 'Stop Placement')
              : t('editor.visualEditingPlaceActor', 'Place Selected Actor')}
          </button>
          <button
            className={['runtimeButton', isPlayPreviewRunning ? 'isActive' : '']
              .filter(Boolean)
              .join(' ')}
            type="button"
            onClick={togglePlayPreview}
            disabled={!selectedActor || draftPathPoints.length < 2}
          >
            {isPlayPreviewRunning
              ? t('editor.visualEditingStopPreview', 'Stop')
              : t('editor.visualEditingPlay', 'Play')}
          </button>
          <button
            className="runtimeButton"
            type="button"
            onClick={importDraftActors}
            disabled={!hasImportableActors}
          >
            {t('editor.visualEditingImportActors', 'Import Actors')}
          </button>
        </div>

        {selectedActor ? (
          <div className="runtimeHint">
            {t(
              'editor.visualEditingActorHint',
              'Select an actor, place it on the room, then import actors when ready.'
            )}
          </div>
        ) : null}
      </div>
    )
  }
)

RoomVisualEditorSidebar.displayName = 'RoomVisualEditorSidebar'
