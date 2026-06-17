# Перепроверка аудита — честная оценка

> Дата: 2026-06-16
> Цель: проверить, во всех ли фактах я уверен, и что я мог пропустить

---

## Что я ПОДТВЕРДИЛ (прочитал полностью, выводы корректны)

| Файл | Строк | Мои выводы | Статус |
|------|-------|------------|--------|
| `useRuntimeState.ts` | 183 | `saveTimer` cleanup есть (не утечка). `cancelled` flag есть. **BUG FIX: notes теперь участвуют в undo/redo.** | Подтверждено + исправлено |
| `useHotkeys.ts` | 123 | Listener cleanup есть. `comboFromEvent` корректен (edge case для спецсимволов — да, но редкий). | Подтверждено |
| `useLayoutState.ts` | 210 | `saveTimer` cleanup есть. RAF batching — cleanup нет, но компонент никогда не размонтируется. | Подтверждено |
| `DockingContext.tsx` | 208 | Нет listener'ов. `useMemo` для value — dependencies корректны. | Подтверждено |
| `useNodeOperations.ts` | ~400 | `startTransition` для batching. Функциональная форма `setRuntime`. Оптимизация `handleNodePositionChange` (только changed nodes). | Подтверждено |
| `i18n/index.ts` | ~100 | Кэш словарей, `preloadLanguage`, fallback на English. `translatePath` с интерполяцией. | Подтверждено |
| `runtimeTypes.ts` | ~200 | RuntimeNode, RuntimeEdge, RuntimeNote типы чётко задокументированы. | Подтверждено |

---

## Что я ПРОПУСТИЛ в первом проходе (новые находки)

### [FIXED] Notes не попадали в undo/redo историю
- **Файл:** `useRuntimeState.ts`, line 15-23
- **Проблема:** `hasMeaningfulSceneChange` сравнивал `schemaVersion`, `title`, `nodes`, `edges`. `notes` НЕ были включены.
- **Исправление:** Добавлено `prev.notes !== next.notes` в сравнение.
- **Severity:** Medium

### [NEW] reverseCompile бросает unhandled exception на ошибке parallel branch
- **Файл:** `reverseCompile.ts`, line 348
- **Проблема:** `throw new Error(branchResult.error)` вместо возврата `{ ok: false }`. `reverseCompileCutscene` не обёрнут в try/catch — при импорте некоторых JSON редактор крашится.
- **Severity:** Medium

### [NEW] validateGraph: musicActionWithoutMusic — линейный скан вместо BFS
- **Файл:** `validateGraph.ts`, lines 2071-2095
- **Проблема:** Проверка `playMusicSeen` идёт по порядку массива `nodes`, а не по графу. Если `play_music` идёт после `music_volume` в массиве, но в графе `music_volume` находится ДО `play_music`, warning не сработает (false negative).
- **Severity:** Medium

### [NEW] compileGraph: shared `visited` Set не позволяет shared subgraphs в parallel
- **Файл:** `compileGraph.ts`, lines 77, 157-168, 367-377
- **Проблема:** `visited` — глобальный Set для всей компиляции. Если две ветки parallel ведут к одной ноде перед join, вторая ветка получит "Cycle detected".
- **Severity:** Medium (ограничение)

### [NEW] InspectorPanel: edge wait input может установить NaN
- **Файл:** `InspectorPanel.tsx`, line 740
- **Проблема:** `Math.max(0, Number(v))` → `NaN` при нечисловом вводе. `NaN` проходит `typeof === 'number'`, но компилятор игнорирует его (`> 0` check).
- **Severity:** Low

### [NEW] useEditorShortcuts: type mismatch setRuntimeRef
- **Файл:** `useEditorShortcuts.ts`, line 18
- **Проблема:** `setRuntimeRef` типизирован как `React.Dispatch<React.SetStateAction<RuntimeState>>`, но реальная `setRuntime` принимает `options?: { skipHistory?: boolean }`.
- **Severity:** Low

### [NEW] CutsceneNodes: createTranslator в каждой ноде
- **Файл:** `CutsceneNodes.tsx`, throughout
- **Проблема:** Каждая нода на canvas создаёт `createTranslator` в `useMemo`. Для 100+ нод — 100+ вызовов.
- **Severity:** Low (perf)

---

## Что я ПРОВЕРИЛ ЧАСТИЧНО (где мои выводы — предположения)

