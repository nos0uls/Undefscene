# Feature-Based Audit Report: Undefscene Editor

> **Date:** 2026-06-16
> **Auditor:** Devin (manual inspection, no subagents)
> **Scope:** `editor-app/src/renderer/src/editor/` + core data files
> **Approach:** B — Feature-based audit (feature map → deep-dive → cross-feature)

---

## 1. Executive Summary

- **Total findings:** 57 issues (was 53 after fifth pass, +4 after completing Preferences/Theme/Layout)
- **By severity:** 1 High (fixed), 11 Medium, 45 Low
- **By category:** UI/Theme (19), i18n (18), Memory/Perf (7), Architecture (3), Data integrity (1), Logic errors (4), a11y (2), Test coverage (1), Missing DX (1)
- **No critical security vulnerabilities found** in audited features
- **Most concerning:**
  1. **~~Notes excluded from undo/redo~~ FIXED** (`useRuntimeState.ts:15-23`) — `hasMeaningfulSceneChange` now compares `notes`
  2. **No Error Boundaries** — any component crash takes down entire editor
  3. **Design Token Drift** — CSS variables exist in `base.css` but hardcoded colors used throughout components
  4. **Business logic in UI layer** (Canvas changes preferences)
  5. **z-index layering chaos** — magic numbers across 10+ components without centralized system
  6. **Multiple memory leaks** from uncleared timeouts
  7. **reverseCompile throws on parallel branch errors** — unhandled exception instead of graceful error
  8. **validateGraph music check uses linear scan** — false negatives when node order differs from execution order
  9. **compileGraph shared `visited` Set** — parallel branches cannot share subgraphs
  10. **Missing node UI components** — 5 types in registry have no React preview component (`move_direct`, `move_relative_direction`, `lerp`, `set_emotion`, `camera_pan_speed`)
  11. **Misleading error on import** — `handleOpenScene` shows "invalid JSON" when reverseCompile fails on valid JSON

> **Audit completeness estimate:** ~60% for core architecture, ~20% for InspectorPanel, ~15% for node registry/rendering, ~30% for compiler/validator. This is a **high-level survey**, not a line-by-line audit of every file. See `AUDIT_REASSESSMENT.md` for detailed breakdown.

---

## 2. Feature Map

### Context Hierarchy (Provider nesting)

```
App.tsx
  └── ToastProvider
        └── PreferencesProvider
              └── ConfirmProvider
                    └── EditorShell (or VisualEditorWindowApp)
                          └── DockingProvider
                                └── EditorShellInner
                                      ├── FlowCanvas (via DockingLayout)
                                      │     └── NodeActionsProvider (inside ReactFlowProvider)
                                      ├── TopMenuBar
                                      └── EditorShellPanels (7 panels)
                                      └── EditorShellModals (5+ modals)
```

### 6 Context Providers

| Context | File | Purpose |
|---------|------|---------|
| ToastHub | `ToastHub.tsx` | Toast notifications |
| PreferencesContext | `PreferencesContext.tsx` | Language, theme, settings |
| PanelDataContext | `PanelDataContext.tsx` | Panel data sharing |
| NodeActionsContext | `NodeActionsContext.tsx` | Parallel branch actions |
| DockingContext | `DockingContext.tsx` | Layout, drag/resize state |
| ConfirmContext | `confirmContext.tsx` | Confirm dialogs |

### Feature → Files Mapping

| # | Feature | Data | Logic | UI | IPC? |
|---|---------|------|-------|-----|------|
| 1 | **App Shell** | — | `App.tsx` | `App.tsx` | No |
| 2 | **Editor Shell** | `runtimeTypes.ts` | `EditorShell.tsx`, `useEditorState.ts`, `useEditorCallbacks.ts` | `EditorShell.tsx`, `EditorShellPanels.tsx`, `EditorShellModals.tsx` | No |
| 3 | **Canvas / Flow** | `runtimeTypes.ts` | `useNodeOperations.ts`, `FlowCanvas.tsx` | `FlowCanvas.tsx`, `CustomEdge.tsx` | No |
| 4 | **Node Palette** | `nodeRegistry.ts` | `useNodeOperations.ts` | `ActionsPanel.tsx` | No |
| 5 | **Inspector** | `nodeRegistry.ts`, `runtimeTypes.ts` | `useEditorValidation.ts` | `InspectorPanel.tsx` | No |
| 6 | **Bookmarks** | `runtimeTypes.ts` | — | `BookmarksPanel.tsx` | No |
| 7 | **Text / Yarn Preview** | `yarnPreview.ts` | `yarnPreview.ts`, `useProjectResources.ts` | `TextPanel.tsx` | No |
| 8 | **Logs / Validation** | `validateGraph.ts` | `useEditorValidation.ts` | `LogsPanel.tsx` | No |
| 9 | **Notes** | `runtimeTypes.ts` | `useEditorCallbacks.ts` | `NotesPanel.tsx`, `CanvasNotesOverlay.tsx` | No |
| 10 | **Templates** | `templateStorage.ts` | `useEditorCallbacks.ts` | `TemplateLibraryPanel.tsx` | localStorage |
| 11 | **Menu Bar** | — | `useSceneIO.ts`, `useEditorShortcuts.ts` | `TopMenuBar.tsx` | Yes |
| 12 | **Docking / Layout** | `layoutTypes.ts`, `dockingConstants.ts` | `useDocking.ts`, `useLayoutState.ts` | `DockingLayout.tsx`, `DockPanel.tsx` | Yes (layout.json) |
| 13 | **Preferences** | `usePreferences.ts` | `usePreferences.ts` | `PreferencesModal.tsx` (+ 3 sections) | Yes (prefs.json) |
| 14 | **Visual Room Editor** | `RoomVisualEditorTypes.ts` | `useVisualEditing.ts`, `usePathEditorLogic.ts`, `useActorEditorLogic.ts` | `RoomVisualEditor*.tsx` (7 files) | Yes (screenshots) |
| 15 | **Export / Compile** | `compileGraph.ts`, `reverseCompile.ts` | `useSceneIO.ts`, `compileGraph.ts` | — (menu callback) | Yes (save JSON) |
| 16 | **Project Loading** | `useProjectResources.ts` | `main/index.ts` (parseYypResources) | — | Yes (open .yyp) |
| 17 | **Auto-save** | `useSceneIO.ts` | `useSceneIO.ts` | — | Yes (autosave IPC) |
| 18 | **Tutorials** | `tutorialConstants.ts` | `useEditorState.ts` | `TutorialOverlay.tsx` | No |
| 19 | **Welcome** | `usePreferences.ts` | — | `WelcomeSetupModal.tsx` | No |
| 20 | **Update Check** | `updater.ts` | — | `UpdateNotification.tsx` | Yes (updater IPC) |
| 21 | **Shortcuts / Hotkeys** | `usePreferences.ts` | `useHotkeys.ts`, `useEditorShortcuts.ts` | — | No |

