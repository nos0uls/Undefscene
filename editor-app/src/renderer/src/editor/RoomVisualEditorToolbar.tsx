import { memo } from 'react'
import { SearchableSelect } from './SearchableSelect'
import type { VisualEditorSelectedNode, RoomScreenshotBundle } from './RoomVisualEditorTypes'

type RoomVisualEditorToolbarProps = {
  availableRooms: string[]
  selectedRoom: string
  onRoomChange: (value: string) => void
  onRefresh: () => void
  zoomIn: () => void
  zoomOut: () => void
  fitToViewport: () => void
  resetView: () => void
  selectedNode: VisualEditorSelectedNode | null
  projectDir: string | null
  bundle: RoomScreenshotBundle | null
  t: (key: string, fallback: string) => string
}

export const RoomVisualEditorToolbar = memo(
  ({
    availableRooms,
    selectedRoom,
    onRoomChange,
    onRefresh,
    zoomIn,
    zoomOut,
    fitToViewport,
    resetView,
    selectedNode,
    projectDir,
    bundle,
    t
  }: RoomVisualEditorToolbarProps) => {
    return (
      <div className="roomVisualEditorToolbar">
        <label className="runtimeField roomVisualEditorField" style={{ margin: 0, padding: 0 }}>
          <span style={{ minWidth: 60 }}>{t('editor.visualEditingRoom', 'Room')}</span>
          <SearchableSelect
            className="runtimeInput"
            options={availableRooms}
            value={selectedRoom}
            onChange={onRoomChange}
            placeholder={t('editor.visualEditingChooseRoom', 'Choose room...')}
            disabled={availableRooms.length <= 0}
          />
        </label>

        <div className="roomVisualEditorActions">
          <button
            className="runtimeButton"
            type="button"
            onClick={onRefresh}
            disabled={!projectDir || !selectedRoom}
          >
            {t('editor.visualEditingRefresh', 'Refresh')}
          </button>
          <button className="runtimeButton" type="button" onClick={zoomOut} disabled={!bundle?.meta}>
            {t('editor.visualEditingZoomOut', 'Zoom -')}
          </button>
          <button className="runtimeButton" type="button" onClick={zoomIn} disabled={!bundle?.meta}>
            {t('editor.visualEditingZoomIn', 'Zoom +')}
          </button>
          <button className="runtimeButton" type="button" onClick={fitToViewport} disabled={!bundle?.meta}>
            {t('editor.visualEditingFit', 'Fit')}
          </button>
          <button className="runtimeButton" type="button" onClick={resetView} disabled={!bundle?.meta}>
            {t('editor.visualEditingReset', 'Reset')}
          </button>
          {/* Индикатор скорости follow_path — показываем только когда выбрана нода с points. */}
          {selectedNode?.type === 'follow_path' &&
          Array.isArray(selectedNode.params?.points) ? (
            <div
              className="roomVisualEditorSpeedIndicator"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'var(--ev-c-gray-3)',
                color: 'var(--ev-c-text-2)',
                fontSize: '12px',
                marginLeft: '4px',
                whiteSpace: 'nowrap'
              }}
              title={t('editor.pathSpeedTitle', 'Path movement speed (px/sec)')}
            >
              {`Скорость: ${Number(selectedNode.params?.speed_px_sec ?? 60)} px/sec`}
            </div>
          ) : null}
        </div>
      </div>
    )
  }
)

RoomVisualEditorToolbar.displayName = 'RoomVisualEditorToolbar'
