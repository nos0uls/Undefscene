import React, { memo, useEffect } from 'react'

type FlowCanvasKeyboardShortcutsProps = {
  fitView: (options?: { duration?: number; padding?: number }) => void | Promise<void | boolean>
}

export const FlowCanvasKeyboardShortcuts = memo(function FlowCanvasKeyboardShortcuts({
  fitView
}: FlowCanvasKeyboardShortcutsProps): React.JSX.Element | null {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return

      // Не перехватываем Space если фокус в поле ввода.
      const target = event.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName
      if (tag === 'TEXTAREA' || tag === 'SELECT') return
      if (tag === 'INPUT') {
        const inputType = (target as HTMLInputElement).type?.toLowerCase()
        if (!['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(inputType)) {
          return
        }
      }
      if (target.closest('[contenteditable="true"]')) return

      event.preventDefault()
      void fitView({ duration: 180, padding: 0.18 })
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [fitView])

  return null
})