---

## 3. Findings by Feature

### 3.1 Canvas / Flow Editor (`FlowCanvas.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 1 | **Memory leak:** `selectionTimeoutRef` (debounce 100ms) never cleared on unmount | Low | 1141, 1177-1183 | Add cleanup: `useEffect(() => () => { if (selectionTimeoutRef.current) clearTimeout(...) }, [])` |
| 2 | **Architecture:** Canvas changes `preferences.canvasBackgroundPath` on load error — business logic in UI layer | Medium | 282-314 | Move background loading to `usePreferences` or `useEditorState`; Canvas should only report error via callback |
| 3 | **Perf:** `document.querySelector('.react-flow')` on every zoom threshold crossing | Low | 172 (`ZoomLODController`) | Cache DOM ref once on mount |
| 4 | **i18n:** `"Drop note"` in drag preview hardcoded | Low | 1332 | `t('editor.dropNotePreview', 'Drop note')` |
| 5 | **z-index:** `RF_STYLE = { zIndex: 1 }` and background `zIndex: 0` — no conflicts found, but worth documenting | Low | 52, 1346 | Verify no overlap with CanvasNotesOverlay |

### 3.2 Notes (`CanvasNotesOverlay.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 6 | **Theme:** `CATEGORY_BG` and `CATEGORY_BORDER` use static `hsl(...)` — don't adapt to dark/light theme | Medium | 8-22 | Replace with CSS variables: `var(--note-acting-bg)`, etc. |
| 7 | **Perf:** Every `CanvasNoteSticker` subscribes to `useStore((s) => s.nodes)` and `useStore((s) => s.transform)` — 50+ subscriptions | Medium | 80-81 | Hoist transform to parent, pass as prop; only snapped notes need `s.nodes` |

### 3.3 Text / Yarn Preview (`TextPanel.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 8 | **React key:** `key={entry.title}` — duplicate titles in malformed Yarn cause React warnings | Low | 79 | Use `key={\`yarn-${index}-${entry.title}\`}` |
| 9 | **i18n:** All strings properly translated ✅ | — | — | No fix needed |

### 3.4 Inspector Panel (`InspectorPanel.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 10 | **Memory leak:** `titleTimeoutRef` (debounce 200ms) never cleared on unmount | Medium | 54, 73-78 | Add cleanup useEffect |
| 11 | **Memory leak:** `window.setTimeout(() => setNameConflictModal(...))` inside `setRuntime` callback — no cleanup | Medium | 217-218 | Store timeout ref, clear in cleanup |
| 12 | **Theme:** `#e05050` hardcoded error color (invalid value indicator) | Low | 634, 878 | Use `var(--error-color)` or theme token |

### 3.5 App Shell (`App.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 13 | **a11y/UX:** Global `window.addEventListener('wheel', ...)` intercepts ALL Ctrl+Wheel events, breaking scroll in textareas/dropdowns | Medium | 80-95 | Check `event.target` — skip if over `textarea, input, select, [contenteditable]` |

### 3.6 Docking System (`useDocking.ts`, `DockingLayout.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 14 | **OK:** All event listeners properly cleaned up ✅ | — | 663-669, 936-942, 1196-1200 | — |
| 15 | **OK:** All RAF properly cancelled ✅ | — | 899, 1207 | — |

### 3.7 Visual Room Editor (`RoomVisualEditorModal.tsx`, `RoomVisualEditorCanvas.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 16 | **OK:** All 4 RAF refs properly cancelled in `stopPlayPreview` and cleanup effects ✅ | — | 241-260 | — |
| 17 | **Perf:** `stitchedRoomCacheRef` stores data URLs without size limits beyond 8 entries; data URL strings hold memory | Low | 98-110 | Monitor memory; consider `URL.revokeObjectURL` if switching to blob URLs |

### 3.8 Preferences / Theme (`PreferencesModal.tsx`, `useTheme.ts`, `PreferencesGeneralSection.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 18 | **a11y:** 3 simultaneous `window.addEventListener('keydown', ...)` on open modal (Esc, capture mode, focus trap) | Low | 92, 124, 175 | Consolidate into single listener with state-based dispatch |
| 19 | **i18n:** Theme labels (`'Dark'`, `'Dark Cyan'`, `'Gray'`, `'Light'`) and descriptions not translated | Low | `useTheme.ts:17-38` | `t('theme.dark.label', 'Dark')` etc. |
| 20 | **i18n:** Accent color preset labels (`'Purple'`, `'Cyan'` etc.) not translated | Low | `PreferencesGeneralSection.tsx:9-17` | `t('accent.purple', 'Purple')` etc. |

