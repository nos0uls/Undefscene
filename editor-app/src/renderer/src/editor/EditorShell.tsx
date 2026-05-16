/* eslint-disable @typescript-eslint/explicit-function-return-type */
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react'

import { FlowCanvas } from './FlowCanvas'
import { TopMenuBar } from './TopMenuBar'
import { useLayoutState, type LayoutState } from './useLayoutState'
import { useProjectResources } from './useProjectResources'
import { useRuntimeState } from './useRuntimeState'
import { PanelDataProvider } from './PanelDataContext'
import { usePreferencesContext } from './PreferencesContext'
import { useHotkeys } from './useHotkeys'
import { DockingProvider, useDockingContext } from './DockingContext'
import { DockingLayout } from './DockingLayout'
import { useDocking } from './useDocking'
import { createTranslator } from '../i18n'
import { useNodeOperations, suggestUniqueNodeName } from './useNodeOperations'
import { useVisualEditing } from './useVisualEditing'
import { useEditorShortcuts } from './useEditorShortcuts'
import { useSceneIO } from './useSceneIO'
import { useEditorState } from './useEditorState'
import { useEditorCallbacks } from './useEditorCallbacks'
import { useEditorValidation } from './useEditorValidation'
import { useEditorShellPanels } from './EditorShellPanels'
import { EditorShellModals } from './EditorShellModals'
import { useToasts } from './ToastHub'
import { useConfirm } from './confirmContext'

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

