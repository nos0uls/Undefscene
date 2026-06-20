# Architectural Review — Undefscene Editor + Undefinedtale-888 Engine

**Дата:** 2025-06-20  
**Область:** `editor-app/src/renderer/src/editor` (TypeScript) + `Undefinedtale888/scripts` (GML)

---

## 1. Баги, исправленные в этом раунде

### 1.1. `play_music` — `volume` игнорировался (GML)

**Проблема:** `nodeRegistry` объявляет поле `volume`, TS compiler отправляет его, но `ActionMusicPlay` и factory не принимали его.

**Исправления:**
- `Undefinedtale888/scripts/scr_cutscene_music/scr_cutscene_music.gml` — `ActionMusicPlay` теперь принимает третий параметр `_volume` и применяет его через `set_music_volume_fade`.
- `cutscene_music_play` wrapper обновлён для передачи `volume`.
- `cutscene_action_factory.gml` — хендлер `play_music` теперь читает `volume` из JSON.

### 1.2. `set_plot` — type mismatch (GML parser)

**Проблема:** `__cutscene_json_get_real` отклонял строковые числа, возвращая `0`.

**Исправление:** `cutscene_load_json.gml` — `__cutscene_json_get_real` теперь пытается распарсить строки через `string_is_real` + `real()`.

### 1.3. Checkpoint restore — музыка не перезапускалась

**Проблема:** `ActionRestoreState` восстанавливал глобалы `current_music_track` и `music_volume`, но трек молча не играл.

**Исправление:** `scr_cutscene_classes.gml` — после восстановления глобалов теперь вызывается `play_music_immediate` для сохранённого трека и `set_music_volume_fade` для громкости.

### 1.4. `FlowCanvas.tsx` — дублированное сравнение

**Проблема:** В `setNodes` callback сравнение выполнялось дважды — в outer и inner if.

**Исправление:** Объединены в один `if` с `isEqualParams(prevParams, nextParams)`.

### 1.5. `useEditorShortcuts.ts` — copy-paste Ctrl+C / Ctrl+X

**Проблема:** ~50 строк дублирующейся логики сбора parallel пар и копирования рёбер.

**Исправление:** Выделена функция `collectClipboardPayload`, возвращающая payload и `selectedSet`. Ctrl+C и Ctrl+X теперь её вызывают.

### 1.6. `detach` — `keep_world_position` (dead code)

**Проблема:** `compileDetach` проверял `keep_world_position`, но это поле не определено в `nodeRegistry`.

**Исправление:** Убран dead code.

### 1.7. `compileSetPlot` — избыточный string fallback

**Проблема:** Компилятор имел defensive check для строки, хотя registry говорит `number`.

**Исправление:** `compileSetPlot` теперь просто `compileBaseNode(node)`.

### 1.8. `compileWaitForInteract` — неявная передача `interact_action`

**Проблема:** Поле `interact_action` передавалось только через `compileBaseNode` fallback.

**Исправление:** Добавлено явное присваивание `interact_action`.

### 1.9. `detach` — `destroy_after_detach` как select с 'true'/'false'

**Проблема:** Несоответствие: редактор хранил строки, компилятор ожидал boolean.

**Исправление:**
- `nodeRegistry.ts` — поле `destroy_after_detach` изменено на `checkbox` с `boolean` default.
- `NodeInspector.tsx` — чекбокс теперь корректно обрабатывает legacy строки 'true'/'false'.

---

## 2. Архитектурные находки и проблемы

### 2.1. `compileBaseNode` — универсальный копировщик без валидации

**Где:** `editor/compiler/utils.ts`

**Проблема:** `compileBaseNode` копирует все `node.params` в `CompiledAction` без проверки типов. Это работает для 30+ нод без явного compiler, но:
- Нет runtime-валидации значений.
- Поддержка legacy/сломанного JSON сдвигается на GML factory.
- Разработчику неочевидно, какие поля обязательны для каждого типа.

**Рекомендация:** Ввести схему валидации на основе `nodeRegistry.fields` — например, `compileNodeWithSchema(node)` или JSON Schema per type.

