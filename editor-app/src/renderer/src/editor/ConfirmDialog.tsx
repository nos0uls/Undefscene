import { createContext, useCallback, useContext, useEffect, useRef, useState, useMemo } from 'react'
import { createTranslator } from '../i18n'
import { usePreferencesContext } from './PreferencesContext'
import { ConfirmContext, type ConfirmOptions } from './confirmContext'

// ConfirmDialog — замена window.confirm на кастомную модалку.
// Поддерживает title, message, danger-стиль и promise-based API через useConfirm().

type ConfirmState = ConfirmOptions & {
  resolve: (value: boolean) => void
}


export function ConfirmProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { preferences } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])

  const [state, setState] = useState<ConfirmState | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ ...opts, resolve })
    })
  }, [])

  const handleResolve = useCallback(
    (value: boolean) => {
      if (!state) return
      state.resolve(value)
      setState(null)
    },
    [state]
  )

  // Закрытие по Escape.
  useEffect(() => {
    if (!state) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleResolve(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state, handleResolve])

  // Фокус на кнопку подтверждения при открытии.
  useEffect(() => {
    if (state) {
      setTimeout(() => confirmBtnRef.current?.focus(), 50)
    }
  }, [state])

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {state && (
        <div
          ref={overlayRef}
          className="prefsOverlay"
          onClick={(e) => {
            if (e.target === overlayRef.current) handleResolve(false)
          }}
        >
          <div className="prefsModal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 320, maxWidth: 480 }}>
            <div className="prefsHeader">
              <span className="prefsTitle">{state.title ?? t('dialog.confirmTitle', 'Confirm')}</span>
              <button className="prefsCloseBtn" onClick={() => handleResolve(false)}>
                ✕
              </button>
            </div>

            <div className="prefsBody">
              <div className="prefsHint" style={{ fontStyle: 'normal', whiteSpace: 'pre-wrap' }}>
                {state.message}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                <button
                  type="button"
                  className="runtimeButton"
                  onClick={() => handleResolve(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'var(--ev-c-text-2)'
                  }}
                >
                  {state.cancelLabel ?? t('dialog.cancelLabel', 'Cancel')}
                </button>
                <button
                  ref={confirmBtnRef}
                  type="button"
                  className="runtimeButton"
                  onClick={() => handleResolve(true)}
                  style={
                    state.danger
                      ? { background: '#b42318', color: '#fff', border: 'none' }
                      : undefined
                  }
                >
                  {state.confirmLabel ?? t('dialog.confirmLabel', 'Confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