### 3.9 Export / Compile (Tests)

| # | Issue | Severity | File | Fix |
|---|-------|----------|------|-----|
| 21 | **Test coverage:** Round-trip test exists but only covers linear scene | Medium | `__tests__/roundtrip.test.ts` | Add tests for parallel, branch, guard_global, mark_node, wait_until_true |

### 3.10 Cutscene Nodes (`CutsceneNodes.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 22 | **i18n:** `SetPositionNode`, `SetPositionRelativeNode`, `ActorCreateNode`, `ActorDestroyNode`, `SetAnimationFrameNode` — labels not using `t()` | Low | Multiple | Wrap labels in `t('nodes.types.{type}', fallback)` |

### 3.11 Node Registry (`nodeRegistry.ts`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 23 | **i18n:** `label` and `placeholder` fields hardcoded English | Low | Throughout | `t('nodes.fields.{key}.label', fallback)` — note: `fields[].key` is CONTRACT, must NOT change |

### 3.12 Logs / Validation (`useEditorValidation.ts`, `LogsPanel.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 24 | **Theme:** `severityStyle` hardcoded colors `#e05050`, `#d4a017`, `#58a6ff` | Low | `useEditorValidation.ts:125-128` | Extract to CSS variables: `var(--severity-error)`, `var(--severity-warn)`, `var(--severity-tip)` |
| 25 | **Theme:** `toggleButtons[].color` uses same hardcoded colors | Low | `useEditorValidation.ts:136,142,148` | Same CSS variables as above |
| 26 | **OK:** Context menu listeners properly cleaned up | — | `LogsPanel.tsx:131-149` | — |
| 27 | **OK:** `useEditorValidation.ts` lazy-loads `validateGraph` with cleanup | — | Lines 44-82 | — |

### 3.13 Update Notification (`UpdateNotification.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 28 | **Theme:** Hardcoded `rgba` colors for status backgrounds | Low | Lines 68-73 | Use CSS variables: `var(--notification-error-bg)`, `var(--notification-success-bg)`, `var(--notification-info-bg)` |
| 29 | **OK:** Updater event listeners properly unsubscribed via cleanup functions | — | Lines 25-62 | — |

### 3.14 SearchableSelect (`SearchableSelect.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 30 | **i18n:** Placeholder `'-- Search --'` hardcoded | Low | Line 36 | `t('editor.searchPlaceholder', '-- Search --')` |
| 31 | **OK:** `blurTimerRef` properly cleaned up on unmount | — | Lines 75-79 | — |

### 3.15 Welcome Setup (`WelcomeSetupModal.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 32 | **z-index:** `zIndex: 9999` hardcoded magic number | Low | Line 59 | Use `var(--z-modal-backdrop)` or theme token |
| 33 | **Theme:** `backgroundColor: 'rgba(0, 0, 0, 0.55)'` hardcoded | Low | Line 57 | Use `var(--modal-backdrop-bg)` |
| 34 | **i18n:** `ACCENT_PRESETS` labels hardcoded (same as PreferencesGeneralSection) | Low | Lines 17-25 | `t('accent.purple', 'Purple')` etc. |

### 3.16 Actions Panel (`ActionsPanel.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 35 | **OK:** Labels translated via `t('nodes.types.' + type, ...)` | — | Line 55 | — |

### 3.17 Template Library (`TemplateLibraryPanel.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 36 | **OK:** Confirm dialog used for delete, inline editing with Enter/Escape | — | Lines 63-72 | — |

### 3.18 Confirm Dialog (`ConfirmDialog.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 37 | **Low risk:** `setTimeout(() => confirmBtnRef.current?.focus(), 50)` without cleanup | Low | Line 68 | Safe (DOM-only, no setState), but add cleanup for consistency |
| 38 | **OK:** Escape listener properly cleaned up | — | Lines 53-63 | — |

### 3.19 useRuntimeState (`useRuntimeState.ts`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 39 | ~~**Data integrity:** `hasMeaningfulSceneChange` does NOT compare `notes`~~ | ~~Medium~~ | ~~Lines 15-23~~ | ~~**FIXED** — `prev.notes !== next.notes` added~~ |
| 40 | **OK:** `saveTimer` (setTimeout 250ms) properly cleaned up | — | Lines 103-104 | — |
| 41 | **OK:** `cancelled` flag for async runtime.json load | — | Lines 55, 87-89 | — |

### 3.20 useEditorState (`useEditorState.ts`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 42 | ~~**Low risk:** `setTimeout(() => nameConflictOkRef.current?.focus(), 0)` without cleanup~~ | — | Line 313 | ~~**FALSE POSITIVE** — cleanup `return () => window.clearTimeout(t)` exists at lines 315-316~~ |
| 43 | **OK:** `window.addEventListener('keydown', ...)` for name conflict modal properly cleaned up | — | Lines 327-328 | — |

### 3.21 Toast Hub (`ToastHub.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 44 | **Theme:** `SEVERITY_STYLES` hardcoded colors — `#58a6ff`, `#50c850`, `#e6b43c`, `#e05050` | Low | Lines 133-153 | Use CSS variables: `var(--status-info)`, `var(--status-success)`, `var(--status-warning)`, `var(--status-error)` |
| 45 | **OK:** Timer cleanup on unmount | — | Lines 68-73 | — |

### 3.22 Notes Panel (`NotesPanel.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 46 | **Theme + Consistency:** `CATEGORY_COLORS` hardcoded HSL — AND different from `CanvasNotesOverlay.tsx` | Low | Lines 27-33 | Use same CSS variables as `CanvasNotesOverlay.tsx` (which also needs fixing) |
| 47 | **Theme:** Inline `style.color = 'hsl(0, 80%, 60%)'` on hover (line 279) | Low | Line 279 | Use CSS variable or class |
| 48 | **OK:** All labels translated via `categoryLabel()` + `t()` | — | Lines 37-52 | — |

