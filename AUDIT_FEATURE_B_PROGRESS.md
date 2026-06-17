# Feature-Based Audit — Progress Report

> Дата: 2026-06-16
> Аудитор: Devin (ручное исследование, без сабагентов)
> Подход: B — Feature-based audit

---

## 1. Feature Map (составлена)

| # | Feature | Data Files | Logic Files | UI Files | IPC? | Contexts |
|---|---------|-----------|-------------|----------|------|----------|
| 1 | **App Shell** | — | App.tsx | App.tsx | No | Toast, Preferences, Confirm |
| 2 | **Editor Shell** | runtimeTypes.ts | EditorShell.tsx, useEditorState.ts, useEditorCallbacks.ts | EditorShell.tsx, EditorShellPanels.tsx, EditorShellModals.tsx | No | Docking |
| 3 | **Canvas / Flow** | runtimeTypes.ts | useNodeOperations.ts, FlowCanvas.tsx | FlowCanvas.tsx, CustomEdge.tsx | No | NodeActions |
| 4 | **Node Palette** | nodeRegistry.ts | useNodeOperations.ts | ActionsPanel.tsx | No | — |
| 5 | **Inspector** | nodeRegistry.ts, runtimeTypes.ts | useEditorValidation.ts | InspectorPanel.tsx | No | Preferences |
| 6 | **Bookmarks** | runtimeTypes.ts | — | BookmarksPanel.tsx | No | — |
| 7 | **Text / Yarn Preview** | yarnPreview.ts | yarnPreview.ts, useProjectResources.ts | TextPanel.tsx | No (reads project files) | — |
| 8 | **Logs / Validation** | validateGraph.ts | useEditorValidation.ts | LogsPanel.tsx | No | — |
| 9 | **Notes** | runtimeTypes.ts | useEditorCallbacks.ts | NotesPanel.tsx, CanvasNotesOverlay.tsx | No | — |
| 10 | **Templates** | templateStorage.ts | useEditorCallbacks.ts | TemplateLibraryPanel.tsx | No | localStorage |
| 11 | **Menu Bar** | — | useSceneIO.ts, useEditorShortcuts.ts | TopMenuBar.tsx | Yes (save, open, export) | Preferences |
| 12 | **Docking / Layout** | layoutTypes.ts, dockingConstants.ts | useDocking.ts, useLayoutState.ts | DockingLayout.tsx, DockPanel.tsx | Yes (layout.json IPC) | Docking |
| 13 | **Preferences** | usePreferences.ts | usePreferences.ts | PreferencesModal.tsx (+ 3 sections) | Yes (prefs.json IPC) | Preferences |
| 14 | **Visual Room Editor** | RoomVisualEditorTypes.ts | useVisualEditing.ts, usePathEditorLogic.ts, useActorEditorLogic.ts | RoomVisualEditor*.tsx (7 files) | Yes (screenshot bundles) | — |
| 15 | **Export / Compile** | compileGraph.ts, reverseCompile.ts | useSceneIO.ts, compileGraph.ts | — (menu callback) | Yes (save JSON) | — |
| 16 | **Project Loading** | useProjectResources.ts | main/index.ts (parseYypResources) | — | Yes (open .yyp) | — |
| 17 | **Auto-save** | useSceneIO.ts | useSceneIO.ts | — | Yes (autosave IPC) | — |
| 18 | **Tutorials** | tutorialConstants.ts | useEditorState.ts | TutorialOverlay.tsx | No | — |
| 19 | **Welcome** | usePreferences.ts | — | WelcomeSetupModal.tsx | No | Preferences |
| 20 | **Update Check** | updater.ts | — | UpdateNotification.tsx | Yes (updater IPC) | — |
| 21 | **Shortcuts / Hotkeys** | usePreferences.ts (keybindings) | useHotkeys.ts, useEditorShortcuts.ts | — | No | — |

### Context Hierarchy (Provider nesting)

