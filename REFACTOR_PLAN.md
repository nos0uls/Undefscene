# Plan: Splitting Large Files into Cohesive Chunks

> Date: 2026-06-16
> Target: `editor-app/src/renderer/src/editor/`
> Goal: Break files >600 lines into focused, maintainable modules

---

## Overview

| File | Current Lines | Target Structure | Risk | Payoff |
|------|---------------|------------------|------|--------|
| `CutsceneNodes.tsx` | 1769 | 7 category files + barrel | Low | High |
| `compileGraph.ts` | 1146 | 1 core + ~8 compiler modules | Medium | High |
| `InspectorPanel.tsx` | 953 | 3-4 subcomponents | Low | High |
| `validateGraph.ts` | 2220 | 1 core + ~10 validator modules | Medium | Medium |

---

## 1. CutsceneNodes.tsx (1769 lines → ~200 each)

### Current State
- 60+ `memo()` components in a single file
- Shared helpers: `renderParallelHandles`, `renderSharedParallelHandle`
- Shared types: `CutsceneNodeData`, `CutsceneNodeProps`
- Only consumer: `nodes/index.ts` (line 80 imports all 80 components)

### Target Structure
```
nodes/
  index.ts                    (barrel — re-exports all node types)
  CutsceneNodeTypes.ts        (shared types + helper functions)
  flow/
    index.ts                  (re-exports StartNode, EndNode, WaitNode)
    StartNode.tsx
    EndNode.tsx
    WaitNode.tsx
  movement/
    index.ts                  (Move, FollowPath, SetPosition, etc.)
    MoveNode.tsx
    FollowPathNode.tsx
    SetPositionNode.tsx
    MoveRelativeNode.tsx
    SetPositionRelativeNode.tsx
    JumpNode.tsx
    MoveDirectNode.tsx           # NEW — currently missing React component
    MoveRelativeDirectionNode.tsx # NEW — currently missing React component
  dialogue/
    index.ts
    DialogueNode.tsx
    WaitForDialogueNode.tsx
    SetDialogueSpeedNode.tsx
    WaitTypingNode.tsx
    DialogueControlNode.tsx
    SetPortraitNextNode.tsx
    SetPortraitNowNode.tsx
    ClearDialogueNode.tsx
  camera/
    index.ts
    CameraTrackNode.tsx
    CameraTrackUntilStopNode.tsx
    CameraPanNode.tsx
    CameraPanObjNode.tsx
    CameraCenterNode.tsx
    CameraShakeNode.tsx
    TweenCameraNode.tsx
    CameraPanSpeedNode.tsx         # NEW — currently missing React component
  audio/
    index.ts
    PlaySFXNode.tsx
    PlayMusicNode.tsx
    StopMusicNode.tsx
    MusicVolumeNode.tsx
    MusicDuckNode.tsx
    MusicUnduckNode.tsx
    MusicPitchNode.tsx
    MusicPauseNode.tsx
    MusicResumeNode.tsx
    PlayBossMusicNode.tsx
    StopBossMusicNode.tsx
    BossMusicPhaseNode.tsx
    PlayMusicIntroNode.tsx
    PlayMusicIntroLayeredNode.tsx
    CrossfadeMusicNode.tsx
  visual/
    index.ts
    AnimateNode.tsx
    SetAnimationFrameNode.tsx
    SetFacingNode.tsx
    SetDepthNode.tsx
    AutoFacingNode.tsx
    AutoWalkNode.tsx
    FadeInNode.tsx
    FadeOutNode.tsx
    EmoteNode.tsx
    FlipNode.tsx
    SpinNode.tsx
    ShakeObjectNode.tsx
    SetVisibleNode.tsx
    InstantModeNode.tsx
    SetEmotionNode.tsx             # NEW — currently missing React component
    LerpNode.tsx                   # NEW — currently missing React component
  logic/
    index.ts
    BranchNode.tsx
    RunFunctionNode.tsx
    ParallelStartNode.tsx
    ParallelJoinNode.tsx
    PartialControlNode.tsx
    WaitInteractNode.tsx
    WaitUntilNode.tsx
    SetFlagNode.tsx
    SpawnEntityNode.tsx
    DestroyEntityNode.tsx
    SetPlotNode.tsx
    ScheduleActionNode.tsx
    AttachToTargetNode.tsx
    DetachNode.tsx
    CheckpointStateNode.tsx
    RestoreStateNode.tsx
    MarkNodeNode.tsx
    RoomChangeNode.tsx
    SetPropertyNode.tsx
    TweenNode.tsx
```