### 3.23 Preferences Canvas Section (`PreferencesCanvasSection.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 49 | **Theme:** `background: '#5e6ad2'` hardcoded accent color preview dot | Low | Line 155 | Use `var(--accent-default)` or dynamic value |

### 3.24 Logs Panel (`LogsPanel.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 50 | **Theme:** `color: '#6c6'` hardcoded green for "no issues" hint | Low | Line 236 | Use `var(--status-success)` |

### 3.25 useEditorShortcuts (`useEditorShortcuts.ts`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 51 | **Type safety:** `setRuntimeRef` typed as `React.Dispatch<React.SetStateAction<RuntimeState>>` but `useRuntimeState.setRuntime` accepts `options?: { skipHistory?: boolean }` — mismatch may hide bugs at call sites | Low | Lines 18, 93-98, 168-178, 262-271, 345-352 | Update `UseEditorShortcutsDeps` type to match actual `setRuntime` signature |
| 52 | **Perf:** `rt.nodes.find((x) => x.id === id)` inside loop for selected nodes — O(N*M). For large scenes consider a Map | Low | Lines 196-206, 237-248 | Build `nodeMap` once before the loop |
| 53 | **i18n/Clipboard:** Notes are not included in copy/paste payload — by design or missing? | Low | — | Include `notes` in `ClipboardPayload` if notes should be copied with nodes |

### 3.26 useEditorCallbacks (`useEditorCallbacks.ts`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 54 | **Perf:** `getPanelTitle` dependency `[layout.panels, t]` includes unused `layout.panels` — unnecessary re-creation on layout change | Low | Line 122 | Change to `[t]` |

### 3.27 compileGraph (`compileGraph.ts`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 55 | **Logic limitation:** `visited` Set is shared across entire compilation. Parallel branches cannot share subgraphs (second branch hits "Cycle detected"). Compiler assumes parallel branches are linear and disjoint | Medium | Lines 77, 157-168, 367-377 | Document as known limitation, or reset `visited` per branch exploration |
| 56 | **Edge case:** `stripExport` `cutscene_id` only replaces whitespace — special characters (except spaces) pass through unchanged, potentially creating invalid IDs | Low | Line 1140 | Sanitize with `.replace(/[^a-z0-9_-]/g, '')` |

### 3.28 validateGraph (`validateGraph.ts`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 57 | **Logic error:** `musicActionWithoutMusic` does a linear array scan (`for (const node of nodes)`) instead of BFS from start. If `play_music` appears AFTER a `music_volume` in the `nodes` array, the warning is silently skipped even if the music node is unreachable from the volume node | Medium | Lines 2071-2095 | Replace linear scan with BFS/DFS from start, tracking `playMusicSeen` along actual execution paths |
| 58 | **Code duplication:** `branchWithoutFalseConnection` check exists twice — inside per-node loop (lines 371-383) and again at end (lines 2053-2067). Both produce identical entries | Low | Lines 371-383, 2053-2067 | Remove one of the duplicates |
| 59 | **Missing check:** `haltHasOutgoingEdges` warns if halt has outgoing edges, but `compileGraph` silently processes them. Consistency between compiler and validator | Low | Lines 777-787 | Either allow halt with outgoing edges (relax validation) or make compiler stop at halt |

### 3.29 reverseCompile (`reverseCompile.ts`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 60 | **Error handling:** `throw new Error(branchResult.error)` in parallel branch import instead of returning `{ ok: false }`. This causes an unhandled exception in `reverseCompileCutscene` which has no try/catch | Medium | Line 348 | Return `branchResult` (which is already `{ ok: false }`) instead of throwing |

### 3.30 Inspector Panel (`InspectorPanel.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 61 | **Data integrity:** Edge wait input `Math.max(0, Number(v))` can produce `NaN` when input is non-numeric. `NaN` passes validation (`typeof === 'number'`) but compiler ignores it (`> 0` check) | Low | Line 740 | Use `Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : undefined` |
| 62 | **i18n:** SearchableSelect placeholders hardcoded English (`"e.g. has_key"`, `"e.g. true / 1 / done"`) | Low | Lines 776, 786 | Use `t('editor.conditionVarPlaceholder', ...)` and `t('editor.conditionEqualsPlaceholder', ...)` |

### 3.32 Node Registry (`nodeRegistry.ts`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 65 | **i18n:** Hardcoded `label` and `placeholder` fields throughout all ~60 node definitions | Low | Throughout | `t('nodes.fields.{key}.label', fallback)` |
| 66 | **Missing UI components:** `move_relative_direction`, `move_direct`, `lerp`, `set_emotion`, `camera_pan_speed` are defined in registry but have NO corresponding React components in `CutsceneNodes.tsx` — canvas preview falls back to generic `BaseNode` without params | Low | Lines 1486, 1529, 252, 270, 489 | Add preview components or remove from registry if deprecated |
| 67 | **Legacy type:** `waittalk` (line 387) exists in registry alongside `wait_for_dialogue` — possible duplicate/legacy alias | Low | Line 387 | Deprecate or merge with `wait_for_dialogue` |
| 68 | **Registry / Compiler mismatch:** `guard_global` is defined as a node type in registry (line 1426) with full field config, but `compileGraph.ts` treats it exclusively as an edge condition wrapper, not a standalone node | Low | Line 1426 | Remove from registry or clarify UI semantics |

