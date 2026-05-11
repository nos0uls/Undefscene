# Design Document: Emotional State Layer (Wave 3)

## 1. Обзор фичи

### Описание
Высокоуровневая система управления эмоциональным состоянием актёра. Автоматически выбирает idle pose, portrait, emote и voice style одной командой.

### Use Cases
1. Одной командой подготовить персонажа к серии реплик с консистентной эмоцией
2. Автоматический выбор спрайта/портрета
3. Меньше ручной работы

---

## 2. Текущее состояние

- `animate`, `set_facing`, `emote` — отдельные ноды
- Нет связи между эмоцией, спрайтом, портретом

---

## 3. Предложенная реализация

### 3.1 Emotion Config (GML)

```gml
/// @function __cutscene_emotions_init()
function __cutscene_emotions_init() {
  if (is_struct(global.__cutscene_emotions)) return global.__cutscene_emotions
  var _emotions = {
    neutral: { label: "Neutral", idle_pose: undefined, portrait: undefined, emote: undefined, voice_style: "normal", intensity: 0.5 },
    angry: { label: "Angry", idle_pose: "spr_npc_angry", portrait: "portrait_angry", emote: "emote_angry", voice_style: "aggressive", intensity: 0.8 },
    sad: { label: "Sad", idle_pose: "spr_npc_sad", portrait: "portrait_sad", emote: "emote_sad", voice_style: "melancholic", intensity: 0.6 },
    scared: { label: "Scared", idle_pose: "spr_npc_scared", portrait: "portrait_scared", emote: "emote_scared", voice_style: "nervous", intensity: 0.7 },
    happy: { label: "Happy", idle_pose: "spr_npc_happy", portrait: "portrait_happy", emote: "emote_happy", voice_style: "cheerful", intensity: 0.9 },
    confused: { label: "Confused", idle_pose: "spr_npc_confused", portrait: "portrait_confused", emote: "emote_confused", voice_style: "uncertain", intensity: 0.5 }
  }
  global.__cutscene_emotions = _emotions
  return _emotions
}
```

### 3.2 Editor Node: `set_emotion`

```typescript
set_emotion: {
  type: 'set_emotion',
  label: 'Set Emotion',
  category: 'visual',
  fields: [
    { key: 'target', label: 'Target', type: 'searchable', options: [], defaultValue: 'player' },
    { key: 'emotion', label: 'Emotion', type: 'select', options: ['neutral', 'angry', 'sad', 'scared', 'happy', 'confused'], defaultValue: 'neutral' },
    { key: 'intensity', label: 'Intensity (0..1)', type: 'number', step: 0.1, defaultValue: 0.5 },
    { key: 'apply_to_sprite', label: 'Apply to Sprite', type: 'checkbox', defaultValue: true },
    { key: 'apply_to_portrait', label: 'Apply to Portrait', type: 'checkbox', defaultValue: true },
    { key: 'apply_to_emote', label: 'Apply to Emote', type: 'checkbox', defaultValue: false },
    { key: 'duration_seconds', label: 'Duration (0 = permanent)', type: 'number', step: 0.1, defaultValue: 0 }
  ],
  defaultParams: { target: 'player', emotion: 'neutral', intensity: 0.5, apply_to_sprite: true, apply_to_portrait: true, apply_to_emote: false, duration_seconds: 0 }
}
```

### 3.3 GML Action Class

