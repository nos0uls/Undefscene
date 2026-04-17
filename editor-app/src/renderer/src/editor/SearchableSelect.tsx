// SearchableSelect — выпадающий список с autocomplete по ресурсам.
// Заменяет нативный <select> для длинных списков ресурсов (спрайты, объекты и т.д.).
// Поддерживает автоподстановку, Tab/Enter принятие варианта и клавиатурную навигацию.

import { useEffect, useRef, useState } from 'react'

// Пропсы компонента.
type SearchableSelectProps = {
  // Список доступных вариантов.
  options: string[]

  // Текущее выбранное значение.
  value: string

  // Коллбек при выборе нового значения.
  onChange: (value: string) => void

  // Placeholder для поля ввода.
  placeholder?: string

  // CSS-класс для обёртки input.
  className?: string

  // Дополнительные стили (например, красная рамка для невалидного значения).
  style?: React.CSSProperties

  // Иногда поле нужно временно отключить,
  // например когда проект ещё не открыт или список room пуст.
  disabled?: boolean
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = '-- Search --',
  className,
  style,
  disabled = false
}: SearchableSelectProps): React.JSX.Element {
  // Текст в поле ввода — может отличаться от value во время набора.
  const [query, setQuery] = useState(value)

  // Открыт ли выпадающий список.
  const [open, setOpen] = useState(false)

  // Флаг фокуса нужен, чтобы внешнее value не перетирало ручной ввод,
  // пока пользователь печатает или стирает текст внутри поля.
  const [focused, setFocused] = useState(false)

  // Индекс подсвеченного элемента для клавиатурной навигации.
  const [highlightIndex, setHighlightIndex] = useState(-1)

  // Ref на контейнер — чтобы закрывать список при клике вне.
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Ref на input — нужен для выделения автоматически подставленного хвоста.
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Ref на список — чтобы скроллить к подсвеченному элементу.
  const listRef = useRef<HTMLDivElement | null>(null)

  // Таймер blur держим в ref, чтобы можно было безопасно отменить его,
  // если пользователь сразу вернул фокус или кликнул по варианту.
  const blurTimerRef = useRef<number | null>(null)

  // Синхронизируем query с внешним value, когда он меняется извне.
  useEffect(() => {
    if (focused) return
    setQuery(value)
  }, [focused, value])

  // При размонтировании убираем отложенный blur-таймер,
  // чтобы не осталось setState после удаления компонента.
  useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current)
      }
    }
  }, [])

  // Фильтруем варианты по подстроке (регистронезависимо).
  // Важно: сначала показываем prefix matches, потом обычные substring matches.
  const lowerQuery = query.toLowerCase()
  const filtered =
    query.length > 0
      ? [
        ...options.filter((opt) => opt.toLowerCase().startsWith(lowerQuery)),
        ...options.filter(
          (opt) => opt.toLowerCase().includes(lowerQuery) && !opt.toLowerCase().startsWith(lowerQuery)
        )
      ]
      : options

  // Лучший кандидат для автодополнения.
  const suggestedOption = filtered[0] ?? null

  // Есть ли точное совпадение с одним из вариантов.
  // Это помогает понять, надо ли при Enter брать suggestion или оставить ручной текст как есть.
  const hasExactMatch = options.some((opt) => opt.toLowerCase() === lowerQuery)

  // Закрываем список при клике вне компонента.
  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // Скроллим к подсвеченному элементу.
  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return
    const items = listRef.current.children
    if (items[highlightIndex]) {
      ; (items[highlightIndex] as HTMLElement).scrollIntoView({ block: 'nearest' })
    }
  }, [highlightIndex])

  // Выбираем вариант и закрываем список.
  const selectOption = (opt: string): void => {
    if (blurTimerRef.current !== null) {
      window.clearTimeout(blurTimerRef.current)
      blurTimerRef.current = null
    }
    setQuery(opt)
    onChange(opt)
    setOpen(false)
    setHighlightIndex(-1)
  }

  // Во время печати оставляем в input ровно тот текст, который набрал пользователь.
  // Варианты показываем только в выпадающем списке, без насильственной подстановки.
  const handleInputChange = (typedValue: string): void => {
    setQuery(typedValue)
    // Сразу синхронизируем ручной ввод наружу,
    // чтобы parent не возвращал старое value после blur и удаления символов.
    onChange(typedValue)
    setHighlightIndex(typedValue.length > 0 && suggestedOption ? 0 : -1)
  }

  // Обработка клавиш: стрелки, Tab, Enter, Escape.
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (disabled) {
      return
    }

    if (!open) {
      // Открываем список при нажатии стрелки вниз.
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setOpen(true)
        setHighlightIndex(0)
      } else if (e.key === 'Tab' && suggestedOption) {
        e.preventDefault()
        selectOption(suggestedOption)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onChange(query)
        setOpen(false)
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Tab') {
      if (suggestedOption) {
        e.preventDefault()
        selectOption(highlightIndex >= 0 && highlightIndex < filtered.length ? filtered[highlightIndex] : suggestedOption)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIndex >= 0 && highlightIndex < filtered.length) selectOption(filtered[highlightIndex])
      else if (suggestedOption && !hasExactMatch && query.length > 0) selectOption(suggestedOption)
      else {
        onChange(query)
        setOpen(false)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setQuery(value)
    }
  }

  return (
    <div
      ref={containerRef}
      // Растягиваем wrapper на всю ширину runtimeField,
      // чтобы SearchableSelect визуально совпадал с обычными input/select полями в инспекторе.
      style={{ position: 'relative', width: '100%' }}
    >
      <input
        ref={inputRef}
        className={className}
        style={style}
        placeholder={placeholder}
        disabled={disabled}
        value={query}
        onChange={(e) => {
          if (disabled) return
          handleInputChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          if (disabled) return
          if (blurTimerRef.current !== null) {
            window.clearTimeout(blurTimerRef.current)
            blurTimerRef.current = null
          }
          setFocused(true)
          setOpen(true)
          setHighlightIndex(query.length > 0 && suggestedOption ? 0 : -1)
        }}
        onBlur={() => {
          // Небольшая задержка, чтобы клик по элементу списка успел сработать.
          setFocused(false)
          blurTimerRef.current = window.setTimeout(() => {
            setOpen(false)
            setHighlightIndex(-1)
            blurTimerRef.current = null
          }, 150)
        }}
        onKeyDown={handleKeyDown}
      />

      {/* Выпадающий список с отфильтрованными вариантами. */}
      {open && filtered.length > 0 && (
        <div
          ref={listRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: 180,
            overflowY: 'auto',
            background: 'var(--color-background-soft, #1a1f28)',
            border: '1px solid var(--ev-c-gray-2, #333)',
            borderRadius: 4,
            zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
          }}
        >
          {filtered.map((opt, i) => (
            <div
              key={opt}
              style={{
                padding: '4px 8px',
                fontSize: 12,
                cursor: 'pointer',
                background: i === highlightIndex ? 'rgba(88,166,255,0.15)' : 'transparent',
                color: opt === value ? 'var(--ev-c-accent, #58a6ff)' : 'var(--ev-c-text-1, #ccc)'
              }}
              onMouseEnter={() => setHighlightIndex(i)}
              onMouseDown={(e) => {
                // preventDefault чтобы input не потерял фокус до selectOption.
                e.preventDefault()
                selectOption(opt)
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
