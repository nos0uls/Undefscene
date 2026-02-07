import { useEffect, useMemo, useRef, useState } from 'react'
import type { RuntimeState } from './runtimeTypes'
import { createDefaultRuntimeState, parseRuntimeState } from './runtimeTypes'

// Максимальное количество шагов истории для undo/redo.
const MAX_HISTORY = 40

// Храним историю, чтобы поддержать undo/redo.
type RuntimeHistory = {
  past: RuntimeState[]
  present: RuntimeState
  future: RuntimeState[]
}

// Хук для хранения runtime-json состояния и его автосохранения.
export const useRuntimeState = () => {
  const defaultRuntime = useMemo(() => createDefaultRuntimeState(), [])
  const [history, setHistory] = useState<RuntimeHistory>({
    past: [],
    present: defaultRuntime,
    future: []
  })

  // Этот флаг нужен, чтобы не сохранять данные сразу после загрузки.
  const didLoadRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    // Читаем runtime.json через IPC.
    window.api.runtime
      .read()
      .then((loaded) => {
        if (cancelled) return
        const parsed = parseRuntimeState(loaded)

        setHistory({
          past: [],
          present: parsed ?? defaultRuntime,
          future: []
        })
        didLoadRef.current = true
      })
      .catch((err) => {
        console.warn('Failed to read runtime.json:', err)
        didLoadRef.current = true
      })

    return () => {
      cancelled = true
    }
  }, [defaultRuntime])

  useEffect(() => {
    if (!didLoadRef.current) return

    const saveTimer = window.setTimeout(() => {
      // Сохраняем runtime.json, чтобы состояние не терялось.
      window.api.runtime
        .write({ ...history.present, lastSavedAtMs: Date.now() })
        .catch((err) => console.warn('Failed to write runtime.json:', err))
    }, 250)

    return () => {
      window.clearTimeout(saveTimer)
    }
  }, [history.present])

  // Обновляем текущее состояние и кладём старое в историю.
  const setRuntime = (next: RuntimeState) => {
    setHistory((prev) => {
      const nextPast = [...prev.past, prev.present]
      if (nextPast.length > MAX_HISTORY) {
        nextPast.shift()
      }

      return {
        past: nextPast,
        present: next,
        future: []
      }
    })
  }

  // Undo: возвращаемся назад по истории.
  const undo = () => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev
      const previous = prev.past[prev.past.length - 1]
      const nextPast = prev.past.slice(0, -1)
      return {
        past: nextPast,
        present: previous,
        future: [prev.present, ...prev.future]
      }
    })
  }

  // Redo: возвращаем отменённое изменение.
  const redo = () => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev
      const next = prev.future[0]
      const nextFuture = prev.future.slice(1)
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: nextFuture
      }
    })
  }

  return {
    runtime: history.present,
    setRuntime,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0
  }
}
