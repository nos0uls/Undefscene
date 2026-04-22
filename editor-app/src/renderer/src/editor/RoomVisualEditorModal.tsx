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
import { getAccentCssVariables, usePreferences } from './usePreferences'

// Описание meta.json, который рядом с PNG тайлами пишет GameMaker screenshot runner.
type RoomScreenshotMeta = {
  room_name: string
  file_prefix: string
  room_width: number
  room_height: number
  capture_width: number
  capture_height: number
  rows: number
  cols: number
  naming: string
}

// Один загруженный tile, уже пришедший из main процесса как data URL.
type RoomScreenshotTile = {
  row: number
  col: number
  fileName: string
  dataUrl: string
}

// Полный пакет данных для visual editor окна.
type RoomScreenshotBundle = {
  roomName: string
  sourceDir: string | null
  searchedDirs: string[]
  cacheKey: string | null
  meta: RoomScreenshotMeta | null
  tiles: RoomScreenshotTile[]
  missingTiles: Array<{ row: number; col: number; fileName: string }>
  warning: string | null
}

// Минимальная информация о выбранной ноде,
// чтобы visual editor понимал, что именно он сейчас будет заменять при import.
type VisualEditorSelectedNode = {
  id: string
  type: string
  name?: string
} | null

// Preview actor marker для overlay на room screenshot.
type VisualEditorActorPreview = {
  id: string
  key: string
  x: number
  y: number
  spriteOrObject: string
  isVirtual?: boolean
}

// Загруженный sprite preview для actor overlay.
// Здесь уже лежит data URL и реальные размеры/origin из GameMaker sprite.
type LoadedActorSpritePreview = {
  dataUrl: string
  width: number
  height: number
  xorigin: number
  yorigin: number
  resourceName: string
  resourceKind: 'sprite' | 'object'
}

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

// Ограничения zoom, чтобы окно оставалось управляемым и не улетало в бесконечность.
const MIN_ZOOM = 0.1
const MAX_ZOOM = 8

// Шаг сетки для path points в room coordinates.
// Теперь snap включён всегда, чтобы точки ложились ровно по рабочей сетке.
const PATH_GRID_STEP = 20

// Радиус стирания точек в режиме eraser.
// Держим его умеренным, чтобы можно было удалять отдельные waypoints без грубого захвата.
const PATH_ERASE_RADIUS = 14

// Минимальная дистанция между новыми точками path.
// Это помогает не засорять путь десятками почти одинаковых waypoint'ов при drag.
const PATH_APPEND_MIN_DISTANCE = 16

// Визуальный размер waypoint-точек делаем компактнее,
// чтобы они не перекрывали room preview и не выглядели слишком грубо.
const PATH_POINT_RADIUS = 4
const PATH_PREVIEW_POINT_RADIUS = 4
const ACTOR_MARKER_RADIUS = 8

// Скорость локального preview для Play.
// Этого хватает, чтобы траекторию можно было оценить глазами без слишком резкого рывка.
const PLAY_PREVIEW_SPEED_PX_PER_SEC = 180

// Маленький helper для clamp логики.
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

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

// Сравниваем два массива path points без лишней магии.
// Это помогает не засорять undo/redo history одинаковыми snapshot'ами.
function arePathPointsEqual(
  left: Array<{ x: number; y: number }>,
  right: Array<{ x: number; y: number }>
): boolean {
  if (left.length !== right.length) return false
  return left.every((point, index) => point.x === right[index]?.x && point.y === right[index]?.y)
}

// Упрощаем подряд идущие collinear points.
// Если несколько точек лежат на одной прямой и продолжают один сегмент,
// оставляем только начало и конец этого сегмента.
function simplifyPathPoints(
  points: Array<{ x: number; y: number }>
): Array<{ x: number; y: number }> {
  if (points.length <= 2) {
    return points.map((point) => ({ ...point }))
  }

  const simplified: Array<{ x: number; y: number }> = [
    { ...points[0] },
    { ...points[1] }
  ]

  for (let index = 2; index < points.length; index += 1) {
    const nextPoint = { ...points[index] }
    const middlePoint = simplified[simplified.length - 1]
    const startPoint = simplified[simplified.length - 2]

    const abx = middlePoint.x - startPoint.x
    const aby = middlePoint.y - startPoint.y
    const bcx = nextPoint.x - middlePoint.x
    const bcy = nextPoint.y - middlePoint.y
    const cross = abx * bcy - aby * bcx
    const dot = abx * bcx + aby * bcy

    if (cross === 0 && dot >= 0) {
      simplified[simplified.length - 1] = nextPoint
      continue
    }

    simplified.push(nextPoint)
  }

  return simplified
}

// Подготовленный сегмент пути для Play preview.
// Храним длину и накопленные границы, чтобы не пересчитывать весь путь на каждом кадре.
type PreparedPathSegment = {
  startPoint: { x: number; y: number }
  endPoint: { x: number; y: number }
  startDistance: number
  endDistance: number
  length: number
}

// Собираем сегменты пути один раз на изменение draft path.
// Это уменьшает лаги на длинных путях и в точках перехода между сегментами.
function buildPreparedPathSegments(points: Array<{ x: number; y: number }>): PreparedPathSegment[] {
  const segments: PreparedPathSegment[] = []
  let accumulatedDistance = 0

  for (let index = 1; index < points.length; index += 1) {
    const startPoint = points[index - 1]
    const endPoint = points[index]
    const length = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y)
    if (length <= 0) {
      continue
    }

    segments.push({
      startPoint,
      endPoint,
      startDistance: accumulatedDistance,
      endDistance: accumulatedDistance + length,
      length
    })
    accumulatedDistance += length
  }

  return segments
}

