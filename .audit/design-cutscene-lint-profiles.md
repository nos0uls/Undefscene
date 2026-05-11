# Design Document: Cutscene Lint Profiles (Wave 3)

## 1. Обзор фичи

### Описание
Cutscene Lint Profiles — система конфигурируемых профилей валидации, позволяющая выбирать уровень строгости проверок в зависимости от типа и стадии разработки сцены.

### Профили
- **`prototype`** — минимум ошибок (быстрое прототипирование)
- **`production`** — строгая проверка cleanup (готовые сцены)
- **`cinematic`** — проверка timing, camera, dialogue
- **`interactive`** — проверка partial control, wait conditions

---

## 2. Текущее состояние

- Единый набор проверок для всех сцен
- Нет способа отключить отдельные проверки
- Нет способа изменить серьёзность проверки

---

## 3. Предложенная реализация

### 3.1 Data Structures

```typescript
type LintRule = {
  id: string
  severity: 'error' | 'warn' | 'tip' | 'off'
  options?: Record<string, unknown>
}

type LintProfile = {
  id: string
  label: string
  description: string
  rules: Record<string, LintRule>
  version: 1
}
```

### 3.2 Встроенные профили

```typescript
const BUILTIN_PROFILES: Record<string, LintProfile> = {
  prototype: {
    id: 'prototype',
    label: 'Prototype',
    description: 'Minimal checks for rapid prototyping',
    version: 1,
    rules: {
      'missing_start_node': { id: 'missing_start_node', severity: 'error' },
      'missing_end_node': { id: 'missing_end_node', severity: 'error' },
      'actor_used_before_create': { id: 'actor_used_before_create', severity: 'off' },
      'music_not_restored': { id: 'music_not_restored', severity: 'off' },
      'camera_not_reset': { id: 'camera_not_reset', severity: 'off' }
    }
  },
  production: {
    id: 'production',
    label: 'Production',
    description: 'Strict checks for production-ready cutscenes',
    version: 1,
    rules: {
      'missing_start_node': { id: 'missing_start_node', severity: 'error' },
      'actor_used_before_create': { id: 'actor_used_before_create', severity: 'error' },
      'music_not_restored': { id: 'music_not_restored', severity: 'warn' },
      'camera_not_reset': { id: 'camera_not_reset', severity: 'warn' },
      'control_not_returned': { id: 'control_not_returned', severity: 'warn' }
    }
  }
}
```

### 3.3 Интеграция с Preferences

```typescript
type Preferences = {
  // ... existing fields ...
  lintProfile: string
  customLintProfiles?: Record<string, LintProfile>
}
```

### 3.4 Интеграция с Validation

```typescript
export type ValidationContext = {
  // ... existing ...
  lintProfile?: LintProfile
  disabledRules?: string[]
}

function isRuleEnabled(profile: LintProfile, ruleId: string, disabled?: string[]): boolean {
  if (disabled?.includes(ruleId)) return false
  const rule = profile.rules[ruleId]
  return rule && rule.severity !== 'off'
}
```

### 3.5 UI

- **ProfileSelector** — select в TopMenuBar или Preferences
- **ProfileEditor** — в PreferencesModal (редактирование severity для каждого rule)
- **ProfileIndicator** — показывает текущий профиль в LogsPanel

---

## 4. Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `editor/runtimeTypes.ts` или `lintTypes.ts` | Типы `LintRule`, `LintProfile`, `BUILTIN_PROFILES` |
| `editor/validateGraph.ts` | Использование профиля |
| `editor/usePreferences.ts` | Поле `lintProfile` |
| `editor/PreferencesModal.tsx` | UI выбора и редактирования профилей |
| `editor/i18n/en.ts` / `ru.ts` | Локализация |

---

## 5. Оценка сложности и риска

### Сложность: **СРЕДНЯЯ** ⭐⭐
- Рефакторинг validateGraph
- Новые UI компоненты

### Риск: **НИЗКИЙ-СРЕДНИЙ**
1. Backward compatibility — default `production`
2. Performance — кэшировать enabled rules
3. User confusion — warning при выборе `prototype`
4. Profile migration — версионирование

---

## 6. Открытые вопросы

1. Пользовательские профили? (MVP: только встроенные)
2. Как обработать новые rules при обновлении редактора?
3. Import/export профилей?
