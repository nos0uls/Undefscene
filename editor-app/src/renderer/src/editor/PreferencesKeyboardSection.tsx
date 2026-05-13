// PreferencesKeyboardSection.tsx — Секция горячих клавиш.

import React from 'react'
import { DEFAULT_KEYBINDINGS, HOTKEY_ACTION_IDS, type HotkeyActionId } from './usePreferences'
import { formatComboForDisplay } from './useHotkeys'

// Пропсы секции Keyboard.
type PreferencesKeyboardSectionProps = {
  preferences: { keybindings: Record<HotkeyActionId, string> }
  capturingActionId: HotkeyActionId | null
  setCapturingActionId: (id: HotkeyActionId | null) => void
  applyKeybindingChange: (actionId: HotkeyActionId, combo: string) => void
  getHotkeyLabel: (actionId: HotkeyActionId) => string
  t: (key: string, fallback?: string) => string
}

// Секция горячих клавиш.
export const PreferencesKeyboardSection = React.memo(function PreferencesKeyboardSection({
  preferences,
  capturingActionId,
  setCapturingActionId,
  applyKeybindingChange,
  getHotkeyLabel,
  t
}: PreferencesKeyboardSectionProps): React.JSX.Element {
  return (
    <div className="prefsSection">
      <div className="prefsSectionSep"><span className="prefsSectionTitle">{t('preferences.keyboardShortcuts', 'Keyboard Shortcuts')}</span></div>
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
                      t('preferences.unassigned', 'Unassigned')
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
    </div>
  )
})