// Короткий key для сравнения path по содержимому, а не по ссылке на массив.
// Это защищает standalone visual editor от лишних reset'ов при одинаковом bridge-state.
function getPathPointsSyncKey(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${Math.round(point.x)}:${Math.round(point.y)}`).join('|')
}

// То же сравнение для actor preview entries.
// Если main прислал новый массив с теми же значениями, локальный draft не надо перетирать.
function getActorPreviewsSyncKey(actors: VisualEditorActorPreview[]): string {
  return actors
    .map((actor) => {
      const spriteOrObject = String(actor.spriteOrObject ?? '')
      return `${actor.id}:${actor.key}:${Math.round(actor.x)}:${Math.round(actor.y)}:${spriteOrObject}:${actor.isVirtual === true ? '1' : '0'}`
    })
    .join('|')
}

// Возвращаем точку на path по дистанции от начала.
// Так локальный preview может плавно идти по нескольким сегментам подряд.
function getPointAtDistanceOnPreparedPath(
  segments: PreparedPathSegment[],
  distance: number,
  fallbackPoint: { x: number; y: number },
  startIndex = 0
): { point: { x: number; y: number }; segmentIndex: number } {
  if (segments.length <= 0) {
    return { point: { ...fallbackPoint }, segmentIndex: 0 }
  }

  const normalizedDistance = Math.max(0, distance)
  let segmentIndex = Math.max(0, Math.min(startIndex, segments.length - 1))

  while (
    segmentIndex < segments.length - 1 &&
    normalizedDistance > segments[segmentIndex].endDistance
  ) {
    segmentIndex += 1
  }

  while (segmentIndex > 0 && normalizedDistance < segments[segmentIndex].startDistance) {
    segmentIndex -= 1
  }

  const segment = segments[segmentIndex]
  if (!segment || segment.length <= 0) {
    return { point: { ...fallbackPoint }, segmentIndex: 0 }
  }

  const localDistance = Math.min(
    segment.length,
    Math.max(0, normalizedDistance - segment.startDistance)
  )
  const t = localDistance / segment.length

  return {
    point: {
      x: Math.round(segment.startPoint.x + (segment.endPoint.x - segment.startPoint.x) * t),
      y: Math.round(segment.startPoint.y + (segment.endPoint.y - segment.startPoint.y) * t)
    },
    segmentIndex
  }
}

// Грузим data URL в HTMLImageElement, чтобы потом можно было нарисовать tile на canvas.
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load tile image'))
    img.src = dataUrl
  })
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
  const { preferences, updatePreferences } = usePreferences()

  // Overlay ref нужен, чтобы закрывать окно кликом по затемнённому фону.
  const overlayRef = useRef<HTMLDivElement | null>(null)

  // Viewport и canvas refs нужны для fit, pan и stitch draw.
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Уже склеенные комнаты кешируем по cacheKey из main.
  // Это резко сокращает повторные stitch-операции при reopen/focus/refresh одной и той же room.
  const stitchedRoomCacheRef = useRef<Map<string, string>>(new Map())
  const gridPatternId = useId().replace(/:/g, '-')

  // Текущая выбранная room.
  const [selectedRoom, setSelectedRoom] = useState<string>('')

  // В room picker показываем только комнаты с готовыми screenshot bundles.
  // Если список пустой, пользователь увидит понятный hint вместо пустых preview-вариантов.
  const availableRooms = useMemo(() => screenshotRooms, [screenshotRooms])

  // Загруженный screenshot bundle для выбранной room.
  const [bundle, setBundle] = useState<RoomScreenshotBundle | null>(null)

  // Простое состояние загрузки и ошибки, чтобы UI был понятнее.
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

  // Управление viewport: zoom и pan offset.
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 24, y: 24 })

  // Счётчик ручного refresh. Увеличиваем его кнопкой Refresh.
  const [refreshToken, setRefreshToken] = useState(0)

  // Draft path points — это локальный path editor поверх stitched room preview.
  // Пользователь может рисовать его кликами и потом импортировать в graph.
  const [draftPathPoints, setDraftPathPoints] = useState<Array<{ x: number; y: number }>>([])

  // Активный инструмент visual editor.
  // Select двигает actor markers, pencil/eraser редактируют path, null оставляет только pan.
  const [activeTool, setActiveTool] = useState<'select' | 'pencil' | 'eraser' | null>(null)

  // Preview точки нужен для straight-line режима и визуальной подсказки под курсором.
  const [pathPreviewPoint, setPathPreviewPoint] = useState<{ x: number; y: number } | null>(null)

  // Draft actor markers нужны как визуальный слой,
  // чтобы пользователь мог прикинуть расстановку актёров прямо на stitched room preview.
  const [draftActors, setDraftActors] = useState<VisualEditorActorPreview[]>([])

  // Выбранный actor marker для локального placement режима.
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null)

  // Пока режим активен, следующий клик по room preview переносит выбранного актёра в новую точку.
  const [isActorPlacementMode, setIsActorPlacementMode] = useState(false)

  // Локальное состояние Play preview.
  // Оно не меняет graph и нужно только для визуальной проверки пути внутри окна.
  const [isPlayPreviewRunning, setIsPlayPreviewRunning] = useState(false)
  const [playPreviewPoint, setPlayPreviewPoint] = useState<{ x: number; y: number } | null>(null)
  const [actorSpritePreviews, setActorSpritePreviews] = useState<Record<string, LoadedActorSpritePreview>>({})
  const dragPanRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startOffsetX: number
    startOffsetY: number
  } | null>(null)

  // Отдельный drag-state для actor markers в режиме Select.
  // Мы двигаем только локальный preview, а запись в graph делаем отдельным Import Actors.
  const actorDragRef = useRef<{
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

  // Текущее значение path points дублируем в ref,
  // чтобы pointer handlers и history работали без stale-замыканий.
  const draftPathPointsRef = useRef<Array<{ x: number; y: number }>>([])

  // History нужна для Ctrl+Z / Ctrl+Y внутри visual editor.
  // Это не должно зависеть от focus в room selector или других autocomplete-полях.
  const pathHistoryRef = useRef<Array<Array<{ x: number; y: number }>>>([])
  const pathHistoryIndexRef = useRef(-1)

  // Последняя позиция курсора над viewport нужна,
  // чтобы Shift-preview обновлялся сразу даже без нового движения мыши.
  const hoverClientPointRef = useRef<{ clientX: number; clientY: number } | null>(null)

  // requestAnimationFrame для Play preview держим в ref,
  // чтобы корректно останавливать анимацию при смене room/tool или Alt+Tab.
  const playPreviewFrameRef = useRef<number | null>(null)

  // После новой успешной загрузки screenshot bundle один раз делаем fit.
  // Это убирает лишние ручные поиски комнаты после Refresh или смены room.
  const shouldAutoFitRef = useRef(false)

  // Последние upstream-keys нужны, чтобы не сбрасывать локальный draft на каждый bridge sync.
  // Это особенно важно для отдельного окна Visual Editing, где main часто присылает одинаковый snapshot.
  const lastSyncedPathKeyRef = useRef<string | null>(null)
  const lastSyncedActorsKeyRef = useRef<string | null>(null)

  // Базовый timestamp нужен для расчёта прогресса анимации по path.
  const playPreviewStartTimeRef = useRef(0)

  // Индекс текущего сегмента помогает идти по пути вперёд без полного поиска на каждом кадре.
  // Это особенно полезно на длинных путях с большим числом точек.
  const playPreviewSegmentIndexRef = useRef(0)

  // Останавливаем локальный preview безопасно из любого сценария.
  // Это важно при смене room, инструментов, Alt+Tab и ручном Stop.
  const stopPlayPreview = useCallback((): void => {
    if (playPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(playPreviewFrameRef.current)
      playPreviewFrameRef.current = null
    }

    setIsPlayPreviewRunning(false)
    setPlayPreviewPoint(null)
  }, [])

  // Сбрасываем временные drag/preview состояния.
  // Так viewport не застревает в старом pointer-state после blur или отмены действий.
  const clearTransientInteractionState = useCallback((): void => {
    dragPanRef.current = null
    actorDragRef.current = null
    pathDrawRef.current = null
    hoverClientPointRef.current = null
    setPathPreviewPoint(null)
  }, [])

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
    [bundle, offset.x, offset.y, zoom]
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
      const nextPoint = getPathPointFromClient(hoverPoint.clientX, hoverPoint.clientY, anchorPoint, {
        useHvLock: shiftKey,
        useGridSnap: true
      })

      setPathPreviewPoint(nextPoint)
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase()
      const code = event.code

      const target = event.target as HTMLElement | null
      const tag = target?.tagName ?? ''
      const inputType = tag === 'INPUT' ? (((target as HTMLInputElement | null)?.type ?? '').toLowerCase()) : ''
      const isTypingTarget =
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (tag === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(inputType)) ||
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
      if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && code === 'KeyB' && !isTypingTarget) {
        event.preventDefault()
        stopPlayPreview()
        clearTransientInteractionState()
        // Повторное нажатие hotkey выключает инструмент.
        // Это возвращает окно в обычный режим pan без лишнего клика по кнопке Stop Drawing.
        setActiveTool((prev) => (prev === 'pencil' ? null : 'pencil'))
        setIsActorPlacementMode(false)
        return
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && code === 'KeyG' && !isTypingTarget) {
        event.preventDefault()
        stopPlayPreview()
        clearTransientInteractionState()
        // То же поведение для eraser.
        // Повторный hotkey быстро возвращает пользователя к простому перетаскиванию viewport.
        setActiveTool((prev) => (prev === 'eraser' ? null : 'eraser'))
        setIsActorPlacementMode(false)
        return
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && code === 'KeyE' && !isTypingTarget) {
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
  }, [activeTool, clearTransientInteractionState, getPathPointFromClient, onClose, onImportPath, open, stopPlayPreview])

  // Сбрасываем визуальное состояние, когда пользователь явно меняет room.
  useEffect(() => {
    if (!open || !selectedRoom) return
    setZoom(1)
    setOffset({ x: 24, y: 24 })
    setActiveTool(null)
    setIsActorPlacementMode(false)
    stopPlayPreview()
    clearTransientInteractionState()
  }, [clearTransientInteractionState, open, selectedRoom, stopPlayPreview])

  // Когда меняется выбранная follow_path-нода,
  // синхронизируем draft path с её текущими points.
  useEffect(() => {
    if (!open) return
    const nextPoints = selectedPathPoints.map((point) => ({ x: point.x, y: point.y }))
    const nextPathKey = `${selectedNode?.id ?? 'none'}::${getPathPointsSyncKey(nextPoints)}`
    if (lastSyncedPathKeyRef.current === nextPathKey) {
      return
    }

    lastSyncedPathKeyRef.current = nextPathKey
    setDraftPathPoints(nextPoints)
    draftPathPointsRef.current = nextPoints
    pathHistoryRef.current = [nextPoints.map((point) => ({ ...point }))]
    pathHistoryIndexRef.current = 0
  }, [open, selectedPathPoints, selectedNode?.id])

  // Синхронизируем ref с актуальным React-state после любых изменений.
  useEffect(() => {
    draftPathPointsRef.current = draftPathPoints
  }, [draftPathPoints])

  // Если реальных actor_create нет, собираем виртуальные preview entries.
  // Это позволяет выбрать target выбранной ноды и player даже без actor_create в graph.
  const effectiveActorPreviews = useMemo(() => {
    if (actorPreviews.length > 0) {
      return actorPreviews
    }

    const fallbackActors: VisualEditorActorPreview[] = []
    const pushVirtualActor = (actorKey: string): void => {
      const normalizedKey = actorKey.trim()
      if (!normalizedKey) {
        return
      }
      if (fallbackActors.some((actor) => actor.key === normalizedKey)) {
        return
      }

      fallbackActors.push({
        id: `virtual:${normalizedKey}`,
        key: normalizedKey,
        x: 0,
        y: 0,
        spriteOrObject: normalizedKey.toLowerCase() === 'player' ? 'obj_player' : '',
        isVirtual: true
      })
    }

    pushVirtualActor(selectedActorTarget ?? '')
    pushVirtualActor('player')
    return fallbackActors
  }, [actorPreviews, selectedActorTarget])

  // Actor preview markers тоже копируем локально,
  // чтобы их можно было переставлять внутри окна без немедленного влияния на graph.
  useEffect(() => {
    if (!open) return
    const nextActorsKey = getActorPreviewsSyncKey(effectiveActorPreviews)
    if (lastSyncedActorsKeyRef.current === nextActorsKey) {
      return
    }

    lastSyncedActorsKeyRef.current = nextActorsKey
    setDraftActors(effectiveActorPreviews.map((actor) => ({ ...actor })))
    setSelectedActorId((prev) =>
      effectiveActorPreviews.some((actor) => actor.id === prev) ? prev : effectiveActorPreviews[0]?.id ?? null
    )
  }, [effectiveActorPreviews, open])

  // Для sprite preview важен только список resource names,
  // а не текущие координаты actor markers. Это убирает лишние IPC-загрузки при drag/move.
  const actorSpriteResourceNames = useMemo(
    () =>
      Array.from(
        new Set(
          draftActors
            .map((actor) => {
              const directResource = actor.spriteOrObject.trim()
              if (directResource) {
                return directResource
              }

              const fallbackResource = actor.isVirtual ? actor.key.trim() : ''
              return fallbackResource
            })
            .filter((resourceName) => resourceName.length > 0)
        )
      ),
    [draftActors]
  )

  // Подгружаем sprite previews только для тех actor entries, где есть шанс найти ресурс.
  // Для virtual fallback пробуем actor.key как имя sprite/object ресурса.
  useEffect(() => {
    if (!open || !projectDir || !window.api?.project?.readActorSpritePreview) {
      setActorSpritePreviews({})
      return
    }

    if (actorSpriteResourceNames.length <= 0) {
      setActorSpritePreviews({})
      return
    }

    let cancelled = false
    Promise.all(
      actorSpriteResourceNames.map(async (resourceName) => {
        try {
          const preview = (await window.api.project.readActorSpritePreview(
            projectDir,
            resourceName
          )) as LoadedActorSpritePreview | null
          return preview ? [resourceName, preview] as const : null
        } catch {
          return null
        }
      })
    ).then((entries) => {
      if (cancelled) {
        return
      }

      const nextPreviews: Record<string, LoadedActorSpritePreview> = {}
      for (const entry of entries) {
        if (!entry) {
          continue
        }

        nextPreviews[entry[0]] = entry[1]
      }

      setActorSpritePreviews(nextPreviews)
    })

    return () => {
      cancelled = true
    }
  }, [actorSpriteResourceNames, open, projectDir])

  // Центральный helper для обновления path points и записи history snapshot'ов.
  // Так Ctrl+Z / Ctrl+Y работает одинаково для pencil, eraser и clear/import действий.
  const commitDraftPathPoints = useCallback(
    (nextPoints: Array<{ x: number; y: number }>, options?: { recordHistory?: boolean }): void => {
      const normalizedNext = simplifyPathPoints(nextPoints.map((point) => ({ x: point.x, y: point.y })))
      if (arePathPointsEqual(draftPathPointsRef.current, normalizedNext)) return

      draftPathPointsRef.current = normalizedNext
      setDraftPathPoints(normalizedNext)

      if (options?.recordHistory === false) return

      const trimmedHistory = pathHistoryRef.current.slice(0, pathHistoryIndexRef.current + 1)
      const lastSnapshot = trimmedHistory[trimmedHistory.length - 1] ?? []
      if (arePathPointsEqual(lastSnapshot, normalizedNext)) return

      trimmedHistory.push(normalizedNext.map((point) => ({ ...point })))
      pathHistoryRef.current = trimmedHistory
      pathHistoryIndexRef.current = trimmedHistory.length - 1
    },
    []
  )

  // Добавляем новую точку только если она реально отличается от предыдущей.
  // Это защищает path от лишних дублей при drag и pointer jitter.
  const appendDraftPathPoint = useCallback((point: { x: number; y: number }): void => {
    const prev = draftPathPointsRef.current
    const lastPoint = prev[prev.length - 1]
    if (lastPoint && lastPoint.x === point.x && lastPoint.y === point.y) {
      return
    }

    if (lastPoint && Math.hypot(lastPoint.x - point.x, lastPoint.y - point.y) < PATH_APPEND_MIN_DISTANCE) {
      return
    }

    commitDraftPathPoints([...prev, point])
  }, [commitDraftPathPoints])

  // Eraser удаляет точки вокруг курсора по небольшому радиусу.
  // Так инструментом можно провести по path и локально почистить waypoint'ы.
  const eraseDraftPathPoints = useCallback((point: { x: number; y: number }): void => {
    const nextPoints = draftPathPointsRef.current.filter(
      (candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) > PATH_ERASE_RADIUS
    )
    commitDraftPathPoints(nextPoints)
  }, [commitDraftPathPoints])

  // Fit рассчитывает zoom так, чтобы вся room влезла в viewport с небольшим внутренним отступом.
  const fitToViewport = useCallback((): void => {
    const meta = bundle?.meta
    const viewport = viewportRef.current
    if (!meta || !viewport) return

    const innerWidth = Math.max(120, viewport.clientWidth - 32)
    const innerHeight = Math.max(120, viewport.clientHeight - 32)
    const nextZoom = clamp(
      Math.min(innerWidth / Math.max(1, meta.room_width), innerHeight / Math.max(1, meta.room_height)),
      MIN_ZOOM,
      MAX_ZOOM
    )

    const contentWidth = meta.room_width * nextZoom
    const contentHeight = meta.room_height * nextZoom

    setZoom(nextZoom)
    setOffset({
      x: Math.round((viewport.clientWidth - contentWidth) / 2),
      y: Math.round((viewport.clientHeight - contentHeight) / 2)
    })
  }, [bundle])

  // Reset возвращает user view в понятное исходное состояние.
  const resetView = useCallback((): void => {
    setZoom(1)
    setOffset({ x: 24, y: 24 })
  }, [])

  // Zoom вокруг курсора делает wheel-навигацию заметно удобнее,
  // потому что пользователь не теряет нужную точку комнаты при приближении.
  const zoomAroundClientPoint = useCallback(
    (clientX: number, clientY: number, requestedZoom: number): void => {
      const viewport = viewportRef.current
      if (!viewport) return

      const nextZoom = clamp(Number(requestedZoom.toFixed(3)), MIN_ZOOM, MAX_ZOOM)
      if (nextZoom === zoom) return

      const rect = viewport.getBoundingClientRect()
      const worldX = (clientX - rect.left - offset.x) / zoom
      const worldY = (clientY - rect.top - offset.y) / zoom

      setZoom(nextZoom)
      setOffset({
        x: Math.round(clientX - rect.left - worldX * nextZoom),
        y: Math.round(clientY - rect.top - worldY * nextZoom)
      })
    },
    [offset.x, offset.y, zoom]
  )

  // Запрашиваем пакет room screenshot данных у main процесса.
  const refreshBundle = useCallback(async (): Promise<void> => {
    if (!open) return

    // Без открытого проекта окно остаётся полезным только как empty shell.
    if (!projectDir || !selectedRoom || !window.api?.project?.readRoomScreenshotBundle) {
      setBundle(null)
      setErrorMessage(null)
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const result = await window.api.project.readRoomScreenshotBundle(
        projectDir,
        selectedRoom,
        roomScreenshotsDir
      )

      if (!result) {
        setBundle(null)
        setErrorMessage(t('editor.visualEditingFailedToLoad', 'Failed to load room screenshot data.'))
        return
      }

      setErrorMessage(null)
      setBundle(result)
      shouldAutoFitRef.current = true
    } catch (error) {
      console.warn('Failed to load room screenshot bundle:', error)
      setBundle(null)
      setErrorMessage(t('editor.visualEditingFailedToLoad', 'Failed to load room screenshot data.'))
    } finally {
      setIsLoading(false)
    }
  }, [open, projectDir, roomScreenshotsDir, selectedRoom, t])

  // Автозагрузка при открытии окна, смене room и ручном refresh.
  useEffect(() => {
    void refreshBundle()
  }, [refreshBundle, refreshToken])

  // Если пользователь вернулся в editor после внешнего screenshot runner,
  // пробуем тихо перечитать bundle автоматически.
  // Это убирает лишний ручной Refresh в самом частом desktop-flow.
  useEffect(() => {
    if (!open) return

    const handleWindowFocus = (): void => {
      void refreshBundle()
    }

    const handleWindowBlur = (): void => {
      stopPlayPreview()
      clearTransientInteractionState()
    }

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        stopPlayPreview()
        clearTransientInteractionState()
        return
      }

      if (document.visibilityState === 'visible') {
        void refreshBundle()
      }
    }

    window.addEventListener('focus', handleWindowFocus)
    window.addEventListener('blur', handleWindowBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleWindowFocus)
      window.removeEventListener('blur', handleWindowBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [clearTransientInteractionState, open, refreshBundle, stopPlayPreview])

  // После успешной новой загрузки один раз делаем fit,
  // чтобы пользователю не приходилось каждый раз искать room вручную.
  useEffect(() => {
    if (!open || !bundle?.meta || !shouldAutoFitRef.current) return

    shouldAutoFitRef.current = false
    const frame = window.requestAnimationFrame(() => fitToViewport())
    return () => window.cancelAnimationFrame(frame)
  }, [bundle, fitToViewport, open])

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

  // Простые zoom controls кнопками.
  const zoomIn = useCallback((): void => {
    setZoom((prev) => clamp(Number((prev * 1.25).toFixed(3)), MIN_ZOOM, MAX_ZOOM))
  }, [])

  const zoomOut = useCallback((): void => {
    setZoom((prev) => clamp(Number((prev / 1.25).toFixed(3)), MIN_ZOOM, MAX_ZOOM))
  }, [])

  // Колесо мыши и жесты тачпада теперь масштабируют viewport.
  // Это особенно важно в отдельном native окне, где кнопочный zoom слишком медленный.
  const handleViewportWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>): void => {
      event.preventDefault()

      const scaleFactor = Math.exp(-event.deltaY * 0.0015)
      zoomAroundClientPoint(event.clientX, event.clientY, zoom * scaleFactor)
    },
    [zoom, zoomAroundClientPoint]
  )

  // Ищем actor marker под курсором в режиме Select.
  // Берём небольшой допуск, чтобы по marker было легко попадать мышью и тачпадом.
  const findActorAtPoint = useCallback(
    (point: { x: number; y: number }): VisualEditorActorPreview | null => {
      for (let index = draftActors.length - 1; index >= 0; index -= 1) {
        const actor = draftActors[index]
        const displayPoint =
          actor.id === selectedActorId && playPreviewPoint
            ? playPreviewPoint
            : { x: actor.x, y: actor.y }

        if (Math.hypot(displayPoint.x - point.x, displayPoint.y - point.y) <= ACTOR_MARKER_RADIUS + 6) {
          return actor
        }
      }

      return null
    },
    [draftActors, playPreviewPoint, selectedActorId]
  )

  // Подготовленные сегменты для Play preview считаем заранее.
  // Так requestAnimationFrame не тратит время на повторный проход по всему пути.
  const preparedDraftPathSegments = useMemo(
    () => buildPreparedPathSegments(draftPathPoints),
    [draftPathPoints]
  )

  // Общая длина подготовленного пути нужна для лимита preview по времени и финальной точки.
  const preparedDraftPathTotalLength = useMemo(
    () => preparedDraftPathSegments[preparedDraftPathSegments.length - 1]?.endDistance ?? 0,
    [preparedDraftPathSegments]
  )

  // Запускаем локальный Play preview для выбранного actor marker.
  // Позиции actor_create в graph не меняются, пока пользователь явно не нажмёт Import Actors.
  const togglePlayPreview = useCallback((): void => {
    if (isPlayPreviewRunning) {
      stopPlayPreview()
      return
    }

    if (!selectedActorId || draftPathPoints.length < 2) {
      return
    }

    const totalLength = preparedDraftPathTotalLength
    if (totalLength <= 0) {
      return
    }

    const finalPathPoint = draftPathPoints[draftPathPoints.length - 1]
    if (!finalPathPoint) {
      return
    }

    stopPlayPreview()
    setIsPlayPreviewRunning(true)
    setPlayPreviewPoint({ ...draftPathPoints[0] })
    playPreviewStartTimeRef.current = performance.now()
    playPreviewSegmentIndexRef.current = 0

    const tick = (timestamp: number): void => {
      const elapsedSeconds = Math.max(0, (timestamp - playPreviewStartTimeRef.current) / 1000)
      const travelledDistance = Math.min(totalLength, elapsedSeconds * PLAY_PREVIEW_SPEED_PX_PER_SEC)
      const nextPreviewState = getPointAtDistanceOnPreparedPath(
        preparedDraftPathSegments,
        travelledDistance,
        finalPathPoint,
        playPreviewSegmentIndexRef.current
      )

      playPreviewSegmentIndexRef.current = nextPreviewState.segmentIndex
      setPlayPreviewPoint(nextPreviewState.point)

      if (travelledDistance >= totalLength) {
        playPreviewFrameRef.current = null
        setIsPlayPreviewRunning(false)
        playPreviewSegmentIndexRef.current = 0

        // Во время preview не трогаем реальную позицию актёра.
        // Обновляем её только в конце, когда пользователь уже увидел весь проход по пути.
        setDraftActors((prev) =>
          prev.map((actor) =>
            actor.id === selectedActorId
              ? { ...actor, x: finalPathPoint.x, y: finalPathPoint.y }
              : actor
          )
        )
        setPlayPreviewPoint(null)
        return
      }

      playPreviewFrameRef.current = window.requestAnimationFrame(tick)
    }

    playPreviewFrameRef.current = window.requestAnimationFrame(tick)
  }, [
    draftPathPoints,
    isPlayPreviewRunning,
    preparedDraftPathSegments,
    preparedDraftPathTotalLength,
    selectedActorId,
    stopPlayPreview
  ])

  // Pointer drag нужен для ручного pan по stitched room preview.
  const handleViewportPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    if (activeTool === 'pencil' || activeTool === 'eraser') {
      if (event.button !== 0) return

      const anchorPoint = draftPathPointsRef.current[draftPathPointsRef.current.length - 1] ?? null
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
  }, [
    activeTool,
    appendDraftPathPoint,
    eraseDraftPathPoints,
    findActorAtPoint,
    getPathPointFromPointerEvent,
    getWorldPointFromClient,
    isActorPlacementMode,
    offset.x,
    offset.y,
    stopPlayPreview
  ])

  const handleViewportPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    hoverClientPointRef.current = {
      clientX: event.clientX,
      clientY: event.clientY
    }

    const pathDrawState = pathDrawRef.current
    if (pathDrawState && pathDrawState.pointerId === event.pointerId) {
      const nextPoint = getPathPointFromPointerEvent(event, pathDrawState.anchorPoint)
      if (!nextPoint) return

      pathDrawState.latestPoint = nextPoint
      setPathPreviewPoint(nextPoint)

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
      const anchorPoint = draftPathPointsRef.current[draftPathPointsRef.current.length - 1] ?? null
      const nextPoint = getPathPointFromPointerEvent(event, anchorPoint)
      setPathPreviewPoint(nextPoint)
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

      setDraftActors((prev) =>
        prev.map((actor) =>
          actor.id === actorDragState.actorId ? { ...actor, x: nextX, y: nextY } : actor
        )
      )
      return
    }

    const dragState = dragPanRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    const deltaX = event.clientX - dragState.startClientX
    const deltaY = event.clientY - dragState.startClientY
    setOffset({
      x: dragState.startOffsetX + deltaX,
      y: dragState.startOffsetY + deltaY
    })
  }, [activeTool, appendDraftPathPoint, bundle, eraseDraftPathPoints, getPathPointFromPointerEvent, getWorldPointFromClient])

  const handleViewportPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    const pathDrawState = pathDrawRef.current
    if (pathDrawState && pathDrawState.pointerId === event.pointerId) {
      if (pathDrawState.tool === 'pencil' && pathDrawState.isStraightSegment && pathDrawState.latestPoint) {
        appendDraftPathPoint(pathDrawState.latestPoint)
      }

      pathDrawRef.current = null
      setPathPreviewPoint(null)
      event.currentTarget.releasePointerCapture(event.pointerId)
      return
    }

    const actorDragState = actorDragRef.current
    if (actorDragState && actorDragState.pointerId === event.pointerId) {
      actorDragRef.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
      return
    }

    const dragState = dragPanRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    dragPanRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [appendDraftPathPoint])

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
    [activeTool, findActorAtPoint, getWorldPointFromClient, isActorPlacementMode, selectedActorId, stopPlayPreview]
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

  // Для preview сначала используем sprite_or_object из actor_create.
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
  const gridPhaseX = useMemo(() => ((visualGridOffsetX % PATH_GRID_STEP) + PATH_GRID_STEP) % PATH_GRID_STEP, [visualGridOffsetX])
  const gridPhaseY = useMemo(() => ((visualGridOffsetY % PATH_GRID_STEP) + PATH_GRID_STEP) % PATH_GRID_STEP, [visualGridOffsetY])

  // Универсальный helper для numeric полей local settings.
  // Он держит значения в безопасных границах и сразу сохраняет их в preferences.
  const updateVisualSettingFromNumber = useCallback(
    (field: 'visualEditorGridOffsetX' | 'visualEditorGridOffsetY' | 'visualEditorPathSizeMultiplier', value: number): void => {
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

  // Основной контент visual editor переиспользуется и для modal, и для standalone window.
  // Разница только в внешней оболочке и размерах контейнера.
  const content = (
    <div
      className={['prefsModal', 'roomVisualEditorModal', variant === 'window' ? 'roomVisualEditorWindow' : '']
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
        <div className="roomVisualEditorToolbar">
          <label className="runtimeField roomVisualEditorField" style={{ margin: 0, padding: 0 }}>
            <span style={{ minWidth: 60 }}>{t('editor.visualEditingRoom', 'Room')}</span>
            <SearchableSelect
              className="runtimeInput"
              options={availableRooms}
              value={selectedRoom}
              onChange={(value) => setSelectedRoom(value)}
              placeholder={t('editor.visualEditingChooseRoom', 'Choose room...')}
              disabled={availableRooms.length <= 0}
            />
          </label>

          <div className="roomVisualEditorActions">
            <button
              className="runtimeButton"
              type="button"
              onClick={() => setRefreshToken((prev) => prev + 1)}
              disabled={!projectDir || !selectedRoom}
            >
              {t('editor.visualEditingRefresh', 'Refresh')}
            </button>
            <button className="runtimeButton" type="button" onClick={zoomOut} disabled={!bundle?.meta}>
              {t('editor.visualEditingZoomOut', 'Zoom -')}
            </button>
            <button className="runtimeButton" type="button" onClick={zoomIn} disabled={!bundle?.meta}>
              {t('editor.visualEditingZoomIn', 'Zoom +')}
            </button>
            <button className="runtimeButton" type="button" onClick={fitToViewport} disabled={!bundle?.meta}>
              {t('editor.visualEditingFit', 'Fit')}
            </button>
            <button className="runtimeButton" type="button" onClick={resetView} disabled={!bundle?.meta}>
              {t('editor.visualEditingReset', 'Reset')}
            </button>
          </div>
        </div>

        <div className="roomVisualEditorLayout">
          <div className="roomVisualEditorSidebar runtimeSection">
            <div className="runtimeSectionTitle">{t('editor.visualEditingInfo', 'Info')}</div>

            <div className="runtimeField roomVisualEditorField">
              <span>{t('editor.visualEditingSelectedNode', 'Selected Node')}</span>
              <code className="roomVisualEditorCode">
                {selectedNode
                  ? `${String(selectedNode.name ?? selectedNode.type)} · ${selectedNode.type}`
                  : t('editor.visualEditingNoNodeSelected', 'No node selected')}
              </code>
            </div>

            {!projectDir ? <div className="runtimeHint">{t('editor.visualEditingNoProject', 'Open a project.')}</div> : null}

            {isLoading ? (
              <div className="runtimeHint">{t('editor.visualEditingLoading', 'Loading screenshots...')}</div>
            ) : null}

            {errorMessage ? <div className="runtimeHint">{errorMessage}</div> : null}

            {bundle?.warning ? <div className="runtimeHint">{bundle.warning}</div> : null}

            {/* Техническая информация о скриншотах: размеры комнаты, сетка тайлов и т.д. */}
            {techMode && bundle?.meta ? (
              <>
                <div className="runtimeField roomVisualEditorField">
                  <span>{t('editor.visualEditingRoomSize', 'Room Size')}</span>
                  <code className="roomVisualEditorCode">
                    {bundle.meta.room_width} × {bundle.meta.room_height}
                  </code>
                </div>
                <div className="runtimeField roomVisualEditorField">
                  <span>{t('editor.visualEditingGrid', 'Tile Grid')}</span>
                  <code className="roomVisualEditorCode">
                    {bundle.meta.rows} × {bundle.meta.cols}
                  </code>
                </div>
                <div className="runtimeField roomVisualEditorField">
                  <span>{t('editor.visualEditingTilesLoaded', 'Tiles Loaded')}</span>
                  <code className="roomVisualEditorCode">{bundle.tiles.length}</code>
                </div>
                <div className="runtimeField roomVisualEditorField">
                  <span>{t('editor.visualEditingZoomLabel', 'Zoom')}</span>
                  <code className="roomVisualEditorCode">{Math.round(zoom * 100)}%</code>
                </div>
              </>
            ) : projectDir && selectedRoom && !isLoading && !bundle?.meta ? (
              <div className="runtimeHint">
                {t('editor.visualEditingNoMeta', 'No room screenshot data found.')}
              </div>
            ) : null}

            {!projectDir ? null : !isLoading && availableRooms.length <= 0 ? (
              <div className="runtimeHint">
                {t('editor.visualEditingNoScreenshotRooms', 'No rooms with screenshots.')}
              </div>
            ) : null}

            <div className="runtimeSectionTitle" style={{ marginTop: 12 }}>{t('editor.visualEditingPathTools', 'Path Tools')}</div>

            <label className="runtimeField" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={visualEditorShowGrid}
                onChange={(event) => updatePreferences({ visualEditorShowGrid: event.target.checked })}
              />
              <span>{t('editor.visualEditingShowGrid', 'Show Grid')}</span>
            </label>

            <label className="runtimeField" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={visualEditorSnapToGrid}
                onChange={(event) => updatePreferences({ visualEditorSnapToGrid: event.target.checked })}
              />
              <span>{t('editor.visualEditingSnapToGrid', 'Snap to Grid')}</span>
            </label>

            {visualEditorSnapToGrid ? (
              <>
                <div className="runtimeField roomVisualEditorField">
                  <span>{t('editor.visualEditingGridOffsetX', 'Grid Offset X')}</span>
                  <input
                    className="runtimeInput"
                    type="number"
                    step={1}
                    value={visualGridOffsetX}
                    onChange={(event) =>
                      updateVisualSettingFromNumber(
                        'visualEditorGridOffsetX',
                        Number(event.target.value)
                      )
                    }
                  />
                </div>

                <div className="runtimeField roomVisualEditorField">
                  <span>{t('editor.visualEditingGridOffsetY', 'Grid Offset Y')}</span>
                  <input
                    className="runtimeInput"
                    type="number"
                    step={1}
                    value={visualGridOffsetY}
                    onChange={(event) =>
                      updateVisualSettingFromNumber(
                        'visualEditorGridOffsetY',
                        Number(event.target.value)
                      )
                    }
                  />
                </div>
              </>
            ) : null}

            <div className="runtimeField roomVisualEditorField">
              <span>{t('editor.visualEditingPathSizeMultiplier', 'Path Size Multiplier')}</span>
              <input
                className="runtimeInput"
                type="number"
                min={0.5}
                max={4}
                step={0.1}
                value={visualPathSizeMultiplier}
                onChange={(event) =>
                  updateVisualSettingFromNumber(
                    'visualEditorPathSizeMultiplier',
                    Number(event.target.value)
                  )
                }
              />
            </div>

            <div className="roomVisualEditorActions roomVisualEditorSidebarActions">
              <button
                className={['runtimeButton', activeTool === 'pencil' ? 'isActive' : ''].filter(Boolean).join(' ')}
                type="button"
                onClick={() => {
                  stopPlayPreview()
                  clearTransientInteractionState()
                  setActiveTool((prev) => (prev === 'pencil' ? null : 'pencil'))
                  setIsActorPlacementMode(false)
                }}
              >
                {t('editor.visualEditingPencil', 'Pencil')}
              </button>
              <button
                className={['runtimeButton', activeTool === 'eraser' ? 'isActive' : ''].filter(Boolean).join(' ')}
                type="button"
                onClick={() => {
                  stopPlayPreview()
                  clearTransientInteractionState()
                  setActiveTool((prev) => (prev === 'eraser' ? null : 'eraser'))
                  setIsActorPlacementMode(false)
                }}
              >
                {t('editor.visualEditingEraser', 'Eraser')}
              </button>
              <button className="runtimeButton" type="button" onClick={clearDraftPath} disabled={draftPathPoints.length <= 0}>
                {t('editor.visualEditingClearPath', 'Clear Path')}
              </button>
              <button className="runtimeButton" type="button" onClick={importDraftPath} disabled={draftPathPoints.length <= 0}>
                {t('editor.visualEditingImportPath', 'Import Path')}
              </button>
            </div>

            <div className="runtimeHint">
              {t('editor.visualEditingPathHint', 'B: Pencil · G: Eraser · Ctrl+E: Import Path · Shift: straight line')}
            </div>

            <div className="runtimeSectionTitle" style={{ marginTop: 12 }}>{t('editor.visualEditingActorTools', 'Actor Preview')}</div>
            <label className="runtimeField roomVisualEditorField">
              <span>{t('editor.visualEditingActorPicker', 'Actor')}</span>
              <select
                className="runtimeInput"
                value={selectedActorId ?? ''}
                onChange={(event) => {
                  const nextActorId = event.target.value.trim()
                  setSelectedActorId(nextActorId.length > 0 ? nextActorId : null)
                }}
                disabled={draftActors.length <= 0}
              >
                {draftActors.length <= 0 ? (
                  <option value="">{t('editor.visualEditingChooseActor', 'Choose actor...')}</option>
                ) : null}
                {actorOptionEntries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>

            {draftActors.length <= 0 ? (
              <div className="runtimeHint">
                {t('editor.visualEditingNoActors', 'No actors available.')}
              </div>
            ) : null}

            {selectedActor ? (
              <div className="runtimeField roomVisualEditorField">
                <span>{t('editor.visualEditingActorPosition', 'Actor Position')}</span>
                <code className="roomVisualEditorCode">
                  {`${selectedActor.x}, ${selectedActor.y}`}
                </code>
              </div>
            ) : null}

            <div className="roomVisualEditorActions roomVisualEditorSidebarActions">
              <button
                className={['runtimeButton', activeTool === 'select' ? 'isActive' : ''].filter(Boolean).join(' ')}
                type="button"
                onClick={() => {
                  clearTransientInteractionState()
                  setActiveTool((prev) => (prev === 'select' ? null : 'select'))
                  setIsActorPlacementMode(false)
                }}
                disabled={draftActors.length <= 0}
              >
                {t('editor.visualEditingSelect', 'Select')}
              </button>
              <button
                className={['runtimeButton', isActorPlacementMode ? 'isActive' : ''].filter(Boolean).join(' ')}
                type="button"
                onClick={() => {
                  stopPlayPreview()
                  clearTransientInteractionState()
                  setIsActorPlacementMode((prev) => !prev)
                }}
                disabled={!selectedActor}
              >
                {isActorPlacementMode
                  ? t('editor.visualEditingStopActorPlacement', 'Stop Placement')
                  : t('editor.visualEditingPlaceActor', 'Place Selected Actor')}
              </button>
              <button
                className={['runtimeButton', isPlayPreviewRunning ? 'isActive' : ''].filter(Boolean).join(' ')}
                type="button"
                onClick={togglePlayPreview}
                disabled={!selectedActor || draftPathPoints.length < 2}
              >
                {isPlayPreviewRunning ? t('editor.visualEditingStopPreview', 'Stop') : t('editor.visualEditingPlay', 'Play')}
              </button>
              <button
                className="runtimeButton"
                type="button"
                onClick={importDraftActors}
                disabled={!hasImportableActors}
              >
                {t('editor.visualEditingImportActors', 'Import Actors')}
              </button>
            </div>

            {selectedActor ? (
              <div className="runtimeHint">
                {t('editor.visualEditingActorHint', 'Select an actor, place it on the room, then import actors when ready.')}
              </div>
            ) : null}
          </div>

          <div
            ref={viewportRef}
            className={[
              'roomVisualEditorViewport',
              activeTool === 'select' ? 'isSelectMode' : '',
              activeTool === 'pencil' || activeTool === 'eraser' ? 'isPathDrawMode' : '',
              activeTool === 'eraser' ? 'isPathEraseMode' : '',
              isActorPlacementMode ? 'isActorPlacementMode' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            onPointerDown={handleViewportPointerDown}
            onPointerMove={handleViewportPointerMove}
            onPointerUp={handleViewportPointerUp}
            onPointerCancel={handleViewportPointerUp}
            onPointerLeave={handleViewportPointerLeave}
            onWheel={handleViewportWheel}
            onClick={handleViewportClick}
          >
            <div
              className="roomVisualEditorCanvasWrap"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transformOrigin: 'top left'
              }}
            >
              <canvas ref={canvasRef} className="roomVisualEditorCanvas" />

              {/* SVG-overlay вынесен в отдельный component,
                  чтобы основной modal был короче и легче читался.
                  Логику pointer/state мы при этом не меняем. */}
              {bundle?.meta ? (
                <RoomVisualEditorOverlay
                  meta={bundle.meta}
                  gridPatternId={gridPatternId}
                  gridPhaseX={gridPhaseX}
                  gridPhaseY={gridPhaseY}
                  pathGridStep={PATH_GRID_STEP}
                  pathEraseRadius={PATH_ERASE_RADIUS}
                  actorMarkerRadius={ACTOR_MARKER_RADIUS}
                  showGrid={visualEditorShowGrid}
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
                  activeTool={activeTool}
                  getActorSpritePreview={getActorSpritePreview}
                  liquidGlassEnabled={preferences.liquidGlassEnabled}
                  liquidGlassBlur={preferences.liquidGlassBlur}
                />
              ) : null}
            </div>
          </div>
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
