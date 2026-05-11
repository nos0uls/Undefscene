# Design Document: Cinematic Beats (Wave 3 Feature)

## 1. Обзор фичи

### Описание
Cinematic Beats — это именованные маркеры смысловых моментов сцены, которые помогают:
- Структурировать большие графы по ключевым моментам
- Быстро навигировать по сцене
- Документировать режиссёрские решения
- Синхронизировать действия с важными точками

### Ключевые характеристики
- **Named markers**: каждый beat имеет уникальное имя (e.g., "reveal", "joke_hit", "door_slam")
- **Описание и теги**: опциональные метаданные для документирования
- **Цветовая кодировка**: визуальное различение beats на графе
- **Навигация**: быстрый поиск и переход к beats
- **Экспортируется**: beats попадают в runtime JSON как служебные действия `mark_beat`

### Use Cases
1. **Структурирование сцены**: разделить длинную сцену на логические части
2. **Синхронизация**: "камера панорамирует к reveal-beat"
3. **Навигация**: быстро найти "joke_hit" момент в большом графе
4. **Документирование**: "это момент, когда игрок понимает правду"
5. **Timing**: "музыка должна измениться на beat 'climax'"

---

## 2. Текущее состояние

### Что существует
- Нода `mark_node` для отметки достижения определённой точки в графе
- Система категорий нод с цветовой кодировкой
- Механизм компиляции графа с поддержкой `mark_node` действий
- Поиск и навигация по нодам в UI

### Что отсутствует
- Нода типа `beat` (или `cinematic_beat`)
- Регистрация в nodeRegistry с параметрами (beat_name, description, color, tags)
- React-компонент BeatNode с визуализацией цвета
- Логика компиляции beats в runtime actions
- Поддержка в reverseCompile для импорта beats
- Панель навигации по beats
- Фильтрация/поиск по beats

---

## 3. Предложенная реализация

### 3.1 Editor Side (TypeScript/React)

#### A. Регистрация ноды в nodeRegistry.ts

```typescript
beat: {
  type: 'beat',
  label: 'Cinematic Beat',
  category: 'meta',
  fields: [
    {
      key: 'beat_name',
      label: 'Beat Name',
      type: 'text',
      placeholder: 'e.g. reveal, joke_hit, door_slam',
      defaultValue: ''
    },
    {
      key: 'description',
      label: 'Description (optional)',
      type: 'text',
      placeholder: 'What happens at this beat?',
      defaultValue: ''
    },
    {
      key: 'color',
      label: 'Color',
      type: 'select',
      options: [
        '#FF6B6B',
        '#4ECDC4',
        '#FFE66D',
        '#95E1D3',
        '#C7CEEA',
        '#FF8B94',
        '#A8D8EA',
        '#AA96DA'
      ],
      defaultValue: '#FFE66D'
    },
    {
      key: 'tags',
      label: 'Tags (comma-separated)',
      type: 'text',
      placeholder: 'e.g. music, camera, dialogue',
      defaultValue: ''
    }
  ],
  defaultParams: {
    beat_name: '',
    description: '',
    color: '#FFE66D',
    tags: ''
  }
}
```

#### B. React-компонент BeatNode в CutsceneNodes.tsx

```typescript
export const BeatNode = memo(function BeatNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const beatName = data.params?.beat_name ?? ''
  const description = data.params?.description ?? ''
  const color = data.params?.color ?? '#FFE66D'
  const tags = data.params?.tags ?? ''

  const tagList = tags
    ? String(tags).split(',').map((t) => t.trim()).filter((t) => t.length > 0)
    : []

  const displayDesc = description.length > 40 ? description.substring(0, 40) + '...' : description

  return (
    <BaseNode
      nodeType="beat"
      selected={selected}
      style={{ borderColor: color, borderWidth: '3px' }}
    >
      <div style={{ fontWeight: 'bold', color }}>
        {beatName}
      </div>
      {displayDesc && (
        <div style={{ fontSize: '0.85em', fontStyle: 'italic' }}>{displayDesc}</div>
      )}
      {tagList.length > 0 && (
        <div style={{ fontSize: '0.75em' }}>
          {tagList.map((tag) => (
            <span key={tag} style={{ backgroundColor: color, color: '#fff', padding: '2px 6px', borderRadius: '3px', marginRight: '4px' }}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </BaseNode>
  )
})
```

