// validationRuleOverrides.ts — Управление пользовательскими переопределениями серьёзности правил валидации.
// Значения хранятся в localStorage и применяются к записям валидации перед отображением в LogsPanel.

export type ValidationSeverityOverride = 'error' | 'warn' | 'tip' | 'hidden'
export type ValidationRuleOverrides = Record<string, ValidationSeverityOverride>

const STORAGE_KEY = 'undefscene.validationSeverityOverrides.v1'

/**
 * Загружает переопределения серьёзности из localStorage.
 * Если данные отсутствуют или повреждены, возвращает пустой объект.
 */
export function loadValidationOverrides(): ValidationRuleOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as ValidationRuleOverrides
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * Сохраняет переопределения серьёзности в localStorage.
 */
export function saveValidationOverrides(overrides: ValidationRuleOverrides): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // localStorage может быть недоступен (например, в приватном режиме браузера).
  }
}

/**
 * Применяет переопределения к массиву записей валидации.
 * - Если override === 'hidden', запись удаляется из результата.
 * - Если override === 'error' | 'warn' | 'tip', серьёзность заменяется на это значение.
 * - Если override === 'reset' или отсутствует, запись остаётся без изменений.
 */
export function applyOverrides(
  entries: import('./validateGraph').ValidationEntry[],
  overrides: ValidationRuleOverrides
): import('./validateGraph').ValidationEntry[] {
  const result: import('./validateGraph').ValidationEntry[] = []
  for (const entry of entries) {
    if (!entry.ruleId) {
      result.push(entry)
      continue
    }
    const override = overrides[entry.ruleId]
    if (override === 'hidden') {
      // Пропускаем скрытую запись — не включаем в результат.
      continue
    }
    if (override === 'error' || override === 'warn' || override === 'tip') {
      result.push({ ...entry, severity: override })
      continue
    }
    result.push(entry)
  }
  return result
}

/**
 * Удаляет все переопределения серьёзности из localStorage.
 */
export function resetValidationOverrides(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // localStorage может быть недоступен.
  }
}
