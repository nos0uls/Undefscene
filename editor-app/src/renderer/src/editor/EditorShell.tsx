/* eslint-disable @typescript-eslint/explicit-function-return-type */
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import { AboutModal } from './AboutModal'
import { FlowCanvas } from './FlowCanvas'
import { TopMenuBar } from './TopMenuBar'
import { parseYarnPreview } from './yarnPreview'
import { useLayoutState, type LayoutState } from './useLayoutState'
import { useProjectResources } from './useProjectResources'
import { useRuntimeState } from './useRuntimeState'
import { validateGraph, type ValidationResult, type ValidationContext } from './validateGraph'
import { PreferencesModal } from './PreferencesModal'
import { WelcomeSetupModal } from './WelcomeSetupModal'
import { TutorialOverlay, TUTORIAL_REGISTRY } from './TutorialOverlay'
import { useToasts, pushSuccess, pushError, pushInfo } from './ToastHub'
import { useConfirm } from './ConfirmDialog'
import { getAccentCssVariables, usePreferences } from './usePreferences'
import { useHotkeys } from './useHotkeys'
import { InspectorPanel } from './InspectorPanel'
import { BookmarksPanel } from './BookmarksPanel'
import { PanelDataProvider } from './PanelDataContext'
import { ActionsPanel } from './ActionsPanel'
import { TextPanel } from './TextPanel'
import { LogsPanel } from './LogsPanel'
import { RuntimeJsonPanel } from './RuntimeJsonPanel'
import type { NameConflictModalState } from './inspectorTypes'
import { createTranslator } from '../i18n'
import { useNodeOperations, suggestUniqueNodeName } from './useNodeOperations'
import { useVisualEditing } from './useVisualEditing'
import { useEditorShortcuts } from './useEditorShortcuts'
import { useSceneIO } from './useSceneIO'
import { DockingProvider } from './DockingContext'
import { DockingLayout } from './DockingLayout'
import { useDocking } from './useDocking'

// Внешний слой: создаёт DockingProvider, чтобы внутренний компонент
// мог использовать useDocking() без ошибки "must be used within DockingProvider".
export function EditorShell(): React.JSX.Element {
  const { layout, setLayout } = useLayoutState()
  const rootRef = useRef<HTMLDivElement | null>(null)

  return (
    <DockingProvider layout={layout} setLayout={setLayout} rootRef={rootRef}>
      <EditorShellInner layout={layout} setLayout={setLayout} rootRef={rootRef} />
    </DockingProvider>
  )
}

// Внутренний компонент: имеет доступ к DockingContext через DockingProvider выше.
type EditorShellInnerProps = {
  layout: LayoutState
  setLayout: (l: LayoutState) => void
  rootRef: React.RefObject<HTMLDivElement | null>
}

