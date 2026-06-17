// PreferencesGeneralSection.tsx — Секция общих настроек (язык, тема, акцентный цвет).

import React from 'react'
import { type AccentColorId } from './usePreferences'
import type { EditorPreferences } from './usePreferences'
import { THEMES, type ThemeId } from './useTheme'

// Пресеты акцентных цветов с HEX-значениями.
const ACCENT_PRESETS: Array<{ id: AccentColorId; label: string; hex: string }> = [
  { id: 'purple', label: 'Purple', hex: '#5e6ad2' },
  { id: 'cyan', label: 'Cyan', hex: '#00c8ff' },
  { id: 'blue', label: 'Blue', hex: '#4a8fd9' },
  { id: 'green', label: 'Green', hex: '#3cb371' },
  { id: 'orange', label: 'Orange', hex: '#e6a020' },
  { id: 'red', label: 'Red', hex: '#d9534f' },
  { id: 'yellow', label: 'Yellow', hex: '#e6c820' }
]

// Пропсы секции General.
type PreferencesGeneralSectionProps = {
  preferences: EditorPreferences
  updatePreferences: (patch: Partial<EditorPreferences>) => void
  t: (key: string, fallback?: string) => string
}

// Секция общих настроек.
export const PreferencesGeneralSection = React.memo(function PreferencesGeneralSection({
  preferences,
  updatePreferences,
  t
}: PreferencesGeneralSectionProps): React.JSX.Element {
  return (
    <div className="prefsSection">
      <div className="prefsSectionSep">
        <span className="prefsSectionTitle">{t('preferences.general', 'General')}</span>
      </div>
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
          value={preferences.theme}
          onChange={(e) => updatePreferences({ theme: e.target.value as ThemeId })}
        >
          {THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.label}
            </option>
          ))}
        </select>
      </label>
      <div className="prefsHint">
        {THEMES.find((theme) => theme.id === preferences.theme)?.description ?? ''}
      </div>

      {/* Акцентный цвет — Grid 2×4 со свотчами */}
      <div className="prefsField" style={{ alignItems: 'flex-start' }}>
        <span style={{ paddingTop: 4 }}>{t('preferences.accentColor', 'Accent Color')}</span>
        <div className="prefsAccentGrid">
          {ACCENT_PRESETS.map((preset) => {
            const isActive = preferences.accentColor === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                className={['prefsAccentSwatch', isActive ? 'isActive' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => updatePreferences({ accentColor: preset.id as AccentColorId })}
                title={preset.label}
              >
                <span
                  className={['prefsAccentSwatchCircle', isActive ? 'isActive' : '']
                    .filter(Boolean)
                    .join(' ')}
                  style={{ backgroundColor: preset.hex }}
                />
                <span className="prefsAccentSwatchLabel">{preset.label}</span>
              </button>
            )
          })}
          {/* Custom swatch */}
          {(() => {
            const isCustom = preferences.accentColor === 'custom'
            return (
              <button
                type="button"
                className={['prefsAccentSwatch prefsAccentSwatchCustom', isCustom ? 'isActive' : '']
                  .filter(Boolean)
                  .join(' ')}
                title={t('preferences.custom', 'Custom...')}
              >
                <span
                  className={['prefsAccentSwatchCircle', isCustom ? 'isActive' : '']
                    .filter(Boolean)
                    .join(' ')}
                  style={
                    isCustom && preferences.customAccentHex
                      ? { backgroundColor: preferences.customAccentHex }
                      : {}
                  }
                >
                  {!isCustom && <span>+</span>}
                  <input
                    className="prefsAccentHexInput"
                    type="color"
                    value={preferences.customAccentHex || '#ffffff'}
                    onChange={(e) =>
                      updatePreferences({
                        accentColor: 'custom' as AccentColorId,
                        customAccentHex: e.target.value
                      })
                    }
                  />
                </span>
                <span className="prefsAccentSwatchLabel">{t('preferences.custom', 'Custom')}</span>
              </button>
            )
          })()}
        </div>
      </div>
    </div>
  )
})
