# Design Document: Continuity Checker (Wave 3)

## 1. Обзор фичи

### Описание
Continuity Checker — расширенная система валидации, которая проверяет логическую связность сцены перед экспортом. Отслеживает состояние актёров, музыки, камеры и других ресурсов на протяжении всей катсцены.

### Use Cases
1. Актёр используется до создания (error)
2. Музыка включена, но не восстановлена (warn)
3. Camera override не сброшен (warn)
4. `wait_until` без таймаута (warn)

---

## 2. Текущее состояние

- `validateGraph.ts` проверяет структуру, обязательные поля, связность
- Нет отслеживания порядка выполнения и состояния ресурсов

---

## 3. Предложенная реализация

### Архитектура
Расширение `validateGraph.ts`, добавляющее новый этап валидации после базовых проверок.

### 3.1 State Flow Analysis

```typescript
function analyzeStateFlow(state: RuntimeState): StateFlowAnalysis {
  // DFS от start-ноды
  // Отслеживание состояния ресурсов на каждом шаге
  // Сбор всех путей выполнения (branch true/false, parallel)
}

type ResourceState = {
  actors: Map<string, 'created' | 'destroyed' | 'unknown'>
  music: { playing: boolean; lastPlayedAt?: string; lastStoppedAt?: string }
  camera: { overridden: boolean; lastOverriddenAt?: string }
  control: { playerControlEnabled: boolean; partialControlActive: boolean }
  waitConditions: Map<string, { variable: string; hasTimeout: boolean; nodeId: string }>
}
```

### 3.2 Continuity Checks

**Actor Lifecycle**
- `actor_used_before_create` — error
- `actor_destroyed_then_used` — warn
- `actor_created_twice` — warn
- `actor_not_destroyed_at_end` — tip

**Music State**
- `music_not_restored` — warn
- `stop_music_without_play` — tip

**Camera State**
- `camera_not_reset` — warn

**Control State**
- `control_not_returned` — warn

**Wait Conditions**
- `wait_no_timeout` — warn

### 3.3 Интеграция с validateGraph

```typescript
export function validateGraph(state: RuntimeState, context?: ValidationContext): ValidationResult {
  const entries: ValidationEntry[] = []
  // ... базовые проверки ...

  if (context?.enableContinuityChecker !== false) {
    const analysis = analyzeStateFlow(state)
    const continuityIssues = performContinuityChecks(analysis, state)
    for (const issue of continuityIssues) {
      entries.push({ severity: issue.severity, nodeId: issue.nodeId, message: issue.message })
    }
  }

  return { entries, hasErrors: entries.some(e => e.severity === 'error') }
}
```

---

## 4. Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `editor/validateGraph.ts` | `analyzeStateFlow()`, `performContinuityChecks()`, типы |
| `editor/i18n/en.ts` / `ru.ts` | Ключи для новых сообщений |

---

## 5. Оценка сложности и риска

### Сложность: **СРЕДНЯЯ** ⭐⭐
- DFS с отслеживанием состояния
- Обработка branch и parallel

### Риск: **СРЕДНИЙ-ВЫСОКИЙ**
1. False positives — анализировать все пути, не только один
2. Performance — кэшировать на больших графах
3. Branch complexity — тщательное тестирование
4. External variables — whitelist или warning

---

## 6. Открытые вопросы

1. Как обработать parallel ветки? (union состояний после join)
2. Какие переменные считать "external"?
3. Нужна ли опция отключения отдельных проверок?
