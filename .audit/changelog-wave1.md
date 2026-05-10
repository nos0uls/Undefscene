# Wave 1 Changelog

## Summary
Wave 1 implemented three high-priority feature groups from the roadmap:
- **Music Control MVP** — 5 new editor nodes for controlling music from cutscenes.
- **Relative Positioning MVP** — 2 new editor nodes for moving and placing actors relative to their current position.
- **Wait Until** — 1 new standalone editor node that waits until a global variable meets a condition.

All new nodes support full compile → JSON → reverse-compile round-trips and are registered in the GML action factory.

---

## New Editor Nodes

### Audio (`audio`)

| Node | Fields | Description |
|------|--------|-------------|
| **play_music** | `sound` (searchable), `volume` (0..1), `fade` (sec) | Starts a music track with optional crossfade. If `fade <= 0`, plays immediately; otherwise fades in. |
| **stop_music** | `fade` (sec) | Stops current music with optional fade-out. |
| **music_volume** | `volume` (0..1), `fade` (sec) | Changes music volume with a smooth fade. |
| **music_duck** | `multiplier` (0..1), `fade` (sec) | Ducks (lowers) music volume by a multiplier. |
| **music_unduck** | `fade` (sec) | Restores music volume from a previous duck. |

### Movement (`movement`)

| Node | Fields | Description |
|------|--------|-------------|
| **move_relative** | `target`, `dx`, `dy`, `speed_px_sec`, `collision` | Moves an actor by offset `(dx, dy)` from their current position. Blocking action. |
| **set_position_relative** | `target`, `dx`, `dy` | Instantly shifts an actor by `(dx, dy)` from their current position. Instant action. |

### Logic (`logic`)

| Node | Fields | Description |
|------|--------|-------------|
| **wait_until** | `condition_var`, `condition_equals`, `timeout_seconds` | Waits until a global variable equals a value. Syntactic sugar for `guard_global` with `if_false: 'wait_until_true'` and empty actions. |

---

## GML Runtime Changes

### `Undefinedtale888/scripts/cutscene_action_factory/cutscene_action_factory.gml`
Registered factory functions for all new action types:
- `play_music` — resolves sound asset via `asset_get_index`, maps `volume` to `ActionMusicPlay` (fade only; volume is handled by the global music system), supports fallback key `track`.
- `stop_music` — creates `ActionMusicStop` with fade.
- `music_volume` — creates `ActionMusicVolume`.
- `music_duck` — creates `ActionMusicDuck`.
- `music_unduck` — creates `ActionMusicUnduck`.
- `move_relative` — creates `ActionMoveRelativeDXDY` with target resolution, `dx`, `dy`, `speed_px_sec`, and `collision`.
- `set_position_relative` — creates `ActionSetPositionRelative` with target resolution, `dx`, `dy`.

### `Undefinedtale888/scripts/scr_cutscene_classes/scr_cutscene_classes.gml`
Added two new action classes:
- `ActionMoveRelativeDXDY(target_ref, dx, dy, speed, use_collision)` — blocking move action. Computes destination as `inst.x + dx`, `inst.y + dy` in `start()`, then moves toward it each frame.
- `ActionSetPositionRelative(target_ref, dx, dy)` — instant action. Applies `inst.x += dx`, `inst.y += dy` in `start()`.

### `Undefinedtale888/scripts/scr_cutscene_music/scr_cutscene_music.gml`
No changes — the music action classes (`ActionMusicPlay`, `ActionMusicStop`, `ActionMusicVolume`, `ActionMusicDuck`, `ActionMusicUnduck`) already existed. Wave 1 only wired them into the action factory.

---

## Files Changed (full list)

### Editor (Undefscene repo)
1. `editor-app/src/renderer/src/editor/nodes/nodeRegistry.ts` — added 8 node definitions (5 music + 2 relative + 1 wait_until).
2. `editor-app/src/renderer/src/editor/nodes/CutsceneNodes.tsx` — added 8 React node components (`PlayMusicNode`, `StopMusicNode`, `MusicVolumeNode`, `MusicDuckNode`, `MusicUnduckNode`, `MoveRelativeNode`, `SetPositionRelativeNode`, `WaitUntilNode`).
3. `editor-app/src/renderer/src/editor/nodes/index.ts` — added imports and `cutsceneNodeTypes` mappings for all 8 new nodes.
4. `editor-app/src/renderer/src/editor/compileGraph.ts` — added `nodeToAction` logic for music nodes, relative positioning nodes, and `wait_until` (compiled as `guard_global` with `if_false: 'wait_until_true'` and empty `actions`).
5. `editor-app/src/renderer/src/editor/reverseCompile.ts` — added reverse import logic for music nodes, relative positioning nodes, and `guard_global` → `wait_until` detection.
6. `editor-app/src/renderer/src/editor/validateGraph.ts` — added `REQUIRED_PARAMS` entries for all 8 new nodes; `play_music` requires `sound`, `wait_until` requires `condition_var`.

### GML Runtime (Undefinedtale-888 repo)
7. `Undefinedtale888/scripts/cutscene_action_factory/cutscene_action_factory.gml` — registered 7 new factory functions (5 music + 2 relative positioning).
8. `Undefinedtale888/scripts/scr_cutscene_classes/scr_cutscene_classes.gml` — added `ActionMoveRelativeDXDY` and `ActionSetPositionRelative` classes.

---

## Verification
- **Typecheck:** passed (no new errors)
- **Compile / reverse-compile round-trip:** passed for all 8 new nodes
- **GML factory:** new action types registered and create correct structs

---

## Known Issues / TODOs
- Pre-existing TypeScript errors (11) in unrelated files
- `play_music` resource validation uses sounds list (fixed)
- `volume`/`fade === 0` no longer skipped — zero values are now correctly emitted into JSON (fixed)