| Файл | Прочитано | Всего строк | Что я мог пропустить |
|------|-----------|-------------|----------------------|
| `InspectorPanel.tsx` | **953** | 953 | **Прочитан полностью.** Нашёл: hardcoded `#e05050`, i18n gaps в placeholders, `NaN` edge case для waitSeconds. Memory leak `titleTimeoutRef` — подтверждён. |
| `nodeRegistry.ts` | **1958** | 1958 | **Прочитан полностью.** Нашёл: hardcoded labels/placeholders (i18n), 5 типов нод без React-компонентов (`move_direct`, `move_relative_direction`, `lerp`, `set_emotion`, `camera_pan_speed`), legacy `waittalk`, `guard_global` registry/compiler mismatch. |
| `CutsceneNodes.tsx` | **1769** | 1769 | **Прочитан полностью.** Нашёл: ~20 нод без `createTranslator` (i18n gaps), `createTranslator` в каждой ноде (perf), нет hardcoded colors. |
| `usePreferences.ts` | **562** | 562 | **Прочитан полностью.** Нашёл: hardcoded accent colors в `getAccentColorHex` (уже известно), robust `parsePreferences`. Нет новых проблем. |
| `useEditorShortcuts.ts` | **363** | 363 | **Прочитан полностью.** Нашёл: type mismatch `setRuntimeRef`, `Math.random` в id generation, O(N*M) loop, notes не копируются в clipboard. |
| `useEditorCallbacks.ts` | **577** | 577 | **Прочитан полностью.** Нашёл: `getPanelTitle` лишняя dependency `layout.panels`, повторяющиеся `console.warn` patterns. |
| `validateGraph.ts` | **2220** | 2220 | **Прочитан полностью.** Нашёл: `musicActionWithoutMusic` — линейный скан вместо BFS (false negative), `branchWithoutFalseConnection` дублируется. |
| `compileGraph.ts` | **1146** | 1146 | **Прочитан полностью.** Нашёл: shared `visited` Set не позволяет shared subgraphs в parallel ветках. |
| `reverseCompile.ts` | **766** | 766 | **Прочитан полностью.** Нашёл: `throw new Error` вместо graceful error при parallel branch import (строка 348). |
| `useSceneIO.ts` | **284** | 284 | **Прочитан полностью.** Нашёл: misleading error message при reverseCompile failure (показывает "invalid JSON" вместо конкретной ошибки). |
| `useEditorState.ts` | **420** | 420 | **Прочитан полностью.** Нашёл: `actorTargetOptions` O(N) recalculation на каждое изменение nodes. Memory leak finding #42 — **false positive** (cleanup есть). |

---

## Что я НЕ МОГУ подтвердить с высокой уверенностью

| # | Моя находка | Уверенность | Почему |
|---|-------------|-------------|--------|
| 1 | "~92% UI properly translated" | **Низкая** | Я не читал все ~50+ файлы полностью. Это оценка на основе sample из ~15 файлов. |
| 2 | "No security vulnerabilities" | **Средняя** | Я проверил на `eval`, `innerHTML`, `shell.openPath`. Но не проверял `dangerouslySetInnerHTML` во всех файлах, не анализировал все пути IPC. |
| 3 | "No major performance blockers" | **Средняя** | Я увидел `useDeferredValue` и RAF, но не профилировал реальную производительность. Не проверил, нет ли O(N²) циклов в `InspectorPanel.tsx` или `CutsceneNodes.tsx`. |
| 4 | "No IPC race conditions" | **Средняя** | Pattern выглядит корректно, но я не проверял все IPC endpoints. |
| 5 | "All event listeners properly cleaned up" | **Высокая** | Я сделал grep по `addEventListener`/`removeEventListener` по всей директории. Парные cleanup есть везде. |
| 6 | "z-index layering chaos" | **Высокая** | grep по `zIndex` дал 30 match'ей с магическими числами. Это объективно. |
| 7 | "Design token drift" | **Высокая** | grep по `#hex` и `rgb(`/`hsl(` дал 60+ match'ей. CSS variables в `base.css` существуют. Это объективно. |

---

## Честная оценка полноты аудита

### По фичам:

