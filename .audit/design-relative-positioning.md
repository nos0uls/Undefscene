## Feature: Relative Positioning

### Problem
Все move/set_position используют абсолютные координаты. Часто нужно двигаться относительно текущей позиции или другого объекта.

### Existing State
- `move`: `{ target, x, y, speed_px_sec, collision }` — x/y абсолютные.
- `set_position`: `{ target, x, y }` — x/y абсолютные.
- GML ActionMove/ActionSetXY принимают абсолютные x, y.
- Roadmap предлагает три подхода: Move To Target Offset, Set Position Relative, Add Position.
- Пользователь выбрал: **отдельные ноды** (не флаг к существующим).

### Proposed UX

#### 1. `move_relative`
Двигает актёра относительно текущей позиции.

**Поля:**
- target (searchable)
- dx (number)
- dy (number)
- speed_px_sec (number)
- collision (select: true/false)

**JSON:**
```json
{ "type": "move_relative", "target": "player", "dx": 32, "dy": 0, "speed_px_sec": 60, "collision": false }
```

**Runtime:**
- При start вычисляем target_x = inst.x + dx, target_y = inst.y + dy.
- Blocking, как обычный Move.

#### 2. `set_position_relative`
Мгновенно сдвигает объект относительно текущей позиции.

**Поля:**
- target (searchable)
- dx (number)
- dy (number)

**JSON:**
```json
{ "type": "set_position_relative", "target": "player", "dx": 0, "dy": -48 }
```

**Runtime:**
- При start: inst.x += dx, inst.y += dy.
- Instant.

#### 3. `move_to_target_offset` (roadmap: Move To Target Offset)
Двигает актёра к позиции другого объекта с offset.

**Поля:**
- target (searchable) — кто двигается
- reference (searchable) — относительно кого
- offset_x (number)
- offset_y (number)
- speed_px_sec (number)
- collision (select)
- stop_distance (number, optional)

**JSON:**
```json
{ "type": "move_to_target_offset", "target": "player", "reference": "npc", "offset_x": -32, "offset_y": 0, "speed_px_sec": 60, "collision": false }
```

**Runtime:**
- При каждом update вычисляем target_x = reference.x + offset_x, target_y = reference.y + offset_y.
- Двигаемся к этой точке.
- Blocking.

#### 4. `set_position_to_target` (roadmap: Set Position Relative)
Мгновенно ставит объект относительно другого.

**Поля:**
- target (searchable)
- reference (searchable)
- offset_x (number)
- offset_y (number)
- copy_facing (select: true/false)

**JSON:**
```json
{ "type": "set_position_to_target", "target": "effect", "reference": "player", "offset_x": 0, "offset_y": -32 }
```

**Runtime:**
- При start: inst.x = ref.x + offset_x, inst.y = ref.y + offset_y.
- Instant.

### MVP Scope
Начать с `move_relative` и `set_position_relative` (простейшие, не требуют reference resolution каждый кадр). Затем `move_to_target_offset` и `set_position_to_target`.

### Files To Change
Editor:
1. `editor-app/src/renderer/src/editor/nodes/nodeRegistry.ts` — 4 новых ноды
2. `editor-app/src/renderer/src/editor/nodes/CutsceneNodes.tsx` — 4 React компонента
3. `editor-app/src/renderer/src/editor/nodes/index.ts` — импорты + маппинг
4. `editor-app/src/renderer/src/editor/compileGraph.ts` — nodeToAction
5. `editor-app/src/renderer/src/editor/reverseCompile.ts` — reverse import
6. `editor-app/src/renderer/src/editor/validateGraph.ts` — validation

GML:
7. `scr_cutscene_classes.gml` — ActionMoveRelative, ActionSetPositionRelative (или модифицировать ActionMove/ActionSetXY)
8. `cutscene_action_factory.gml` — register new types

### Risks
- Modifying GML ActionMove/ActionSetXY constructors affects backward compatibility.
- Safer: create new ActionMoveRelative and ActionSetPositionRelative classes.
- move_to_target_offset requires resolving reference target each frame — could fail if reference is destroyed.

### Verification
- [ ] Editor typecheck/build
- [ ] Export JSON with relative actions
- [ ] Reverse import
- [ ] GML: move_relative computes correct destination
- [ ] GML: set_position_relative applies offset instantly
