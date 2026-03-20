import { useCallback, useEffect, useMemo, useState } from 'react'
import { createTranslator } from '../i18n'
import { RoomVisualEditorModal } from './RoomVisualEditorModal'

// Локально дублируем bridge-type в renderer,
// чтобы web tsconfig не тянул preload entry как обычный исходник.
type VisualEditorBridgeState = {
  rooms: string[]
  screenshotRooms: string[]
  projectDir: string | null
  roomScreenshotsDir: string | null
  visualEditorTechMode: boolean
  selectedNode: {
    id: string
    type: string
    name?: string
  } | null
  selectedActorTarget: string | null
  selectedPathPoints: Array<{ x: number; y: number }>
  actorPreviews: Array<{
    id: string
    key: string
    x: number
    y: number
    spriteOrObject: string
    isVirtual?: boolean
  }>
  language: 'en' | 'ru'
}

// Отдельная React-оболочка для native окна Visual Editing.
// Она получает snapshot из main процесса и рендерит тот же visual editor UI,
// но уже как самостоятельное окно в Alt+Tab.
export function VisualEditorWindowApp(): React.JSX.Element {
  // Храним последний bridge-state, который main процесс прислал для visual editor.
  // Это состояние считается источником правды для отдельного окна.
  const [bridgeState, setBridgeState] = useState<VisualEditorBridgeState | null>(null)

  // Простое состояние загрузки нужно, чтобы отдельное окно не мигало пустым экраном,
  // пока main ещё не успел отдать первый snapshot.
  const [isLoading, setIsLoading] = useState(true)

  // Переводчик нужен для fallback-сообщений этого wrapper-компонента.
  const t = useMemo(
    () => createTranslator(bridgeState?.language ?? 'en'),
    [bridgeState?.language]
  )

  // Импорт path идёт обратно в главное окно редактора через main bridge.
  // Так логика replace/create follow_path остаётся централизованной в EditorShell.
  const handleImportPath = useCallback((points: Array<{ x: number; y: number }>): void => {
    void window.api.visualEditor.importPath(points)
  }, [])

  // Actor placement тоже отдаём обратно в главное окно через main bridge.
  // Так visual editor остаётся thin client, а runtime-обновление живёт централизованно в EditorShell.
  const handleImportActors = useCallback(
    (
      actors: Array<{ id: string; key: string; x: number; y: number; spriteOrObject: string }>
    ): void => {
      void window.api.visualEditor.importActors(actors)
    },
    []
  )

  // Закрытие отдельного окна тоже проходит через bridge,
  // чтобы main корректно уничтожил BrowserWindow и оповестил EditorShell.
  const handleClose = useCallback((): void => {
    void window.api.visualEditor.close()
  }, [])

  // При первом монтировании просим у main последний snapshot.
  // Это защищает окно от race condition, если BrowserWindow открылся чуть позже syncState.
  useEffect(() => {
    let cancelled = false

    window.api.visualEditor
      .getState()
      .then((state) => {
        if (cancelled) return
        setBridgeState(state)
      })
      .catch((error) => {
        if (cancelled) return
        console.warn('Failed to load visual editor bridge state:', error)
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Подписываемся на push-обновления snapshot'а,
  // чтобы отдельное окно сразу видело новую selected node, actor preview и room list.
  useEffect(() => {
    return window.api.visualEditor.onStateUpdated((state) => {
      setBridgeState(state)
      setIsLoading(false)
    })
  }, [])

  // Если bridge ещё не готов, показываем простой понятный fallback.
  if (isLoading && !bridgeState) {
    return (
      <div className="emptyState">
        <h2>{t('editor.visualEditingTitle', 'Visual Editing')}</h2>
        <p>{t('editor.visualEditingLoading', 'Loading room screenshot data...')}</p>
      </div>
    )
  }

  // Если главное окно ещё не передало snapshot, объясняем ситуацию прямо.
  if (!bridgeState) {
    return (
      <div className="emptyState">
        <h2>{t('editor.visualEditingTitle', 'Visual Editing')}</h2>
        <p>{t('editor.visualEditingNoProject', 'Open a project.')}</p>
      </div>
    )
  }

  return (
    <RoomVisualEditorModal
      open
      variant="window"
      rooms={bridgeState.rooms}
      screenshotRooms={bridgeState.screenshotRooms}
      projectDir={bridgeState.projectDir}
      roomScreenshotsDir={bridgeState.roomScreenshotsDir}
      techMode={bridgeState.visualEditorTechMode}
      selectedNode={bridgeState.selectedNode}
      selectedActorTarget={bridgeState.selectedActorTarget}
      selectedPathPoints={bridgeState.selectedPathPoints}
      actorPreviews={bridgeState.actorPreviews}
      language={bridgeState.language}
      onImportPath={handleImportPath}
      onImportActors={handleImportActors}
      onClose={handleClose}
    />
  )
}
