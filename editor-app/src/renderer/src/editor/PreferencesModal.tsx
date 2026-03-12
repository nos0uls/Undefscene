// PreferencesModal.tsx — Модалка настроек редактора.
// Открывается из File → Preferences. Закрывается по Esc или кнопке Close.

import { useEffect, useRef } from 'react'
import { useTheme, type ThemeId } from './useTheme'
import type { EditorPreferences } from './usePreferences'
import { type AccentColorId } from './usePreferences'

// Пресеты акцентных цветов с HEX-значениями.
const ACCENT_PRESETS: Array<{ id: AccentColorId; label: string; hex: string }> = [
  { id: 'purple', label: 'Purple', hex: '#5e6ad2' },
  { id: 'cyan', label: 'Cyan', hex: '#00c8ff' },
  { id: 'blue', label: 'Blue', hex: '#4a8fd9' },
  { id: 'green', label: 'Green', hex: '#3cb371' },
  { id: 'orange', label: 'Orange', hex: '#e6a020' },
  { id: 'red', label: 'Red', hex: '#d9534f' },
  { id: 'pink', label: 'Pink', hex: '#d94a8c' },
  { id: 'yellow', label: 'Yellow', hex: '#e6c820' }
]

// Пропсы модалки.
type PreferencesModalProps = {
  // Показана ли модалка.
  open: boolean

  // Текущие настройки. Они приходят сверху, чтобы весь editor читал один и тот же state.
  preferences: EditorPreferences

  // Обновление настроек тоже приходит сверху, чтобы zoom/accent сразу влияли на основной UI.
  updatePreferences: (patch: Partial<EditorPreferences>) => void

  // Закрыть модалку.
  onClose: () => void
}

// Модальное окно с настройками редактора.
export function PreferencesModal({
  open,
  preferences,
  updatePreferences,
  onClose
}: PreferencesModalProps): React.JSX.Element | null {
  // Ссылка на overlay, чтобы ловить клики "снаружи".
  const overlayRef = useRef<HTMLDivElement | null>(null)

  // Хук для управления темой (сохраняется в localStorage).
  const { theme, setTheme, themes } = useTheme()

  // Закрытие по Esc.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="prefsOverlay"
      // Клик по overlay (не по содержимому) — закрываем.
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div className="prefsModal">
        {/* Заголовок */}
        <div className="prefsHeader">
          <span className="prefsTitle">Preferences</span>
          <button className="prefsCloseBtn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Содержимое */}
        <div className="prefsBody">
          {/* --- Секция Appearance --- */}
          <div className="prefsSection">
            <div className="prefsSectionTitle">Appearance</div>
            <label className="prefsField">
              <span>Theme</span>
              <select
                className="prefsInput"
                value={theme}
                onChange={(e) => setTheme(e.target.value as ThemeId)}
              >
                {themes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="prefsHint">{themes.find((t) => t.id === theme)?.description ?? ''}</div>

            {/* Акцентный цвет */}
            <label className="prefsField">
              <span>Accent Color</span>
              <select
                className="prefsInput"
                value={preferences.accentColor}
                onChange={(e) => updatePreferences({ accentColor: e.target.value as AccentColorId })}
              >
                {ACCENT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">Custom...</option>
              </select>
            </label>

            {/* Custom HEX input (показываем только если выбран custom) */}
            {preferences.accentColor === 'custom' && (
              <label className="prefsField">
                <span>Custom HEX</span>
                <input
                  className="prefsInput"
                  type="color"
                  value={preferences.customAccentHex}
                  onChange={(e) => updatePreferences({ customAccentHex: e.target.value })}
                />
              </label>
            )}
          </div>

          {/* --- Секция Canvas --- */}
          <div className="prefsSection">
            <div className="prefsSectionTitle">Canvas</div>
            <label className="prefsField">
              <span>Grid Size</span>
              <input
                className="prefsInput"
                type="number"
                value={preferences.gridSize}
                min={8}
                max={64}
                onChange={(e) => updatePreferences({ gridSize: Number(e.target.value) })}
              />
            </label>
            <label className="prefsField">
              <span>Zoom Speed</span>
              <input
                className="prefsInput"
                type="number"
                step={0.1}
                min={0.5}
                max={5}
                value={preferences.zoomSpeed}
                onChange={(e) => updatePreferences({ zoomSpeed: Number(e.target.value) })}
              />
            </label>
            <label className="prefsField prefsCheckbox">
              <input
                type="checkbox"
                checked={preferences.showMiniMap}
                onChange={(e) => updatePreferences({ showMiniMap: e.target.checked })}
              />
              <span>Show MiniMap</span>
            </label>
            <label className="prefsField prefsCheckbox">
              <input
                type="checkbox"
                checked={preferences.showNodeNameOnCanvas}
                onChange={(e) => updatePreferences({ showNodeNameOnCanvas: e.target.checked })}
              />
              <span>Show node name on canvas</span>
            </label>
            <label className="prefsField">
              <span>Parallel branch ports</span>
              <select
                className="prefsInput"
                value={preferences.parallelBranchPortMode}
                onChange={(e) =>
                  updatePreferences({
                    parallelBranchPortMode: e.target.value as 'shared' | 'separate'
                  })
                }
              >
                <option value="shared">Shared single port</option>
                <option value="separate">Separate ports per branch</option>
              </select>
            </label>
            <label className="prefsField prefsCheckbox">
              <input
                type="checkbox"
                checked={preferences.showDockDropPreview}
                onChange={(e) => updatePreferences({ showDockDropPreview: e.target.checked })}
              />
              <span>Show dock drop preview</span>
            </label>
          </div>

          {/* --- Секция Editor --- */}
          <div className="prefsSection">
            <div className="prefsSectionTitle">Editor</div>
            <label className="prefsField prefsCheckbox">
              <input
                type="checkbox"
                checked={preferences.autoSaveEnabled}
                onChange={(e) => updatePreferences({ autoSaveEnabled: e.target.checked })}
              />
              <span>Auto-save enabled</span>
            </label>
            <label className="prefsField">
              <span>Auto-save interval (min)</span>
              <input
                className="prefsInput"
                type="number"
                min={1}
                max={120}
                value={preferences.autoSaveIntervalMinutes}
                onChange={(e) => updatePreferences({ autoSaveIntervalMinutes: Number(e.target.value) })}
                disabled={!preferences.autoSaveEnabled}
              />
            </label>
            <label className="prefsField">
              <span>Language</span>
              <select
                className="prefsInput"
                value={preferences.language}
                disabled
                title="Coming in future version"
              >
                <option value="en">English</option>
                <option value="ru">Русский</option>
              </select>
            </label>
            <div className="prefsHint">Language switching coming in a future version.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
