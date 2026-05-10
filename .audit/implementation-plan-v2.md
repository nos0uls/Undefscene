# Undefscene Cutscene Editor — Implementation Plan v2

> Составлен на основе аудита editor/runtime кода и roadmap из Undefinedtale-888/.audit/cutscene-feature-roadmap.md
> Дата: 2026-05-10

---

## 1. Источники истины

- **Roadmap:** `Undefinedtale-888/Undefinedtale888/.audit/cutscene-feature-roadmap.md`
- **Editor:** `Undefscene/editor-app/src/renderer/src/editor/`
- **GML Runtime:** `Undefinedtale-888/Undefinedtale888/scripts/`

---

## 2. Audit Summary: что уже есть

### Editor (45+ нод, полный pipeline)
- Node registry, compileGraph, reverseCompile, validateGraph — все работают.
- Visual editor: room screenshots, path editing (pencil/eraser), actor placement.
- Edge conditions: guard_global с skip/wait_until_true + end conditions.
- Player target: резолвится как actor, can_move блокируется, управление возвращается.

### GML Runtime (43+ action types)
- Action factory: wait, move, actor_create/destroy, follow_path, dialogue, camera, tween, set_property, branch, parallel, guard_global, etc.
- Music classes существуют (scr_cutscene_music.gml: ActionMusicPlay, Stop, Volume, Pitch, Pause, Resume, IntroLoop, Duck, Unduck, PlayLayered, SetIntensity) — **НО НЕ ЗАРЕГИСТРИРОВАНЫ в action factory**.
- Player target: resolve_target обрабатывает "player" → obj_player, partial_control работает.

---

## 3. Feature Matrix: Roadmap vs Current State

| # | Roadmap Feature | Editor Node | Editor Compile | GML Factory | GML Class | Priority (Roadmap) | Status |
|---|-----------------|-------------|----------------|-------------|-----------|-------------------|--------|
| 1 | Dialogue Microcommands | NO | NO | NO | NO | Medium | missing |
| 2 | Delay / Scheduled Actions | NO | NO | NO | NO | Medium | missing |
| 3 | Checkpoint / Restore State | NO | NO | NO | NO | Medium/Low | missing |
| 4 | **Relative Positioning** | **NO** | **NO** | **NO** | **NO** | **High** | **missing** |
| 5 | **Stick / Attachment** | **NO** | **NO** | **NO** | **NO** | **Med/High** | **missing** |
| 6 | Auto Depth | NO (нет ноды) | — | — | — | Low | maybe covered by depth=-y |
| 7 | Directional / Advanced Shake | NO | NO | NO | NO | Medium | missing |
| 8 | **Music Control** | **NO** | **NO** | **NO** | **YES** | **High** | **gap (classes exist, factory+editor missing)** |
| 9 | Pose Presets / Special Sprite | NO | — | — | — | Medium | editor-only idea |
| 10 | **Wait Until** | **NO** | **NO** | **NO** | **NO** | **Medium** | **missing** |
| 11 | Fine Animation Controls | Partial | Partial | Partial | Partial | Medium | partially covered |
| 12 | Player as Actor | Partial | — | — | — | High (verify) | needs testing |
| 13 | Visual Editor Refactor | — | — | — | — | High (refactor) | code health |
| 14 | Visual Editor Preview Speed | Partial | — | — | — | Medium | needs integration |
| 15 | Cinematic Beats | NO | — | — | — | Research | missing |
| 16 | Rehearsal / Dry Run | NO | — | — | — | Research | missing |
| 17 | Director Notes | NO | — | — | — | Research | missing |
| 18 | Camera Composition Guides | NO | — | — | — | Research | missing |
| 19 | Action Templates / Macros | NO | — | — | — | Research | missing |
| 20 | Timing Lanes | NO | — | — | — | Research | missing |
| 21 | Shot Presets | NO | — | — | — | Research | missing |
| 22 | Continuity Checker | NO | — | — | — | Research | missing |
| 23 | Emotional State Layer | NO | — | — | — | Research | missing |
| 24 | Cutscene Lint Profiles | NO | — | — | — | Research | missing |

---

## 4. Wave 1 — Safe & High-Value (согласно roadmap priorities)

| # | Feature | Why First | Risk | Files | Status |
|---|---------|-----------|------|-------|--------|
| 1 | **Player as Actor Verification** | Roadmap пометил "высокий как проверка"; нужно убедиться, что player target стабилен | Low | Test scenes + notes | — |
| 2 | **Music Control MVP** | Roadmap: "высокий", runtime classes готовы, чистый gap | Low | nodeRegistry, compileGraph, reverseCompile, validateGraph, CutsceneNodes, GML factory | **COMPLETED** |
| 3 | **Relative Positioning** | Roadmap: "высокий", очень полезная группа | Low-Medium | nodeRegistry, compileGraph, GML action classes+factory | **COMPLETED** |
| 4 | **Wait Until node** | Roadmap: "средний", улучшает читаемость graph | Low | nodeRegistry, compileGraph, reverseCompile, GML new action class | **COMPLETED** |
| 5 | **Visual Editor: preview speed from follow_path** | Roadmap: средний, FollowPathPreview уже есть | Low | RoomVisualEditorModal, FollowPathPreview | — |
| 6 | **Visual Editor: refactor RoomVisualEditorModal.tsx** | Roadmap: высокий, разбить на модули | Low | New files, no behavior change | — |

