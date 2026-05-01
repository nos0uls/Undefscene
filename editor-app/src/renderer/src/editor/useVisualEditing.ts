/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RuntimeNode } from './runtimeTypes'
import type { RuntimeState } from './runtimeTypes'
import { pushWarning } from './ToastHub'
import type { ToastContextValue } from './ToastHub'
import type { ConfirmOptions } from './ConfirmDialog'
import type { ProjectResources } from './useProjectResources'
import type { EditorPreferences } from './usePreferences'
import { suggestUniqueNodeName } from './useNodeOperations'

// Снимок состояния, который пересылается в native visual editor окно.
// Полностью описывает текущий visual editing context.
export type VisualEditorBridgeState = {
  rooms: string[]
  screenshotRooms: string[]
  projectDir: string | null
  roomScreenshotsDir: string | null
  visualEditorTechMode: boolean
  selectedNode: { id: string; type: string; name: string } | null
  selectedActorTarget: string | null
  selectedPathPoints: Array<{ x: number; y: number }>
  actorPreviews: Array<{
    id: string
    key: string
    x: number
    y: number
    spriteOrObject: string
  }>
  language: string
}

// Параметры, которые нужны хуку для работы с visual editing окном.
type UseVisualEditingDeps = {
  // Текущее runtime-состояние (ноды, выбор).
  runtime: RuntimeState
  // Обновление runtime (при импорте path/actors из visual editor).
  setRuntime: React.Dispatch<React.SetStateAction<RuntimeState>>
  // Ресурсы проекта (комнаты, скриншоты, projectDir).
  resources: ProjectResources | null
  // Настройки редактора (язык, tech mode, screenshot dir).
  preferences: EditorPreferences
  // Toast API для уведомлений.
  toasts: ToastContextValue
  // Confirm dialog для подтверждения импорта.
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  // Функция-переводчик.
  t: (key: string, fallback?: string) => string
  // Ref на корневой DOM-элемент редактора (для возврата фокуса).
  rootRef: React.MutableRefObject<HTMLDivElement | null>
}

