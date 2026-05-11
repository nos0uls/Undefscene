# Design Document: Checkpoint / Restore State (Wave 3)

## 1. Обзор фичи

### Описание
Система сохранения и восстановления состояния катсцены. Позволяет создавать "снимки" состояния (позиции актёров, камеры, музыки, глобальные переменные) и откатываться к ним позже.

### Use Cases
1. Retry после failed branch
2. Откат после неправильного выбора
3. Preview сложной катсцены с возможностью вернуться назад
4. Отладка развилок

---

## 2. Текущее состояние

- Нет нод Checkpoint или Restore
- Нет snapshot-механизма в runtime
- Нет глобального registry для checkpoints

---

## 3. Предложенная реализация

### 3.1 Editor Nodes

#### `checkpoint_state`
Создаёт снимок состояния.

```typescript
checkpoint_state: {
  type: 'checkpoint_state',
  label: 'Checkpoint State',
  category: 'logic',
  fields: [
    { key: 'checkpoint_id', label: 'Checkpoint ID', type: 'text', defaultValue: '' },
    { key: 'include_actors', label: 'Include Actors', type: 'checkbox', defaultValue: true },
    { key: 'include_player', label: 'Include Player', type: 'checkbox', defaultValue: true },
    { key: 'include_camera', label: 'Include Camera', type: 'checkbox', defaultValue: true },
    { key: 'include_music', label: 'Include Music', type: 'checkbox', defaultValue: true },
    { key: 'include_globals', label: 'Include Globals (JSON array)', type: 'text', defaultValue: '' },
    { key: 'include_instances', label: 'Include Instances (JSON array)', type: 'text', defaultValue: '' }
  ],
  defaultParams: { checkpoint_id: '', include_actors: true, include_player: true, include_camera: true, include_music: true, include_globals: '', include_instances: '' }
}
```

#### `restore_state`
Восстанавливает checkpoint.

```typescript
restore_state: {
  type: 'restore_state',
  label: 'Restore State',
  category: 'logic',
  fields: [
    { key: 'checkpoint_id', label: 'Checkpoint ID', type: 'text', defaultValue: '' },
    { key: 'cleanup_transients', label: 'Cleanup Transients', type: 'checkbox', defaultValue: true },
    { key: 'restore_camera', label: 'Restore Camera', type: 'checkbox', defaultValue: true },
    { key: 'restore_music', label: 'Restore Music', type: 'checkbox', defaultValue: true },
    { key: 'on_missing', label: 'On Missing', type: 'select', options: ['warn', 'ignore', 'fail'], defaultValue: 'warn' }
  ],
  defaultParams: { checkpoint_id: '', cleanup_transients: true, restore_camera: true, restore_music: true, on_missing: 'warn' }
}
```

### 3.2 GML Runtime

#### Global Registry

```gml
global.__cutscene_checkpoints = ds_map_create() // checkpoint_id → snapshot_struct
```

#### Snapshot Structure

```gml
{
  checkpoint_id: "before_choice_1",
  timestamp_frames: 12345,
  actors: { "npc_guide": { x: 320, y: 240, sprite_index: spr_npc_idle, ... } },
  player: { x: 160, y: 200, sprite_index: spr_player_idle_down, ... },
  camera: { x: 100, y: 50, width: 320, height: 180 },
  music: { current_track: "mus_intro", volume: 0.8 },
  globals: { "quest_state": "started", "npc_met": true }
}
```

#### Action Classes

