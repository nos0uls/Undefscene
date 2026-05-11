# Design Document: Shot Presets (Wave 3)

## 1. Обзор фичи

### Описание
Shot Presets — набор предопределённых камерных композиций для быстрой постановки сцен. Вместо ручной настройки camera_pan/camera_track с вычислением координат, режиссёр выбирает готовый пресет (close-up, two-shot, over-the-shoulder и т.д.).

### Use Cases
1. Быстрое создание кинематографичных кадров
2. Стандартизация диалоговых сцен
3. Меньше ручного вычисления координат
4. Consistent composition

---

## 2. Текущее состояние

- Editor: есть `camera_track`, `camera_pan`, `camera_pan_obj`, `camera_center`, `camera_shake`
- GML Runtime: `ActionCameraTrack`, `ActionCameraPan`, `ActionCameraPanToObj`, `ActionCameraCenter` — все готовы
- Пресеты: не существуют

---

## 3. Предложенная реализация

### Архитектура
Editor-side feature с compile-time раскрытием. Runtime видит только `camera_pan` / `camera_track`.

### 3.1 Типы пресетов

#### `close_up(target)`
- Крупный план на одного персонажа
- Параметры: `target`, `padding` (default 50), `duration_seconds`, `easing`
- Вычисление: camera_x = target.x - camera_width/2 + padding

#### `two_shot(target_a, target_b)`
- Два персонажа в кадре
- Параметры: `target_a`, `target_b`, `padding` (80), `duration_seconds`, `easing`, `dialogue_safe_area`
- Вычисление: центр bounding box обоих target-ов

#### `establishing(room_area)`
- Общий план комнаты
- Параметры: `room_area` (full_room, center, top_left, etc.), `duration_seconds`, `easing`

#### `over_the_shoulder(target, reference)`
- Кадр через плечо
- Параметры: `target`, `reference`, `offset_x`, `offset_y`, `padding`, `duration_seconds`, `easing`

### 3.2 JSON Schema

```json
{
  "type": "shot_preset",
  "preset": "close_up",
  "target": "player",
  "padding": 50,
  "duration_seconds": 1,
  "easing": "ease_in_out"
}

{
  "type": "shot_preset",
  "preset": "two_shot",
  "target_a": "player",
  "target_b": "npc_guide",
  "padding": 80,
  "duration_seconds": 1,
  "easing": "ease_in_out",
  "dialogue_safe_area": "bottom"
}
```

### 3.3 Compile-time раскрытие

```typescript
if (node.type === 'shot_preset') {
  const preset = node.params?.preset as string
  const duration = node.params?.duration_seconds ?? 1
  const easing = node.params?.easing ?? 'ease_in_out'
  
  const { target_x, target_y } = computeShotPreset(preset, node.params, cameraWidth, cameraHeight)
  
  return {
    type: 'camera_pan',
    x: target_x,
    y: target_y,
    seconds: duration,
    easing: easing
  }
}
```

### 3.4 Node Registry

```typescript
shot_preset: {
  type: 'shot_preset',
  label: 'Shot Preset',
  category: 'camera',
  fields: [
    { key: 'preset', label: 'Preset', type: 'select', options: ['close_up', 'two_shot', 'establishing', 'over_the_shoulder'], defaultValue: 'close_up' },
    { key: 'target', label: 'Target', type: 'searchable', options: [], defaultValue: '' },
    { key: 'target_a', label: 'Target A', type: 'searchable', options: [], defaultValue: '' },
    { key: 'target_b', label: 'Target B', type: 'searchable', options: [], defaultValue: '' },
    { key: 'padding', label: 'Padding', type: 'number', defaultValue: 50 },
    { key: 'duration_seconds', label: 'Duration', type: 'number', step: 0.1, defaultValue: 1 },
    { key: 'easing', label: 'Easing', type: 'select', options: ['linear', 'ease_in', 'ease_out', 'ease_in_out'], defaultValue: 'ease_in_out' }
  ],
  defaultParams: { preset: 'close_up', target: '', padding: 50, duration_seconds: 1, easing: 'ease_in_out' }
}
```

---

## 4. Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `editor/nodes/nodeRegistry.ts` | Определение `shot_preset` |
| `editor/nodes/CutsceneNodes.tsx` | Компонент `ShotPresetNode` |
| `editor/nodes/index.ts` | Регистрация |
| `editor/compileGraph.ts` | Раскрытие в `camera_pan` |
| `editor/reverseCompile.ts` | Обратный импорт (опционально, как `camera_pan`) |
| `editor/validateGraph.ts` | Проверка target и padding |

---

## 5. Оценка сложности и риска

### Сложность: **СРЕДНЯЯ** ⭐⭐
- Вычисление координат для каждого пресета
- Conditional fields в nodeRegistry (разные поля для разных preset)

### Риск: **СРЕДНИЙ**
1. Вычисление координат — unit tests для `computeShotPreset()`
2. Dialogue safe area — параметр для сдвига камеры
3. Target не найден — валидация + fallback
4. Обратный импорт — сложно восстановить пресет из `camera_pan`

---

## 6. Открытые вопросы

1. Какие ещё пресеты нужны?
2. Custom пресеты (сохранённые конфигурации)?
3. Интеграция с visual editor (preview на скриншоте)?