```
App.tsx
  └── ToastProvider
        └── PreferencesProvider
              └── ConfirmProvider
                    └── EditorShell (или VisualEditorWindowApp)
                          └── DockingProvider
                                └── EditorShellInner
                                      ├── FlowCanvas (via DockingLayout)
                                      │     └── NodeActionsProvider (inside ReactFlowProvider)
                                      ├── TopMenuBar
                                      └── EditorShellPanels (7 panels)
                                      └── EditorShellModals (5+ modals)
```

**6 Contexts total:** ToastHub, PreferencesContext, PanelDataContext, NodeActionsContext, DockingContext, ConfirmContext.

---

## 2. Deep-Dive: Canvas / Flow Editor

**Files audited:** FlowCanvas.tsx (1455 lines), CustomEdge.tsx, CanvasNotesOverlay.tsx

### Findings

#### [BUG] Memory leak: `selectionTimeoutRef` не очищается при unmount
- **File:** `FlowCanvas.tsx`, line 1141, 1177-1183
- **Problem:** `handleSelectionChange` создаёт `window.setTimeout` с `selectionTimeoutRef`. Если компонент размонтируется во время debounce (100ms), callback всё равно сработает. Ref `onSelectNodesRef` стабилен, но это неочищенный таймер.
- **Impact:** Low — не крешит, но утечка таймера.
- **Fix:** Добавить cleanup в return useEffect компонента или в `useEffect(() => () => { if (selectionTimeoutRef.current) clearTimeout(...) })`.

#### [BUG] Business logic просочилась в UI-слой: Canvas меняет preferences
- **File:** `FlowCanvas.tsx`, lines 282-314 (canvasBackgroundUrl effect)
- **Problem:** При ошибке чтения фонового изображения canvas вызывает `updatePreferencesFromContext({ canvasBackgroundPath: null })`. Canvas-компонент не должен менять preferences — это нарушает separation of concerns.
- **Impact:** Medium — side effect в неправильном слое, может привести к race condition (canvas сбрасывает путь, пока preferences modal открыт).
- **Fix:** Вынести логику загрузки фона в `usePreferences` или `useEditorState`. Canvas должен только уведомлять о ошибке через callback.

#### [PERF] DOM query на каждом frame zoom
- **File:** `FlowCanvas.tsx`, line 172 (`ZoomLODController`)
- **Problem:** `document.querySelector('.react-flow')` в `useEffect` при каждом изменении zoom < 0.4 threshold. Можно было закешировать ref один раз при mount.
- **Impact:** Low — query быстрый, но лишняя работа на каждом frame при zoom wheel.
- **Fix:** Использовать `useRef` для корневого элемента React Flow или закешировать `querySelector` результат.

#### [i18n] Hardcoded string в drag preview
- **File:** `FlowCanvas.tsx`, line 1332
- **Problem:** `"Drop note"` — не переведено.
- **Impact:** Low — только для английского UI.
- **Fix:** `t('editor.dropNotePreview', 'Drop note')`

#### [a11y] `onFocusNode` prop в FlowCanvas — неясно использование
- **File:** `FlowCanvas.tsx`, prop declared but passed only to `CanvasNotesOverlay`
- **Problem:** Prop `onFocusNode` объявлен в `FlowCanvasProps`, но в `FlowCanvasInner` он не используется напрямую — только прокидывается в `CanvasNotesOverlay`. Это ок, но стоит проверить, используется ли он в `CanvasNotesOverlay`.
- **Check:** В `CanvasNotesOverlay` `onFocusNode` есть в пропсах, используется в `CanvasNoteSticker`.

---

## 3. Deep-Dive: Notes (CanvasNotesOverlay)

**Files audited:** CanvasNotesOverlay.tsx

### Findings

#### [UI/THEME] Hardcoded HSL цвета для категорий заметок — не адаптируются к теме
- **File:** `CanvasNotesOverlay.tsx`, lines 8-22
- **Problem:** `CATEGORY_BG` и `CATEGORY_BORDER` используют статические `hsl(...)` значения. На тёмной теме светлые `hsl(200, 90%, 88%)` будут слепить, а на светлой — `hsl(0, 100%, 88%)` (warning) может быть нечитаем.
- **Impact:** Medium — визуальная деградация при смене темы.
- **Fix:** Заменить на CSS variables: `var(--note-acting-bg)`, `var(--note-acting-border)` и т.д. Добавить в `useTheme.ts` / CSS.

