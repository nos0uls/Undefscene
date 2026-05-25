import React, { memo, useEffect } from 'react'

type FlowCanvasKeyboardShortcutsProps = {
  fitView: (options?: { duration?: number; padding?: number }) => void | Promise<void | boolean>
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false

  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') {
    return true
  }

  if (tag === 'INPUT') {
    const inputType = (el as HTMLInputElement).type?.toLowerCase()
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(inputType)
  }

  return el.closest('[contenteditable="true"]') !== null
}

export const FlowCanvasKeyboardShortcuts = memo(function FlowCanvasKeyboardShortcuts({
  fitView
}: FlowCanvasKeyboardShortcutsProps): React.JSX.Element | null {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+0 (или Numpad0) — fitView.
      if ((event.ctrlKey || event.metaKey) && (event.code === 'Digit0' || event.code === 'Numpad0')) {
        event.preventDefault()
        event.stopPropagation()
        void fitView({ duration: 180, padding: 0.18 })
        return
      }

      if (event.code !== 'Space') return
      if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return

      // Не перехватываем Space если фокус в поле ввода.
      if (isTypingTarget(event.target)) return

      event.preventDefault()
      void fitView({ duration: 180, padding: 0.18 })
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [fitView])

  return null
})
