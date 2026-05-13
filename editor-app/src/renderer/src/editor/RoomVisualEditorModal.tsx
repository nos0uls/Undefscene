import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from 'react'
import { createTranslator, type SupportedLanguage } from '../i18n'
import { RoomVisualEditorOverlay } from './RoomVisualEditorOverlay'
import { SearchableSelect } from './SearchableSelect'
import { RoomVisualEditorToolbar } from './RoomVisualEditorToolbar'
import { RoomVisualEditorSidebar } from './RoomVisualEditorSidebar'
import { RoomVisualEditorViewport } from './RoomVisualEditorViewport'
import { RoomVisualEditorCanvas } from './RoomVisualEditorCanvas'
import { useRoomVisualEditorState } from './RoomVisualEditorState'
import { getAccentCssVariables } from './usePreferences'
import { usePreferencesContext } from './PreferencesContext'
import {
  type RoomScreenshotBundle,
  type VisualEditorSelectedNode,
  type VisualEditorActorPreview,
  type LoadedActorSpritePreview
} from './RoomVisualEditorTypes'
import {
  usePathEditorLogic,
  PATH_GRID_STEP,
  PATH_ERASE_RADIUS,
  simplifyPathPoints,
  arePathPointsEqual,
  buildPreparedPathSegments,
  getPathPointsSyncKey
} from './usePathEditorLogic'
import {
  useActorEditorLogic,
  ACTOR_MARKER_RADIUS,
  getActorPreviewsSyncKey,
  getPointAtDistanceOnPreparedPath
} from './useActorEditorLogic'
import { useViewportControls, MIN_ZOOM, MAX_ZOOM, clamp } from './useViewportControls'

// Пропсы окна visual editing.
type RoomVisualEditorModalProps = {
  open: boolean
  variant?: 'modal' | 'window'
  rooms: string[]
  screenshotRooms: string[]
  projectDir: string | null
  roomScreenshotsDir: string | null
  techMode: boolean
  selectedNode: VisualEditorSelectedNode
  selectedActorTarget: string | null
  selectedPathPoints: Array<{ x: number; y: number }>
  actorPreviews: VisualEditorActorPreview[]
  language: SupportedLanguage
  onImportPath: (points: Array<{ x: number; y: number }>) => void
  onImportActors: (actors: VisualEditorActorPreview[]) => void
  onClose: () => void
}

// Константы MIN_ZOOM, MAX_ZOOM, PATH_GRID_STEP, PATH_ERASE_RADIUS, ACTOR_MARKER_RADIUS и функция clamp
// теперь вынесены в useViewportControls, usePathEditorLogic и useActorEditorLogic

// Округляем координату к рабочей сетке visual editor.
// Так path points остаются чистыми и предсказуемыми при импорте обратно в graph.
function snapToGrid(value: number, step: number): number {
  return Math.round(value / step) * step
}

// Округляем координату к сетке с пользовательским offset.
// Это позволяет подстроить snap под реальную локальную фазу room grid.
function snapToGridWithOffset(value: number, step: number, offset: number): number {
  return snapToGrid(value - offset, step) + offset
}

