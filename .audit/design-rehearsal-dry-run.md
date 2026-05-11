# Design Document: Rehearsal / Dry Run Mode (Wave 3)

## 1. Обзор фичи

### Описание
Режим проигрывания катсцены без постоянных побочных эффектов (side effects). Позволяет безопасно preview сложную катсцену, тестировать timing и логику без перезапуска игры.

### Use Cases
1. Безопасный preview сложной катсцены без поломки сейва
2. QA-тестирование timing и логики
3. Проверка развилок и условий
4. Отладка интерактивных сцен

---

## 2. Текущее состояние

### Editor
- Нет preview режима
- Экспорт JSON всегда "боевой"

### GML Runtime
- Все actions имеют реальные побочные эффекты:
  - `ActionActorCreate` создаёт реальные instances
  - `ActionDialogue` запускает реальный диалог
  - `ActionRunFunction` вызывает реальные функции
  - Глобальные переменные изменяются реально
- Нет механизма отката или имитации

---

## 3. Предложенная реализация

### 3.1 Editor Side

#### Export Settings

```typescript
export type ExportedCutscene = {
  schema_version: 1
  cutscene_id: string
  settings: {
    fps: number
    dry_run?: {
      enabled: boolean
      disable_global_writes?: boolean
      disable_room_transition?: boolean
      mock_dialogue?: boolean
      mock_functions?: boolean
      auto_restore_state?: boolean
    }
  }
  actions: CompiledAction[]
}
```

#### UI
- Чекбокс "Dry Run Mode" в ExportPanel / SettingsPanel
- Опции: Disable Global Writes, Disable Room Transition, Mock Dialogue, Mock Functions, Auto Restore State

### 3.2 GML Runtime Side

#### Dry Run Mode Manager

```gml
// obj_cutsceneManager Create_0.gml
dry_run_mode = false
dry_run_settings = {
  disable_global_writes: false,
  disable_room_transition: false,
  mock_dialogue: false,
  mock_functions: false,
  auto_restore_state: false
}
dry_run_snapshot = undefined
```

#### State Snapshot System

```gml
/// @function __cutscene_create_state_snapshot()
function __cutscene_create_state_snapshot() {
  var _snap = {
    global_vars: {},
    actors: {},
    camera_x: camera_get_view_x(view_camera[0]),
    camera_y: camera_get_view_y(view_camera[0]),
    music_playing: false,
    music_volume: 1.0
  }
  // Сохраняем важные глобальные переменные
  return _snap
}

/// @function __cutscene_restore_state_snapshot(_snapshot)
function __cutscene_restore_state_snapshot(_snapshot) {
  if (!is_struct(_snapshot)) return
  // Восстанавливаем глобальные переменные, камеру
}
```

#### Modified Action Classes

**ActionActorCreate:**
```gml
start = function(manager) {
  if (manager.dry_run_mode) {
    var _phantom = { x: actor_x, y: actor_y, is_phantom: true, object_index: -1 }
    manager.actor_map[$ actor_name] = _phantom
    return
  }
  // Обычное создание
}
```

**ActionRunFunction:**
```gml
start = function(manager) {
  if (manager.dry_run_mode && manager.dry_run_settings.mock_functions) {
    show_debug_message("[CUTSCENE DRY RUN] Skipping function call: " + string(fn))
    return
  }
  // Обычный вызов
}
```

**ActionDialogue:**
```gml
start = function(manager) {
  if (manager.dry_run_mode && manager.dry_run_settings.mock_dialogue) {
    show_debug_message("[CUTSCENE DRY RUN] Skipping dialogue: " + string(file))
    return
  }
  // Обычный запуск диалога
}
```

**ActionSetProperty:**
```gml
start = function(manager) {
  if (manager.dry_run_mode && manager.dry_run_settings.disable_global_writes) {
    if (target_kind == "global") {
      show_debug_message("[CUTSCENE DRY RUN] Skipping global write: " + string(prop))
      return
    }
  }
  // Обычная установка
}
```

#### Cleanup & Restore

```gml
finish_cutscene = function() {
  if (dry_run_mode && dry_run_settings.auto_restore_state && is_struct(dry_run_snapshot)) {
    __cutscene_restore_state_snapshot(dry_run_snapshot)
    show_debug_message("[CUTSCENE DRY RUN] State restored from snapshot")
  }
  // ... остальной cleanup ...
}
```

---

## 4. JSON Schema

```json
{
  "schema_version": 1,
  "cutscene_id": "test_dry_run",
  "settings": {
    "fps": 60,
    "dry_run": {
      "enabled": true,
      "disable_global_writes": true,
      "disable_room_transition": true,
      "mock_dialogue": true,
      "mock_functions": false,
      "auto_restore_state": true
    }
  },
  "actions": [...]
}
```

---

## 5. Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `editor/compileGraph.ts` | Тип `ExportedCutscene` + dry_run settings |
| `editor/ExportPanel.tsx` | UI для dry run |
| `editor/validateGraph.ts` | Warning при dry_run + room_transition |
| `scr_cutscene_dry_run_snapshot.gml` | **Новый** — snapshot helpers |
| `obj_cutsceneManager/Create_0.gml` | dry_run_mode, loading, cleanup |
| `scr_cutscene_classes.gml` | Проверки dry_run_mode в actions |

---

## 6. Оценка сложности и риска

### Сложность: **СРЕДНИЙ-ВЫСОКИЙ** ⭐⭐⭐
- Snapshot система
- Модификация всех action classes
- Перехват room_goto

### Риск: **СРЕДНИЙ**
1. Phantom actors — проверка `is_phantom` перед использованием
2. Неполное восстановление состояния — whitelist переменных
3. Конфликт room transition — флаг + проверка

---

## 7. Открытые вопросы

1. Как сохранять состояние диалога? (имитация vs пропуск)
2. Какие глобальные переменные сохранять? (whitelist или конфигурируемый)
3. Нужен ли встроенный preview в редакторе?
