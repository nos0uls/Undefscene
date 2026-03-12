import { useEffect, useMemo, useRef, useState } from 'react'
import type { LayoutState } from './layoutTypes'

// Создаём дефолтную раскладку, чтобы редактор всегда стартовал одинаково.
export function createDefaultLayout(): LayoutState {
  return {
    schemaVersion: 1,
    dockSizes: {
      leftWidth: 240,
      rightWidth: 300,
      bottomHeight: 220,
      leftSplit: 0.7,
      rightSplit: 0.55
    },
    docked: {
      left: ['panel.actions', 'panel.bookmarks'],
      right: ['panel.text', 'panel.inspector'],
      bottom: ['panel.logs']
    },
    panels: {
      'panel.actions': {
        id: 'panel.actions',
        title: 'Actions',
        mode: 'docked',
        slot: 'left',
        position: null,
        size: null,
        zIndex: 1,
        collapsed: false
      },
      'panel.bookmarks': {
        id: 'panel.bookmarks',
        title: 'Bookmarks',
        mode: 'docked',
        slot: 'left',
        position: null,
        size: null,
        zIndex: 1,
        collapsed: false
      },
      'panel.text': {
        id: 'panel.text',
        title: 'Text Editor',
        mode: 'docked',
        slot: 'right',
        position: null,
        size: null,
        zIndex: 1,
        collapsed: false
      },
      'panel.inspector': {
        id: 'panel.inspector',
        title: 'Inspector',
        mode: 'docked',
        slot: 'right',
        position: null,
        size: null,
        zIndex: 1,
        collapsed: false
      },
      'panel.logs': {
        id: 'panel.logs',
        title: 'Logs / Warnings',
        mode: 'docked',
        slot: 'bottom',
        position: null,
        size: null,
        zIndex: 1,
        collapsed: false
      }
    },
    lastSavedAtMs: 0
  }
}

// Хук для хранения и сохранения LayoutState.
// Пока что это “первый шаг”: мы просто читаем/пишем layout.json через IPC.
export function useLayoutState(): {
  layout: LayoutState
  setLayout: (next: LayoutState) => void
} {
  const defaultLayout = useMemo(() => createDefaultLayout(), [])
  const [layout, setLayout] = useState<LayoutState>(defaultLayout)

  // Этот флаг помогает не записывать layout сразу же после загрузки.
  const didLoadRef = useRef(false)

  useEffect(() => {
    // Проверяем, что мы в Electron-контексте (window.api доступен).
    // В обычном браузере (IDE preview) API недоступен — используем дефолтную раскладку.
    if (!window.api?.layout) {
      didLoadRef.current = true
      return
    }

    let cancelled = false

    // Загружаем сохранённую раскладку из main процесса.
    // Если файла нет — используем дефолтную.
    window.api.layout
      .read()
      .then((loaded) => {
        if (cancelled) return

        // Если файл существует, но формат старый/битый — не падаем.
        // Просто используем дефолтную раскладку.
        if (
          loaded &&
          typeof loaded === 'object' &&
          (loaded as Partial<LayoutState>).schemaVersion === 1
        ) {
          setLayout(loaded as LayoutState)
        }
        didLoadRef.current = true
      })
      .catch((err) => {
        console.warn('Failed to read layout.json:', err)
        didLoadRef.current = true
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // Пропускаем, если ещё не загрузили или нет Electron API.
    if (!didLoadRef.current || !window.api?.layout) return

    const saveTimer = window.setTimeout(() => {
      // Сохраняем раскладку, чтобы после перезапуска она восстановилась.
      window.api.layout.write({ ...layout, lastSavedAtMs: Date.now() }).catch((err) => {
        console.warn('Failed to write layout.json:', err)
      })
    }, 250)

    return () => {
      window.clearTimeout(saveTimer)
    }
  }, [layout])

  return { layout, setLayout }
}
