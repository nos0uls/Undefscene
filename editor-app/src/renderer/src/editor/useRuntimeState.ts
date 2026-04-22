import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

function hasMeaningfulSceneChange(prev: RuntimeState, next: RuntimeState): boolean {
  return (
    prev.schemaVersion !== next.schemaVersion ||
    prev.title !== next.title ||
    prev.nodes !== next.nodes ||
    prev.edges !== next.edges
  )
}

// Хук для хранения runtime-json состояния и его автосохранения.
export const useRuntimeState = (): {
  runtime: RuntimeState
  setRuntime: (nextOrUpdater: RuntimeState | ((prev: RuntimeState) => RuntimeState)) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
} => {
  const defaultRuntime = useMemo(() => createDefaultRuntimeState(), [])
  const [history, setHistory] = useState<RuntimeHistory>({
    past: [],
    present: defaultRuntime,
    future: []
  })

  // Этот флаг нужен, чтобы не сохранять данные сразу после загрузки.
  const didLoadRef = useRef(false)

  useEffect(() => {
    // Проверяем, что мы в Electron-контексте (window.api доступен).
    // В обычном браузере (IDE preview) API недоступен — используем дефолтное состояние.
    if (!window.api?.runtime) {
      didLoadRef.current = true
      return
    }

    let cancelled = false

    // Читаем runtime.json через IPC.
    window.api.runtime
      .read()
      .then((loaded) => {
        if (cancelled) return
        const parsed = parseRuntimeState(loaded)

        const base = parsed ?? defaultRuntime
        // При загрузке всегда сбрасываем выделение, чтобы избежать
        // потенциально "битых" selection-полей, которые могут вызывать
        // зацикливание рендера.
        const present = {
          ...base,
          selectedNodeId: null,
          selectedNodeIds: [],
          selectedEdgeId: null
        }

        setHistory({
          past: [],
          present,
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
    // Пропускаем, если ещё не загрузили или нет Electron API.
    if (!didLoadRef.current || !window.api?.runtime) return

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
  // useCallback с пустыми зависимостями — setHistory из useState стабилен,
  // поэтому setRuntime тоже стабилен между рендерами.
  // Это критически важно: без стабильного setRuntime каждый рендер EditorShell
  // пересоздаёт onParallelAddBranch → пересоздаёт зависимости useEffect в FlowCanvas
  // → лишние вызовы setNodes → потенциальный бесконечный цикл.
  const setRuntime = useCallback(
    (nextOrUpdater: RuntimeState | ((prev: RuntimeState) => RuntimeState)) => {
      setHistory((prev) => {
        const nextState =
          typeof nextOrUpdater === 'function' ? nextOrUpdater(prev.present) : nextOrUpdater

        if (nextState === prev.present) return prev

        if (!hasMeaningfulSceneChange(prev.present, nextState)) {
          return {
            ...prev,
            present: nextState
          }
        }

        const nextPast = [...prev.past, prev.present]
        if (nextPast.length > MAX_HISTORY) {
          nextPast.shift()
        }

        return {
          past: nextPast,
          present: nextState,
          future: []
        }
      })
    },
    []
  )

  // Undo: возвращаемся назад по истории.
  const undo = useCallback(() => {
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
  }, [])

  // Redo: возвращаем отменённое изменение.
  const redo = useCallback(() => {
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
  }, [])

  return {
    runtime: history.present,
    setRuntime,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0
  }
}
