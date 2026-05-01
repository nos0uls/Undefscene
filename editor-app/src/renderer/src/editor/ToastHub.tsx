import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// ToastHub — централизованная полоска уведомлений.
// Заменяет нативный window.alert для некритичных сообщений.
// Severity отражает смысл, а не блокирует UI.

type ToastSeverity = 'info' | 'success' | 'warning' | 'error'

export type Toast = {
  id: string
  severity: ToastSeverity
  title?: string
  message: string
  // Если > 0 — авто-закрытие через N ms. 0 = остаётся до ручного закрытия.
  duration: number
}

export type ToastContextValue = {
  push: (toast: Omit<Toast, 'id'>) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToasts(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToasts must be used inside ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (toast: Omit<Toast, 'id'>): string => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      setToasts((prev) => {
        // Не дублируем идентичные активные сообщения (по message+severity).
        const duplicate = prev.find(
          (p) => p.message === toast.message && p.severity === toast.severity
        )
        if (duplicate) return prev
        // Ограничиваем очередь 5 штуками.
        const next = [...prev, { ...toast, id }].slice(-5)
        return next
      })

      if (toast.duration > 0) {
        const timer = setTimeout(() => dismiss(id), toast.duration)
        timersRef.current.set(id, timer)
      }
      return id
    },
    [dismiss]
  )

  // Чистим таймеры при размонтировании.
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <ToastRenderer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

// Удобные helpers для вызова из компонентов.
export function pushSuccess(
  ctx: ToastContextValue,
  message: string,
  opts?: { title?: string; duration?: number }
): string {
  return ctx.push({ severity: 'success', message, title: opts?.title, duration: opts?.duration ?? 3000 })
}

export function pushError(
  ctx: ToastContextValue,
  message: string,
  opts?: { title?: string; duration?: number }
): string {
  return ctx.push({ severity: 'error', message, title: opts?.title, duration: opts?.duration ?? 0 })
}

export function pushWarning(
  ctx: ToastContextValue,
  message: string,
  opts?: { title?: string; duration?: number }
): string {
  return ctx.push({
    severity: 'warning',
    message,
    title: opts?.title,
    duration: opts?.duration ?? 5000
  })
}

export function pushInfo(
  ctx: ToastContextValue,
  message: string,
  opts?: { title?: string; duration?: number }
): string {
  return ctx.push({ severity: 'info', message, title: opts?.title, duration: opts?.duration ?? 4000 })
}

// --- Renderer ---

const SEVERITY_STYLES: Record<ToastSeverity, { bg: string; border: string; text: string }> = {
  info: {
    bg: 'rgba(88, 166, 255, 0.12)',
    border: 'rgba(88, 166, 255, 0.25)',
    text: '#58a6ff'
  },
  success: {
    bg: 'rgba(80, 200, 80, 0.12)',
    border: 'rgba(80, 200, 80, 0.25)',
    text: '#50c850'
  },
  warning: {
    bg: 'rgba(230, 180, 60, 0.12)',
    border: 'rgba(230, 180, 60, 0.25)',
    text: '#e6b43c'
  },
  error: {
    bg: 'rgba(224, 80, 80, 0.12)',
    border: 'rgba(224, 80, 80, 0.25)',
    text: '#e05050'
  }
}

function ToastRenderer({
  toasts,
  onDismiss
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
}): React.JSX.Element {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-end',
        pointerEvents: 'none'
      }}
    >
      {toasts.map((t) => {
        const s = SEVERITY_STYLES[t.severity]
        return (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              minWidth: 220,
              maxWidth: 380,
              padding: '10px 12px',
              borderRadius: 6,
              background: s.bg,
              border: `1px solid ${s.border}`,
              color: 'var(--ev-c-text-1, #c9d1d9)',
              fontSize: 12,
              lineHeight: 1.5,
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
              animation: 'toastIn 200ms ease-out',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {t.title && (
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 2,
                    color: s.text,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5
                  }}
                >
                  {t.title}
                </div>
              )}
              <div style={{ wordBreak: 'break-word' }}>{t.message}</div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              style={{
                flexShrink: 0,
                background: 'transparent',
                border: 'none',
                color: 'var(--ev-c-text-2, #8b949e)',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                padding: 2
              }}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )
      })}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