function EditorShellInner({ layout, setLayout, rootRef }: EditorShellInnerProps): React.JSX.Element {
  const { runtime, setRuntime, undo, redo, canUndo, canRedo } = useRuntimeState()

  // Откладываем обновление крупных массивов для FlowCanvas — при drag-end
  // React не будет блокировать UI, чтобы пересчитать 2000 нод.
  // Панели (Inspector, Logs) читают актуальные данные из PanelDataContext.
  const deferredRuntimeNodes = useDeferredValue(runtime.nodes)
  const deferredRuntimeEdges = useDeferredValue(runtime.edges)

  const toasts = useToasts()
  const confirm = useConfirm()

  const { resources, engineSettings, yarnFiles, isLoading: isProjectLoading, openProject } = useProjectResources()

  const [sceneFilePath, setSceneFilePath] = useState<string | null>(null)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [isTutorialActive, setIsTutorialActive] = useState(false)

  // --- Contextual tutorials ---
  const [inspectorTutorialActive, setInspectorTutorialActive] = useState(false)
  const [visualEditingTutorialActive, setVisualEditingTutorialActive] = useState(false)

  const [aboutOpen, setAboutOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('Loading...')

  const [yarnPreviewContent, setYarnPreviewContent] = useState<string | null>(null)
  const [yarnPreviewLoading, setYarnPreviewLoading] = useState(false)
  const [selectedYarnPreviewTitle, setSelectedYarnPreviewTitle] = useState<string | null>(null)

  const { preferences, updatePreferences, loaded: preferencesLoaded } = usePreferences()

  // --- Onboarding Flow ---
  const [welcomeOpen, setWelcomeOpen] = useState(false)

  useEffect(() => {
    if (!preferencesLoaded) return
    if (!preferences.hasCompletedInitialSetup) {
      setWelcomeOpen(true)
    } else if (!preferences.hasCompletedTutorial) {
      setIsTutorialActive(true)
    }
  }, [preferencesLoaded, preferences.hasCompletedInitialSetup, preferences.hasCompletedTutorial])

  const handleWelcomeComplete = useCallback(() => {
    updatePreferences({ hasCompletedInitialSetup: true })
    setWelcomeOpen(false)
    // Tutorial will auto-trigger via the useEffect above after preferences update
  }, [updatePreferences])

  const handleTutorialComplete = useCallback(() => {
    updatePreferences({ hasCompletedTutorial: true })
    setIsTutorialActive(false)
  }, [updatePreferences])

  const handleTutorialSkip = useCallback(() => {
    updatePreferences({ hasCompletedTutorial: true })
    setIsTutorialActive(false)
  }, [updatePreferences])

  // Контекстный тур по инспектору запускается при первом выборе ноды,
  // если пользователь уже прошёл онбординг и не проходил этот тур раньше.
  useEffect(() => {
    if (!preferencesLoaded) return
    if (preferences.hasCompletedInspectorTutorial) return
    if (!preferences.hasCompletedTutorial) return
    if (runtime.selectedNodeId) {
      setInspectorTutorialActive(true)
    }
  }, [preferencesLoaded, preferences.hasCompletedInspectorTutorial, preferences.hasCompletedTutorial, runtime.selectedNodeId])

  const handleInspectorTutorialComplete = useCallback(() => {
    updatePreferences({ hasCompletedInspectorTutorial: true })
    setInspectorTutorialActive(false)
  }, [updatePreferences])

  const handleInspectorTutorialSkip = useCallback(() => {
    updatePreferences({ hasCompletedInspectorTutorial: true })
    setInspectorTutorialActive(false)
  }, [updatePreferences])

  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])
  const collapsePanelLabel = t('editor.collapsePanel', 'Collapse panel')
  const closePanelLabel = t('editor.closePanel', 'Close panel')

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

  useEffect(() => {
    if (!preferencesLoaded) return

    const accentVariables = getAccentCssVariables(preferences)
    for (const [variableName, variableValue] of Object.entries(accentVariables)) {
      document.documentElement.style.setProperty(variableName, variableValue)
    }
  }, [preferences, preferencesLoaded])

  // При смене parallelBranchPortMode переписываем handles рёбер,
  // чтобы они соответствовали видимым портам нод (shared vs separate).
  useEffect(() => {
    if (!preferencesLoaded) return

    const portMode = preferences.parallelBranchPortMode
    const nodeTypes = new Map(runtime.nodes.map((n) => [n.id, n.type]))

    const edgesBySource = new Map<string, typeof runtime.edges>()
    const edgesByTarget = new Map<string, typeof runtime.edges>()

    for (const edge of runtime.edges) {
      if (nodeTypes.get(edge.source) === 'parallel_start') {
        const list = edgesBySource.get(edge.source) ?? []
        list.push(edge)
        edgesBySource.set(edge.source, list)
      }
      if (nodeTypes.get(edge.target) === 'parallel_join') {
        const list = edgesByTarget.get(edge.target) ?? []
        list.push(edge)
        edgesByTarget.set(edge.target, list)
      }
    }

    let changed = false
    const nextEdges = runtime.edges.map((edge) => {
      const nextEdge = { ...edge }
      if (nodeTypes.get(edge.source) === 'parallel_start') {
        const list = edgesBySource.get(edge.source)!
        const idx = list.indexOf(edge)
        const nextHandle = portMode === 'shared' ? 'out_shared' : `out_b${idx}`
        if (edge.sourceHandle !== nextHandle) {
          nextEdge.sourceHandle = nextHandle
          changed = true
        }
      }
      if (nodeTypes.get(edge.target) === 'parallel_join') {
        const list = edgesByTarget.get(edge.target)!
        const idx = list.indexOf(edge)
        const nextHandle = portMode === 'shared' ? 'in_shared' : `in_b${idx}`
        if (edge.targetHandle !== nextHandle) {
          nextEdge.targetHandle = nextHandle
          changed = true
        }
      }
      return nextEdge
    })

    if (changed) {
      setRuntime((prev) => ({ ...prev, edges: nextEdges }))
    }
  }, [preferences.parallelBranchPortMode, preferencesLoaded, runtime.nodes, setRuntime])

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

  const handleOpenDocs = useCallback(() => {
    if (!window.api?.appInfo?.openExternal) {
      console.warn('App info API not available')
      return
    }
    void window.api.appInfo.openExternal(
      'https://nos0uls.github.io/Undefined-documentation/systems/cutscenes/undefscene/overview/'
    )
  }, [])

  const validationContext: ValidationContext | undefined = useMemo(() => {
    if (!resources && !engineSettings) return undefined
    return {
      language: preferences.language ?? 'en',
      objects: resources?.objects,
      sprites: resources?.sprites,
      yarnFiles: yarnFiles ? new Map(yarnFiles.map((y) => [y.file, y.nodes])) : undefined,
      runFunctions: engineSettings?.runFunctions,
      branchConditions: engineSettings?.branchConditions
    }
  }, [preferences.language, resources, engineSettings, yarnFiles])

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

  const [validation, setValidation] = useState<ValidationResult>({ entries: [], hasErrors: false })

  // Валидация графа — дорогая операция на больших графах.
  // Откладываем её на следующий macrotask через setTimeout(0),
  // чтобы drag-stop и другие UI-апдейты не блокировались.
  useEffect(() => {
    const id = setTimeout(() => {
      setValidation(
        validateGraph(
          {
            ...runtime,
            selectedNodeId: null,
            selectedNodeIds: [],
            selectedEdgeId: null
          },
          validationContext
        )
      )
    }, 0)
    return () => clearTimeout(id)
  }, [runtime.schemaVersion, runtime.title, runtime.nodes, runtime.edges, validationContext])

  const shouldFocusEdgeWaitRef = useRef(false)

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

  const [logsFilters, setLogsFilters] = useState({
    errors: true,
    warnings: true,
    tips: false
  })

  const selectedNodeForName = useMemo(
    () => runtime.nodes.find((node) => node.id === runtime.selectedNodeId) ?? null,
    [runtime.nodes, runtime.selectedNodeId]
  )

  const {
    roomScreenshotSearchDirs,
    openVisualEditorWindow,
    visualEditingOpen
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

  const [pendingNodeName, setPendingNodeName] = useState('')
  const [nameConflictModal, setNameConflictModal] = useState<NameConflictModalState | null>(null)
  const nameConflictOkRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setPendingNodeName(selectedNodeForName?.name ?? '')
  }, [selectedNodeForName?.id])

  // --- useDocking ---
  const { togglePanel, isPanelVisible, allPanels } = useDocking({
    getPanelTitle,
    showDockDropPreview: preferences.showDockDropPreview
  })

  // --- Extracted hooks ---

  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime
  const setRuntimeRef = useRef(setRuntime)
  setRuntimeRef.current = setRuntime
  const undoRef = useRef(undo)
  undoRef.current = undo
  const redoRef = useRef(redo)
  redoRef.current = redo
  const exportRef = useRef<(() => void) | null>(null)

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
  exportRef.current = handleExport

  // Обработчики завершения/пропуска контекстного тура visual editing.
  const handleVisualEditingTutorialComplete = useCallback(() => {
    updatePreferences({ hasCompletedVisualEditingTutorial: true })
    setVisualEditingTutorialActive(false)
  }, [updatePreferences])

  const handleVisualEditingTutorialSkip = useCallback(() => {
    updatePreferences({ hasCompletedVisualEditingTutorial: true })
    setVisualEditingTutorialActive(false)
  }, [updatePreferences])

  // Контекстный тур по visual editing запускается при открытии окна visual editor.
  useEffect(() => {
    if (!preferencesLoaded) return
    if (preferences.hasCompletedVisualEditingTutorial) return
    if (!preferences.hasCompletedTutorial) return
    if (visualEditingOpen) {
      setVisualEditingTutorialActive(true)
    }
  }, [
    preferencesLoaded,
    preferences.hasCompletedVisualEditingTutorial,
    preferences.hasCompletedTutorial,
    visualEditingOpen
  ])

  const saveRef = useRef<(() => void) | null>(null)
  saveRef.current = handleSave
  const newRef = useRef<(() => void) | null>(null)
  newRef.current = handleNew

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

  // --- Selected node helpers ---
  const selectedNode = useMemo(
    () => runtime.nodes.find((node) => node.id === runtime.selectedNodeId) ?? null,
    [runtime.nodes, runtime.selectedNodeId]
  )

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

  // Стабильные коллбеки для LogsPanel, чтобы memo не ломался на inline-стрелках.
  const handleToggleLogFilter = useCallback(
    (key: 'errors' | 'warnings' | 'tips') => {
      setLogsFilters((prev) => ({ ...prev, [key]: !prev[key] }))
    },
    [setLogsFilters]
  )

  const handleLogsSelectNode = useCallback(
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

  const handleLogsSelectEdge = useCallback(
    (edgeId: string) => {
      setRuntime((prev) => ({
        ...prev,
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedEdgeId: edgeId
      }))
    },
    [setRuntime]
  )

  // --- Hotkeys ---
  const hotkeyHandlers = useMemo(
    () => [
      {
        actionId: 'toggle_inspector' as const,
        handler: () => togglePanel('panel.inspector')
      },
    ],
    [togglePanel]
  )

  useHotkeys({
    keybindings: preferences.keybindings,
    handlers: hotkeyHandlers
  })

  // --- Name conflict modal effects ---
  useEffect(() => {
    if (!nameConflictModal) return
    const t = window.setTimeout(() => {
      nameConflictOkRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(t)
  }, [nameConflictModal])

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

  // --- Memoized heavy panel computations ---
  // runtimeJsonString убран из EditorShell — теперь JSON.stringify
  // делается лениво внутри RuntimeJsonPanel (через PanelDataContext),
  // чтобы не тратить десятки мс на больших графах, если JSON панель не открыта.

  // Парсинг Yarn preview — не пересчитываем на каждый рендер.
  const yarnPreviewNodes = useMemo(
    () => (yarnPreviewContent ? parseYarnPreview(yarnPreviewContent) : []),
    [yarnPreviewContent]
  )

  // Логи: один проход по validation.entries вместо 4-6 отдельных .filter().
  // Считаем counts, собираем visible entries и категории за O(N).
  const logsData = useMemo(() => {
    let errorCount = 0
    let warnCount = 0
    let tipCount = 0
    const errorEntries: typeof validation.entries = []
    const warnEntries: typeof validation.entries = []
    const tipEntries: typeof validation.entries = []
    const visibleEntries: typeof validation.entries = []

    for (let i = 0; i < validation.entries.length; i++) {
      const e = validation.entries[i]
      if (e.severity === 'error') {
        errorCount++
        errorEntries.push(e)
        if (logsFilters.errors) visibleEntries.push(e)
      } else if (e.severity === 'warn') {
        warnCount++
        warnEntries.push(e)
        if (logsFilters.warnings) visibleEntries.push(e)
      } else if (e.severity === 'tip') {
        tipCount++
        tipEntries.push(e)
        if (logsFilters.tips) visibleEntries.push(e)
      }
    }

    const severityStyle: Record<string, { color: string; bg: string; icon: string }> = {
      error: { color: '#e05050', bg: 'rgba(224,80,80,0.08)', icon: '\u25CF' },
      warn: { color: '#d4a017', bg: 'rgba(212,160,23,0.08)', icon: '\u25CF' },
      tip: { color: '#58a6ff', bg: 'rgba(88,166,255,0.06)', icon: '\u25CF' }
    }

    const toggleButtons = [
      {
        key: 'errors' as const,
        label: t('logs.errors', 'Errors'),
        count: errorCount,
        color: '#e05050'
      },
      {
        key: 'warnings' as const,
        label: t('logs.warnings', 'Warnings'),
        count: warnCount,
        color: '#d4a017'
      },
      {
        key: 'tips' as const,
        label: t('logs.tips', 'Tips'),
        count: tipCount,
        color: '#58a6ff'
      }
    ]

    return { errorEntries, warnEntries, tipEntries, visibleEntries, severityStyle, toggleButtons, errorCount, warnCount, tipCount }
  }, [validation.entries, logsFilters.errors, logsFilters.warnings, logsFilters.tips, preferences.language])

  // --- renderPanelContents ---
  // Каждая панель вынесена в отдельный memoized компонент.
  // renderPanelContents становится тонким switch — создание JSX элементов
  // происходит один раз внутри memo-компонентов, а не при каждом вызове.
  const renderPanelContents = useCallback((panelId: string): React.JSX.Element => {
    if (panelId === 'panel.actions') {
      return (
        <ActionsPanel
          t={t}
          onSave={handleSave}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onAddNode={addNode}
        />
      )
    }

    if (panelId === 'panel.bookmarks') {
      return (
        <BookmarksPanel
          selectNode={selectNode}
          t={t}
        />
      )
    }

    if (panelId === 'panel.text') {
      return (
        <TextPanel
          t={t}
          selectedNode={selectedNode}
          yarnPreviewNodes={yarnPreviewNodes}
          yarnPreviewLoading={yarnPreviewLoading}
          selectedYarnPreviewTitle={selectedYarnPreviewTitle}
          onSelectYarnPreviewTitle={setSelectedYarnPreviewTitle}
          projectDir={resources?.projectDir}
        />
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
      return (
        <LogsPanel
          t={t}
          logsData={logsData}
          logsFilters={logsFilters}
          onToggleFilter={handleToggleLogFilter}
          onSelectNode={handleLogsSelectNode}
          onSelectEdge={handleLogsSelectEdge}
        />
      )
    }

    if (panelId === 'panel.runtime_json') {
      return (
        <RuntimeJsonPanel
          t={t}
        />
      )
    }

    return (
      <div className="placeholderText">
        {preferences.language === 'ru' ? '\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043F\u0430\u043D\u0435\u043B\u042C' : 'Unknown panel'}: {panelId}
      </div>
    )
  }, [
    t,
    handleSave,
    undo,
    redo,
    canUndo,
    canRedo,
    addNode,
    runtime.nodes,
    runtime.selectedNodeId,
    selectNode,
    selectedNode,
    yarnPreviewNodes,
    yarnPreviewLoading,
    selectedYarnPreviewTitle,
    setSelectedYarnPreviewTitle,
    resources?.projectDir,
    actorTargetOptions,
    resources,
    engineSettings,
    yarnFiles,
    pendingNodeName,
    setPendingNodeName,
    suggestUniqueNodeName,
    setNameConflictModal,
    roomScreenshotSearchDirs,
    shouldFocusEdgeWaitRef,
    preferences,
    runtime,
    setRuntime,
    logsData,
    logsFilters,
    handleToggleLogFilter,
    handleLogsSelectNode,
    handleLogsSelectEdge,
    preferences.language
  ])

  // Badge для вкладки Logs: используем counts из logsData,
  // чтобы не фильтровать validation.entries повторно.
  const getPanelBadge = useCallback((panelId: string): React.ReactNode | null => {
    if (panelId !== 'panel.logs') return null
    const total = logsData.errorCount + logsData.warnCount
    if (total === 0) return null
    const color = logsData.errorCount > 0 ? '#e05050' : '#d4a017'
    return (
      <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, color, background: 'rgba(255,255,255,0.08)', borderRadius: 3, padding: '0 3px', lineHeight: 1 }}>
        {total}
      </span>
    )
  }, [logsData.errorCount, logsData.warnCount])

  // Данные панелей: передаём через PanelDataContext, чтобы панели могли
  // читать актуальное состояние без необходимости обновлять renderPanelContents.
  // Это предотвращает re-render DockingLayout при drag ноды.
  const panelData = useMemo(
    () => ({
      runtime,
      selectedNode
    }),
    [runtime, selectedNode]
  )

  // Стабилизируем renderPanelContents callback через ref.
  // DockingLayout получает stable prop — он не перерендеривается
  // при изменении данных панелей (drag, выделение, etc.).
  // Панели, подписанные на PanelDataContext, обновляются сами.
  const renderPanelContentsRef = useRef(renderPanelContents)
  renderPanelContentsRef.current = renderPanelContents
  const renderPanelContentsStable = useCallback((panelId: string): React.JSX.Element => {
    return renderPanelContentsRef.current(panelId)
  }, [])

  // Центральный контент холста: мемоизируем, чтобы DockingLayout не
  // перерендеривал FlowCanvas (и 200+ нод) при смене несвязанного state
  // EditorShell (например, toasts, модалки, фильтры логов).
  const centerContent = useMemo(
    () => (
      <>
        <div className="centerCanvasHeader">{t('editor.nodeEditor', 'Node Editor')}</div>
        <div className="centerCanvasBody">
          <FlowCanvas
            runtimeNodes={deferredRuntimeNodes}
            runtimeEdges={deferredRuntimeEdges}
            selectedNodeId={runtime.selectedNodeId}
            selectedNodeIds={runtime.selectedNodeIds ?? []}
            selectedEdgeId={runtime.selectedEdgeId}
            onSelectNodes={handleSelectNodes}
            onSelectEdge={handleSelectEdge}
            onNodePositionChange={handleNodePositionChange}
            onEdgeAdd={handleEdgeAdd}
            onEdgeRemove={handleEdgeRemove}
            onEdgeDelete={handleEdgeDelete}
            onNodeDelete={handleNodeDelete}
            onEdgeDoubleClick={handleEdgeDoubleClick}
            onPaneClickCreate={createDefaultPaneNode}
            onPaneDropCreate={createPaletteDropNode}
            onParallelAddBranch={onParallelAddBranch}
            onParallelRemoveBranch={onParallelRemoveBranch}
          />
        </div>
      </>
    ),
    [
      t,
      deferredRuntimeNodes,
      deferredRuntimeEdges,
      runtime.selectedNodeId,
      runtime.selectedNodeIds,
      runtime.selectedEdgeId,
      handleSelectNodes,
      handleSelectEdge,
      handleNodePositionChange,
      handleEdgeAdd,
      handleEdgeRemove,
      handleEdgeDelete,
      handleNodeDelete,
      handleEdgeDoubleClick,
      createDefaultPaneNode,
      createPaletteDropNode,
      onParallelAddBranch,
      onParallelRemoveBranch
    ]
  )

  // Стабилизируем коллбеки меню через useCallback, чтобы useMemo для
  // topBarContent не инвалидировался при каждом render из-за inline-функций.
  const handleResetLayout = useCallback(() => {
    import('./useLayoutState').then(({ createDefaultLayout }) => {
      setLayout(createDefaultLayout())
    })
  }, [setLayout])

  const handleCheckUpdates = useCallback(() => {
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
        const msg = err instanceof Error ? err.message : String(err)
        pushError(toasts, msg, { title: t('toasts.updateCheckFailed', 'Update check failed') })
      })
  }, [toasts, t])

  const handleToggleRuntimeJson = useCallback(() => {
    togglePanel('panel.runtime_json')
  }, [togglePanel])

  const handleCopyLogToClipboard = useCallback(() => {
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
  }, [toasts, t])

  const handleOpenDevTools = useCallback(() => {
    if (!window.api?.appInfo?.openDevTools) {
      console.warn('App info API not available')
      return
    }

    void window.api.appInfo.openDevTools()
  }, [])

  const handleToggleHardwareAcceleration = useCallback(() => {
    const next = !preferences.disableHardwareAcceleration
    updatePreferences({
      disableHardwareAcceleration: next
    })
    pushInfo(
      toasts,
      next
        ? 'Аппаратное ускорение отключено. Изменение применится при следующем запуске.'
        : 'Аппаратное ускорение включено. Изменение применится при следующем запуске.',
      { title: 'Настройки', duration: 0 }
    )
  }, [preferences, updatePreferences, toasts])

  const handleChooseScreenshotOutputDir = useCallback(() => {
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
  }, [updatePreferences])

  const handleToggleVisualEditorTechMode = useCallback(() => {
    updatePreferences({
      visualEditorTechMode: !preferences.visualEditorTechMode
    })
  }, [updatePreferences, preferences])

  const handleAbout = useCallback(() => setAboutOpen(true), [setAboutOpen])
  const handleTutorial = useCallback(() => setIsTutorialActive(true), [setIsTutorialActive])
  const handleExit = useCallback(() => window.close(), [])
  const handlePreferences = useCallback(() => setPreferencesOpen(true), [setPreferencesOpen])

  // topBarContent мемоизируем, чтобы DockingLayout не перерендеривался
  // при смене несвязанного state EditorShell (toasts, модалки, etc.).
  const topBarContent = useMemo(
    () => (
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
        onResetLayout={handleResetLayout}
        onCheckUpdates={handleCheckUpdates}
        onToggleRuntimeJson={handleToggleRuntimeJson}
        runtimeJsonVisible={isPanelVisible('panel.runtime_json')}
        onCopyLogToClipboard={handleCopyLogToClipboard}
        onOpenDevTools={handleOpenDevTools}
        onToggleHardwareAcceleration={handleToggleHardwareAcceleration}
        onChooseScreenshotOutputDir={handleChooseScreenshotOutputDir}
        onToggleVisualEditorTechMode={handleToggleVisualEditorTechMode}
        visualEditorTechModeEnabled={preferences.visualEditorTechMode}
        hardwareAccelerationDisabled={preferences.disableHardwareAcceleration}
        onOpenVisualEditing={openVisualEditorWindow}
        onAbout={handleAbout}
        onTutorial={handleTutorial}
        onExit={handleExit}
        onPreferences={handlePreferences}
        language={preferences.language}
        keybindings={preferences.keybindings}
      />
    ),
    [
      allPanels,
      isPanelVisible,
      togglePanel,
      openProject,
      handleExport,
      handleNew,
      handleCreateExample,
      handleOpenScene,
      handleSave,
      handleSaveAs,
      undo,
      redo,
      handleResetLayout,
      handleCheckUpdates,
      handleToggleRuntimeJson,
      handleCopyLogToClipboard,
      handleOpenDevTools,
      handleToggleHardwareAcceleration,
      handleChooseScreenshotOutputDir,
      handleToggleVisualEditorTechMode,
      preferences.visualEditorTechMode,
      preferences.disableHardwareAcceleration,
      preferences.language,
      preferences.keybindings,
      openVisualEditorWindow,
      handleAbout,
      handleTutorial,
      handleExit,
      handlePreferences
    ]
  )

  return (
    <>
      <PanelDataProvider value={panelData}>
        <DockingLayout
        renderPanelContents={renderPanelContentsStable}
        getPanelTitle={getPanelTitle}
        getPanelBadge={getPanelBadge}
        showDockDropPreview={preferences.showDockDropPreview}
        collapsePanelLabel={collapsePanelLabel}
        closePanelLabel={closePanelLabel}
        isProjectLoading={isProjectLoading}
        loadingText={t('editor.loadingProject', 'Loading project...')}
        topBarContent={topBarContent}
        centerContent={centerContent}
      />
      </PanelDataProvider>

      <PreferencesModal
        open={preferencesOpen}
        preferences={preferences}
        updatePreferences={updatePreferences}
        onClose={() => setPreferencesOpen(false)}
      />

      <WelcomeSetupModal
        open={welcomeOpen}
        preferences={preferences}
        updatePreferences={updatePreferences}
        onComplete={handleWelcomeComplete}
      />

      <TutorialOverlay
        active={isTutorialActive}
        language={preferences.language}
        onComplete={handleTutorialComplete}
        onSkip={handleTutorialSkip}
      />

      {/* Контекстный тур по инспектору (при первом выборе ноды). */}
      <TutorialOverlay
        active={inspectorTutorialActive}
        language={preferences.language}
        steps={TUTORIAL_REGISTRY.inspector}
        onComplete={handleInspectorTutorialComplete}
        onSkip={handleInspectorTutorialSkip}
      />

      {/* Контекстный тур по visual editing (при первом открытии окна). */}
      <TutorialOverlay
        active={visualEditingTutorialActive}
        language={preferences.language}
        steps={TUTORIAL_REGISTRY.visualEditing}
        onComplete={handleVisualEditingTutorialComplete}
        onSkip={handleVisualEditingTutorialSkip}
      />

      <AboutModal
        open={aboutOpen}
        version={appVersion}
        onOpenDocs={handleOpenDocs}
        language={preferences.language}
        onClose={() => setAboutOpen(false)}
      />

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
                {preferences.language === 'ru' ? '\u0414\u0443\u0431\u043B\u0438\u0440\u0443\u044E\u0449\u0435\u0435\u0441\u044F \u0438\u043C\u044F \u043D\u043E\u0434\u044B' : 'Duplicate node name'}
              </span>
              <button
                className="prefsCloseBtn"
                onClick={() => {
                  setPendingNodeName(nameConflictModal.previousName)
                  setNameConflictModal(null)
                }}
              >
                {'\u2715'}
              </button>
            </div>

            <div className="prefsBody">
              <div className="prefsHint">
                {preferences.language === 'ru'
                  ? '\u042D\u0442\u043E \u0438\u043C\u044F \u0443\u0436\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \u0434\u0440\u0443\u0433\u043E\u0439 \u043D\u043E\u0434\u043E\u0439'
                  : 'This name is already used by another node'}
                {nameConflictModal.conflictingWithNodeId
                  ? ` (${nameConflictModal.conflictingWithNodeId})`
                  : ''}
                {preferences.language === 'ru'
                  ? '. \u0414\u0443\u0431\u043B\u0438\u043A\u0430\u0442\u044B \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B, \u043D\u043E \u043C\u043E\u0433\u0443\u0442 \u043F\u0443\u0442\u0430\u0442\u044C.'
                  : '. Duplicates are allowed, but it can be confusing.'}
              </div>

              <label className="prefsField">
                <span>{preferences.language === 'ru' ? '\u0418\u043C\u044F' : 'Name'}</span>
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
                  {preferences.language === 'ru' ? '\u041E\u0442\u043C\u0435\u043D\u0430' : 'Cancel'}
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
                  {preferences.language === 'ru' ? '\u041E\u041A' : 'OK'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
  </>
  )
}
