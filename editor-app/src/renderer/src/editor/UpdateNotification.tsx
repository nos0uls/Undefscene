// UpdateNotification — полоска уведомления об обновлении.
// Показывается вверху редактора, когда обнаружена новая версия.
// Для NSIS: предлагает перезапуститься и установить.
// Для portable: просто сообщает о новой версии.

import { useEffect, useState } from 'react'

// Состояния уведомления.
type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }

export function UpdateNotification(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' })

  // Подписываемся на события обновления из main процесса (один раз).
  useEffect(() => {
    window.api.updater.onUpdateAvailable((info) => {
      setStatus({ kind: 'available', version: info.version })
    })
    window.api.updater.onDownloadProgress((progress) => {
      setStatus({ kind: 'downloading', percent: progress.percent })
    })
    window.api.updater.onUpdateDownloaded(() => {
      setStatus({ kind: 'ready' })
    })
    window.api.updater.onError((msg) => {
      setStatus({ kind: 'error', message: msg })
    })
  }, [])

  // Ничего не показываем, если нет обновлений.
  if (status.kind === 'idle') return null

  // Цвет полоски зависит от состояния.
  const bgColor =
    status.kind === 'error'
      ? 'rgba(224, 80, 80, 0.15)'
      : status.kind === 'ready'
        ? 'rgba(80, 200, 80, 0.15)'
        : 'rgba(88, 166, 255, 0.12)'

  return (
    <div
      style={{
        padding: '4px 12px',
        fontSize: 12,
        background: bgColor,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0
      }}
    >
      {/* Текст уведомления. */}
      {status.kind === 'available' && (
        <span>Update available: <strong>v{status.version}</strong></span>
      )}
      {status.kind === 'downloading' && (
        <span>Downloading update... {status.percent}%</span>
      )}
      {status.kind === 'ready' && (
        <span>Update ready. Restart to install.</span>
      )}
      {status.kind === 'error' && (
        <span style={{ color: '#e05050' }}>Update error: {status.message}</span>
      )}

      {/* Кнопка "Restart" — показываем, когда обновление скачано. */}
      {status.kind === 'ready' && (
        <button
          type="button"
          onClick={() => window.api.updater.install()}
          style={{
            marginLeft: 'auto',
            padding: '2px 10px',
            fontSize: 11,
            fontWeight: 600,
            background: 'var(--ev-c-accent, #58a6ff)',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          Restart & Update
        </button>
      )}

      {/* Кнопка "Dismiss" — скрываем уведомление. */}
      <button
        type="button"
        onClick={() => setStatus({ kind: 'idle' })}
        style={{
          marginLeft: status.kind === 'ready' ? 0 : 'auto',
          padding: '2px 6px',
          fontSize: 11,
          background: 'transparent',
          color: 'var(--ev-c-text-2)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 4,
          cursor: 'pointer'
        }}
      >
        Dismiss
      </button>
    </div>
  )
}