```gml
/// @function ActionSetEmotion(_target, _emotion, _intensity, _apply_sprite, _apply_portrait, _apply_emote, _duration)
function ActionSetEmotion(_target, _emotion, _intensity, _apply_sprite, _apply_portrait, _apply_emote, _duration) : CutsceneAction() constructor {
  action_type = "SetEmotion"
  target = _target
  emotion = is_string(_emotion) ? string_lower(string_trim(_emotion)) : "neutral"
  intensity = clamp(_intensity, 0, 1)
  apply_sprite = _apply_sprite
  apply_portrait = _apply_portrait
  apply_emote = _apply_emote
  duration = max(0, _duration)

  start = function(manager) {
    var _inst = __cutscene_resolve_target(manager, target)
    if (!instance_exists(_inst)) return
    var _emotion_def = __cutscene_emotion_get(emotion)
    if (is_undefined(_emotion_def)) { show_debug_message("[CUTSCENE] Unknown emotion '" + emotion + "'")
      return
    }
    if (apply_sprite && !is_undefined(_emotion_def.idle_pose)) {
      var _sprite = asset_get_index(_emotion_def.idle_pose)
      if (_sprite != -1) { _inst.sprite_index = _sprite; _inst.image_index = 0; _inst.image_speed = 1 }
    }
    if (apply_emote && !is_undefined(_emotion_def.emote)) {
      var _emote_sprite = asset_get_index(_emotion_def.emote)
      if (_emote_sprite != -1) {
        var _emote_action = new ActionEmote(_inst, _emote_sprite)
        array_push(manager.background_actions, _emote_action)
      }
    }
    var _actor_key = is_string(target) ? target : string(target)
    manager.emotion_states[$ _actor_key] = { emotion: emotion, intensity: intensity, duration_remaining: duration > 0 ? duration : -1 }
  }

  update = function(manager) {
    if (duration > 0) {
      var _actor_key = is_string(target) ? target : string(target)
      if (variable_struct_exists(manager.emotion_states, _actor_key)) {
        var _state = manager.emotion_states[$ _actor_key]
        if (is_struct(_state) && _state.duration_remaining > 0) {
          _state.duration_remaining -= 1 / max(1, manager.cutscene_engine_settings.fps)
          if (_state.duration_remaining <= 0) { delete manager.emotion_states[$ _actor_key] }
        }
      }
    }
    return true
  }
}
```

### 3.4 Action Factory

```gml
f[$ "set_emotion"] = function(_map, _fps) {
  var _target = __cutscene_json_get_target(_map)
  if (_target == noone || (is_string(_target) && _target == "")) return noone
  var _emotion = __cutscene_json_get_string(_map, "emotion", "neutral")
  var _intensity = __cutscene_json_get_real(_map, "intensity", 0.5)
  var _apply_sprite = __cutscene_json_get_bool(_map, "apply_to_sprite", true)
  var _apply_portrait = __cutscene_json_get_bool(_map, "apply_to_portrait", true)
  var _apply_emote = __cutscene_json_get_bool(_map, "apply_to_emote", false)
  var _duration = __cutscene_json_get_real(_map, "duration_seconds", 0)
  return new ActionSetEmotion(_target, _emotion, _intensity, _apply_sprite, _apply_portrait, _apply_emote, _duration)
}
```

---

## 4. Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `editor/nodes/nodeRegistry.ts` | `set_emotion` |
| `editor/nodes/CutsceneNodes.tsx` | `SetEmotionNode` |
| `editor/nodes/index.ts` | Регистрация |
| `editor/compileGraph.ts` | Компиляция |
| `editor/reverseCompile.ts` | Обратный импорт |
| `editor/validateGraph.ts` | Проверка emotion name |
| `scr_cutscene_emotions_config.gml` | **Новый** — конфиг эмоций |
| `scr_cutscene_classes.gml` | `ActionSetEmotion` |
| `cutscene_action_factory.gml` | Регистрация |
| `obj_cutsceneManager/Create_0.gml` | `emotion_states`, вызов `__cutscene_emotions_init()` |

---

## 5. Оценка сложности и риска

### Сложность: **СРЕДНЯЯ** ⭐⭐
- Новая система emotion definitions
- Новая action class
- Интеграция с Chatterbox (future)

### Риск: **НИЗКИЙ-СРЕДНИЙ**
1. Портреты в Chatterbox — начать без портретов
2. Emote конфликты — использовать background_actions
3. Duration timing — использовать FPS

---

## 6. Открытые вопросы

1. Как интегрировать с Chatterbox для портретов?
2. Нужна ли иерархия эмоций (angry_intense)?
3. Per-actor customization?
4. Анимация перехода между эмоциями?
