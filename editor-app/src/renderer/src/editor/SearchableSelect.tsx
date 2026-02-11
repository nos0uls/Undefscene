// SearchableSelect — выпадающий список с поиском по подстроке.
// Заменяет нативный <select> для длинных списков ресурсов (спрайты, объекты и т.д.).
// Поддерживает клавиатурную навигацию (↑↓ Enter Escape).

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
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = '-- Search --',
  className,
  style
}: SearchableSelectProps): React.JSX.Element {
  // Текст в поле ввода — может отличаться от value во время набора.
  const [query, setQuery] = useState(value)

  // Открыт ли выпадающий список.
  const [open, setOpen] = useState(false)

  // Индекс подсвеченного элемента для клавиатурной навигации.
  const [highlightIndex, setHighlightIndex] = useState(-1)

  // Ref на контейнер — чтобы закрывать список при клике вне.
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Ref на список — чтобы скроллить к подсвеченному элементу.
  const listRef = useRef<HTMLDivElement | null>(null)

  // Синхронизируем query с внешним value, когда он меняется извне.
  useEffect(() => {
    setQuery(value)
  }, [value])

  // Фильтруем варианты по подстроке (регистронезависимо).
  const lowerQuery = query.toLowerCase()
  const filtered = query.length > 0
    ? options.filter((opt) => opt.toLowerCase().includes(lowerQuery))
    : options

  // Закрываем список при клике вне компонента.
  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
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
      (items[highlightIndex] as HTMLElement).scrollIntoView({ block: 'nearest' })
    }
  }, [highlightIndex])

  // Выбираем вариант и закрываем список.
  const selectOption = (opt: string) => {
    setQuery(opt)
    onChange(opt)
    setOpen(false)
    setHighlightIndex(-1)
  }

  // Обработка клавиш: стрелки, Enter, Escape.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      // Открываем список при нажатии стрелки вниз.
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setOpen(true)
        setHighlightIndex(0)
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIndex >= 0 && highlightIndex < filtered.length) {
        selectOption(filtered[highlightIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setQuery(value)
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        className={className}
        style={style}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlightIndex(0)
        }}
        onFocus={() => {
          setOpen(true)
          setHighlightIndex(-1)
        }}
        onBlur={() => {
          // Небольшая задержка, чтобы клик по элементу списка успел сработать.
          setTimeout(() => {
            // Если query не совпадает ни с одним вариантом — оставляем как есть
            // (пользователь мог ввести вручную).
            if (!open) return
            setOpen(false)
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
