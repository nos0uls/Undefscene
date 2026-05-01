/* eslint-disable @typescript-eslint/explicit-function-return-type */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

import { DockPanel } from './DockPanel'
import { AboutModal } from './AboutModal'
import { FlowCanvas } from './FlowCanvas'
import { TopMenuBar } from './TopMenuBar'
import type { DockSlotId, LayoutState, Size, Vec2 } from './layoutTypes'
import { parseYarnPreview } from './yarnPreview'
import { useLayoutState } from './useLayoutState'
import { useProjectResources } from './useProjectResources'
import { useRuntimeState } from './useRuntimeState'
import { validateGraph, type ValidationResult, type ValidationContext } from './validateGraph'
import { PreferencesModal } from './PreferencesModal'
import { UpdateNotification } from './UpdateNotification'
import { useToasts, pushSuccess, pushError, pushInfo } from './ToastHub'
import { useConfirm } from './ConfirmDialog'
import { PreferencesProvider } from './PreferencesContext'
import { getAccentCssVariables, usePreferences } from './usePreferences'
import { useHotkeys } from './useHotkeys'
import { InspectorPanel } from './InspectorPanel'
import { BookmarksPanel } from './BookmarksPanel'
import type { NameConflictModalState } from './inspectorTypes'
import { createTranslator } from '../i18n'
import { useNodeOperations, suggestUniqueNodeName } from './useNodeOperations'
import { useVisualEditing } from './useVisualEditing'
import { useEditorShortcuts } from './useEditorShortcuts'
import { useSceneIO } from './useSceneIO'

// MIME-type для drag-and-drop из node palette в FlowCanvas.
// Дублируем локально в renderer-файлах, чтобы не тянуть отдельный shared constants module ради одной строки.
const NODE_PALETTE_DRAG_MIME = 'application/x-undefscene-node-type'

// Статичный список типов нод для палитры (Actions panel).
// Вынесен за пределы компонента, чтобы не создавать массив на каждый рендер.
const PALETTE_NODE_TYPES = [
  'start',
  'end',
  'move',
  'follow_path',
  'actor_create',
  'actor_destroy',
  'animate',
  'dialogue',
  'wait_for_dialogue',
  'camera_track',
  'camera_track_until_stop',
  'camera_pan',
  'camera_pan_obj',
  'camera_center',
  'parallel_start',
  'branch',
  'run_function',
  'set_position',
  'set_depth',
  'set_facing',
  'camera_shake',
  'auto_facing',
  'auto_walk',
  'tween',
  'tween_camera',
  'set_property',
  'fade_in',
  'fade_out',
  'play_sfx',
  'emote',
  'jump',
  'halt',
  'flip',
  'spin',
  'shake_object',
  'set_visible',
  'instant_mode',
  'mark_node'
] as const

type DragState = {
  // Какая панель сейчас перетаскивается.
  panelId: string

  // Какой pointerId мы захватили (нужно, чтобы не ловить чужие события).
  pointerId: number

  // Размер панели во время перетаскивания.
  // Мы берём его из DOM в момент старта.
  size: Size

  // Смещение курсора относительно левого верхнего угла панели.
  // Нужно, чтобы панель "прилипала" к курсору одинаково.
  grabOffset: Vec2
}

// Высота шапки панели в свернутом состоянии.
const COLLAPSED_HEADER_HEIGHT = 28

// Размер видимой полоски у полностью свёрнутого дока.
// Сам layout схлопывается до этой величины, а расширенный hitbox живёт отдельно.
const COLLAPSED_DOCK_SIZE = 12

type ResizeKind =
  | 'dock-left'
  | 'dock-right'
  | 'dock-bottom'
  | 'split-left'
  | 'split-right'
  | 'float-n'
  | 'float-s'
  | 'float-e'
  | 'float-w'
  | 'float-ne'
  | 'float-nw'
  | 'float-se'
  | 'float-sw'

type ResizeDragState = {
  // Какой тип ресайза мы делаем.
  kind: ResizeKind

  // ID pointer, чтобы не ловить чужие события.
  pointerId: number

  // Стартовая позиция курсора.
  startX: number
  startY: number

  // Запоминаем размеры доков в момент старта.
  startDockSizes: LayoutState['dockSizes']

  // Для floating ресайза нам нужен ID панели и её стартовый размер.
  panelId?: string
  startPanelPosition?: Vec2 | null
  startPanelSize?: Size | null
}

// Тип NameConflictModalState импортируется из './inspectorTypes'.

// Небольшое описание панели внутри вертикального dock split.
// Храним тут только то, что нужно для порядка рендера и расчёта flex.
type DockedPanelRenderEntry = {
  id: string
  className: string
  baseStyle: CSSProperties
}

