# Undefscene Cutscene Editor — Implementation Plan

> Составлен на основе аудита editor/runtime кода.
> Дата: 2026-05-10

---

## 1. Executive Summary

Editor имеет **45+ нод**, полный compile/reverseCompile/validate pipeline, visual editor с room screenshots и path editing. GML runtime имеет action factory с ~40+ action types и отдельный music модуль (scr_cutscene_music.gml).

**Ключевой finding:** Music actions существуют в GML (ActionMusicPlay, Stop, Volume, Pitch, Pause, Resume, IntroLoop, Duck, Unduck, PlayLayered, SetIntensity), но **не зарегистрированы в action factory** и **полностью отсутствуют в editor**. Это самый чистый gap.

---

## 2. Feature Matrix: Editor vs Runtime

| Feature | Editor Node | Editor Compile | GML Action Factory | GML Action Class | Status |
|---------|-------------|----------------|--------------------|------------------|--------|
| wait | yes | yes | yes | ActionWait | full |
| move | yes | yes | yes | ActionMove | full |
| set_position | yes | yes | yes | ActionSetXY | full |
| follow_path | yes | yes | yes | ActionFollowPath | full |
| actor_create | yes | yes | yes | ActionActorCreate | full |
| actor_destroy | yes | yes | yes | ActionActorDestroy | full |
| animate | yes | yes | yes | ActionAnimate | full |
| dialogue | yes | yes | yes | ActionDialogue | full |
| wait_for_dialogue | yes | yes | yes | ActionWaitForDialogue | full |
| camera_track | yes | yes | yes | ActionCameraTrack | full |
| camera_pan | yes | yes | yes | ActionCameraPan | full |
| camera_shake | yes | yes | yes | ActionCameraShake | full |
| branch | yes | yes | yes | ActionBranch | full |
| parallel | yes | yes | yes | ActionParallel | full |
| guard_global | edge | yes | yes | ActionGuardGlobal | full |
| tween | yes | yes | yes | ActionTween | full |
| set_property | yes | yes | yes | ActionSetProperty | full |
| play_sfx | yes | yes | yes | ActionPlaySFX | full |
| emote | yes | yes | yes | ActionEmote | full |
| jump | yes | yes | yes | ActionJump | full |
| halt | yes | yes | yes | ActionHalt | full |
| flip | yes | yes | yes (via run_function) | ActionRunFunction | full |
| spin | yes | yes | yes | ActionSpin | full |
| shake_object | yes | yes | yes | ActionShakeObject | full |
| set_visible | yes | yes | yes | ActionSetProperty | full |
| fade_in/out | yes | yes | yes | ActionFadeIn/Out | full |
| partial_control | yes | yes | yes | ActionPartialControl | full |
| wait_for_interact | yes | yes | yes | ActionWaitForInteract | full |
| set_flag | yes | yes | yes | ActionSetFlag | full |
| spawn_entity | yes | yes | yes | ActionSpawnEntity | full |
| destroy_entity | yes | yes | yes (alias) | ActionActorDestroy | full |
| set_plot | yes | yes | yes | ActionSetPlot | full |
| **music_play** | **NO** | **NO** | **NO** | **YES** (ActionMusicPlay) | **gap** |
| **music_stop** | **NO** | **NO** | **NO** | **YES** (ActionMusicStop) | **gap** |
| **music_volume** | **NO** | **NO** | **NO** | **YES** (ActionMusicVolume) | **gap** |
| **music_fade** | **NO** | **NO** | **NO** | **YES** (ActionMusicPlay fade) | **gap** |
| **relative_position** | **NO** | **NO** | **NO** | **NO** | **missing** |
| **attach_to_target** | **NO** | **NO** | **NO** | **NO** | **missing** |
| **advanced_shake** | **NO** | **NO** | **NO** | **NO** | **missing** |
| checkpoint_restore | NO | NO | NO | NO | missing |
| continuity_checker | NO | NO | NO | NO | missing |
| dialogue_microcommands | NO | NO | NO | NO | missing |
| action_templates | NO | NO | NO | NO | missing |
| cinematic_beats | NO | NO | NO | NO | missing |
| timing_lanes | NO | NO | NO | NO | missing |
| emotional_state | NO | NO | NO | NO | missing |
| rehearsal_mode | NO | NO | NO | NO | missing |

