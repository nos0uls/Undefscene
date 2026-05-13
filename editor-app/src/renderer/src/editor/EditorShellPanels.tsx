/* eslint-disable @typescript-eslint/explicit-function-return-type */
import React, { useCallback, useMemo, useRef } from 'react'

import { ActionsPanel } from './ActionsPanel'
import { BookmarksPanel } from './BookmarksPanel'
import { NotesPanel } from './NotesPanel'
import { TextPanel } from './TextPanel'
import { LogsPanel } from './LogsPanel'
import { InspectorPanel } from './InspectorPanel'
import { TemplateLibraryPanel } from './TemplateLibraryPanel'
import type { RuntimeNote } from './runtimeTypes'

export interface EditorShellPanelsProps {
  t: (key: string, fallback: string) => string
  runtime: any
  setRuntime: (updater: (prev: any) => any) => void
  selectedNode: any
  actorTargetOptions: string[]
  resources: { objects?: string[]; projectDir?: string } | null
  engineSettings: { runFunctions?: unknown; branchConditions?: unknown } | null
  yarnFiles: { file: string; nodes: unknown[] }[] | null
  pendingNodeName: string
  setPendingNodeName: (name: string) => void
  suggestUniqueNodeName: (baseName: string) => string
  setNameConflictModal: (state: any) => void
  shouldFocusEdgeWaitRef: React.MutableRefObject<boolean>
  yarnPreviewNodes: any[]
  yarnPreviewLoading: boolean
  selectedYarnPreviewTitle: string | null
  setSelectedYarnPreviewTitle: (title: string | null) => void
  logsData: any
  logsFilters: { errors: boolean; warnings: boolean; tips: boolean }
  handleToggleLogFilter: (key: 'errors' | 'warnings' | 'tips') => void
  handleLogsSelectNode: (nodeId: string) => void
  handleLogsSelectEdge: (edgeId: string) => void
  handleSetRuleOverride: (ruleId: string, severity: any) => void
  handleAddNote: (note: RuntimeNote) => void
  handleUpdateNote: (id: string, patch: Partial<RuntimeNote>) => void
  handleDeleteNote: (id: string) => void
  handleSelectNote: (x: number, y: number) => void
  selectNode: (nodeId: string) => void
  templates: any[]
  handleSaveTemplate: (name: string) => void
  handleInsertTemplate: (templateId: string) => void
  handleRenameTemplate: (templateId: string, newName: string) => void
  handleDeleteTemplate: (templateId: string) => void
  handleSave: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  addNode: (type: string) => void
}

export function useEditorShellPanels({
  t,
  runtime,
  setRuntime,
  selectedNode,
  actorTargetOptions,
  resources,
  engineSettings,
  yarnFiles,
  pendingNodeName,
  setPendingNodeName,
  suggestUniqueNodeName,
  setNameConflictModal,
  shouldFocusEdgeWaitRef,
  yarnPreviewNodes,
  yarnPreviewLoading,
  selectedYarnPreviewTitle,
  setSelectedYarnPreviewTitle,
  logsData,
  logsFilters,
  handleToggleLogFilter,
  handleLogsSelectNode,
  handleLogsSelectEdge,
  handleSetRuleOverride,
  handleAddNote,
  handleUpdateNote,
  handleDeleteNote,
  handleSelectNote,
  selectNode,
  templates,
  handleSaveTemplate,
  handleInsertTemplate,
  handleRenameTemplate,
  handleDeleteTemplate,
  handleSave,
  undo,
  redo,
  canUndo,
  canRedo,
  addNode
}: EditorShellPanelsProps) {
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
          shouldFocusEdgeWaitRef={shouldFocusEdgeWaitRef}
          t={t}
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
          onSetRuleOverride={handleSetRuleOverride}
        />
      )
    }

    if (panelId === 'panel.notes') {
      return (
        <NotesPanel
          t={t}
          notes={runtime.notes}
          selectedNode={
            selectedNode
              ? { id: selectedNode.id, name: selectedNode.name ?? selectedNode.type }
              : null
          }
          onAddNote={handleAddNote}
          onUpdateNote={handleUpdateNote}
          onDeleteNote={handleDeleteNote}
          onSelectNote={handleSelectNote}
          onFocusNode={selectNode}
          resolveNodeName={(nodeId) => {
            const node = runtime.nodes.find((n: any) => n.id === nodeId)
            return node?.name ?? node?.type ?? nodeId
          }}
        />
      )
    }

    if (panelId === 'panel.templates') {
      return (
        <TemplateLibraryPanel
          t={t}
          templates={templates}
          onSaveTemplate={handleSaveTemplate}
          onInsertTemplate={handleInsertTemplate}
          onRenameTemplate={handleRenameTemplate}
          onDeleteTemplate={handleDeleteTemplate}
        />
      )
    }

    return null
  }, [
    t,
    handleSave,
    undo,
    redo,
    canUndo,
    canRedo,
    addNode,
    selectNode,
    selectedNode,
    yarnPreviewNodes,
    yarnPreviewLoading,
    selectedYarnPreviewTitle,
    setSelectedYarnPreviewTitle,
    resources,
    runtime,
    setRuntime,
    actorTargetOptions,
    engineSettings,
    yarnFiles,
    pendingNodeName,
    setPendingNodeName,
    suggestUniqueNodeName,
    setNameConflictModal,
    shouldFocusEdgeWaitRef,
    logsData,
    logsFilters,
    handleToggleLogFilter,
    handleLogsSelectNode,
    handleLogsSelectEdge,
    handleSetRuleOverride,
    handleAddNote,
    handleUpdateNote,
    handleDeleteNote,
    handleSelectNote,
    templates,
    handleSaveTemplate,
    handleInsertTemplate,
    handleRenameTemplate,
    handleDeleteTemplate
  ])

  return renderPanelContents
}