### Step-by-Step Migration

**Step 1: Extract shared types**
```ts
// nodes/CutsceneNodeTypes.ts
import type { CSSProperties } from 'react'
import { Handle, Position } from '@xyflow/react'

export type CutsceneNodeData = { label?: string; params?: Record<string, unknown> }
export type CutsceneNodeProps = { data: CutsceneNodeData; selected?: boolean }

export function renderParallelHandles(
  kind: 'source' | 'target',
  branchIds: string[],
  hidden = false
): React.JSX.Element[] { /* existing logic */ }

export function renderSharedParallelHandle(
  kind: 'source' | 'target'
): React.JSX.Element { /* existing logic */ }
```

**Step 2: Create category files**
Move components preserving exact JSX. Only change:
- Import `CutsceneNodeProps` from `'../CutsceneNodeTypes'`
- Remove local `CutsceneNodeData`/`CutsceneNodeProps` definitions

**Step 3: Update `nodes/index.ts`**
```ts
// BEFORE: imports 80 named exports from './CutsceneNodes'
// AFTER:
import { StartNode, EndNode, WaitNode } from './flow'
import { MoveNode, FollowPathNode, ... } from './movement'
import { DialogueNode, ... } from './dialogue'
// ... etc
```

**Step 4: Delete `CutsceneNodes.tsx`**
After verifying `nodes/index.ts` compiles.

### Risk & Rollback
- **Risk:** Missing import after split → compile error immediately caught by TypeScript
- **Rollback:** `git checkout -- nodes/CutsceneNodes.tsx` + revert `index.ts`
- **Tests:** `npm run typecheck` + existing roundtrip tests cover all node types

---

## 2. compileGraph.ts (1146 lines → ~200 core + ~100 each compiler)

### Current State
- `compileGraph()` ~200 lines: graph traversal, cycle detection, parallel handling
- `nodeToAction()` ~700 lines: massive if/else for ~60 node types
- `stripExport()` ~200 lines: JSON packaging
- Consumers: `useSceneIO.ts`, `__tests__/compileGraph.test.ts`, `__tests__/roundtrip.test.ts`

### Target Structure
```
compiler/
  index.ts                    (re-exports compileGraph, stripExport, types)
  types.ts                    (Translator, CompiledAction, CompileResult, ExportedCutscene)
  core.ts                     (compileGraph, graph traversal, cycle detection)
  utils.ts                    (shared helpers: getOutgoingEdges, etc.)
  exporters.ts              (stripExport)
  compilers/
    index.ts                  (barrel: all compileXxx functions)
    movement.ts               (compileMove, compileFollowPath, compileSetPosition, ...)
    dialogue.ts               (compileDialogue, compileWaitForDialogue, ...)
    camera.ts                 (compileCameraTrack, compileCameraPan, ...)
    audio.ts                  (compilePlayMusic, compileStopMusic, ...)
    visual.ts                 (compileAnimate, compileSetFacing, ...)
    logic.ts                  (compileBranch, compileParallel, compileRunFunction, ...)
    flow.ts                   (compileStart, compileEnd, compileWait, compileRoomChange)
    control.ts                (compileSetFlag, compileSpawnEntity, compileSetPlot, ...)
```

### Step-by-Step Migration

**Step 1: Extract types**
```ts
// compiler/types.ts
export type Translator = (key: string, args?: Record<string, unknown>) => string
export type CompiledAction = { type: string; [key: string]: unknown }
export type CompileResult = { ok: true; actions: CompiledAction[] } | { ok: false; error: string }
export type ExportedCutscene = { cutscene_id: string; actions: CompiledAction[] }
```

**Step 2: Extract `stripExport`**
```ts
// compiler/exporters.ts
import type { RuntimeState, CompiledAction, ExportedCutscene } from './types'
export function stripExport(state: RuntimeState, actions: CompiledAction[]): ExportedCutscene { ... }
```

