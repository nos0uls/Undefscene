/**
 * Сравнивает два объекта параметров (Record<string, unknown>).
 * Используется для предотвращения лишних ререндеров в React Flow,
 * так как xyflow часто клонирует объекты data.
 */
export function isEqualParams(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined
): boolean {
  if (!a && !b) return true
  if (a === b) return true
  if (!a || !b) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((k) => {
    const valA = a[k]
    const valB = b[k]
    if (valA === valB) return true
    if (Array.isArray(valA) && Array.isArray(valB)) {
      if (valA.length !== valB.length) return false
      return valA.every((v, i) => v === valB[i])
    }
    // Для вложенных объектов (если появятся) можно добавить рекурсию,
    // но сейчас параметры плоские или содержат массивы строк.
    return false
  })
}
