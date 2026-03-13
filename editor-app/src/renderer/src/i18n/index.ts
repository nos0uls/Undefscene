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
export function translatePath(
  dictionary: TranslationDictionary,
  path: string,
  fallback?: string
): string {
  const value = path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[key]
  }, dictionary)

  return typeof value === 'string' ? value : (fallback ?? path)
}

// Удобный фабричный helper: получаем короткую функцию t(path).
export function createTranslator(language: SupportedLanguage): (path: string, fallback?: string) => string {
  const dictionary = getDictionary(language)
  return (path: string, fallback?: string) => translatePath(dictionary, path, fallback)
}
