import { useMemo } from 'react'
import { THEMES, type ThemeId } from './useTheme'
import type { EditorPreferences, AccentColorId } from './usePreferences'
import { createTranslator } from '../i18n'

// WelcomeSetupModal.tsx — Модальное окно первого запуска.
// Отображается как компактная карточка по центру экрана (не fullscreen).

type WelcomeSetupModalProps = {
  open: boolean
  preferences: EditorPreferences
  updatePreferences: (patch: Partial<EditorPreferences>) => void
  onComplete: () => void
}

// Пресеты акцентных цветов для выпадающего списка.
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

export function WelcomeSetupModal({
  open,
  preferences,
  updatePreferences,
  onComplete
}: WelcomeSetupModalProps): React.JSX.Element | null {
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])

  if (!open) return null

  // Backdrop — полупрозрачный фон, но контент центрирован и компактен.
  return (
    <div
      className="welcomeBackdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}
    >
      <div className="prefsModal" style={{ maxWidth: 450, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="prefsHeader">
          <span className="prefsTitle" style={{ fontSize: 20 }}>
            {t('welcome.title', 'Welcome!')}
          </span>
        </div>

        <div className="prefsBody" style={{ padding: '20px 24px' }}>
          <p style={{ marginBottom: 24, color: 'var(--ev-c-text-2)', lineHeight: '1.5' }}>
            {t('welcome.description', 'Let\'s customize Undefscene for you before we get started.')}
          </p>

          <div className="prefsSection" style={{ border: 'none', padding: 0 }}>
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
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

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
                <option value="custom">{t('preferences.custom', 'Custom...')}</option>
              </select>
            </label>
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

          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center' }}>
            <button 
              className="runtimeButton" 
              style={{ 
                padding: '10px 32px', 
                fontSize: 15, 
                backgroundColor: 'var(--accent-default)',
                color: 'white',
                border: 'none'
              }}
              onClick={onComplete}
            >
              {t('app.getStarted', 'Get Started')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
