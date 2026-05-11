# Design Document: Action Templates / Macros (Wave 3)

## 1. Обзор фичи

### Описание
Action Templates / Macros — переиспользуемые мини-сценарии (подграфы), которые можно вставлять в основной граф как отдельные ноды. Вместо копирования одной и той же последовательности действий, режиссёр создаёт шаблон один раз и вставляет его несколько раз с разными параметрами.

### Use Cases
1. "Персонаж входит слева" — один шаблон, множество применений
2. "Диалог с реакцией" — стандартная последовательность
3. Consistent стиль постановки

---

## 2. Текущее состояние

- Нет поддержки группировки нод или подграфов
- Граф линейный с parallel и branch, но без вложенности
- Нет compile-time раскрытия

---

## 3. Предложенная реализация

### Архитектура
Editor-side feature с compile-time раскрытием. Runtime не знает о шаблонах.

### 3.1 Структура шаблона

```typescript
interface CutsceneTemplate {
  id: string
  name: string
  description: string
  nodes: RuntimeNode[]
  edges: RuntimeEdge[]
  parameters: TemplateParameter[]
  entryNodeId: string
  exitNodeId: string
}

interface TemplateParameter {
  key: string
  label: string
  type: 'actor' | 'number' | 'string' | 'select'
  defaultValue: unknown
  options?: string[]
}
```

### 3.2 Примеры шаблонов

#### Character Enters From Left
```
[set_position: $character @ (-100, y_position)]
  → [animate: $character, walk_left]
  → [move: $character @ (200, y_position), $speed]
  → [set_facing: $character, right]
```

#### Dialogue Reaction Shot
```
[camera_pan_obj: $character, $camera_duration]
  → [emote: $character, $reaction_emote]
  → [wait: 1]
```

### 3.3 Использование в графе

```json
{
  "type": "template_instance",
  "template_id": "tpl_character_enters",
  "params": {
    "character": "npc_guide",
    "speed": 80,
    "duration": 2.5,
    "y_position": 200
  }
}
```

### 3.4 Compile-time раскрытие

```typescript
if (node.type === 'template_instance') {
  const templateId = node.params?.template_id as string
  const instanceParams = node.params?.params as Record<string, unknown>
  const template = getTemplate(templateId)
  if (!template) {
    return { ok: false, error: `Template "${templateId}" not found` }
  }
  const expandedGraph = expandTemplate(template, instanceParams)
  return compileGraph(expandedGraph)
}

function expandTemplate(template: CutsceneTemplate, instanceParams: Record<string, unknown>): RuntimeState {
  const nodes = template.nodes.map(n => {
    const newNode = { ...n }
    if (newNode.params) {
      for (const [key, value] of Object.entries(newNode.params)) {
        if (typeof value === 'string' && value.startsWith('$')) {
          const paramKey = value.slice(1)
          if (paramKey in instanceParams) {
            newNode.params[key] = instanceParams[paramKey]
          }
        }
      }
    }
    return newNode
  })
  return { nodes, edges: template.edges }
}
```

### 3.5 UI

- **TemplateLibraryPanel.tsx** — панель для управления шаблонами (Create, Edit, Delete, Duplicate)
- **TemplateEditorModal.tsx** — модальное окно для редактирования шаблона
- **TemplateInstanceNode** — нода на canvas с названием шаблона и параметрами

---

## 4. Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `editor/TemplateLibraryPanel.tsx` | **Новый** — управление шаблонами |
| `editor/TemplateEditorModal.tsx` | **Новый** — редактирование |
| `editor/nodes/nodeRegistry.ts` | `template_instance` |
| `editor/nodes/CutsceneNodes.tsx` | `TemplateInstanceNode` |
| `editor/nodes/index.ts` | Регистрация |
| `editor/compileGraph.ts` | `expandTemplate()` и раскрытие |
| `editor/validateGraph.ts` | Проверка template_id, циклических зависимостей |
| `editor/templateStorage.ts` | **Новый** — сохранение/загрузка |

---

## 5. Оценка сложности и риска

### Сложность: **ВЫСОКАЯ** ⭐⭐⭐
- Новые компоненты (Library, Editor, Instance)
- Логика раскрытия с параметризацией
- Хранение шаблонов

### Риск: **ВЫСОКИЙ**
1. Рекурсивные шаблоны — проверка циклов
2. Параметризация — явное отображение в UI
3. Обратный импорт — сложно восстановить шаблон
4. Производительность — кэшировать раскрытие
5. Хранение — localStorage или файловая система

---

## 6. Открытые вопросы

1. Где хранить шаблоны? (localStorage, FS, облако)
2. Версионность шаблонов?
3. Вложенные шаблоны?
4. Экспорт/импорт шаблонов между проектами?