### 2.2. Boolean-поля реализованы через `select` с 'true'/'false'

**Где:** `editor/nodes/nodeRegistry.ts` (10+ полей)

**Проблема:** Многие булевы флаги (`follow_facing`, `follow_scale`, `pause`, `decay`, `enabled`, `flipped`, `visible`, `autofacing`, `detach_on_cutscene_end`) используют `select` с опциями `['true', 'false']` и строковые `defaultValue`. UI в `NodeInspector` конвертирует их в boolean при изменении, но `defaultParams` создаёт начальное несоответствие типов.

**Риск:**
- Свежесозданные ноды имеют string-значения, а после редактирования — boolean.
- Компиляторы, которые проверяют `typeof ... === 'boolean'`, игнорируют значения по умолчанию.

**Рекомендация:** Мигрировать все чисто boolean поля на `checkbox` с `defaultValue: false/true`. Добавить миграцию в `parseRuntimeState` для старых строковых значений.

### 2.3. Расчёты времени — `seconds` vs `frames` vs `duration_frames`

**Где:** многочисленные TS compilers + GML factory

**Проблема:** Конвертация `seconds` → `frames` дублируется в логике:
- TS compilers для `tween`, `shake_object`, `camera_shake` и др. используют `seconds`.
- GML factory использует `__cutscene_json_get_seconds` и `__cutscene_json_seconds_to_frames`.
- `tween` компилятор использует псевдоним `duration_frames`, который на самом деле содержит `seconds`.

**Рекомендация:** Ввести единый формат JSON — отправлять всегда `seconds` (float), а конвертацию в frames делать только в GML (единый источник истины). Убрать поле `duration_frames` из `tween` compiler.

### 2.4. `target` / `target_ref` — неунифицированная семантика

**Где:** `nodeRegistry` + factory

**Проблема:** Разные ноды используют разные имена для ссылки на актёра:
- `move`, `set_position`, `animate` — `target`
- `detach` — `target_ref`
- `actor_create` — `key`, `actor_key`, `actor_name` (aliases в factory)

Это не баг, но усложняет поддержку и схему валидации.

**Рекомендация:** Ввести конвенцию `target` для всех ссылок на actor/instance. Сохранить `target_ref` как legacy alias в factory.

### 2.5. `compileCheckpointState` — `include_globals` и `include_instances` хранятся как строки

**Где:** `editor/compiler/compilers/control.ts`

**Проблема:** Поля в nodeRegistry — `json` (текстовая строка), компилятор парсит JSON, валидирует массив и отправляет **снова строку**. GML factory читает их как строку и, судя по всему, передаёт дальше как строку.

**Рекомендация:** Если GML ожидает массив, отправлять распарсенный массив. Если GML ожидает строку — убрать JSON-парсинг в TS и переложить валидацию на GML.

### 2.6. `conditionVar` — неявное удаление префикса `global.`

**Где:** `editor/compiler/core.ts` и `compilers/logic.ts`

**Проблема:** Компилятор обрезает `global.` у имени переменной. Это удобно для пользователя, но неявно: если пользователь введёт `global.room_flags`, в JSON уйдёт `var: "room_flags"`. Если GML ожидает имя без префикса — ок, но логика размазана по двум местам.

**Рекомендация:** Вынести нормализацию `global.` в одну функцию `normalizeGlobalVarName(raw)`.

### 2.7. `main/index.ts` — монолит на 1700+ строк

**Где:** `editor-app/src/main/index.ts`

**Проблема:** 37 IPC handlers, window management, menu, auto-updater, visual editor bridge — всё в одном файле.

**Рекомендация:** Разбить на модули:
- `main/ipc/runtime.ts` — IPC для runtime/saving/loading
- `main/ipc/resources.ts` — assets, sprites, rooms
- `main/windowManager.ts` — создание/управление окнами
- `main/visualEditorBridge.ts` — bridge state
- `main/menuBuilder.ts` — menu templates

### 2.8. God components / hooks

**Где:**
- `FlowCanvas.tsx` (~1473 строк)
- `RoomVisualEditorModal.tsx` (~1522 строк)
- `useDocking.ts` (~1224 строк)
- `EditorShell.tsx` (~655 строк, 40+ props)

