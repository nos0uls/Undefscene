// PreferencesModal.tsx — Модалка настроек редактора.
// Открывается из File → Preferences. Закрывается по Esc или кнопке Close.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme, type ThemeId } from './useTheme'
import type { EditorPreferences, HotkeyActionId } from './usePreferences'
import { DEFAULT_KEYBINDINGS, HOTKEY_ACTION_IDS, type AccentColorId } from './usePreferences'
import {
  comboFromEvent,
  formatComboForDisplay,
  isModifierOnlyEvent,
  normalizeCombo
} from './useHotkeys'
import { createTranslator } from '../i18n'

// Читаемые названия hotkey-действий.
// Пока держим их рядом с modal, потому что это основной экран для ребинда.
const HOTKEY_LABELS: Record<HotkeyActionId, { en: string; ru: string }> = {
  undo: { en: 'Undo', ru: 'Отмена' },
  redo: { en: 'Redo', ru: 'Повтор' },
  save: { en: 'Save', ru: 'Сохранить' },
  new_scene: { en: 'New Scene', ru: 'Новая сцена' },
  export_scene: { en: 'Export Scene', ru: 'Экспорт сцены' },
  toggle_inspector: { en: 'Toggle Inspector', ru: 'Показать / скрыть Inspector' },
  focus_left_dock: { en: 'Focus Left Dock', ru: 'Фокус на левый dock' },
  focus_right_dock: { en: 'Focus Right Dock', ru: 'Фокус на правый dock' },
  focus_bottom_dock: { en: 'Focus Bottom Dock', ru: 'Фокус на нижний dock' },
  toggle_all_dock_panels: { en: 'Toggle All Dock Panels', ru: 'Свернуть / развернуть все dock-панели' },
  fit_view: { en: 'Fit View', ru: 'Уместить граф' },
  zen_mode: { en: 'Zen Mode', ru: 'Zen mode' }
}

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

  // Какой hotkey мы сейчас перезаписываем.
  // null = режим capture не активен.
  const [capturingActionId, setCapturingActionId] = useState<HotkeyActionId | null>(null)

  // Хук для управления темой (сохраняется в localStorage).
  const { theme, setTheme, themes } = useTheme()

  // Простой runtime translator. Переключается сразу вместе с preferences.language.
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])

  // Название действия под текущий язык.
  const getHotkeyLabel = (actionId: HotkeyActionId): string => HOTKEY_LABELS[actionId][preferences.language]

  // Применяем новый combo так, чтобы одинаковое сочетание не осталось висеть
  // сразу на нескольких действиях. Иначе editor выполнит только первое совпадение,
  // а пользователь не поймёт, почему rebinding "сломался".
  const applyKeybindingChange = useCallback(
    (actionId: HotkeyActionId, combo: string): void => {
      const normalizedCombo = normalizeCombo(combo)
      const nextKeybindings = { ...preferences.keybindings }

      if (normalizedCombo) {
        for (const currentActionId of HOTKEY_ACTION_IDS) {
          if (currentActionId === actionId) continue
          if (normalizeCombo(nextKeybindings[currentActionId] ?? '') === normalizedCombo) {
            nextKeybindings[currentActionId] = ''
          }
        }
      }

      nextKeybindings[actionId] = normalizedCombo
      updatePreferences({ keybindings: nextKeybindings })
    },
    [preferences.keybindings, updatePreferences]
  )

  // Закрытие по Esc.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      // Если идёт capture нового сочетания, Escape отменяет только capture,
      // а не закрывает всю модалку.
      if (capturingActionId) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setCapturingActionId(null)
        }
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [capturingActionId, open, onClose])

  // Когда выбран режим capture, перехватываем ближайшее сочетание.
  useEffect(() => {
    if (!open || !capturingActionId) return

    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        setCapturingActionId(null)
        return
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        applyKeybindingChange(capturingActionId, '')
        setCapturingActionId(null)
        return
      }

      if (isModifierOnlyEvent(event)) {
        return
      }

      const nextCombo = normalizeCombo(comboFromEvent(event))
      applyKeybindingChange(capturingActionId, nextCombo)
      setCapturingActionId(null)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [applyKeybindingChange, capturingActionId, open])

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
          <span className="prefsTitle">{t('app.preferences', 'Preferences')}</span>
          <button className="prefsCloseBtn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Содержимое */}
        <div className="prefsBody">
          {/* --- Секция General ---
              Сюда выносим самые частые настройки,
              чтобы язык и тема были видны сразу при открытии modal. */}
          <div className="prefsSection">
            <div className="prefsSectionTitle">{t('preferences.general', 'General')}</div>
            <label className="prefsField">
              <span>{t('preferences.language', 'Language')}</span>
              <select
                className="prefsInput"
                value={preferences.language}
                onChange={(e) => updatePreferences({ language: e.target.value as 'en' | 'ru' })}
              >
                <option value="en">English</option>
                <option value="ru">Русский</option>
              </select>
            </label>
            <label className="prefsField">
              <span>{t('preferences.theme', 'Theme')}</span>
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
              <span>{t('preferences.accentColor', 'Accent Color')}</span>
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
                <option value="custom">{preferences.language === 'ru' ? 'Свой...' : 'Custom...'}</option>
              </select>
            </label>

            {/* Custom HEX input (показываем только если выбран custom) */}
            {preferences.accentColor === 'custom' && (
              <label className="prefsField">
                <span>{t('preferences.customHex', 'Custom HEX')}</span>
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
            <div className="prefsSectionTitle">{t('preferences.canvas', 'Canvas')}</div>
            <label className="prefsField">
              <span>{t('preferences.gridSize', 'Grid Size')}</span>
              <input
                className="prefsInput"
                type="number"
                value={preferences.gridSize}
                min={8}
                max={64}
                onChange={(e) => updatePreferences({ gridSize: Number(e.target.value) })}
              />
            </label>
            <div className="prefsHint">
              {t('preferences.gridSizeHint', 'Canvas grid spacing.')}
            </div>
            <label className="prefsField">
              <span>{t('preferences.zoomSpeed', 'Zoom Speed')}</span>
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
              <span>{t('preferences.showMiniMap', 'Show MiniMap')}</span>
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
                <option value="separate">{t('preferences.separatePortsPerBranch', 'Separate ports per branch')}</option>
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
            {!preferences.canvasBackgroundPath ? (
              <div className="prefsHint">
                {t('preferences.noBackgroundSelected', 'No background image selected.')}
              </div>
            ) : null}
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
                  {t('preferences.backgroundAttachmentViewport', 'Fix to screen')}
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
                {t('preferences.backgroundOpacity', 'Background Opacity')} ({Math.round(
                  preferences.canvasBackgroundOpacity * 100
                )}%)
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

          {/* --- Секция Editor --- */}
          <div className="prefsSection">
            <div className="prefsSectionTitle">{t('preferences.editor', 'Editor')}</div>
            <label className="prefsField prefsCheckbox">
              <input
                type="checkbox"
                checked={preferences.autoSaveEnabled}
                onChange={(e) => updatePreferences({ autoSaveEnabled: e.target.checked })}
              />
              <span>{t('preferences.autoSaveEnabled', 'Auto-save enabled')}</span>
            </label>
            <label className="prefsField">
              <span>{t('preferences.autoSaveInterval', 'Auto-save interval (min)')}</span>
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

            {/* Папка screenshot output помогает явно связать editor и внешний runner.
                Если override пустой, editor продолжает искать screenshots по своим fallback-путям. */}
            <label className="prefsField">
              <span>{t('preferences.screenshotOutputFolder', 'Screenshot Output Folder')}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="runtimeButton"
                  type="button"
                  onClick={() => {
                    if (!window.api?.preferences?.chooseScreenshotOutputDir) {
                      console.warn('Preferences API not available')
                      return
                    }

                    window.api.preferences
                      .chooseScreenshotOutputDir()
                      .then((dirPath) => {
                        if (!dirPath) return
                        updatePreferences({ screenshotOutputDir: dirPath })
                      })
                      .catch((err) => {
                        console.warn('Failed to choose screenshot output dir:', err)
                      })
                  }}
                >
                  {t('preferences.chooseFolder', 'Choose Folder')}
                </button>
                <button
                  className="runtimeButton"
                  type="button"
                  onClick={() => updatePreferences({ screenshotOutputDir: null })}
                  disabled={!preferences.screenshotOutputDir}
                >
                  {t('preferences.clear', 'Clear')}
                </button>
              </div>
            </label>
            {!preferences.screenshotOutputDir ? (
              <div className="prefsHint">
                {t('preferences.screenshotOutputFolderHint', 'Optional screenshot output folder.')}
              </div>
            ) : (
              <div className="prefsHint">{preferences.screenshotOutputDir}</div>
            )}
          </div>

          {/* --- Секция Keyboard Shortcuts ---
              Держим её отдельно от Editor, чтобы rebinding было легче найти глазами. */}
          <div className="prefsSection">
            <div className="prefsSectionTitle">
              {t('preferences.keyboardShortcuts', 'Keyboard Shortcuts')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {HOTKEY_ACTION_IDS.map((actionId) => (
                <div
                  key={actionId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    fontSize: 12,
                    color: 'var(--ev-c-text-2)'
                  }}
                >
                  <span>{getHotkeyLabel(actionId)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      className="runtimeButton"
                      type="button"
                      onClick={() =>
                        setCapturingActionId((prev) => (prev === actionId ? null : actionId))
                      }
                      style={{ minWidth: 136 }}
                    >
                      {capturingActionId === actionId
                        ? t('preferences.shortcutCapture', 'Press shortcut...')
                        : formatComboForDisplay(
                            preferences.keybindings[actionId] ?? '',
                            preferences.language === 'ru' ? 'Не назначено' : 'Unassigned'
                          )}
                    </button>
                    <button
                      className="runtimeButton"
                      type="button"
                      onClick={() => applyKeybindingChange(actionId, DEFAULT_KEYBINDINGS[actionId])}
                    >
                      {t('preferences.shortcutReset', 'Reset')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="prefsHint">
              {t('preferences.shortcutCaptureHint', 'Click a shortcut, then press keys. Delete clears it.')}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
