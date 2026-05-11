# Design Document: Attach To Target (Wave 3 / Deferred from Wave 2)

## 1. Обзор фичи

### Описание
Система прикрепления одного объекта к другому с поддержкой offset, направления, масштаба и глубины. Child следует за parent в реальном времени.

### Use Cases
1. Эффекты над головой актёра
2. Props в руках персонажа
3. Маркеры/иконки над NPC
4. Камера с offset от target
5. Helper objects, привязанные к игроку

---

## 2. Текущее состояние

- Нет parent-child attachment subsystem
- `follow_path` и `camera_track` есть, но это не attachment
- Нет registry для attachments

---

## 3. Предложенная реализация

### 3.1 Editor Nodes

#### `attach_to_target`

```typescript
attach_to_target: {
  type: 'attach_to_target',
  label: 'Attach To Target',
  category: 'visual',
  fields: [
    { key: 'target', label: 'Target (child)', type: 'searchable', options: [], defaultValue: '' },
    { key: 'parent', label: 'Parent', type: 'searchable', options: [], defaultValue: '' },
    { key: 'offset_x', label: 'Offset X', type: 'number', defaultValue: 0 },
    { key: 'offset_y', label: 'Offset Y', type: 'number', defaultValue: -32 },
    { key: 'follow_facing', label: 'Follow Facing', type: 'checkbox', defaultValue: true },
    { key: 'follow_scale', label: 'Follow Scale', type: 'checkbox', defaultValue: false },
    { key: 'follow_depth', label: 'Follow Depth', type: 'checkbox', defaultValue: true },
    { key: 'duration_seconds', label: 'Duration (0 = until detach)', type: 'number', step: 0.1, defaultValue: 0 },
    { key: 'detach_on_cutscene_end', label: 'Detach On Cutscene End', type: 'checkbox', defaultValue: true }
  ],
  defaultParams: { target: '', parent: '', offset_x: 0, offset_y: -32, follow_facing: true, follow_scale: false, follow_depth: true, duration_seconds: 0, detach_on_cutscene_end: true }
}
```

#### `detach`

```typescript
detach: {
  type: 'detach',
  label: 'Detach',
  category: 'visual',
  fields: [
    { key: 'target', label: 'Target', type: 'searchable', options: [], defaultValue: '' },
    { key: 'keep_world_position', label: 'Keep World Position', type: 'checkbox', defaultValue: true },
    { key: 'destroy_after_detach', label: 'Destroy After Detach', type: 'checkbox', defaultValue: false }
  ],
  defaultParams: { target: '', keep_world_position: true, destroy_after_detach: false }
}
```

### 3.2 GML Runtime

#### Global Registry

```gml
global.__cutscene_attachments = ds_list_create() // список attachment structs
```

#### Attachment Structure

```gml
{
  attachment_id: "att_0001",
  target: instance_id,
  parent: instance_id,
  offset_x: 0,
  offset_y: -32,
  follow_facing: true,
  follow_scale: false,
  follow_depth: true,
  duration_frames: 0,
  timer: 0,
  detach_on_cutscene_end: true,
  original_xscale: 1,
  original_yscale: 1
}
```

#### Action Classes

```gml
/// @function ActionAttachToTarget(target_ref, parent_ref, offset_x, offset_y, config)
function ActionAttachToTarget(_target_ref, _parent_ref, _offset_x, _offset_y, _config) : CutsceneAction() constructor {
  action_type = "AttachToTarget"
  target_ref = _target_ref
  parent_ref = _parent_ref
  offset_x = _offset_x
  offset_y = _offset_y
  config = _config ?? {}

  start = function(manager) {
    var _target_inst = __cutscene_resolve_target(manager, target_ref)
    var _parent_inst = __cutscene_resolve_target(manager, parent_ref)
    if (!instance_exists(_target_inst)) { show_debug_message("[CUTSCENE] AttachToTarget: target not found") return }
    if (!instance_exists(_parent_inst)) { show_debug_message("[CUTSCENE] AttachToTarget: parent not found") return }
    var _attachment = {
      attachment_id: "att_" + string(ds_list_size(global.__cutscene_attachments)),
      target: _target_inst, parent: _parent_inst,
      offset_x: offset_x, offset_y: offset_y,
      follow_facing: config.follow_facing ?? true,
      follow_scale: config.follow_scale ?? false,
      follow_depth: config.follow_depth ?? true,
      duration_frames: (config.duration_seconds ?? 0) > 0 ? round((config.duration_seconds ?? 0) * 60) : 0,
      timer: 0,
      detach_on_cutscene_end: config.detach_on_cutscene_end ?? true,
      original_xscale: _target_inst.image_xscale,
      original_yscale: _target_inst.image_yscale
    }
    ds_list_add(global.__cutscene_attachments, _attachment)
    show_debug_message("[CUTSCENE] Attachment created")
  }
  update = function(manager) { return true }
}

/// @function ActionDetach(target_ref, keep_world_position, destroy_after)
function ActionDetach(_target_ref, _keep_world_position, _destroy_after) : CutsceneAction() constructor {
  action_type = "Detach"
  target_ref = _target_ref
  keep_world_position = _keep_world_position
  destroy_after = _destroy_after

  start = function(manager) {
    var _target_inst = __cutscene_resolve_target(manager, target_ref)
    if (!instance_exists(_target_inst)) { show_debug_message("[CUTSCENE] Detach: target not found") return }
    for (var i = 0; i < ds_list_size(global.__cutscene_attachments); i++) {
      var _att = ds_list_find_value(global.__cutscene_attachments, i)
      if (is_struct(_att) && _att.target == _target_inst) {
        ds_list_delete(global.__cutscene_attachments, i)
        show_debug_message("[CUTSCENE] Attachment removed")
        break
      }
    }
    if (destroy_after && instance_exists(_target_inst)) instance_destroy(_target_inst)
  }
  update = function(manager) { return true }
}
```