### Wave 1 — что НЕ делаем
- Auto Depth: roadmap говорит "низкий", TODO проверить depth=-y сначала.
- Step Recorder: пользователь сказал отдельно подумает.
- Dialogue microcommands: зависит от Chatterbox API, средний приоритет.

---

## 5. Wave 2 — Medium Complexity

| # | Feature | Why Second | Risk |
|---|---------|------------|------|
| 1 | **Attach To Target / Detach** | Roadmap: средний/высокий, новый runtime subsystem | Medium |
| 2 | **Advanced Shake** (frequency, decay, directional) | Roadmap: средний, расширяет существующие shake | Low |
| 3 | **Fine Animation Controls** (Set Animation Frame, Play Animation Until, Animation Override Mode) | Roadmap: средний, проверить текущее покрытие | Low-Medium |
| 4 | **Dialogue Microcommands** (Dialogue Control, Wait Dialogue Line) | Roadmap: средний, зависит от Chatterbox | Medium |
| 5 | **Pose Presets** (editor-only UX) | Roadmap: средний, не runtime команда | Low |
| 6 | **Delay / Scheduled Actions** | Roadmap: средний, cleanup риски | Medium |

---

## 6. Wave 3 — Research & Complex

| # | Feature | Why Third | Risk |
|---|---------|-----------|------|
| 1 | **Checkpoint / Restore State** | Roadmap: средний/низкий, сложно, опасно | High |
| 2 | **Continuity Checker** | Новая идея, validation layer | Medium |
| 3 | **Cinematic Beats** | Editor-only, но меняет graph UX | Medium |
| 4 | **Director Notes** | Editor-only, просто | Low |
| 5 | **Camera Composition Guides** | Visual editor enhancement | Medium |
| 6 | **Action Templates / Macros** | Editor-only, но архитектура | Medium |
| 7 | **Timing Lanes** | Editor-only, сложный UI | High |
| 8 | **Shot Presets** | Camera subsystem | Medium |
| 9 | **Emotional State Layer** | Новый runtime concept | High |
| 10 | **Rehearsal / Dry Run Mode** | Editor+runtime, сложно | High |
| 11 | **Cutscene Lint Profiles** | Validation enhancement | Medium |

---

## 7. Detailed Design Notes for Wave 1

### 7.1 Music Control MVP (Priority: High)

**Roadmap reference:** Section 8 — "Play Music", "Stop Music", "Music Volume", "Music Duck/Unduck", "Restore Previous Music".

**Problem:** Катсцены не могут управлять музыкой из editor.

**Existing State:**
- GML: `scr_cutscene_music.gml` содержит ActionMusicPlay, ActionMusicStop, ActionMusicVolume, ActionMusicPitch, ActionMusicPause, ActionMusicResume, ActionMusicIntroLoop, ActionMusicDuck, ActionMusicUnduck, ActionMusicPlayLayered, ActionMusicSetIntensity.
- Action factory (`cutscene_action_factory.gml`) НЕ регистрирует music типы.
- Editor: нет music нод вообще.

**Proposed MVP Nodes:**
1. `play_music` — track (searchable), volume, fade_in_seconds
2. `stop_music` — fade_out_seconds
3. `music_volume` — volume (0..1), fade_seconds
4. `music_duck` — multiplier (0..1), fade_seconds
5. `music_unduck` — fade_seconds

**JSON Schema:**
```json
{ "type": "play_music", "sound": "music_boss", "volume": 1, "fade": 0.5 }
{ "type": "stop_music", "fade": 1.0 }
{ "type": "music_volume", "volume": 0.3, "fade": 0.5 }
{ "type": "music_duck", "multiplier": 0.3, "fade": 0.3 }
{ "type": "music_unduck", "fade": 0.3 }
```

**Runtime Behavior:**
- All instant (non-blocking).
- Cleanup: music continues playing unless stopped.
- Error: missing sound asset → log warning, continue.

**Files To Change:**
1. `editor-app/src/renderer/src/editor/nodes/nodeRegistry.ts` — add 5 node definitions
2. `editor-app/src/renderer/src/editor/nodes/CutsceneNodes.tsx` — add 5 React node components
3. `editor-app/src/renderer/src/editor/compileGraph.ts` — add nodeToAction for music
4. `editor-app/src/renderer/src/editor/reverseCompile.ts` — add reverse import
5. `editor-app/src/renderer/src/editor/validateGraph.ts` — add validation rules
6. `Undefinedtale888/scripts/cutscene_action_factory/cutscene_action_factory.gml` — register music types