#### C. Логика компиляции в compileGraph.ts

```typescript
if (node.type === 'beat') {
  const beatName = String(node.params?.beat_name ?? '').trim()
  const action: CompiledAction = {
    type: 'mark_beat',
    name: beatName
  }
  if (node.params?.description) {
    action.description = String(node.params.description)
  }
  const tags = node.params?.tags
  if (tags && typeof tags === 'string' && tags.trim().length > 0) {
    action.tags = tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
  }
  return action
}
```

#### D. Обновление reverseCompile.ts

```typescript
if (action.type === 'mark_beat') {
  const beatNode: RuntimeNode = {
    id: `beat_${ctx.serial++}`,
    type: 'beat',
    position: { x: nextX, y: 0 },
    params: {
      beat_name: String(action.name ?? '').trim(),
      description: action.description ?? '',
      color: '#FFE66D',
      tags: Array.isArray(action.tags) ? action.tags.join(', ') : ''
    }
  }
  ctx.nodes.push(beatNode)
  const sources: SourceEndpoint[] = [{ nodeId: beatNode.id, sourceHandle: undefined, targetHandle: undefined }]
  return { ok: true, sources, nextX: nextX + 150, pendingNodeName: null }
}
```

#### E. Обновление validateGraph.ts

```typescript
const REQUIRED_PARAMS: Record<string, string[]> = {
  // ... existing
  beat: ['beat_name']
}

if (node.type === 'beat') {
  const beatName = String(node.params?.beat_name ?? '').trim()
  if (!beatName) {
    entries.push({ severity: 'error', nodeId: node.id, message: 'Beat must have a name.' })
  }
  const beatNames = nodes.filter((n) => n.type === 'beat').map((n) => String(n.params?.beat_name ?? '').trim())
  const duplicates = beatNames.filter((name, idx) => beatNames.indexOf(name) !== idx)
  if (duplicates.includes(beatName)) {
    entries.push({ severity: 'warn', nodeId: node.id, message: `Beat name "${beatName}" is not unique.` })
  }
}
```

### 3.2 Runtime Side (GML)

#### Обновление cutscene_action_factory.gml

```gml
f[$ "mark_beat"] = function(_map, _fps) {
    var _name = __cutscene_json_get_string(_map, "name", "");
    return new ActionMarkNode("beat_" + _name);
};
```

---

## 4. JSON Schema

### Экспортированный JSON (runtime)

```json
{
  "schema_version": 1,
  "cutscene_id": "scene_intro",
  "settings": { "fps": 60 },
  "actions": [
    { "type": "move", "target": "player", "x": 100, "y": 200, "speed_px_sec": 60 },
    { "type": "mark_beat", "name": "reveal", "description": "Player discovers the truth" },
    { "type": "wait", "seconds": 1 },
    { "type": "dialogue", "file": "intro.yarn", "node": "Start" },
    { "type": "mark_beat", "name": "climax", "tags": ["music", "camera"] }
  ]
}
```

---

## 5. Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `editor/nodes/nodeRegistry.ts` | Добавить определение `beat` |
| `editor/nodes/CutsceneNodes.tsx` | Добавить `BeatNode` |
| `editor/nodes/index.ts` | Зарегистрировать `BeatNode` |
| `editor/compileGraph.ts` | Компиляция `beat` → `mark_beat` |
| `editor/reverseCompile.ts` | Восстановление `beat` из `mark_beat` |
| `editor/validateGraph.ts` | Валидация уникальности имён |
| `scripts/cutscene_action_factory/cutscene_action_factory.gml` | Добавить `mark_beat` |

---

## 6. Оценка сложности и риска

### Сложность: **СРЕДНЯЯ** ⭐⭐
- Требует изменений в компиляции и обратной компиляции
- Нужна валидация уникальности имён

### Риск: **НИЗКИЙ** ⚠️
- Обратная совместимость сохраняется
- Beats — это просто служебные mark_node действия
- Изоляция от основного flow

---

## 7. Открытые вопросы

1. Нужна ли панель навигации по beats? (опционально, Wave 4)
2. Должны ли beats иметь входящие/исходящие рёбра? Да, как обычные ноды.
3. Должны ли дубликаты имён блокировать экспорт? Нет, только warning.
