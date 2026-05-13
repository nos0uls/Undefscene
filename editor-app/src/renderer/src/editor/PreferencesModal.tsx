// PreferencesModal.tsx — Модалка настроек редактора.
// Открывается из File → Preferences. Закрывается по Esc или кнопке Close.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { THEMES, type ThemeId } from './useTheme'
import type { EditorPreferences, HotkeyActionId } from './usePreferences'
import { DEFAULT_KEYBINDINGS, HOTKEY_ACTION_IDS } from './usePreferences'
import {
  comboFromEvent,
  isModifierOnlyEvent,
  normalizeCombo
} from './useHotkeys'
import { createTranslator } from '../i18n'
import { PreferencesGeneralSection } from './PreferencesGeneralSection'
import { PreferencesCanvasSection } from './PreferencesCanvasSection'
import { PreferencesKeyboardSection } from './PreferencesKeyboardSection'

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

  // Тема читается и пишется напрямую через preferences (единый источник правды).

  // Простой runtime translator. Переключается сразу вместе с preferences.language.
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])

  // Название действия под текущий язык.
  const getHotkeyLabel = (actionId: HotkeyActionId): string => t(`hotkey.${actionId}`, actionId)

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
          <PreferencesGeneralSection preferences={preferences} updatePreferences={updatePreferences} t={t} />
          <PreferencesCanvasSection preferences={preferences} updatePreferences={updatePreferences} t={t} />
          {/* --- Секция Editor --- */}
          <div className="prefsSection">
            <div className="prefsSectionSep"><span className="prefsSectionTitle">{t('preferences.editor', 'Editor')}</span></div>
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
                onChange={(e) => {
                  const val = Number(e.target.value)
                  if (!isNaN(val)) updatePreferences({ autoSaveIntervalMinutes: val })
                }}
                disabled={!preferences.autoSaveEnabled}
              />
            </label>
            <label className="prefsField prefsCheckbox">
              <input
                type="checkbox"
                checked={preferences.liquidGlassEnabled}
                onChange={(e) => updatePreferences({ liquidGlassEnabled: e.target.checked })}
              />
              <span>{t('preferences.liquidGlassEnabled', 'Liquid Glass')}</span>
            </label>
            {preferences.liquidGlassEnabled && (
              <label className="prefsField">
                <span>
                  {t('preferences.liquidGlassBlur', 'Blur Intensity')} ({Math.round(
                    preferences.liquidGlassBlur * 100
                  )}%)
                </span>
                <input
                  className="prefsInput"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(preferences.liquidGlassBlur * 100)}
                  onChange={(e) =>
                    updatePreferences({
                      liquidGlassBlur: Number(e.target.value) / 100
                    })
                  }
                />
              </label>
            )}
            <label className="prefsField prefsCheckbox">
              <input
                type="checkbox"
                checked={preferences.visualEditorShowPathLabels}
                onChange={(e) => updatePreferences({ visualEditorShowPathLabels: e.target.checked })}
              />
              <span>{t('preferences.visualEditorShowPathLabels', 'Show path point labels')}</span>
            </label>
            <div className="prefsHint">
              {t('editor.liquidGlassHint', 'Dynamic transparency and blurring for nodes and paths.')}
            </div>

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

          <PreferencesKeyboardSection
            preferences={{ keybindings: preferences.keybindings }}
            capturingActionId={capturingActionId}
            setCapturingActionId={setCapturingActionId}
            applyKeybindingChange={applyKeybindingChange}
            getHotkeyLabel={getHotkeyLabel}
            t={t}
          />
        </div>

        {/* Footer */}
        <div className="prefsFooter">
          <button
            className="prefsFooterReset"
            type="button"
            onClick={() => {
              updatePreferences({
                keybindings: Object.fromEntries(
                  HOTKEY_ACTION_IDS.map((id) => [id, DEFAULT_KEYBINDINGS[id]])
                ) as typeof DEFAULT_KEYBINDINGS
              })
            }}
          >
            {t('preferences.shortcutReset', 'Reset shortcuts')}
          </button>
          <div className="prefsFooterActions">
            <button className="prefsFooterClose" type="button" onClick={onClose}>
              {t('preferences.close', 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