#### [PERF] `useStore` подписки в каждом стикере
- **File:** `CanvasNotesOverlay.tsx`, line 80-81
- **Problem:** Каждый `CanvasNoteSticker` подписывается на `useStore((s) => s.nodes)` и `useStore((s) => s.transform)`. При 50+ заметках это 100 подписок на Zustand store.
- **Impact:** Medium — при pan/zoom ВСЕ стикеры перерисовываются, даже если не snapped to node.
- **Fix:** Вынести transform в родительский компонент и передавать через context/props. Или использовать `useStore` с селекторами только для snapped notes.

---

## 4. Deep-Dive: Text / Yarn Preview

**Files audited:** TextPanel.tsx, yarnPreview.ts

### Findings

#### [BUG] Duplicate key prop risk
- **File:** `TextPanel.tsx`, line 79
- **Problem:** `key={entry.title}` — если в одном Yarn-файле две ноды с одинаковым title (malformed или edge case), React выдаст warning и сломает reconciliation.
- **Impact:** Low — редкий edge case.
- **Fix:** Использовать `index` как fallback: `key={\`yarn-node-${index}-${entry.title}\`}` или добавить index из parser.

#### [i18n] ✅ Full coverage
- **File:** `TextPanel.tsx`
- **Result:** Все пользовательские строки переведены через `t()`. Нет hardcoded UI-строк.

---

## 5. Deep-Dive: Inspector Panel

**Files audited:** InspectorPanel.tsx (начало, 100 строк)

### Findings

#### [BUG] Memory leak: `titleTimeoutRef` не очищается при unmount
- **File:** `InspectorPanel.tsx`, lines 54, 61, 73-78
- **Problem:** `debounceTitle` создаёт `window.setTimeout` на 200ms. Если InspectorPanel размонтируется во время debounce (например, пользователь быстро сменил выбор ноды), `flushTitle` вызовет `setRuntime` на несуществующем замыкании или с устаревшим `titleTimeoutRef`.
- **Impact:** Medium — может привести к stale state update.
- **Fix:** Добавить cleanup в useEffect: `useEffect(() => () => { if (titleTimeoutRef.current) window.clearTimeout(titleTimeoutRef.current) }, [])`

---

## 6. Deep-Dive: App Shell (Zoom)

**Files audited:** App.tsx

### Findings

#### [BUG] Global wheel zoom перехватывает ВСЕ Ctrl+Wheel на странице
- **File:** `App.tsx`, lines 80-95
- **Problem:** `window.addEventListener('wheel', handleWheel, { passive: false })` перехватывает ВСЕ wheel events с зажатым Ctrl на уровне window. Внутренние scrollable элементы (textarea, dropdown с длинным списком, CodeMirror) не могут нормально zoom/scroll, если пользователь случайно зажал Ctrl.
- **Impact:** Medium — конфликт с нативным поведением браузера.
- **Fix:** Проверять `event.target` — если курсор над `textarea, input, select, [contenteditable]`, не вызывать `preventDefault()`.

---

## 7. Cross-Feature Observations

### Context "Provider Hell" — не обнаружен
- Всего 6 контекстов, вложенность максимум 4 уровня (Toast → Preferences → Confirm → Docking). Это приемлемо.

### Data Flow: выбрал ноду → открыл inspector
- `runtime.selectedNodeId` → `selectedNode` (useMemo в EditorShell) → prop в InspectorPanel → `localTitle` state с debounce → `flushTitle` → `setRuntime` → `runtime.title`. Путь длинный, но логичный. Есть debounce для title — хорошо.

### Data Flow: изменил поле в inspector → обновился canvas
- `updateNode` в InspectorPanel → `setRuntime` → `runtime.nodes` → `deferredRuntimeNodes` (useDeferredValue) → `initialNodes` (useMemo) → `setNodes` → React Flow store → canvas update. Есть `useDeferredValue` для batching — хорошо.