#### Update Attachments (Step Event)

```gml
/// @function __cutscene_update_attachments()
function __cutscene_update_attachments() {
  if (!ds_exists(global.__cutscene_attachments, ds_type_list)) { global.__cutscene_attachments = ds_list_create() return }
  var _to_remove = []
  for (var i = 0; i < ds_list_size(global.__cutscene_attachments); i++) {
    var _att = ds_list_find_value(global.__cutscene_attachments, i)
    if (!is_struct(_att) || !instance_exists(_att.target) || !instance_exists(_att.parent)) { array_push(_to_remove, i) continue }
    var _parent = _att.parent
    var _target = _att.target
    var _world_x = _parent.x + _att.offset_x
    var _world_y = _parent.y + _att.offset_y
    if (_att.follow_facing && variable_instance_exists(_parent, "image_xscale") && _parent.image_xscale < 0) {
      _world_x = _parent.x - _att.offset_x
    }
    _target.x = _world_x
    _target.y = _world_y
    if (_att.follow_scale && variable_instance_exists(_parent, "image_xscale")) {
      _target.image_xscale = _parent.image_xscale * _att.original_xscale
      _target.image_yscale = _parent.image_yscale * _att.original_yscale
    }
    if (_att.follow_depth) _target.depth = _parent.depth + 1
    if (_att.duration_frames > 0) {
      _att.timer += 1
      if (_att.timer >= _att.duration_frames) array_push(_to_remove, i)
    }
  }
  for (var i = array_length(_to_remove) - 1; i >= 0; i--) {
    ds_list_delete(global.__cutscene_attachments, _to_remove[i])
  }
}
```

#### Cleanup

```gml
/// @function __cutscene_detach_all_for_cutscene()
function __cutscene_detach_all_for_cutscene() {
  if (!ds_exists(global.__cutscene_attachments, ds_type_list)) return
  var _to_remove = []
  for (var i = 0; i < ds_list_size(global.__cutscene_attachments); i++) {
    var _att = ds_list_find_value(global.__cutscene_attachments, i)
    if (is_struct(_att) && _att.detach_on_cutscene_end) array_push(_to_remove, i)
  }
  for (var i = array_length(_to_remove) - 1; i >= 0; i--) ds_list_delete(global.__cutscene_attachments, _to_remove[i])
}
```

---

## 4. Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `editor/nodes/nodeRegistry.ts` | `attach_to_target`, `detach` |
| `editor/nodes/CutsceneNodes.tsx` | Компоненты |
| `editor/nodes/index.ts` | Регистрация |
| `editor/compileGraph.ts` | Компиляция |
| `editor/reverseCompile.ts` | Обратный импорт |
| `editor/validateGraph.ts` | target != parent |
| `scr_cutscene_classes.gml` | `ActionAttachToTarget`, `ActionDetach`, helpers |
| `cutscene_action_factory.gml` | Регистрация |
| `obj_cutsceneManager` Step event | `__cutscene_update_attachments()` |
| `obj_cutsceneManager` cleanup | `__cutscene_detach_all_for_cutscene()` |

---

## 5. Оценка сложности и риска

### Сложность: **ВЫСОКАЯ** ⭐⭐⭐
- Parent-child attachment subsystem
- Обновление каждый frame
- follow_facing (flip offset)
- follow_scale, follow_depth

### Риск: **СРЕДНИЙ**
1. Performance — много attachments могут замедлить
2. Depth issues — неправильный порядок
3. Facing flip — ошибка в offset при image_xscale < 0
4. Circular attachments — target != parent валидация
5. Destroyed parent — обработано в update

---

## 6. Открытые вопросы

1. Как обрабатывать follow_facing, если parent не имеет image_xscale? (facing_direction)
2. Нужна ли поддержка вложенных attachments (A -> B -> C)?
3. Нужна ли поддержка rotation/angle?
4. Нужны ли "attachment points" (hand, head)?