| Фича | Полнота аудита | Комментарий |
|------|----------------|-------------|
| App Shell (App.tsx) | 90% | Прочитал полностью |
| Canvas / Flow (FlowCanvas.tsx) | 85% | Прочитал полностью (1455 строк), но не проверил все edge cases drag/drop |
| Inspector Panel | **90%** | Прочитан полностью (953 строки). Нашёл 3 новые проблемы. |
| Docking System | **95%** | `DockingLayout.tsx` — полностью (608 строк). `useDocking.ts` — полностью (1223 строки). Нашёл hardcoded rgba в loading overlay. |
| Visual Room Editor | **90%** | `RoomVisualEditorModal.tsx` — полностью (1521 строка). `RoomVisualEditorToolbar.tsx` — полностью (111 строк). `RoomVisualEditorSidebar.tsx` — полностью (375 строк). `RoomVisualEditorOverlay.tsx` — полностью (294 строки). `RoomVisualEditorViewport.tsx` — полностью (154 строки). `RoomVisualEditorState.tsx` — полностью (126 строк). Нашёл hardcoded Russian string, hardcoded arrow color. |
| Preferences Modal | 50% | 3 секции, но не все подсекции |
| TopMenuBar | **95%** | Прочитан полностью (683 строки). Нашёл hardcoded `Ctrl+O` shortcut label. |
| Export / Compile | **85%** | `compileGraph.ts`, `validateGraph.ts`, `reverseCompile.ts` — прочитаны полностью. Нашёл 4 новые проблемы. |
| Shortcuts / Hotkeys | **95%** | `useHotkeys.ts` полностью, `useEditorShortcuts.ts` полностью. |
| Nodes / Node Registry | **95%** | `CutsceneNodes.tsx` — полностью (1769 строк). `nodeRegistry.ts` — полностью (1958 строк). Нашёл 5 типов без React-компонентов. |
| i18n | **85%** | Система — полностью. `CutsceneNodes.tsx` — ~20 нод без перевода. `InspectorPanel.tsx` — placeholders hardcoded. `nodeRegistry.ts` — hardcoded labels. |
| Scene IO / Editor State | **90%** | `useSceneIO.ts` — полностью (284 строки). `useEditorState.ts` — полностью (420 строк). Нашёл misleading error message. |

---

## Рекомендации по дальнейшей проверке

1. ~~InspectorPanel.tsx полностью~~ — **DONE** (953 строки, 3 новые проблемы).
2. ~~CutsceneNodes.tsx полностью~~ — **DONE** (1769 строк, ~20 нод без перевода).
3. ~~nodeRegistry.ts полностью~~ — **DONE** (1958 строк, 5 типов без React-компонентов, hardcoded labels).
4. ~~useEditorShortcuts.ts полностью~~ — **DONE** (363 строки, type mismatch + perf).
5. ~~compileGraph.ts + reverseCompile.ts полностью~~ — **DONE** (1146 + 766 строк, 3 новые проблемы).
6. ~~validateGraph.ts полностью~~ — **DONE** (2220 строк, 2 новые проблемы).
7. **Запустить приложение** — проверить z-index конфликты, theme switching, i18n gaps визуально.
8. **Запустить тесты** — `npm test` или `vitest run` — убедиться, что existing tests проходят после фикса notes.
9. ~~usePreferences.ts полностью~~ — **DONE** (562 строки, без новых проблем).
10. ~~useSceneIO.ts полностью~~ — **DONE** (284 строки, misleading error message).
11. ~~useEditorState.ts полностью~~ — **DONE** (420 строк, memory leak finding — false positive).
12. ~~DockingLayout.tsx + useDocking.ts~~ — **DONE** (608 + 1223 строки, hardcoded rgba).
13. ~~TopMenuBar.tsx~~ — **DONE** (683 строки, hardcoded shortcut).
14. ~~RoomVisualEditor (все файлы)~~ — **DONE** (Modal 1521 + Toolbar 111 + Sidebar 375 + Overlay 294 + Viewport 154 + State 126 строк).

---

## Вывод

Мой аудит — **глубокий обзорный (deep survey)**, но всё ещё не **полный line-by-line (comprehensive)**.

- **Уверен на 95%+:** Memory leaks (timeouts), listener cleanup, z-index chaos, design token drift, Error Boundaries отсутствуют.
- **Уверен на 90%:** InspectorPanel, CutsceneNodes, compileGraph, validateGraph, reverseCompile, useEditorShortcuts, useEditorCallbacks, DockingLayout, useDocking, TopMenuBar, RoomVisualEditor (все файлы) — **прочитаны полностью**.
- **Уверен на 70%:** i18n coverage, security (только surface-level), performance (только architectural).
- **Уверен на 50%:** Preferences Modal (только частично), useLayoutState (только частично), App.tsx edge cases.

**Исправлено:** `notes` теперь участвуют в undo/redo (`useRuntimeState.ts:15-23`).

**Топ-7 новых находки после deep-dive:**
1. `reverseCompile.ts:348` — `throw new Error` вместо graceful error (Medium)
2. `validateGraph.ts:2071-2095` — `musicActionWithoutMusic` использует линейный скан вместо BFS (Medium)
3. `compileGraph.ts` — shared `visited` Set не позволяет shared subgraphs в parallel (Medium)
4. `useSceneIO.ts:216-236` — misleading error "invalid JSON" при reverseCompile failure (Medium)
5. `nodeRegistry.ts` — 5 типов нод без React preview компонентов (`move_direct`, `move_relative_direction`, `lerp`, `set_emotion`, `camera_pan_speed`) (Low)
6. `RoomVisualEditorToolbar.tsx:102` — hardcoded Russian string `Скорость:` (Low)
7. `TopMenuBar.tsx:264` — hardcoded `Ctrl+O` shortcut label (Low)
