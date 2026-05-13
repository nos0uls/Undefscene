/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useCallback, useMemo, useRef } from 'react'

import type { LayoutState } from './useLayoutState'
import { DockingProvider, useDockingContext, type CollapsedDocksState } from './DockingContext'
import { COLLAPSED_HEADER_HEIGHT } from './dockingConstants'
import type { CutsceneTemplateSnippet } from './templateStorage'
import { createTemplate, prepareTemplateForInsertion, saveTemplates } from './templateStorage'
import type { RuntimeNote } from './runtimeTypes'
import { useToasts, pushSuccess, pushError, pushInfo } from './ToastHub'
import { useConfirm } from './confirmContext'

export interface EditorCallbacksReturn {
  getPanelTitle: (panelId: string) => string
  handleSaveTemplate: (name: string) => void
  handleInsertTemplate: (templateId: string) => void
  handleRenameTemplate: (templateId: string, newName: string) => void
  handleDeleteTemplate: (templateId: string) => void
  handleToggleZenMode: () => void
  hotkeyHandlers: Array<{ actionId: string; handler: () => void }>
  handleToggleLogFilter: (key: 'errors' | 'warnings' | 'tips') => void
  handleLogsSelectNode: (nodeId: string) => void
  handleLogsSelectEdge: (edgeId: string) => void
  handleResetLayout: () => void
  handleCheckUpdates: () => void
  handleToggleRuntimeJson: () => void
  handleCopyLogToClipboard: () => void
  handleOpenDevTools: () => void
  handleToggleHardwareAcceleration: () => void
  handleChooseScreenshotOutputDir: () => void
  handleToggleVisualEditorTechMode: () => void
  handleCleanupDevData: () => void
  handleAbout: () => void
  handleTutorial: () => void
  handleExit: () => void
  handlePreferences: () => void
  selectNode: (nodeId: string) => void
  handleAddNote: (note: RuntimeNote) => void
  handleUpdateNote: (id: string, patch: Partial<RuntimeNote>) => void
  handleDeleteNote: (id: string) => void
  handleSelectNote: (x: number, y: number) => void
}

