/* eslint-disable @typescript-eslint/explicit-function-return-type */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
import { TutorialOverlay } from './TutorialOverlay'
import { useToasts, pushSuccess, pushError, pushInfo } from './ToastHub'
import { useConfirm } from './ConfirmDialog'
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
import { DockingProvider } from './DockingContext'
import { DockingLayout } from './DockingLayout'
import { useDocking } from './useDocking'

const NODE_PALETTE_DRAG_MIME = 'application/x-undefscene-node-type'

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

  const toasts = useToasts()
  const confirm = useConfirm()

  const { resources, engineSettings, yarnFiles, isLoading: isProjectLoading, openProject } = useProjectResources()

  const [sceneFilePath, setSceneFilePath] = useState<string | null>(null)
  const [fitViewRequestId, setFitViewRequestId] = useState(0)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [isTutorialActive, setIsTutorialActive] = useState(false)
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
      objects: resources?.objects,
      sprites: resources?.sprites,
      yarnFiles: yarnFiles ? new Map(yarnFiles.map((y) => [y.file, y.nodes])) : undefined,
      runFunctions: engineSettings?.runFunctions,
      branchConditions: engineSettings?.branchConditions
    }
  }, [resources, engineSettings, yarnFiles])

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

  // --- Hotkeys ---
  const hotkeyHandlers = useMemo(
    () => [
      {
        actionId: 'toggle_inspector' as const,
        handler: () => togglePanel('panel.inspector')
      },
      {
        actionId: 'fit_view' as const,
        handler: () => {
          setFitViewRequestId((prev) => prev + 1)
        }
      }
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
  // JSON.stringify(runtime) может занимать десятки мс на больших графах.
  // Мемоизируем и исключаем editor-only поля (selectedNodeId, selectedNodeIds, selectedEdgeId),
  // которые меняются при каждом клике и вызывают бессмысленную пересериализацию.
  const runtimeJsonString = useMemo(
    () =>
      JSON.stringify(
        {
          schemaVersion: runtime.schemaVersion,
          title: runtime.title,
          nodes: runtime.nodes,
          edges: runtime.edges,
          lastSavedAtMs: runtime.lastSavedAtMs
        },
        null,
        2
      ),
    [runtime.schemaVersion, runtime.title, runtime.nodes, runtime.edges, runtime.lastSavedAtMs]
  )

  // Парсинг Yarn preview — не пересчитываем на каждый рендер.
  const yarnPreviewNodes = useMemo(
    () => (yarnPreviewContent ? parseYarnPreview(yarnPreviewContent) : []),
    [yarnPreviewContent]
  )

  // Логи: фильтрация validation.entries O(N).
  // Разбиваем на категории и visible entries один раз.
  const logsData = useMemo(() => {
    const errorEntries = validation.entries.filter((e) => e.severity === 'error')
    const warnEntries = validation.entries.filter((e) => e.severity === 'warn')
    const tipEntries = validation.entries.filter((e) => e.severity === 'tip')

    const visibleEntries = validation.entries.filter((e) => {
      if (e.severity === 'error') return logsFilters.errors
      if (e.severity === 'warn') return logsFilters.warnings
      if (e.severity === 'tip') return logsFilters.tips
      return false
    })

    const severityStyle: Record<string, { color: string; bg: string; icon: string }> = {
      error: { color: '#e05050', bg: 'rgba(224,80,80,0.08)', icon: '\u25CF' },
      warn: { color: '#d4a017', bg: 'rgba(212,160,23,0.08)', icon: '\u25CF' },
      tip: { color: '#58a6ff', bg: 'rgba(88,166,255,0.06)', icon: '\u25CF' }
    }

    const toggleButtons = [
      {
        key: 'errors' as const,
        label: preferences.language === 'ru' ? '\u041E\u0448\u0438\u0431\u043A\u0438' : 'Errors',
        count: errorEntries.length,
        color: '#e05050'
      },
      {
        key: 'warnings' as const,
        label: preferences.language === 'ru' ? '\u041F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u044F' : 'Warnings',
        count: warnEntries.length,
        color: '#d4a017'
      },
      {
        key: 'tips' as const,
        label: preferences.language === 'ru' ? '\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438' : 'Tips',
        count: tipEntries.length,
        color: '#58a6ff'
      }
    ]

    return { errorEntries, warnEntries, tipEntries, visibleEntries, severityStyle, toggleButtons }
  }, [validation.entries, logsFilters.errors, logsFilters.warnings, logsFilters.tips, preferences.language])

  // --- renderPanelContents ---
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
      const activePreviewNode =
        yarnPreviewNodes.find((entry) => entry.title === selectedYarnPreviewTitle) ?? yarnPreviewNodes[0] ?? null

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
          ) : yarnPreviewNodes.length === 0 ? (
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
                  {yarnPreviewNodes.map((entry) => (
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
      const { visibleEntries, severityStyle, toggleButtons } = logsData

      return (
        <div className="runtimeSection">
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
          <pre className="runtimeCode runtimeCodeFill">{runtimeJsonString}</pre>
        </div>
      )
    }

    return (
      <div className="placeholderText">
        {preferences.language === 'ru' ? '\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043F\u0430\u043D\u0435\u043B\u044C' : 'Unknown panel'}: {panelId}
      </div>
    )
  }

  return (
    <DockingLayout
        renderPanelContents={renderPanelContents}
        getPanelTitle={getPanelTitle}
        collapsePanelLabel={collapsePanelLabel}
        closePanelLabel={closePanelLabel}
        isProjectLoading={isProjectLoading}
        loadingText={t('editor.loadingProject', 'Loading project...')}
        topBarContent={
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
              import('./useLayoutState').then(({ createDefaultLayout }) => {
                setLayout(createDefaultLayout())
              })
            }}
            onCheckUpdates={() => {
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
            onTutorial={() => setIsTutorialActive(true)}
            onExit={() => window.close()}
            onPreferences={() => setPreferencesOpen(true)}
            language={preferences.language}
            keybindings={preferences.keybindings}
          />
        }
        centerContent={
          <>
            <div className="centerCanvasHeader">{t('editor.nodeEditor', 'Node Editor')}</div>
            <div className="centerCanvasBody">
              <FlowCanvas
                runtimeNodes={runtime.nodes}
                runtimeEdges={runtime.edges}
                selectedNodeId={runtime.selectedNodeId}
                selectedNodeIds={runtime.selectedNodeIds ?? []}
                selectedEdgeId={runtime.selectedEdgeId}
                fitViewRequestId={fitViewRequestId}
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
        }
      >
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
      </DockingLayout>
  )
}