```gml
/// @function ActionCheckpointState(_checkpoint_id, _config)
function ActionCheckpointState(_checkpoint_id, _config) : CutsceneAction() constructor {
  action_type = "CheckpointState"
  checkpoint_id = _checkpoint_id
  config = _config
  start = function(manager) {
    var _snapshot = __cutscene_create_snapshot(manager, config)
    _snapshot.checkpoint_id = checkpoint_id
    _snapshot.timestamp_frames = manager.frame_counter
    if (!ds_map_exists(global.__cutscene_checkpoints, checkpoint_id)) {
      ds_map_add(global.__cutscene_checkpoints, checkpoint_id, _snapshot)
    } else {
      global.__cutscene_checkpoints[$ checkpoint_id] = _snapshot
    }
    show_debug_message("[CUTSCENE] Checkpoint created: " + checkpoint_id)
  }
  update = function(manager) { return true }
}

/// @function ActionRestoreState(_checkpoint_id, _options)
function ActionRestoreState(_checkpoint_id, _options) : CutsceneAction() constructor {
  action_type = "RestoreState"
  checkpoint_id = _checkpoint_id
  options = _options
  start = function(manager) {
    if (!ds_map_exists(global.__cutscene_checkpoints, checkpoint_id)) {
      var _on_missing = options.on_missing ?? "warn"
      if (_on_missing == "warn") show_debug_message("[CUTSCENE] Checkpoint not found: " + checkpoint_id)
      else if (_on_missing == "fail") show_debug_message("[CUTSCENE] ERROR: Checkpoint missing: " + checkpoint_id)
      return
    }
    var _snapshot = global.__cutscene_checkpoints[$ checkpoint_id]
    if (options.cleanup_transients) __cutscene_cleanup_transients(manager)
    if (variable_struct_exists(_snapshot, "actors")) { /* restore actors */ }
    if (variable_struct_exists(_snapshot, "player")) { /* restore player */ }
    if (options.restore_camera && variable_struct_exists(_snapshot, "camera")) { /* restore camera */ }
    if (options.restore_music && variable_struct_exists(_snapshot, "music")) { /* restore music */ }
    if (variable_struct_exists(_snapshot, "globals")) { /* restore globals */ }
    show_debug_message("[CUTSCENE] Checkpoint restored: " + checkpoint_id)
  }
  update = function(manager) { return true }
}
```

#### Helper Functions

```gml
/// @function __cutscene_create_snapshot(manager, config)
function __cutscene_create_snapshot(_manager, _config) {
  var _snapshot = {}
  if (_config.include_actors && is_struct(_manager.actor_map)) {
    var _actors = {}
    var _keys = variable_struct_get_names(_manager.actor_map)
    for (var i = 0; i < array_length(_keys); i++) {
      var _key = _keys[i]
      var _inst = _manager.actor_map[$ _key]
      if (instance_exists(_inst)) _actors[$ _key] = __cutscene_snapshot_instance(_inst)
    }
    _snapshot.actors = _actors
  }
  if (_config.include_player && instance_exists(obj_player)) _snapshot.player = __cutscene_snapshot_instance(obj_player)
  if (_config.include_camera) {
    var _cam = view_camera[0]
    _snapshot.camera = { x: camera_get_view_x(_cam), y: camera_get_view_y(_cam), width: camera_get_view_width(_cam), height: camera_get_view_height(_cam) }
  }
  if (_config.include_music) _snapshot.music = { current_track: global.current_music_track ?? "", volume: global.music_volume ?? 1.0 }
  // globals, instances...
  return _snapshot
}

/// @function __cutscene_snapshot_instance(inst)
function __cutscene_snapshot_instance(_inst) {
  return { x: _inst.x, y: _inst.y, sprite_index: _inst.sprite_index, image_index: _inst.image_index, image_speed: _inst.image_speed, image_xscale: _inst.image_xscale, image_yscale: _inst.image_yscale, image_angle: _inst.image_angle, depth: _inst.depth, visible: _inst.visible }
}
```

---

## 4. Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `editor/nodes/nodeRegistry.ts` | `checkpoint_state`, `restore_state` |
| `editor/nodes/CutsceneNodes.tsx` | Компоненты |
| `editor/nodes/index.ts` | Регистрация |
| `editor/compileGraph.ts` | Компиляция |
| `editor/reverseCompile.ts` | Обратный импорт |
| `editor/validateGraph.ts` | Уникальность checkpoint_id |
| `scr_cutscene_classes.gml` | `ActionCheckpointState`, `ActionRestoreState`, helpers |
| `cutscene_action_factory.gml` | Регистрация |
| `obj_cutsceneManager/Create_0.gml` | `global.__cutscene_checkpoints` |

---

## 5. Оценка сложности и риска

### Сложность: **ОЧЕНЬ ВЫСОКАЯ** ⭐⭐⭐⭐
- Полноценная snapshot система
- Множество edge cases
- Управление памятью (ds_map cleanup)

### Риск: **ВЫСОКИЙ**
1. Memory leak — явное удаление checkpoints
2. Inconsistent state — проверка instance_exists
3. Audio issues — конфликт с текущим audio state
4. Performance — ограничить количество checkpoints (max 10)

---

## 6. Открытые вопросы

1. Как обрабатывать actors, созданные ПОСЛЕ checkpoint? (cleanup_transients)
2. Как восстанавливать музыку (fade/position)?
3. Вложенные checkpoints?
4. Автоматическая очистка при finish_cutscene?
