// PreferencesModal.tsx — Модалка настроек редактора.
// Открывается из File → Preferences. Закрывается по Esc или кнопке Close.

import { useEffect, useRef } from 'react'

// Пропсы модалки.
type PreferencesModalProps = {
  // Показана ли модалка.
  open: boolean
  // Закрыть модалку.
  onClose: () => void
}

// Модальное окно с настройками редактора.
export function PreferencesModal({ open, onClose }: PreferencesModalProps): React.JSX.Element | null {
  // Ссылка на overlay, чтобы ловить клики "снаружи".
  const overlayRef = useRef<HTMLDivElement | null>(null)

  // Закрытие по Esc.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
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
          <button className="prefsCloseBtn" onClick={onClose}>✕</button>
        </div>

        {/* Содержимое */}
        <div className="prefsBody">
          {/* --- Секция General --- */}
          <div className="prefsSection">
            <div className="prefsSectionTitle">General</div>
            <label className="prefsField">
              <span>Theme</span>
              <select className="prefsInput" defaultValue="dark" disabled>
                <option value="dark">Dark</option>
              </select>
            </label>
            <div className="prefsHint">More themes coming in future updates.</div>
          </div>

          {/* --- Секция Canvas --- */}
          <div className="prefsSection">
            <div className="prefsSectionTitle">Canvas</div>
            <label className="prefsField">
              <span>Grid Size</span>
              <input className="prefsInput" type="number" defaultValue={18} min={8} max={64} disabled />
            </label>
            <label className="prefsField prefsCheckbox">
              <input type="checkbox" defaultChecked disabled />
              <span>Show MiniMap</span>
            </label>
            <div className="prefsHint">Canvas settings will be saved in a future version.</div>
          </div>

          {/* --- Секция Editor --- */}
          <div className="prefsSection">
            <div className="prefsSectionTitle">Editor</div>
            <label className="prefsField prefsCheckbox">
              <input type="checkbox" defaultChecked disabled />
              <span>Auto-save on change</span>
            </label>
            <div className="prefsHint">Persistent preferences are planned for v2.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