**Step 3: Create compiler map**
```ts
// compiler/compilers/movement.ts
import type { RuntimeNode, CompiledAction, Translator } from '../types'
export function compileMove(node: RuntimeNode): CompiledAction { ... }
export function compileFollowPath(node: RuntimeNode): CompiledAction { ... }
// ... etc
```

**Step 4: Refactor `nodeToAction` to strategy map**
```ts
// compiler/core.ts
import * as movementCompilers from './compilers/movement'
import * as dialogueCompilers from './compilers/dialogue'
// ... etc

const COMPILERS: Record<string, (node: RuntimeNode, t: Translator) => CompiledAction> = {
  move: movementCompilers.compileMove,
  follow_path: movementCompilers.compileFollowPath,
  // ... all 60 types
}

function nodeToAction(node: RuntimeNode, t: Translator): CompiledAction {
  const compiler = COMPILERS[node.type]
  if (compiler) return compiler(node, t)
  // Fallback: copy all params
  return { type: node.type, ...node.params }
}
```

**Step 5: Update imports in consumers**
```ts
// useSceneIO.ts
// BEFORE: import { compileGraph, stripExport } from './compileGraph'
// AFTER:  import { compileGraph, stripExport } from './compiler'
```

### Risk & Rollback
- **Risk:** Strategy map misses a node type → compile error or silent fallback
- **Mitigation:** Use exhaustive `switch` with TypeScript `never` check:
  ```ts
  const _exhaustive: never = node.type // Compile-time check
  ```
- **Rollback:** `git checkout -- compileGraph.ts`, revert consumer imports
- **Tests:** Existing `compileGraph.test.ts` and `roundtrip.test.ts` cover all types

---

## 3. InspectorPanel.tsx (953 lines → ~200 container + ~200 each subcomponent)

### Current State
4 concerns mixed in one component:
1. Scene title editor (lines 457-477)
2. Node inspector: type selector, name, dynamic fields (lines 479-700)
3. Edge inspector: wait, condition (lines 725-850)
4. Empty state when no selection (lines 702-722)

### Target Structure
```
inspector/
  index.ts                    (re-exports InspectorPanel)
  InspectorPanel.tsx          (~200 lines: container + orchestration)
  SceneTitleEditor.tsx        (~50 lines)
  NodeInspector.tsx           (~400 lines: type, name, dynamic fields)
  EdgeInspector.tsx           (~250 lines: wait, condition)
  InspectorEmptyState.tsx    (~30 lines)
  types.ts                    (InspectorPanelProps, etc.)
```

### Step-by-Step Migration

**Step 1: Extract types**
```ts
// inspector/types.ts
export type InspectorPanelProps = { /* existing props */ }
```

**Step 2: Extract SceneTitleEditor**
```tsx
// inspector/SceneTitleEditor.tsx
export function SceneTitleEditor({ localTitle, setLocalTitle, flushTitle, t }) { ... }
```

**Step 3: Extract NodeInspector**
Move all dynamic field rendering logic (lines 516-700) into `NodeInspector.tsx`.
Keep all `useCallback` hooks inside `NodeInspector` — they only need `selectedNode`.

**Step 4: Extract EdgeInspector**
Move edge wait + condition rendering (lines 725-850) into `EdgeInspector.tsx`.

**Step 5: Refactor main InspectorPanel**
```tsx
// inspector/InspectorPanel.tsx
export const InspectorPanel = memo(function InspectorPanel(props) {
  // Keep shared hooks: title debounce, edge wait ref
  // Render:
  //   <SceneTitleEditor ... />
  //   {selectedNode && <NodeInspector ... />}
  //   {selectedEdge && <EdgeInspector ... />}
  //   {!selectedNode && !selectedEdge && <InspectorEmptyState ... />}
})
```

### Risk & Rollback
- **Risk:** Props drilling for `t`, `actorTargetOptions`, etc.
- **Mitigation:** Use a single `InspectorContext` for shared data if prop drilling exceeds 3 levels
- **Rollback:** `git checkout -- InspectorPanel.tsx`
- **Tests:** Manual UI test — select node, change type, edit edge condition

