/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useEffect, useRef } from 'react'
import type { RuntimeNode, RuntimeEdge, RuntimeState } from './runtimeTypes'

// Clipboard payload для Ctrl+C/X/V — копия выделенных нод + внутренних рёбер.
// Вставка создаёт новые id и сдвигает позиции, чтобы не было наложений.
type ClipboardPayload = {
  nodes: RuntimeNode[]
  edges: RuntimeEdge[]
}

// Параметры, которые нужны хуку для обработки горячих клавиш.
// Все передаются через refs или стабильные функции, чтобы эффект не пересоздавался.
type UseEditorShortcutsDeps = {
  // Ref на актуальное runtime-состояние (читаем внутри keydown).
  runtimeRef: React.MutableRefObject<RuntimeState>
  // Ref на setRuntime — позволяет обновлять состояние без зависимости от значения.
  setRuntimeRef: React.MutableRefObject<React.Dispatch<React.SetStateAction<RuntimeState>>>
  // Ref на undo/redo функции из useRuntimeState.
  undoRef: React.MutableRefObject<() => void>
  redoRef: React.MutableRefObject<() => void>
  // Ref на save/new/export коллбеки — вызываются из хоткеев Ctrl+S/N/E.
  saveRef: React.MutableRefObject<(() => void) | null>
  newRef: React.MutableRefObject<(() => void) | null>
  exportRef: React.MutableRefObject<(() => void) | null>
  // Стабильный setter для preferences modal (useState setter — стабильная ссылка).
  setPreferencesOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  // Генератор уникального имени ноды (чистая функция, без состояния).
  suggestUniqueNodeName: (baseName: string, takenNames: Set<string>) => string
}