// Хук управляет связью между основным редактором и отдельным
// native visual editing окном: открытие, синхронизация snapshot,
// импорт path points и actor positions обратно в граф.
export function useVisualEditing(deps: UseVisualEditingDeps) {
  const { runtime, setRuntime, resources, preferences, toasts, confirm, t, rootRef } = deps

  // Состояние: открыто ли visual editing окно.
  const [visualEditingOpen, setVisualEditingOpen] = useState(false)

  // Комнаты, для которых main уже нашёл screenshot bundle.
  const [screenshotRooms, setScreenshotRooms] = useState<string[]>([])

  // Выбранная нода для visual editing.
  const selectedNodeForVisualEditing = useMemo(
    () => runtime.nodes.find((node) => node.id === runtime.selectedNodeId) ?? null,
    [runtime.nodes, runtime.selectedNodeId]
  )

  // Точки выбранной follow_path-ноды — нужны modal для инициализации path draft.
  const selectedVisualPathPoints = useMemo(() => {
    if (!selectedNodeForVisualEditing || selectedNodeForVisualEditing.type !== 'follow_path') {
      return [] as Array<{ x: number; y: number }>
    }

    return Array.isArray(selectedNodeForVisualEditing.params?.points)
      ? (selectedNodeForVisualEditing.params?.points as Array<{ x: number; y: number }>).map((point) => ({
        x: Number(point.x ?? 0),
        y: Number(point.y ?? 0)
      }))
      : []
  }, [selectedNodeForVisualEditing])

  // Если в graph нет actor_create, visual editor всё равно может сделать preview
  // для target выбранной actor-related ноды (например, player).
  const selectedVisualActorTarget = useMemo(() => {
    const rawTarget = selectedNodeForVisualEditing?.params?.target
    return typeof rawTarget === 'string' && rawTarget.trim().length > 0 ? rawTarget.trim() : null
  }, [selectedNodeForVisualEditing])

  // Собираем actor preview markers из actor_create-нод.
  // Это даёт visual editor-окну ориентиры по уже созданным в graph актёрам.
  const visualEditorActorPreviews = useMemo(() => {
    return runtime.nodes
      .filter((node) => node.type === 'actor_create')
      .map((node) => ({
        id: node.id,
        key: String(node.params?.key ?? node.name ?? node.id),
        x: Number(node.params?.x ?? 0),
        y: Number(node.params?.y ?? 0),
        spriteOrObject: String(node.params?.sprite_or_object ?? '')
      }))
  }, [runtime.nodes])

  // Search dirs для stitched room screenshots.
  const roomScreenshotSearchDirs = useMemo(() => {
    const result: string[] = []
    const pushUnique = (dirPath: string | null | undefined): void => {
      const normalized = String(dirPath ?? '').trim()
      if (!normalized || result.includes(normalized)) return
      result.push(normalized)
    }

    pushUnique(preferences.screenshotOutputDir)
    pushUnique(resources?.roomScreenshotsDir)
    pushUnique(resources?.projectDir ? `${resources.projectDir}/screenshots` : null)
    return result
  }, [preferences.screenshotOutputDir, resources?.projectDir, resources?.roomScreenshotsDir])

  // Загружаем только те комнаты, для которых main уже может найти screenshot bundle.
  useEffect(() => {
    if (!resources?.projectDir || !Array.isArray(resources.rooms) || resources.rooms.length <= 0) {
      setScreenshotRooms([])
      return
    }

    let cancelled = false

    window.api.project
      .availableScreenshotRooms(resources.projectDir, resources.rooms, resources.roomScreenshotsDir ?? null)
      .then((nextRooms) => {
        if (cancelled) return
        setScreenshotRooms(Array.isArray(nextRooms) ? nextRooms : [])
      })
      .catch((error) => {
        if (cancelled) return
        console.warn('Failed to collect screenshot rooms:', error)
        setScreenshotRooms([])
      })

    return () => {
      cancelled = true
    }
  }, [preferences.screenshotOutputDir, resources?.projectDir, resources?.roomScreenshotsDir, resources?.rooms])

  // Собираем единый snapshot для native visual editor окна.
  const visualEditorBridgeState = useMemo(
    () => ({
      rooms: resources?.rooms ?? [],
      screenshotRooms,
      projectDir: resources?.projectDir ?? null,
      roomScreenshotsDir: resources?.roomScreenshotsDir ?? null,
      visualEditorTechMode: preferences.visualEditorTechMode,
      selectedNode: selectedNodeForVisualEditing
        ? {
          id: selectedNodeForVisualEditing.id,
          type: selectedNodeForVisualEditing.type,
          name: selectedNodeForVisualEditing.name
        }
        : null,
      selectedActorTarget: selectedVisualActorTarget,
      selectedPathPoints: selectedVisualPathPoints,
      actorPreviews: visualEditorActorPreviews,
      language: preferences.language
    }),
    [
      preferences.language,
      preferences.visualEditorTechMode,
      resources?.projectDir,
      resources?.roomScreenshotsDir,
      resources?.rooms,
      screenshotRooms,
      selectedVisualActorTarget,
      selectedNodeForVisualEditing,
      selectedVisualPathPoints,
      visualEditorActorPreviews
    ]
  )

  // Короткий sync-key помогает не слать одинаковый snapshot повторно.
  const visualEditorBridgeStateSyncKey = useMemo(
    () => JSON.stringify(visualEditorBridgeState),
    [visualEditorBridgeState]
  )

  // Запоминаем последний snapshot, который уже ушёл в native visual editor.
  const lastVisualEditorBridgeSyncKeyRef = useRef<string | null>(null)

  // Импорт path из visual editor: подтверждаем замену или создание новой follow_path.
  const importPathFromVisualEditing = useCallback(
    async (points: Array<{ x: number; y: number }>) => {
      const normalizedPoints = points.map((point) => ({
        x: Math.round(Number(point.x ?? 0)),
        y: Math.round(Number(point.y ?? 0))
      }))

      if (normalizedPoints.length <= 0) {
        pushWarning(toasts, 'Draw at least one path point before import.', { title: 'Visual Editing' })
        return
      }

      if (selectedNodeForVisualEditing) {
        const nodeLabel = String(selectedNodeForVisualEditing.name ?? selectedNodeForVisualEditing.type)
        const confirmed = await confirm({
          message: t('dialog.replaceNodeMessage', 'Replace selected node "{name}" with imported path data?').replace('{name}', nodeLabel),
          title: t('dialog.replaceNodeTitle', 'Replace node')
        })
        if (!confirmed) return

        const previousParams = selectedNodeForVisualEditing.params ?? {}
        setRuntime((prev) => ({
          ...prev,
          nodes: prev.nodes.map((node) =>
            node.id === selectedNodeForVisualEditing.id
              ? {
                ...node,
                type: 'follow_path',
                params: {
                  target: typeof previousParams.target === 'string' ? previousParams.target : '',
                  speed_px_sec:
                    typeof previousParams.speed_px_sec === 'number' ? previousParams.speed_px_sec : 60,
                  collision:
                    typeof previousParams.collision === 'boolean' ? previousParams.collision : false,
                  points: normalizedPoints
                }
              }
              : node
          ),
          selectedNodeId: selectedNodeForVisualEditing.id,
          selectedNodeIds: [selectedNodeForVisualEditing.id],
          selectedEdgeId: null
        }))
        return
      }

      const confirmed = await confirm({
        message: t('dialog.createNodeMessage', 'Create a new follow_path node from the imported path?'),
        title: t('dialog.createNodeTitle', 'Create node')
      })
      if (!confirmed) return

      // Создаём новую follow_path-ноду.
      setRuntime((prev) => {
        const newId = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        const takenNames = new Set<string>(
          prev.nodes.map((n) => String(n.name ?? '').trim()).filter((value) => value.length > 0)
        )

        const anchor =
          prev.nodes.find((node) => node.id === prev.selectedNodeId) ??
          prev.nodes[prev.nodes.length - 1] ??
          null
        const anchorPos = anchor?.position ?? { x: 100, y: 150 }

        const newNode: RuntimeNode = {
          id: newId,
          type: 'follow_path',
          name: suggestUniqueNodeName('Node', takenNames),
          text: '',
          position: { x: anchorPos.x + 250, y: anchorPos.y },
          params: {
            target: '',
            speed_px_sec: 60,
            collision: false,
            points: normalizedPoints
          }
        }

        const newEdges = anchor
          ? [...prev.edges, { id: `edge-${anchor.id}-${newId}`, source: anchor.id, target: newId }]
          : prev.edges

        return {
          ...prev,
          nodes: [...prev.nodes, newNode],
          edges: newEdges,
          selectedNodeId: newId,
          selectedNodeIds: [newId],
          selectedEdgeId: null
        }
      })
    },
    [selectedNodeForVisualEditing, setRuntime, confirm, toasts, t]
  )

  // Импорт actor positions из visual editor обратно в actor_create nodes.
  const importActorsFromVisualEditing = useCallback(
    (
      actors: Array<{
        id: string
        key: string
        x: number
        y: number
        spriteOrObject: string
        isVirtual?: boolean
      }>
    ) => {
      const safeActors = actors
        .filter(
          (actor) =>
            typeof actor.id === 'string' && actor.id.trim().length > 0 && actor.isVirtual !== true
        )
        .map((actor) => ({
          ...actor,
          x: Math.round(Number(actor.x ?? 0)),
          y: Math.round(Number(actor.y ?? 0))
        }))

      if (safeActors.length <= 0) {
        pushWarning(toasts, 'No actor positions to import.', { title: 'Visual Editing' })
        return
      }

      const actorMap = new Map(safeActors.map((actor) => [actor.id, actor]))
      let updatedCount = 0

      setRuntime((prev) => ({
        ...prev,
        nodes: prev.nodes.map((node) => {
          const importedActor = actorMap.get(node.id)
          if (!importedActor || node.type !== 'actor_create') {
            return node
          }

          updatedCount += 1
          return {
            ...node,
            params: {
              ...(node.params ?? {}),
              x: importedActor.x,
              y: importedActor.y
            }
          }
        })
      }))

      if (updatedCount <= 0) {
        pushWarning(toasts, 'Imported actor markers do not match any actor_create nodes.', { title: 'Visual Editing' })
      }
    },
    [setRuntime, toasts]
  )

  // Открываем отдельное native окно visual editor и сразу отправляем туда текущий snapshot.
  const openVisualEditorWindow = useCallback(() => {
    setVisualEditingOpen(true)

    // Open уже передаёт snapshot в main.
    lastVisualEditorBridgeSyncKeyRef.current = visualEditorBridgeStateSyncKey

    window.api.visualEditor
      .open(visualEditorBridgeState)
      .catch((error) => {
        console.warn('Failed to open visual editor window:', error)
        lastVisualEditorBridgeSyncKeyRef.current = null
        setVisualEditingOpen(false)
      })
  }, [visualEditorBridgeState, visualEditorBridgeStateSyncKey])

  // Пока visual editor окно открыто, держим его snapshot синхронным с main editor state.
  useEffect(() => {
    if (!visualEditingOpen) return

    if (lastVisualEditorBridgeSyncKeyRef.current === visualEditorBridgeStateSyncKey) {
      return
    }

    lastVisualEditorBridgeSyncKeyRef.current = visualEditorBridgeStateSyncKey

    void window.api.visualEditor.syncState(visualEditorBridgeState).catch((error) => {
      console.warn('Failed to sync visual editor state:', error)
      lastVisualEditorBridgeSyncKeyRef.current = null
    })
  }, [visualEditingOpen, visualEditorBridgeState, visualEditorBridgeStateSyncKey])

  // Импорт path: отдельное окно шлёт points через bridge.
  useEffect(() => {
    return window.api.visualEditor.onImportPath((points) => {
      importPathFromVisualEditing(points)
    })
  }, [importPathFromVisualEditing])

  // Импорт actors: отдельное окно шлёт staged positions через bridge.
  useEffect(() => {
    return window.api.visualEditor.onImportActors((actors) => {
      importActorsFromVisualEditing(actors)
    })
  }, [importActorsFromVisualEditing])

  // Когда пользователь закрывает native окно с системной рамки,
  // main сообщает об этом сюда, чтобы локальное состояние не зависало в open=true.
  useEffect(() => {
    return window.api.visualEditor.onWindowClosed(() => {
      setVisualEditingOpen(false)
      lastVisualEditorBridgeSyncKeyRef.current = null

      // Возвращаем keyboard focus в основной editor root.
      requestAnimationFrame(() => {
        rootRef.current?.focus()
      })
    })
  }, [])

  return {
    visualEditingOpen,
    screenshotRooms,
    selectedNodeForVisualEditing,
    selectedVisualPathPoints,
    selectedVisualActorTarget,
    visualEditorActorPreviews,
    roomScreenshotSearchDirs,
    openVisualEditorWindow
  }
}