### i18n Gaps (предварительно)
- `FlowCanvas.tsx` drag preview: `"Drop note"` — hardcoded
- `CutsceneNodes.tsx` (из прошлой проверки): `SetPositionNode`, `SetPositionRelativeNode`, `ActorCreateNode`, `ActorDestroyNode`, `SetAnimationFrameNode` и др. — нет `t()` для label'ов
- `nodeRegistry.ts` — поля `label` и `placeholder` не через i18n
- `useTheme.ts` — theme labels (`'Dark'`, `'Dark Cyan'`, `'Gray'`, `'Light'`) и descriptions — не переведены
- `PreferencesGeneralSection.tsx` — accent color preset labels (`'Purple'`, `'Cyan'`, `'Blue'` и т.д.) — не переведены

### z-index Observations
- `FlowCanvas.tsx` line 52: `RF_STYLE = { ..., zIndex: 1 }`
- `FlowCanvas.tsx` line 1346: `zIndex: 0` для background layer
- `CanvasNotesOverlay.tsx` — не проверено, но overlay должен быть поверх canvas (zIndex > 1)
- Нужно проверить, нет ли конфликтов между drag preview (line 1321), background layer, и React Flow internal layers.

---

## 8. Deep-Dive: Inspector Panel (continued)

### Findings

#### [BUG] Memory leak: `setNameConflictModal` через setTimeout без cleanup
- **File:** `InspectorPanel.tsx`, line 217-218
- **Problem:** Внутри `setRuntime` callback вызывается `window.setTimeout(() => setNameConflictModal(...))`. Если компонент размонтируется до срабатывания таймера, `setNameConflictModal` вызовется на unmounted state.
- **Impact:** Medium — stale state update, возможно React warning.
- **Fix:** Сохранить ref на таймер и очистить в cleanup useEffect.

#### [THEME] Hardcoded error color `#e05050`
- **File:** `InspectorPanel.tsx`, lines 634, 878
- **Problem:** Красный цвет для невалидных значений захардкожен. Не адаптируется к теме (например, в light theme этот красный может быть слишком агрессивным).
- **Impact:** Low — визуальный.
- **Fix:** `var(--error-color)` или `var(--inspector-error-border)`.

---

## 9. Deep-Dive: Docking System

**Files audited:** DockingLayout.tsx, useDocking.ts, DockingContext.tsx

### Findings

#### [OK] Listeners cleanup — корректен
- `useDocking.ts`: все `window.addEventListener('pointermove')`, `'pointerup'`, `'resize'` имеют парные `removeEventListener` в cleanup.
- `requestAnimationFrame` refs (`dragRafRef`, `resizeFrameId`) отменяются в cleanup.
- **Verdict:** No memory leaks found in docking event handling.

---

## 10. Deep-Dive: Visual Room Editor

**Files audited:** RoomVisualEditorModal.tsx (начало), RoomVisualEditorCanvas.tsx

### Findings

#### [OK] RAF cleanup — корректен
- `RoomVisualEditorModal.tsx`: 4 RAF refs (`playPreviewFrameRef`, `pathPreviewRafRef`, `actorDragRafRef`, `viewportPanRafRef`). Все отменяются в `stopPlayPreview` и в cleanup effects.
- `window.addEventListener('keydown', onKeyDown, true)` — cleanup есть.

#### [PERF] RoomVisualEditorCanvas LRU cache — data URLs не освобождаются
- **File:** `RoomVisualEditorCanvas.tsx`, lines 98-110
- **Problem:** `canvas.toDataURL('image/png')` создаёт data URL, который кешируется в `stitchedRoomCacheRef` (max 8 entries). При удалении oldestKey вызывается только `Map.delete()`, но `URL.revokeObjectURL` не используется (data URL не требует revocation, но память всё равно занята строкой). Более серьёзно: если `bundle` меняется часто, старые data URL висят в памяти до перезаписи.
- **Impact:** Low-Medium — при работе с множеством комнат может накапливаться память.
- **Fix:** Не критично для data URLs (они не object URLs), но worth noting.

