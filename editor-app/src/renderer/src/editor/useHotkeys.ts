import { useEffect } from 'react'
import type { EditorKeybindings, HotkeyActionId } from './usePreferences'

// Один обработчик hotkey.
// actionId нужен для чтения combo из preferences,
// а allowInInput помогает не ломать ввод текста в полях inspector.
type HotkeyHandler = {
  actionId: HotkeyActionId
  handler: () => void
  allowInInput?: boolean
}

// Пропсы хука горячих клавиш.
type UseHotkeysOptions = {
  // Актуальные keybindings из preferences.json.
  keybindings: EditorKeybindings

  // Список обработчиков, которые реально подключаем в этом месте.
  handlers: HotkeyHandler[]
}

// Нормализуем combo в простой формат для сравнения.
// Держим синтаксис коротким: Ctrl+Shift+I, Ctrl+1, Space, F11.
export function normalizeCombo(combo: string): string {
  return combo
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join('+')
}

// Строим combo из KeyboardEvent.
// Используем code для букв/цифр, чтобы сочетание не зависело от раскладки клавиатуры.
export function comboFromEvent(event: KeyboardEvent): string {
  const parts: string[] = []

  if (event.ctrlKey || event.metaKey) parts.push('ctrl')
  if (event.shiftKey) parts.push('shift')
  if (event.altKey) parts.push('alt')

  if (event.code === 'Space') {
    parts.push('space')
  } else if (event.code.startsWith('F')) {
    parts.push(event.code.toLowerCase())
  } else if (/^Key[A-Z]$/.test(event.code)) {
    parts.push(event.code.slice(3).toLowerCase())
  } else if (/^Digit[0-9]$/.test(event.code)) {
    parts.push(event.code.slice(5).toLowerCase())
  } else {
    parts.push(event.key.toLowerCase())
  }

  return parts.join('+')
}

// Некоторые клавиши сами по себе не должны сохраняться как сочетание.
// Иначе пользователь случайно запишет пустой modifier вместо реальной команды.
export function isModifierOnlyEvent(event: KeyboardEvent): boolean {
  return ['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)
}

// Приводим combo к красивому виду для UI.
// Это полезно и для меню, и для строки в Preferences.
export function formatComboForDisplay(combo: string, unassignedLabel = 'Unassigned'): string {
  const normalized = normalizeCombo(combo)
  if (!normalized) return unassignedLabel

  return normalized
    .split('+')
    .map((part) => {
      if (part === 'ctrl') return 'Ctrl'
      if (part === 'shift') return 'Shift'
      if (part === 'alt') return 'Alt'
      if (part === 'space') return 'Space'
      if (/^f\d+$/.test(part)) return part.toUpperCase()
      return part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join('+')
}

// Проверяем, печатает ли пользователь сейчас в поле ввода.
// В таком состоянии не стоит перехватывать большинство editor-shortcuts.
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false

  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') {
    return true
  }

  if (tag === 'INPUT') {
    const input = el as HTMLInputElement
    const inputType = (input.type || '').toLowerCase()
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(inputType)
  }

  return el.closest('[contenteditable="true"]') !== null
}

// Хук для централизованной регистрации hotkeys.
// Пока он закрывает новый foundation-слой, не ломая старые уже рабочие shortcuts.
export function useHotkeys({ keybindings, handlers }: UseHotkeysOptions): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const currentCombo = comboFromEvent(event)
      const typing = isTypingTarget(event.target)

      for (const item of handlers) {
        const expectedCombo = normalizeCombo(keybindings[item.actionId] ?? '')
        if (!expectedCombo || currentCombo !== expectedCombo) continue
        if (typing && !item.allowInInput) return

        event.preventDefault()
        item.handler()
        return
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [handlers, keybindings])
}