**Проблема:** Компоненты и хуки разрослись. Хотя логика делегирована в другие хуки, файлы всё равно тяжело навигировать.

**Рекомендация:**
- `useDocking.ts` → разбить на `usePanelDrag`, `usePanelResize`, `useDockLayout`, `useDockDropPreview`.
- `EditorShell.tsx` → внедрить Context или store для editor state, убрать prop drilling.

### 2.9. Edge Condition — wait на ребре vs guard

**Где:** `editor/compiler/core.ts`

**Проблема:** `wrapWithEdgeCondition` оборачивает `wait` в `guard_global`. При `waitSeconds > 0` получается структура `[guard(..., [wait, ...])]`, а при `waitSeconds === 0` — просто `[guard(...)]`. Логика с `shouldGateWholeBranch` и `shouldGateRemainingBranch` дублируется в `compileParallel`, `walkBranchUntil`, `getNextActions` и `compileBranch`.

**Рекомендация:** Вынести единую функцию `combineEdgeWaitAndCondition(edge, actions): CompiledAction[]`.

### 2.10. `suggestUniqueNodeName` — производительность

**Где:** `editor/useNodeOperations.ts`

**Проблема:** При создании ноды строится `Set` всех имён, потом линейный поиск `Node (0)`, `Node (1)`... Для 2000 нод это `O(N^2)` в худшем случае.

**Рекомендация:** Использовать `Set` уже взяток имён + извлечение числовых постфиксов, чтобы найти следующий свободный за `O(N)`.

### 2.11. `compileBaseNode` — `value !== ''` фильтр

**Где:** `editor/compiler/utils.ts`

**Проблема:** `compileBaseNode` отбрасывает пустые строки. Это значит, что если пользователь намеренно установил строковое поле в пустое значение, оно не попадёт в JSON. Для большинства полей это нормально, но для `condition_equals` пустая строка может быть валидным значением.

**Рекомендация:** Добавить параметр `allowEmptyStrings?: string[]` в `compileBaseNode` или перенести фильтрацию в per-type compilers.

### 2.12. `ActionMusicPlay` — `volume` не учитывает fade

**Примечание после исправления:** Новый код применяет громкость через `set_music_volume_fade(volume, 0)` сразу после запуска трека. Если требуется плавное изменение громкости вместе с fade-in, fade_sec должен передаваться и в `set_music_volume_fade`. Это оставлено на дальнейшую доработку UI.

---

## 3. Приоритеты дальнейших улучшений

### Критические
1. Разбить `main/index.ts` на модули.
2. Ввести схему валидации params на основе `nodeRegistry.fields`.
3. Унифицировать boolean-поля (`checkbox` вместо `select` с 'true'/'false').

### Высокий приоритет
4. Унифицировать расчёты `seconds`/`frames` — единый формат `seconds` в JSON.
5. Вынести `wrapWithEdgeCondition` логику в единую функцию.
6. Убрать prop drilling в `EditorShell` через Context/store.

### Средний приоритет
7. Улучшить `suggestUniqueNodeName` для больших сцен.
8. Разбить `useDocking.ts` на более мелкие хуки.
9. Унифицировать имена полей target (`target` vs `target_ref`).

### Низкий приоритет
10. Рассмотреть интеграцию `useHotkeys` для `useEditorShortcuts`.
11. Документировать контракт TS ↔ GML для каждого типа ноды.

---

## 4. Изменённые файлы

- `Undefinedtale-888/Undefinedtale888/scripts/scr_cutscene_music/scr_cutscene_music.gml`
- `Undefinedtale-888/Undefinedtale888/scripts/cutscene_action_factory/cutscene_action_factory.gml`
- `Undefinedtale-888/Undefinedtale888/scripts/cutscene_load_json/cutscene_load_json.gml`
- `Undefinedtale-888/Undefinedtale888/scripts/scr_cutscene_classes/scr_cutscene_classes.gml`
- `Undefscene/editor-app/src/renderer/src/editor/FlowCanvas.tsx`
- `Undefscene/editor-app/src/renderer/src/editor/useEditorShortcuts.ts`
- `Undefscene/editor-app/src/renderer/src/editor/compiler/compilers/logic.ts`
- `Undefscene/editor-app/src/renderer/src/editor/compiler/compilers/control.ts`
- `Undefscene/editor-app/src/renderer/src/editor/nodes/nodeRegistry.ts`
- `Undefscene/editor-app/src/renderer/src/editor/inspector/NodeInspector.tsx`