---

## 4. validateGraph.ts (2220 lines → ~200 core + ~150 each validator)

### Current State
11 numbered sections in one function:
0. Node names
1. Start/end presence
2. Maps (nodeMap, inEdges, outEdges)
3. Per-node checks (~400 lines)
4. Required params
5. Best-practice checks
6. Parallel pair validation
7. Edge source/target existence
8. Reachability BFS
9. Resource context validation
10. Continuity checker (~600 lines)

### Target Structure
```
validators/
  index.ts                    (re-exports validateGraph, types)
  types.ts                    (ValidationContext, ValidationResult, etc.)
  core.ts                     (validateGraph orchestrator)
  graphChecks.ts              (start/end presence, reachability BFS)
  nodeChecks.ts               (required params, per-node type checks)
  edgeChecks.ts               (source/target existence, wait/condition)
  parallelChecks.ts           (start/join pairing, branch count)
  continuity.ts               (actor lifecycle, camera override, music)
  resourceChecks.ts           (context-dependent: sprites, yarn, functions)
```

### Step-by-Step Migration

**Step 1: Extract types**
```ts
// validators/types.ts
export type ValidationContext = { ... }
export type ValidationEntry = { ... }
export type ValidationResult = { ... }
```

**Step 2: Extract each section as a pure function**
```ts
// validators/graphChecks.ts
export function checkStartEndNodes(
  nodes: RuntimeNode[],
  t: Translator
): ValidationEntry[] { ... }

export function checkReachability(
  nodes: RuntimeNode[],
  edges: RuntimeEdge[],
  t: Translator
): ValidationEntry[] { ... }
```

**Step 3: Create validator array in core**
```ts
// validators/core.ts
import { checkStartEndNodes } from './graphChecks'
import { checkNodeParams } from './nodeChecks'
// ... etc

export function validateGraph(state: RuntimeState, context?: ValidationContext): ValidationResult {
  const t = createTranslator(context?.language ?? 'en')
  const entries: ValidationEntry[] = []

  // Shared maps
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const inEdges = buildInEdges(edges)
  const outEdges = buildOutEdges(edges)

  // Run all validators
  const validators = [
    () => checkNodeNames(nodes, t),
    () => checkStartEndNodes(nodes, t),
    () => checkNodeParams(nodes, edges, nodeMap, inEdges, outEdges, t),
    () => checkParallelPairs(nodes, edges, t),
    () => checkEdges(edges, nodeMap, t),
    () => checkReachability(nodes, edges, t),
    () => checkContinuity(nodes, edges, nodeMap, inEdges, outEdges, t),
    () => context ? checkResources(nodes, edges, context, t) : [],
  ]

  for (const validator of validators) {
    entries.push(...validator())
  }

  return { entries, hasErrors: entries.some(e => e.severity === 'error') }
}
```

### Risk & Rollback
- **Risk:** Validator array loses access to shared state (e.g., `nodeMap`)
- **Mitigation:** Pass shared maps as arguments; each validator is pure
- **Rollback:** `git checkout -- validateGraph.ts`
- **Tests:** `validateGraph.test.ts` covers all validation rules

---

## Execution Order (Recommended)

| Phase | File | Duration | When |
|-------|------|----------|------|
| 1 | `CutsceneNodes.tsx` split | 2-3 hours | First — lowest risk, highest payoff |
| 2 | `InspectorPanel.tsx` split | 2 hours | Second — improves DX immediately |
| 3 | `compileGraph.ts` split | 4-6 hours | Third — needs test coverage |
| 4 | `validateGraph.ts` split | 4-6 hours | Last — most complex, most tests needed |

---

## Testing Strategy

After each phase:
1. `npm run typecheck` — must pass with zero errors
2. `npm test` — all existing tests must pass
3. Manual smoke test: open editor, create nodes of each type, export, import
4. Roundtrip test: export → import → export must produce identical JSON

---

## Rollback Strategy

Each phase is independent. If a phase fails:
1. Revert the split files (`git checkout --`)
2. Revert the barrel/consumer imports
3. Verify tests pass
4. Debug, retry, or defer the phase

Never merge a split that breaks `npm run typecheck` or `npm test`.