// Основной “каркас” редактора.
// Здесь мы собираем все зоны: верхнее меню, левые/правые доки,
// центральный холст и нижний лог.
export function EditorShell(): React.JSX.Element {
  // Храним текущую раскладку и автосохраняем её.
  // В Milestone 1 мы пока не даём пользователю двигать сплиттеры,
  // но размеры уже пробрасываем в CSS.
  const { layout, setLayout } = useLayoutState()

  // Храним runtime-json (узлы, выбор, undo/redo).
  // Это отдельное состояние, не связанное с layout.
  const { runtime, setRuntime, undo, redo, canUndo, canRedo } = useRuntimeState()

  // Ref на корневой DOM-элемент — нужен нескольким хукам (visual editing, docking).
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Централизованные toast-уведомления и кастомные confirm-диалоги (замена window.alert/confirm).
  const toasts = useToasts()
  const confirm = useConfirm()

  // Ресурсы GameMaker проекта (для autocomplete и валидации) + настройки движка.
  const { resources, engineSettings, yarnFiles, isLoading: isProjectLoading, openProject } = useProjectResources()

  // Путь к текущему файлу сцены (null = ещё не сохранялась / новая).
  const [sceneFilePath, setSceneFilePath] = useState<string | null>(null)

  // Счётчик для внешнего fitView запроса в FlowCanvas.
  // Каждый инкремент = один отдельный запрос на уместить граф в viewport.
  const [fitViewRequestId, setFitViewRequestId] = useState(0)

  // Модалка настроек (Preferences).
  const [preferencesOpen, setPreferencesOpen] = useState(false)

  // Модалка About и версия приложения.
  const [aboutOpen, setAboutOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('Loading...')

  // visualEditingOpen / screenshotRooms теперь из useVisualEditing hook.

  // Yarn preview для Text panel.
  // Держим отдельно raw content, loading и выбранную preview-ноду,
  // чтобы панель могла показывать полный файл и быстро переключаться между title-блоками.
  const [yarnPreviewContent, setYarnPreviewContent] = useState<string | null>(null)
  const [yarnPreviewLoading, setYarnPreviewLoading] = useState(false)
  const [selectedYarnPreviewTitle, setSelectedYarnPreviewTitle] = useState<string | null>(null)

  // Персистентные настройки редактора (для PreferencesProvider).
  const { preferences, updatePreferences, loaded: preferencesLoaded } = usePreferences()

  // Лёгкий translator для оболочки редактора.
  // Он сразу реагирует на смену preferences.language без тяжёлой i18n-библиотеки.
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const collapsePanelLabel = t('editor.collapsePanel', 'Collapse panel')
  const closePanelLabel = t('editor.closePanel', 'Close panel')

  // Перевод названий panel-id в человекочитаемые заголовки.
  // Это важно, потому что сохранённый layout может содержать старые английские title,
  // а при runtime-switch мы хотим сразу показывать актуальный язык.
  const getPanelTitle = useCallback(
    (panelId: string): string => {
      if (panelId === 'panel.actions') return t('panels.actions', 'Actions')
      if (panelId === 'panel.bookmarks') return t('panels.bookmarks', 'Bookmarks')
      if (panelId === 'panel.text') return t('panels.text', 'Text')
      if (panelId === 'panel.inspector') return t('panels.inspector', 'Inspector')
      if (panelId === 'panel.logs') return t('panels.logs', 'Logs / Warnings')
      if (panelId === 'panel.runtime_json') return t('panels.runtimeJson', 'Runtime JSON')
      return layout.panels[panelId]?.title ?? panelId
    },
    [layout.panels, t]
  )

  // Применяем accent color глобально на весь editor.
  // Раньше это жило внутри modal, из-за чего canvas и остальной UI могли читать старый цвет.
  useEffect(() => {
    if (!preferencesLoaded) return

    const accentVariables = getAccentCssVariables(preferences)
    for (const [variableName, variableValue] of Object.entries(accentVariables)) {
      document.documentElement.style.setProperty(variableName, variableValue)
    }
  }, [preferences, preferencesLoaded])

  // Когда открываем About — один раз читаем версию приложения из main процесса.
  useEffect(() => {
    if (!aboutOpen) return
    if (!window.api?.appInfo?.getVersion) return

    window.api.appInfo
      .getVersion()
      .then((version) => {
        setAppVersion(version)
      })
      .catch((err) => {
        console.warn('Failed to read app version:', err)
        setAppVersion('Unknown')
      })
  }, [aboutOpen])

  const handleOpenDocs = () => {
    if (!window.api?.appInfo?.openExternal) {
      console.warn('App info API not available')
      return
    }

    // Это точная публичная страница статьи про Undefscene editor,
    // найденная в my-docs-repo: docs/systems/cutscenes/editor.md.
    void window.api.appInfo.openExternal(
      'https://nos0uls.github.io/Undefined-documentation/systems/cutscenes/undefscene/overview/'
    )
  }

  // Контекст ресурсов для расширенной валидации.
  const validationContext: ValidationContext | undefined = useMemo(() => {
    if (!resources && !engineSettings) return undefined
    return {
      objects: resources?.objects,
      sprites: resources?.sprites,
      yarnFiles: yarnFiles ? new Map(yarnFiles.map((y) => [y.file, y.nodes])) : undefined,
      runFunctions: engineSettings?.runFunctions,
      branchConditions: engineSettings?.branchConditions
    }
  }, [resources, engineSettings, yarnFiles])

  // Собираем базовые target-опции для actor-related нод.
  // Сюда входят системный player, object names из проекта
  // и все ключи, созданные через actor_create в текущем графе.
  const actorTargetOptions = useMemo(() => {
    const result = new Set<string>(['player'])

    for (const objectName of resources?.objects ?? []) {
      if (objectName) result.add(objectName)
    }

    for (const node of runtime.nodes) {
      if (node.type !== 'actor_create') continue
      const actorKey = String(node.params?.key ?? '').trim()
      if (actorKey) result.add(actorKey)
    }

    return [...result]
  }, [resources?.objects, runtime.nodes])

  // Подгружаем полный `.yarn` файл для Text panel preview,
  // когда выбрана dialogue-нода и у неё указан file.
  useEffect(() => {
    const selectedNode = runtime.nodes.find((node) => node.id === runtime.selectedNodeId) ?? null
    const selectedFile =
      selectedNode?.type === 'dialogue' ? String(selectedNode.params?.file ?? '').trim() : ''
    const projectDir = resources?.projectDir ?? ''

    if (!selectedNode || selectedNode.type !== 'dialogue' || !selectedFile || !projectDir) {
      setYarnPreviewContent(null)
      setYarnPreviewLoading(false)
      setSelectedYarnPreviewTitle(null)
      return
    }

    if (!window.api?.yarn?.readFile) {
      setYarnPreviewContent(null)
      setYarnPreviewLoading(false)
      setSelectedYarnPreviewTitle(null)
      return
    }

    let cancelled = false
    setYarnPreviewLoading(true)

    window.api.yarn
      .readFile(projectDir, selectedFile)
      .then((raw) => {
        if (cancelled) return

        const normalizedRaw = typeof raw === 'string' ? raw : null
        setYarnPreviewContent(normalizedRaw)

        const selectedNodeTitle = String(selectedNode.params?.node ?? '').trim()
        const parsedPreviewNodes = normalizedRaw ? parseYarnPreview(normalizedRaw) : []
        const hasRequestedTitle = parsedPreviewNodes.some((entry) => entry.title === selectedNodeTitle)

        setSelectedYarnPreviewTitle(
          hasRequestedTitle
            ? selectedNodeTitle
            : parsedPreviewNodes.length > 0
              ? parsedPreviewNodes[0].title
              : null
        )
        setYarnPreviewLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('Failed to read yarn file for preview:', err)
        setYarnPreviewContent(null)
        setSelectedYarnPreviewTitle(null)
        setYarnPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [resources?.projectDir, runtime.nodes, runtime.selectedNodeId])

  // Реактивная валидация графа — пересчитывается только когда реально меняется содержимое сцены,
  // а не при каждом клике по selection на холсте.
  const validation: ValidationResult = useMemo(
    () =>
      validateGraph(
        {
          ...runtime,
          selectedNodeId: null,
          selectedNodeIds: [],
          selectedEdgeId: null
        },
        validationContext
      ),
    [runtime.schemaVersion, runtime.title, runtime.nodes, runtime.edges, validationContext]
  )

  // Флаг: нужно ли сфокусировать wait input после следующего рендера.
  // Вынесен сюда из блока горячих клавиш, чтобы useNodeOperations мог им пользоваться.
  const shouldFocusEdgeWaitRef = useRef(false)

  // --- Извлечённые хуки ---

  // Операции с нодами: создание, удаление, выбор, parallel-ветки.
  const {
    handleSelectNodes,
    handleSelectEdge,
    handleNodePositionChange,
    handleEdgeAdd,
    handleEdgeRemove,
    handleNodeDelete,
    handleEdgeDelete,
    handleEdgeDoubleClick,
    addNode,
    createDefaultPaneNode,
    createPaletteDropNode,
    onParallelAddBranch,
    onParallelRemoveBranch
  } = useNodeOperations({ runtime, setRuntime, shouldFocusEdgeWaitRef })

  // Toggle-фильтры для Logs панели: какие категории показывать.
  const [logsFilters, setLogsFilters] = useState({
    errors: true,
    warnings: true,
    tips: false
  })

  // Активная вкладка в bottom dock (id панели). Если null — показываем первую.
  const [activeBottomTabId, setActiveBottomTabId] = useState<string | null>(null)

  // Свёрнутые доки (collapse bars).
  const [collapsedDocks, setCollapsedDocks] = useState({
    left: false,
    right: false,
    bottom: false
  })

  // Держим актуальное состояние collapse в ref,
  // чтобы resize-обработчик не зависел от порядка объявления переменных ниже.
  const collapsedDocksRef = useRef(collapsedDocks)
  useEffect(() => {
    collapsedDocksRef.current = collapsedDocks
  }, [collapsedDocks])

  // Отдельно помним, какие доки мы свернули автоматически из-за нехватки места.
  // Это нужно, чтобы при возврате свободного места раскрыть только auto-collapsed доки,
  // не ломая ручной выбор пользователя.
  const autoCollapsedDocksRef = useRef({
    left: false,
    right: false,
    bottom: false
  })

  // Выбранная нода (нужна, чтобы синхронизировать поле имени и показывать модалки).
  const selectedNodeForName =
    runtime.nodes.find((node) => node.id === runtime.selectedNodeId) ?? null

  // Visual editing — теперь через useVisualEditing hook.
  const {
    roomScreenshotSearchDirs,
    openVisualEditorWindow
  } = useVisualEditing({
    runtime,
    setRuntime,
    resources,
    preferences,
    toasts,
    confirm,
    t,
    rootRef
  })

  // Текущее значение в поле “Node name”.
  // Мы держим его отдельно, чтобы не переписывать runtime на каждый символ.
  const [pendingNodeName, setPendingNodeName] = useState('')

  // Модалка для конфликтов имени ноды.
  const [nameConflictModal, setNameConflictModal] = useState<NameConflictModalState | null>(null)
  const nameConflictOkRef = useRef<HTMLButtonElement | null>(null)

  // suggestUniqueNodeName теперь импортируется из useNodeOperations

  // Все node operation callbacks теперь из useNodeOperations hook.
  // importPathFromVisualEditing, importActorsFromVisualEditing, openVisualEditorWindow
  // и все visual editor IPC effects — теперь внутри useVisualEditing hook.

  // Когда пользователь выбирает другую ноду — обновляем поле имени.
  useEffect(() => {
    setPendingNodeName(selectedNodeForName?.name ?? '')
  }, [selectedNodeForName?.id])

  // Пропорциональное масштабирование доков при изменении размера окна.
  // Сохраняем предыдущий размер окна, чтобы пересчитывать не пиксели сами по себе,
  // а долю занятого места внутри доступной области редактора.
  const prevWindowSizeRef = useRef({ width: window.innerWidth, height: window.innerHeight })

  useEffect(() => {
    let resizeFrameId: number | null = null

    const handleResize = () => {
      if (resizeFrameId !== null) return
      resizeFrameId = requestAnimationFrame(() => {
        resizeFrameId = null
        const prevWidth = prevWindowSizeRef.current.width
        const prevHeight = prevWindowSizeRef.current.height
        const rootRect = rootRef.current?.getBoundingClientRect()
        const newWidth = rootRect?.width ?? window.innerWidth
        const newHeight = rootRect?.height ?? window.innerHeight

        const currentLayout = layoutRef.current
        const currentCollapsedDocks = collapsedDocksRef.current
        const topBarHeight = 30
        const isGrowingHorizontally = newWidth > prevWidth
        const isGrowingVertically = newHeight > prevHeight
        const leftDockCount = currentLayout.docked.left.filter(
          (id) => currentLayout.panels[id]?.mode === 'docked'
        ).length
        const rightDockCount = currentLayout.docked.right.filter(
          (id) => currentLayout.panels[id]?.mode === 'docked'
        ).length
        const bottomDockCount = currentLayout.docked.bottom.filter(
          (id) => currentLayout.panels[id]?.mode === 'docked'
        ).length

        // Считаем доступное место без минимального центра.
        // Это позволяет хранить именно отношение доков к рабочей зоне.
        const prevHorizontalSpace = Math.max(
          MIN_LEFT_WIDTH + MIN_RIGHT_WIDTH,
          prevWidth - MIN_CENTER_WIDTH
        )
        const nextHorizontalSpace = Math.max(
          MIN_LEFT_WIDTH + MIN_RIGHT_WIDTH,
          newWidth - MIN_CENTER_WIDTH
        )
        const prevVerticalSpace = Math.max(MIN_BOTTOM_HEIGHT, prevHeight - topBarHeight - MIN_CENTER_HEIGHT)
        const nextVerticalSpace = Math.max(MIN_BOTTOM_HEIGHT, newHeight - topBarHeight - MIN_CENTER_HEIGHT)

        const leftRatio = currentLayout.dockSizes.leftWidth / prevHorizontalSpace
        const rightRatio = currentLayout.dockSizes.rightWidth / prevHorizontalSpace
        const bottomRatio = currentLayout.dockSizes.bottomHeight / prevVerticalSpace

        // Восстанавливаем размеры из долей. Если места стало слишком мало,
        // clamp естественно упрёт панели в минимум, а центр заберёт остаток.
        // Важный UX-момент: при расширении окна доки не должны сами раздуваться.
        // Иначе bottom dock после узкого окна начинает занимать слишком большую долю экрана.
        let nextLeftWidth = isGrowingHorizontally
          ? currentLayout.dockSizes.leftWidth
          : clamp(
            Math.round(nextHorizontalSpace * leftRatio),
            MIN_LEFT_WIDTH,
            Math.max(MIN_LEFT_WIDTH, newWidth - currentLayout.dockSizes.rightWidth - MIN_CENTER_WIDTH)
          )
        let nextRightWidth = isGrowingHorizontally
          ? currentLayout.dockSizes.rightWidth
          : clamp(
            Math.round(nextHorizontalSpace * rightRatio),
            MIN_RIGHT_WIDTH,
            Math.max(MIN_RIGHT_WIDTH, newWidth - nextLeftWidth - MIN_CENTER_WIDTH)
          )

        // После пересчёта правого дока ещё раз поджимаем левый,
        // чтобы сумма точно не съела центр при очень узком окне.
        nextLeftWidth = clamp(
          nextLeftWidth,
          MIN_LEFT_WIDTH,
          Math.max(MIN_LEFT_WIDTH, newWidth - nextRightWidth - MIN_CENTER_WIDTH)
        )

        const nextBottomHeight = isGrowingVertically
          ? clamp(
            currentLayout.dockSizes.bottomHeight,
            MIN_BOTTOM_HEIGHT,
            Math.max(MIN_BOTTOM_HEIGHT, newHeight - topBarHeight - MIN_CENTER_HEIGHT)
          )
          : clamp(
            Math.round(nextVerticalSpace * bottomRatio),
            MIN_BOTTOM_HEIGHT,
            Math.max(MIN_BOTTOM_HEIGHT, newHeight - topBarHeight - MIN_CENTER_HEIGHT)
          )

        let nextCollapsedLeft = currentCollapsedDocks.left
        let nextCollapsedRight = currentCollapsedDocks.right
        let nextCollapsedBottom = currentCollapsedDocks.bottom
        let effectiveLeftWidth = nextCollapsedLeft ? COLLAPSED_DOCK_SIZE : nextLeftWidth
        let effectiveRightWidth = nextCollapsedRight ? COLLAPSED_DOCK_SIZE : nextRightWidth
        let effectiveBottomHeight = nextCollapsedBottom ? COLLAPSED_DOCK_SIZE : nextBottomHeight

        // Если центр начинает терять minimum width, автоматически сворачиваем боковые доки.
        // Сначала сворачиваем тот, который уже дошёл до минимума, затем второй при необходимости.
        let horizontalShortage = effectiveLeftWidth + effectiveRightWidth + MIN_CENTER_WIDTH - newWidth
        if (horizontalShortage > 0 && leftDockCount > 0 && !nextCollapsedLeft && nextLeftWidth <= MIN_LEFT_WIDTH + 8) {
          nextCollapsedLeft = true
          effectiveLeftWidth = COLLAPSED_DOCK_SIZE
          horizontalShortage = effectiveLeftWidth + effectiveRightWidth + MIN_CENTER_WIDTH - newWidth
        }
        if (horizontalShortage > 0 && rightDockCount > 0 && !nextCollapsedRight && nextRightWidth <= MIN_RIGHT_WIDTH + 8) {
          nextCollapsedRight = true
          effectiveRightWidth = COLLAPSED_DOCK_SIZE
          horizontalShortage = effectiveLeftWidth + effectiveRightWidth + MIN_CENTER_WIDTH - newWidth
        }
        if (horizontalShortage > 0 && leftDockCount > 0 && !nextCollapsedLeft) {
          nextCollapsedLeft = true
          effectiveLeftWidth = COLLAPSED_DOCK_SIZE
          horizontalShortage = effectiveLeftWidth + effectiveRightWidth + MIN_CENTER_WIDTH - newWidth
        }
        if (horizontalShortage > 0 && rightDockCount > 0 && !nextCollapsedRight) {
          nextCollapsedRight = true
          effectiveRightWidth = COLLAPSED_DOCK_SIZE
        }

        // Если центр начинает терять minimum height, так же сворачиваем нижний док.
        const verticalShortage = effectiveBottomHeight + topBarHeight + MIN_CENTER_HEIGHT - newHeight
        if (verticalShortage > 0 && bottomDockCount > 0 && !nextCollapsedBottom) {
          nextCollapsedBottom = true
          effectiveBottomHeight = COLLAPSED_DOCK_SIZE
        }

        const shouldKeepLeftAutoCollapsed =
          leftDockCount > 0 &&
          effectiveRightWidth + nextLeftWidth + MIN_CENTER_WIDTH > newWidth &&
          nextCollapsedLeft
        const shouldKeepRightAutoCollapsed =
          rightDockCount > 0 &&
          effectiveLeftWidth + nextRightWidth + MIN_CENTER_WIDTH > newWidth &&
          nextCollapsedRight
        const shouldKeepBottomAutoCollapsed =
          bottomDockCount > 0 &&
          nextBottomHeight + topBarHeight + MIN_CENTER_HEIGHT > newHeight &&
          nextCollapsedBottom

        // Возвращаем автоматически свёрнутые доки, когда места снова достаточно.
        if (autoCollapsedDocksRef.current.left && !shouldKeepLeftAutoCollapsed) {
          nextCollapsedLeft = false
          effectiveLeftWidth = nextLeftWidth
        }
        if (autoCollapsedDocksRef.current.right && !shouldKeepRightAutoCollapsed) {
          nextCollapsedRight = false
          effectiveRightWidth = nextRightWidth
        }
        if (autoCollapsedDocksRef.current.bottom && !shouldKeepBottomAutoCollapsed) {
          nextCollapsedBottom = false
          effectiveBottomHeight = nextBottomHeight
        }

        autoCollapsedDocksRef.current = {
          left: nextCollapsedLeft && !currentCollapsedDocks.left ? true : shouldKeepLeftAutoCollapsed,
          right: nextCollapsedRight && !currentCollapsedDocks.right ? true : shouldKeepRightAutoCollapsed,
          bottom: nextCollapsedBottom && !currentCollapsedDocks.bottom ? true : shouldKeepBottomAutoCollapsed
        }

        const leftChanged = Math.abs(nextLeftWidth - currentLayout.dockSizes.leftWidth) > 1
        const rightChanged = Math.abs(nextRightWidth - currentLayout.dockSizes.rightWidth) > 1
        const bottomChanged = Math.abs(nextBottomHeight - currentLayout.dockSizes.bottomHeight) > 1
        const collapsedChanged =
          nextCollapsedLeft !== currentCollapsedDocks.left ||
          nextCollapsedRight !== currentCollapsedDocks.right ||
          nextCollapsedBottom !== currentCollapsedDocks.bottom

        // Плавающие панели тоже нужно поджимать под новый размер editorRoot.
        // Иначе после resize они могут остаться в старой точке и закрывать canvas.
        let floatingPanelsChanged = false
        const nextPanels = Object.fromEntries(
          Object.entries(currentLayout.panels).map(([panelId, panel]) => {
            if (panel.mode !== 'floating' || !panel.position || !panel.size) {
              return [panelId, panel]
            }

            const clampedWidth = clamp(panel.size.width, MIN_FLOAT_WIDTH, Math.max(MIN_FLOAT_WIDTH, newWidth - 24))
            const clampedHeight = clamp(
              panel.size.height,
              MIN_FLOAT_HEIGHT,
              Math.max(MIN_FLOAT_HEIGHT, newHeight - 24)
            )
            const clampedX = clamp(panel.position.x, 0, Math.max(0, newWidth - clampedWidth))
            const clampedY = clamp(panel.position.y, 0, Math.max(0, newHeight - clampedHeight))

            if (
              clampedWidth !== panel.size.width ||
              clampedHeight !== panel.size.height ||
              clampedX !== panel.position.x ||
              clampedY !== panel.position.y
            ) {
              floatingPanelsChanged = true
              return [
                panelId,
                {
                  ...panel,
                  position: { x: clampedX, y: clampedY },
                  size: { width: clampedWidth, height: clampedHeight },
                  lastFloatingPosition: { x: clampedX, y: clampedY },
                  lastFloatingSize: { width: clampedWidth, height: clampedHeight }
                }
              ]
            }

            return [panelId, panel]
          })
        ) as LayoutState['panels']

        if (leftChanged || rightChanged || bottomChanged || floatingPanelsChanged) {
          setLayout({
            ...currentLayout,
            dockSizes: {
              ...currentLayout.dockSizes,
              leftWidth: nextLeftWidth,
              rightWidth: nextRightWidth,
              bottomHeight: nextBottomHeight
            },
            panels: nextPanels
          })
        }

        if (collapsedChanged) {
          setCollapsedDocks({
            left: nextCollapsedLeft,
            right: nextCollapsedRight,
            bottom: nextCollapsedBottom
          })
        }

        // Сохраняем новый размер окна.
        prevWindowSizeRef.current = { width: newWidth, height: newHeight }
      })
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeFrameId !== null) cancelAnimationFrame(resizeFrameId)
    }
  }, [setLayout])

  // Когда модалка открывается — ставим фокус на кнопку OK.
  // Так можно быстро подтвердить стандартный вариант.
  useEffect(() => {
    if (!nameConflictModal) return
    const t = window.setTimeout(() => {
      nameConflictOkRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(t)
  }, [nameConflictModal])

  // Закрытие модалки по Esc.
  useEffect(() => {
    if (!nameConflictModal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setPendingNodeName(nameConflictModal.previousName)
      setNameConflictModal(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [nameConflictModal])

  // onParallelAddBranch / onParallelRemoveBranch теперь из useNodeOperations hook.

  // Ссылки на DOM, чтобы делать hit-test док-зон.
  // rootRef уже определён выше (перед хуками).
  const leftDockRef = useRef<HTMLElement | null>(null)
  const rightDockRef = useRef<HTMLElement | null>(null)
  const bottomDockRef = useRef<HTMLElement | null>(null)
  const leftDockHitboxRef = useRef<HTMLDivElement | null>(null)
  const rightDockHitboxRef = useRef<HTMLDivElement | null>(null)
  const bottomDockHitboxRef = useRef<HTMLDivElement | null>(null)
  const leftDockPreviewRef = useRef<HTMLDivElement | null>(null)
  const rightDockPreviewRef = useRef<HTMLDivElement | null>(null)
  const bottomDockPreviewRef = useRef<HTMLDivElement | null>(null)

  // Храним состояние перетаскивания отдельно от layout.
  // Так мы не пишем layout.json 60 раз в секунду.
  const [drag, setDrag] = useState<DragState | null>(null)

  // Состояние ресайза (доки + floating панели).
  const [resizeDrag, setResizeDrag] = useState<ResizeDragState | null>(null)

  // Ref на DOM-элемент "призрака" панели.
  // Мы двигаем его напрямую через style, минуя React state,
  // чтобы не вызывать ререндер всего EditorShell на каждый кадр.
  const ghostRef = useRef<HTMLDivElement | null>(null)

  // Последний hoverSlot, чтобы onPointerUp мог его прочитать.
  const hoverSlotRef = useRef<DockSlotId | null>(null)
  const hoverInsertIndexRef = useRef<number | null>(null)

  // Возвращает DOM-элемент дока по slot id.
  // Это упрощает обновление preview и hitbox без копипасты.
  const getDockElement = (slot: DockSlotId): HTMLElement | null => {
    if (slot === 'left') return leftDockRef.current
    if (slot === 'right') return rightDockRef.current
    return bottomDockRef.current
  }

  // Возвращает расширенный hitbox, который нужен только для collapsed-доков.
  const getDockHitboxElement = (slot: DockSlotId): HTMLDivElement | null => {
    if (slot === 'left') return leftDockHitboxRef.current
    if (slot === 'right') return rightDockHitboxRef.current
    return bottomDockHitboxRef.current
  }

  // Возвращает preview-элемент, который рисует точное место вставки панели.
  const getDockPreviewElement = (slot: DockSlotId): HTMLDivElement | null => {
    if (slot === 'left') return leftDockPreviewRef.current
    if (slot === 'right') return rightDockPreviewRef.current
    return bottomDockPreviewRef.current
  }

  // Определяет, свёрнут ли конкретный док.
  // Это важно для выбора между видимым rect и расширенным hidden hitbox.
  const isDockCollapsed = (slot: DockSlotId): boolean => {
    if (slot === 'left') return collapsedDocks.left
    if (slot === 'right') return collapsedDocks.right
    return collapsedDocks.bottom
  }

  // Возвращает rect, по которому мы реально делаем hit-test.
  // У collapsed-дока используем расширенный invisible hitbox, чтобы drag/drop не ломался.
  const getDockHitTestRect = (slot: DockSlotId): DOMRect | null => {
    const dockedCount = layoutRef.current.docked[slot].filter(
      (id) => layoutRef.current.panels[id]?.mode === 'docked'
    ).length

    if (slot === 'bottom' && dockedCount === 0) {
      const bottomRect = getDockElement('bottom')?.getBoundingClientRect()
      if (!bottomRect) return null

      // Даже если нижний док пустой и визуально тонкий,
      // расширяем его hit-area вверх, чтобы drag back был удобным.
      const expandUp = 140
      return new DOMRect(
        bottomRect.x,
        Math.max(0, bottomRect.y - expandUp),
        bottomRect.width,
        bottomRect.height + expandUp
      )
    }

    const targetEl = isDockCollapsed(slot) ? getDockHitboxElement(slot) : getDockElement(slot)
    return targetEl?.getBoundingClientRect() ?? null
  }

  // Обновляем позицию призрака и точный preview вставки напрямую через DOM.
  // Это полностью обходит React reconciliation — никаких setState.
  const updateDragPreviewDOM = (
    ghostPos: Vec2 | null,
    hoverSlot: DockSlotId | null,
    hoverInsertIndex: number | null
  ) => {
    // Двигаем призрак.
    const ghost = ghostRef.current
    if (ghost) {
      if (ghostPos) {
        ghost.style.left = `${ghostPos.x}px`
        ghost.style.top = `${ghostPos.y}px`
        ghost.style.display = preferences.showDockDropPreview ? 'block' : 'none'
      } else {
        ghost.style.display = 'none'
      }
    }

    // Прячем все preview, если пользователь отключил их в Preferences.
    if (!preferences.showDockDropPreview) {
      for (const slot of ['left', 'right', 'bottom'] as DockSlotId[]) {
        const previewEl = getDockPreviewElement(slot)
        if (previewEl) previewEl.style.display = 'none'
      }
      hoverSlotRef.current = hoverSlot
      hoverInsertIndexRef.current = hoverInsertIndex
      return
    }

    // Сначала скрываем старое preview. Затем покажем только актуальное.
    for (const slot of ['left', 'right', 'bottom'] as DockSlotId[]) {
      const previewEl = getDockPreviewElement(slot)
      if (previewEl) previewEl.style.display = 'none'
    }

    if (hoverSlot && hoverInsertIndex !== null) {
      const previewEl = getDockPreviewElement(hoverSlot)
      const capacity = getSlotCapacity(hoverSlot)
      const currentDocked = layoutRef.current.docked[hoverSlot]

      if (previewEl) {
        previewEl.style.display = 'block'
        previewEl.style.left = '4px'
        previewEl.style.right = '4px'

        // Для bottom dock preview всегда занимает почти весь слот,
        // потому что там всего одна позиция.
        if (capacity === 1) {
          previewEl.style.top = '4px'
          previewEl.style.height = 'calc(100% - 8px)'
        } else {
          const shouldSplit = currentDocked.length >= 1
          const previewTop = shouldSplit && hoverInsertIndex > 0 ? '50%' : '4px'
          const previewHeight = shouldSplit ? 'calc(50% - 6px)' : 'calc(100% - 8px)'
          previewEl.style.top = previewTop
          previewEl.style.height = previewHeight
        }
      }
    }

    hoverSlotRef.current = hoverSlot
    hoverInsertIndexRef.current = hoverInsertIndex
  }

  // Храним requestAnimationFrame id для плавного drag.
  const dragRafRef = useRef<number | null>(null)

  // Последнее значение превью, которое мы хотим отрендерить.
  const pendingGhostPosRef = useRef<Vec2 | null>(null)
  const pendingHoverSlotRef = useRef<DockSlotId | null>(null)
  const pendingHoverInsertIndexRef = useRef<number | null>(null)

  // Планируем обновление превью в requestAnimationFrame.
  // Это снижает количество DOM-записей до 1 раза за кадр.
  const scheduleDragPreview = (
    ghostPos: Vec2 | null,
    hoverSlot: DockSlotId | null,
    hoverInsertIndex: number | null
  ) => {
    pendingGhostPosRef.current = ghostPos
    pendingHoverSlotRef.current = hoverSlot
    pendingHoverInsertIndexRef.current = hoverInsertIndex
    if (dragRafRef.current !== null) return
    dragRafRef.current = window.requestAnimationFrame(() => {
      dragRafRef.current = null
      updateDragPreviewDOM(
        pendingGhostPosRef.current,
        pendingHoverSlotRef.current,
        pendingHoverInsertIndexRef.current
      )
    })
  }

  // Сохраняем актуальный layout в ref, чтобы pointer handlers не ловили старое значение.
  const layoutRef = useRef(layout)
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

  // --- Горячие клавиши (Ctrl+Z, Ctrl+Y, Ctrl+E, Delete) ---
  // Используем refs, чтобы обработчик keydown всегда видел актуальные значения.
  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime
  const setRuntimeRef = useRef(setRuntime)
  setRuntimeRef.current = setRuntime
  const undoRef = useRef(undo)
  undoRef.current = undo
  const redoRef = useRef(redo)
  redoRef.current = redo

  // Ref на кнопку Export (чтобы вызвать из хоткея).
  const exportRef = useRef<(() => void) | null>(null)

  // Scene IO (export, save, open, new, example, autosave) — теперь через useSceneIO hook.
  const {
    handleExport,
    handleSave,
    handleSaveAs,
    handleOpenScene,
    handleNew,
    handleCreateExample
  } = useSceneIO({
    runtime,
    runtimeRef,
    setRuntime,
    validation,
    sceneFilePath,
    setSceneFilePath,
    toasts,
    confirm,
    t,
    preferencesLoaded,
    autoSaveEnabled: preferences.autoSaveEnabled,
    autoSaveIntervalMinutes: preferences.autoSaveIntervalMinutes
  })
  // Привязываем к ref, чтобы хоткей Ctrl+E мог вызвать.
  exportRef.current = handleExport

  // Привязываем Save к ref для хоткея Ctrl+S.
  const saveRef = useRef<(() => void) | null>(null)
  saveRef.current = handleSave
  const newRef = useRef<(() => void) | null>(null)
  newRef.current = handleNew

  // Горячие клавиши — теперь через useEditorShortcuts hook.
  useEditorShortcuts({
    runtimeRef,
    setRuntimeRef,
    undoRef,
    redoRef,
    saveRef,
    newRef,
    exportRef,
    setPreferencesOpen,
    suggestUniqueNodeName
  })

  // Простая функция для ограничения чисел.
  const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(value, max))

  // Минимальные размеры, чтобы UI не "схлопывался".
  const MIN_LEFT_WIDTH = 220
  const MIN_RIGHT_WIDTH = 260
  const MIN_BOTTOM_HEIGHT = 140
  const MIN_CENTER_WIDTH = 360
  const MIN_CENTER_HEIGHT = 220
  const MIN_FLOAT_WIDTH = 240
  const MIN_FLOAT_HEIGHT = 80

  // Список всех панелей, которые можно показать через меню.
  // Это замена старых кнопок "Open Any" над доками.
  const allPanels = useMemo(() => {
    return [
      { id: 'panel.actions', label: getPanelTitle('panel.actions') },
      { id: 'panel.bookmarks', label: getPanelTitle('panel.bookmarks') },
      { id: 'panel.text', label: getPanelTitle('panel.text') },
      { id: 'panel.inspector', label: getPanelTitle('panel.inspector') },
      { id: 'panel.logs', label: getPanelTitle('panel.logs') }
    ]
  }, [getPanelTitle])

  // Проверяем видимость панели по её mode.
  const isPanelVisible = (panelId: string): boolean => {
    const p = layout.panels[panelId]
    if (!p) return false
    return p.mode !== 'hidden'
  }

  // Сворачиваем/разворачиваем панель.
  // Для floating сохраняем старую высоту, чтобы потом восстановить.
  const togglePanelCollapse = (panelId: string) => {
    const panel = layout.panels[panelId]
    if (!panel) return

    const nextCollapsed = !panel.collapsed
    const currentSize = panel.size ?? panel.lastFloatingSize ?? { width: 360, height: 240 }

    const nextPanelState =
      panel.mode === 'floating'
        ? {
          ...panel,
          collapsed: nextCollapsed,
          size: nextCollapsed
            ? { width: currentSize.width, height: COLLAPSED_HEADER_HEIGHT }
            : (panel.lastFloatingSize ?? currentSize),
          lastFloatingSize: nextCollapsed ? currentSize : panel.lastFloatingSize
        }
        : {
          ...panel,
          collapsed: nextCollapsed
        }

    setLayout({
      ...layout,
      panels: {
        ...layout.panels,
        [panelId]: nextPanelState
      }
    })
  }

  // Готовим стиль для док-панели, если она свёрнута.
  const getDockedPanelStyle = (
    panelId: string,
    baseStyle?: CSSProperties,
    options?: { fillRemainingSpace?: boolean }
  ): CSSProperties | undefined => {
    const isCollapsed = Boolean(layout.panels[panelId]?.collapsed)
    if (isCollapsed) {
      return {
        ...(baseStyle ?? {}),
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: COLLAPSED_HEADER_HEIGHT,
        height: COLLAPSED_HEADER_HEIGHT
      }
    }

    if (options?.fillRemainingSpace) {
      return {
        ...(baseStyle ?? {}),
        flexGrow: 1,
        flexBasis: 0,
        minHeight: 0
      }
    }

    return baseStyle
  }

  // Для вертикального dock важно не просто скрыть body,
  // а ещё и переставить collapsed panel вниз, чтобы соседняя заняла весь dock.
  const getVerticalDockRenderState = useCallback(
    (entries: Array<DockedPanelRenderEntry | null>) => {
      const normalizedEntries = entries.filter(
        (entry): entry is DockedPanelRenderEntry => entry !== null
      )

      if (normalizedEntries.length <= 0) {
        return {
          orderedEntries: [] as DockedPanelRenderEntry[],
          fillRemainingPanelId: null as string | null,
          showSplitter: false
        }
      }

      if (normalizedEntries.length === 1) {
        return {
          orderedEntries: normalizedEntries,
          fillRemainingPanelId: normalizedEntries[0].id,
          showSplitter: false
        }
      }

      const [firstEntry, secondEntry] = normalizedEntries
      const firstCollapsed = Boolean(layout.panels[firstEntry.id]?.collapsed)
      const secondCollapsed = Boolean(layout.panels[secondEntry.id]?.collapsed)

      if (firstCollapsed && !secondCollapsed) {
        return {
          orderedEntries: [secondEntry, firstEntry],
          fillRemainingPanelId: secondEntry.id,
          showSplitter: false
        }
      }

      if (!firstCollapsed && secondCollapsed) {
        return {
          orderedEntries: [firstEntry, secondEntry],
          fillRemainingPanelId: firstEntry.id,
          showSplitter: false
        }
      }

      return {
        orderedEntries: normalizedEntries,
        fillRemainingPanelId: normalizedEntries.length === 1 ? normalizedEntries[0].id : null,
        showSplitter: !firstCollapsed && !secondCollapsed
      }
    },
    [layout.panels]
  )

  // Убираем ID панели из всех слотов.
  const removeFromAllSlots = (nextDocked: typeof layout.docked, panelId: string) => {
    nextDocked.left = nextDocked.left.filter((id) => id !== panelId)
    nextDocked.right = nextDocked.right.filter((id) => id !== panelId)
    nextDocked.bottom = nextDocked.bottom.filter((id) => id !== panelId)
  }

  // Добавляем панель в слот в нужную позицию.
  const insertIntoSlot = (
    nextDocked: typeof layout.docked,
    slot: 'left' | 'right' | 'bottom',
    panelId: string,
    index: number
  ) => {
    const list = [...nextDocked[slot]]
    if (list.includes(panelId)) return
    const safeIndex = Math.max(0, Math.min(index, list.length))
    list.splice(safeIndex, 0, panelId)
    nextDocked[slot] = list
  }

  // Сколько панелей может жить в одном слоте.
  // Слева/справа — 2, внизу — 1 (чтобы не перегружать UI).
  const getSlotCapacity = (slot: DockSlotId): number => (slot === 'bottom' ? 1 : 2)

  // Если слот переполнен, то "лишние" панели мы скрываем.
  // Так они пропадают и с экрана, и из меню Panels (чекбоксы снимаются).
  const enforceSlotCapacity = (
    nextDocked: typeof layout.docked,
    nextPanels: typeof layout.panels,
    slot: DockSlotId,
    preferredPanelId?: string
  ) => {
    const capacity = getSlotCapacity(slot)
    const list = [...nextDocked[slot]]

    if (list.length <= capacity) return

    let keepIds = list.slice(0, capacity)
    let overflowIds = list.slice(capacity)

    // Если есть "предпочтительная" панель, гарантируем, что она останется в слоте.
    if (
      preferredPanelId &&
      list.includes(preferredPanelId) &&
      !keepIds.includes(preferredPanelId)
    ) {
      keepIds = [...keepIds.slice(0, capacity - 1), preferredPanelId]
      overflowIds = list.filter((id) => !keepIds.includes(id))
    }

    nextDocked[slot] = keepIds

    overflowIds.forEach((panelId) => {
      const panel = nextPanels[panelId]
      if (!panel) return

      nextPanels[panelId] = {
        ...panel,
        mode: 'hidden',
        slot: null,
        lastDockedSlot: panel.slot ?? panel.lastDockedSlot ?? slot
      }
    })
  }

  // Выбранный узел — мемоизируем, чтобы не вызывать InspectorPanel ре-рендер при каждом вызове.
  const selectedNode = useMemo(
    () => runtime.nodes.find((node) => node.id === runtime.selectedNodeId) ?? null,
    [runtime.nodes, runtime.selectedNodeId]
  )

  // Стабильный коллбек для выбора ноды — нужен BookmarksPanel (memo).
  const selectNode = useCallback(
    (nodeId: string) => {
      setRuntime((prev) => ({
        ...prev,
        selectedNodeId: nodeId,
        selectedNodeIds: [nodeId],
        selectedEdgeId: null
      }))
    },
    [setRuntime]
  )

  // Возвращаем содержимое панели по ID.
  // Пока что это просто заглушки, но так мы сможем переиспользовать их
  // и для docked, и для floating.
  const renderPanelContents = (panelId: string): React.JSX.Element => {

    if (panelId === 'panel.actions') {
      return (
        <div className="runtimeSection runtimeSectionActions">
          <div className="runtimeSectionTitle">{t('editor.actions', 'Actions')}</div>
          <div className="runtimeRow">
            <button className="runtimeButton" type="button" onClick={handleSave}>
              {t('menu.save', 'Save')}
            </button>
            <button className="runtimeButton" type="button" onClick={undo} disabled={!canUndo}>
              {t('menu.undo', 'Undo')}
            </button>
            <button className="runtimeButton" type="button" onClick={redo} disabled={!canRedo}>
              {t('menu.redo', 'Redo')}
            </button>
          </div>
          {/* Палитра нод — кликом добавляем ноду на холст. */}
          <div className="runtimeSectionTitle" style={{ marginTop: 6 }}>
            {t('editor.nodePalette', 'Node Palette')}
          </div>
          <ul className="runtimeList runtimeListScrollable">
            {PALETTE_NODE_TYPES.map((type) => (
              <li key={type}>
                <button
                  className="runtimeListItem"
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(NODE_PALETTE_DRAG_MIME, type)
                    event.dataTransfer.setData('text/plain', type)
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => addNode(type)}
                >
                  {type}
                </button>
              </li>
            ))}
          </ul>
          <div className="runtimeHint">{t('editor.actionsHint', 'New nodes appear to the right of the selected node.')}</div>
        </div>
      )
    }

    if (panelId === 'panel.bookmarks') {
      return (
        <BookmarksPanel
          nodes={runtime.nodes}
          selectedNodeId={runtime.selectedNodeId}
          selectNode={selectNode}
          t={t}
        />
      )
    }

    if (panelId === 'panel.text') {
      const selectedYarnFile =
        selectedNode?.type === 'dialogue' ? String(selectedNode.params?.file ?? '').trim() : ''
      const previewNodes = yarnPreviewContent ? parseYarnPreview(yarnPreviewContent) : []
      const activePreviewNode =
        previewNodes.find((entry) => entry.title === selectedYarnPreviewTitle) ?? previewNodes[0] ?? null

      return (
        <div className="runtimeSection">
          <div className="runtimeSectionTitle">{t('editor.yarnPreview', 'Yarn Preview')}</div>
          {!selectedNode ? (
            <div className="runtimeHint">{t('editor.selectDialogueNode', 'Select a dialogue node.')}</div>
          ) : selectedNode.type !== 'dialogue' ? (
            <div className="runtimeHint">{t('editor.textPanelReserved', 'Dialogue preview only.')}</div>
          ) : !resources?.projectDir ? (
            <div className="runtimeHint">{t('editor.openProjectForYarn', 'Open a project.')}</div>
          ) : !selectedYarnFile ? (
            <div className="runtimeHint">{t('editor.setDialogueFile', 'Set the dialogue File field.')}</div>
          ) : yarnPreviewLoading ? (
            <div className="runtimeHint">{t('editor.loadingYarnPreview', 'Loading Yarn preview...')}</div>
          ) : previewNodes.length === 0 ? (
            <div className="runtimeHint">{t('editor.noYarnNodes', 'No previewable Yarn nodes found in this file.')}</div>
          ) : (
            <>
              <div className="runtimeHint" style={{ marginBottom: 6 }}>
                {t('editor.file', 'File')}: {selectedYarnFile}
              </div>
              <div style={{ display: 'flex', gap: 8, minHeight: 220 }}>
                <div
                  style={{
                    width: 180,
                    minWidth: 180,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    overflowY: 'auto'
                  }}
                >
                  {previewNodes.map((entry) => (
                    <button
                      key={entry.title}
                      type="button"
                      className={[
                        'runtimeListItem',
                        activePreviewNode?.title === entry.title ? 'isActive' : ''
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setSelectedYarnPreviewTitle(entry.title)}
                      style={{ textAlign: 'left' }}
                    >
                      {entry.title}
                    </button>
                  ))}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="runtimeHint" style={{ marginBottom: 6 }}>
                    {t('editor.node', 'Node')}: {activePreviewNode?.title ?? t('editor.unknown', 'Unknown')}
                  </div>
                  <pre className="runtimeCode" style={{ minHeight: 220, margin: 0 }}>
                    {activePreviewNode?.body || '(Empty node body)'}
                  </pre>
                </div>
              </div>
            </>
          )}
        </div>
      )
    }

    if (panelId === 'panel.inspector') {
      return (
        <InspectorPanel
          runtime={runtime}
          setRuntime={setRuntime}
          selectedNode={selectedNode}
          actorTargetOptions={actorTargetOptions}
          resources={resources}
          engineSettings={engineSettings}
          yarnFiles={yarnFiles}
          pendingNodeName={pendingNodeName}
          setPendingNodeName={setPendingNodeName}
          suggestUniqueNodeName={suggestUniqueNodeName}
          setNameConflictModal={setNameConflictModal}
          roomScreenshotSearchDirs={roomScreenshotSearchDirs}
          shouldFocusEdgeWaitRef={shouldFocusEdgeWaitRef}
          t={t}
          preferences={preferences}
        />
      )
    }

    if (panelId === 'panel.logs') {
      // Считаем количество записей по категориям.
      const errorEntries = validation.entries.filter((e) => e.severity === 'error')
      const warnEntries = validation.entries.filter((e) => e.severity === 'warn')
      const tipEntries = validation.entries.filter((e) => e.severity === 'tip')

      // Фильтруем записи по включённым категориям.
      const visibleEntries = validation.entries.filter((e) => {
        if (e.severity === 'error') return logsFilters.errors
        if (e.severity === 'warn') return logsFilters.warnings
        if (e.severity === 'tip') return logsFilters.tips
        return false
      })

      // Цвета и иконки для каждого типа.
      const severityStyle: Record<string, { color: string; bg: string; icon: string }> = {
        error: { color: '#e05050', bg: 'rgba(224,80,80,0.08)', icon: '●' },
        warn: { color: '#d4a017', bg: 'rgba(212,160,23,0.08)', icon: '●' },
        tip: { color: '#58a6ff', bg: 'rgba(88,166,255,0.06)', icon: '●' }
      }

      // Конфигурация toggle-кнопок.
      const toggleButtons = [
        {
          key: 'errors' as const,
          label: preferences.language === 'ru' ? 'Ошибки' : 'Errors',
          count: errorEntries.length,
          color: '#e05050'
        },
        {
          key: 'warnings' as const,
          label: preferences.language === 'ru' ? 'Предупреждения' : 'Warnings',
          count: warnEntries.length,
          color: '#d4a017'
        },
        {
          key: 'tips' as const,
          label: preferences.language === 'ru' ? 'Подсказки' : 'Tips',
          count: tipEntries.length,
          color: '#58a6ff'
        }
      ]

      return (
        <div className="runtimeSection">
          {/* --- Toggle-фильтры: Errors / Warnings / Tips --- */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginBottom: 6,
              flexWrap: 'wrap'
            }}
          >
            {toggleButtons.map((btn) => {
              const isActive = logsFilters[btn.key]
              return (
                <button
                  key={btn.key}
                  type="button"
                  className="logFilterButton"
                  onClick={() =>
                    setLogsFilters((prev) => ({ ...prev, [btn.key]: !prev[btn.key] }))
                  }
                  style={{
                    color: isActive ? btn.color : `color-mix(in srgb, ${btn.color} 80%, var(--ev-c-text-2) 20%)`,
                    background: isActive ? `color-mix(in srgb, ${btn.color} 20%, transparent)` : 'transparent',
                    border: `1px solid ${isActive ? `color-mix(in srgb, ${btn.color} 40%, transparent)` : 'transparent'}`
                  }}
                >
                  {btn.label} ({btn.count})
                </button>
              )
            })}
          </div>

          {/* --- Записи по включённым фильтрам --- */}
          {visibleEntries.length === 0 ? (
            <div className="runtimeHint" style={{ color: '#6c6' }}>
              {!logsFilters.errors && !logsFilters.warnings && !logsFilters.tips
                ? t('editor.logsEmptyFilters', 'Enable filters to see entries.')
                : t('editor.logsNoMatches', 'No matching entries.')}
            </div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {visibleEntries.map((entry, i) => {
                const s = severityStyle[entry.severity] ?? severityStyle.warn
                return (
                  <div
                    key={i}
                    style={{
                      padding: '3px 6px',
                      marginBottom: 2,
                      fontSize: 12,
                      borderLeft: `3px solid ${s.color}`,
                      background: s.bg,
                      cursor: entry.nodeId || entry.edgeId ? 'pointer' : undefined
                    }}
                    onClick={() => {
                      // Клик по записи — выбираем ноду или ребро на холсте.
                      if (entry.nodeId) {
                        setRuntime({
                          ...runtime,
                          selectedNodeId: entry.nodeId,
                          selectedNodeIds: [entry.nodeId],
                          selectedEdgeId: null
                        })
                      } else if (entry.edgeId) {
                        setRuntime({
                          ...runtime,
                          selectedNodeId: null,
                          selectedNodeIds: [],
                          selectedEdgeId: entry.edgeId
                        })
                      }
                    }}
                  >
                    <span style={{ fontWeight: 600, color: s.color }}>{s.icon}</span>{' '}
                    {entry.message}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    if (panelId === 'panel.runtime_json') {
      // Отдельная панель полезна, когда нужно держать JSON открытым рядом с логами
      // или вынести его во floating-окно на второй монитор.
      return (
        <div className="runtimeSection" style={{ height: '100%' }}>
          <div className="runtimeHint">
            {t(
              'editor.runtimeJsonHint',
              'Raw editor scene state with node positions, selection, and editor-only fields.'
            )}
          </div>
          <div className="runtimeSectionTitle">
            {t('editor.runtimeJsonContent', 'Runtime JSON content')}
          </div>
          <pre className="runtimeCode runtimeCodeFill">{JSON.stringify(runtime, null, 2)}</pre>
        </div>
      )
    }

    return (
      <div className="placeholderText">
        {preferences.language === 'ru' ? 'Неизвестная панель' : 'Unknown panel'}: {panelId}
      </div>
    )
  }

  // Определяем, над какой док-зоной сейчас курсор.
  const getHoverSlotAtPoint = (clientX: number, clientY: number): DockSlotId | null => {
    const leftRect = getDockHitTestRect('left')
    const rightRect = getDockHitTestRect('right')
    const bottomRect = getDockHitTestRect('bottom')

    const isInside = (r: DOMRect | null): boolean => {
      if (!r) return false
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
    }

    if (isInside(leftRect)) return 'left'
    if (isInside(rightRect)) return 'right'
    if (isInside(bottomRect)) return 'bottom'
    return null
  }

  // Определяем позицию (x/y) для плавающей панели.
  // Координаты считаем относительно editorRoot, чтобы их легко сохранять.
  const getFloatingPositionAtPoint = (clientX: number, clientY: number, grabOffset: Vec2): Vec2 => {
    const rootRect = rootRef.current?.getBoundingClientRect()
    if (!rootRect) return { x: clientX - grabOffset.x, y: clientY - grabOffset.y }
    return {
      x: clientX - rootRect.left - grabOffset.x,
      y: clientY - rootRect.top - grabOffset.y
    }
  }

  // Примерный индекс вставки панели в слот (вверх/вниз).
  // Пока мы делаем простую логику: в верхнюю половину — index 0, в нижнюю — в конец.
  const getInsertIndexForSlot = (slot: DockSlotId, clientY: number): number => {
    const rect = getDockHitTestRect(slot)
    const currentDocked = layoutRef.current.docked[slot]
    const capacity = getSlotCapacity(slot)

    if (!rect) return Math.min(currentDocked.length, Math.max(0, capacity - 1))
    if (capacity === 1) return 0

    const midY = rect.top + rect.height / 2
    return clientY < midY ? 0 : 1
  }

  // Начинаем перетаскивание панели.
  const startPanelDrag = (panelId: string) => (event: React.PointerEvent<HTMLElement>) => {
    // Левой кнопкой мыши.
    if (event.button !== 0) return

    const currentPanel = layoutRef.current.panels[panelId]
    if (!currentPanel || currentPanel.mode === 'hidden') return

    // Чтобы браузер не пытался выделять текст и т.п.
    event.preventDefault()
    event.stopPropagation()

    // Захватываем pointer, чтобы продолжать получать события,
    // даже если курсор убежал за пределы шапки.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Иногда setPointerCapture может падать (зависит от браузера/контекста).
      // В таком случае мы всё равно будем слушать window events.
    }

    // Берём DOM-rect панели, чтобы знать её размер.
    const panelEl = (event.currentTarget as HTMLElement).closest('.dockPanel') as HTMLElement | null
    const panelRect = panelEl?.getBoundingClientRect() ?? null

    const grabOffset: Vec2 = panelRect
      ? { x: event.clientX - panelRect.left, y: event.clientY - panelRect.top }
      : { x: 12, y: 12 }

    const size: Size = panelRect
      ? {
        width: Math.max(120, Math.round(panelRect.width)),
        height: Math.max(80, Math.round(panelRect.height))
      }
      : { width: 320, height: 220 }

    const ghostPosition = getFloatingPositionAtPoint(event.clientX, event.clientY, grabOffset)
    const hoverSlot = getHoverSlotAtPoint(event.clientX, event.clientY)
    const hoverInsertIndex = hoverSlot ? getInsertIndexForSlot(hoverSlot, event.clientY) : null

    // Если мы тащим floating панель, поднимаем её наверх по zIndex.
    // Так она не окажется под другими окнами.
    if (currentPanel.mode === 'floating') {
      const panelValues = Object.values(layoutRef.current.panels) as Array<
        LayoutState['panels'][string]
      >
      const maxZ = Math.max(1, ...panelValues.map((p) => p.zIndex ?? 1))
      if (currentPanel.zIndex < maxZ) {
        setLayout({
          ...layoutRef.current,
          panels: {
            ...layoutRef.current.panels,
            [panelId]: {
              ...currentPanel,
              zIndex: maxZ + 1
            }
          }
        })
      }
    }

    setDrag({
      panelId,
      pointerId: event.pointerId,
      grabOffset,
      size
    })

    // Сразу обновляем превью, чтобы призрак появился без задержек.
    scheduleDragPreview(ghostPosition, hoverSlot, hoverInsertIndex)
  }

  // Пока пользователь тащит панель, мы обновляем "призрак" и подсветку дока.
  useEffect(() => {
    if (!drag) return

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return

      const ghostPosition = getFloatingPositionAtPoint(
        event.clientX,
        event.clientY,
        drag.grabOffset
      )
      const hoverSlot = getHoverSlotAtPoint(event.clientX, event.clientY)
      const hoverInsertIndex = hoverSlot ? getInsertIndexForSlot(hoverSlot, event.clientY) : null

      // Обновляем только превью, чтобы не трясти всё дерево.
      scheduleDragPreview(ghostPosition, hoverSlot, hoverInsertIndex)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return

      const currentLayout = layoutRef.current
      const currentPanel = currentLayout.panels[drag.panelId]
      if (!currentPanel) {
        setDrag(null)
        updateDragPreviewDOM(null, null, null)
        return
      }

      const hoverSlot = getHoverSlotAtPoint(event.clientX, event.clientY)
      const nextDocked = {
        left: [...currentLayout.docked.left],
        right: [...currentLayout.docked.right],
        bottom: [...currentLayout.docked.bottom]
      }

      const nextPanels = { ...currentLayout.panels }

      // Всегда сначала вынимаем панель отовсюду.
      removeFromAllSlots(nextDocked, drag.panelId)

      // Вариант 1: докаем.
      if (hoverSlot) {
        const insertIndex = getInsertIndexForSlot(hoverSlot, event.clientY)
        insertIntoSlot(nextDocked, hoverSlot, drag.panelId, insertIndex)
        enforceSlotCapacity(nextDocked, nextPanels, hoverSlot, drag.panelId)

        setLayout({
          ...currentLayout,
          docked: nextDocked,
          panels: {
            ...nextPanels,
            [drag.panelId]: {
              ...currentPanel,
              mode: 'docked',
              slot: hoverSlot,
              position: null,
              size: null,
              lastDockedSlot: hoverSlot,
              lastFloatingPosition:
                currentPanel.position ?? currentPanel.lastFloatingPosition ?? null,
              lastFloatingSize: currentPanel.size ?? currentPanel.lastFloatingSize ?? null
            }
          }
        })

        setDrag(null)
        updateDragPreviewDOM(null, null, null)
        return
      }

      // Вариант 2: оставляем floating.
      const floatingPosition = getFloatingPositionAtPoint(
        event.clientX,
        event.clientY,
        drag.grabOffset
      )
      const panelVals = Object.values(currentLayout.panels) as Array<LayoutState['panels'][string]>
      const maxZ = Math.max(1, ...panelVals.map((p) => p.zIndex ?? 1))

      setLayout({
        ...currentLayout,
        docked: nextDocked,
        panels: {
          ...currentLayout.panels,
          [drag.panelId]: {
            ...currentPanel,
            mode: 'floating',
            slot: null,
            position: floatingPosition,
            size: drag.size,
            zIndex: maxZ + 1,
            lastDockedSlot: currentPanel.slot ?? currentPanel.lastDockedSlot ?? null,
            lastFloatingPosition: floatingPosition,
            lastFloatingSize: drag.size
          }
        }
      })

      setDrag(null)
      updateDragPreviewDOM(null, null, null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [drag, setLayout])

  // Переключаем видимость панели через меню.
  // Сейчас это только show/hide, без реального docking.
  const togglePanel = (panelId: string) => {
    const current = layout.panels[panelId]
    if (!current) return

    // Закрываем панель.
    if (current.mode !== 'hidden') {
      const nextDocked = {
        left: [...layout.docked.left],
        right: [...layout.docked.right],
        bottom: [...layout.docked.bottom]
      }
      removeFromAllSlots(nextDocked, panelId)

      // Если панель была floating, запомним её последнюю позицию/размер.
      const lastFloatingPosition = current.position ?? current.lastFloatingPosition ?? null
      const lastFloatingSize = current.size ?? current.lastFloatingSize ?? null

      setLayout({
        ...layout,
        docked: nextDocked,
        panels: {
          ...layout.panels,
          [panelId]: {
            ...current,
            mode: 'hidden',
            lastDockedSlot: current.slot ?? current.lastDockedSlot ?? null,
            slot: null,
            position: null,
            size: null,
            lastFloatingPosition,
            lastFloatingSize
          }
        }
      })
      return
    }

    // Если панель раньше жила в доке, стараемся вернуть её туда.
    const preferredDockSlot = current.lastDockedSlot
    if (preferredDockSlot) {
      const nextDocked = {
        left: [...layout.docked.left],
        right: [...layout.docked.right],
        bottom: [...layout.docked.bottom]
      }
      const nextPanels = { ...layout.panels }

      removeFromAllSlots(nextDocked, panelId)
      insertIntoSlot(nextDocked, preferredDockSlot, panelId, nextDocked[preferredDockSlot].length)
      enforceSlotCapacity(nextDocked, nextPanels, preferredDockSlot, panelId)

      if (nextPanels[panelId]?.mode !== 'hidden') {
        setLayout({
          ...layout,
          docked: nextDocked,
          panels: {
            ...nextPanels,
            [panelId]: {
              ...current,
              mode: 'docked',
              slot: preferredDockSlot,
              position: null,
              size: null,
              lastDockedSlot: preferredDockSlot
            }
          }
        })
        return
      }
    }

    // Если вернуть в док нельзя — открываем панель как floating.
    const rootRect = rootRef.current?.getBoundingClientRect()
    const fallbackSize = current.lastFloatingSize ?? { width: 360, height: 240 }

    const clampedWidth = clamp(
      fallbackSize.width,
      MIN_FLOAT_WIDTH,
      rootRect?.width ?? fallbackSize.width
    )
    const clampedHeight = clamp(
      fallbackSize.height,
      MIN_FLOAT_HEIGHT,
      rootRect?.height ?? fallbackSize.height
    )

    // Стартовая позиция — либо последняя, либо центр экрана.
    const defaultPosition: Vec2 = current.lastFloatingPosition ?? {
      x: rootRect ? Math.max(12, (rootRect.width - clampedWidth) / 2) : 120,
      y: rootRect ? Math.max(60, (rootRect.height - clampedHeight) / 2) : 80
    }

    const maxZ = Math.max(1, ...Object.values(layout.panels).map((p) => p.zIndex ?? 1))

    setLayout({
      ...layout,
      panels: {
        ...layout.panels,
        [panelId]: {
          ...current,
          mode: 'floating',
          slot: null,
          position: defaultPosition,
          // Размер окна по умолчанию, чтобы панель сразу была видна.
          size: { width: clampedWidth, height: clampedHeight },
          zIndex: maxZ + 1
        }
      }
    })
  }

  // Новые хоткеи из мегаплана подключаем отдельным foundation-слоем,
  // не ломая старый рабочий keydown-блок для clipboard/delete/save.
  const hotkeyHandlers = useMemo(
    () => [
      {
        actionId: 'toggle_inspector' as const,
        handler: () => togglePanel('panel.inspector')
      },
      {
        actionId: 'focus_left_dock' as const,
        handler: () => {
          leftDockRef.current?.focus()
        }
      },
      {
        actionId: 'focus_right_dock' as const,
        handler: () => {
          rightDockRef.current?.focus()
        }
      },
      {
        actionId: 'focus_bottom_dock' as const,
        handler: () => {
          if (!activeBottomTabId) {
            const nextBottomId =
              layout.docked.bottom.find((id) => layout.panels[id]?.mode === 'docked') ?? null
            if (nextBottomId) {
              setActiveBottomTabId(nextBottomId)
            }
          }
          bottomDockRef.current?.focus()
        }
      },
      {
        actionId: 'toggle_all_dock_panels' as const,
        handler: () => {
          // Это отдельный shortcut именно для dock-panels.
          // В отличие от zen mode, он просто переключает состояние видимых dock-зон.
          setCollapsedDocks((prev) => {
            const nextCollapsed = !(prev.left && prev.right && prev.bottom)
            return {
              left: nextCollapsed,
              right: nextCollapsed,
              bottom: nextCollapsed
            }
          })
        }
      },
      {
        actionId: 'fit_view' as const,
        handler: () => {
          setFitViewRequestId((prev) => prev + 1)
        }
      },
      {
        actionId: 'zen_mode' as const,
        handler: () => {
          setCollapsedDocks((prev) => {
            const nextCollapsed = !(prev.left && prev.right && prev.bottom)
            return {
              left: nextCollapsed,
              right: nextCollapsed,
              bottom: nextCollapsed
            }
          })
        }
      }
    ],
    [activeBottomTabId, layout.docked.bottom, layout.panels, togglePanel]
  )

  useHotkeys({
    keybindings: preferences.keybindings,
    handlers: hotkeyHandlers
  })

  // Начинаем ресайз доков или floating панели.
  const startResizeDrag =
    (kind: ResizeKind, panelId?: string) => (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return

      event.preventDefault()
      event.stopPropagation()

      const currentLayout = layoutRef.current
      const panel = panelId ? currentLayout.panels[panelId] : null

      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Если pointer capture недоступен, мы всё равно ловим события на window.
      }

      setResizeDrag({
        kind,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startDockSizes: { ...currentLayout.dockSizes },
        panelId,
        startPanelPosition: panel?.position ?? null,
        startPanelSize: panel?.size ?? null
      })
    }

  // Пока мы ресайзим, обновляем размеры в layout.
  useEffect(() => {
    let frameId: number | null = null

    if (!resizeDrag) return

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== resizeDrag.pointerId) return

      if (frameId !== null) return
      frameId = requestAnimationFrame(() => {
        frameId = null
        const currentLayout = layoutRef.current
        const rootRect = rootRef.current?.getBoundingClientRect()
        if (!rootRect) return

        const dx = event.clientX - resizeDrag.startX
        const dy = event.clientY - resizeDrag.startY

        if (resizeDrag.kind === 'dock-left') {
          const maxLeft = Math.max(
            MIN_LEFT_WIDTH,
            rootRect.width - currentLayout.dockSizes.rightWidth - MIN_CENTER_WIDTH
          )
          const nextLeftWidth = clamp(
            resizeDrag.startDockSizes.leftWidth + dx,
            MIN_LEFT_WIDTH,
            maxLeft
          )

          rootRef.current?.style.setProperty('--leftDockWidth', `${nextLeftWidth}px`)
          layoutRef.current.dockSizes = {
            ...layoutRef.current.dockSizes,
            leftWidth: nextLeftWidth
          }
          return
        }

        if (resizeDrag.kind === 'dock-right') {
          const maxRight = Math.max(
            MIN_RIGHT_WIDTH,
            rootRect.width - currentLayout.dockSizes.leftWidth - MIN_CENTER_WIDTH
          )
          const nextRightWidth = clamp(
            resizeDrag.startDockSizes.rightWidth - dx,
            MIN_RIGHT_WIDTH,
            maxRight
          )

          rootRef.current?.style.setProperty('--rightDockWidth', `${nextRightWidth}px`)
          layoutRef.current.dockSizes = {
            ...layoutRef.current.dockSizes,
            rightWidth: nextRightWidth
          }
          return
        }

        if (resizeDrag.kind === 'dock-bottom') {
          const topBarHeight = 30
          const maxBottom = Math.max(
            MIN_BOTTOM_HEIGHT,
            rootRect.height - topBarHeight - MIN_CENTER_HEIGHT
          )
          const nextBottomHeight = clamp(
            resizeDrag.startDockSizes.bottomHeight - dy,
            MIN_BOTTOM_HEIGHT,
            maxBottom
          )

          rootRef.current?.style.setProperty('--bottomDockHeight', `${nextBottomHeight}px`)
          layoutRef.current.dockSizes = {
            ...layoutRef.current.dockSizes,
            bottomHeight: nextBottomHeight
          }
          return
        }

        if (resizeDrag.kind === 'split-left') {
          const leftRect = leftDockRef.current?.getBoundingClientRect()
          if (!leftRect) return
          const ratio = clamp((event.clientY - leftRect.top) / leftRect.height, 0.15, 0.85)

          setLayout({
            ...currentLayout,
            dockSizes: {
              ...currentLayout.dockSizes,
              leftSplit: ratio
            }
          })
          return
        }

        if (resizeDrag.kind === 'split-right') {
          const rightRect = rightDockRef.current?.getBoundingClientRect()
          if (!rightRect) return
          const ratio = clamp((event.clientY - rightRect.top) / rightRect.height, 0.15, 0.85)

          setLayout({
            ...currentLayout,
            dockSizes: {
              ...currentLayout.dockSizes,
              rightSplit: ratio
            }
          })
          return
        }

        if (resizeDrag.kind.startsWith('float-') && resizeDrag.panelId) {
          const panel = currentLayout.panels[resizeDrag.panelId]
          if (!panel || !resizeDrag.startPanelSize || !resizeDrag.startPanelPosition) return

          const maxWidth = Math.max(MIN_FLOAT_WIDTH, rootRect.width - 24)
          const maxHeight = Math.max(MIN_FLOAT_HEIGHT, rootRect.height - 24)

          // Определяем, какие стороны двигаются.
          const affectsTop = resizeDrag.kind.includes('n')
          const affectsBottom = resizeDrag.kind.includes('s')
          const affectsLeft = resizeDrag.kind.includes('w')
          const affectsRight = resizeDrag.kind.includes('e')

          const startPos = resizeDrag.startPanelPosition
          const startSize = resizeDrag.startPanelSize

          let nextWidth = startSize.width
          let nextHeight = startSize.height
          let nextX = startPos.x
          let nextY = startPos.y

          if (affectsRight) {
            nextWidth = startSize.width + dx
          }

          if (affectsBottom) {
            nextHeight = startSize.height + dy
          }

          if (affectsLeft) {
            nextWidth = startSize.width - dx
            nextX = startPos.x + dx
          }

          if (affectsTop) {
            nextHeight = startSize.height - dy
            nextY = startPos.y + dy
          }

          // Ограничиваем размеры и корректируем позицию,
          // чтобы панель не "прыгала" при достижении минимума.
          const clampedWidth = clamp(nextWidth, MIN_FLOAT_WIDTH, maxWidth)
          const clampedHeight = clamp(nextHeight, MIN_FLOAT_HEIGHT, maxHeight)

          if (affectsLeft) {
            nextX = startPos.x + (startSize.width - clampedWidth)
          }

          if (affectsTop) {
            nextY = startPos.y + (startSize.height - clampedHeight)
          }

          const maxX = Math.max(0, rootRect.width - clampedWidth)
          const maxY = Math.max(0, rootRect.height - clampedHeight)

          nextX = clamp(nextX, 0, maxX)
          nextY = clamp(nextY, 0, maxY)

          setLayout({
            ...currentLayout,
            panels: {
              ...currentLayout.panels,
              [resizeDrag.panelId]: {
                ...panel,
                position: { x: nextX, y: nextY },
                size: { width: clampedWidth, height: clampedHeight }
              }
            }
          })
        }
      })
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== resizeDrag.pointerId) return

      if (frameId !== null) cancelAnimationFrame(frameId)

      const currentLayout = layoutRef.current

      // Если это floating ресайз, запишем финальный размер как "последний".
      if (resizeDrag.kind.startsWith('float-') && resizeDrag.panelId) {
        const panel = currentLayout.panels[resizeDrag.panelId]
        if (panel?.size && panel.position) {
          setLayout({
            ...currentLayout,
            panels: {
              ...currentLayout.panels,
              [resizeDrag.panelId]: {
                ...panel,
                lastFloatingSize: panel.size,
                lastFloatingPosition: panel.position
              }
            }
          })
        }
      }

      // Для dock-ресайза: сохраняем финальные размеры из ref в React state.
      // Во время drag мы обновляли CSS-переменные напрямую (минуя React),
      // а теперь один раз сбрасываем актуальные значения в layout state.
      if (resizeDrag.kind === 'dock-left' || resizeDrag.kind === 'dock-right' || resizeDrag.kind === 'dock-bottom') {
        setLayout({
          ...layoutRef.current,
          dockSizes: { ...layoutRef.current.dockSizes }
        })
      }

      setResizeDrag(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [resizeDrag, setLayout])

  const leftTopGrow = layout.dockSizes.leftSplit
  const leftBottomGrow = Math.max(0.001, 1 - layout.dockSizes.leftSplit)

  const rightTopGrow = layout.dockSizes.rightSplit
  const rightBottomGrow = Math.max(0.001, 1 - layout.dockSizes.rightSplit)

  // Какие панели реально лежат в доках сейчас (порядок важен).
  const leftDockedIds = layout.docked.left.filter((id) => layout.panels[id]?.mode === 'docked')
  const rightDockedIds = layout.docked.right.filter((id) => layout.panels[id]?.mode === 'docked')
  const bottomDockedIds = layout.docked.bottom.filter((id) => layout.panels[id]?.mode === 'docked')

  // Подготавливаем порядок рендера панелей внутри вертикальных доков.
  // Если одна панель свёрнута, она опускается вниз до одной шапки.
  const leftDockRenderState = getVerticalDockRenderState(
    [
      leftDockedIds[0]
        ? {
          id: leftDockedIds[0],
          className: ['dockPanelActions', drag?.panelId === leftDockedIds[0] ? 'isDragSource' : '']
            .filter(Boolean)
            .join(' '),
          baseStyle: {
            flexGrow: leftDockedIds.length >= 2 ? leftTopGrow : 1,
            flexBasis: 0,
            minHeight: 0
          }
        }
        : null,
      leftDockedIds[1]
        ? {
          id: leftDockedIds[1],
          className: ['dockPanelBookmarks', drag?.panelId === leftDockedIds[1] ? 'isDragSource' : '']
            .filter(Boolean)
            .join(' '),
          baseStyle: {
            flexGrow: leftDockedIds.length >= 2 ? leftBottomGrow : 1,
            flexBasis: 0,
            minHeight: 0
          }
        }
        : null
    ]
  )

  const rightDockRenderState = getVerticalDockRenderState(
    [
      rightDockedIds[0]
        ? {
          id: rightDockedIds[0],
          className: ['dockPanelText', drag?.panelId === rightDockedIds[0] ? 'isDragSource' : '']
            .filter(Boolean)
            .join(' '),
          baseStyle: {
            flexGrow: rightDockedIds.length >= 2 ? rightTopGrow : 1,
            flexBasis: 0,
            minHeight: 0
          }
        }
        : null,
      rightDockedIds[1]
        ? {
          id: rightDockedIds[1],
          className: ['dockPanelInspector', drag?.panelId === rightDockedIds[1] ? 'isDragSource' : '']
            .filter(Boolean)
            .join(' '),
          baseStyle: {
            flexGrow: rightDockedIds.length >= 2 ? rightBottomGrow : 1,
            flexBasis: 0,
            minHeight: 0
          }
        }
        : null
    ]
  )

  // Выбираем панели, которые сейчас floating.
  const floatingPanelIds = Object.keys(layout.panels).filter(
    (id) => layout.panels[id]?.mode === 'floating'
  )

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="editorRoot"
      style={
        {
          // Ширины/высоты доков мы задаём через CSS-переменные,
          // чтобы потом было легко подключить drag-resize.
          // Реальный layout у collapsed dock теперь схлопывается до edge bar,
          // а drag/drop сохраняется через отдельный invisible hitbox.
          ['--leftDockWidth' as string]: `${collapsedDocks.left ? COLLAPSED_DOCK_SIZE : layout.dockSizes.leftWidth}px`,
          ['--rightDockWidth' as string]: `${collapsedDocks.right ? COLLAPSED_DOCK_SIZE : layout.dockSizes.rightWidth}px`,
          // Даже пустой bottom dock оставляем тонкой полосой,
          // чтобы панель можно было вернуть назад drag-and-drop без "слепой" зоны.
          ['--bottomDockHeight' as string]:
            bottomDockedIds.length > 0
              ? `${collapsedDocks.bottom ? COLLAPSED_DOCK_SIZE : layout.dockSizes.bottomHeight}px`
              : `${COLLAPSED_DOCK_SIZE}px`
        } as CSSProperties
      }
    >
      {/* Уведомление об обновлении (показывается только когда есть новая версия). */}
      <UpdateNotification />

      {/* Индикатор загрузки проекта. */}
      {isProjectLoading && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
        >
          <div
            style={{
              background: 'var(--color-background-soft)',
              padding: '16px 24px',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              color: 'var(--ev-c-text-1)',
              fontSize: 14,
              fontWeight: 500
            }}
          >
            {t('editor.loadingProject', 'Loading project...')}
          </div>
        </div>
      )}

      <header className="editorTopBar">
        <TopMenuBar
          panels={allPanels}
          isPanelVisible={isPanelVisible}
          togglePanel={togglePanel}
          onOpenProject={openProject}
          onExport={handleExport}
          onNew={handleNew}
          onCreateExample={handleCreateExample}
          onOpenScene={handleOpenScene}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onUndo={undo}
          onRedo={redo}
          onResetLayout={() => {
            // Сбрасываем layout к дефолтным значениям.
            import('./useLayoutState').then(({ createDefaultLayout }) => {
              setLayout(createDefaultLayout())
            })
          }}
          onCheckUpdates={() => {
            // Проверяем, что мы в Electron-контексте.
            if (!window.api?.updater) {
              console.warn('Updater API not available')
              return
            }

            window.api.updater
              .check()
              .then((res) => {
                if (res.status === 'available') {
                  pushInfo(toasts, `v${res.version}`, { title: t('toasts.updateAvailable', 'Update available') })
                  return
                }

                if (res.status === 'none') {
                  pushInfo(toasts, t('toasts.noUpdates', 'No updates'))
                  return
                }

                pushError(toasts, res.message, { title: t('toasts.updateCheckFailed', 'Update check failed') })
              })
              .catch((err) => {
                // Если IPC-хэндлер не зарегистрирован или что-то пошло не так — покажем ошибку.
                const msg = err instanceof Error ? err.message : String(err)
                pushError(toasts, msg, { title: t('toasts.updateCheckFailed', 'Update check failed') })
              })
          }}
          onToggleRuntimeJson={() => togglePanel('panel.runtime_json')}
          runtimeJsonVisible={isPanelVisible('panel.runtime_json')}
          onCopyLogToClipboard={() => {
            if (!window.api?.appInfo?.copyLogToClipboard) {
              console.warn('App info API not available')
              return
            }

            window.api.appInfo
              .copyLogToClipboard()
              .then((result) => {
                if (result.copied) {
                  pushSuccess(toasts, t('toasts.logCopied', 'Log copied'))
                  return
                }

                pushError(toasts, t('toasts.logCopyFailed', 'Copy failed'))
              })
              .catch((err) => {
                const msg = err instanceof Error ? err.message : String(err)
                pushError(toasts, msg, { title: t('toasts.logCopyFailed', 'Copy failed') })
              })
          }}
          onOpenDevTools={() => {
            if (!window.api?.appInfo?.openDevTools) {
              console.warn('App info API not available')
              return
            }

            void window.api.appInfo.openDevTools()
          }}
          onToggleHardwareAcceleration={() => {
            updatePreferences({
              disableHardwareAcceleration: !preferences.disableHardwareAcceleration
            })
          }}
          onChooseScreenshotOutputDir={() => {
            if (!window.api?.preferences?.chooseScreenshotOutputDir) {
              console.warn('Preferences API not available')
              return
            }

            window.api.preferences
              .chooseScreenshotOutputDir()
              .then((dirPath) => {
                if (!dirPath) return
                updatePreferences({ screenshotOutputDir: dirPath })
              })
              .catch((err) => {
                console.warn('Failed to choose screenshot output dir:', err)
              })
          }}
          onToggleVisualEditorTechMode={() => {
            updatePreferences({
              visualEditorTechMode: !preferences.visualEditorTechMode
            })
          }}
          visualEditorTechModeEnabled={preferences.visualEditorTechMode}
          hardwareAccelerationDisabled={preferences.disableHardwareAcceleration}
          onOpenVisualEditing={openVisualEditorWindow}
          onAbout={() => setAboutOpen(true)}
          onExit={() => window.close()}
          onPreferences={() => setPreferencesOpen(true)}
          language={preferences.language}
          keybindings={preferences.keybindings}
        />
      </header>

      <aside
        ref={leftDockRef}
        tabIndex={-1}
        className={['editorLeftDock', collapsedDocks.left ? 'isDockVisuallyCollapsed' : '']
          .filter(Boolean)
          .join(' ')}
      >
        {/* Невидимый расширенный hitbox нужен только когда док свёрнут.
            Так панель можно уронить в док, даже если визуально осталась одна полоска. */}
        <div ref={leftDockHitboxRef} className="dockDropHitbox dockDropHitboxLeft" aria-hidden="true" />
        {/* Тонкая полоса для визуального collapse слева.
            Сам layout теперь схлопывается, а расширенный hitbox живёт в отдельном div. */}
        <div
          className="dockCollapseBar dockCollapseBarLeft"
          onClick={() => setCollapsedDocks((prev) => ({ ...prev, left: !prev.left }))}
          title={collapsedDocks.left ? 'Expand left dock' : 'Collapse left dock'}
        >
          <span>{collapsedDocks.left ? '›' : '‹'}</span>
        </div>
        {/* Точный preview показывает именно верхнюю или нижнюю позицию вставки. */}
        <div ref={leftDockPreviewRef} className="dockDropPreview" aria-hidden="true" />
        <div className="dockCollapseContent">
          <div className="dockSlotSplit dockSlotSplitLeft">
            {leftDockRenderState.orderedEntries.map((entry, index) => (
              <React.Fragment key={entry.id}>
                <DockPanel
                  title={getPanelTitle(entry.id)}
                  className={entry.className}
                  style={getDockedPanelStyle(entry.id, entry.baseStyle, {
                    fillRemainingSpace: leftDockRenderState.fillRemainingPanelId === entry.id
                  })}
                  onHeaderPointerDown={startPanelDrag(entry.id)}
                  collapsed={layout.panels[entry.id]?.collapsed}
                  onToggleCollapse={() => togglePanelCollapse(entry.id)}
                  collapseLabel={collapsePanelLabel}
                  closeLabel={closePanelLabel}
                  onClose={() => togglePanel(entry.id)}
                >
                  {renderPanelContents(entry.id)}
                </DockPanel>
                {leftDockRenderState.showSplitter && index === 0 ? (
                  <div
                    className="internalSplitter"
                    aria-hidden="true"
                    onPointerDown={startResizeDrag('split-left')}
                  />
                ) : null}
              </React.Fragment>
            ))}
          </div>
        </div>
      </aside>

      <main className="editorCenter">
        <div className="centerCanvasHeader">{t('editor.nodeEditor', 'Node Editor')}</div>
        <div className="centerCanvasBody">
          {/* Основной холст: показываем ноды и выбор из runtime-json. */}
          {/* PreferencesProvider передаёт настройки в ноды (showNodeNameOnCanvas и т.д.) */}
          <PreferencesProvider value={preferences}>
            <FlowCanvas
              runtimeNodes={runtime.nodes}
              runtimeEdges={runtime.edges}
              selectedNodeId={runtime.selectedNodeId}
              selectedNodeIds={runtime.selectedNodeIds}
              selectedEdgeId={runtime.selectedEdgeId}
              onSelectNodes={handleSelectNodes}
              onSelectEdge={handleSelectEdge}
              onNodePositionChange={handleNodePositionChange}
              onEdgeAdd={handleEdgeAdd}
              onEdgeRemove={handleEdgeRemove}
              onParallelAddBranch={onParallelAddBranch}
              onParallelRemoveBranch={onParallelRemoveBranch}
              onNodeDelete={handleNodeDelete}
              onPaneClickCreate={createDefaultPaneNode}
              onPaneDropCreate={createPaletteDropNode}
              onEdgeDelete={handleEdgeDelete}
              onEdgeDoubleClick={handleEdgeDoubleClick}
              fitViewRequestId={fitViewRequestId}
            />
          </PreferencesProvider>
        </div>
      </main>

      <aside
        ref={rightDockRef}
        tabIndex={-1}
        className={['editorRightDock', collapsedDocks.right ? 'isDockVisuallyCollapsed' : '']
          .filter(Boolean)
          .join(' ')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Невидимый расширенный hitbox для свёрнутого правого дока. */}
        <div ref={rightDockHitboxRef} className="dockDropHitbox dockDropHitboxRight" aria-hidden="true" />
        {/* Тонкая полоса для визуального collapse справа.
            Она всегда закреплена на своей стороне, а не перескакивает через экран. */}
        <div
          className="dockCollapseBar dockCollapseBarRight"
          onClick={() => setCollapsedDocks((prev) => ({ ...prev, right: !prev.right }))}
          title={collapsedDocks.right ? 'Expand right dock' : 'Collapse right dock'}
        >
          <span>{collapsedDocks.right ? '‹' : '›'}</span>
        </div>
        {/* Preview рисуем поверх дока, а не через outline всего контейнера. */}
        <div ref={rightDockPreviewRef} className="dockDropPreview" aria-hidden="true" />
        <div className="dockCollapseContent">
          <div className="dockSlotSplit dockSlotSplitRight">
            {rightDockRenderState.orderedEntries.map((entry, index) => (
              <React.Fragment key={entry.id}>
                <DockPanel
                  title={getPanelTitle(entry.id)}
                  className={entry.className}
                  style={getDockedPanelStyle(entry.id, entry.baseStyle, {
                    fillRemainingSpace: rightDockRenderState.fillRemainingPanelId === entry.id
                  })}
                  onHeaderPointerDown={startPanelDrag(entry.id)}
                  collapsed={layout.panels[entry.id]?.collapsed}
                  onToggleCollapse={() => togglePanelCollapse(entry.id)}
                  collapseLabel={collapsePanelLabel}
                  closeLabel={closePanelLabel}
                  onClose={() => togglePanel(entry.id)}
                >
                  {renderPanelContents(entry.id)}
                </DockPanel>
                {rightDockRenderState.showSplitter && index === 0 ? (
                  <div
                    className="internalSplitter"
                    aria-hidden="true"
                    onPointerDown={startResizeDrag('split-right')}
                  />
                ) : null}
              </React.Fragment>
            ))}
          </div>
        </div>
      </aside>

      <section
        ref={bottomDockRef}
        tabIndex={-1}
        className={[
          'editorBottomDock',
          collapsedDocks.bottom ? 'isDockVisuallyCollapsed' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Невидимый hitbox для нижнего дока живёт отдельно,
            чтобы свёрнутый док оставался узким, но drop всё ещё работал по старой зоне. */}
        <div ref={bottomDockHitboxRef} className="dockDropHitbox dockDropHitboxBottom" aria-hidden="true" />
        {bottomDockedIds.length > 0 ? (
          <div
            className="dockCollapseBar dockCollapseBarBottom"
            onClick={() => setCollapsedDocks((prev) => ({ ...prev, bottom: !prev.bottom }))}
            title={collapsedDocks.bottom ? 'Expand bottom dock' : 'Collapse bottom dock'}
          >
            <span>{collapsedDocks.bottom ? '▴' : '▾'}</span>
          </div>
        ) : null}
        {/* Preview нижнего дока занимает точную область, куда сядет панель. */}
        <div ref={bottomDockPreviewRef} className="dockDropPreview" aria-hidden="true" />
        <div className="dockCollapseContent">
          {bottomDockedIds.length > 0
            ? (() => {
              // Определяем активную вкладку: если сохранённая не в списке — берём первую.
              const activeId =
                activeBottomTabId && bottomDockedIds.includes(activeBottomTabId)
                  ? activeBottomTabId
                  : bottomDockedIds[0]

              return (
                <>
                  {/* Таб-бар показываем только если панелей > 1. */}
                  {bottomDockedIds.length > 1 && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 0,
                        borderBottom: '1px solid var(--ev-c-gray-3)',
                        background: 'var(--color-background-soft)',
                        flexShrink: 0
                      }}
                    >
                      {bottomDockedIds.map((panelId) => (
                        <div
                          key={panelId}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: 'flex',
                            alignItems: 'stretch',
                            background:
                              panelId === activeId ? 'var(--color-background)' : 'var(--color-background-soft)',
                            borderBottom:
                              panelId === activeId
                                ? '2px solid var(--ev-c-accent)'
                                : '2px solid transparent'
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveBottomTabId(panelId)}
                            onPointerDown={(e) => {
                              // ПКМ — начинаем drag панели из таба.
                              if (e.button === 0 && e.detail >= 2) return
                            }}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: '4px 8px',
                              fontSize: 11,
                              fontWeight: panelId === activeId ? 700 : 400,
                              color:
                                panelId === activeId ? 'var(--ev-c-text-1)' : 'var(--ev-c-text-2)',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'color 0.12s, background 0.12s',
                              textAlign: 'left'
                            }}
                          >
                            {getPanelTitle(panelId)}
                          </button>
                          <button
                            type="button"
                            aria-label={closePanelLabel}
                            title={closePanelLabel}
                            onClick={() => togglePanel(panelId)}
                            style={{
                              width: 28,
                              border: 'none',
                              borderLeft: '1px solid var(--ev-c-gray-3)',
                              background: 'transparent',
                              color: 'var(--ev-c-text-2)',
                              cursor: 'pointer'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Контент активной вкладки. */}
                  <DockPanel
                    title={getPanelTitle(activeId)}
                    className={['dockPanelLogs', drag?.panelId === activeId ? 'isDragSource' : '']
                      .filter(Boolean)
                      .join(' ')}
                    style={getDockedPanelStyle(activeId)}
                    onHeaderPointerDown={startPanelDrag(activeId)}
                    collapsed={layout.panels[activeId]?.collapsed}
                    onToggleCollapse={() => togglePanelCollapse(activeId)}
                    collapseLabel={collapsePanelLabel}
                    closeLabel={closePanelLabel}
                    onClose={() => togglePanel(activeId)}
                  >
                    {renderPanelContents(activeId)}
                  </DockPanel>
                </>
              )
            })()
            : null}
        </div>
      </section>

      {/*
        Отдельный слой для плавающих панелей.
        Он лежит поверх grid, но не ломает layout.
      */}
      <div className="floatingLayer" aria-hidden={drag ? 'true' : 'false'}>
        {floatingPanelIds.map((panelId) => {
          const p = layout.panels[panelId]
          if (!p || p.mode !== 'floating' || !p.position || !p.size) return null

          // Если панель сейчас тащим, мы показываем только "призрак".
          if (drag?.panelId === panelId) return null

          return (
            <div
              key={panelId}
              className="floatingPanel"
              style={{
                left: `${p.position.x}px`,
                top: `${p.position.y}px`,
                width: `${p.size.width}px`,
                height: `${p.size.height}px`,
                zIndex: p.zIndex
              }}
            >
              <DockPanel
                title={getPanelTitle(panelId)}
                className="isFloating"
                onHeaderPointerDown={startPanelDrag(panelId)}
                collapsed={p.collapsed}
                onToggleCollapse={() => togglePanelCollapse(panelId)}
                collapseLabel={collapsePanelLabel}
                closeLabel={closePanelLabel}
                onClose={() => togglePanel(panelId)}
              >
                {renderPanelContents(panelId)}
              </DockPanel>
              {/* Невидимые зоны для ресайза по краям и углам (как в Windows). */}
              <div
                className="floatingResizeZone resize-n"
                onPointerDown={startResizeDrag('float-n', panelId)}
              />
              <div
                className="floatingResizeZone resize-s"
                onPointerDown={startResizeDrag('float-s', panelId)}
              />
              <div
                className="floatingResizeZone resize-e"
                onPointerDown={startResizeDrag('float-e', panelId)}
              />
              <div
                className="floatingResizeZone resize-w"
                onPointerDown={startResizeDrag('float-w', panelId)}
              />
              <div
                className="floatingResizeZone resize-ne"
                onPointerDown={startResizeDrag('float-ne', panelId)}
              />
              <div
                className="floatingResizeZone resize-nw"
                onPointerDown={startResizeDrag('float-nw', panelId)}
              />
              <div
                className="floatingResizeZone resize-se"
                onPointerDown={startResizeDrag('float-se', panelId)}
              />
              <div
                className="floatingResizeZone resize-sw"
                onPointerDown={startResizeDrag('float-sw', panelId)}
              />
            </div>
          )
        })}

        {/* Призрак панели всегда в DOM, но скрыт когда не тащим.
            Позиция и видимость управляются через ref напрямую, минуя React. */}
        <div
          ref={ghostRef}
          className="dragGhost"
          style={{
            display: 'none',
            width: drag ? `${drag.size.width}px` : undefined,
            height: drag ? `${drag.size.height}px` : undefined
          }}
        >
          <div className="dragGhostHeader">
            {drag ? getPanelTitle(drag.panelId) : ''}
          </div>
        </div>
      </div>

      {/* Сплиттеры для изменения размеров доков. */}
      <div
        className="dockSplitter dockSplitterVertical dockSplitterLeft"
        onPointerDown={startResizeDrag('dock-left')}
      />
      <div
        className="dockSplitter dockSplitterVertical dockSplitterRight"
        onPointerDown={startResizeDrag('dock-right')}
      />
      <div
        className="dockSplitter dockSplitterHorizontal dockSplitterBottom"
        onPointerDown={startResizeDrag('dock-bottom')}
      />

      {/* Модалка настроек. */}
      <PreferencesModal
        open={preferencesOpen}
        preferences={preferences}
        updatePreferences={updatePreferences}
        onClose={() => setPreferencesOpen(false)}
      />

      <AboutModal
        open={aboutOpen}
        version={appVersion}
        onOpenDocs={handleOpenDocs}
        language={preferences.language}
        onClose={() => setAboutOpen(false)}
      />

      {/*
        Модалка предупреждения о конфликте имени ноды.
        Дубликаты разрешены, но по умолчанию мы предлагаем уникальный вариант.
      */}
      {nameConflictModal ? (
        <div
          className="prefsOverlay"
          onClick={() => {
            setPendingNodeName(nameConflictModal.previousName)
            setNameConflictModal(null)
          }}
        >
          <div className="prefsModal" onClick={(e) => e.stopPropagation()}>
            <div className="prefsHeader">
              <span className="prefsTitle">
                {preferences.language === 'ru' ? 'Дублирующееся имя ноды' : 'Duplicate node name'}
              </span>
              <button
                className="prefsCloseBtn"
                onClick={() => {
                  setPendingNodeName(nameConflictModal.previousName)
                  setNameConflictModal(null)
                }}
              >
                ✕
              </button>
            </div>

            <div className="prefsBody">
              <div className="prefsHint">
                {preferences.language === 'ru'
                  ? 'Это имя уже используется другой нодой'
                  : 'This name is already used by another node'}
                {nameConflictModal.conflictingWithNodeId
                  ? ` (${nameConflictModal.conflictingWithNodeId})`
                  : ''}
                {preferences.language === 'ru'
                  ? '. Дубликаты допустимы, но могут путать.'
                  : '. Duplicates are allowed, but it can be confusing.'}
              </div>

              <label className="prefsField">
                <span>{preferences.language === 'ru' ? 'Имя' : 'Name'}</span>
                <input
                  className="prefsInput"
                  value={nameConflictModal.value}
                  onChange={(e) =>
                    setNameConflictModal({
                      ...nameConflictModal,
                      value: e.target.value
                    })
                  }
                />
              </label>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  className="runtimeButton"
                  type="button"
                  onClick={() => {
                    setPendingNodeName(nameConflictModal.previousName)
                    setNameConflictModal(null)
                  }}
                >
                  {preferences.language === 'ru' ? 'Отмена' : 'Cancel'}
                </button>
                <button
                  ref={nameConflictOkRef}
                  className="runtimeButton"
                  type="button"
                  onClick={() => {
                    const v = nameConflictModal.value
                    setPendingNodeName(v)
                    setRuntime({
                      ...runtime,
                      nodes: runtime.nodes.map((n) =>
                        n.id === nameConflictModal.nodeId ? { ...n, name: v.trim() } : n
                      )
                    })
                    setNameConflictModal(null)
                  }}
                >
                  {preferences.language === 'ru' ? 'ОК' : 'OK'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
        </div>
  )
}