---

## 11. Deep-Dive: Preferences / Theme

**Files audited:** PreferencesModal.tsx, PreferencesGeneralSection.tsx, useTheme.ts

### Findings

#### [a11y] 3 window keydown listeners одновременно
- **File:** `PreferencesModal.tsx`, lines 92, 124, 175
- **Problem:** При открытой модалке на window висят 3 разных `keydown` listener'а: Esc-закрытие, hotkey capture mode (capture phase), focus trap (Tab cycling). В capture mode (строка 124) вызывается `event.preventDefault() + event.stopPropagation()`.
- **Impact:** Low — работает корректно, но overhead. Потенциал для конфликта при добавлении новых listeners.
- **Fix:** Consolidate в один listener с switch по состоянию.

#### [i18n] Theme labels not translated
- **File:** `useTheme.ts`, lines 17-38
- **Problem:** `THEMES[].label` и `THEMES[].description` — hardcoded English strings. В dropdown выбора темы отображаются непереведённые названия.
- **Impact:** Low — не критично для функциональности, но нарушает i18n completeness.
- **Fix:** `t('theme.dark.label', 'Dark')` etc.

#### [i18n] Accent color preset labels not translated
- **File:** `PreferencesGeneralSection.tsx`, lines 9-17
- **Problem:** `ACCENT_PRESETS[].label` — `'Purple'`, `'Cyan'` и т.д. — hardcoded.
- **Impact:** Low.
- **Fix:** `t('accent.purple', 'Purple')` etc.

---

## 12. Deep-Dive: Export / Compile (Tests)

**Files audited:** `__tests__/compileGraph.test.ts`, `__tests__/roundtrip.test.ts`

### Findings

#### [TEST] Round-trip test существует, но coverage narrow
- **File:** `roundtrip.test.ts`
- **Problem:** Единственный тест проверяет linear сцену (start → wait → move → end). Нет тестов на:
  - parallel branches
  - guard_global / edge conditions
  - branch (true/false)
  - mark_node / jump
  - wait_until_true
  - Complex nested structures
- **Impact:** Medium — компилятор и reverse compiler протестированы только на happy path.
- **Fix:** Добавить тесты для всех типов нод и структур графа.

---

## Сводная таблица всех находок (по severity)

| # | Фича | Проблема | Severity | Тип |
|---|------|----------|----------|-----|
| 1 | Canvas | `selectionTimeoutRef` не очищается при unmount | Low | Memory leak |
| 2 | Canvas | Canvas меняет preferences при ошибке фона | Medium | Business logic in UI |
| 3 | Canvas | `document.querySelector` на каждом zoom frame | Low | Perf |
| 4 | Canvas | `"Drop note"` hardcoded | Low | i18n |
| 5 | Notes | HSL цвета категорий не адаптируются к теме | Medium | UI/Theme |
| 6 | Notes | 50+ `useStore` подписок при pan/zoom | Medium | Perf |
| 7 | Yarn Preview | Duplicate `key={entry.title}` risk | Low | React key |
| 8 | Inspector | `titleTimeoutRef` не очищается при unmount | Medium | Memory leak |
| 9 | Inspector | `setNameConflictModal` via setTimeout без cleanup | Medium | Memory leak |
| 10 | Inspector | `#e05050` hardcoded error color | Low | Theme |
| 11 | App | Global Ctrl+Wheel перехватывает ВСЕ scrollable | Medium | a11y/UX |
| 12 | Preferences | 3 window keydown listeners одновременно | Low | a11y |
| 13 | Preferences | Theme labels не переведены | Low | i18n |
| 14 | Preferences | Accent preset labels не переведены | Low | i18n |
| 15 | Tests | Round-trip только для linear сцены | Medium | Test coverage |
| 16 | Room Editor | Canvas data URL cache — память растёт | Low | Perf |
| 17 | CutsceneNodes | Несколько нод без `t()` (из прошлого аудита) | Low | i18n |
| 18 | nodeRegistry | `label`/`placeholder` не через i18n | Low | i18n |