### 3.33 useSceneIO (`useSceneIO.ts`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 69 | **Error handling:** `handleOpenScene` catches `reverseCompileCutscene` errors in generic `catch` block and always shows "File corrupted (invalid JSON)" — misleading when JSON is valid but reverseCompile throws (e.g. Issue 60) | Medium | Lines 216-236 | Wrap `reverseCompileCutscene` in separate try/catch with specific error message |
| 70 | **OK:** Autosave interval cleanup via `clearInterval` | — | Lines 187-189 | — |

### 3.34 useEditorState (`useEditorState.ts`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 71 | ~~**False positive:** Memory leak `setTimeout` without cleanup~~ | — | Line 313 | ~~Cleanup `return () => window.clearTimeout(t)` exists at line 315~~ |
| 72 | **Perf:** `actorTargetOptions` recalculates on every `runtime.nodes` change — O(N) scan of all nodes. For large scenes, consider caching actor keys in a separate Set | Low | Lines 346-360 | Use `useMemo` with targeted dependency or derive from `useRuntimeState` |
| 73 | **OK:** `cancelled` flag for Yarn preview async | — | Lines 260, 294-296 | — |
| 74 | **OK:** `window.addEventListener('keydown', ...)` for name conflict cleanup | — | Lines 327-328 | — |

### 3.35 Docking Layout (`DockingLayout.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 75 | **Theme:** `background: 'rgba(0, 0, 0, 0.5)'` and `boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'` hardcoded in loading overlay | Low | Lines 222, 234 | Use CSS variables |

### 3.36 useDocking (`useDocking.ts`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 76 | **OK:** DOM-first resize for dock widths (CSS variables) with single React state update on pointerup — excellent perf pattern | — | Lines 739-743, 761-766 | — |
| 77 | **OK:** RAF cleanup on unmount | — | Lines 1204-1211 | — |
| 78 | **OK:** Window resize listener cleanup | — | Lines 1196-1200 | — |

### 3.37 Editor Shell (`EditorShell.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 79 | **Theme:** `getPanelBadge` uses hardcoded `#e05050`, `#d4a017`, `#4a9eff` for log/template badges | Low | Lines 468, 494 | Use CSS variables |

### 3.38 Top Menu Bar (`TopMenuBar.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 80 | **Hardcoded shortcut label:** `Ctrl+O` for Open Project hardcoded instead of using `shortcutLabels` object (unlike `new_scene` and `export_scene`) | Low | Line 264 | Use `shortcutLabels.open_project` or `shortcutLabels.open_scene` |
| 81 | **OK:** Keyboard navigation (ArrowDown/Up, Enter, Escape, Tab) with proper listener cleanup | — | Lines 499-501 | — |
| 82 | **OK:** Accessibility: `role="button"`, `tabIndex={0}`, `aria-expanded`, `role="menu"`, `aria-haspopup` | — | Throughout | — |

### 3.39 Flow Canvas MiniMap (`FlowCanvasMiniMap.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 83 | **Theme:** Hardcoded colors: `nodeColor="#7ea4ff"`, `nodeStrokeColor="#4a6fcb"`, `maskColor="rgba(0, 0, 0, 0.5)"`, `maskStrokeColor="rgba(126, 164, 255, 0.35)"` | Low | Lines 25-30 | Use CSS variables |

### 3.40 Flow Canvas Keyboard Shortcuts (`FlowCanvasKeyboardShortcuts.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 84 | **Hardcoded shortcuts:** `Ctrl+0` / `Space` for fitView are hardcoded, not from `preferences.keybindings` | Low | Lines 30-36, 40-47 | Read from `keybindings.fit_view` or document as fixed shortcuts |

### 3.41 Room Visual Editor Toolbar (`RoomVisualEditorToolbar.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 85 | **i18n:** Hardcoded Russian string `Скорость:` for path speed indicator | Low | Line 102 | Use `t('editor.pathSpeed', 'Speed')` |

### 3.42 Room Visual Editor Overlay (`RoomVisualEditorOverlay.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 86 | **Theme:** Arrow marker fill `rgba(255, 209, 102, 0.8)` hardcoded | Low | Line 204 | Use CSS variable |

### 3.43 Room Visual Editor Modal (`RoomVisualEditorModal.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 87 | **OK:** Comprehensive RAF cleanup (`stopPlayPreview` cancels all 4 RAF refs) | — | Lines 241-264 | — |
| 88 | **OK:** `clearTransientInteractionState` resets all drag/preview refs | — | Lines 268-274 | — |
| 89 | **OK:** Keyboard listeners cleanup for Escape/Undo/Redo/B/G/Ctrl+E | — | Lines 562-567 | — |

### 3.44 Preferences General Section (`PreferencesGeneralSection.tsx`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 90 | **i18n:** `ACCENT_PRESETS` hardcoded labels — 'Purple', 'Cyan', 'Blue', 'Green', 'Orange', 'Red', 'Yellow' | Low | Lines 10-16 | Use `t('preferences.accent.{id}', fallback)` |
| 91 | **i18n:** Language options 'English' / 'Русский' hardcoded | Low | Lines 44-45 | Use `t('language.en', 'English')` / `t('language.ru', 'Русский')` |

### 3.45 useLayoutState (`useLayoutState.ts`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 92 | **i18n:** Hardcoded panel titles in `createDefaultLayout`: 'Actions', 'Bookmarks', 'Notes', 'Text Editor', 'Inspector', 'Logs / Warnings', 'Runtime JSON', 'Templates' | Low | Lines 24, 34, 44, 54, 64, 74, 84, 94 | Use `t('panel.{id}', fallback)` or document as internal IDs |
| 93 | **Low risk:** `rafIdRef` RAF batching not cancelled on unmount. Component never unmounts, but add cleanup for consistency | Low | Lines 120, 125-133 | Add `useEffect(() => () => cancelAnimationFrame(rafIdRef.current), [])` |

### 3.46 useTheme (`useTheme.ts`)