// Хук обрабатывает все глобальные горячие клавиши редактора:
// Ctrl+Z/Y (undo/redo), Ctrl+S/N/E/P (save/new/export/prefs),
// Delete (удаление нод), Ctrl+A (выделить все),
// Ctrl+C/X/V (clipboard с поддержкой parallel пар).
export function useEditorShortcuts(deps: UseEditorShortcutsDeps) {
  const {
    runtimeRef,
    setRuntimeRef,
    undoRef,
    redoRef,
    saveRef,
    newRef,
    exportRef,
    setPreferencesOpen,
    suggestUniqueNodeName
  } = deps

  // Clipboard для Ctrl+C / Ctrl+V / Ctrl+X.
  // Храним копию выделенных нод + внутренних рёбер.
  const clipboardRef = useRef<ClipboardPayload | null>(null)
  // Счётчик вставок — нужен для сдвига позиций при повторных Ctrl+V.
  const pasteSerialRef = useRef(0)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Не перехватываем горячие клавиши, если фокус в текстовом поле.
      const target = e.target as HTMLElement | null
      const tag = target?.tagName ?? ''
      const inputType = tag === 'INPUT' ? (((target as HTMLInputElement | null)?.type ?? '').toLowerCase()) : ''
      const isInput =
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (tag === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(inputType)) ||
        target?.closest('[contenteditable="true"]') !== null

      // Используем e.code для букв/цифр, чтобы сочетания не зависели от раскладки клавиатуры.
      // На русской раскладке e.key возвращает 'я', 'с' и т.д., а e.code всегда 'KeyZ', 'KeyC'.
      const key =
        e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() :
        e.code.startsWith('Digit') ? e.code.slice(5).toLowerCase() :
        e.key.toLowerCase()

      // Ctrl+A — выделить все ноды на холсте.
      if ((e.ctrlKey || e.metaKey) && key === 'a') {
        if (isInput) return
        e.preventDefault()
        const rt = runtimeRef.current
        const allIds = rt.nodes.map((n) => n.id)
        if (allIds.length === 0) return
        setRuntimeRef.current({
          ...rt,
          selectedNodeId: allIds.length === 1 ? allIds[0] : null,
          selectedNodeIds: allIds,
          selectedEdgeId: null
        })
        return
      }

      // Ctrl+Z — Undo (отмена последнего действия).
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'z') {
        if (isInput) return
        e.preventDefault()
        undoRef.current()
        return
      }

      // Ctrl+Y или Ctrl+Shift+Z — Redo (повтор отменённого действия).
      if (((e.ctrlKey || e.metaKey) && key === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'z')) {
        if (isInput) return
        e.preventDefault()
        redoRef.current()
        return
      }

      // Ctrl+S — Save (сохранить текущую сцену).
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault()
        saveRef.current?.()
        return
      }

      // Ctrl+N — New Scene (создать новую пустую сцену).
      if ((e.ctrlKey || e.metaKey) && key === 'n') {
        e.preventDefault()
        newRef.current?.()
        return
      }

      // Ctrl+E — Export (экспортировать катсцену в JSON).
      if ((e.ctrlKey || e.metaKey) && key === 'e') {
        e.preventDefault()
        exportRef.current?.()
        return
      }

      // Ctrl+P — Preferences (открыть настройки редактора).
      if ((e.ctrlKey || e.metaKey) && key === 'p') {
        e.preventDefault()
        e.stopPropagation()
        setPreferencesOpen(true)
        return
      }

      // Delete — удалить выбранную ноду/ноды (если фокус не в поле ввода).
      if (e.key === 'Delete' && !isInput) {
        const rt = runtimeRef.current
        const ids = rt.selectedNodeIds?.length
          ? rt.selectedNodeIds
          : rt.selectedNodeId
            ? [rt.selectedNodeId]
            : []
        if (ids.length === 0) return
        e.preventDefault()

        const toDelete = new Set(ids)
        setRuntimeRef.current({
          ...rt,
          nodes: rt.nodes.filter((n) => !toDelete.has(n.id)),
          edges: rt.edges.filter(
            (edge) => !toDelete.has(edge.source) && !toDelete.has(edge.target)
          ),
          selectedNodeId: null,
          selectedNodeIds: [],
          selectedEdgeId: null
        })
      }

      // Ctrl+C — копировать выделенные ноды и внутренние рёбра в clipboard.
      if ((e.ctrlKey || e.metaKey) && key === 'c') {
        if (isInput) return
        const rt = runtimeRef.current
        const selected = rt.selectedNodeIds?.length
          ? rt.selectedNodeIds
          : rt.selectedNodeId
            ? [rt.selectedNodeId]
            : []
        if (selected.length === 0) return
        e.preventDefault()

        // Собираем множество выбранных нод.
        // Для parallel добавляем пару (start+join), чтобы вставка не ломала граф.
        const selectedSet = new Set<string>(selected)
        for (const id of [...selectedSet]) {
          const n = rt.nodes.find((x) => x.id === id)
          if (!n) continue
          if (n.type === 'parallel_start') {
            const joinId = typeof n.params?.joinId === 'string' ? (n.params.joinId as string) : ''
            if (joinId) selectedSet.add(joinId)
          }
          if (n.type === 'parallel_join') {
            const pairId = typeof n.params?.pairId === 'string' ? (n.params.pairId as string) : ''
            if (pairId) selectedSet.add(pairId)
          }
        }

        const nodes = rt.nodes
          .filter((n) => selectedSet.has(n.id))
          .map((n) => JSON.parse(JSON.stringify(n)) as RuntimeNode)

        const edges = rt.edges
          // Копируем только внутренние рёбра (обе стороны внутри выделения).
          .filter((ed) => selectedSet.has(ed.source) && selectedSet.has(ed.target))
          .map((ed) => JSON.parse(JSON.stringify(ed)) as RuntimeEdge)

        clipboardRef.current = { nodes, edges }
        pasteSerialRef.current = 0
        return
      }

      // Ctrl+X — вырезать (копировать + удалить выделенные ноды).
      if ((e.ctrlKey || e.metaKey) && key === 'x') {
        if (isInput) return
        const rt = runtimeRef.current
        const selected = rt.selectedNodeIds?.length
          ? rt.selectedNodeIds
          : rt.selectedNodeId
            ? [rt.selectedNodeId]
            : []
        if (selected.length === 0) return
        e.preventDefault()

        // Сначала делаем копию (логика как в Ctrl+C).
        const selectedSet = new Set<string>(selected)
        for (const id of [...selectedSet]) {
          const n = rt.nodes.find((x) => x.id === id)
          if (!n) continue
          if (n.type === 'parallel_start') {
            const joinId = typeof n.params?.joinId === 'string' ? (n.params.joinId as string) : ''
            if (joinId) selectedSet.add(joinId)
          }
          if (n.type === 'parallel_join') {
            const pairId = typeof n.params?.pairId === 'string' ? (n.params.pairId as string) : ''
            if (pairId) selectedSet.add(pairId)
          }
        }

        const nodes = rt.nodes
          .filter((n) => selectedSet.has(n.id))
          .map((n) => JSON.parse(JSON.stringify(n)) as RuntimeNode)

        const edges = rt.edges
          .filter((ed) => selectedSet.has(ed.source) && selectedSet.has(ed.target))
          .map((ed) => JSON.parse(JSON.stringify(ed)) as RuntimeEdge)

        clipboardRef.current = { nodes, edges }
        pasteSerialRef.current = 0

        // Потом удаляем выделенные ноды из графа.
        setRuntimeRef.current({
          ...rt,
          nodes: rt.nodes.filter((n) => !selectedSet.has(n.id)),
          edges: rt.edges.filter(
            (ed) => !selectedSet.has(ed.source) && !selectedSet.has(ed.target)
          ),
          selectedNodeId: null,
          selectedNodeIds: [],
          selectedEdgeId: null
        })
        return
      }

      // Ctrl+V — вставить ноды из clipboard со сдвигом позиций.
      if ((e.ctrlKey || e.metaKey) && key === 'v') {
        if (isInput) return
        const rt = runtimeRef.current
        const payload = clipboardRef.current
        if (!payload || payload.nodes.length === 0) return
        e.preventDefault()

        // Делаем небольшой сдвиг, чтобы вставка была видна и не накладывалась на оригинал.
        pasteSerialRef.current += 1
        const dx = 40 * pasteSerialRef.current
        const dy = 40 * pasteSerialRef.current

        // Генерируем новые id и собираем map старый→новый.
        const idMap = new Map<string, string>()
        const now = Date.now()
        for (let i = 0; i < payload.nodes.length; i++) {
          idMap.set(payload.nodes[i].id, `node-${now}-${i}-${Math.floor(Math.random() * 1000)}`)
        }

        // Для имён делаем авто-уникализацию, чтобы не плодить одинаковые названия.
        const takenNames = new Set<string>(
          rt.nodes.map((n) => String(n.name ?? '').trim()).filter((v) => v.length > 0)
        )

        const newNodes: RuntimeNode[] = payload.nodes.map((n) => {
          const newId = idMap.get(n.id) ?? n.id

          const baseName = String(n.name ?? '').trim() || 'Node'
          const uniqueName = suggestUniqueNodeName(baseName, takenNames)
          takenNames.add(uniqueName)

          const next: RuntimeNode = {
            ...n,
            id: newId,
            name: uniqueName,
            position: n.position ? { x: n.position.x + dx, y: n.position.y + dy } : n.position
          }

          // Фиксим ссылки внутри parallel пары (joinId/pairId должны указывать на новые id).
          if (next.type === 'parallel_start') {
            const joinId =
              typeof next.params?.joinId === 'string' ? (next.params.joinId as string) : ''
            if (joinId && idMap.has(joinId)) {
              next.params = { ...(next.params ?? {}), joinId: idMap.get(joinId) }
            }
          }
          if (next.type === 'parallel_join') {
            const pairId =
              typeof next.params?.pairId === 'string' ? (next.params.pairId as string) : ''
            if (pairId && idMap.has(pairId)) {
              next.params = { ...(next.params ?? {}), pairId: idMap.get(pairId) }
            }
          }

          return next
        })

        const newEdges: RuntimeEdge[] = payload.edges.map((ed, i) => {
          const src = idMap.get(ed.source) ?? ed.source
          const tgt = idMap.get(ed.target) ?? ed.target
          return {
            ...ed,
            id: `edge-${now}-${i}-${Math.floor(Math.random() * 1000)}`,
            source: src,
            target: tgt
          }
        })

        const pastedIds = newNodes.map((n) => n.id)
        setRuntimeRef.current({
          ...rt,
          nodes: [...rt.nodes, ...newNodes],
          edges: [...rt.edges, ...newEdges],
          selectedNodeId: pastedIds.length === 1 ? pastedIds[0] : null,
          selectedNodeIds: pastedIds,
          selectedEdgeId: null
        })
        return
      }
    }

    // Вешаем на capture phase, чтобы перехватывать до того, как React обработает.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [setPreferencesOpen, suggestUniqueNodeName])

  return { clipboardRef, pasteSerialRef }
}