const EditorShellInner = React.memo(function EditorShellInner({ layout, setLayout, rootRef }: EditorShellInnerProps): React.JSX.Element {
  const { preferences, updatePreferences, loaded: preferencesLoaded } = usePreferencesContext()
  const t = useMemo(() => createTranslator(preferences.language), [preferences.language])

  const { runtime, setRuntime, undo, redo, canUndo, canRedo } = useRuntimeState()

  // Откладываем обновление крупных массивов для FlowCanvas — при drag-end
  const deferredRuntimeNodes = useDeferredValue(runtime.nodes)
  const deferredRuntimeEdges = useDeferredValue(runtime.edges)

  const toasts = useToasts()
  const confirm = useConfirm()

  const { resources, engineSettings, yarnFiles, isLoading: isProjectLoading, openProject } = useProjectResources()

  const { collapsedDocks, setCollapsedDocks } = useDockingContext()

  // Custom hooks
  const editorState = useEditorState(
    preferences,
    preferencesLoaded,
    updatePreferences,
    resources,
    engineSettings,
    yarnFiles,
    runtime
  )

  const editorValidation = useEditorValidation(
    runtime,
    editorState.validationContext,
    editorState.ruleOverrides,
    editorState.setRuleOverrides,
    editorState.logsFilters,
    preferences.language,
    t
  )

  // При смене parallelBranchPortMode переписываем handles рёбер
  useEffect(() => {
    if (!preferencesLoaded) return

    setRuntime((prev) => {
      const portMode = preferences.parallelBranchPortMode
      const nodeTypes = new Map(prev.nodes.map((n) => [n.id, n.type]))

      const edgesBySource = new Map<string, any[]>()
      const edgesByTarget = new Map<string, any[]>()

      for (const edge of prev.edges) {
        const sourceType = nodeTypes.get(edge.source)
        const targetType = nodeTypes.get(edge.target)

        if (sourceType === 'parallel_start' && edge.sourceHandle !== '__pair') {
          const list = edgesBySource.get(edge.source) ?? []
          list.push(edge)
          edgesBySource.set(edge.source, list)
        }
        if (targetType === 'parallel_join' && edge.targetHandle !== '__pair') {
          const list = edgesByTarget.get(edge.target) ?? []
          list.push(edge)
          edgesByTarget.set(edge.target, list)
        }
      }

      let changed = false
      const nextEdges = prev.edges.map((edge) => {
        const nextEdge = { ...edge }
        const sourceType = nodeTypes.get(edge.source)
        const targetType = nodeTypes.get(edge.target)

        if (sourceType === 'parallel_start' && edge.sourceHandle !== '__pair') {
          const list = edgesBySource.get(edge.source)!
          const idx = list.indexOf(edge)
          let nextHandle = portMode === 'shared' ? 'out_shared' : `out_b${idx}`

          if (portMode === 'separate' && edge.sourceHandle?.startsWith('out_b')) {
            nextHandle = edge.sourceHandle
          }

          if (edge.sourceHandle !== nextHandle) {
            nextEdge.sourceHandle = nextHandle
            changed = true
          }
        }

        if (targetType === 'parallel_join' && edge.targetHandle !== '__pair') {
          const list = edgesByTarget.get(edge.target)!
          const idx = list.indexOf(edge)
          let nextHandle = portMode === 'shared' ? 'in_shared' : `in_b${idx}`

          if (portMode === 'separate' && edge.targetHandle?.startsWith('in_b')) {
            nextHandle = edge.targetHandle
          }

          if (edge.targetHandle !== nextHandle) {
            nextEdge.targetHandle = nextHandle
            changed = true
          }
        }

        return nextEdge
      })

      if (!changed) return prev
      return { ...prev, edges: nextEdges }
    }, { skipHistory: true })
  }, [preferences.parallelBranchPortMode, preferencesLoaded, setRuntime])

  const handleOpenDocs = useCallback(() => {
    if (!window.api?.appInfo?.openExternal) {
      console.warn('App info API not available')
      return
    }
    void window.api.appInfo.openExternal(
      'https://nos0uls.github.io/Undefined-documentation/systems/cutscenes/undefscene/overview/'
    )
  }, [])

  // useNodeOperations
  const {
    addNode,
    handleSelectNodes,
    handleSelectEdge,
    handleNodePositionChange,
    handleEdgeAdd,
    handleEdgeRemove,
    handleEdgeDelete,
    handleNodeDelete,
    handleEdgeDoubleClick,
    onParallelAddBranch,
    onParallelRemoveBranch,
    createDefaultPaneNode,
    createPaletteDropNode
  } = useNodeOperations({
    setRuntime,
    shouldFocusEdgeWaitRef: editorState.shouldFocusEdgeWaitRef
  })

  // useVisualEditing
  const {
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

  // Обновляем visualEditingTutorialActive при открытии visual editor
  useEffect(() => {
    if (!preferencesLoaded) return
    if (preferences.hasCompletedVisualEditingTutorial) return
    if (!preferences.hasCompletedTutorial) return
    if (visualEditingOpen) {
      editorState.setVisualEditingTutorialActive(true)
    }
  }, [
    preferencesLoaded,
    preferences.hasCompletedVisualEditingTutorial,
    preferences.hasCompletedTutorial,
    visualEditingOpen,
    editorState.setVisualEditingTutorialActive
  ])

  // useDocking
  const { togglePanel, isPanelVisible } = useDocking({
    showDockDropPreview: preferences.showDockDropPreview
  })

  // Refs for shortcuts
  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime
  const setRuntimeRef = useRef(setRuntime)
  setRuntimeRef.current = setRuntime
  const undoRef = useRef(undo)
  undoRef.current = undo
  const redoRef = useRef(redo)
  redoRef.current = redo

  const savedTimerRef = useRef<number | null>(null)
  const handleSaveSuccess = useCallback(() => {
    editorState.setShowSavedIndicator(true)
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
    savedTimerRef.current = window.setTimeout(() => {
      editorState.setShowSavedIndicator(false)
    }, 3000)
  }, [editorState.setShowSavedIndicator])

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
    validation: editorValidation.validation,
    sceneFilePath: editorState.sceneFilePath,
    setSceneFilePath: editorState.setSceneFilePath,
    toasts,
    confirm,
    t,
    preferencesLoaded,
    autoSaveEnabled: preferences.autoSaveEnabled,
    autoSaveIntervalMinutes: preferences.autoSaveIntervalMinutes,
    onSaveSuccess: handleSaveSuccess
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
    setPreferencesOpen: editorState.setPreferencesOpen,
    suggestUniqueNodeName
  })

  // Selected node helpers
  const selectedNode = useMemo(
    () => runtime.nodes.find((node) => node.id === runtime.selectedNodeId) ?? null,
    [runtime.nodes, runtime.selectedNodeId]
  )

  // Editor callbacks
  const editorCallbacks = useEditorCallbacks(
    layout,
    setLayout,
    collapsedDocks,
    setCollapsedDocks,
    editorState.templates,
    editorState.setTemplates,
    runtime,
    setRuntime,
    editorState.setFocusNodeRequest,
    editorState.setFocusPositionRequest,
    editorState.setLogsFilters,
    editorState.setShowSavedIndicator,
    togglePanel,
    preferences,
    updatePreferences,
    toasts,
    confirm,
    t,
    openProject,
    handleExport,
    handleNew,
    handleCreateExample,
    handleOpenScene,
    handleSave,
    handleSaveAs,
    undo,
    redo,
    openVisualEditorWindow,
    editorState.sceneFilePath
  )

  // Hotkeys
  useHotkeys({
    keybindings: preferences.keybindings,
    handlers: editorCallbacks.hotkeyHandlers
  })

  // Panel data for context
  const panelData = useMemo(
    () => ({
      runtime,
      selectedNode
    }),
    [runtime, selectedNode]
  )

  // Editor panels
  const renderPanelContents = useEditorShellPanels({
    t,
    runtime,
    setRuntime,
    selectedNode,
    actorTargetOptions: editorState.actorTargetOptions,
    resources,
    engineSettings,
    yarnFiles,
    pendingNodeName: editorState.pendingNodeName,
    setPendingNodeName: editorState.setPendingNodeName,
    suggestUniqueNodeName,
    setNameConflictModal: editorState.setNameConflictModal,
    shouldFocusEdgeWaitRef: editorState.shouldFocusEdgeWaitRef,
    yarnPreviewNodes: editorState.yarnPreviewNodes,
    yarnPreviewLoading: editorState.yarnPreviewLoading,
    selectedYarnPreviewTitle: editorState.selectedYarnPreviewTitle,
    setSelectedYarnPreviewTitle: editorState.setSelectedYarnPreviewTitle,
    logsData: editorValidation.logsData,
    logsFilters: editorState.logsFilters,
    handleToggleLogFilter: editorCallbacks.handleToggleLogFilter,
    handleLogsSelectNode: editorCallbacks.handleLogsSelectNode,
    handleLogsSelectEdge: editorCallbacks.handleLogsSelectEdge,
    handleSetRuleOverride: editorValidation.handleSetRuleOverride,
    handleAddNote: editorCallbacks.handleAddNote,
    handleUpdateNote: editorCallbacks.handleUpdateNote,
    handleDeleteNote: editorCallbacks.handleDeleteNote,
    handleSelectNote: editorCallbacks.handleSelectNote,
    selectNode: editorCallbacks.selectNode,
    selectedNodes: runtime.nodes.filter((node) => runtime.selectedNodeIds?.includes(node.id)),
    selectedEdges: runtime.edges.filter((edge) => edge.id === runtime.selectedEdgeId),
    templates: editorState.templates,
    handleSaveTemplate: editorCallbacks.handleSaveTemplate,
    handleInsertTemplate: editorCallbacks.handleInsertTemplate,
    handleRenameTemplate: editorCallbacks.handleRenameTemplate,
    handleDeleteTemplate: editorCallbacks.handleDeleteTemplate,
    handleSave,
    undo,
    redo,
    canUndo,
    canRedo,
    addNode
  })

  // Stabilize renderPanelContents callback via ref
  const renderPanelContentsRef = useRef(renderPanelContents)
  renderPanelContentsRef.current = renderPanelContents
  const renderPanelContentsStable = useCallback((panelId: string): React.JSX.Element | null => {
    return renderPanelContentsRef.current(panelId)
  }, [])

  // Center content
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
            focusNodeRequest={editorState.focusNodeRequest}
            focusPositionRequest={editorState.focusPositionRequest}
            onViewportCenterChange={(center) => { editorState.canvasCenterRef.current = center }}
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
            notes={runtime.notes}
            onUpdateNote={editorCallbacks.handleUpdateNote}
            onDeleteNote={editorCallbacks.handleDeleteNote}
            onFocusNode={editorCallbacks.selectNode}
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
      editorState.focusNodeRequest,
      editorState.focusPositionRequest,
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
      onParallelRemoveBranch,
      runtime.notes,
      editorCallbacks.handleUpdateNote,
      editorCallbacks.handleDeleteNote,
      editorCallbacks.selectNode
    ]
  )

  // Panel badge
  const getPanelBadge = useCallback((panelId: string): React.ReactNode | null => {
    if (panelId === 'panel.logs') {
      const total = editorValidation.logsData.errorCount + editorValidation.logsData.warnCount
      if (total === 0) return null
      const color = editorValidation.logsData.errorCount > 0 ? '#e05050' : '#d4a017'
      return (
        <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, color, background: 'rgba(255,255,255,0.08)', borderRadius: 3, padding: '0 3px', lineHeight: 1 }}>
          {total}
        </span>
      )
    }
    if (panelId === 'panel.templates') {
      if (editorState.templates.length === 0) return null
      return (
        <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, color: '#4a9eff', background: 'rgba(255,255,255,0.08)', borderRadius: 3, padding: '0 3px', lineHeight: 1 }}>
          {editorState.templates.length}
        </span>
      )
    }
    return null
  }, [editorValidation.logsData.errorCount, editorValidation.logsData.warnCount, editorState.templates.length])

  // Top bar content
  const topBarContent = useMemo(
    () => {
      const panels = [
        { id: 'panel.actions', label: editorCallbacks.getPanelTitle('panel.actions') },
        { id: 'panel.bookmarks', label: editorCallbacks.getPanelTitle('panel.bookmarks') },
        { id: 'panel.notes', label: editorCallbacks.getPanelTitle('panel.notes') },
        { id: 'panel.text', label: editorCallbacks.getPanelTitle('panel.text') },
        { id: 'panel.inspector', label: editorCallbacks.getPanelTitle('panel.inspector') },
        { id: 'panel.logs', label: editorCallbacks.getPanelTitle('panel.logs') },
        { id: 'panel.templates', label: editorCallbacks.getPanelTitle('panel.templates') }
      ]
      return (
        <TopMenuBar
          panels={panels}
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
        onResetLayout={editorCallbacks.handleResetLayout}
        onCheckUpdates={editorCallbacks.handleCheckUpdates}
        onToggleRuntimeJson={editorCallbacks.handleToggleRuntimeJson}
        runtimeJsonVisible={isPanelVisible('panel.runtime_json')}
        onCopyLogToClipboard={editorCallbacks.handleCopyLogToClipboard}
        onOpenDevTools={editorCallbacks.handleOpenDevTools}
        onToggleHardwareAcceleration={editorCallbacks.handleToggleHardwareAcceleration}
        onChooseScreenshotOutputDir={editorCallbacks.handleChooseScreenshotOutputDir}
        onToggleVisualEditorTechMode={editorCallbacks.handleToggleVisualEditorTechMode}
        visualEditorTechModeEnabled={preferences.visualEditorTechMode}
        hardwareAccelerationDisabled={preferences.disableHardwareAcceleration}
        onCleanupDevData={editorCallbacks.handleCleanupDevData}
        onResetSeverityOverrides={editorValidation.handleResetAllOverrides}
        onOpenVisualEditing={openVisualEditorWindow}
        onAbout={editorCallbacks.handleAbout}
        onTutorial={editorCallbacks.handleTutorial}
        onExit={editorCallbacks.handleExit}
        onPreferences={() => editorState.setPreferencesOpen(true)}
        language={preferences.language}
        keybindings={preferences.keybindings}
        showSavedIndicator={editorState.showSavedIndicator}
        />
      )
    },
    [
      editorCallbacks.getPanelTitle,
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
      editorCallbacks.handleResetLayout,
      editorCallbacks.handleCheckUpdates,
      editorCallbacks.handleToggleRuntimeJson,
      editorCallbacks.handleCopyLogToClipboard,
      editorCallbacks.handleOpenDevTools,
      editorCallbacks.handleToggleHardwareAcceleration,
      editorCallbacks.handleChooseScreenshotOutputDir,
      editorCallbacks.handleToggleVisualEditorTechMode,
      editorCallbacks.handleCleanupDevData,
      preferences.visualEditorTechMode,
      preferences.disableHardwareAcceleration,
      preferences.language,
      preferences.keybindings,
      openVisualEditorWindow,
      editorCallbacks.handleAbout,
      editorCallbacks.handleTutorial,
      editorCallbacks.handleExit,
      editorCallbacks.handlePreferences,
      editorState.showSavedIndicator,
      editorValidation.handleResetAllOverrides
    ]
  )

  const collapsePanelLabel = t('editor.collapsePanel', 'Collapse panel')
  const closePanelLabel = t('editor.closePanel', 'Close panel')

  return (
    <>
      <PanelDataProvider value={panelData}>
        <DockingLayout
          renderPanelContents={renderPanelContentsStable}
          getPanelTitle={editorCallbacks.getPanelTitle}
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

      <EditorShellModals
        preferencesOpen={editorState.preferencesOpen}
        preferences={preferences}
        updatePreferences={updatePreferences}
        setPreferencesOpen={editorState.setPreferencesOpen}
        welcomeOpen={editorState.welcomeOpen}
        handleWelcomeComplete={editorState.handleWelcomeComplete}
        isTutorialActive={editorState.isTutorialActive}
        handleTutorialComplete={editorState.handleTutorialComplete}
        handleTutorialSkip={editorState.handleTutorialSkip}
        inspectorTutorialActive={editorState.inspectorTutorialActive}
        handleInspectorTutorialComplete={editorState.handleInspectorTutorialComplete}
        handleInspectorTutorialSkip={editorState.handleInspectorTutorialSkip}
        visualEditingTutorialActive={editorState.visualEditingTutorialActive}
        handleVisualEditingTutorialComplete={editorState.handleVisualEditingTutorialComplete}
        handleVisualEditingTutorialSkip={editorState.handleVisualEditingTutorialSkip}
        aboutOpen={editorState.aboutOpen}
        appVersion={editorState.appVersion}
        handleOpenDocs={handleOpenDocs}
        setAboutOpen={editorState.setAboutOpen}
        nameConflictModal={editorState.nameConflictModal}
        pendingNodeName={editorState.pendingNodeName}
        setPendingNodeName={editorState.setPendingNodeName}
        setNameConflictModal={editorState.setNameConflictModal}
        nameConflictOkRef={editorState.nameConflictOkRef}
        runtime={runtime}
        setRuntime={setRuntime}
        t={t}
      />
    </>
  )
})
