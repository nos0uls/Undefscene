# Undefscene + Undefinedtale-888 — Code Audit Findings

**Дата:** 2025-01  
**Аудитор:** Cascade AI  
**Область:** `editor-app/src` (TypeScript) + `Undefinedtale888/scripts` (GML)

---

## 1. TODO / FIXME / HACK / XXX

### TypeScript (`editor-app/src`)

| Файл | Строки | Описание |
|------|--------|----------|
| `main/index.ts` | 1138, 1185 | `sandbox: false` — должен быть `true`, но `@electron-toolkit/preload` не резолвится в sandboxed renderer. **Безопасность:** потенциальная уязвимость, sandbox отключён. |

### GML (`Undefinedtale888/scripts`)

| Файл | Строки | Описание |
|------|--------|----------|
| `scr_cutscene_classes.gml` | 3208 | `// TODO: перезапустить трек если нужно` — после восстановления `global.music_volume` трек не перезапускается. |
| `scr_inventory_init.gml` | 20 | `// TODO: удалить после полной миграции меню и сохранений.` — старые глобалы временно оставлены. |

### Third-party (исключены)

- `scribble` — 1 TODO (генерация глифов)
- `Chatterbox` — нет TODO

---

## 2. TS ↔ GML Соответствие: nodeRegistry → compilers → factory → classes

### 2.1. Архитектура пайплайна

```
nodeRegistry.ts (определение нод и полей)
  ↓
compilers/*.ts (компиляция params → JSON action)
  ↓
core.ts COMPILERS map (маппинг type → compile-функция)
  ↓ [fallback: compileBaseNode — копирует все params как есть]
cutscene_action_factory.gml (парсинг JSON → GML action class)
  ↓
scr_cutscene_classes.gml / scr_cutscene_music.gml (GML классы)
```

### 2.2. Полная таблица соответствий