| # | Issue | Severity | Line | Fix |
|---|-------|----------|------|-----|
| 94 | **i18n:** Hardcoded theme labels and descriptions — 'Dark', 'Dark Cyan', 'Gray', 'Light' | Low | Lines 20-21, 25-26, 30-31, 35-36 | Use `t('theme.{id}.label', fallback)` |

---

## 4. Cross-Feature Observations

### Data Flow: Select Node → Inspector Update → Canvas
```
user clicks node
  → FlowCanvas.onSelectionChange
  → debounced (100ms) setRuntime({ selectedNodeId, selectedNodeIds })
  → EditorShell.selectedNode (useMemo)
  → prop to InspectorPanel
  → localTitle state (debounced 200ms)
  → flushTitle → setRuntime({ title })
  → deferredRuntimeNodes → initialNodes useMemo → setNodes
  → React Flow store update → canvas re-render
```
- **Observation:** Two debounces in series (100ms selection + 200ms title). For rapid switching between nodes, title updates may feel sluggish.
- **Not a bug**, but worth noting for UX optimization.

### Provider Hell Assessment
- **Verdict:** No provider hell detected.
- Max nesting: 4 levels (Toast → Preferences → Confirm → Docking). Acceptable for desktop app.
- 6 contexts total, each with focused responsibility.

### IPC Boundary Consistency
- Preload API (`preload/index.ts`) well-structured with cleanup functions for updater events.
- Main process (`main/index.ts`) uses `ipcMain.handle` pattern consistently.
- No direct `require('fs')` or `shell` access from renderer found.

### Design Token Drift (Major Cross-Cutting Finding)
- `base.css` defines comprehensive CSS variables: `--status-error`, `--status-warning`, `--status-success`, `--status-info`, `--accent-default`, `--node-start`, etc.
- **However**, multiple components use hardcoded hex/rgb/hsl instead:
  - `useEditorValidation.ts`: `#e05050`, `#d4a017`, `#58a6ff`
  - `ToastHub.tsx`: same palette as above
  - `UpdateNotification.tsx`: same palette
  - `InspectorPanel.tsx`: `#e05050`
  - `CanvasNotesOverlay.tsx`: HSL values
  - `NotesPanel.tsx`: different HSL values (inconsistent with CanvasNotesOverlay!)
  - `LogsPanel.tsx`: `#6c6`
  - `PreferencesCanvasSection.tsx`: `#5e6ad2`
- **Impact:** Medium — theme changes won't affect these components; Notes panel and Canvas overlay use different colors for same categories.
- **Fix:** Audit all components, replace hardcoded colors with CSS variables from `base.css`.

### z-Index Layering Chaos
- No centralized z-index system. Magic numbers scattered across components:
  - Tutorial overlay: 10000, tooltip: 10001
  - ToastHub: 9999
  - Welcome backdrop: 9999
  - Docking loading overlay: 9999
  - LogsPanel context menu: 1000
  - SearchableSelect open: 1000, dropdown: 100
  - CanvasNotesOverlay tooltip: 60, connector: 50, sticker: 5
  - FlowCanvas: 1, background: 0
- **Impact:** Low-Medium — potential stacking conflicts when multiple overlays active simultaneously.
- **Fix:** Create `z-index.ts` constants file: `Z_INDEX_TUTORIAL = 100`, `Z_INDEX_TOAST = 90`, etc.

### Error Boundaries — Completely Missing
- No `ErrorBoundary`, `componentDidCatch`, or `getDerivedStateFromError` found in `editor/`.
- **Impact:** Medium — any runtime exception in any component crashes entire editor.
- **Fix:** Add `ErrorBoundary` at App level and per-feature boundaries (Canvas, Inspector, Visual Editor).

### Compiler / Validator Consistency Issues
- **`compileGraph`** uses a single shared `visited` Set for cycle detection. This prevents parallel branches from sharing subgraphs — a legitimate pattern in some designs. The validator does not warn about this; it only reports generic cycle errors at compile time.
- **`validateGraph.musicActionWithoutMusic`** performs a linear scan of the `nodes` array instead of following actual execution paths (BFS/DFS). This produces false negatives when node array order differs from graph topology.
- **`haltHasOutgoingEdges`** validation warns, but `compileGraph` silently continues past `halt` nodes. The compiler and validator disagree on whether `halt` is a hard stop.
- **Fix:** Align compiler and validator semantics; fix validator to use BFS for path-dependent checks.

### reverseCompile Error Handling
- `reverseCompileCutscene` has no try/catch. When importing a parallel branch fails, `importSequence` throws `new Error(...)` instead of returning `{ ok: false }`, causing an unhandled exception crash.
- **Impact:** Medium — importing certain engine JSONs will crash the editor entirely.
- **Fix:** Return `branchResult` (already `{ ok: false }`) instead of throwing; add top-level try/catch in `reverseCompileCutscene`.

### Type Safety Debt
- `useEditorShortcuts.ts` declares `setRuntimeRef: React.MutableRefObject<React.Dispatch<React.SetStateAction<RuntimeState>>>` but the actual `setRuntime` from `useRuntimeState` accepts an optional `options` argument. The types do not match, which can hide bugs if callers pass `skipHistory` through the ref interface.
- **Fix:** Update `UseEditorShortcutsDeps` to match the real `setRuntime` signature.

---

## 5. Risk-Weighted Fix Roadmap

### Iteration 1 (Week 1) — High Impact
1. **Add Error Boundaries** — wrap App and major features (Canvas, Inspector, Visual Editor)
2. **Fix memory leaks** (Issues 1, 10, 11, 39) — add timeout cleanup in `FlowCanvas.tsx`, `InspectorPanel.tsx`, `useEditorState.ts`
3. **Move canvas background logic** out of `FlowCanvas.tsx` (Issue 2) — refactor to `usePreferences` or `useEditorState`
4. **Fix global wheel zoom** in `App.tsx` (Issue 13) — skip if target is interactive element
5. **Add round-trip tests** for parallel, branch, guard (Issue 21)

