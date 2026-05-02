// index.ts — единая точка входа для будущего i18n слоя.
// Сейчас экспортируем словари и простые типы,
// чтобы следующие задачи могли подключать их без лишней перестройки структуры.

import { en } from './en'
import { ru } from './ru'

export const dictionaries = {
  en,
  ru
} as const

export type SupportedLanguage = keyof typeof dictionaries
export type TranslationDictionary = (typeof dictionaries)[SupportedLanguage]

// Возвращаем словарь для текущего языка.
// Если язык неизвестен, безопасно падаем обратно в English.
export function getDictionary(language: SupportedLanguage): TranslationDictionary {
  return dictionaries[language] ?? dictionaries.en
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
