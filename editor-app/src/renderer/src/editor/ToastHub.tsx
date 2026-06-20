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
  return ctx.push({
    severity: 'success',
    message,
    title: opts?.title,
    duration: opts?.duration ?? 3000
  })
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
  return ctx.push({
    severity: 'info',
    message,
    title: opts?.title,
    duration: opts?.duration ?? 4000
  })
}

// --- Renderer ---

const SEVERITY_STYLES: Record<ToastSeverity, { bg: string; border: string; text: string }> = {
  info: {
    bg: 'var(--status-info-muted)',
    border: 'var(--status-info)',
    text: 'var(--status-info)'
  },
  success: {
    bg: 'var(--status-success-muted)',
    border: 'var(--status-success)',
    text: 'var(--status-success)'
  },
  warning: {
    bg: 'var(--status-warning-muted)',
    border: 'var(--status-warning)',
    text: 'var(--status-warning)'
  },
  error: {
    bg: 'var(--status-error-muted)',
    border: 'var(--status-error)',
    text: 'var(--status-error)'
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
    <div className="toastHub" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => {
        const s = SEVERITY_STYLES[t.severity]
        return (
          <div
            key={t.id}
            className="toastItem"
            style={{
              background: s.bg,
              border: `1px solid ${s.border}`
            }}
          >
            <div className="toastBody">
              {t.title && (
                <div className="toastTitle" style={{ color: s.text }}>
                  {t.title}
                </div>
              )}
              <div className="toastMessage">{t.message}</div>
            </div>
            <button
              type="button"
              className="toastDismissBtn"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