---

## 6. Архитектурные улучшения, реализованные в этом раунде

### 6.1. `compileGraph.ts` — выделен `buildEdgeActions`

**Проблема:** Логика комбинирования `waitSeconds` + `edge condition` дублировалась в 4 местах: `getNextActions`, `compileParallel`, `walkBranchUntil`, `compileBranch`.

**Исправление:** Добавлена единая функция `buildEdgeActions(edge, innerActions)`, которая собирает `[wait + condition] + innerActions` или оборачивает `innerActions` в `guard_global`. Все 4 места заменены на её вызов.

### 6.2. `normalizeGlobalVarName` — унифицировано удаление `global.`

**Проблема:** Обрезка префикса `global.` дублировалась в `compileGraph.ts` (condition var, end var) и `compileWaitUntil.ts`.

**Исправление:** Добавлена функция `normalizeGlobalVarName` в `compiler/utils.ts`. Используется в `wrapWithEdgeCondition` и `compileWaitUntil`.

### 6.3. `suggestUniqueNodeName` — O(N) вместо O(N²)

**Проблема:** При генерации имени для каждой ноды в сцене из 2000+ нод линейный поиск `Node (0)`, `Node (1)`... мог деградировать до O(N²).

**Исправление:** Функция за один проход по `takenNames` собирает занятые индексы и находит первый свободный.

### 6.4. `compileBaseNode` — `allowEmptyStrings`

**Проблема:** Пустые строки отбрасывались без возможности исключений. Для некоторых полей (`condition_equals` и др.) пустая строка может быть валидным значением.

**Исправление:** Добавлен третий опциональный параметр `allowEmptyStrings?: string[]`. Callers могут явно разрешить пустые строки для нужных ключей.

### 6.5. Boolean select → checkbox

**Проблема:** 10+ boolean-полей использовали `select` с `['true', 'false']`, что создавало тип `string` в `defaultParams` и рассинхронизацию с компиляторами.

**Исправление:** Все такие поля (`follow_facing`, `follow_scale`, `follow_depth`, `detach_on_cutscene_end`, `pause`, `decay`, `enabled` ×3, `flipped`, `visible`, `autofacing`) переведены на `checkbox` с `boolean` default. `NodeInspector.tsx` уже поддерживает legacy строки 'true'/'false'.

### 6.7. `target` / `target_ref` — унификация семантики

**Проблема:** `attach_to_target` и `detach` использовали `target_ref`, в то время как остальные ноды используют `target`.

**Исправление:**
- `nodeRegistry.ts` — поля `attach_to_target` и `detach` переименованы в `target`, `defaultParams` обновлены.
- `compileDetach.ts` — читает `target` вместо `target_ref`.
- `validators/nodeChecks.ts` и `validators/continuity.ts` — проверки обновлены на `target`.
- `nodes/logic.tsx` — preview нод использует `target` и translation key `nodes.fields.target`.
- `cutscene_action_factory.gml` — хендлеры `attach_to_target` и `detach` теперь читают `target`, с fallback на `target_ref` для legacy JSON.
- `reverseCompile.ts` — `target_ref` при импорте старых JSON нормализуется в `target`.

### 6.6. `tween` — унификация `seconds`/`duration_frames`

**Проблема:** `tween` нода использовала поле `duration_frames` (с меткой "Seconds"), а компилятор выводил `duration_frames`, который GML factory трактовал как секунды. `lerp` использовал `seconds`.

