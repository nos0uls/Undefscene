# Design Document: Timing Lanes (Wave 3)

## 1. Обзор фичи

### Описание
Timing Lanes — это визуальный overlay (timeline) поверх графа катсцены, который показывает:
- Сколько времени занимает каждое действие
- Какие действия блокирующие (blocking), а какие параллельные
- Когда заканчиваются параллельные ветки
- Общую длительность сцены

### Use Cases
1. Балансировка параллельных действий (одна ветка заканчивается раньше другой)
2. Поиск неожиданных пауз
3. Синхронизация камеры, движения и диалога
4. Оценка общего timing сцены

---

## 2. Текущее состояние

### Editor
- `FlowCanvas.tsx` — основной граф нод (React Flow)
- `compileGraph.ts` — конвертирует граф в actions[] с временными параметрами
- Нет визуального timeline или lanes

### GML Runtime
- Каждый action имеет поле `update()`, которое возвращает `true` когда завершено
- Blocking actions задерживают следующий action
- Non-blocking (параллельные) выполняются одновременно
- Нет встроенного способа узнать duration без анализа параметров

### Данные о длительности
- `wait` — явно `seconds`
- `move` — вычисляется как `distance / speed_px_sec`
- `camera_pan` — явно `seconds`
- `tween` — явно `seconds` или `duration_frames / fps`
- `animate` — зависит от спрайта (требует метаданных)
- Параллельные ветки — максимум из вложенных

---

## 3. Предложенная реализация

### Архитектура
Timing Lanes — это **editor-only визуальный overlay**. Не сохраняется в JSON, не передаётся в runtime.

### 3.1 Модель данных

```typescript
type TimingSegment = {
  nodeId: string
  nodeName: string
  startTime: number // seconds
  duration: number // seconds
  isBlocking: boolean
  actionType: string
  color: string
}

type TimingLane = {
  laneId: string
  laneType: 'actor' | 'camera' | 'audio' | 'dialogue'
  laneLabel: string
  segments: TimingSegment[]
  totalDuration: number
}

type TimingData = {
  lanes: TimingLane[]
  totalDuration: number
  fps: number
}
```

### 3.2 Модуль calculateTimingData.ts

```typescript
function calculateTimingData(state: RuntimeState, fps: number): TimingData {
  // 1. Обходим граф от start до end
  // 2. Для каждого action вычисляем duration
  // 3. Группируем по lanes (actor, camera, audio, dialogue)
  // 4. Вычисляем startTime для каждого segment
  // 5. Возвращаем TimingData
}

function getActionDuration(node: RuntimeNode, fps: number): number {
  switch (node.type) {
    case 'wait': return node.params?.seconds ?? 0
    case 'move': {
      // Требует знания текущей позиции — показываем ~
      const dist = /* вычислить из graph */ 0
      const speed = node.params?.speed_px_sec ?? 60
      return dist / speed
    }
    case 'camera_pan': return node.params?.seconds ?? 0
    case 'tween': return (node.params?.seconds ?? 0) || ((node.params?.duration_frames ?? 0) / fps)
    case 'animate': return 0 // Требует sprite metadata
    case 'parallel_start': {
      // Рекурсивно вычисляем максимум из веток
      return 0
    }
    default: return 0 // instant
  }
}

function getActionLane(node: RuntimeNode): string | null {
  switch (node.type) {
    case 'move':
    case 'follow_path':
    case 'set_position':
    case 'animate':
    case 'set_facing':
    case 'emote':
    case 'jump':
      return 'actor'
    case 'camera_track':
    case 'camera_pan':
    case 'camera_shake':
    case 'tween_camera':
      return 'camera'
    case 'play_sfx':
    case 'play_music':
    case 'music_volume':
      return 'audio'
    case 'dialogue':
    case 'wait_for_dialogue':
      return 'dialogue'
    default:
      return null
  }
}
```

### 3.3 UI: TimingLanesPanel.tsx

```typescript
export function TimingLanesPanel({
  timingData,
  selectedNodeId,
  onSelectNode,
  pixelsPerSecond
}: {
  timingData: TimingData | null
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
  pixelsPerSecond: number
}): React.JSX.Element {
  // SVG с lanes и segments
  // Каждый segment — прямоугольник:
  //   x = startTime * pixelsPerSecond
  //   width = duration * pixelsPerSecond
  // Hover показывает info tooltip
  // Click выбирает node в графе
}
```

### 3.4 Интеграция в FlowCanvas

```typescript
const timingData = useMemo(() => {
  return calculateTimingData(runtimeState, fps)
}, [runtimeState, fps])

// Показываем TimingLanesPanel как отдельную панель снизу
```

---

## 4. JSON Schema

Timing lanes — **editor-only**, не сохраняются в JSON.

---

## 5. Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `editor/calculateTimingData.ts` | **Новый** — вычисление duration |
| `editor/TimingLanesPanel.tsx` | **Новый** — UI overlay |
| `editor/FlowCanvas.tsx` | Интеграция панели |
| `editor/PreferencesContext.tsx` | `showTimingLanes`, `timingLanesPixelsPerSecond` |

---

## 6. Оценка сложности и риска

### Сложность: **СРЕДНЯЯ** ⭐⭐
- Вычисление duration для каждого action
- Неизвестная длительность у некоторых actions (`run_function`, `wait_for_interact`)
- Параллельные ветки требуют рекурсивного вычисления
- `move` требует знания текущей позиции

### Риск: **СРЕДНИЙ**
1. **Неточность**: `move` и `animate` без метаданных — показывать "~"
2. **Производительность**: кэшировать результат
3. **Визуальный беспорядок**: фильтр/сворачивание lanes

### Решения
- Для неизвестной длительности: показывать "?" или эвристику
- Для `move`: показывать "~" (примерно)
- Кэшировать timingData, пересчитывать только при изменении графа

---

## 7. Открытые вопросы

1. Где показывать TimingLanesPanel? (вкладка снизу, боковая панель, модальное окно?)
2. Как обрабатывать guard_global (условные ветки)?
3. Как обрабатывать branch (две независимые ветки)?
4. Нужна ли информация о sprite metadata для точного `animate`?
