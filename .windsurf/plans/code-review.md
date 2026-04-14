# Undefscene Editor — Deep Code Review & Optimization Plan

## Executive Summary

The Undefscene editor is a well-functioning Electron + React + ReactFlow cutscene editor. The architecture is **sound overall** — IPC boundaries are respected, state flows are clear, and persistence is atomic. However, the codebase has grown organically, and the **monolithic `EditorShell.tsx` (5163 lines)** is the single biggest bottleneck for maintainability and performance.

Below is a prioritized list of findings grouped by impact: **bugs & correctness**, **real performance wins**, **architectural debt**, and **minor cleanup**. Each item notes whether it's a quick fix or a larger refactor.

---

## 1. BUGS & CORRECTNESS ISSUES

### 1.1 Autosave timer logic is inverted (Bug — High)
**File:** `EditorShell.tsx:1762-1785`

The autosave `useEffect` creates a `setTimeout` that fires **once** after `intervalMs`. But because the effect re-runs every time `runtime` changes (it's in the dependency array), the timer gets cleared and re-created on every keystroke. This means:
- Autosave fires `intervalMs` after the **last** change, not periodically.
- If the user continuously edits, autosave **never fires** because the timer is perpetually reset.

**Fix:** Use `setInterval` or debounce-then-save pattern. The `lastPersistedSceneJsonRef` comparison is good, but the scheduling logic should fire periodically regardless of edit cadence.

### 1.2 IPC `scene.autosave` expects 3 positional args, handler receives an object (Bug — Medium)
**File:** `EditorShell.tsx:1772-1773` → calls `window.api.scene.autosave(sceneFilePath, jsonString, 5)`
**File:** `main/index.ts:1611-1658` → handler receives `payload: { filePath, jsonString, backupCount }`

The renderer passes 3 separate args, but the main process destructures a single object. This means `payload` will be the first arg (`sceneFilePath`), `jsonString` and `backupCount` will be lost. Autosave is likely silently failing.

**Fix:** Either change the call site to pass an object, or change the handler to accept positional args.

### 1.3 Ctrl+C / Ctrl+X use `e.key` which is case-sensitive with Caps Lock (Minor)
**File:** `EditorShell.tsx:1498, 1540`

The code checks `e.key === 'c' || e.key === 'C'` but this still fails on some keyboard layouts where `Ctrl+C` produces a different `key` value. The Undo/Redo block above already uses `key.toLowerCase()` consistently — the clipboard shortcuts should too.

**Fix:** Use `key` (which is already lowercased at line 1426) instead of `e.key` for these checks.

### 1.4 `renderPanelContents` closures capture stale `runtime` (Performance/Correctness — Medium)
**File:** `EditorShell.tsx:2089-3674`

`renderPanelContents` is a plain function (not memoized) that captures `runtime`, `setRuntime`, and many other values from the parent closure. Because it's called during render inside docked/floating panels, this is **functionally correct**. But `updateNode`, `updateEdge`, `selectNode`, `changeNodeType`, etc. all close over the current `runtime` object — which means they create new objects on every call and can't be stabilized with `useCallback`. This is the root cause of:
- Every runtime change → full re-render of all panels
- Every re-render → new closure functions → React Flow re-renders

**Fix:** Extract inspector panel as a separate `<InspectorPanel>` component that receives only `selectedNode` and an `onUpdate` callback. This breaks the closure chain.

### 1.5 `serializeScene()` includes `selectedNodeId` / `selectedNodeIds` in saved JSON (Minor)
**File:** `EditorShell.tsx:1718-1720`

`serializeScene` does `JSON.stringify(runtime, null, 2)` which includes selection state. This is intentional for runtime.json persistence, but `handleSave` and `handleSaveAs` use the same function for scene files. Scene files shouldn't contain editor-only transient state.

**Fix:** Strip `selectedNodeId`, `selectedNodeIds`, `selectedEdgeId` before saving .usc.json scene files.

---

## 2. REAL PERFORMANCE WINS

### 2.1 Break up the monolithic `EditorShell.tsx` (High Impact)
**File:** `EditorShell.tsx` (5163 lines, ~212KB)

This is the single biggest issue. The component owns:
- Layout state + dock management (~1000 lines)
- Drag-and-drop panel logic (~600 lines)
- Resize logic (~400 lines)
- Keyboard shortcuts + clipboard (~300 lines)
- Scene I/O (save/open/export) (~200 lines)
- Inspector panel JSX (~1400 lines)
- All other panel JSX (~400 lines)
- Node creation / parallel branch management (~200 lines)
- Visual editor IPC bridge (~200 lines)

**Every** state change (runtime, layout, preferences, drag, resize, etc.) causes the entire 5000+ line component to re-render, including reconstructing all panel JSX.

**Recommended splits:**
| New component / hook | Lines saved | Re-render isolation |
|---|---|---|
| `<InspectorPanel>` | ~1400 | Only re-renders on selectedNode/edge change |
| `<ActionsPanel>` | ~100 | Only re-renders on palette/save actions |
| `<BookmarksPanel>` | ~60 | Only re-renders on node list change |
| `<LogsPanel>` | ~150 | Only re-renders on validation change |
| `<TextPanel>` (yarn preview) | ~100 | Only re-renders on yarn preview change |
| `useDockDrag` hook | ~400 | No JSX, isolates pointer event logic |
| `useDockResize` hook | ~300 | No JSX, isolates resize logic |
| `useKeyboardShortcuts` hook | ~300 | Already partially extracted via `useHotkeys` |
| `useSceneIO` hook | ~200 | Isolates save/open/export |

**Net result:** EditorShell drops to ~1500 lines (layout shell + glue). Each panel only re-renders when its specific data changes. This is the highest-ROI optimization by far.

### 2.2 `renderPanelContents` recreates inspector JSX on every render (High Impact)
**File:** `EditorShell.tsx:2089-3674`

This function is called 5+ times per render (once per visible panel). The inspector section (lines 2459-3514) contains ~1000 lines of JSX with inline closures, inline styles, and conditional blocks. All of this is reconstructed on every render even if the selected node hasn't changed.

**Fix:** After extracting `<InspectorPanel>`, wrap with `React.memo` comparing `selectedNode.id` + `selectedEdge?.id` + `runtime.nodes.length`. This eliminates ~80% of unnecessary work.

### 2.3 Undo/redo stores full RuntimeState copies (Medium Impact)
**File:** `useRuntimeState.ts:110-113`

Each undo step stores a full `RuntimeState` with all nodes and edges cloned. With MAX_HISTORY=40, a scene with 100 nodes × 40 history slots = 4000 node objects in memory. This is fine for small scenes but gets expensive for large ones.

**Fix (later, if scenes grow):** Use structural sharing — only diff the changed nodes/edges. Or use a library like Immer that can share unchanged subtrees.

### 2.4 `validateGraph` runs on every render cycle (Medium Impact)
**File:** `EditorShell.tsx` (the `validation` variable is computed inline)

Validation iterates all nodes and edges, builds maps, checks connectivity. This runs on every render of EditorShell, which happens on every mouse move during drag, every keystroke, etc.

**Fix:** Wrap in `useMemo(() => validateGraph(runtime, context), [runtime.nodes, runtime.edges, context])`. The validation only needs to update when the graph topology changes.

### 2.5 FlowCanvas re-maps nodes/edges on every render (Low-Medium Impact)
**File:** `FlowCanvas.tsx:~100-300`

`runtimeToFlowNodes` and `runtimeToFlowEdges` mapping runs on every render. These could be memoized with `useMemo` keyed on `runtimeNodes`, `runtimeEdges`, and relevant preferences.

**Fix:** Already partially managed with `useEffect` syncing to local state, but the mapping itself could use memoization.

### 2.6 Inline styles in inspector create new objects per render (Low Impact)
**File:** `EditorShell.tsx:2300-3514`

Dozens of `style={{ ... }}` objects are recreated on every render. While React is smart about this in some cases, for frequently re-rendering components these add up.

**Fix:** Extract common styles to CSS classes or `const` objects outside the component. This becomes free after the inspector extraction (2.1).

---

## 3. ARCHITECTURAL DEBT

### 3.1 Duplicated code: Ctrl+C and Ctrl+X share 90% logic (Medium)
**File:** `EditorShell.tsx:1497-1589`

The copy and cut handlers have identical parallel-pair-expansion and node/edge collection code. Only the final step differs (cut also deletes).

**Fix:** Extract `collectSelectedPayload(runtime)` → `{ nodes, edges, selectedSet }`. Then:
- Copy = collect + store
- Cut = collect + store + delete

### 3.2 Node palette lists are duplicated (Low)
**File:** `EditorShell.tsx:2294-2314` and `EditorShell.tsx:2461-2481`

The list of node types appears twice (Actions palette and Inspector type dropdown). They're slightly different but should share a single source of truth.

**Fix:** Define `ALL_NODE_TYPES` in a shared constant file (e.g. `nodeConstants.ts` which already exists).

### 3.3 `clamp` function is defined multiple times (Trivial)
**File:** `EditorShell.tsx:1874`, `RoomVisualEditorModal.tsx:126`

Multiple local `clamp` definitions.

**Fix:** Export from a shared utility module.

### 3.4 Dynamic imports in event handlers are unnecessary (Low)
**File:** `EditorShell.tsx:1808, 1815, 1846, 1860`

`import('./runtimeTypes')` and `import('./reverseCompile')` are called on user actions (New Scene, Open Scene, Create Example). These modules are tiny and already bundled. Dynamic import adds latency for no benefit.

**Fix:** Use regular imports at the top of the file.

### 3.5 IPC handlers in `main/index.ts` could use a registry pattern (Low)
**File:** `main/index.ts:1360-1700`

~340 lines of nearly identical `ipcMain.handle(...)` registrations for layout, runtime, preferences, scene, export, yarn, settings, etc. Each handler follows the pattern: read file → parse JSON → return, or accept JSON → write atomically.

**Fix:** Extract a generic `createJsonPersistenceHandlers(name, path)` utility. But this is cosmetic — the current code works fine and is readable.

---

## 4. INCOMPLETE / STUB FEATURES

### 4.1 "per project layout" is noted but not implemented
**File:** `main/index.ts:1343-1346` — comment says "Позже мы переключимся на layout.json per project"

**Status:** Currently global. Not blocking.

### 4.2 `previewTypes.ts` defines a GML preview protocol that isn't connected
**File:** `previewTypes.ts`

The preview control/status types suggest a file-based IPC mechanism with GameMaker preview builds. The types are defined but no active consumer or producer is visible in the codebase.

**Status:** Foundation for future feature. No action needed.

### 4.3 Hotkeys defined in preferences aren't all wired up
**File:** `usePreferences.ts:39-52` defines `HOTKEY_ACTION_IDS` including `'toggle_inspector'`, `'fit_view'`, `'zen_mode'`, etc.
**File:** `EditorShell.tsx:1416-1675` has a separate hardcoded `keydown` handler for Ctrl+Z/Y/S/N/E/P and Delete.

The old keydown handler doesn't read from `preferences.keybindings` — it's hardcoded. The new `useHotkeys` system (line 4087) handles some actions but not undo/redo/save/clipboard.

**Fix:** Migrate the old hardcoded keydown handler to use `useHotkeys` with `preferences.keybindings`. This would unify the two systems.

---

## 5. RECOMMENDED IMPLEMENTATION ORDER

1. **Fix autosave IPC signature mismatch** (Bug 1.2) — 5 min, high impact
2. **Fix autosave timer logic** (Bug 1.1) — 15 min, high impact
3. **Fix clipboard key checks** (Bug 1.3) — 2 min
4. **Strip selection from scene save** (Bug 1.5) — 5 min
5. **Memoize validateGraph** (Perf 2.4) — 5 min
6. **Extract InspectorPanel** (Perf 2.1 + 2.2) — 2-3 hours, highest performance ROI
7. **Extract remaining panels** (Perf 2.1) — 1-2 hours
8. **Extract dock drag/resize hooks** (Arch 2.1) — 1-2 hours
9. **Deduplicate copy/cut logic** (Arch 3.1) — 20 min
10. **Unify hotkey systems** (Incomplete 4.3) — 1 hour
11. **Remove dynamic imports** (Arch 3.4) — 5 min

Total estimated effort: ~8-10 hours for all items.
Items 1-5 can be done immediately as quick wins.
Item 6 is the single most impactful change.

---

## 6. THINGS THAT ARE ALREADY GOOD

- **Atomic file writes** with tmp+rename in all IPC persistence handlers
- **Path traversal protection** in `yarn.readFile` handler
- **Stable `setRuntime` callback** via `useCallback([])` preventing infinite re-render loops
- **Selection change deduplication** in FlowCanvas `onSelectNodes` callback
- **requestAnimationFrame batching** for drag preview DOM updates
- **Direct DOM manipulation** for drag ghost to avoid React re-renders
- **Proper IPC security** — renderer never accesses fs directly
- **Schema versioning** on all persisted data types (runtime, layout, preferences)
- **Good separation** between runtime types, layout types, and preferences
- **Clean node component hierarchy** (BaseNode → CutsceneNodes)

These patterns should be preserved during any refactoring.