**Исправление:**
- `tween` node registry: поле `duration_frames` переименовано в `seconds`, `defaultParams` обновлен.
- `compileTween`: выводит `seconds`; `duration_frames` оставлен как legacy fallback.
- `reverseCompile.ts`: `duration_frames` и `seconds` из engine JSON импортируются в одно поле `seconds` редактора.

### 6.8. `checkpoint_state` — убран двойной JSON-парсинг

**Проблема:** `compileCheckpointState` парсил `include_globals` и `include_instances` в TS, проверял что это массив, но затем отправлял обратно в GML как исходную строку. Дублирование логики и риск рассинхронизации.

**Исправление:** TS-компилятор теперь просто пробрасывает непустую строку в `include_globals`/`include_instances`. GML factory и `ActionCheckpointState` сами выполняют `json_parse`. Обработка ошибок остаётся на стороне движка.

### 6.9. Разбивка `main/index.ts`

**Проблема:** `main/index.ts` был монолитом из 1979 строк и 37+ IPC handlers, смешивая logger, window management, project resources, visual editor, preferences, layout, runtime и т.д.

**Исправление:**
- `src/main/appState.ts` — общее состояние main/visual-editor окон и типы (`VisualEditorBridgeState`, `ActorSpritePreview`), плюс `getLogPath`.
- `src/main/windowManager.ts` — `getDevRendererUrl`, `getRendererUrlForWindow`, `loadRendererWindow`, `createVisualEditorWindow`.
- `src/main/ipc.ts` — все IPC handlers и их helper-функции (project resources, yarn, screenshots, visual editor bridge, preferences, layout, runtime, logs, dev cleanup). Экспортирует `registerIpcHandlers()`.
- `src/main/index.ts` — оставлен logger, `createWindow`, menu handling и bootstrap (`app.whenReady`).
- Тесты `mainUtils.test.ts` обновлены импортировать вспомогательные функции из `ipc.ts`.

`pnpm run typecheck:node`, `pnpm run typecheck:web` и `pnpm run build` проходят.

### 6.10. Уменьшение prop drilling в `EditorShell.tsx`

**Проблема:** `EditorShell` передавал `layout`, `setLayout` и `rootRef` в `EditorShellInner` через props, хотя все три значения уже доступны через `DockingContext`.

**Исправление:**
- `EditorShellInner` теперь получает `layout`, `setLayout`, `rootRef` через `useDockingContext()`.
- Убраны `EditorShellInnerProps` и соответствующие prop drilling.
- `src/renderer/src/editor/EditorShell.tsx` стал чище на уровне внешнего/внутреннего компонента.

### 6.11. Разбиение `useDocking.ts`

**Проблема:** `useDocking.ts` был файлом из 1224 строк, смешивающим drag, resize, layout-операции и drop preview.

**Исправление:**
- `src/renderer/src/editor/dockingUtils.ts` — чистые helper-функции (`clamp`, `removeFromAllSlots`, `insertIntoSlot`, `enforceSlotCapacity`, `getDockHitTestRect`, `getHoverSlotAtPoint`, `getFloatingPositionAtPoint`, `getInsertIndexForSlot`, `getVerticalDockRenderState`, `getDockedPanelStyle`).
- `src/renderer/src/editor/useDockDropPreview.ts` — preview DOM + RAF.
- `src/renderer/src/editor/usePanelDrag.ts` — `startPanelDrag` и drag-эффект.
- `src/renderer/src/editor/usePanelResize.ts` — `startResizeDrag` и resize-эффект.
- `src/renderer/src/editor/useDockLayout.ts` — `togglePanel`, `togglePanelCollapse`, `isPanelVisible`, render helpers, window resize-эффект.
- `src/renderer/src/editor/useDocking.ts` — удалён.
- Потребители `EditorShell.tsx` и `DockingLayout.tsx` обновлены на прямой импорт нужных хуков.

---

## 7. Оставшиеся крупные рефакторы

- Все запланированные крупные рефакторы из `ARCHITECTURAL_REVIEW.md` выполнены.

---

## 8. Что НЕ было исправлено

- **Electron sandbox (`main/index.ts`)** — требует ручного тестирования preload и безопасности. Оставлено как TODO с приоритетом high.