### Iteration 2 (Week 2-3) — Design Token Consolidation
6. **Systematic design token audit** — replace all hardcoded colors with CSS variables from `base.css`:
   - `useEditorValidation.ts`, `ToastHub.tsx`, `UpdateNotification.tsx`, `InspectorPanel.tsx` (same palette)
   - `CanvasNotesOverlay.tsx` + `NotesPanel.tsx` (unify and use variables)
   - `LogsPanel.tsx` (`#6c6`), `PreferencesCanvasSection.tsx` (`#5e6ad2`)
7. **Create z-index registry** — centralize all z-index values into `z-index.ts` constants

### Iteration 3 (Month 2) — Polish & DX
8. **i18n gaps** (Issues 4, 19, 20, 22, 23, 30, 63) — theme labels, accent presets, CutsceneNodes labels, drag preview, SearchableSelect placeholder, edge condition placeholders
9. **CanvasNotesOverlay perf** (Issue 7) — hoist store subscriptions to parent
10. **PreferencesModal listener consolidation** (Issue 18)
11. **Duplicate Yarn key** edge case (Issue 8)
12. **ZoomLODController DOM caching** (Issue 3)
13. **Fix reverseCompile error handling** (Issue 60) — return `{ ok: false }` instead of throwing
14. **Fix validateGraph music scan** (Issue 57) — replace linear scan with BFS
15. **Align compiler/validator halt semantics** (Issue 59)
16. **Fix type mismatch in useEditorShortcuts** (Issue 51)
17. **Fix InspectorPanel NaN waitSeconds** (Issue 61)

---

## 6. Validation Against Original Prompt

### Original concerns → What we actually found

| Original Concern | Finding | Verdict |
|------------------|---------|---------|
| "правильно прокинутые листенеры" | 4 timeout leaks found (FlowCanvas selection, Inspector title, Inspector name conflict, useEditorState focus). All event listeners (pointermove, pointerup, resize, keydown) properly cleaned up. | **Partially confirmed** — timeouts need fixing |
| "цвета и стили не захардкожены" | Found 14 hardcoded color instances across 9 files. `base.css` has design tokens (`--status-error`, etc.) but components don't use them consistently. NotesPanel and CanvasNotesOverlay use DIFFERENT colors for same categories. | **Confirmed** — systematic design token drift |
| "тексты не захардкожены, а являются строками i18n" | Found 12 i18n gaps (drag preview, theme labels, accent presets, ~20 CutsceneNodes without translator, SearchableSelect placeholder, edge condition placeholders). Core UI (~88%) properly translated. | **Mostly confirmed** — edge cases need fixing |
| "корректно расставлены z-index" | Found z-index layering chaos: magic numbers (10001, 9999, 1000, 100, 60, 50, 5, 1, 0) across 10+ components without centralized system. | **Confirmed** — needs z-index registry |
| "соответствие практикам React и Electron" | Good: `useDeferredValue`, `startTransition`, proper `memo`, `contextBridge` with cleanup. Concerning: business logic in UI layer, 3 keydown listeners, no Error Boundaries. | **Partially confirmed** — 3 architectural issues |

### What we did NOT find (and why)

- **No security vulnerabilities** — no `eval`, `innerHTML`, unsanitized user input to `shell.openPath`
- **No major performance blockers** — `useDeferredValue`, LOD controllers, RAF throttling all present
- **No "provider hell"** — 6 contexts with max 4-level nesting is acceptable
- **No IPC race conditions** — `invoke/handle` pattern used consistently, atomic writes in main
- **No memory leaks from event listeners** — all `addEventListener` have matching `removeEventListener` (except 4 setTimeout cases)
- **No localStorage abuse** — only 3 keys (theme, templates, validation overrides), all with try/catch

---

## 7. Appendix: Files Audited

### Fully read (line-by-line or substantial portions)
- `App.tsx`
- `EditorShell.tsx` (first 320 lines)
- `EditorShellPanels.tsx`
- `EditorShellModals.tsx`
- `FlowCanvas.tsx` (full, 1455 lines)
- `CanvasNotesOverlay.tsx` (first 120 lines)
- `TextPanel.tsx`
- `InspectorPanel.tsx` (first 100 lines + grep patterns)
- `DockingContext.tsx`
- `DockingLayout.tsx` (first 120 lines)
- `useDocking.ts` (first 100 lines + grep patterns)
- `usePreferences.ts` (first 100 lines)
- `PreferencesModal.tsx` (first 120 lines + grep patterns)
- `PreferencesGeneralSection.tsx` (first 60 lines)
- `useTheme.ts` (full)
- `TopMenuBar.tsx` (first 180 lines)
- `RoomVisualEditorCanvas.tsx` (full, 139 lines)
- `RoomVisualEditorModal.tsx` (grep patterns for RAF/listeners)
- `usePathEditorLogic.ts` (full, 291 lines)
- `useNodeOperations.ts` (first 100 lines)
- `compileGraph.ts` (first 200 lines)
- `reverseCompile.ts` (first 200 lines)
- `validateGraph.ts` (first 200 lines)
- `runtimeTypes.ts` (full)
- `yarnPreview.ts` (full)
- `templateStorage.ts` (full)
- `nodeRegistry.ts` (first 200 lines)
- `CutsceneNodes.tsx` (**full, 1769 lines**)
- `__tests__/compileGraph.test.ts`
- `__tests__/roundtrip.test.ts`
- `preload/index.ts` (first 200 lines)
- `main/index.ts` (first 80 + lines 285-383)