**Risks:**
- GML music classes untested from JSON path.
- Need to verify global music functions (global.play_music_immediate, etc.) exist.

---

### 7.2 Relative Positioning (Priority: High)

**Roadmap reference:** Section 4 — "Move To Target Offset", "Set Position Relative", "Add Position".

**Problem:** Все move/set_position используют абсолютные координаты.

**Existing State:**
- move: `{ target, x, y, speed_px_sec, collision }`
- set_position: `{ target, x, y }`
- GML ActionMove/ActionSetXY принимают абсолютные x, y.

**Proposed Approach (roadmap-style):**
1. **Add `relative` checkbox** к существующим `move` и `set_position` нодам.
   - Простейший способ, не плодит ноды.
2. **Новая нода `move_to_target_offset`** (roadmap предлагает отдельную) — для движения к другому объекту с offset.

**JSON Schema (relative mode):**
```json
{ "type": "move", "target": "player", "x": 32, "y": 0, "speed_px_sec": 60, "relative": true }
{ "type": "set_position", "target": "npc", "x": 0, "y": -48, "relative": true }
```

**JSON Schema (move_to_target_offset):**
```json
{ "type": "move_to_target_offset", "target": "player", "reference": "npc", "offset_x": -32, "offset_y": 0, "speed_px_sec": 60 }
```

**Recommendation:** Начать с `relative` флага для move/set_position (меньше изменений), затем `move_to_target_offset`.

---

### 7.3 Wait Until (Priority: Medium)

**Roadmap reference:** Section 10 — "Wait Until" с kind, property, operator, timeout.

**Problem:** Edge conditions с `wait_until_true` существуют, но UX неочевиден.

**Existing State:**
- RuntimeEdge: `conditionIfFalse: 'wait_until_true'`, `stopWaitingWhen`, `endTimeoutSeconds`.
- compileGraph создаёт `guard_global` с `if_false: 'wait_until_true'`.

**Proposed:**
- Option A: Улучшить edge condition UX (tooltips, labels).
- Option B: Добавить standalone `wait_until` ноду.
- **Recommendation:** Option B — более читаемый graph, но можно начать с A, чтобы не дублировать runtime logic.

---

### 7.4 Visual Editor Refactor (Priority: High)

**Roadmap reference:** Section 13.1 — разбить `RoomVisualEditorModal.tsx`.

**Proposed modules:**
- `RoomVisualEditorStage.tsx` — viewport/canvas/pointer surface.
- `RoomVisualEditorToolbar.tsx` — room, refresh, zoom, fit.
- `RoomVisualEditorPathTools.tsx` — pencil/eraser/import path.
- `RoomVisualEditorActorTools.tsx` — actor picker, placement, import actors.
- `useRoomVisualPathEditing.ts` — path state, history.
- `useRoomVisualActorEditing.ts` — actor draft/drag/import.

**Constraint:** No behavior change, only file split.

---

### 7.5 Visual Editor Preview Speed (Priority: Medium)

**Roadmap reference:** Section 13.3 — preview speed from selected `follow_path`.

**Existing:**
- `FollowPathPreview.tsx` уже анимирует marker по `speedPxPerSecond`.
- Нужно проверить интеграцию с `RoomVisualEditorModal.tsx` / modal toolbar.

---

## 8. Open Questions for User

1. **Music Control scope:** MVP (play/stop/volume/duck/unduck — 5 нод) или полный (все 11 типов)?
2. **Relative Positioning:** Добавить `relative` чекбокс к существующим move/set_position, или отдельные ноды как в roadmap?
3. **Wait Until:** Улучшить edge condition UX или standalone нода?
4. **GML changes:** Можно ли модифицировать action factory в Undefinedtale-888? Или начинаем editor-only?
5. **Первая волна:** Music Control MVP + Relative Positioning + Visual Editor refactor?

---

## 9. Process for Each Feature

```
Step 1. Check current state (node, compile, reverse, validate, GML)
Step 2. Write design note (.audit/design-<feature>.md)
Step 3. Ask user confirmation if changes runtime schema or UX
Step 4. Implement in small PR-like chunks
Step 5. Verify: typecheck/build, export JSON, reverse import, validation, GML test
Step 6. Update docs, mark TODOs
```

---

## 10. Changelog

| Date | What |
|------|------|
| 2026-05-10 | v1 — Initial plan based on editor/runtime audit |
| 2026-05-10 | v2 — Updated with roadmap from Undefinedtale-888/.audit/cutscene-feature-roadmap.md |
| 2026-05-11 | Wave 1 COMPLETED — Music Control MVP (5 nodes), Relative Positioning MVP (2 nodes), Wait Until (1 node) |
