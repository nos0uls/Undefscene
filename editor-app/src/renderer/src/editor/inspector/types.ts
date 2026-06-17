import type { RuntimeEdge, RuntimeNode, RuntimeState } from '../runtimeTypes'
import type { EngineSettings, ProjectResources, YarnFileInfo } from '../useProjectResources'
import type { NameConflictModalState } from '../inspectorTypes'

export type InspectorPanelProps = {
  runtime: RuntimeState
  setRuntime: (next: RuntimeState | ((prev: RuntimeState) => RuntimeState)) => void
  selectedNode: RuntimeNode | null
  actorTargetOptions: string[]
  resources: ProjectResources | null
  engineSettings: EngineSettings | null
  yarnFiles: YarnFileInfo[]
  pendingNodeName: string
  setPendingNodeName: (name: string) => void
  suggestUniqueNodeName: (baseName: string, takenNames: Set<string>) => string
  setNameConflictModal: (state: NameConflictModalState | null) => void
  shouldFocusEdgeWaitRef: React.MutableRefObject<boolean>
  t: (key: string, fallback: string) => string
}

export type SceneTitleEditorProps = {
  localTitle: string
  setLocalTitle: (val: string) => void
  flushTitle: (val: string) => void
  debounceTitle: (val: string) => void
  t: (key: string, fallback: string) => string
}

export type NodeInspectorProps = {
  selectedNode: RuntimeNode
  pendingNodeName: string
  setPendingNodeName: (name: string) => void
  commitNodeName: (nodeId: string, name: string) => void
  changeNodeType: (nodeId: string, nextType: string) => void
  updateNodeParam: (nodeId: string, key: string, value: unknown) => void
  actorTargetOptions: string[]
  spriteOrObjectOptions: string[]
  spriteOptions: string[]
  objectOptions: string[]
  resources: ProjectResources | null
  engineSettings: EngineSettings | null
  yarnFiles: YarnFileInfo[]
  allConditionVars: string[]
  allConditionEquals: string[]
  allNodeNamesObjects: string[]
  incomingCount: number
  outgoingCount: number
  t: (key: string, fallback: string) => string
}

export type EdgeInspectorProps = {
  selectedEdge: RuntimeEdge
  updateEdge: (edgeId: string, patch: Partial<RuntimeEdge>) => void
  shouldFocusEdgeWaitRef: React.MutableRefObject<boolean>
  allConditionVars: string[]
  allConditionEquals: string[]
  allNodeNamesObjects: string[]
  t: (key: string, fallback: string) => string
}

export type InspectorEmptyStateProps = {
  t: (key: string, fallback: string) => string
}