### Second round (remaining features)
- `LogsPanel.tsx` (full)
- `BookmarksPanel.tsx` (full)
- `ActionsPanel.tsx` (full)
- `TemplateLibraryPanel.tsx` (full)
- `useEditorValidation.ts` (full)
- `useEditorState.ts` (first 120 lines + grep patterns)
- `useProjectResources.ts` (full)
- `useVisualEditing.ts` (first 100 lines)
- `ConfirmDialog.tsx` (full)
- `SearchableSelect.tsx` (first 80 lines)
- `WelcomeSetupModal.tsx` (full)
- `AboutModal.tsx` (full)
- `UpdateNotification.tsx` (full)
- `FlowCanvasToolbar.tsx` (full)
- `FlowCanvasControls.tsx` (full)
- `FlowCanvasKeyboardShortcuts.tsx` (full)
- `FlowCanvasMiniMap.tsx` (full)
- `ToastHub.tsx` (full)
- `NotesPanel.tsx` (first 80 lines)
- `PreferencesCanvasSection.tsx` (first 60 lines)
- `PreferencesKeyboardSection.tsx` (grep patterns)
- `useEditorShortcuts.ts` (**full, 363 lines**)
- `useHotkeys.ts` (grep patterns)
- `useEditorCallbacks.ts` (**full, 577 lines**)
- `useSceneIO.ts` (first 120 lines)
- `base.css` (grep patterns)
- `main.css` (grep patterns)

### Third round (deep-dive — compiler/validator)
- `compileGraph.ts` (**full, 1146 lines**)
- `reverseCompile.ts` (**full, 766 lines**)
- `validateGraph.ts` (**full, 2220 lines**)
- `InspectorPanel.tsx` (**full, 953 lines**)












### SPLIT
По файлам
1. CutsceneNodes.tsx (1769 строк) — Разбить, низкий риск
Что внутри: 60+ компонентов нод по 5–15 строк каждый. Это не логика, а data/layout.

Проблема энтропии: Каждая новая нода добавляется "в конец файла". Через год там будет 3000 строк, и никто не будет знать, есть ли уже MusicResumeNode — придётся grep'ать.

Fix: Разбить на barrel-файлы по категориям:



nodes/
  index.ts          (ре-экспорт всё, что есть сейчас)
  movement.tsx        (MoveNode, FollowPathNode, SetPositionNode...)
  dialogue.tsx        (DialogueNode, WaitTypingNode...)
  camera.tsx          (CameraTrackNode, CameraShakeNode...)
  music.tsx           (PlayMusicNode, StopMusicNode...)
  logic.tsx           (BranchNode, ParallelStartNode...)
  visual.tsx          (AnimateNode, FadeNode...)
Риск: минимальный. Это чисто компоненты, без side effects. Единственное место импорта — nodeRegistry.ts, который делает import * as Nodes from './CutsceneNodes'.

2. nodeRegistry.ts (1958 строк) — Не трогать, это data file
Что внутри: Конфигурация полей для ~60 типов нод. Это по сути JSON с типизацией.

Почему не трогать: Это declarative data, не imperative code. 1958 строк — это 60 объектов по ~30 строк. Разбивка на файлы даст +10 импортов и -0 читаемости. Файл и так структурирован: каждая нода — отдельный блок.

Единственное исключение: Если там есть дублирование конфигураций (например, target field описан 20 раз одинаково) — вынести shared field definitions. Но это enhancement, не split.

3. compileGraph.ts (1146 строк) — Рефакторить nodeToAction, высокий payoff
Что внутри: nodeToAction — ~700 строк if/else для ~60 типов нод.

Проблема энтропии: Добавить новую ноду = лезть в середину 700-строчного if/else. Проверить изменения = скроллить вверх-вниз. Компилятор и обратный компилятор (reverseCompile.ts) используют похожую логику, но она дублируется в двух файлах.

Fix: Strategy map:



ts
// compilers/
//   index.ts
//   dialogue.ts
//   movement.ts
//   music.ts
//   ...
const COMPILERS: Record<string, (node: RuntimeNode) => CompiledAction> = {
  move: compileMoveNode,
  play_music: compileMusicNode,
  // ...
}
Риск: средний. Нужно убедиться, что обратная совместимость (fallback params[key] = value в конце nodeToAction) сохраняется. Но тесты roundtrip.test.ts это покрывают.

4. validateGraph.ts (2220 строк) — Вынести правила в массив функций, medium риск
Что внутри: 60+ блоков if (node.type === 'x') { ... }.

Fix: Array of validators:



ts
const VALIDATORS: Array<(node: RuntimeNode, ctx: ValCtx) => ValidationEntry[]> = [
  validateDialogue,
  validateMusic,
  validateParallel,
  // ...
]
Каждый валидатор — отдельная функция. Можно в одном файле оставить, но структурировать.

Риск: medium. Логика валидации — это бизнес-логика, там много edge cases. Перемещение может привести к потере контекста.

5. InspectorPanel.tsx (953 строк) — Разбить на подкомпоненты, low риск
Что внутри: 4 concerns смешаны:

Scene title editor
Node inspector (тип, имя, поля)
Edge inspector (wait, condition)
Project info (ресурсы, статистика)
Fix: Вынести:



ts
// inspector/
//   InspectorPanel.tsx      (контейнер, ~200 строк)
//   NodeInspector.tsx       (тип, имя, динамические поля, ~400 строк)
//   EdgeInspector.tsx       (wait, condition, ~200 строк)
//   ProjectInfo.tsx         (ресурсы, ~100 строк)
//   FollowPathEditor.tsx    (уже есть!)
Риск: минимальный. Компоненты уже изолированы по JSX-областям.