---

## 3. Prioritized Waves

### Wave 1 — Safe & High-Value

| # | Feature | Why First | Risk |
|---|---------|-----------|------|
| 1 | **Player target verification** | Already works, just confirm UX | none |
| 2 | **Music Control nodes** | Runtime classes exist, factory gap only | low |
| 3 | **Relative Positioning** | Extends existing move/set_position | low-medium |
| 4 | **Wait Until node** | Edge condition partially covers, UX gap | low |
| 5 | **Visual Editor: preview speed** | FollowPathPreview already has it, may need modal integration | low |
| 6 | **Visual Editor: light refactor** | Code health, no behavior change | low |

### Wave 2 — Medium Complexity

| # | Feature | Why Second | Risk |
|---|---------|------------|------|
| 1 | **Attach To Target** | New runtime action needed | medium |
| 2 | **Shake Advanced** | Extends existing shake nodes | low |
| 3 | **Fine Animation Controls** | Extend animate/tween | low |
| 4 | **Dialogue microcommands** | Extend dialogue node | medium |
| 5 | **Action Templates / Macros** | Editor-only feature | medium |

### Wave 3 — Research & Complex

| # | Feature | Why Third | Risk |
|---|---------|-----------|------|
| 1 | **Checkpoint / Restore State** | New runtime subsystem | high |
| 2 | **Continuity Checker** | Validation layer extension | medium |
| 3 | **Cinematic Beats** | Editor-only, needs design | medium |
| 4 | **Timing Lanes** | Editor-only, needs UX design | medium |
| 5 | **Emotional State Layer** | New runtime concept | high |
| 6 | **Rehearsal / Dry Run Mode** | Complex editor+runtime | high |

---

## 4. Detailed Design Notes

### 4.1 Music Control (Wave 1, Priority 2)

**Problem:** Катсцены не могут управлять музыкой из editor.

**Existing State:**
- GML: `scr_cutscene_music.gml` содержит ActionMusicPlay, ActionMusicStop, ActionMusicVolume, ActionMusicPitch, ActionMusicPause, ActionMusicResume, ActionMusicIntroLoop, ActionMusicDuck, ActionMusicUnduck, ActionMusicPlayLayered, ActionMusicSetIntensity.
- НО: `cutscene_action_factory.gml` не регистрирует music типы.
- Editor: вообще нет music нод.

**Proposed UX:**
- Новая категория "audio" (уже есть цвет `var(--node-audio)`).
- Ноды: `play_music`, `stop_music`, `music_volume`, `music_pitch`, `music_pause`, `music_resume`.
- Поля: sound asset (searchable), fade seconds, volume, pitch.

**JSON Schema (example):**
```json
{ "type": "play_music", "sound": "music_boss", "fade": 0.5 }
{ "type": "stop_music", "fade": 1.0 }
{ "type": "music_volume", "volume": 0.3, "fade": 0.5 }
```

**Runtime Behavior:**
- All music actions are instant (non-blocking, update returns true immediately).
- Cleanup: music continues playing unless stopped.
- Error: missing sound asset → log warning, continue.

**Files To Change:**
1. `editor-app/src/renderer/src/editor/nodes/nodeRegistry.ts` — add music node definitions
2. `editor-app/src/renderer/src/editor/compileGraph.ts` — add nodeToAction mapping
3. `editor-app/src/renderer/src/editor/reverseCompile.ts` — add reverse import
4. `editor-app/src/renderer/src/editor/validateGraph.ts` — add validation rules
5. `editor-app/src/renderer/src/editor/nodes/CutsceneNodes.tsx` — add React node components
6. `Undefinedtale888/scripts/cutscene_action_factory/cutscene_action_factory.gml` — register music types

**Risks:**
- GML action classes exist but untested from JSON path.
- Need to verify global music functions exist in runtime.

**Verification:**
- Editor build/typecheck.
- Export JSON and verify schema.
- Reverse import exported JSON.
- GML: load JSON and execute music action.

