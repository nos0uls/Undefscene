// PreferencesCanvasSection.tsx — Секция настроек холста (сетка, зум, миникарта, фон).

import React from 'react'
import type { EditorPreferences } from './usePreferences'

// Пропсы секции Canvas.
type PreferencesCanvasSectionProps = {
  preferences: EditorPreferences
  updatePreferences: (patch: Partial<EditorPreferences>) => void
  t: (key: string, fallback?: string) => string
}

// Секция настроек холста.
export const PreferencesCanvasSection = React.memo(function PreferencesCanvasSection({
  preferences,
  updatePreferences,
  t
}: PreferencesCanvasSectionProps): React.JSX.Element {
  return (
    <div className="prefsSection">
      <div className="prefsSectionSep">
        <span className="prefsSectionTitle">{t('preferences.canvas', 'Canvas')}</span>
      </div>
      <label className="prefsField">
        <span>{t('preferences.gridSize', 'Grid Size')}</span>
        <input
          className="prefsInput"
          type="number"
          value={preferences.gridSize}
          min={8}
          max={64}
          onChange={(e) => {
            const val = Number(e.target.value)
            if (!isNaN(val)) updatePreferences({ gridSize: val })
          }}
        />
      </label>
      <div className="prefsHint">
        {t('preferences.gridSizeHint', 'Changes only the visible grid step on the canvas.')}
      </div>
      <label className="prefsField">
        <span>{t('preferences.zoomSpeed', 'Zoom Speed')}</span>
        <input
          className="prefsInput"
          type="number"
          step={0.1}
          min={0.5}
          max={10}
          value={preferences.zoomSpeed}
          onChange={(e) => {
            const val = Number(e.target.value)
            if (!isNaN(val)) updatePreferences({ zoomSpeed: val })
          }}
        />
      </label>
      <label className="prefsField">
        <span>{t('preferences.miniMapNodeThreshold', 'MiniMap node threshold')}</span>
        <input
          type="number"
          className="prefsInput"
          style={{ width: 80 }}
          value={preferences.miniMapNodeThreshold}
          onChange={(e) => {
            const val = Number(e.target.value)
            if (!isNaN(val)) updatePreferences({ miniMapNodeThreshold: val })
          }}
        />
        <span className="prefsFieldHint">
          {t(
            'preferences.miniMapNodeThresholdHint',
            '0 = off, -1 = always on, >0 = hide if nodes exceed this count'
          )}
        </span>
      </label>
      <label className="prefsField prefsCheckbox">
        <input
          type="checkbox"
          checked={preferences.showNodeNameOnCanvas}
          onChange={(e) => updatePreferences({ showNodeNameOnCanvas: e.target.checked })}
        />
        <span>{t('preferences.showNodeNameOnCanvas', 'Show node name on canvas')}</span>
      </label>
      <label className="prefsField">
        <span>{t('preferences.parallelBranchPorts', 'Parallel branch ports')}</span>
        <select
          className="prefsInput"
          value={preferences.parallelBranchPortMode}
          onChange={(e) =>
            updatePreferences({
              parallelBranchPortMode: e.target.value as 'shared' | 'separate'
            })
          }
        >
          <option value="shared">{t('preferences.sharedSinglePort', 'Shared single port')}</option>
          <option value="separate">
            {t('preferences.separatePortsPerBranch', 'Separate ports per branch')}
          </option>
        </select>
      </label>
      <label className="prefsField prefsCheckbox">
        <input
          type="checkbox"
          checked={preferences.showDockDropPreview}
          onChange={(e) => updatePreferences({ showDockDropPreview: e.target.checked })}
        />
        <span>{t('preferences.showDockDropPreview', 'Show dock drop preview')}</span>
      </label>
      <label className="prefsField">
        <span>{t('preferences.backgroundImage', 'Background Image')}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="runtimeButton"
            type="button"
            onClick={() => {
              if (!window.api?.preferences?.chooseCanvasBackground) {
                console.warn('Preferences API not available')
                return
              }

              window.api.preferences
                .chooseCanvasBackground()
                .then((filePath) => {
                  if (!filePath) return
                  updatePreferences({ canvasBackgroundPath: filePath })
                })
                .catch((err) => {
                  console.warn('Failed to choose canvas background:', err)
                })
            }}
          >
            {t('preferences.chooseFile', 'Choose File')}
          </button>
          <button
            className="runtimeButton"
            type="button"
            onClick={() => updatePreferences({ canvasBackgroundPath: null })}
            disabled={!preferences.canvasBackgroundPath}
          >
            {t('preferences.clear', 'Clear')}
          </button>
        </div>
      </label>
      {preferences.canvasBackgroundPath ? (
        <div
          className="prefsHint"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          title={preferences.canvasBackgroundPath}
        >
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'var(--accent-default)',
              flexShrink: 0
            }}
          />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {preferences.canvasBackgroundPath.split(/[\\/]/).pop()}
          </span>
        </div>
      ) : (
        <div className="prefsHint">
          {t('preferences.noBackgroundSelected', 'No background image selected.')}
        </div>
      )}
      <label className="prefsField">
        <span>{t('preferences.backgroundAttachment', 'Background Attachment')}</span>
        <select
          className="prefsInput"
          value={preferences.canvasBackgroundAttachment}
          onChange={(e) =>
            updatePreferences({
              canvasBackgroundAttachment: e.target.value as 'canvas' | 'viewport'
            })
          }
          disabled={!preferences.canvasBackgroundPath}
        >
          <option value="canvas">
            {t('preferences.backgroundAttachmentCanvas', 'Attach to canvas')}
          </option>
          <option value="viewport">
            {t('preferences.backgroundAttachmentViewport', 'Attach to viewport')}
          </option>
        </select>
      </label>
      <label className="prefsField">
        <span>{t('preferences.backgroundMode', 'Background Mode')}</span>
        <select
          className="prefsInput"
          value={preferences.canvasBackgroundMode}
          onChange={(e) =>
            updatePreferences({
              canvasBackgroundMode: e.target.value as 'stretch' | 'cover'
            })
          }
          disabled={!preferences.canvasBackgroundPath}
        >
          <option value="stretch">{t('preferences.stretch', 'Stretch')}</option>
          <option value="cover">{t('preferences.coverCrop', 'Cover (crop)')}</option>
        </select>
      </label>
      {/* Отдельная прозрачность помогает сделать картинку фоном,
          а не визуальной помехой поверх сетки и нод. */}
      <label className="prefsField">
        <span>
          {t('preferences.backgroundOpacity', 'Background Opacity')} (
          {Math.round(preferences.canvasBackgroundOpacity * 100)}%)
        </span>
        <input
          className="prefsInput"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(preferences.canvasBackgroundOpacity * 100)}
          onChange={(e) =>
            updatePreferences({
              canvasBackgroundOpacity: Number(e.target.value) / 100
            })
          }
          disabled={!preferences.canvasBackgroundPath}
        />
      </label>
    </div>
  )
})