// Отдельное окно room visual editing.
// Здесь пользователь может выбрать room и увидеть stitched preview без подмешивания его в main canvas background.
export function RoomVisualEditorModal({
  open,
  variant = 'modal',
  screenshotRooms,
  projectDir,
  roomScreenshotsDir,
  techMode,
  selectedNode,
  selectedActorTarget,
  selectedPathPoints,
  actorPreviews,
  language,
  onImportPath,
  onImportActors,
  onClose
}: RoomVisualEditorModalProps): React.JSX.Element | null {
  // Translator нужен для коротких UI строк внутри окна.
  const t = useMemo(() => createTranslator(language), [language])

  // Локально читаем persisted настройки Visual Editing.
  // Так и modal, и отдельное окно используют один общий settings storage.
  const { preferences, updatePreferences } = usePreferencesContext()

  // Overlay ref нужен, чтобы закрывать окно кликом по затемнённому фону.
  const overlayRef = useRef<HTMLDivElement | null>(null)

  // Viewport и canvas refs нужны для fit, pan и stitch draw.
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Уже склеенные комнаты кешируем по cacheKey из main.
  // Это резко сокращает повторные stitch-операции при reopen/focus/refresh одной и той же room.
  const stitchedRoomCacheRef = useRef<Map<string, string>>(new Map())
  const gridPatternId = useId().replace(/:/g, '-')

  // Управление состоянием room: selectedRoom, bundle, isLoading, errorMessage
  const roomState = useRoomVisualEditorState({
    open,
    screenshotRooms,
    projectDir,
    roomScreenshotsDir,
    language,
    onRoomChange: (room) => {
      // Обработчик смены комнаты будет использован в useEffect
    }
  })

  const { selectedRoom, bundle, isLoading, errorMessage, availableRooms, handleRoomChange, handleRefresh } =
    roomState

  // Короткие алиасы для local settings Visual Editing.
  // Это упрощает чтение формул ниже и делает intent более явным.
  const visualGridOffsetX = preferences.visualEditorGridOffsetX
  const visualGridOffsetY = preferences.visualEditorGridOffsetY
  const visualEditorShowGrid = preferences.visualEditorShowGrid
  const visualEditorSnapToGrid = preferences.visualEditorSnapToGrid
  const visualPathSizeMultiplier = preferences.visualEditorPathSizeMultiplier

  // Отдельное окно Visual Editing не обязано жить рядом с EditorShell.
  // Поэтому акцентные CSS variables считаем локально и прокидываем прямо в корневой контейнер.
  const accentCssVariables = useMemo(
    () => getAccentCssVariables(preferences) as CSSProperties,
    [preferences]
  )

  // Управление path editor
  const pathEditor = usePathEditorLogic({
    open,
    selectedPathPoints,
    selectedNode,
    onImportPath,
    clearTransientInteractionState
  })

  const {
    draftPathPoints,
    pathPreviewPoint,
    preparedDraftPathSegments,
    preparedDraftPathTotalLength,
    draftPathPolyline,
    draftPathPointsRef,
    pathDrawRef,
    setPathPreviewPoint,
    commitDraftPathPoints,
    appendDraftPathPoint,
    eraseDraftPathPoints,
    clearDraftPath,
    importDraftPath,
    undoPath,
    redoPath
  } = pathEditor

  // Активный инструмент visual editor.
  // Select двигает actor markers, pencil/eraser редактируют path, null оставляет только pan.
  const [activeTool, setActiveTool] = useState<'select' | 'pencil' | 'eraser' | null>(null)


  // Управление actor editor
  const actorEditor = useActorEditorLogic({
    open,
    actorPreviews,
    selectedActorTarget,
    projectDir,
    preparedDraftPathSegments,
    preparedDraftPathTotalLength,
    onImportActors
  })

  const {
    draftActors,
    selectedActorId,
    isActorPlacementMode,
    isPlayPreviewRunning,
    playPreviewPoint,
    selectedActor,
    hasImportableActors,
    actorOptionEntries,
    actorSpritePreviews,
    actorDragRef,
    setDraftActors,
    setSelectedActorId,
    setIsActorPlacementMode,
    stopPlayPreview,
    togglePlayPreview,
    importDraftActors,
    findActorAtPoint,
    getActorSpritePreview
  } = actorEditor
    pointerId: number
    actorId: string
    startWorldPoint: { x: number; y: number }
    startActorX: number
    startActorY: number
  } | null>(null)

  // Во время path drawing держим отдельный drag-state.
  // Он позволяет различать freehand pencil и straight-line режим с модификаторами.
  const pathDrawRef = useRef<{
    pointerId: number
    tool: 'pencil' | 'eraser'
    anchorPoint: { x: number; y: number } | null
    latestPoint: { x: number; y: number } | null
    isStraightSegment: boolean
  } | null>(null)

  // Последняя позиция курсора над viewport нужна,
  // чтобы Shift-preview обновлялся сразу даже без нового движения мыши.
  const hoverClientPointRef = useRef<{ clientX: number; clientY: number } | null>(null)

  // Последние upstream-keys нужны, чтобы не сбрасывать локальный draft на каждый bridge sync.
  // Это особенно важно для отдельного окна Visual Editing, где main часто присылает одинаковый snapshot.
  const lastSyncedActorsKeyRef = useRef<string | null>(null)

  // RAF throttling для path preview, actor drag и viewport pan.
  // Это уменьшает количество ререндеров при быстром движении мыши.
  const pathPreviewRafRef = useRef<number | null>(null)
  const actorDragRafRef = useRef<number | null>(null)
  const viewportPanRafRef = useRef<number | null>(null)

  // Сбрасываем временные drag/preview состояния.
  // Так viewport не застревает в старом pointer-state после blur или отмены действий.
  const clearTransientInteractionState = useCallback((): void => {
    dragPanRef.current = null
    actorDragRef.current = null
    pathDrawRef.current = null
    hoverClientPointRef.current = null
    setPathPreviewPoint(null)
  }, [])

  // Управление viewport: zoom и pan offset.
  const viewportControls = useViewportControls({
    bundle,
    stopPlayPreview,
    clearTransientInteractionState
  })

  const {
    zoom,
    offset,
    viewportRef,
    dragPanRef,
    setZoom,
    setOffset,
    resetView,
    fitToViewport,
    zoomAroundClientPoint,
    zoomIn,
    zoomOut,
    handleViewportWheel
  } = viewportControls

  // Хелпер переводит pointer position в world-space координаты комнаты.
  // Это основа и для path drawing, и для actor placement.
  const getWorldPointFromClient = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const meta = bundle?.meta
      const viewport = viewportRef.current
      if (!meta || !viewport) return null

      const rect = viewport.getBoundingClientRect()
      const rawX = (clientX - rect.left - offset.x) / zoom
      const rawY = (clientY - rect.top - offset.y) / zoom

      return {
        x: clamp(Math.round(rawX), 0, meta.room_width),
        y: clamp(Math.round(rawY), 0, meta.room_height)
      }
    },
    [bundle, offset, zoom]
  )

  // Применяем keyboard modifiers к path point.
  // Shift включает HV lock, а snap к шагу 20 px держит точки на рабочей сетке.
  const applyPathPointModifiers = useCallback(
    (
      point: { x: number; y: number },
      options: {
        anchorPoint: { x: number; y: number } | null
        useHvLock: boolean
        useGridSnap: boolean
      }
    ): { x: number; y: number } => {
      const meta = bundle?.meta
      // eslint-disable-next-line prefer-const
      let nextPoint = { ...point }

      if (options.useHvLock && options.anchorPoint) {
        const dx = Math.abs(nextPoint.x - options.anchorPoint.x)
        const dy = Math.abs(nextPoint.y - options.anchorPoint.y)

        if (dx >= dy) {
          nextPoint.y = options.anchorPoint.y
        } else {
          nextPoint.x = options.anchorPoint.x
        }
      }

      if (options.useGridSnap && visualEditorSnapToGrid) {
        nextPoint.x = snapToGridWithOffset(nextPoint.x, PATH_GRID_STEP, visualGridOffsetX)
        nextPoint.y = snapToGridWithOffset(nextPoint.y, PATH_GRID_STEP, visualGridOffsetY)
      }

      if (!meta) {
        return nextPoint
      }

      return {
        x: clamp(nextPoint.x, 0, meta.room_width),
        y: clamp(nextPoint.y, 0, meta.room_height)
      }
    },
    [bundle, visualEditorSnapToGrid, visualGridOffsetX, visualGridOffsetY]
  )

  // Получаем итоговую world-space точку из client coordinates,
  // чтобы hover-preview, drag-tools и keyboard modifiers работали одинаково.
  const getPathPointFromClient = useCallback(
    (
      clientX: number,
      clientY: number,
      anchorPoint: { x: number; y: number } | null,
      options: {
        useHvLock: boolean
        useGridSnap: boolean
      }
    ): { x: number; y: number } | null => {
      const worldPoint = getWorldPointFromClient(clientX, clientY)
      if (!worldPoint) return null

      return applyPathPointModifiers(worldPoint, {
        anchorPoint,
        useHvLock: options.useHvLock,
        useGridSnap: options.useGridSnap
      })
    },
    [applyPathPointModifiers, getWorldPointFromClient]
  )

  // Получаем итоговую world-space точку прямо из pointer event,
  // чтобы все path-инструменты использовали одну и ту же логику модификаторов.
  const getPathPointFromPointerEvent = useCallback(
    (
      event: ReactPointerEvent<HTMLDivElement>,
      anchorPoint: { x: number; y: number } | null
    ): { x: number; y: number } | null => {
      return getPathPointFromClient(event.clientX, event.clientY, anchorPoint, {
        useHvLock: event.shiftKey,
        useGridSnap: true
      })
    },
    [getPathPointFromClient]
  )

  // Когда окно открылось и список screenshot rooms уже известен,
  // подставляем первую room по умолчанию, если текущая ещё невалидна.
  useEffect(() => {
    if (!open) return
    if (availableRooms.length <= 0) {
      setSelectedRoom('')
      return
    }

    if (!selectedRoom || !availableRooms.includes(selectedRoom)) {
      setSelectedRoom(availableRooms[0])
    }
  }, [availableRooms, open, selectedRoom])

  // Закрытие по Escape и локальные Ctrl+Z / Ctrl+Y для path history.
  // Undo/redo должны работать даже если фокус сейчас попал в room selector input.
  useEffect(() => {
    if (!open) return

    const updateHoverPreviewFromModifiers = (shiftKey: boolean): void => {
      if (activeTool !== 'pencil' && activeTool !== 'eraser') return
      if (pathDrawRef.current) return

      const hoverPoint = hoverClientPointRef.current
      if (!hoverPoint) return

      const anchorPoint = draftPathPointsRef.current[draftPathPointsRef.current.length - 1] ?? null
      const nextPoint = getPathPointFromClient(
        hoverPoint.clientX,
        hoverPoint.clientY,
        anchorPoint,
        {
          useHvLock: shiftKey,
          useGridSnap: true
        }
      )

      setPathPreviewPoint(nextPoint)
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase()
      const code = event.code

      const target = event.target as HTMLElement | null
      const tag = target?.tagName ?? ''
      const inputType =
        tag === 'INPUT' ? ((target as HTMLInputElement | null)?.type ?? '').toLowerCase() : ''
      const isTypingTarget =
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (tag === 'INPUT' &&
          !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(
            inputType
          )) ||
        target?.closest('[contenteditable="true"]') !== null

      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && key === 'z') {
        event.preventDefault()
        event.stopPropagation()

        const nextIndex = pathHistoryIndexRef.current - 1
        if (nextIndex < 0) return

        const nextPoints = (pathHistoryRef.current[nextIndex] ?? []).map((point) => ({ ...point }))
        pathHistoryIndexRef.current = nextIndex
        draftPathPointsRef.current = nextPoints
        setDraftPathPoints(nextPoints)
        return
      }

      if (
        ((event.ctrlKey || event.metaKey) && !event.altKey && key === 'y') ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'z')
      ) {
        event.preventDefault()
        event.stopPropagation()

        const nextIndex = pathHistoryIndexRef.current + 1
        if (nextIndex >= pathHistoryRef.current.length) return

        const nextPoints = (pathHistoryRef.current[nextIndex] ?? []).map((point) => ({ ...point }))
        pathHistoryIndexRef.current = nextIndex
        draftPathPointsRef.current = nextPoints
        setDraftPathPoints(nextPoints)
        return
      }

      if (key === 'shift' || key === 'control') {
        updateHoverPreviewFromModifiers(event.shiftKey)
      }

      // Для буквенных shortcuts используем KeyboardEvent.code.
      // Так B/G/Ctrl+E продолжают работать даже на русской раскладке.
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        code === 'KeyB' &&
        !isTypingTarget
      ) {
        event.preventDefault()
        stopPlayPreview()
        clearTransientInteractionState()
        // Повторное нажатие hotkey выключает инструмент.
        // Это возвращает окно в обычный режим pan без лишнего клика по кнопке Stop Drawing.
        setActiveTool((prev) => (prev === 'pencil' ? null : 'pencil'))
        setIsActorPlacementMode(false)
        return
      }

      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        code === 'KeyG' &&
        !isTypingTarget
      ) {
        event.preventDefault()
        stopPlayPreview()
        clearTransientInteractionState()
        // То же поведение для eraser.
        // Повторный hotkey быстро возвращает пользователя к простому перетаскиванию viewport.
        setActiveTool((prev) => (prev === 'eraser' ? null : 'eraser'))
        setIsActorPlacementMode(false)
        return
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        code === 'KeyE' &&
        !isTypingTarget
      ) {
        event.preventDefault()
        event.stopPropagation()
        if (draftPathPointsRef.current.length > 0) {
          onImportPath(simplifyPathPoints(draftPathPointsRef.current))
        }
        return
      }

      if (event.key !== 'Escape') return
      event.preventDefault()

      stopPlayPreview()
      clearTransientInteractionState()
      onClose()
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase()
      if (key === 'shift' || key === 'control') {
        updateHoverPreviewFromModifiers(event.shiftKey)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [
    activeTool,
    clearTransientInteractionState,
    getPathPointFromClient,
    onClose,
    onImportPath,
    open,
    stopPlayPreview
  ])

  // Сбрасываем визуальное состояние, когда пользователь явно меняет room.
  useEffect(() => {
    if (!open || !selectedRoom) return
    resetView()
    setActiveTool(null)
    setIsActorPlacementMode(false)
    stopPlayPreview()
    clearTransientInteractionState()
  }, [clearTransientInteractionState, open, selectedRoom, stopPlayPreview, resetView])



  // Stitch draw: собираем все тайлы на один canvas.
  // Тут renderer удобнее всего, потому что canvas API уже рядом с UI tool surface.
  useEffect(() => {
    const canvas = canvasRef.current
    const meta = bundle?.meta

    if (!canvas || !meta) {
      if (canvas) {
        canvas.width = 1
        canvas.height = 1
        const ctx = canvas.getContext('2d')
        ctx?.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }

    let cancelled = false

    const draw = async (): Promise<void> => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const roomWidth = Math.max(1, Math.round(meta.room_width))
      const roomHeight = Math.max(1, Math.round(meta.room_height))
      canvas.width = roomWidth
      canvas.height = roomHeight
      ctx.clearRect(0, 0, roomWidth, roomHeight)
      ctx.imageSmoothingEnabled = false

      const cachedStitchedRoom = bundle?.cacheKey
        ? stitchedRoomCacheRef.current.get(bundle.cacheKey)
        : null
      if (cachedStitchedRoom) {
        const cachedImage = await loadImage(cachedStitchedRoom)
        if (cancelled) return
        ctx.drawImage(cachedImage, 0, 0, roomWidth, roomHeight)
        setErrorMessage(null)
        return
      }

      const loadedTiles = await Promise.all(
        (bundle?.tiles ?? []).map(async (tile) => ({
          tile,
          image: await loadImage(tile.dataUrl)
        }))
      )

      if (cancelled) return

      for (const { tile, image } of loadedTiles) {
        const rawX = tile.col * meta.capture_width
        const rawY = tile.row * meta.capture_height

        // Позицию и размер тайла берём из meta contract,
        // а не из natural image size. Это важно для стабильного stitch,
        // если браузер/Electron отдаёт PNG с неожиданным scale factor.
        const tileWidth = Math.max(1, Math.round(meta.capture_width))
        const tileHeight = Math.max(1, Math.round(meta.capture_height))

        // Для edge clamp последний tile всё равно рисуем так,
        // чтобы он заканчивался ровно на границе комнаты.
        const drawX = Math.max(0, Math.min(rawX, roomWidth - tileWidth))
        const drawY = Math.max(0, Math.min(rawY, roomHeight - tileHeight))
        ctx.drawImage(image, drawX, drawY, tileWidth, tileHeight)
      }

      if (bundle?.cacheKey) {
        if (stitchedRoomCacheRef.current.has(bundle.cacheKey)) {
          stitchedRoomCacheRef.current.delete(bundle.cacheKey)
        }

        stitchedRoomCacheRef.current.set(bundle.cacheKey, canvas.toDataURL('image/png'))
        while (stitchedRoomCacheRef.current.size > 8) {
          const oldestKey = stitchedRoomCacheRef.current.keys().next().value
          if (!oldestKey) {
            break
          }
          stitchedRoomCacheRef.current.delete(oldestKey)
        }
      }

      setErrorMessage(null)
    }

    void draw().catch((error) => {
      console.warn('Failed to stitch room screenshot tiles:', error)
      if (!cancelled) {
        setErrorMessage(t('editor.visualEditingFailedToStitch', 'Failed to stitch room preview.'))
      }
    })

    return () => {
      cancelled = true
    }
  }, [bundle, t])



  // Pointer drag нужен для ручного pan по stitched room preview.
  const handleViewportPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (activeTool === 'pencil' || activeTool === 'eraser') {
        if (event.button !== 0) return

        const anchorPoint =
          draftPathPointsRef.current[draftPathPointsRef.current.length - 1] ?? null
        const worldPoint = getPathPointFromPointerEvent(event, anchorPoint)
        if (!worldPoint) return

        pathDrawRef.current = {
          pointerId: event.pointerId,
          tool: activeTool,
          anchorPoint,
          latestPoint: worldPoint,
          isStraightSegment: event.shiftKey
        }

        setPathPreviewPoint(worldPoint)
        event.currentTarget.setPointerCapture(event.pointerId)

        if (activeTool === 'eraser') {
          eraseDraftPathPoints(worldPoint)
          return
        }

        if (!pathDrawRef.current.isStraightSegment) {
          appendDraftPathPoint(worldPoint)
        }

        return
      }

      if (isActorPlacementMode) {
        return
      }

      if (event.button !== 0) return

      const worldPoint = getWorldPointFromClient(event.clientX, event.clientY)

      if (activeTool === 'select' && worldPoint) {
        const matchedActor = findActorAtPoint(worldPoint)
        if (matchedActor) {
          stopPlayPreview()
          setSelectedActorId(matchedActor.id)
          actorDragRef.current = {
            pointerId: event.pointerId,
            actorId: matchedActor.id,
            startWorldPoint: worldPoint,
            startActorX: matchedActor.x,
            startActorY: matchedActor.y
          }
          event.currentTarget.setPointerCapture(event.pointerId)
          return
        }
      }

      dragPanRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startOffsetX: offset.x,
        startOffsetY: offset.y
      }

      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [
      activeTool,
      appendDraftPathPoint,
      eraseDraftPathPoints,
      findActorAtPoint,
      getPathPointFromPointerEvent,
      getWorldPointFromClient,
      isActorPlacementMode,
      offset,
      stopPlayPreview
    ]
  )

  const handleViewportPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      hoverClientPointRef.current = {
        clientX: event.clientX,
        clientY: event.clientY
      }

      const pathDrawState = pathDrawRef.current
      if (pathDrawState && pathDrawState.pointerId === event.pointerId) {
        const nextPoint = getPathPointFromPointerEvent(event, pathDrawState.anchorPoint)
        if (!nextPoint) return

        pathDrawState.latestPoint = nextPoint

        // RAF throttling для path preview
        if (pathPreviewRafRef.current !== null) {
          window.cancelAnimationFrame(pathPreviewRafRef.current)
        }
        pathPreviewRafRef.current = requestAnimationFrame(() => {
          setPathPreviewPoint(nextPoint)
          pathPreviewRafRef.current = null
        })

        if (pathDrawState.tool === 'eraser') {
          eraseDraftPathPoints(nextPoint)
          return
        }

        if (!pathDrawState.isStraightSegment) {
          appendDraftPathPoint(nextPoint)
        }

        return
      }

      if ((activeTool === 'pencil' || activeTool === 'eraser') && !pathDrawState) {
        const anchorPoint =
          draftPathPointsRef.current[draftPathPointsRef.current.length - 1] ?? null
        const nextPoint = getPathPointFromPointerEvent(event, anchorPoint)

        // RAF throttling для path preview
        if (pathPreviewRafRef.current !== null) {
          window.cancelAnimationFrame(pathPreviewRafRef.current)
        }
        pathPreviewRafRef.current = requestAnimationFrame(() => {
          setPathPreviewPoint(nextPoint)
          pathPreviewRafRef.current = null
        })
      }

      const actorDragState = actorDragRef.current
      if (actorDragState && actorDragState.pointerId === event.pointerId) {
        const worldPoint = getWorldPointFromClient(event.clientX, event.clientY)
        const meta = bundle?.meta
        if (!worldPoint || !meta) return

        const deltaX = worldPoint.x - actorDragState.startWorldPoint.x
        const deltaY = worldPoint.y - actorDragState.startWorldPoint.y
        const nextX = clamp(Math.round(actorDragState.startActorX + deltaX), 0, meta.room_width)
        const nextY = clamp(Math.round(actorDragState.startActorY + deltaY), 0, meta.room_height)

        // RAF throttling для actor drag
        if (actorDragRafRef.current !== null) {
          window.cancelAnimationFrame(actorDragRafRef.current)
        }
        actorDragRafRef.current = requestAnimationFrame(() => {
          setDraftActors((prev) =>
            prev.map((actor) =>
              actor.id === actorDragState.actorId ? { ...actor, x: nextX, y: nextY } : actor
            )
          )
          actorDragRafRef.current = null
        })
        return
      }

      const dragState = dragPanRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) return

      const deltaX = event.clientX - dragState.startClientX
      const deltaY = event.clientY - dragState.startClientY
      const nextOffsetX = dragState.startOffsetX + deltaX
      const nextOffsetY = dragState.startOffsetY + deltaY

      // RAF throttling для viewport pan
      if (viewportPanRafRef.current !== null) {
        window.cancelAnimationFrame(viewportPanRafRef.current)
      }
      viewportPanRafRef.current = requestAnimationFrame(() => {
        setOffset({
          x: nextOffsetX,
          y: nextOffsetY
        })
        viewportPanRafRef.current = null
      })
    },
    [
      activeTool,
      appendDraftPathPoint,
      bundle,
      eraseDraftPathPoints,
      getPathPointFromPointerEvent,
      getWorldPointFromClient
    ]
  )

  const handleViewportPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const pathDrawState = pathDrawRef.current
      if (pathDrawState && pathDrawState.pointerId === event.pointerId) {
        if (
          pathDrawState.tool === 'pencil' &&
          pathDrawState.isStraightSegment &&
          pathDrawState.latestPoint
        ) {
          appendDraftPathPoint(pathDrawState.latestPoint)
        }

        // Отменяем pending RAF для path preview
        if (pathPreviewRafRef.current !== null) {
          window.cancelAnimationFrame(pathPreviewRafRef.current)
          pathPreviewRafRef.current = null
        }

        pathDrawRef.current = null
        setPathPreviewPoint(null)
        event.currentTarget.releasePointerCapture(event.pointerId)
        return
      }

      const actorDragState = actorDragRef.current
      if (actorDragState && actorDragState.pointerId === event.pointerId) {
        // Отменяем pending RAF для actor drag
        if (actorDragRafRef.current !== null) {
          window.cancelAnimationFrame(actorDragRafRef.current)
          actorDragRafRef.current = null
        }

        actorDragRef.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
        return
      }

      const dragState = dragPanRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) return

      // Отменяем pending RAF для viewport pan
      if (viewportPanRafRef.current !== null) {
        window.cancelAnimationFrame(viewportPanRafRef.current)
        viewportPanRafRef.current = null
      }

      dragPanRef.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
    },
    [appendDraftPathPoint]
  )

  // Когда курсор уходит из viewport без активного drag,
  // прячем hover preview, чтобы не оставалась старая точка на экране.
  const handleViewportPointerLeave = useCallback((): void => {
    hoverClientPointRef.current = null
    if (!pathDrawRef.current) {
      setPathPreviewPoint(null)
    }
  }, [])

  // Клик по viewport переносит выбранного actor marker в нужное место.
  // Path drawing обрабатывается отдельно через pointer events, чтобы поддержать drag-tools.
  const handleViewportClick = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const worldPoint = getWorldPointFromClient(event.clientX, event.clientY)
      if (!worldPoint) return

      if (isActorPlacementMode && selectedActorId) {
        stopPlayPreview()
        setDraftActors((prev) =>
          prev.map((actor) =>
            actor.id === selectedActorId ? { ...actor, x: worldPoint.x, y: worldPoint.y } : actor
          )
        )
        setIsActorPlacementMode(false)
        return
      }

      if (activeTool === 'select') {
        const matchedActor = findActorAtPoint(worldPoint)
        setSelectedActorId(matchedActor?.id ?? null)
      }
    },
    [
      activeTool,
      findActorAtPoint,
      getWorldPointFromClient,
      isActorPlacementMode,
      selectedActorId,
      stopPlayPreview
    ]
  )

  const clearDraftPath = useCallback((): void => {
    commitDraftPathPoints([])
  }, [commitDraftPathPoints])

  const importDraftPath = useCallback((): void => {
    onImportPath(simplifyPathPoints(draftPathPoints))
  }, [draftPathPoints, onImportPath])

  // Actor markers импортируем отдельным явным действием.
  // Так пользователь может сначала спокойно расставить несколько preview markers,
  // а уже потом одним кликом применить их обратно к actor_create nodes в graph.
  const importDraftActors = useCallback((): void => {
    const importableActors = draftActors.filter((actor) => actor.isVirtual !== true)
    if (importableActors.length <= 0) {
      return
    }
    onImportActors(importableActors)
  }, [draftActors, onImportActors])

  // SVG polyline удобно рисовать прямо поверх stitched canvas,
  // потому что точки и подписи остаются независимыми от самого PNG слоя.
  const draftPathPolyline = useMemo(
    () => draftPathPoints.map((point) => `${point.x},${point.y}`).join(' '),
    [draftPathPoints]
  )

  // Preview-сегмент помогает видеть итог straight-line до отпускания кнопки мыши.
  const draftPathPreviewPolyline = useMemo(() => {
    if (!pathPreviewPoint || draftPathPoints.length <= 0 || activeTool !== 'pencil') {
      return ''
    }

    const anchorPoint = draftPathPoints[draftPathPoints.length - 1]
    if (!anchorPoint) return ''

    if (anchorPoint.x === pathPreviewPoint.x && anchorPoint.y === pathPreviewPoint.y) {
      return ''
    }

    return `${anchorPoint.x},${anchorPoint.y} ${pathPreviewPoint.x},${pathPreviewPoint.y}`
  }, [activeTool, draftPathPoints, pathPreviewPoint])

  const selectedActor = useMemo(
    () => draftActors.find((actor) => actor.id === selectedActorId) ?? null,
    [draftActors, selectedActorId]
  )

  // Виртуальные actor previews нужны только для локального preview.
  // Их нельзя импортировать назад как actor_create nodes.
  const hasImportableActors = useMemo(
    () => draftActors.some((actor) => actor.isVirtual !== true),
    [draftActors]
  )

  // Для preview сначала используем actor_sprite из actor_create.
  // Если его нет, virtual actor может попробовать свой key как имя ресурса.
  const getActorSpritePreview = useCallback(
    (actor: VisualEditorActorPreview): LoadedActorSpritePreview | null => {
      const directResource = actor.spriteOrObject.trim()
      if (directResource && actorSpritePreviews[directResource]) {
        return actorSpritePreviews[directResource]
      }

      const fallbackResource = actor.isVirtual ? actor.key.trim() : ''
      if (fallbackResource && actorSpritePreviews[fallbackResource]) {
        return actorSpritePreviews[fallbackResource]
      }

      return null
    },
    [actorSpritePreviews]
  )

  // Для dropdown собираем уникальные label-строки.
  // Это убирает неоднозначность, если в graph несколько актёров с одинаковым key.
  const actorOptionEntries = useMemo(
    () =>
      draftActors.map((actor, index) => ({
        id: actor.id,
        label: `${actor.key || actor.id} · ${actor.spriteOrObject || (actor.isVirtual ? 'virtual' : 'actor')} · #${index + 1}`
      })),
    [draftActors]
  )

  // Визуальный множитель влияет только на path line и path points.
  // Actor markers и их labels оставляем без изменений, как и просили.
  const pathLineStrokeWidth = useMemo(
    () => Number((4 * visualPathSizeMultiplier).toFixed(2)),
    [visualPathSizeMultiplier]
  )

  const pathPreviewStrokeWidth = useMemo(
    () => Number((3 * visualPathSizeMultiplier).toFixed(2)),
    [visualPathSizeMultiplier]
  )

  const pathPointRadius = useMemo(
    () => Number((PATH_POINT_RADIUS * visualPathSizeMultiplier).toFixed(2)),
    [visualPathSizeMultiplier]
  )

  const pathPreviewPointRadius = useMemo(
    () => Number((PATH_PREVIEW_POINT_RADIUS * visualPathSizeMultiplier).toFixed(2)),
    [visualPathSizeMultiplier]
  )

  // Смещение сетки нужно не только для snap, но и для видимого grid overlay.
  // Иначе пользователь меняет offset, а визуально не понимает, что именно сдвинулось.
  const gridPhaseX = useMemo(
    () => ((visualGridOffsetX % PATH_GRID_STEP) + PATH_GRID_STEP) % PATH_GRID_STEP,
    [visualGridOffsetX]
  )
  const gridPhaseY = useMemo(
    () => ((visualGridOffsetY % PATH_GRID_STEP) + PATH_GRID_STEP) % PATH_GRID_STEP,
    [visualGridOffsetY]
  )

  // Универсальный helper для numeric полей local settings.
  // Он держит значения в безопасных границах и сразу сохраняет их в preferences.
  const updateVisualSettingFromNumber = useCallback(
    (
      field:
        | 'visualEditorGridOffsetX'
        | 'visualEditorGridOffsetY'
        | 'visualEditorPathSizeMultiplier',
      value: number
    ): void => {
      if (!Number.isFinite(value)) {
        return
      }

      if (field === 'visualEditorPathSizeMultiplier') {
        updatePreferences({
          visualEditorPathSizeMultiplier: Number(clamp(value, 0.5, 4).toFixed(2))
        })
        return
      }

      if (field === 'visualEditorGridOffsetX') {
        updatePreferences({
          visualEditorGridOffsetX: Math.round(clamp(value, -200, 200))
        })
        return
      }

      updatePreferences({
        visualEditorGridOffsetY: Math.round(clamp(value, -200, 200))
      })
    },
    [updatePreferences]
  )

  // Обработчики для checkbox inputs
  const handleShowGridChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updatePreferences({ visualEditorShowGrid: event.target.checked })
    },
    [updatePreferences]
  )

  const handleSnapToGridChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updatePreferences({ visualEditorSnapToGrid: event.target.checked })
    },
    [updatePreferences]
  )

  // Обработчики для number inputs
  const handleGridOffsetXChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updateVisualSettingFromNumber('visualEditorGridOffsetX', Number(event.target.value))
    },
    [updateVisualSettingFromNumber]
  )

  const handleGridOffsetYChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updateVisualSettingFromNumber('visualEditorGridOffsetY', Number(event.target.value))
    },
    [updateVisualSettingFromNumber]
  )

  const handlePathSizeMultiplierChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updateVisualSettingFromNumber('visualEditorPathSizeMultiplier', Number(event.target.value))
    },
    [updateVisualSettingFromNumber]
  )

  // Основной контент visual editor переиспользуется и для modal, и для standalone window.
  // Разница только в внешней оболочке и размерах контейнера.
  const content = (
    <div
      className={[
        'prefsModal',
        'roomVisualEditorModal',
        variant === 'window' ? 'roomVisualEditorWindow' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      style={accentCssVariables}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="prefsHeader">
        <span className="prefsTitle">{t('editor.visualEditingTitle', 'Visual Editing')}</span>
        <button className="prefsCloseBtn" type="button" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="prefsBody roomVisualEditorBody">
        <RoomVisualEditorToolbar
          availableRooms={availableRooms}
          selectedRoom={selectedRoom}
          onRoomChange={(value) => setSelectedRoom(value)}
          onRefresh={() => setRefreshToken((prev) => prev + 1)}
          zoomIn={zoomIn}
          zoomOut={zoomOut}
          fitToViewport={fitToViewport}
          resetView={resetView}
          selectedNode={selectedNode}
          projectDir={projectDir}
          bundle={bundle}
          t={t}
        />

        <div className="roomVisualEditorLayout">
          <RoomVisualEditorSidebar
            techMode={techMode}
            selectedNode={selectedNode}
            projectDir={projectDir}
            isLoading={isLoading}
            errorMessage={errorMessage}
            bundle={bundle}
            visualEditorShowGrid={visualEditorShowGrid}
            visualEditorSnapToGrid={visualEditorSnapToGrid}
            visualGridOffsetX={visualGridOffsetX}
            visualGridOffsetY={visualGridOffsetY}
            visualPathSizeMultiplier={visualPathSizeMultiplier}
            handleShowGridChange={handleShowGridChange}
            handleSnapToGridChange={handleSnapToGridChange}
            handleGridOffsetXChange={handleGridOffsetXChange}
            handleGridOffsetYChange={handleGridOffsetYChange}
            handlePathSizeMultiplierChange={handlePathSizeMultiplierChange}
            activeTool={activeTool}
            draftPathPoints={draftPathPoints}
            clearDraftPath={clearDraftPath}
            importDraftPath={importDraftPath}
            stopPlayPreview={stopPlayPreview}
            clearTransientInteractionState={clearTransientInteractionState}
            setActiveTool={setActiveTool}
            setIsActorPlacementMode={setIsActorPlacementMode}
            draftActors={draftActors}
            selectedActorId={selectedActorId}
            selectedActor={selectedActor}
            actorOptionEntries={actorOptionEntries}
            isActorPlacementMode={isActorPlacementMode}
            isPlayPreviewRunning={isPlayPreviewRunning}
            togglePlayPreview={togglePlayPreview}
            hasImportableActors={hasImportableActors}
            importDraftActors={importDraftActors}
            zoom={zoom}
            availableRooms={availableRooms}
            selectedRoom={selectedRoom}
            setSelectedActorId={setSelectedActorId}
            t={t}
          />

          <RoomVisualEditorViewport
            viewportRef={viewportRef}
            canvasRef={canvasRef}
            zoom={zoom}
            offset={offset}
            activeTool={activeTool}
            isActorPlacementMode={isActorPlacementMode}
            bundle={bundle}
            gridPatternId={gridPatternId}
            gridPhaseX={gridPhaseX}
            gridPhaseY={gridPhaseY}
            PATH_GRID_STEP={PATH_GRID_STEP}
            PATH_ERASE_RADIUS={PATH_ERASE_RADIUS}
            ACTOR_MARKER_RADIUS={ACTOR_MARKER_RADIUS}
            visualEditorShowGrid={visualEditorShowGrid}
            draftPathPoints={draftPathPoints}
            draftPathPolyline={draftPathPolyline}
            draftPathPreviewPolyline={draftPathPreviewPolyline}
            pathPreviewPoint={pathPreviewPoint}
            pathLineStrokeWidth={pathLineStrokeWidth}
            pathPreviewStrokeWidth={pathPreviewStrokeWidth}
            pathPointRadius={pathPointRadius}
            pathPreviewPointRadius={pathPreviewPointRadius}
            draftActors={draftActors}
            selectedActorId={selectedActorId}
            playPreviewPoint={playPreviewPoint}
            getActorSpritePreview={getActorSpritePreview}
            preferences={preferences}
            handleViewportPointerDown={handleViewportPointerDown}
            handleViewportPointerMove={handleViewportPointerMove}
            handleViewportPointerUp={handleViewportPointerUp}
            handleViewportPointerCancel={handleViewportPointerUp}
            handleViewportPointerLeave={handleViewportPointerLeave}
            handleViewportWheel={handleViewportWheel}
            handleViewportClick={handleViewportClick}
          />
        </div>
      </div>
    </div>
  )

  if (!open) return null

  if (variant === 'window') {
    return <div className="roomVisualEditorWindowRoot">{content}</div>
  }

  return (
    <div
      ref={overlayRef}
      className="prefsOverlay"
      onClick={(event) => {
        if (event.target === overlayRef.current) {
          onClose()
        }
      }}
    >
      {content}
    </div>
  )
}