| Node Type (Registry) | Compiler (TS) | Factory Handler (GML) | GML Class | Статус |
|---------------------|---------------|----------------------|-----------|--------|
| `wait` | — (baseNode) | `wait` | `ActionWait` | ✅ |
| `move` | — (baseNode) | `move` | `ActionMove` | ✅ |
| `move_relative` | `compileMoveRelative` | `move_relative` | `ActionMoveRelative` | ✅ |
| `move_relative_direction` | — (baseNode) | `move_relative_direction` | `ActionMoveRelativeDirection` | ✅ |
| `move_direct` | — (baseNode) | `move_direct` | `ActionMoveDirect` | ✅ |
| `set_position` | — (baseNode) | `set_position` | `ActionSetXY` | ✅ |
| `set_position_relative` | `compileSetPositionRelative` | `set_position_relative` | `ActionSetPositionRelative` | ✅ |
| `follow_path` | `compileFollowPath` | `follow_path` | `ActionFollowPath` | ✅ |
| `jump` | `compileJump` | `jump` | `ActionJump` | ✅ |
| `actor_create` | — (baseNode) | `actor_create` | `ActionActorCreate` | ✅ |
| `actor_destroy` / `destroy_entity` | `compileDestroyEntity` | `actor_destroy` + alias `destroy_entity` | `ActionDestroy` | ✅ |
| `spawn_entity` | `compileSpawnEntity` | `spawn_entity` | `ActionSpawnEntity` | ✅ |
| `dialogue` | — (baseNode) | `dialogue` | `ActionDialogue` | ✅ |
| `wait_for_dialogue` | — (baseNode) | `wait_for_dialogue` + alias `waittalk` | `ActionWaitForDialogue` | ✅ |
| `set_dialogue_speed` | `compileSetDialogueSpeed` | `set_dialogue_speed` | `ActionSetDialogueSpeed` | ✅ |
| `wait_typing` | `compileWaitTyping` | `wait_typing` | `ActionWaitTyping` | ✅ |
| `dialogue_control` | `compileDialogueControl` | `dialogue_control` | `ActionDialogueControl` | ✅ |
| `set_portrait_next` | `compileSetPortraitNext` | `set_portrait_next` | `ActionSetPortraitNext` | ✅ |
| `set_portrait_now` | `compileSetPortraitNow` | `set_portrait_now` | `ActionSetPortraitNow` | ✅ |
| `clear_dialogue` | `compileClearDialogue` | `clear_dialogue` | `ActionClearDialogue` | ✅ |
| `camera_shake` | `compileCameraShake` | `camera_shake` | `ActionCameraShake` | ✅ |
| `tween_camera` | `compileTweenCamera` | `tween_camera` | `ActionTween` (camera) | ✅ |
| `camera_track` | — (baseNode) | `camera_track` | `ActionCameraTrack` | ✅ |
| `camera_track_until_stop` | — (baseNode) | `camera_track_until_stop` | `ActionCameraTrackUntilStop` | ✅ |
| `camera_center` | — (baseNode) | `camera_center` | `ActionCameraCenter` | ✅ |
| `camera_pan` | — (baseNode) | `camera_pan` | `ActionCameraPan` | ✅ |
| `camera_pan_speed` | — (baseNode) | `camera_pan_speed` | `ActionCameraPanSpeed` | ✅ |
| `camera_pan_obj` | — (baseNode) | `camera_pan_obj` | `ActionCameraPanToObj` | ✅ |
| `play_music` | `compilePlayMusic` | `play_music` | `ActionMusicPlay` | ⚠️ **BUG: `volume` ignored** |
| `stop_music` | `compileStopMusic` | `stop_music` | `ActionMusicStop` | ✅ |
| `music_volume` | `compileMusicVolume` | `music_volume` | `ActionMusicVolume` | ✅ |
| `music_duck` | `compileMusicDuck` | `music_duck` | `ActionMusicDuck` | ✅ |
| `music_unduck` | `compileMusicUnduck` | `music_unduck` | `ActionMusicUnduck` | ✅ |
| `music_pitch` | `compileMusicPitch` | `music_pitch` | `cutscene_music_pitch()` | ✅ |
| `music_pause` | `compileMusicPause` | `music_pause` | `cutscene_music_pause()` | ✅ |
| `music_resume` | `compileMusicResume` | `music_resume` | `cutscene_music_resume()` | ✅ |
| `play_boss_music` | `compilePlayBossMusic` | `play_boss_music` | `ActionMusicPlayLayered` | ✅ |
| `stop_boss_music` | `compileStopBossMusic` | `stop_boss_music` | `ActionMusicStop` | ✅ |
| `boss_music_phase` | `compileBossMusicPhase` | `boss_music_phase` | `ActionMusicPhaseSequence` | ✅ |
| `play_music_intro` | `compilePlayMusicIntro` | `play_music_intro` | `ActionMusicIntroLoop` | ✅ |
| `play_music_intro_layered` | `compilePlayMusicIntroLayered` | `play_music_intro_layered` | `ActionMusicIntroLayered` | ✅ |
| `crossfade_music` | `compileCrossfadeMusic` | `crossfade_music` | `ActionMusicSetIntensity` | ✅ |
| `play_sfx` | — (baseNode) | `play_sfx` | `ActionPlaySFX` | ✅ |
| `fade_in` | — (baseNode) | `fade_in` | `ActionFadeIn` | ✅ |
| `fade_out` | — (baseNode) | `fade_out` | `ActionFadeOut` | ✅ |
| `shake_object` | `compileShakeObject` | `shake_object` | `ActionShakeObject` | ✅ |
| `emote` / `show_emote` | `compileEmote` | `show_emote` + alias `emote` | `ActionEmote` | ✅ |
| `set_emotion` | — (baseNode) | `set_emotion` | `ActionSetEmotion` | ✅ |
| `flip` | `compileFlip` | `flip` | `ActionFlip` | ✅ |
| `spin` | `compileSpin` | `spin` | `ActionSpin` | ✅ |
| `set_visible` | `compileSetVisible` | `set_visible` | `ActionSetProperty` | ✅ |
| `set_instant` / `instant_mode` | — (baseNode) | `set_instant` + alias `instant_mode` | `ActionSetInstantMode` | ✅ |
| `halt` | `compileHalt` | `halt` | `ActionHalt` | ✅ |
| `set_depth` | — (baseNode) | `set_depth` | `ActionSetDepth` | ✅ |
| `set_property` | `compileSetProperty` | `set_property` | `ActionSetProperty` | ✅ |
| `auto_facing` | — (baseNode) | `auto_facing` | `ActionSetProperty` | ✅ |
| `auto_walk` | — (baseNode) | `auto_walk` | `ActionSetProperty` | ✅ |
| `set_facing` | — (baseNode) | `set_facing` | `ActionRunFunction` (inline) | ✅ |
| `animate` | — (baseNode) | `animate` | `ActionAnimate` | ✅ |
| `set_animation_frame` | — (baseNode) | `set_animation_frame` | `ActionSetAnimationFrame` | ✅ |
| `tween` / `lerp` | `compileTween` | `tween` + alias `lerp` | `ActionTween` | ✅ |
| `run_function` | `compileRunFunction` | `run_function` | `ActionRunFunction` | ✅ |
| `partial_control` | `compilePartialControl` | `partial_control` | `ActionPartialControl` | ✅ |
| `wait_for_interact` | `compileWaitForInteract` | `wait_for_interact` | `ActionWaitForInteract` | ⚠️ `interact_action` не явно компилируется (работает через baseNode) |
| `set_flag` | `compileSetFlag` | `set_flag` | `ActionSetFlag` | ✅ |
| `set_plot` | `compileSetPlot` | `set_plot` | `ActionSetPlot` | ⚠️ **Type mismatch** (см. ниже) |
| `schedule_action` | `compileScheduleAction` | `schedule_action` | `ActionScheduleAction` | ✅ |
| `attach_to_target` | — (baseNode) | `attach_to_target` | `ActionAttachToTarget` | ✅ |
| `detach` | `compileDetach` | `detach` | `ActionDetach` | ⚠️ `keep_world_position` ignored |
| `guard_global` | (generated by `wait_until` + edge conditions) | `guard_global` | `ActionGuardGlobal` | ✅ |
| `wait_until` | `compileWaitUntil` → `guard_global` | `guard_global` | `ActionGuardGlobal` | ✅ |
| `checkpoint_state` | `compileCheckpointState` | `checkpoint_state` | `ActionCheckpointState` | ✅ |
| `restore_state` | `compileRestoreState` | `restore_state` | `ActionRestoreState` | ✅ |
| `room_change` | — (baseNode) | `room_change` | `ActionRoomChange` | ✅ |
| `parallel` | — (baseNode) | `parallel` | `ActionParallel` | ✅ |
| `branch` | — (baseNode) | `branch` | `ActionBranch` | ✅ |
| `mark_node` | — (baseNode) | `mark_node` | `ActionMarkNode` | ✅ |

