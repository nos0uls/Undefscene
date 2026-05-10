## Feature: Music Control MVP

### Problem
Катсцены не могут управлять музыкой из editor. Runtime music classes существуют, но не подключены к editor export.

### Existing State
- GML: `scr_cutscene_music.gml` содержит ActionMusicPlay, ActionMusicStop, ActionMusicVolume, ActionMusicDuck, ActionMusicUnduck.
- GML: `scr_music_init.gml` содержит global functions: play_music_immediate, play_music_fade, stop_music, set_music_volume_fade, duck_music, unduck_music.
- Editor: нет music нод.
- Action factory (`cutscene_action_factory.gml`): НЕ регистрирует music типы.

### Proposed UX
Новая категория "audio" (цвет уже есть: `--node-audio`).

#### Ноды MVP (5 штук)

1. **play_music**
   - track: searchable sound asset
   - volume: number (0..1, default 1)
   - fade: number (seconds, default 0.5)

2. **stop_music**
   - fade: number (seconds, default 1.0)

3. **music_volume**
   - volume: number (0..1, default 1)
   - fade: number (seconds, default 0.5)

4. **music_duck**
   - multiplier: number (0..1, default 0.3)
   - fade: number (seconds, default 0.3)

5. **music_unduck**
   - fade: number (seconds, default 0.3)

### JSON Schema
```json
{ "type": "play_music", "sound": "music_boss", "volume": 1, "fade": 0.5 }
{ "type": "stop_music", "fade": 1.0 }
{ "type": "music_volume", "volume": 0.3, "fade": 0.5 }
{ "type": "music_duck", "multiplier": 0.3, "fade": 0.3 }
{ "type": "music_unduck", "fade": 0.3 }
```

### Runtime Behavior
- All instant (non-blocking, update returns true immediately).
- play_music: если fade <= 0 → play_music_immediate, иначе → play_music_fade.
- stop_music: если fade <= 0 → мгновенно, иначе → плавное затухание.
- music_volume: вызывает set_music_volume_fade.
- music_duck/unduck: вызывает duck_music/unduck_music.
- Error: missing sound asset → factory returns noone, action skipped silently.

### Files To Change
Editor:
1. `editor-app/src/renderer/src/editor/nodes/nodeRegistry.ts` — add 5 node definitions
2. `editor-app/src/renderer/src/editor/nodes/CutsceneNodes.tsx` — add 5 React node components
3. `editor-app/src/renderer/src/editor/compileGraph.ts` — nodeToAction for music
4. `editor-app/src/renderer/src/editor/reverseCompile.ts` — reverse import
5. `editor-app/src/renderer/src/editor/validateGraph.ts` — validation rules
6. `editor-app/src/renderer/src/editor/InspectorPanel.tsx` — field rendering (если нужно кастомное)

GML:
7. `Undefinedtale888/scripts/cutscene_action_factory/cutscene_action_factory.gml` — register music types

### Risks
- Music classes в scr_cutscene_music.gml уже готовы, но не тестированы через JSON.
- Need to verify that `sound` field in editor maps to correct GML asset lookup.

### Verification
- [ ] Editor typecheck/build passes
- [ ] Export JSON contains correct music actions
- [ ] Reverse import restores music nodes
- [ ] Validation warns on empty sound asset for play_music
- [ ] GML factory creates music actions from JSON
