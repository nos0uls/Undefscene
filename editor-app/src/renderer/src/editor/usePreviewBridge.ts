import { useEffect, useMemo, useRef, useState } from 'react'
import type { PreviewPaths, PreviewStatus } from './previewTypes'
import {
  createPreviewControl,
  createRenderRoomPngControl,
  parsePreviewPaths,
  parsePreviewStatus
} from './previewTypes'

// Как часто мы опрашиваем статус превью (мс).
const POLL_INTERVAL_MS = 750

// Сколько времени может пройти без обновления, прежде чем считаем статус устаревшим.
const STALE_AFTER_MS = 3000

// Хук для обмена данными с превью-билдом через файлы.
export const usePreviewBridge = (): {
  status: PreviewStatus | null
  statusLabel: string
  isStale: boolean
  paths: PreviewPaths | null
  lastPngPath: string | null
  renderRoomPng: (options?: { roomName?: string | null; outNameHint?: string | null }) => string
  ping: () => string
} => {
  const [status, setStatus] = useState<PreviewStatus | null>(null)
  const [isStale, setIsStale] = useState(false)
  const [paths, setPaths] = useState<PreviewPaths | null>(null)

  // Сохраняем время последнего обновления статуса.
  const lastUpdateRef = useRef<number | null>(null)

  // Универсальная отправка команды.
  const sendControl = (control: unknown): void => {
    // Проверяем, что мы в Electron-контексте.
    if (!window.api?.preview) return

    window.api.preview.writeControl(control).catch((err) => {
      console.warn('Failed to write preview_control.json:', err)
    })
  }

  // Просим GML отрендерить комнату/сцену в PNG.
  const renderRoomPng = (options?: {
    roomName?: string | null
    outNameHint?: string | null
  }): string => {
    const control = createRenderRoomPngControl(options)
    sendControl(control)
    return control.requestId
  }

  // Простейшая команда, чтобы проверить, что GML вообще читает control файл.
  const ping = (): string => {
    const control = createPreviewControl({ kind: 'ping', params: {} })
    sendControl(control)
    return control.requestId
  }

  useEffect(() => {
    // Проверяем, что мы в Electron-контексте.
    if (!window.api?.preview) return

    let cancelled = false

    const readPaths = async (): Promise<void> => {
      try {
        const raw = await window.api.preview.getPaths()
        if (cancelled) return

        const parsed = parsePreviewPaths(raw)
        if (parsed) setPaths(parsed)
      } catch (err) {
        console.warn('Failed to read preview paths:', err)
      }
    }

    const readStatus = async (): Promise<void> => {
      try {
        const raw = await window.api.preview.readStatus()
        if (cancelled) return

        const parsed = parsePreviewStatus(raw)
        if (parsed) {
          setStatus(parsed)
          lastUpdateRef.current = parsed.updatedAtMs
        }
      } catch (err) {
        console.warn('Failed to read preview_status.json:', err)
      }
    }

    readPaths()
    readStatus()
    const timer = window.setInterval(readStatus, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  // Проверяем, устарел ли статус.
  useEffect(() => {
    const checkTimer = window.setInterval(() => {
      const lastUpdate = lastUpdateRef.current
      if (!lastUpdate) {
        setIsStale(true)
        return
      }
      setIsStale(Date.now() - lastUpdate > STALE_AFTER_MS)
    }, 500)

    return () => {
      window.clearInterval(checkTimer)
    }
  }, [])

  const statusLabel = useMemo(() => {
    if (!status) return 'No status'
    if (isStale) return 'Stale'
    return status.state
  }, [isStale, status])

  const lastPngPath =
    status?.lastResult?.kind === 'render_room_png' ? status.lastResult.pngPath : null

  return {
    status,
    statusLabel,
    isStale,
    paths,
    lastPngPath,
    renderRoomPng,
    ping
  }
}