### 2.3. Найденные несоответствия (BUGs)

#### BUG-1: `play_music` — `volume` игнорируется GML factory

- **nodeRegistry:** `play_music` имеет поле `volume` (type: 'number', default: 1)
- **TS compiler:** `compilePlayMusic` отправляет `action.volume = node.params.volume`
- **GML factory:** `play_music` читает только `sound`/`track` и `fade` — `volume` **не читается**
- **GML class:** `ActionMusicPlay(_snd_asset, _fade_sec)` — нет параметра `volume`
- **Влияние:** Пользователь настраивает громкость в редакторе, но она молча игнорируется в игре.
- **Исправление:** Добавить `volume` в `ActionMusicPlay` constructor и в factory парсинг.

#### BUG-2: `set_plot` — type mismatch (string vs real)

- **nodeRegistry:** `set_plot` поле `value` (type: 'number', default: 0) — отправляется как number
- **TS compiler:** `compileSetPlot` имеет defensive check `typeof value === 'string'` — если value строка, отправляется строка
- **GML factory:** `__cutscene_json_get_real(_map, "value", 0)` — **строго требует real**, строки возвращают default (0)
- **GML helper:** `__cutscene_json_get_real` (cutscene_load_json.gml:196) — `if (!is_real(_val)) return _default`
- **Влияние:** В нормальном потоке (editor → number) работает. При ручном редактировании JSON со строковым value — молча вернёт 0.
- **Исправление:** Либо добавить `real()` парсинг строк в `__cutscene_json_get_real`, либо убрать string-check в TS compiler.

#### BUG-3: `detach` — `keep_world_position` игнорируется