---

### 4.2 Relative Positioning (Wave 1, Priority 3)

**Problem:** Все move/set_position используют абсолютные координаты.

**Existing State:**
- move: `{ target, x, y, speed_px_sec, collision }`
- set_position: `{ target, x, y }`
- GML ActionMove/ActionSetXY принимают абсолютные x, y.

**Proposed UX:**
- Добавить `relative` чекбокс к move и set_position.
- Когда relative = true, x/y трактуются как offset от текущей позиции.

**JSON Schema:**
```json
{ "type": "move", "target": "player", "x": 32, "y": 0, "speed_px_sec": 60, "collision": false, "relative": true }
```

**Runtime Behavior:**
- Если relative=true, при start action вычисляем target_x = inst.x + x, target_y = inst.y + y.
- Blocking (move) / Instant (set_position).

**Files To Change:**
1. `editor-app/src/renderer/src/editor/nodes/nodeRegistry.ts` — add `relative` field
2. `editor-app/src/renderer/src/editor/compileGraph.ts` — pass `relative` param
3. `editor-app/src/renderer/src/editor/reverseCompile.ts` — handle `relative`
4. `Undefinedtale888/scripts/scr_cutscene_classes/scr_cutscene_classes.gml` — update ActionMove/ActionSetXY constructors
5. `Undefinedtale888/scripts/cutscene_action_factory/cutscene_action_factory.gml` — parse `relative`

**Risks:**
- Changes GML action constructors → backward compatibility concern.
- Need to ensure old JSON without `relative` still works.

---

### 4.3 Wait Until Node (Wave 1, Priority 4)

**Problem:** Edge conditions с `wait_until_true` существуют, но UX неочевиден.

**Existing State:**
- RuntimeEdge поддерживает `conditionIfFalse: 'wait_until_true'`.
- compileGraph создаёт `guard_global` с `if_false: 'wait_until_true'`.
- Нет standalone ноды "Wait Until".

**Proposed UX:**
- Добавить ноду `wait_until` как явный аналог edge condition.
- Поля: condition var, equals, timeout, timeout action.
- Альтернатива: улучшить edge condition UX (tooltip, label).

**Recommendation:** Начать с улучшения edge condition UX (labels, tooltips), а standalone ноду добавить только если edge condition недостаточно.

---

### 4.4 Visual Editor Preview Speed (Wave 1, Priority 5)

**Existing State:**
- `FollowPathPreview.tsx` уже анимирует marker по `speedPxPerSecond`.
- Visual Editor Modal (`RoomVisualEditorModal.tsx`) может не иметь интеграции preview speed.

**Proposed:**
- Проверить, что visual editor modal показывает speed indicator.
- Возможно добавить speed slider в modal toolbar.

---

## 5. Open Questions for User

1. **Music Control:** Подтвердите список music нод. Нужны ли все (play, stop, volume, pitch, pause, resume, intro_loop, duck, unduck, layered, intensity) или MVP (play, stop, volume)?

2. **Relative Positioning:** Подтвердите подход — добавить `relative` чекбокс к существующим нодам move/set_position, или создать отдельные ноды `move_relative` / `set_position_relative`?

3. **Wait Until:** Улучшить edge condition UX или добавить standalone ноду?

4. **GML Changes:** Можно ли модифицировать action factory и action classes в Undefinedtale-888? Или editor-only изменения сначала?

5. **Первая волна:** Начинаем с Music Control + Relative Positioning? Или только Music Control MVP?

---

## 6. Risks Summary

| Risk | Mitigation |
|------|------------|
| Music GML classes untested from JSON | Add factory registration, test in GM |
| Relative positioning breaks old saves | Default `relative=false`, backward compat |
| New nodes break reverseCompile | Add handlers, test round-trip |
| Schema version mismatch | Stay on schema_version=1, add fields only |
| GML runtime object/function names changed | Verify against actual .yyp resources |

---

## 7. Next Steps

1. Согласовать первую волну с пользователем.
2. Создать design note для первой фичи.
3. Реализовать маленькими PR-like порциями.
4. После каждой фичи: typecheck, export test, reverse import test, документация.