export function useEditorCallbacks(
  layout: LayoutState,
  setLayout: (l: LayoutState) => void,
  collapsedDocks: CollapsedDocksState,
  setCollapsedDocks: (docks: CollapsedDocksState) => void,
  templates: CutsceneTemplateSnippet[],
  setTemplates: (templates: CutsceneTemplateSnippet[]) => void,
  runtime: { nodes: { id: string; position?: { x: number; y: number } }[]; selectedNodeIds: string[]; edges: unknown[]; notes: RuntimeNote[] },
  setRuntime: (updater: (prev: unknown) => unknown) => void,
  setFocusNodeRequest: (request: { nodeId: string; nonce: number } | null) => void,
  setFocusPositionRequest: (request: { x: number; y: number; zoom: number; nonce: number } | null) => void,
  setLogsFilters: (filters: { errors: boolean; warnings: boolean; tips: boolean }) => void,
  setShowSavedIndicator: (show: boolean) => void,
  togglePanel: (panelId: string) => void,
  preferences: { showDockDropPreview: boolean; autoSaveEnabled: boolean; autoSaveIntervalMinutes: number; visualEditorTechMode: boolean; disableHardwareAcceleration: boolean; language: string | null; keybindings: unknown },
  updatePreferences: (prefs: Partial<{ visualEditorTechMode: boolean; disableHardwareAcceleration: boolean }>) => void,
  toasts: ReturnType<typeof useToasts>,
  confirm: ReturnType<typeof useConfirm>,
  t: (key: string, fallback: string) => string,
  openProject: () => void,
  handleExport: () => void,
  handleNew: () => void,
  handleCreateExample: () => void,
  handleOpenScene: () => void,
  handleSave: () => void,
  handleSaveAs: () => void,
  undo: () => void,
  redo: () => void,
  openVisualEditorWindow: () => void,
  sceneFilePath: string | null
): EditorCallbacksReturn {
  const getPanelTitle = useCallback(
    (panelId: string): string => {
      if (panelId === 'panel.actions') return t('panels.actions', 'Actions')
      if (panelId === 'panel.bookmarks') return t('panels.bookmarks', 'Bookmarks')
      if (panelId === 'panel.text') return t('panels.text', 'Text')
      if (panelId === 'panel.inspector') return t('panels.inspector', 'Inspector')
      if (panelId === 'panel.logs') return t('panels.logs', 'Logs')
      if (panelId === 'panel.notes') return t('panels.notes', 'Notes')
      if (panelId === 'panel.runtime_json') return t('panels.runtimeJson', 'Runtime JSON')
      if (panelId === 'panel.templates') return t('panels.templates', 'Templates')
      return panelId
    },
    [layout.panels, t]
  )

  // Template callbacks
  const handleSaveTemplate = useCallback(
    (name: string) => {
      const selectedNodes = runtime.nodes.filter((n) => runtime.selectedNodeIds.includes(n.id))
      const selectedEdges = runtime.edges.filter(
        (e) => selectedNodes.some((n) => n.id === e.source) && selectedNodes.some((n) => n.id === e.target)
      )
      const newTemplate = createTemplate(name, selectedNodes as any, selectedEdges as any)
      const nextTemplates = [...templates, newTemplate]
      setTemplates(nextTemplates)
      saveTemplates({ version: 1, templates: nextTemplates })
    },
    [runtime.nodes, runtime.selectedNodeIds, runtime.edges, templates, setTemplates]
  )

  const handleInsertTemplate = useCallback(
    (templateId: string) => {
      const template = templates.find((t) => t.id === templateId)
      if (!template) return
      const selectedNodes = runtime.nodes.filter((n) => runtime.selectedNodeIds.includes(n.id))
      const refNode = selectedNodes[selectedNodes.length - 1] ?? runtime.nodes[0]
      const offsetX = refNode?.position ? refNode.position.x + 80 : 100
      const offsetY = refNode?.position ? refNode.position.y + 40 : 100
      const { nodes: newNodes, edges: newEdges } = prepareTemplateForInsertion(template, offsetX, offsetY)
      setRuntime((prev: any) => ({
        ...prev,
        nodes: [...prev.nodes, ...newNodes],
        edges: [...prev.edges, ...newEdges],
        selectedNodeId: null,
        selectedNodeIds: newNodes.map((n: any) => n.id)
      }))
    },
    [templates, runtime.nodes, runtime.selectedNodeIds, setRuntime]
  )

  const handleRenameTemplate = useCallback(
    (templateId: string, newName: string) => {
      const nextTemplates = templates.map((t) =>
        t.id === templateId ? { ...t, name: newName, updatedAt: Date.now() } : t
      )
      setTemplates(nextTemplates)
      saveTemplates({ version: 1, templates: nextTemplates })
    },
    [templates, setTemplates]
  )

  const handleDeleteTemplate = useCallback(
    (templateId: string) => {
      const nextTemplates = templates.filter((t) => t.id !== templateId)
      setTemplates(nextTemplates)
      saveTemplates({ version: 1, templates: nextTemplates })
    },
    [templates, setTemplates]
  )

  // Zen mode
  const handleToggleZenMode = useCallback(() => {
    // Сохраняем текущее состояние доков в layout.docks
    const nextLayout: LayoutState = {
      ...layout,
      docks: { ...collapsedDocks }
    }

    // Сворачиваем доки
    setCollapsedDocks({
      left: true,
      right: true,
      bottom: true
    })

    // Сворачиваем только плавающие панели
    const nextLayoutPanels: LayoutState['panels'] = Object.fromEntries(
      Object.entries(layout.panels).map(([panelId, panel]) => {
        if (panel.mode === 'floating' && !panel.collapsed) {
          const currentSize = panel.size ?? panel.lastFloatingSize ?? { width: 360, height: 240 }
          return [
            panelId,
            {
              ...panel,
              collapsed: true,
              size: { width: currentSize.width, height: COLLAPSED_HEADER_HEIGHT },
              lastFloatingSize: currentSize
            }
          ]
        }
        return [panelId, panel]
      })
    ) as LayoutState['panels']

    setLayout({ ...nextLayout, panels: nextLayoutPanels })
  }, [layout, setLayout, collapsedDocks, setCollapsedDocks])

  // Hotkeys
  const hotkeyHandlers = useMemo(
    () => [
      {
        actionId: 'toggle_inspector' as const,
        handler: () => togglePanel('panel.inspector')
      },
      {
        actionId: 'zen_mode' as const,
        handler: handleToggleZenMode
      },
      {
        actionId: 'toggle_all_dock_panels' as const,
        handler: handleToggleZenMode
      }
    ],
    [handleToggleZenMode, togglePanel]
  )

  // Logs callbacks
  const handleToggleLogFilter = useCallback(
    (key: 'errors' | 'warnings' | 'tips') => {
      setLogsFilters((prev) => ({ ...prev, [key]: !prev[key] }))
    },
    [setLogsFilters]
  )

  const handleLogsSelectNode = useCallback(
    (nodeId: string) => {
      setRuntime((prev: any) => ({
        ...prev,
        selectedNodeId: nodeId,
        selectedNodeIds: [nodeId],
        selectedEdgeId: null
      }))
      setFocusNodeRequest({ nodeId, nonce: Date.now() })
    },
    [setRuntime, setFocusNodeRequest]
  )

  const handleLogsSelectEdge = useCallback(
    (edgeId: string) => {
      setRuntime((prev: any) => ({
        ...prev,
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedEdgeId: edgeId
      }))
    },
    [setRuntime]
  )

  // Menu callbacks
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
      t('preferences.hardwareAccelerationApplied', 'Hardware acceleration setting will be applied on the next start.'),
      { title: t('app.preferences', 'Preferences'), duration: 0 }
    )
  }, [preferences, updatePreferences, toasts, t])

  const handleChooseScreenshotOutputDir = useCallback(() => {
    if (!window.api?.preferences?.chooseScreenshotOutputDir) {
      console.warn('Preferences API not available')
      return
    }

    window.api.preferences
      .chooseScreenshotOutputDir()
      .then((result) => {
        if (result.canceled) return

        updatePreferences({ screenshotOutputDir: result.filePath })
        pushSuccess(toasts, t('toasts.screenshotDirUpdated', 'Screenshot output directory updated'))
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        pushError(toasts, msg, { title: t('toasts.screenshotDirUpdateFailed', 'Failed to update screenshot directory') })
      })
  }, [updatePreferences, toasts, t])

  const handleToggleVisualEditorTechMode = useCallback(() => {
    updatePreferences({
      visualEditorTechMode: !preferences.visualEditorTechMode
    })
  }, [preferences.visualEditorTechMode, updatePreferences])

  const handleCleanupDevData = useCallback(() => {
    if (!window.api?.dev?.cleanupDevData) {
      console.warn('Dev API not available')
      return
    }

    confirm({
      title: t('dialog.cleanupDevDataTitle', 'Cleanup development data'),
      message: t('dialog.cleanupDevDataMessage', 'This will delete all temporary development data. Are you sure?'),
      onConfirm: () => {
        window.api.dev.cleanupDevData().then(() => {
          pushSuccess(toasts, t('toasts.devDataCleaned', 'Development data cleaned'))
        }).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err)
          pushError(toasts, msg, { title: t('toasts.devDataCleanupFailed', 'Failed to cleanup development data') })
        })
      }
    })
  }, [confirm, toasts, t])

  const handleAbout = useCallback(() => {
    if (!window.api?.appInfo?.openAbout) {
      console.warn('App info API not available')
      return
    }
    void window.api.appInfo.openAbout()
  }, [])

  const handleTutorial = useCallback(() => {
    if (!window.api?.appInfo?.openTutorial) {
      console.warn('App info API not available')
      return
    }
    void window.api.appInfo.openTutorial()
  }, [])

  const handleExit = useCallback(() => {
    if (!window.api?.appInfo?.exit) {
      console.warn('App info API not available')
      return
    }
    void window.api.appInfo.exit()
  }, [])

  const handlePreferences = useCallback(() => {
    if (!window.api?.appInfo?.openPreferences) {
      console.warn('App info API not available')
      return
    }
    void window.api.appInfo.openPreferences()
  }, [])

  // Node selection
  const selectNode = useCallback(
    (nodeId: string) => {
      setRuntime((prev: any) => ({
        ...prev,
        selectedNodeId: nodeId,
        selectedNodeIds: [nodeId],
        selectedEdgeId: null
      }))
      setFocusNodeRequest({ nodeId, nonce: Date.now() })
    },
    [setRuntime, setFocusNodeRequest]
  )

  // Notes callbacks
  const handleAddNote = useCallback(
    (note: RuntimeNote) => {
      setRuntime((prev: any) => ({
        ...prev,
        notes: [...prev.notes, note]
      }))
    },
    [setRuntime]
  )

  const handleUpdateNote = useCallback(
    (id: string, patch: Partial<RuntimeNote>) => {
      setRuntime((prev: any) => ({
        ...prev,
        notes: prev.notes.map((n: RuntimeNote) => (n.id === id ? { ...n, ...patch } : n))
      }))
    },
    [setRuntime]
  )

  const handleDeleteNote = useCallback(
    (id: string) => {
      setRuntime((prev: any) => ({
        ...prev,
        notes: prev.notes.filter((n: RuntimeNote) => n.id !== id)
      }))
    },
    [setRuntime]
  )

  const handleSelectNote = useCallback(
    (x: number, y: number) => {
      setFocusPositionRequest({ x, y, zoom: 1, nonce: Date.now() })
    },
    [setFocusPositionRequest]
  )

  return {
    getPanelTitle,
    handleSaveTemplate,
    handleInsertTemplate,
    handleRenameTemplate,
    handleDeleteTemplate,
    handleToggleZenMode,
    hotkeyHandlers,
    handleSaveSuccess,
    handleToggleLogFilter,
    handleLogsSelectNode,
    handleLogsSelectEdge,
    handleResetLayout,
    handleCheckUpdates,
    handleToggleRuntimeJson,
    handleCopyLogToClipboard,
    handleOpenDevTools,
    handleToggleHardwareAcceleration,
    handleChooseScreenshotOutputDir,
    handleToggleVisualEditorTechMode,
    handleCleanupDevData,
    handleAbout,
    handleTutorial,
    handleExit,
    handlePreferences,
    selectNode,
    handleAddNote,
    handleUpdateNote,
    handleDeleteNote,
    handleSelectNote
  }
}