- **TS compiler:** `compileDetach` отправляет `keep_world_position` (boolean)
- **GML factory:** `detach` читает только `target_ref` и `destroy_after_detach`
- **GML class:** `ActionDetach(target_ref, destroy_after_detach)` — нет параметра `keep_world_position`
- **Влияние:** Minor — поле отсутствует в nodeRegistry, так что из редактора оно не отправляется. Compiler имеет defensive code для несуществующего поля.

#### NOTE-1: `wait_for_interact` — `interact_action` не явно компилируется

- **nodeRegistry:** имеет поле `interact_action` (select: 'continue'/'abort_parallel')
- **TS compiler:** `compileWaitForInteract` не отправляет `interact_action` явно
- **Работает:** `compileBaseNode` копирует все params, включая `interact_action`
- **Влияние:** Нет бага, но неявная зависимость от `compileBaseNode` fallback.

### 2.4. Factory handlers без COMPILERS entry (fallback to compileBaseNode)

30+ node types не имеют явного compiler в `COMPILERS` map и полагаются на `compileBaseNode`, который копирует все params как есть. Это работает, но:

- Нет валидации типов параметров на стороне TS
- Нет трансформации имён полей (если GML ожидает другое имя)
- Нет документированного контракта между editor и engine

---

## 3. FlowCanvas.tsx — God Component Audit

**Файл:** `editor-app/src/renderer/src/editor/FlowCanvas.tsx`  
**Размер:** 1473 строки

### Структура
- `FlowCanvas` (внешний) — обёртка с `ReactFlowProvider` (memo)
- `FlowCanvasInner` (внутренний) — основная логика (memo)
- `ScaledBackground` — фон с zoom-aware размером точек (memo)
- `ZoomLODController` — LOD переключение CSS классов (memo)
- `EdgeLODController` — LOD для edge labels (memo)

### Находки

- **Дублирование сравнения** (строки 573-599): сравнение `prevNode` с `node` выполняется дважды — сначала в outer if (строки 573-581), затем внутри return (строки 588-596). Внутреннее сравнение избыточно — если outer if уже прошел, inner всегда true.
- **13+ useRef** для стабилизации коллбеков — необходимая мера для uncontrolled React Flow mode, но увеличивает сложность.
- **8 useEffect** для синхронизации: nodes, edges, selection (nodes), selection (edges), focus, drag preview cleanup, wheel listener, initial fitView, liquid-glass CSS.
- **Хорошо:** memo обёртки, LOD контроллеры, debounce selection (100ms), idempotent DOM updates.

### Рекомендации
- Вынести дублированное сравнение в helper функцию `areNodesEqual(prev, next)`.
- Рассмотреть вынос wheel handler в отдельный хук `useCanvasWheel`.

---

## 4. RoomVisualEditorModal.tsx — God Component Audit

**Файл:** `editor-app/src/renderer/src/editor/RoomVisualEditorModal.tsx`  
**Размер:** 1522 строки

### Структура
- Делегирует логику в хуки: `useRoomVisualEditorState`, `usePathEditorLogic`, `useViewportControls`, `useActorEditorLogic`
- Композит из: `RoomVisualEditorToolbar`, `RoomVisualEditorSidebar`, `RoomVisualEditorViewport`

### Находки
- **1522 строки** — God component, но логика хорошо делегирована в хуки.
- Основная масса — JSX рендеринг и координация между sub-components.
- **Рекомендация:** Рассмотреть вынос modal vs window variant в отдельные компоненты.

---

## 5. useDocking.ts — God Hook Audit

**Файл:** `editor-app/src/renderer/src/editor/useDocking.ts`  
**Размер:** 1224 строки

### Находки
- **1224 строки** — God hook, управляющий: drag panels, resize, dock/undock, collapse, slot capacity, float panels, drop preview.
- Множество чистых helper функций вынесены на модульный уровень (`removeFromAllSlots`, `insertIntoSlot`, `enforceSlotCapacity`, `clamp`).
- **Рекомендация:** Разбить на `usePanelDrag`, `usePanelResize`, `useDockLayout`, `useDockDropPreview`.

---

## 6. EditorShell.tsx — Prop Drilling Audit

