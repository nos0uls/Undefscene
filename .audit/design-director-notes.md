# Design Document: Director Notes (Wave 3)

## 1. Обзор фичи

### Описание
Director Notes — это "плавающие" текстовые заметки на графе катсцены, которые видны только в редакторе и не экспортируются в runtime. Они помогают:
- Оставлять комментарии для других членов команды
- Документировать режиссёрские решения
- Помечать места, требующие доработки
- Описывать intent сцены

### Ключевые характеристики
- **Плавающие**: не подключены к графу (нет входящих/исходящих рёбер)
- **Незаметные для runtime**: не попадают в экспорт JSON
- **Цветовая кодировка**: разные цвета для разных типов заметок (note, warning, todo, idea)
- **Форматированный текст**: поддержка многострочного текста

### Use Cases
1. "TODO: добавить анимацию удивления"
2. "NOTE: здесь камера должна быть медленной"
3. "WARNING: проверить timing диалога"
4. "IDEA: попробовать другой ракурс"

---

## 2. Текущее состояние

### Что существует
- Нет системы комментариев/заметок в редакторе
- Нет плавающих элементов на canvas
- Есть система категорий нод, но нет категории для заметок

### Что отсутствует
- Нода типа `director_note`
- React-компонент для отображения заметки
- Логика фильтрации (показать/скрыть заметки)
- Панель списка заметок

---

## 3. Предложенная реализация

### 3.1 Editor Side (TypeScript/React)

#### A. Регистрация ноды в nodeRegistry.ts

```typescript
director_note: {
  type: 'director_note',
  label: 'Director Note',
  category: 'meta',
  fields: [
    {
      key: 'note_type',
      label: 'Note Type',
      type: 'select',
      options: ['note', 'warning', 'todo', 'idea'],
      defaultValue: 'note'
    },
    {
      key: 'text',
      label: 'Text',
      type: 'text',
      placeholder: 'Enter your note here...',
      defaultValue: ''
    },
    {
      key: 'author',
      label: 'Author (optional)',
      type: 'text',
      placeholder: 'Your name',
      defaultValue: ''
    }
  ],
  defaultParams: {
    note_type: 'note',
    text: '',
    author: ''
  }
}
```

#### B. React-компонент DirectorNoteNode

```typescript
export const DirectorNoteNode = memo(function DirectorNoteNode({
  data,
  selected
}: CutsceneNodeProps): React.JSX.Element {
  const noteType = data.params?.note_type ?? 'note'
  const text = data.params?.text ?? ''
  const author = data.params?.author ?? ''

  const colorMap: Record<string, string> = {
    note: '#FFE66D',
    warning: '#FF6B6B',
    todo: '#4ECDC4',
    idea: '#AA96DA'
  }

  const iconMap: Record<string, string> = {
    note: 'N',
    warning: '!',
    todo: 'T',
    idea: 'I'
  }

  const color = colorMap[noteType] ?? '#FFE66D'
  const displayText = text.length > 60 ? text.substring(0, 60) + '...' : text

  return (
    <BaseNode
      nodeType="director_note"
      selected={selected}
      style={{
        backgroundColor: color + '33',
        borderColor: color,
        borderWidth: '2px',
        borderStyle: 'dashed',
        minWidth: '120px',
        maxWidth: '200px'
      }}
    >
      <div style={{ fontWeight: 'bold', color, fontSize: '0.9em' }}>
        {iconMap[noteType]} {noteType.toUpperCase()}
      </div>
      <div style={{ fontSize: '0.85em', whiteSpace: 'pre-wrap' }}>{displayText}</div>
      {author && <div style={{ fontSize: '0.75em', color: '#888' }}>— {author}</div>}
    </BaseNode>
  )
})
```

#### C. Логика компиляции в compileGraph.ts

```typescript
if (node.type === 'director_note') {
  // Director notes НЕ экспортируются в runtime JSON
  // Они только для editor-side документирования
  return null
}
```

#### D. Фильтрация в FlowCanvas

Добавить toggle "Show Director Notes" в toolbar.
Если выключено — скрывать ноды типа `director_note` из viewport.

---

## 4. JSON Schema

Director notes НЕ экспортируются в runtime JSON.
Они сохраняются только в editor state:

```json
{
  "id": "note_1",
  "type": "director_note",
  "position": { "x": 400, "y": 200 },
  "params": {
    "note_type": "todo",
    "text": "Add surprise animation here",
    "author": "Director"
  }
}
```

---

## 5. Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `editor/nodes/nodeRegistry.ts` | Добавить `director_note` в baseNodes |
| `editor/nodes/CutsceneNodes.tsx` | Добавить `DirectorNoteNode` компонент |
| `editor/nodes/index.ts` | Импорт и регистрация `DirectorNoteNode` |
| `editor/compileGraph.ts` | Игнорировать `director_note` при компиляции |
| `editor/FlowCanvas.tsx` | Toggle для показа/скрытия заметок |

---

## 6. Оценка сложности и риска

### Сложность: **НИЗКАЯ** ⭐
- Editor-only, нет runtime изменений
- Простой компонент без логики
- Нет валидации

### Риск: **НИЗКИЙ** ⚠️
- Не влияет на runtime
- Не ломает существующий функционал
- Легко удалить если не нужно

---

## 7. Открытые вопросы

1. Нужна ли панель списка всех заметок? (опционально)
2. Нужна ли возможность прикреплять заметку к конкретной ноде (anchor)?
3. Нужна ли поддержка @mentions?
