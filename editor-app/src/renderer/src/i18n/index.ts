// index.ts — единая точка входа для будущего i18n слоя.
// Сейчас экспортируем словари и простые типы,
// чтобы следующие задачи могли подключать их без лишней перестройки структуры.

// Типы для статического использования
export type SupportedLanguage = 'en' | 'ru'
export type TranslationDictionary = {
  [key: string]: unknown
}

// Кэш для загруженных словарей
const dictionaryCache = new Map<SupportedLanguage, TranslationDictionary>()

// Предзагрузка словаря для языка (вызывать при старте приложения)
export async function preloadLanguage(language: SupportedLanguage): Promise<void> {
  if (dictionaryCache.has(language)) {
    return
  }

  try {
    let dictionary: TranslationDictionary
    if (language === 'ru') {
      const module = await import('./ru')
      dictionary = module.ru
    } else {
      const module = await import('./en')
      dictionary = module.en
    }
    dictionaryCache.set(language, dictionary)
  } catch (error) {
    console.error(`Failed to preload dictionary for language: ${language}`, error)
    // Fallback to English if loading fails
    try {
      const module = await import('./en')
      dictionaryCache.set(language, module.en)
    } catch (fallbackError) {
      console.error('Failed to load fallback English dictionary', fallbackError)
    }
  }
}

// Возвращаем словарь для текущего языка.
// Если язык неизвестен, безопасно падаем обратно в English.
// Синхронная версия - требует предварительной загрузки через preloadLanguage.
export function getDictionary(language: SupportedLanguage): TranslationDictionary {
  const cached = dictionaryCache.get(language)
  if (cached) {
    return cached
  }

  // Если словарь не загружен, возвращаем пустой объект как fallback
  // В реальном использовании это не должно происходить, если preloadLanguage вызван правильно
  console.warn(`Dictionary for language "${language}" not preloaded, returning empty object`)
  return {}
}

// Читаем строку по пути вида "preferences.language".
// Такой helper позволяет постепенно переводить UI,
// не таща большую i18n-библиотеку ради простого desktop editor.
//
// Поддерживает интерполяцию параметров: если передан объект,
// подменяет плейсхолдеры {key} на значения.
// Второй аргумент может быть fallback-строкой (backward compat) или params-объектом.
export function translatePath(
  dictionary: TranslationDictionary,
  path: string,
  fallbackOrParams?: string | Record<string, string | number | undefined>,
  maybeFallback?: string
): string {
  const params = typeof fallbackOrParams === 'object' ? fallbackOrParams : undefined
  const fallback = typeof fallbackOrParams === 'string' ? fallbackOrParams : maybeFallback

  const value = path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[key]
  }, dictionary)

  let result = typeof value === 'string' ? value : (fallback ?? path)
  if (params) {
    result = result.replace(/\{(\w+)\}/g, (_, key) => {
      const replacement = params[key]
      return replacement !== undefined && replacement !== null ? String(replacement) : `{${key}}`
    })
  }
  return result
}

// Удобный фабричный helper: получаем короткую функцию t(path[, fallbackOrParams][, fallback]).
export function createTranslator(
  language: SupportedLanguage
): (
  path: string,
  fallbackOrParams?: string | Record<string, string | number | undefined>,
  maybeFallback?: string
) => string {
  const dictionary = getDictionary(language)
  return (path, fallbackOrParams, maybeFallback) =>
    translatePath(dictionary, path, fallbackOrParams, maybeFallback)
}