**Файл:** `editor-app/src/renderer/src/editor/EditorShell.tsx`  
**Размер:** 655 строк

### Находки
- **Тяжёлый prop drilling:** `useEditorShellPanels` принимает 40+ параметров (строки 358-400).
- `useEditorCallbacks` принимает 25+ параметров (строки 310-340).
- Множество `useRef` для стабилизации коллбеков передаваемых в `useEditorShortcuts`.
- **Хорошо:** Использование `useMemo` для `centerContent` и `panelData`.
- **Рекомендация:** Рассмотреть Context API или Zustand store для editor state вместо прокидывания через props.

---

## 7. useEditorShortcuts.ts — Copy-Paste Audit

**Файл:** `editor-app/src/renderer/src/editor/useEditorShortcuts.ts`  
**Размер:** 364 строки

### Находки

- **Copy-paste между Ctrl+C (строки 182-220) и Ctrl+X (строки 224-272):** Логика сбора selectedSet, добавления parallel пар, клонирования nodes/edges — практически идентична (~50 строк дублирования).
- **Рекомендация:** Вынести в общую функцию `collectClipboardPayload(runtime, selectedIds): ClipboardPayload`.

- **Один гигантский useEffect** (строки 70-360) с всеми хоткеями в одном handler — сложно тестировать и модифицировать.
- **Рекомендация:** Разбить на отдельные handlers или использовать библиотеку вроде `useHotkeys`.

---

## 8. GML Factory + Classes — Handler/Class Correspondence

### 8.1. Покрытие factory handlers

**Всего handlers в factory:** 76 (включая aliases)  
**Всего node types в nodeRegistry:** ~70+  
**Всего entries в COMPILERS map:** 46

### 8.2. Aliases (GML side)

| Alias | Target | Назначение |
|-------|--------|-----------|
| `destroy_entity` | `actor_destroy` | Совместимость с TS naming |
| `emote` | `show_emote` | Совместимость с TS naming |
| `instant_mode` | `set_instant` | Совместимость |
| `lerp` | `tween` | Совместимость с TS naming |
| `waittalk` | `wait_for_dialogue` | Legacy |

### 8.3. GML classes — покрытие

Все factory handlers создают экземпляры классов, определённые в:
- `scr_cutscene_classes.gml` — основные action классы
- `scr_cutscene_music.gml` — музыкальные action классы

**Все классы имеют соответствующие factory handlers.** Нет " orphan" классов без factory entry.

---

## 9. main/index.ts — Main Process Architecture

**Файл:** `editor-app/src/main/index.ts`  
**Размер:** 1738 строк

### Находки
- **Монолитный файл:** 1738 строк, всё в одном файле — IPC handlers, window management, auto-updater, visual editor bridge, menu setup.
- **37 `ipcMain.handle`** вызовов — все в одном файле.
- **2 `TODO`** о sandbox (строки 1138, 1185) — `sandbox: false` должен быть `true`.
- **Рекомендация:** Разбить на модули: `ipc/runtime.ts`, `ipc/resources.ts`, `ipc/scenes.ts`, `windowManager.ts`, `menuBuilder.ts`, `visualEditorBridge.ts`.

---

## 10. Сводка приоритетов

### Критические (должны быть исправлены)
1. **`play_music` volume игнорируется** — пользователь настраивает громкость, она не применяется в игре.
2. **Electron sandbox отключён** — потенциальная безопасность.

### Высокий приоритет
3. **`set_plot` type mismatch** — `__cutscene_json_get_real` не парсит строки.
4. **`scr_cutscene_classes.gml:3208`** — music volume restore не перезапускает трек.

### Средний приоритет
5. **FlowCanvas.tsx** — дублированное сравнение в setNodes (строки 573-599).
6. **useEditorShortcuts.ts** — ~50 строк copy-paste между Ctrl+C и Ctrl+X.
7. **main/index.ts** — монолит на 1738 строк, 37 IPC handlers.

### Низкий приоритет
8. **EditorShell.tsx** — 40+ props в useEditorShellPanels.
9. **useDocking.ts** — 1224 строки, God hook.
10. **RoomVisualEditorModal.tsx** — 1522 строки, God component.
11. **30+ node types без явного compiler** — зависят от compileBaseNode fallback.
