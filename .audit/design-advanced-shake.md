## Feature: Advanced Shake

### Problem
Текущие shake-ноды (`camera_shake`, `shake_object`) поддерживают только magnitude и duration. Нельзя сделать направленную тряску, затухание или контроль частоты.

### Existing State
- `camera_shake`: ActionCameraShake(frames, magnitude) — случайная тряскка по X и Y.
- `shake_object`: ActionShakeObject(target, frames, magnitude) — то же самое для объекта.
- Runtime: `cutscene_runtime_step()` применяет `irandom_range(-mag, mag)` к обеим осям каждый кадр.

### Proposed UX
Расширить существующие ноды новыми полями (backward-compatible, default values сохраняют текущее поведение):

#### camera_shake / shake_object — новые поля
- `magnitude_x`: number (default 4) — если 0, нет тряски по X
- `magnitude_y`: number (default 4) — если 0, нет тряски по Y
- `decay`: select (`true`, `false`, default `false`) — magnitude уменьшается со временем
- `frequency`: number (default 1, step 1) — тряска каждые N кадров (1 = каждый кадр)

**JSON Schema:**
```json
{ "type": "camera_shake", "seconds": 1, "magnitude": 4 }
{ "type": "camera_shake", "seconds": 2, "magnitude_x": 8, "magnitude_y": 0, "decay": true, "frequency": 2 }
{ "type": "shake_object", "target": "player", "seconds": 1, "magnitude_x": 4, "magnitude_y": 4, "decay": false, "frequency": 1 }
```

**Backward compatibility:** старые JSON с полем `magnitude` работают как раньше (magnitude_x = magnitude_y = magnitude).

### Runtime Behavior
- Если `magnitude_x` не указан, но `magnitude` есть → `magnitude_x = magnitude_y = magnitude`.
- Если `magnitude_x` и `magnitude_y` указаны → используются они.
- Decay: `current_mag = magnitude * (1 - elapsed / duration)`.
- Frequency: применяем shake только когда `frame_count % frequency == 0`.
- Cleanup: убираем offset при завершении.

### Files To Change
Editor:
1. `nodes/nodeRegistry.ts` — добавить поля `magnitude_x`, `magnitude_y`, `decay`, `frequency` к `camera_shake` и `shake_object`
2. `nodes/CutsceneNodes.tsx` — обновить отображение новых полей
3. `compileGraph.ts` — передавать новые поля в action
4. `reverseCompile.ts` — восстанавливать новые поля
5. `validateGraph.ts` — валидация (magnitude >= 0, frequency >= 1)

GML:
6. `scr_cutscene_classes.gml` — обновить ActionCameraShake и ActionShakeObject конструкторы + update
7. `cutscene_action_factory.gml` — парсить новые поля

### Risks
- Изменение конструкторов ActionCameraShake/ActionShakeObject — нужно проверить, что старые вызовы не ломаются.
- ActionCameraShake уже принимает (frames, magnitude). Добавляем опциональные параметры в конец.

### Verification
- [ ] Старые сцены с camera_shake компилируются без изменений
- [ ] Новые поля экспортируются корректно
- [ ] GML: shake с decay работает
- [ ] GML: shake с frequency работает
