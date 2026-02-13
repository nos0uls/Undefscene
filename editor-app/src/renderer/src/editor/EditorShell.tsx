import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { DockPanel } from './DockPanel'
import { FlowCanvas } from './FlowCanvas'
import { TopMenuBar } from './TopMenuBar'
import type { DockSlotId, LayoutState, Size, Vec2 } from './layoutTypes'
import type { RuntimeEdge, RuntimeNode } from './runtimeTypes'
import { useLayoutState } from './useLayoutState'
import { useProjectResources } from './useProjectResources'
import { useRuntimeState } from './useRuntimeState'
import { compileGraph, stripExport } from './compileGraph'
import { validateGraph, type ValidationResult } from './validateGraph'
import { PreferencesModal } from './PreferencesModal'
import { SearchableSelect } from './SearchableSelect'
import { UpdateNotification } from './UpdateNotification'

type DragState = {
  // Какая панель сейчас перетаскивается.
  panelId: string

  // Какой pointerId мы захватили (нужно, чтобы не ловить чужие события).
  pointerId: number

  // Размер панели во время перетаскивания.
  // Мы берём его из DOM в момент старта.
  size: Size

  // Смещение курсора относительно левого верхнего угла панели.
  // Нужно, чтобы панель "прилипала" к курсору одинаково.
  grabOffset: Vec2
}

// Высота шапки панели в свернутом состоянии.
const COLLAPSED_HEADER_HEIGHT = 28

type ResizeKind =
  | 'dock-left'
  | 'dock-right'
  | 'dock-bottom'
  | 'split-left'
  | 'split-right'
  | 'float-n'
  | 'float-s'
  | 'float-e'
  | 'float-w'
  | 'float-ne'
  | 'float-nw'
  | 'float-se'
  | 'float-sw'

type ResizeDragState = {
  // Какой тип ресайза мы делаем.
  kind: ResizeKind

  // ID pointer, чтобы не ловить чужие события.
  pointerId: number

  // Стартовая позиция курсора.
  startX: number
  startY: number

  // Запоминаем размеры доков в момент старта.
  startDockSizes: LayoutState['dockSizes']

  // Для floating ресайза нам нужен ID панели и её стартовый размер.
  panelId?: string
  startPanelPosition?: Vec2 | null
  startPanelSize?: Size | null
}

// Состояние модалки, которая появляется, когда имя ноды уже занято.
// Мы не блокируем дубликаты, но по умолчанию предлагаем безопасное уникальное имя.
type NameConflictModalState = {
  nodeId: string
  previousName: string
  conflictingWithNodeId: string
  value: string
}

// Основной “каркас” редактора.
// Здесь мы собираем все зоны: верхнее меню, левые/правые доки,
// центральный холст и нижний лог.
export function EditorShell(): React.JSX.Element {
  // Храним текущую раскладку и автосохраняем её.
  // В Milestone 1 мы пока не даём пользователю двигать сплиттеры,
  // но размеры уже пробрасываем в CSS.
  const { layout, setLayout } = useLayoutState()

  // Храним runtime-json (узлы, выбор, undo/redo).
  // Это отдельное состояние, не связанное с layout.
  const { runtime, setRuntime, undo, redo, canUndo, canRedo } = useRuntimeState()

  // Ресурсы GameMaker проекта (для autocomplete и валидации) + настройки движка.
  const { resources, engineSettings, yarnFiles, openProject } = useProjectResources()

  // Путь к текущему файлу сцены (null = ещё не сохранялась / новая).
  const [sceneFilePath, setSceneFilePath] = useState<string | null>(null)

  // Модалка настроек (Preferences).
  const [preferencesOpen, setPreferencesOpen] = useState(false)

  // Реактивная валидация графа — пересчитывается при каждом изменении runtime.
  const validation: ValidationResult = useMemo(() => validateGraph(runtime), [runtime])

  // Активная вкладка в Logs панели: Errors / Warnings / Tips.
  const [logsTab, setLogsTab] = useState<'errors' | 'warnings' | 'tips'>('errors')

  // Активная вкладка в bottom dock (id панели). Если null — показываем первую.
  const [activeBottomTabId, setActiveBottomTabId] = useState<string | null>(null)

  // Выбранная нода (нужна, чтобы синхронизировать поле имени и показывать модалки).
  const selectedNodeForName = runtime.nodes.find((node) => node.id === runtime.selectedNodeId) ?? null

  // Текущее значение в поле “Node name”.
  // Мы держим его отдельно, чтобы не переписывать runtime на каждый символ.
  const [pendingNodeName, setPendingNodeName] = useState('')

  // Модалка для конфликтов имени ноды.
  const [nameConflictModal, setNameConflictModal] = useState<NameConflictModalState | null>(null)
  const nameConflictOkRef = useRef<HTMLButtonElement | null>(null)

  // Простой генератор уникального имени.
  // Если имя уже занято — добавляем постфикс ` (0)`, ` (1)` и т.д.
  const suggestUniqueNodeName = (baseName: string, takenNames: Set<string>): string => {
    const trimmed = baseName.trim()
    if (!trimmed) return ''
    if (!takenNames.has(trimmed)) return trimmed
    let i = 0
    while (takenNames.has(`${trimmed} (${i})`)) i++
    return `${trimmed} (${i})`
  }

  // Когда пользователь выбирает другую ноду — обновляем поле имени.
  useEffect(() => {
    setPendingNodeName(selectedNodeForName?.name ?? '')
  }, [selectedNodeForName?.id])

  // Когда модалка открывается — ставим фокус на кнопку OK.
  // Так можно быстро подтвердить стандартный вариант.
  useEffect(() => {
    if (!nameConflictModal) return
    const t = window.setTimeout(() => {
      nameConflictOkRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(t)
  }, [nameConflictModal])

  // Закрытие модалки по Esc.
  useEffect(() => {
    if (!nameConflictModal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setPendingNodeName(nameConflictModal.previousName)
      setNameConflictModal(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [nameConflictModal])

  // Добавляем новую ветку в параллель (start+join).
  // Мы меняем branches сразу в двух нодах, чтобы handles совпадали.
  const onParallelAddBranch = (parallelStartId: string) => {
    const startNode = runtime.nodes.find((n) => n.id === parallelStartId)
    if (!startNode) return
    const joinId = typeof startNode.params?.joinId === 'string' ? (startNode.params?.joinId as string) : ''
    const joinNode = runtime.nodes.find((n) => n.id === joinId)
    if (!joinNode) return

    const branches = (Array.isArray(startNode.params?.branches) ? startNode.params?.branches : ['b0']) as string[]
    const newBranchId = `b${branches.length}`
    const nextBranches = [...branches, newBranchId]

    const nextNodes = runtime.nodes.map((n) => {
      if (n.id === startNode.id) {
        return { ...n, params: { ...(n.params ?? {}), branches: nextBranches } }
      }
      if (n.id === joinNode.id) {
        return { ...n, params: { ...(n.params ?? {}), branches: nextBranches } }
      }
      return n
    })

    setRuntime({
      ...runtime,
      nodes: nextNodes
    })
  }

  // Ссылки на DOM, чтобы делать hit-test док-зон.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const leftDockRef = useRef<HTMLElement | null>(null)
  const rightDockRef = useRef<HTMLElement | null>(null)
  const bottomDockRef = useRef<HTMLElement | null>(null)

  // Храним состояние перетаскивания отдельно от layout.
  // Так мы не пишем layout.json 60 раз в секунду.
  const [drag, setDrag] = useState<DragState | null>(null)

  // Состояние ресайза (доки + floating панели).
  const [resizeDrag, setResizeDrag] = useState<ResizeDragState | null>(null)

  // Ref на DOM-элемент "призрака" панели.
  // Мы двигаем его напрямую через style, минуя React state,
  // чтобы не вызывать ререндер всего EditorShell на каждый кадр.
  const ghostRef = useRef<HTMLDivElement | null>(null)

  // Последний hoverSlot, чтобы onPointerUp мог его прочитать.
  const hoverSlotRef = useRef<DockSlotId | null>(null)

  // Обновляем позицию призрака и подсветку доков напрямую через DOM.
  // Это полностью обходит React reconciliation — никаких setState.
  const updateDragPreviewDOM = (ghostPos: Vec2 | null, hoverSlot: DockSlotId | null) => {
    // Двигаем призрак.
    const ghost = ghostRef.current
    if (ghost) {
      if (ghostPos) {
        ghost.style.left = `${ghostPos.x}px`
        ghost.style.top = `${ghostPos.y}px`
        ghost.style.display = 'block'
      } else {
        ghost.style.display = 'none'
      }
    }

    // Обновляем подсветку док-зон через classList.
    const prev = hoverSlotRef.current
    if (prev !== hoverSlot) {
      // Убираем подсветку с предыдущего слота.
      if (prev === 'left') leftDockRef.current?.classList.remove('isDockDropTarget')
      if (prev === 'right') rightDockRef.current?.classList.remove('isDockDropTarget')
      if (prev === 'bottom') bottomDockRef.current?.classList.remove('isDockDropTarget')

      // Добавляем подсветку на новый слот.
      if (hoverSlot === 'left') leftDockRef.current?.classList.add('isDockDropTarget')
      if (hoverSlot === 'right') rightDockRef.current?.classList.add('isDockDropTarget')
      if (hoverSlot === 'bottom') bottomDockRef.current?.classList.add('isDockDropTarget')

      hoverSlotRef.current = hoverSlot
    }
  }

  // Храним requestAnimationFrame id для плавного drag.
  const dragRafRef = useRef<number | null>(null)

  // Последнее значение превью, которое мы хотим отрендерить.
  const pendingGhostPosRef = useRef<Vec2 | null>(null)
  const pendingHoverSlotRef = useRef<DockSlotId | null>(null)

  // Планируем обновление превью в requestAnimationFrame.
  // Это снижает количество DOM-записей до 1 раза за кадр.
  const scheduleDragPreview = (ghostPos: Vec2 | null, hoverSlot: DockSlotId | null) => {
    pendingGhostPosRef.current = ghostPos
    pendingHoverSlotRef.current = hoverSlot
    if (dragRafRef.current !== null) return
    dragRafRef.current = window.requestAnimationFrame(() => {
      dragRafRef.current = null
      updateDragPreviewDOM(pendingGhostPosRef.current, pendingHoverSlotRef.current)
    })
  }

  // Сохраняем актуальный layout в ref, чтобы pointer handlers не ловили старое значение.
  const layoutRef = useRef(layout)
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

  // --- Горячие клавиши (Ctrl+Z, Ctrl+Y, Ctrl+E, Delete) ---
  // Используем refs, чтобы обработчик keydown всегда видел актуальные значения.
  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime
  const setRuntimeRef = useRef(setRuntime)
  setRuntimeRef.current = setRuntime
  const undoRef = useRef(undo)
  undoRef.current = undo
  const redoRef = useRef(redo)
  redoRef.current = redo

  // Ref на кнопку Export (чтобы вызвать из хоткея).
  const exportRef = useRef<(() => void) | null>(null)

  // --- Clipboard для Ctrl+C / Ctrl+V / Ctrl+X ---
  // Мы храним копию выделенных нод + внутренних рёбер.
  // Вставка создаёт новые id и сдвигает позиции.
  type ClipboardPayload = {
    nodes: RuntimeNode[]
    edges: RuntimeEdge[]
  }
  const clipboardRef = useRef<ClipboardPayload | null>(null)
  const pasteSerialRef = useRef(0)

  // Ref на input "Wait on edge" — для автофокуса при двойном клике по ребру.
  const edgeWaitInputRef = useRef<HTMLInputElement | null>(null)
  // Флаг: нужно ли сфокусировать wait input после следующего рендера.
  const shouldFocusEdgeWaitRef = useRef(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Не перехватываем, если фокус в input/textarea/select.
      const tag = (e.target as HTMLElement)?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      // Ctrl+Z — Undo.
      if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
        if (isInput) return
        e.preventDefault()
        undoRef.current()
        return
      }

      // Ctrl+Y или Ctrl+Shift+Z — Redo.
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) {
        if (isInput) return
        e.preventDefault()
        redoRef.current()
        return
      }

      // Ctrl+S — Save.
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        saveRef.current?.()
        return
      }

      // Ctrl+N — New Scene.
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        newRef.current?.()
        return
      }

      // Ctrl+E — Export.
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault()
        exportRef.current?.()
        return
      }

      // Delete — удалить выбранную ноду (если фокус не в поле ввода).
      if (e.key === 'Delete' && !isInput) {
        const rt = runtimeRef.current
        const ids = (rt.selectedNodeIds?.length ? rt.selectedNodeIds : (rt.selectedNodeId ? [rt.selectedNodeId] : []))
        if (ids.length === 0) return
        e.preventDefault()

        const toDelete = new Set(ids)
        setRuntimeRef.current({
          ...rt,
          nodes: rt.nodes.filter((n) => !toDelete.has(n.id)),
          edges: rt.edges.filter((edge) => !toDelete.has(edge.source) && !toDelete.has(edge.target)),
          selectedNodeId: null,
          selectedNodeIds: [],
          selectedEdgeId: null
        })
      }

      // Ctrl+C — копировать выделенные ноды и внутренние рёбра.
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        if (isInput) return
        const rt = runtimeRef.current
        const selected = (rt.selectedNodeIds?.length ? rt.selectedNodeIds : (rt.selectedNodeId ? [rt.selectedNodeId] : []))
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
          // Копируем только внутренние рёбра (если обе стороны внутри выделения).
          .filter((ed) => selectedSet.has(ed.source) && selectedSet.has(ed.target))
          .map((ed) => JSON.parse(JSON.stringify(ed)) as RuntimeEdge)

        clipboardRef.current = { nodes, edges }
        pasteSerialRef.current = 0
        return
      }

      // Ctrl+X — вырезать (копировать + удалить).
      if (e.ctrlKey && (e.key === 'x' || e.key === 'X')) {
        if (isInput) return
        const rt = runtimeRef.current
        const selected = (rt.selectedNodeIds?.length ? rt.selectedNodeIds : (rt.selectedNodeId ? [rt.selectedNodeId] : []))
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

        // Потом удаляем.
        setRuntimeRef.current({
          ...rt,
          nodes: rt.nodes.filter((n) => !selectedSet.has(n.id)),
          edges: rt.edges.filter((ed) => !selectedSet.has(ed.source) && !selectedSet.has(ed.target)),
          selectedNodeId: null,
          selectedNodeIds: [],
          selectedEdgeId: null
        })
        return
      }

      // Ctrl+V — вставить.
      if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
        if (isInput) return
        const rt = runtimeRef.current
        const payload = clipboardRef.current
        if (!payload || payload.nodes.length === 0) return
        e.preventDefault()

        // Делаем небольшой сдвиг, чтобы вставка была видна.
        pasteSerialRef.current += 1
        const dx = 40 * pasteSerialRef.current
        const dy = 40 * pasteSerialRef.current

        // Генерируем новые id и собираем map старый->новый.
        const idMap = new Map<string, string>()
        const now = Date.now()
        for (let i = 0; i < payload.nodes.length; i++) {
          idMap.set(payload.nodes[i].id, `node-${now}-${i}-${Math.floor(Math.random() * 1000)}`)
        }

        // Для имён делаем авто-уникализацию, чтобы не плодить одинаковые названия.
        const takenNames = new Set(
          rt.nodes
            .map((n) => String(n.name ?? '').trim())
            .filter((v) => v.length > 0)
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

          // Фиксим ссылки внутри parallel пары.
          if (next.type === 'parallel_start') {
            const joinId = typeof next.params?.joinId === 'string' ? (next.params.joinId as string) : ''
            if (joinId && idMap.has(joinId)) {
              next.params = { ...(next.params ?? {}), joinId: idMap.get(joinId) }
            }
          }
          if (next.type === 'parallel_join') {
            const pairId = typeof next.params?.pairId === 'string' ? (next.params.pairId as string) : ''
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

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Экспорт катсцены: валидация → компиляция → JSON → сохранение через IPC.
  const handleExport = async () => {
    // Сначала проверяем граф на ошибки.
    const val = validateGraph(runtime)
    if (val.hasErrors) {
      const errorMessages = val.entries
        .filter((e) => e.severity === 'error')
        .map((e) => `• ${e.message}`)
        .join('\n')
      alert(`Cannot export — graph has errors:\n\n${errorMessages}`)
      return
    }

    const result = compileGraph(runtime)
    if (!result.ok) {
      alert(`Export failed:\n${result.error}`)
      return
    }
    const exported = stripExport(runtime, result.actions)
    const jsonString = JSON.stringify(exported, null, 2)
    const saveResult = await window.api.export.save(jsonString) as { saved: boolean; filePath?: string }
    if (saveResult.saved) {
      alert(`Exported to:\n${saveResult.filePath}`)
    }
  }
  // Привязываем к ref, чтобы хоткей Ctrl+E мог вызвать.
  exportRef.current = handleExport

  // --- Операции с файлом сцены ---

  // Сериализуем runtime в JSON для сохранения (без editor-only полей selectedNodeId и т.д.).
  const serializeScene = (): string => {
    return JSON.stringify(runtime, null, 2)
  }

  // Save As: показываем диалог, сохраняем, запоминаем путь.
  const handleSaveAs = async () => {
    const jsonString = serializeScene()
    const result = await window.api.scene.saveAs(jsonString) as { saved: boolean; filePath?: string }
    if (result.saved && result.filePath) {
      setSceneFilePath(result.filePath)
    }
  }

  // Save: если путь известен — сохраняем туда, иначе Save As.
  const handleSave = async () => {
    if (sceneFilePath) {
      const jsonString = serializeScene()
      await window.api.scene.save(sceneFilePath, jsonString)
    } else {
      await handleSaveAs()
    }
  }

  // Open Scene: открываем .usc.json / .json файл и загружаем в runtime.
  const handleOpenScene = async () => {
    const result = await window.api.scene.open() as { filePath: string; content: string } | null
    if (!result) return
    try {
      const parsed = JSON.parse(result.content)
      // Пытаемся распарсить как RuntimeState.
      const { parseRuntimeState } = await import('./runtimeTypes')
      const state = parseRuntimeState(parsed)
      if (state) {
        setRuntime(state)
        setSceneFilePath(result.filePath)
      } else {
        alert('Failed to parse scene file — invalid format.')
      }
    } catch {
      alert('Failed to read scene file — invalid JSON.')
    }
  }

  // New Scene: сбрасываем runtime в начальное состояние.
  const handleNew = () => {
    const confirmed = window.confirm('Create a new scene? Unsaved changes will be lost.')
    if (!confirmed) return
    import('./runtimeTypes').then(({ createDefaultRuntimeState }) => {
      setRuntime(createDefaultRuntimeState())
      setSceneFilePath(null)
    })
  }

  // Привязываем Save к ref для хоткея Ctrl+S.
  const saveRef = useRef<(() => void) | null>(null)
  saveRef.current = handleSave
  const newRef = useRef<(() => void) | null>(null)
  newRef.current = handleNew

  // Простая функция для ограничения чисел.
  const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max))

  // Минимальные размеры, чтобы UI не "схлопывался".
  const MIN_LEFT_WIDTH = 220
  const MIN_RIGHT_WIDTH = 260
  const MIN_BOTTOM_HEIGHT = 140
  const MIN_CENTER_WIDTH = 360
  const MIN_CENTER_HEIGHT = 220
  const MIN_FLOAT_WIDTH = 240
  const MIN_FLOAT_HEIGHT = 80

  // Список всех панелей, которые можно показать через меню.
  // Это замена старых кнопок "Open Any" над доками.
  const allPanels = useMemo(() => {
    return [
      { id: 'panel.actions', label: 'Actions' },
      { id: 'panel.bookmarks', label: 'Bookmarks' },
      { id: 'panel.text', label: 'Text' },
      { id: 'panel.inspector', label: 'Inspector' },
      { id: 'panel.logs', label: 'Logs / Warnings' }
    ]
  }, [])

  // Проверяем видимость панели по её mode.
  const isPanelVisible = (panelId: string): boolean => {
    const p = layout.panels[panelId]
    if (!p) return false
    return p.mode !== 'hidden'
  }

  // Сворачиваем/разворачиваем панель.
  // Для floating сохраняем старую высоту, чтобы потом восстановить.
  const togglePanelCollapse = (panelId: string) => {
    const panel = layout.panels[panelId]
    if (!panel) return

    const nextCollapsed = !panel.collapsed
    const currentSize = panel.size ?? panel.lastFloatingSize ?? { width: 360, height: 240 }

    const nextPanelState =
      panel.mode === 'floating'
        ? {
            ...panel,
            collapsed: nextCollapsed,
            size: nextCollapsed
              ? { width: currentSize.width, height: COLLAPSED_HEADER_HEIGHT }
              : panel.lastFloatingSize ?? currentSize,
            lastFloatingSize: nextCollapsed ? currentSize : panel.lastFloatingSize
          }
        : {
            ...panel,
            collapsed: nextCollapsed
          }

    setLayout({
      ...layout,
      panels: {
        ...layout.panels,
        [panelId]: nextPanelState
      }
    })
  }

  // Готовим стиль для док-панели, если она свёрнута.
  const getDockedPanelStyle = (panelId: string, baseStyle?: CSSProperties): CSSProperties | undefined => {
    const isCollapsed = Boolean(layout.panels[panelId]?.collapsed)
    if (!isCollapsed) return baseStyle
    return {
      ...(baseStyle ?? {}),
      flexGrow: 0,
      flexBasis: COLLAPSED_HEADER_HEIGHT,
      height: COLLAPSED_HEADER_HEIGHT
    }
  }

  // Убираем ID панели из всех слотов.
  const removeFromAllSlots = (nextDocked: typeof layout.docked, panelId: string) => {
    nextDocked.left = nextDocked.left.filter((id) => id !== panelId)
    nextDocked.right = nextDocked.right.filter((id) => id !== panelId)
    nextDocked.bottom = nextDocked.bottom.filter((id) => id !== panelId)
  }

  // Добавляем панель в слот в нужную позицию.
  const insertIntoSlot = (
    nextDocked: typeof layout.docked,
    slot: 'left' | 'right' | 'bottom',
    panelId: string,
    index: number
  ) => {
    const list = [...nextDocked[slot]]
    if (list.includes(panelId)) return
    const safeIndex = Math.max(0, Math.min(index, list.length))
    list.splice(safeIndex, 0, panelId)
    nextDocked[slot] = list
  }

  // Сколько панелей может жить в одном слоте.
  // Слева/справа — 2, внизу — до 3 (переключаются вкладками).
  const getSlotCapacity = (slot: DockSlotId): number => (slot === 'bottom' ? 3 : 2)

  // Если слот переполнен, то "лишние" панели мы скрываем.
  // Так они пропадают и с экрана, и из меню Panels (чекбоксы снимаются).
  const enforceSlotCapacity = (
    nextDocked: typeof layout.docked,
    nextPanels: typeof layout.panels,
    slot: DockSlotId,
    preferredPanelId?: string
  ) => {
    const capacity = getSlotCapacity(slot)
    const list = [...nextDocked[slot]]

    if (list.length <= capacity) return

    let keepIds = list.slice(0, capacity)
    let overflowIds = list.slice(capacity)

    // Если есть "предпочтительная" панель, гарантируем, что она останется в слоте.
    if (preferredPanelId && list.includes(preferredPanelId) && !keepIds.includes(preferredPanelId)) {
      keepIds = [...keepIds.slice(0, capacity - 1), preferredPanelId]
      overflowIds = list.filter((id) => !keepIds.includes(id))
    }

    nextDocked[slot] = keepIds

    overflowIds.forEach((panelId) => {
      const panel = nextPanels[panelId]
      if (!panel) return

      nextPanels[panelId] = {
        ...panel,
        mode: 'hidden',
        slot: null,
        lastDockedSlot: panel.slot ?? panel.lastDockedSlot ?? slot
      }
    })
  }

  // Возвращаем содержимое панели по ID.
  // Пока что это просто заглушки, но так мы сможем переиспользовать их
  // и для docked, и для floating.
  const renderPanelContents = (panelId: string): React.JSX.Element => {
    // Находим выбранный узел один раз, чтобы не повторять логику ниже.
    const selectedNode = runtime.nodes.find((node) => node.id === runtime.selectedNodeId) ?? null

    // Обновляем выбранный узел безопасно.
    const updateNode = (nodeId: string, patch: Partial<RuntimeNode>) => {
      setRuntime({
        ...runtime,
        nodes: runtime.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node))
      })
    }

    // Убираем служебные поля parallel из params, чтобы не оставлять мусор.
    const stripParallelParams = (params?: RuntimeNode['params']) => {
      if (!params) return undefined
      const { joinId, pairId, branches, ...rest } = params
      return rest
    }

    // Удаляем пару parallel (start/join) и внутреннее ребро __pair.
    // Это нужно, когда пользователь меняет тип параллельной ноды на обычную.
    const removeParallelPair = (node: RuntimeNode, nodes: RuntimeNode[], edges: RuntimeEdge[]) => {
      // Определяем, где находится вторая нода пары.
      const joinId = typeof node.params?.joinId === 'string' ? node.params.joinId : ''
      const pairId = typeof node.params?.pairId === 'string' ? node.params.pairId : ''
      const counterpartId = node.type === 'parallel_start' ? joinId : node.type === 'parallel_join' ? pairId : ''

      if (!counterpartId) {
        return { nodes, edges }
      }

      // Удаляем вторую ноду пары и все её рёбра.
      const nextNodes = nodes.filter((n) => n.id !== counterpartId)
      const nextEdges = edges.filter((e) => {
        const isPairEdge =
          e.source === node.id &&
          e.target === counterpartId &&
          e.sourceHandle === '__pair' &&
          e.targetHandle === '__pair'
        return e.source !== counterpartId && e.target !== counterpartId && !isPairEdge
      })

      return { nodes: nextNodes, edges: nextEdges }
    }

    // Меняем тип ноды с учётом special-case для parallel.
    // Тут мы создаём/удаляем пару start/join и внутреннее ребро.
    const changeNodeType = (nodeId: string, nextType: string) => {
      const currentNode = runtime.nodes.find((node) => node.id === nodeId)
      if (!currentNode) return

      // Готовим набор занятых имён, чтобы не создавать дубликаты.
      const takenNames = new Set(
        runtime.nodes
          .filter((n) => n.id !== nodeId)
          .map((n) => String(n.name ?? '').trim())
          .filter((v) => v.length > 0)
      )

      // Сначала чистим старую пару, если нода была parallel.
      let nextNodes = runtime.nodes
      let nextEdges = runtime.edges
      if (currentNode.type === 'parallel_start' || currentNode.type === 'parallel_join') {
        const cleaned = removeParallelPair(currentNode, nextNodes, nextEdges)
        nextNodes = cleaned.nodes
        nextEdges = cleaned.edges
      }

      // Позиция для новой join-ноды — справа от выбранной.
      const anchorPos = currentNode.position ?? { x: 100, y: 150 }

      if (nextType === 'parallel_start') {
        const joinId = `pjoin-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        const joinName = suggestUniqueNodeName('Node', takenNames)

        // Обновляем текущую ноду в start.
        nextNodes = nextNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                type: 'parallel_start',
                params: { joinId, branches: ['b0'] }
              }
            : node
        )

        // Добавляем join-ноду пары.
        nextNodes = [
          ...nextNodes,
          {
            id: joinId,
            type: 'parallel_join',
            name: joinName,
            position: { x: anchorPos.x + 300, y: anchorPos.y },
            params: { pairId: nodeId, branches: ['b0'] }
          }
        ]

        // Добавляем внутреннее ребро между парой.
        nextEdges = [
          ...nextEdges,
          {
            id: `edge-pair-${nodeId}-${joinId}`,
            source: nodeId,
            sourceHandle: '__pair',
            target: joinId,
            targetHandle: '__pair'
          }
        ]
      } else {
        // Обычная нода: просто меняем тип и чистим parallel-поля.
        nextNodes = nextNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                type: nextType,
                params: stripParallelParams(node.params)
              }
            : node
        )
      }

      setRuntime({
        ...runtime,
        nodes: nextNodes,
        edges: nextEdges
      })
    }

    // Пробуем применить новое имя ноды.
    // Если имя занято — показываем предупреждение с предложением ` (0)`.
    const commitNodeName = (nodeId: string, nextNameRaw: string) => {
      const nextName = nextNameRaw.trim()

      // Пустое имя разрешаем (это просто warning в validateGraph).
      if (!nextName) {
        updateNode(nodeId, { name: '' })
        return
      }

      const prev = runtime.nodes.find((n) => n.id === nodeId)?.name ?? ''

      // Собираем занятые имена (кроме текущей ноды).
      const taken = new Set(
        runtime.nodes
          .filter((n) => n.id !== nodeId)
          .map((n) => String(n.name ?? '').trim())
          .filter((v) => v.length > 0)
      )

      // Если конфликта нет — применяем сразу.
      if (!taken.has(nextName)) {
        updateNode(nodeId, { name: nextName })
        return
      }

      // Конфликт есть: дубликаты разрешены, но предупреждаем.
      // По умолчанию предлагаем уникальное имя с постфиксом.
      const conflictingWithNodeId = runtime.nodes.find((n) => n.id !== nodeId && String(n.name ?? '').trim() === nextName)?.id ?? ''
      const suggested = suggestUniqueNodeName(nextName, taken)

      setNameConflictModal({
        nodeId,
        previousName: prev,
        conflictingWithNodeId,
        value: suggested
      })
    }

    // Обновляем один параметр в selectedNode.params.
    const updateNodeParam = (nodeId: string, key: string, value: unknown) => {
      const target = runtime.nodes.find((node) => node.id === nodeId)
      if (!target) return

      const nextParams = { ...(target.params ?? {}) }
      nextParams[key] = value

      updateNode(nodeId, { params: nextParams })
    }

    // Обновляем ребро (edge) безопасно.
    const updateEdge = (edgeId: string, patch: Partial<(typeof runtime.edges)[number]>) => {
      setRuntime({
        ...runtime,
        edges: runtime.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e))
      })
    }

    // Создаём новый узел выбранного типа и сразу выбираем его.
    // Позиция — правее активного узла, чтобы не накладывались.
    const addNode = (type: string) => {
      const newId = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`

      // Готовим набор занятых имён, чтобы дать новой ноде уникальное имя.
      const takenNames = new Set(
        runtime.nodes
          .map((n) => String(n.name ?? '').trim())
          .filter((v) => v.length > 0)
      )

      // Берём позицию активного узла или последнего узла в списке.
      const anchor = runtime.nodes.find((n) => n.id === runtime.selectedNodeId)
        ?? runtime.nodes[runtime.nodes.length - 1]
        ?? null

      const anchorPos = anchor?.position ?? { x: 100, y: 150 }

      // Parallel — особый случай: создаём ПАРУ нод (start + join).
      if (type === 'parallel_start') {
        const startId = `pstart-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        const joinId = `pjoin-${Date.now()}-${Math.floor(Math.random() * 1000)}`

        const startName = suggestUniqueNodeName('Node', takenNames)
        takenNames.add(startName)
        const joinName = suggestUniqueNodeName('Node', takenNames)

        const startNode: RuntimeNode = {
          id: startId,
          type: 'parallel_start',
          name: startName,
          position: { x: anchorPos.x + 250, y: anchorPos.y },
          params: { joinId, branches: ['b0'] }
        }

        const joinNode: RuntimeNode = {
          id: joinId,
          type: 'parallel_join',
          name: joinName,
          position: { x: anchorPos.x + 550, y: anchorPos.y },
          params: { pairId: startId, branches: ['b0'] }
        }

        // Скрытая связь между парой (для внутренней логики).
        const pairEdge = {
          id: `edge-pair-${startId}-${joinId}`,
          source: startId,
          sourceHandle: '__pair',
          target: joinId,
          targetHandle: '__pair'
        }

        // Если есть активный узел — соединяем его со start-нодой.
        const extraEdges = anchor
          ? [{ id: `edge-${anchor.id}-${startId}`, source: anchor.id, target: startId }]
          : []

        setRuntime({
          ...runtime,
          nodes: [...runtime.nodes, startNode, joinNode],
          edges: [...runtime.edges, ...extraEdges, pairEdge],
          // Важно: держим selection-поля согласованными,
          // иначе React Flow может зациклиться на onSelectionChange.
          selectedNodeId: startId,
          selectedNodeIds: [startId],
          selectedEdgeId: null
        })
        return
      }

      const newNode: RuntimeNode = {
        id: newId,
        type,
        name: suggestUniqueNodeName('Node', takenNames),
        text: '',
        position: { x: anchorPos.x + 250, y: anchorPos.y }
      }

      // Если есть активный узел — соединяем его с новым.
      const newEdges = anchor
        ? [...runtime.edges, { id: `edge-${anchor.id}-${newId}`, source: anchor.id, target: newId }]
        : runtime.edges

      setRuntime({
        ...runtime,
        nodes: [...runtime.nodes, newNode],
        edges: newEdges,
        // Важно: при создании новой ноды сбрасываем мультивыделение и выбранное ребро.
        // Иначе React Flow может попытаться "вернуть" старое выделение и уйти в цикл.
        selectedNodeId: newId,
        selectedNodeIds: [newId],
        selectedEdgeId: null
      })
    }

    // Меняем выделение узла.
    const selectNode = (nodeId: string) => {
      setRuntime({
        ...runtime,
        // Держим оба поля (single + multi) синхронно.
        selectedNodeId: nodeId,
        selectedNodeIds: [nodeId],
        selectedEdgeId: null
      })
    }

    if (panelId === 'panel.actions') {
      // Список доступных типов нод (включая parallel).
      const palette = [
        'start',
        'end',
        'move',
        'follow_path',
        'actor_create',
        'actor_destroy',
        'animate',
        'dialogue',
        'camera_track',
        'camera_pan',
        'parallel_start',
        'branch',
        'run_function',
        'set_position',
        'set_depth',
        'set_facing'
      ]

      return (
        <div className="runtimeSection">
          <div className="runtimeSectionTitle">Actions</div>
          <div className="runtimeRow">
            <button className="runtimeButton" type="button" onClick={() => addNode('dialogue')}>
              Add Dialogue Node
            </button>
            <button className="runtimeButton" type="button" onClick={undo} disabled={!canUndo}>
              Undo
            </button>
            <button className="runtimeButton" type="button" onClick={redo} disabled={!canRedo}>
              Redo
            </button>
          </div>
          {/* Палитра нод — кликом добавляем ноду на холст. */}
          <div className="runtimeSectionTitle" style={{ marginTop: 6 }}>Node Palette</div>
          <ul className="runtimeList runtimeListScrollable">
            {palette.map((type) => (
              <li key={type}>
                <button
                  className="runtimeListItem"
                  type="button"
                  onClick={() => addNode(type)}
                >
                  {type}
                </button>
              </li>
            ))}
          </ul>
          <div className="runtimeHint">New nodes appear to the right of the selected node.</div>
        </div>
      )
    }

    if (panelId === 'panel.bookmarks') {
      return (
        <div className="runtimeSection">
          <div className="runtimeSectionTitle">Nodes</div>
          {runtime.nodes.length === 0 ? (
            <div className="runtimeHint">No nodes yet. Click “Add Node”.</div>
          ) : (
            <ul className="runtimeList">
              {runtime.nodes.map((node) => (
                <li key={node.id}>
                  <button
                    className={['runtimeListItem', node.id === runtime.selectedNodeId ? 'isActive' : '']
                      .filter(Boolean)
                      .join(' ')}
                    type="button"
                    onClick={() => selectNode(node.id)}
                  >
                    {String(node.name ?? '').trim() ? String(node.name) : node.type} · {node.id}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    }

    if (panelId === 'panel.text') {
      return (
        <div className="runtimeSection">
          <div className="runtimeSectionTitle">Text</div>
          {selectedNode ? (
            <textarea
              className="runtimeTextarea"
              value={selectedNode.text ?? ''}
              placeholder="Dialogue text..."
              onChange={(event) => updateNode(selectedNode.id, { text: event.target.value })}
            />
          ) : (
            <div className="runtimeHint">Select a node to edit its text.</div>
          )}
        </div>
      )
    }

    if (panelId === 'panel.inspector') {
      // Доступные типы узлов для выбора (полный список v1).
      const nodeTypes = [
        'start',
        'end',
        'move',
        'follow_path',
        'actor_create',
        'actor_destroy',
        'animate',
        'dialogue',
        'camera_track',
        'camera_pan',
        'parallel_start',
        'branch',
        'run_function',
        'set_position',
        'set_depth',
        'set_facing'
      ]

      // Считаем входящие/исходящие связи для выбранного узла.
      const incomingCount = selectedNode
        ? runtime.edges.filter((e) => e.target === selectedNode.id).length
        : 0
      const outgoingCount = selectedNode
        ? runtime.edges.filter((e) => e.source === selectedNode.id).length
        : 0

      const selectedEdge = runtime.edges.find((e) => e.id === runtime.selectedEdgeId) ?? null

      // Опции ресурсов из .yyp (если проект открыт).
      const objectOptions = resources?.objects ?? []
      const spriteOptions = resources?.sprites ?? []
      const spriteOrObjectOptions = [...objectOptions, ...spriteOptions]

      return (
        <div className="runtimeSection">
          <div className="runtimeSectionTitle">Inspector</div>
          <label className="runtimeField">
            <span>Scene title</span>
            <input
              className="runtimeInput"
              value={runtime.title}
              onChange={(event) => setRuntime({ ...runtime, title: event.target.value })}
            />
          </label>
          {selectedNode ? (
            <>
              <div className="runtimeHint" style={{ opacity: 0.6 }}>ID: {selectedNode.id}</div>
              <label className="runtimeField">
                <span>Node type</span>
                <select
                  className="runtimeInput"
                  value={selectedNode.type}
                  onChange={(event) => changeNodeType(selectedNode.id, event.target.value)}
                >
                  {nodeTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  {/* Если текущий тип не в списке — показываем его тоже */}
                  {!nodeTypes.includes(selectedNode.type) && (
                    <option value={selectedNode.type}>{selectedNode.type} (custom)</option>
                  )}
                </select>
              </label>
              <label className="runtimeField">
                <span>Node name</span>
                <input
                  className="runtimeInput"
                  value={pendingNodeName}
                  placeholder="Node"
                  onChange={(event) => setPendingNodeName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    commitNodeName(selectedNode.id, pendingNodeName)
                  }}
                  onBlur={() => commitNodeName(selectedNode.id, pendingNodeName)}
                />
              </label>

              {/* Параметры ноды — показываем только релевантные поля. */}
              {/* wait убран как отдельная нода: пауза хранится на ребре (edge.waitSeconds). */}

              {/* --- move / set_position: target, x, y, speed, collision --- */}
              {['move', 'set_position'].includes(selectedNode.type) && (
                <>
                  <label className="runtimeField">
                    <span>Target</span>
                    <input
                      className="runtimeInput"
                      placeholder="actor key / player"
                      value={String((selectedNode.params?.target as string) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'target', event.target.value)}
                    />
                  </label>
                  <label className="runtimeField">
                    <span>X</span>
                    <input
                      className="runtimeInput"
                      type="number"
                      value={String((selectedNode.params?.x as number) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'x', Number(event.target.value))}
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Y</span>
                    <input
                      className="runtimeInput"
                      type="number"
                      value={String((selectedNode.params?.y as number) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'y', Number(event.target.value))}
                    />
                  </label>
                  {/* speed и collision только для move */}
                  {selectedNode.type === 'move' && (
                    <>
                      <label className="runtimeField">
                        <span>Speed (px/sec)</span>
                        <input
                          className="runtimeInput"
                          type="number"
                          placeholder="60"
                          value={String((selectedNode.params?.speed_px_sec as number) ?? '')}
                          onChange={(event) => updateNodeParam(selectedNode.id, 'speed_px_sec', Number(event.target.value))}
                        />
                      </label>
                      <label className="runtimeField">
                        <span>Collision</span>
                        <select
                          className="runtimeInput"
                          value={String(selectedNode.params?.collision ?? 'false')}
                          onChange={(event) => updateNodeParam(selectedNode.id, 'collision', event.target.value === 'true')}
                        >
                          <option value="false">false</option>
                          <option value="true">true</option>
                        </select>
                      </label>
                    </>
                  )}
                </>
              )}

              {/* --- follow_path: target, speed, collision --- */}
              {selectedNode.type === 'follow_path' && (
                <>
                  <label className="runtimeField">
                    <span>Target</span>
                    <input
                      className="runtimeInput"
                      placeholder="actor key / player"
                      value={String((selectedNode.params?.target as string) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'target', event.target.value)}
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Speed (px/sec)</span>
                    <input
                      className="runtimeInput"
                      type="number"
                      placeholder="60"
                      value={String((selectedNode.params?.speed_px_sec as number) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'speed_px_sec', Number(event.target.value))}
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Collision</span>
                    <select
                      className="runtimeInput"
                      value={String(selectedNode.params?.collision ?? 'false')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'collision', event.target.value === 'true')}
                    >
                      <option value="false">false</option>
                      <option value="true">true</option>
                    </select>
                  </label>
                  {/* --- Редактор точек пути (waypoints) --- */}
                  <div className="runtimeSectionTitle" style={{ marginTop: 4 }}>Path Points</div>
                  {(() => {
                    // Получаем текущий массив точек или создаём пустой.
                    const points: { x: number; y: number }[] = Array.isArray(selectedNode.params?.points)
                      ? (selectedNode.params.points as { x: number; y: number }[])
                      : []

                    // Обновляем весь массив points в параметрах ноды.
                    const setPoints = (next: { x: number; y: number }[]) => {
                      updateNodeParam(selectedNode.id, 'points', next)
                    }

                    return (
                      <>
                        {points.map((pt, i) => (
                          <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2 }}>
                            <span style={{ fontSize: 11, opacity: 0.5, minWidth: 18 }}>#{i}</span>
                            <input
                              className="runtimeInput"
                              type="number"
                              style={{ width: 64 }}
                              placeholder="x"
                              value={pt.x}
                              onChange={(e) => {
                                const next = [...points]
                                next[i] = { ...next[i], x: Number(e.target.value) }
                                setPoints(next)
                              }}
                            />
                            <input
                              className="runtimeInput"
                              type="number"
                              style={{ width: 64 }}
                              placeholder="y"
                              value={pt.y}
                              onChange={(e) => {
                                const next = [...points]
                                next[i] = { ...next[i], y: Number(e.target.value) }
                                setPoints(next)
                              }}
                            />
                            {/* Кнопка вверх */}
                            <button
                              style={{ fontSize: 11, padding: '0 4px', cursor: 'pointer' }}
                              disabled={i === 0}
                              onClick={() => {
                                const next = [...points]
                                ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                                setPoints(next)
                              }}
                            >↑</button>
                            {/* Кнопка вниз */}
                            <button
                              style={{ fontSize: 11, padding: '0 4px', cursor: 'pointer' }}
                              disabled={i === points.length - 1}
                              onClick={() => {
                                const next = [...points]
                                ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
                                setPoints(next)
                              }}
                            >↓</button>
                            {/* Кнопка удалить точку */}
                            <button
                              style={{ fontSize: 11, padding: '0 4px', cursor: 'pointer', color: '#e05050' }}
                              onClick={() => {
                                const next = points.filter((_, idx) => idx !== i)
                                setPoints(next)
                              }}
                            >✕</button>
                          </div>
                        ))}
                        {/* Кнопка добавить новую точку */}
                        <button
                          style={{ fontSize: 12, marginTop: 2, cursor: 'pointer' }}
                          onClick={() => {
                            // Новая точка: если есть предыдущие, смещаем на +32 по x.
                            const last = points[points.length - 1]
                            const newPt = last ? { x: last.x + 32, y: last.y } : { x: 0, y: 0 }
                            setPoints([...points, newPt])
                          }}
                        >+ Add Point</button>
                        {points.length === 0 && (
                          <div className="runtimeHint" style={{ opacity: 0.5, fontSize: 11 }}>
                            No waypoints yet. Click &quot;+ Add Point&quot; to start.
                          </div>
                        )}
                      </>
                    )
                  })()}
                </>
              )}

              {/* --- actor_create: key, sprite_or_object, x, y --- */}
              {selectedNode.type === 'actor_create' && (
                <>
                  <label className="runtimeField">
                    <span>Key</span>
                    <input
                      className="runtimeInput"
                      placeholder="npc_guide"
                      value={String((selectedNode.params?.key as string) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'key', event.target.value)}
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Sprite / Object</span>
                    <SearchableSelect
                      className="runtimeInput"
                      options={spriteOrObjectOptions}
                      value={String((selectedNode.params?.sprite_or_object as string) ?? '')}
                      onChange={(v) => updateNodeParam(selectedNode.id, 'sprite_or_object', v)}
                      placeholder="obj_actor / spr_..."
                      style={
                        (selectedNode.params?.sprite_or_object && !spriteOrObjectOptions.includes(String(selectedNode.params.sprite_or_object)))
                          ? { borderColor: '#e05050' }
                          : undefined
                      }
                    />
                  </label>
                  <label className="runtimeField">
                    <span>X</span>
                    <input
                      className="runtimeInput"
                      type="number"
                      value={String((selectedNode.params?.x as number) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'x', Number(event.target.value))}
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Y</span>
                    <input
                      className="runtimeInput"
                      type="number"
                      value={String((selectedNode.params?.y as number) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'y', Number(event.target.value))}
                    />
                  </label>
                </>
              )}

              {/* --- actor_destroy: target --- */}
              {selectedNode.type === 'actor_destroy' && (
                <label className="runtimeField">
                  <span>Target</span>
                  <input
                    className="runtimeInput"
                    placeholder="actor key"
                    value={String((selectedNode.params?.target as string) ?? '')}
                    onChange={(event) => updateNodeParam(selectedNode.id, 'target', event.target.value)}
                  />
                </label>
              )}

              {/* --- animate: target, sprite, image_index, image_speed --- */}
              {selectedNode.type === 'animate' && (
                <>
                  <label className="runtimeField">
                    <span>Target</span>
                    <input
                      className="runtimeInput"
                      placeholder="actor key / player"
                      value={String((selectedNode.params?.target as string) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'target', event.target.value)}
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Sprite</span>
                    <SearchableSelect
                      className="runtimeInput"
                      options={spriteOptions}
                      value={String((selectedNode.params?.sprite as string) ?? '')}
                      onChange={(v) => updateNodeParam(selectedNode.id, 'sprite', v)}
                      placeholder="spr_..."
                      style={
                        (selectedNode.params?.sprite && !spriteOptions.includes(String(selectedNode.params.sprite)))
                          ? { borderColor: '#e05050' }
                          : undefined
                      }
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Image Index</span>
                    <input
                      className="runtimeInput"
                      type="number"
                      placeholder="0"
                      value={String((selectedNode.params?.image_index as number) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'image_index', Number(event.target.value))}
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Image Speed</span>
                    <input
                      className="runtimeInput"
                      type="number"
                      step="0.1"
                      placeholder="1"
                      value={String((selectedNode.params?.image_speed as number) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'image_speed', Number(event.target.value))}
                    />
                  </label>
                </>
              )}

              {/* --- dialogue: file, node (autocomplete из .yarn файлов) --- */}
              {selectedNode.type === 'dialogue' && (() => {
                // Список имён .yarn файлов для autocomplete.
                const yarnFileOptions = yarnFiles.map((y) => y.file)
                // Ноды из выбранного файла (для autocomplete поля Node).
                const currentFile = String(selectedNode.params?.file ?? '')
                const yarnNodeOptions = yarnFiles.find((y) => y.file === currentFile)?.nodes ?? []

                return (
                  <>
                    <label className="runtimeField">
                      <span>File</span>
                      <SearchableSelect
                        className="runtimeInput"
                        options={yarnFileOptions}
                        value={currentFile}
                        onChange={(v) => updateNodeParam(selectedNode.id, 'file', v)}
                        placeholder="dialogue"
                      />
                    </label>
                    <label className="runtimeField">
                      <span>Node</span>
                      <SearchableSelect
                        className="runtimeInput"
                        options={yarnNodeOptions}
                        value={String((selectedNode.params?.node as string) ?? '')}
                        onChange={(v) => updateNodeParam(selectedNode.id, 'node', v)}
                        placeholder="Intro"
                      />
                    </label>
                  </>
                )
              })()}

              {/* --- camera_track: target, seconds, offset_x, offset_y --- */}
              {selectedNode.type === 'camera_track' && (
                <>
                  <label className="runtimeField">
                    <span>Target</span>
                    <input
                      className="runtimeInput"
                      placeholder="actor key / player"
                      value={String((selectedNode.params?.target as string) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'target', event.target.value)}
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Seconds</span>
                    <input
                      className="runtimeInput"
                      type="number"
                      step="0.1"
                      placeholder="2"
                      value={String((selectedNode.params?.seconds as number) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'seconds', Number(event.target.value))}
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Offset X</span>
                    <input
                      className="runtimeInput"
                      type="number"
                      value={String((selectedNode.params?.offset_x as number) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'offset_x', Number(event.target.value))}
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Offset Y</span>
                    <input
                      className="runtimeInput"
                      type="number"
                      value={String((selectedNode.params?.offset_y as number) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'offset_y', Number(event.target.value))}
                    />
                  </label>
                </>
              )}

              {/* --- camera_pan: x, y, seconds --- */}
              {selectedNode.type === 'camera_pan' && (
                <>
                  <label className="runtimeField">
                    <span>X</span>
                    <input
                      className="runtimeInput"
                      type="number"
                      value={String((selectedNode.params?.x as number) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'x', Number(event.target.value))}
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Y</span>
                    <input
                      className="runtimeInput"
                      type="number"
                      value={String((selectedNode.params?.y as number) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'y', Number(event.target.value))}
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Seconds</span>
                    <input
                      className="runtimeInput"
                      type="number"
                      step="0.1"
                      placeholder="1"
                      value={String((selectedNode.params?.seconds as number) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'seconds', Number(event.target.value))}
                    />
                  </label>
                </>
              )}

              {/* --- set_depth: target, depth --- */}
              {selectedNode.type === 'set_depth' && (
                <>
                  <label className="runtimeField">
                    <span>Target</span>
                    <input
                      className="runtimeInput"
                      placeholder="actor key / player"
                      value={String((selectedNode.params?.target as string) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'target', event.target.value)}
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Depth</span>
                    <input
                      className="runtimeInput"
                      type="number"
                      placeholder="0"
                      value={String((selectedNode.params?.depth as number) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'depth', Number(event.target.value))}
                    />
                  </label>
                </>
              )}

              {/* --- set_facing: target, direction --- */}
              {selectedNode.type === 'set_facing' && (
                <>
                  <label className="runtimeField">
                    <span>Target</span>
                    <input
                      className="runtimeInput"
                      placeholder="actor key / player"
                      value={String((selectedNode.params?.target as string) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'target', event.target.value)}
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Direction</span>
                    <select
                      className="runtimeInput"
                      value={String((selectedNode.params?.direction as string) ?? 'right')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'direction', event.target.value)}
                    >
                      <option value="left">left</option>
                      <option value="right">right</option>
                      <option value="up">up</option>
                      <option value="down">down</option>
                    </select>
                  </label>
                </>
              )}

              {/* --- branch: condition (dropdown из whitelist, если есть) --- */}
              {selectedNode.type === 'branch' && (
                <label className="runtimeField">
                  <span>Condition</span>
                  <SearchableSelect
                    className="runtimeInput"
                    options={engineSettings?.branchConditions ?? []}
                    value={String((selectedNode.params?.condition as string) ?? '')}
                    onChange={(v) => updateNodeParam(selectedNode.id, 'condition', v)}
                    placeholder="e.g. has_item_key"
                  />
                </label>
              )}

              {/* --- run_function: function_name (dropdown из whitelist), args --- */}
              {selectedNode.type === 'run_function' && (
                <>
                  <label className="runtimeField">
                    <span>Function Name</span>
                    <SearchableSelect
                      className="runtimeInput"
                      options={engineSettings?.runFunctions ?? []}
                      value={String((selectedNode.params?.function as string) ?? (selectedNode.params?.function_name as string) ?? '')}
                      onChange={(v) => updateNodeParam(selectedNode.id, 'function', v)}
                      placeholder="my_cutscene_func"
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Args (JSON)</span>
                    <input
                      className="runtimeInput"
                      placeholder='["arg1", 42]'
                      value={String((selectedNode.params?.args as string) ?? '')}
                      onChange={(event) => updateNodeParam(selectedNode.id, 'args', event.target.value)}
                    />
                  </label>
                </>
              )}
              {selectedNode.position && (
                <div className="runtimeHint" style={{ opacity: 0.6 }}>
                  Position: {Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)}
                </div>
              )}
              <div className="runtimeHint" style={{ opacity: 0.6 }}>
                Edges: {incomingCount} in / {outgoingCount} out
              </div>
            </>
          ) : (
            <div className="runtimeHint">Select a node on the canvas to inspect it.</div>
          )}

          {/* Инспектор ребра: waitSeconds лежит прямо на линии. */}
          {selectedEdge ? (
            <>
              <div className="runtimeSectionTitle" style={{ marginTop: 8 }}>Selected Edge</div>
              <div className="runtimeHint" style={{ opacity: 0.6 }}>ID: {selectedEdge.id}</div>
              <label className="runtimeField">
                <span>Wait on edge (seconds)</span>
                <input
                  ref={(el) => {
                    edgeWaitInputRef.current = el
                    // Если стоит флаг автофокуса — фокусируемся сразу при маунте.
                    if (el && shouldFocusEdgeWaitRef.current) {
                      shouldFocusEdgeWaitRef.current = false
                      requestAnimationFrame(() => el.focus())
                    }
                  }}
                  className="runtimeInput"
                  type="number"
                  step="0.1"
                  value={String(selectedEdge.waitSeconds ?? '')}
                  onChange={(event) => {
                    const v = event.target.value
                    if (v === '') {
                      updateEdge(selectedEdge.id, { waitSeconds: undefined })
                    } else {
                      updateEdge(selectedEdge.id, { waitSeconds: Math.max(0, Number(v)) })
                    }
                  }}
                />
              </label>

              {/* Condition на ребре: галочка включает условие. */}
              <label className="runtimeField" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={!!selectedEdge.conditionEnabled}
                  onChange={(event) => {
                    const enabled = event.target.checked
                    if (enabled) {
                      updateEdge(selectedEdge.id, {
                        conditionEnabled: true,
                        conditionVar: selectedEdge.conditionVar ?? '',
                        conditionEquals: selectedEdge.conditionEquals ?? '',
                        conditionIfFalse: selectedEdge.conditionIfFalse ?? 'skip',
                        stopWaitingWhen: selectedEdge.stopWaitingWhen ?? 'none'
                      })
                    } else {
                      updateEdge(selectedEdge.id, { conditionEnabled: false })
                    }
                  }}
                />
                <span>Condition</span>
              </label>

              {/* Поля условия показываем только если condition включён. */}
              {selectedEdge.conditionEnabled ? (
                <>
                  <label className="runtimeField">
                    <span>Variable (global key)</span>
                    <input
                      className="runtimeInput"
                      placeholder="e.g. has_key"
                      value={String(selectedEdge.conditionVar ?? '')}
                      onChange={(event) => updateEdge(selectedEdge.id, { conditionVar: event.target.value })}
                    />
                  </label>
                  <label className="runtimeField">
                    <span>Equals</span>
                    <input
                      className="runtimeInput"
                      placeholder="e.g. true / 1 / done"
                      value={String(selectedEdge.conditionEquals ?? '')}
                      onChange={(event) => updateEdge(selectedEdge.id, { conditionEquals: event.target.value })}
                    />
                  </label>

                  {/* Что делать, если условие false. */}
                  <label className="runtimeField">
                    <span>If false</span>
                    <select
                      className="runtimeInput"
                      value={selectedEdge.conditionIfFalse ?? 'skip'}
                      onChange={(event) => {
                        const val = event.target.value as 'skip' | 'wait_until_true'
                        updateEdge(selectedEdge.id, {
                          conditionIfFalse: val,
                          // При переключении на skip — сбрасываем поля ожидания.
                          stopWaitingWhen: val === 'skip' ? undefined : (selectedEdge.stopWaitingWhen ?? 'none')
                        })
                      }}
                    >
                      <option value="skip">skip (пропустить)</option>
                      <option value="wait_until_true">wait until true (ждать)</option>
                    </select>
                  </label>

                  {/* Если wait_until_true — показываем настройки прекращения ожидания. */}
                  {selectedEdge.conditionIfFalse === 'wait_until_true' ? (
                    <>
                      <label className="runtimeField">
                        <span>Stop waiting when</span>
                        <select
                          className="runtimeInput"
                          value={selectedEdge.stopWaitingWhen ?? 'none'}
                          onChange={(event) => updateEdge(selectedEdge.id, {
                            stopWaitingWhen: event.target.value as 'none' | 'global_var' | 'node_reached' | 'timeout'
                          })}
                        >
                          <option value="none">none (ждать бесконечно)</option>
                          <option value="global_var">global variable</option>
                          <option value="node_reached">node reached</option>
                          <option value="timeout">timeout</option>
                        </select>
                      </label>

                      {/* Поля для end-condition: global_var */}
                      {selectedEdge.stopWaitingWhen === 'global_var' ? (
                        <>
                          <label className="runtimeField">
                            <span>End Variable (global key)</span>
                            <input
                              className="runtimeInput"
                              placeholder="e.g. cutscene_abort"
                              value={String(selectedEdge.endConditionVar ?? '')}
                              onChange={(event) => updateEdge(selectedEdge.id, { endConditionVar: event.target.value })}
                            />
                          </label>
                          <label className="runtimeField">
                            <span>End Equals</span>
                            <input
                              className="runtimeInput"
                              placeholder="e.g. true"
                              value={String(selectedEdge.endConditionEquals ?? '')}
                              onChange={(event) => updateEdge(selectedEdge.id, { endConditionEquals: event.target.value })}
                            />
                          </label>
                        </>
                      ) : null}

                      {/* Поля для end-condition: node_reached */}
                      {selectedEdge.stopWaitingWhen === 'node_reached' ? (
                        <label className="runtimeField">
                          <span>Node name</span>
                          <input
                            className="runtimeInput"
                            placeholder="e.g. End"
                            value={String(selectedEdge.endNodeName ?? '')}
                            onChange={(event) => updateEdge(selectedEdge.id, { endNodeName: event.target.value })}
                          />
                        </label>
                      ) : null}

                      {/* Поля для end-condition: timeout */}
                      {selectedEdge.stopWaitingWhen === 'timeout' ? (
                        <label className="runtimeField">
                          <span>Timeout (seconds)</span>
                          <input
                            className="runtimeInput"
                            type="number"
                            step="0.1"
                            placeholder="5"
                            value={String(selectedEdge.endTimeoutSeconds ?? '')}
                            onChange={(event) => {
                              const v = event.target.value
                              if (v === '') {
                                updateEdge(selectedEdge.id, { endTimeoutSeconds: undefined })
                              } else {
                                updateEdge(selectedEdge.id, { endTimeoutSeconds: Math.max(0, Number(v)) })
                              }
                            }}
                          />
                        </label>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {/* Информация о подключённом .yyp проекте. */}
          <div className="runtimeSectionTitle" style={{ marginTop: 8 }}>Project</div>
          {resources ? (
            <div className="runtimeHint">
              {resources.yypPath}
              <br />Sprites: {resources.sprites.length}
              <br />Objects: {resources.objects.length}
              <br />Rooms: {resources.rooms.length}
            </div>
          ) : (
            <div className="runtimeHint">No project loaded. File → Open Project...</div>
          )}
        </div>
      )
    }

    if (panelId === 'panel.logs') {
      // Считаем количество записей по категориям.
      const errorEntries = validation.entries.filter((e) => e.severity === 'error')
      const warnEntries = validation.entries.filter((e) => e.severity === 'warn')
      const tipEntries = validation.entries.filter((e) => e.severity === 'tip')

      // Какие записи показываем в текущей вкладке.
      const visibleEntries =
        logsTab === 'errors' ? errorEntries : logsTab === 'warnings' ? warnEntries : tipEntries

      // Цвета и иконки для каждого типа.
      const severityStyle: Record<string, { color: string; bg: string; icon: string }> = {
        error: { color: '#e05050', bg: 'rgba(224,80,80,0.08)', icon: '✖' },
        warn: { color: '#d4a017', bg: 'rgba(212,160,23,0.08)', icon: '⚠' },
        tip: { color: '#58a6ff', bg: 'rgba(88,166,255,0.06)', icon: '💡' }
      }

      return (
        <div className="runtimeSection">
          {/* --- Вкладки: Errors / Warnings / Tips --- */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 6, borderBottom: '1px solid var(--ev-c-gray-3)' }}>
            {([
              { key: 'errors' as const, label: 'Errors', count: errorEntries.length, color: '#e05050' },
              { key: 'warnings' as const, label: 'Warnings', count: warnEntries.length, color: '#d4a017' },
              { key: 'tips' as const, label: 'Tips', count: tipEntries.length, color: '#58a6ff' }
            ]).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setLogsTab(tab.key)}
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  fontSize: 11,
                  fontWeight: logsTab === tab.key ? 700 : 400,
                  color: logsTab === tab.key ? tab.color : 'var(--ev-c-text-2)',
                  background: logsTab === tab.key ? 'rgba(255,255,255,0.04)' : 'transparent',
                  border: 'none',
                  borderBottom: logsTab === tab.key ? `2px solid ${tab.color}` : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'color 0.12s, background 0.12s'
                }}
              >
                {tab.label} {tab.count > 0 ? `(${tab.count})` : ''}
              </button>
            ))}
          </div>

          {/* --- Записи текущей вкладки --- */}
          {visibleEntries.length === 0 ? (
            <div className="runtimeHint" style={{ color: '#6c6' }}>
              {logsTab === 'errors' ? 'No errors.' : logsTab === 'warnings' ? 'No warnings.' : 'No tips.'}
            </div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {visibleEntries.map((entry, i) => {
                const s = severityStyle[entry.severity] ?? severityStyle.warn
                return (
                  <div
                    key={i}
                    style={{
                      padding: '3px 6px',
                      marginBottom: 2,
                      fontSize: 12,
                      borderLeft: `3px solid ${s.color}`,
                      background: s.bg,
                      cursor: entry.nodeId || entry.edgeId ? 'pointer' : undefined
                    }}
                    onClick={() => {
                      // Клик по записи — выбираем ноду или ребро на холсте.
                      if (entry.nodeId) {
                        setRuntime({ ...runtime, selectedNodeId: entry.nodeId, selectedNodeIds: [entry.nodeId], selectedEdgeId: null })
                      } else if (entry.edgeId) {
                        setRuntime({ ...runtime, selectedNodeId: null, selectedNodeIds: [], selectedEdgeId: entry.edgeId })
                      }
                    }}
                  >
                    <span style={{ fontWeight: 600, color: s.color }}>{s.icon}</span>{' '}
                    {entry.message}
                  </div>
                )
              })}
            </div>
          )}

          {/* --- Raw JSON (свёрнутый по умолчанию) --- */}
          <details style={{ marginTop: 8 }}>
            <summary className="runtimeSectionTitle" style={{ cursor: 'pointer' }}>Runtime JSON</summary>
            <pre className="runtimeCode">{JSON.stringify(runtime, null, 2)}</pre>
          </details>
        </div>
      )
    }

    return <div className="placeholderText">Unknown panel: {panelId}</div>
  }

  // Определяем, над какой док-зоной сейчас курсор.
  const getHoverSlotAtPoint = (clientX: number, clientY: number): DockSlotId | null => {
    const leftRect = leftDockRef.current?.getBoundingClientRect() ?? null
    const rightRect = rightDockRef.current?.getBoundingClientRect() ?? null
    const bottomRect = bottomDockRef.current?.getBoundingClientRect() ?? null

    const isInside = (r: DOMRect | null): boolean => {
      if (!r) return false
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
    }

    if (isInside(leftRect)) return 'left'
    if (isInside(rightRect)) return 'right'
    if (isInside(bottomRect)) return 'bottom'
    return null
  }

  // Определяем позицию (x/y) для плавающей панели.
  // Координаты считаем относительно editorRoot, чтобы их легко сохранять.
  const getFloatingPositionAtPoint = (clientX: number, clientY: number, grabOffset: Vec2): Vec2 => {
    const rootRect = rootRef.current?.getBoundingClientRect()
    if (!rootRect) return { x: clientX - grabOffset.x, y: clientY - grabOffset.y }
    return {
      x: clientX - rootRect.left - grabOffset.x,
      y: clientY - rootRect.top - grabOffset.y
    }
  }

  // Примерный индекс вставки панели в слот (вверх/вниз).
  // Пока мы делаем простую логику: в верхнюю половину — index 0, в нижнюю — в конец.
  const getInsertIndexForSlot = (slot: DockSlotId, clientY: number): number => {
    const el = slot === 'left' ? leftDockRef.current : slot === 'right' ? rightDockRef.current : bottomDockRef.current
    const rect = el?.getBoundingClientRect() ?? null
    const currentDocked = layoutRef.current.docked[slot]
    const capacity = getSlotCapacity(slot)

    if (!rect) return Math.min(currentDocked.length, Math.max(0, capacity - 1))
    if (capacity === 1) return 0

    const midY = rect.top + rect.height / 2
    return clientY < midY ? 0 : 1
  }

  // Начинаем перетаскивание панели.
  const startPanelDrag = (panelId: string) => (event: React.PointerEvent<HTMLElement>) => {
    // Левой кнопкой мыши.
    if (event.button !== 0) return

    const currentPanel = layoutRef.current.panels[panelId]
    if (!currentPanel || currentPanel.mode === 'hidden') return

    // Чтобы браузер не пытался выделять текст и т.п.
    event.preventDefault()
    event.stopPropagation()

    // Захватываем pointer, чтобы продолжать получать события,
    // даже если курсор убежал за пределы шапки.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Иногда setPointerCapture может падать (зависит от браузера/контекста).
      // В таком случае мы всё равно будем слушать window events.
    }

    // Берём DOM-rect панели, чтобы знать её размер.
    const panelEl = (event.currentTarget as HTMLElement).closest('.dockPanel') as HTMLElement | null
    const panelRect = panelEl?.getBoundingClientRect() ?? null

    const grabOffset: Vec2 = panelRect
      ? { x: event.clientX - panelRect.left, y: event.clientY - panelRect.top }
      : { x: 12, y: 12 }

    const size: Size = panelRect
      ? { width: Math.max(120, Math.round(panelRect.width)), height: Math.max(80, Math.round(panelRect.height)) }
      : { width: 320, height: 220 }

    const ghostPosition = getFloatingPositionAtPoint(event.clientX, event.clientY, grabOffset)
    const hoverSlot = getHoverSlotAtPoint(event.clientX, event.clientY)

    // Если мы тащим floating панель, поднимаем её наверх по zIndex.
    // Так она не окажется под другими окнами.
    if (currentPanel.mode === 'floating') {
      const maxZ = Math.max(1, ...Object.values(layoutRef.current.panels).map((p) => p.zIndex ?? 1))
      if (currentPanel.zIndex < maxZ) {
        setLayout({
          ...layoutRef.current,
          panels: {
            ...layoutRef.current.panels,
            [panelId]: {
              ...currentPanel,
              zIndex: maxZ + 1
            }
          }
        })
      }
    }

    setDrag({
      panelId,
      pointerId: event.pointerId,
      grabOffset,
      size
    })

    // Сразу обновляем превью, чтобы призрак появился без задержек.
    scheduleDragPreview(ghostPosition, hoverSlot)
  }

  // Пока пользователь тащит панель, мы обновляем "призрак" и подсветку дока.
  useEffect(() => {
    if (!drag) return

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return

      const ghostPosition = getFloatingPositionAtPoint(event.clientX, event.clientY, drag.grabOffset)
      const hoverSlot = getHoverSlotAtPoint(event.clientX, event.clientY)

      // Обновляем только превью, чтобы не трясти всё дерево.
      scheduleDragPreview(ghostPosition, hoverSlot)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return

      const currentLayout = layoutRef.current
      const currentPanel = currentLayout.panels[drag.panelId]
      if (!currentPanel) {
        setDrag(null)
        updateDragPreviewDOM(null, null)
        return
      }

      const hoverSlot = getHoverSlotAtPoint(event.clientX, event.clientY)
      const nextDocked = {
        left: [...currentLayout.docked.left],
        right: [...currentLayout.docked.right],
        bottom: [...currentLayout.docked.bottom]
      }

      const nextPanels = { ...currentLayout.panels }

      // Всегда сначала вынимаем панель отовсюду.
      removeFromAllSlots(nextDocked, drag.panelId)

      // Вариант 1: докаем.
      if (hoverSlot) {
        const insertIndex = getInsertIndexForSlot(hoverSlot, event.clientY)
        insertIntoSlot(nextDocked, hoverSlot, drag.panelId, insertIndex)
        enforceSlotCapacity(nextDocked, nextPanels, hoverSlot, drag.panelId)

        setLayout({
          ...currentLayout,
          docked: nextDocked,
          panels: {
            ...nextPanels,
            [drag.panelId]: {
              ...currentPanel,
              mode: 'docked',
              slot: hoverSlot,
              position: null,
              size: null,
              lastDockedSlot: hoverSlot,
              lastFloatingPosition: currentPanel.position ?? currentPanel.lastFloatingPosition ?? null,
              lastFloatingSize: currentPanel.size ?? currentPanel.lastFloatingSize ?? null
            }
          }
        })

        setDrag(null)
        updateDragPreviewDOM(null, null)
        return
      }

      // Вариант 2: оставляем floating.
      const floatingPosition = getFloatingPositionAtPoint(event.clientX, event.clientY, drag.grabOffset)
      const maxZ = Math.max(1, ...Object.values(currentLayout.panels).map((p) => p.zIndex ?? 1))

      setLayout({
        ...currentLayout,
        docked: nextDocked,
        panels: {
          ...currentLayout.panels,
          [drag.panelId]: {
            ...currentPanel,
            mode: 'floating',
            slot: null,
            position: floatingPosition,
            size: drag.size,
            zIndex: maxZ + 1,
            lastDockedSlot: currentPanel.slot ?? currentPanel.lastDockedSlot ?? null,
            lastFloatingPosition: floatingPosition,
            lastFloatingSize: drag.size
          }
        }
      })

      setDrag(null)
      updateDragPreviewDOM(null, null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [drag, setLayout])

  // Переключаем видимость панели через меню.
  // Сейчас это только show/hide, без реального docking.
  const togglePanel = (panelId: string) => {
    const current = layout.panels[panelId]
    if (!current) return

    // Закрываем панель.
    if (current.mode !== 'hidden') {
      const nextDocked = {
        left: [...layout.docked.left],
        right: [...layout.docked.right],
        bottom: [...layout.docked.bottom]
      }
      removeFromAllSlots(nextDocked, panelId)

      // Если панель была floating, запомним её последнюю позицию/размер.
      const lastFloatingPosition = current.position ?? current.lastFloatingPosition ?? null
      const lastFloatingSize = current.size ?? current.lastFloatingSize ?? null

      setLayout({
        ...layout,
        docked: nextDocked,
        panels: {
          ...layout.panels,
          [panelId]: {
            ...current,
            mode: 'hidden',
            lastDockedSlot: current.slot ?? current.lastDockedSlot ?? null,
            slot: null,
            position: null,
            size: null,
            lastFloatingPosition,
            lastFloatingSize
          }
        }
      })
      return
    }

    // Открываем панель как floating (не ломаем док-раскладку).
    const rootRect = rootRef.current?.getBoundingClientRect()
    const fallbackSize = current.lastFloatingSize ?? { width: 360, height: 240 }

    const clampedWidth = clamp(fallbackSize.width, MIN_FLOAT_WIDTH, rootRect?.width ?? fallbackSize.width)
    const clampedHeight = clamp(fallbackSize.height, MIN_FLOAT_HEIGHT, rootRect?.height ?? fallbackSize.height)

    // Стартовая позиция — либо последняя, либо центр экрана.
    const defaultPosition: Vec2 = current.lastFloatingPosition ?? {
      x: rootRect ? Math.max(12, (rootRect.width - clampedWidth) / 2) : 120,
      y: rootRect ? Math.max(60, (rootRect.height - clampedHeight) / 2) : 80
    }

    const maxZ = Math.max(1, ...Object.values(layout.panels).map((p) => p.zIndex ?? 1))

    setLayout({
      ...layout,
      panels: {
        ...layout.panels,
        [panelId]: {
          ...current,
          mode: 'floating',
          slot: null,
          position: defaultPosition,
          // Размер окна по умолчанию, чтобы панель сразу была видна.
          size: { width: clampedWidth, height: clampedHeight },
          zIndex: maxZ + 1
        }
      }
    })
  }

  // Начинаем ресайз доков или floating панели.
  const startResizeDrag = (kind: ResizeKind, panelId?: string) => (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return

    event.preventDefault()
    event.stopPropagation()

    const currentLayout = layoutRef.current
    const panel = panelId ? currentLayout.panels[panelId] : null

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Если pointer capture недоступен, мы всё равно ловим события на window.
    }

    setResizeDrag({
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startDockSizes: { ...currentLayout.dockSizes },
      panelId,
      startPanelPosition: panel?.position ?? null,
      startPanelSize: panel?.size ?? null
    })
  }

  // Пока мы ресайзим, обновляем размеры в layout.
  useEffect(() => {
    if (!resizeDrag) return

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== resizeDrag.pointerId) return

      const currentLayout = layoutRef.current
      const rootRect = rootRef.current?.getBoundingClientRect()
      if (!rootRect) return

      const dx = event.clientX - resizeDrag.startX
      const dy = event.clientY - resizeDrag.startY

      if (resizeDrag.kind === 'dock-left') {
        const maxLeft = Math.max(MIN_LEFT_WIDTH, rootRect.width - currentLayout.dockSizes.rightWidth - MIN_CENTER_WIDTH)
        const nextLeftWidth = clamp(resizeDrag.startDockSizes.leftWidth + dx, MIN_LEFT_WIDTH, maxLeft)

        setLayout({
          ...currentLayout,
          dockSizes: {
            ...currentLayout.dockSizes,
            leftWidth: nextLeftWidth
          }
        })
        return
      }

      if (resizeDrag.kind === 'dock-right') {
        const maxRight = Math.max(MIN_RIGHT_WIDTH, rootRect.width - currentLayout.dockSizes.leftWidth - MIN_CENTER_WIDTH)
        const nextRightWidth = clamp(resizeDrag.startDockSizes.rightWidth - dx, MIN_RIGHT_WIDTH, maxRight)

        setLayout({
          ...currentLayout,
          dockSizes: {
            ...currentLayout.dockSizes,
            rightWidth: nextRightWidth
          }
        })
        return
      }

      if (resizeDrag.kind === 'dock-bottom') {
        const topBarHeight = 30
        const maxBottom = Math.max(
          MIN_BOTTOM_HEIGHT,
          rootRect.height - topBarHeight - MIN_CENTER_HEIGHT
        )
        const nextBottomHeight = clamp(resizeDrag.startDockSizes.bottomHeight - dy, MIN_BOTTOM_HEIGHT, maxBottom)

        setLayout({
          ...currentLayout,
          dockSizes: {
            ...currentLayout.dockSizes,
            bottomHeight: nextBottomHeight
          }
        })
        return
      }

      if (resizeDrag.kind === 'split-left') {
        const leftRect = leftDockRef.current?.getBoundingClientRect()
        if (!leftRect) return
        const ratio = clamp((event.clientY - leftRect.top) / leftRect.height, 0.15, 0.85)

        setLayout({
          ...currentLayout,
          dockSizes: {
            ...currentLayout.dockSizes,
            leftSplit: ratio
          }
        })
        return
      }

      if (resizeDrag.kind === 'split-right') {
        const rightRect = rightDockRef.current?.getBoundingClientRect()
        if (!rightRect) return
        const ratio = clamp((event.clientY - rightRect.top) / rightRect.height, 0.15, 0.85)

        setLayout({
          ...currentLayout,
          dockSizes: {
            ...currentLayout.dockSizes,
            rightSplit: ratio
          }
        })
        return
      }

      if (resizeDrag.kind.startsWith('float-') && resizeDrag.panelId) {
        const panel = currentLayout.panels[resizeDrag.panelId]
        if (!panel || !resizeDrag.startPanelSize || !resizeDrag.startPanelPosition) return

        const maxWidth = Math.max(MIN_FLOAT_WIDTH, rootRect.width - 24)
        const maxHeight = Math.max(MIN_FLOAT_HEIGHT, rootRect.height - 24)

        // Определяем, какие стороны двигаются.
        const affectsTop = resizeDrag.kind.includes('n')
        const affectsBottom = resizeDrag.kind.includes('s')
        const affectsLeft = resizeDrag.kind.includes('w')
        const affectsRight = resizeDrag.kind.includes('e')

        const startPos = resizeDrag.startPanelPosition
        const startSize = resizeDrag.startPanelSize

        let nextWidth = startSize.width
        let nextHeight = startSize.height
        let nextX = startPos.x
        let nextY = startPos.y

        if (affectsRight) {
          nextWidth = startSize.width + dx
        }

        if (affectsBottom) {
          nextHeight = startSize.height + dy
        }

        if (affectsLeft) {
          nextWidth = startSize.width - dx
          nextX = startPos.x + dx
        }

        if (affectsTop) {
          nextHeight = startSize.height - dy
          nextY = startPos.y + dy
        }

        // Ограничиваем размеры и корректируем позицию,
        // чтобы панель не "прыгала" при достижении минимума.
        const clampedWidth = clamp(nextWidth, MIN_FLOAT_WIDTH, maxWidth)
        const clampedHeight = clamp(nextHeight, MIN_FLOAT_HEIGHT, maxHeight)

        if (affectsLeft) {
          nextX = startPos.x + (startSize.width - clampedWidth)
        }

        if (affectsTop) {
          nextY = startPos.y + (startSize.height - clampedHeight)
        }

        const maxX = Math.max(0, rootRect.width - clampedWidth)
        const maxY = Math.max(0, rootRect.height - clampedHeight)

        nextX = clamp(nextX, 0, maxX)
        nextY = clamp(nextY, 0, maxY)

        setLayout({
          ...currentLayout,
          panels: {
            ...currentLayout.panels,
            [resizeDrag.panelId]: {
              ...panel,
              position: { x: nextX, y: nextY },
              size: { width: clampedWidth, height: clampedHeight }
            }
          }
        })
      }
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== resizeDrag.pointerId) return

      const currentLayout = layoutRef.current

      // Если это floating ресайз, запишем финальный размер как "последний".
      if (resizeDrag.kind.startsWith('float-') && resizeDrag.panelId) {
        const panel = currentLayout.panels[resizeDrag.panelId]
        if (panel?.size && panel.position) {
          setLayout({
            ...currentLayout,
            panels: {
              ...currentLayout.panels,
              [resizeDrag.panelId]: {
                ...panel,
                lastFloatingSize: panel.size,
                lastFloatingPosition: panel.position
              }
            }
          })
        }
      }

      setResizeDrag(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [resizeDrag, setLayout])

  const leftTopGrow = layout.dockSizes.leftSplit
  const leftBottomGrow = Math.max(0.001, 1 - layout.dockSizes.leftSplit)

  const rightTopGrow = layout.dockSizes.rightSplit
  const rightBottomGrow = Math.max(0.001, 1 - layout.dockSizes.rightSplit)

  // Какие панели реально лежат в доках сейчас (порядок важен).
  const leftDockedIds = layout.docked.left.filter((id) => layout.panels[id]?.mode === 'docked')
  const rightDockedIds = layout.docked.right.filter((id) => layout.panels[id]?.mode === 'docked')
  const bottomDockedIds = layout.docked.bottom.filter((id) => layout.panels[id]?.mode === 'docked')

  // Выбираем панели, которые сейчас floating.
  const floatingPanelIds = Object.keys(layout.panels).filter((id) => layout.panels[id]?.mode === 'floating')

  return (
    <div
      ref={rootRef}
      className="editorRoot"
      style={
        {
          // Ширины/высоты доков мы задаём через CSS-переменные,
          // чтобы потом было легко подключить drag-resize.
          ['--leftDockWidth' as any]: `${layout.dockSizes.leftWidth}px`,
          ['--rightDockWidth' as any]: `${layout.dockSizes.rightWidth}px`,
          ['--bottomDockHeight' as any]: `${layout.dockSizes.bottomHeight}px`
        } as CSSProperties
      }
    >
      {/* Уведомление об обновлении (показывается только когда есть новая версия). */}
      <UpdateNotification />

      <header className="editorTopBar">
        <TopMenuBar
          panels={allPanels}
          isPanelVisible={isPanelVisible}
          togglePanel={togglePanel}
          onOpenProject={openProject}
          onExport={handleExport}
          onNew={handleNew}
          onOpenScene={handleOpenScene}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onUndo={undo}
          onRedo={redo}
          onResetLayout={() => {
            // Сбрасываем layout к дефолтным значениям.
            import('./useLayoutState').then(({ createDefaultLayout }) => {
              setLayout(createDefaultLayout())
            })
          }}
          onToggleLogs={() => togglePanel('panel.logs')}
          onCheckUpdates={() => {
            window.api.updater
              .check()
              .then((res) => {
                if (res.status === 'available') {
                  alert(`Update available: v${res.version}`)
                  return
                }

                if (res.status === 'none') {
                  alert('No updates available.')
                  return
                }

                alert(`Update check failed: ${res.message}`)
              })
              .catch((err) => {
                // Если IPC-хэндлер не зарегистрирован или что-то пошло не так — покажем ошибку.
                const msg = err instanceof Error ? err.message : String(err)
                alert(`Update check failed: ${msg}`)
              })
          }}
          onAbout={() => alert('Undefscene Editor v1.0\nCutscene node editor for GameMaker.')}
          onExit={() => window.close()}
          onPreferences={() => setPreferencesOpen(true)}
        />
      </header>

      <aside
        ref={leftDockRef}
        className="editorLeftDock"
      >
        <div className="dockSlotSplit dockSlotSplitLeft">
          {leftDockedIds[0] ? (
            <DockPanel
              title={layout.panels[leftDockedIds[0]]?.title ?? leftDockedIds[0]}
              className={
                [
                  'dockPanelActions',
                  drag?.panelId === leftDockedIds[0] ? 'isDragSource' : ''
                ]
                  .filter(Boolean)
                  .join(' ')
              }
              style={getDockedPanelStyle(leftDockedIds[0], {
                flexGrow: leftDockedIds.length >= 2 ? leftTopGrow : 1,
                flexBasis: 0,
                minHeight: 0
              })}
              onHeaderPointerDown={startPanelDrag(leftDockedIds[0])}
              collapsed={layout.panels[leftDockedIds[0]]?.collapsed}
              onToggleCollapse={() => togglePanelCollapse(leftDockedIds[0])}
            >
              {renderPanelContents(leftDockedIds[0])}
            </DockPanel>
          ) : null}

          {leftDockedIds[0] && leftDockedIds[1] ? (
            <div
              className="internalSplitter"
              aria-hidden="true"
              onPointerDown={startResizeDrag('split-left')}
            />
          ) : null}

          {leftDockedIds[1] ? (
            <DockPanel
              title={layout.panels[leftDockedIds[1]]?.title ?? leftDockedIds[1]}
              className={
                [
                  'dockPanelBookmarks',
                  drag?.panelId === leftDockedIds[1] ? 'isDragSource' : ''
                ]
                  .filter(Boolean)
                  .join(' ')
              }
              style={getDockedPanelStyle(leftDockedIds[1], {
                flexGrow: leftDockedIds.length >= 2 ? leftBottomGrow : 1,
                flexBasis: 0,
                minHeight: 0
              })}
              onHeaderPointerDown={startPanelDrag(leftDockedIds[1])}
              collapsed={layout.panels[leftDockedIds[1]]?.collapsed}
              onToggleCollapse={() => togglePanelCollapse(leftDockedIds[1])}
            >
              {renderPanelContents(leftDockedIds[1])}
            </DockPanel>
          ) : null}
        </div>
      </aside>

      <main className="editorCenter">
        <div className="centerCanvasHeader">Node Editor</div>
        <div className="centerCanvasBody">
          {/* Основной холст: показываем ноды и выбор из runtime-json. */}
          <FlowCanvas
            runtimeNodes={runtime.nodes}
            runtimeEdges={runtime.edges}
            selectedNodeId={runtime.selectedNodeId}
            selectedNodeIds={runtime.selectedNodeIds}
            selectedEdgeId={runtime.selectedEdgeId}
            onSelectNodes={(nodeIds) => {
              // Важно: React Flow может звать onSelectionChange даже когда выделение не поменялось.
              // Если мы будем каждый раз делать setRuntime, получится бесконечный цикл рендера.
              const nextSelectedNodeId = nodeIds.length === 1 ? nodeIds[0] : null
              const sameIds =
                (runtime.selectedNodeIds?.length ?? 0) === nodeIds.length &&
                nodeIds.every((id, i) => runtime.selectedNodeIds?.[i] === id)

              if (
                runtime.selectedEdgeId === null &&
                runtime.selectedNodeId === nextSelectedNodeId &&
                sameIds
              ) {
                return
              }

              setRuntime({
                ...runtime,
                selectedNodeId: nextSelectedNodeId,
                selectedNodeIds: nodeIds,
                selectedEdgeId: null
              })
            }}
            onSelectEdge={(edgeId) => {
              // Аналогично: не делаем setRuntime, если edge уже выбран.
              if (
                runtime.selectedEdgeId === edgeId &&
                runtime.selectedNodeId === null &&
                (runtime.selectedNodeIds?.length ?? 0) === 0
              ) {
                return
              }

              setRuntime({
                ...runtime,
                selectedNodeId: null,
                selectedNodeIds: [],
                selectedEdgeId: edgeId
              })
            }}
            onNodePositionChange={(changes) => {
              // Сохраняем позиции узлов после перетаскивания в runtime.
              // changes — массив, чтобы при мультидраге все позиции обновились за один setRuntime.
              const posMap = new Map(changes.map((c) => [c.id, { x: c.x, y: c.y }]))
              setRuntime({
                ...runtime,
                nodes: runtime.nodes.map((n) => {
                  const newPos = posMap.get(n.id)
                  return newPos ? { ...n, position: newPos } : n
                })
              })
            }}
            onEdgeAdd={(edge) => {
              // Добавляем новую связь в runtime (если такой ещё нет).
              if (runtime.edges.some((e) => e.id === edge.id)) return
              setRuntime({
                ...runtime,
                edges: [...runtime.edges, edge]
              })
            }}
            onEdgeRemove={(edgeId) => {
              // Удаляем связь из runtime.
              setRuntime({
                ...runtime,
                edges: runtime.edges.filter((e) => e.id !== edgeId)
              })
            }}
            onParallelAddBranch={onParallelAddBranch}
            onNodeDelete={(nodeId) => {
              // ПКМ по ноде — удаляем ноду и все связанные рёбра.
              const nextSelectedNodeIds = (runtime.selectedNodeIds ?? []).filter((id) => id !== nodeId)
              setRuntime({
                ...runtime,
                nodes: runtime.nodes.filter((n) => n.id !== nodeId),
                edges: runtime.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
                selectedNodeId: runtime.selectedNodeId === nodeId ? null : runtime.selectedNodeId,
                selectedNodeIds: nextSelectedNodeIds,
                selectedEdgeId: null
              })
            }}
            onPaneClickCreate={(x, y) => {
              // ЛКМ по холсту — создаём новую ноду в позиции курсора.
              // По умолчанию тип 'dialogue' (самый частый), можно сменить в Inspector.
              const newId = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`

              // Генерируем уникальное имя “Node”, чтобы новый узел не конфликтовал с другими.
              const takenNames = new Set(
                runtime.nodes
                  .map((n) => String(n.name ?? '').trim())
                  .filter((v) => v.length > 0)
              )
              const newName = suggestUniqueNodeName('Node', takenNames)

              setRuntime({
                ...runtime,
                nodes: [
                  ...runtime.nodes,
                  {
                    id: newId,
                    type: 'dialogue',
                    name: newName,
                    text: '',
                    position: { x, y }
                  }
                ],
                selectedNodeId: newId,
                selectedNodeIds: [newId],
                selectedEdgeId: null
              })
            }}
            onEdgeDelete={(edgeId) => {
              // ПКМ по связи — удаляем связь.
              setRuntime({
                ...runtime,
                edges: runtime.edges.filter((e) => e.id !== edgeId),
                selectedEdgeId: runtime.selectedEdgeId === edgeId ? null : runtime.selectedEdgeId
              })
            }}
            onEdgeDoubleClick={() => {
              // Двойной клик по ребру — после рендера фокусируем wait input.
              shouldFocusEdgeWaitRef.current = true
            }}
          />
        </div>
      </main>

      <aside
        ref={rightDockRef}
        className="editorRightDock"
      >
        <div className="dockSlotSplit dockSlotSplitRight">
          {rightDockedIds[0] ? (
            <DockPanel
              title={layout.panels[rightDockedIds[0]]?.title ?? rightDockedIds[0]}
              className={
                [
                  'dockPanelText',
                  drag?.panelId === rightDockedIds[0] ? 'isDragSource' : ''
                ]
                  .filter(Boolean)
                  .join(' ')
              }
              style={getDockedPanelStyle(rightDockedIds[0], {
                flexGrow: rightDockedIds.length >= 2 ? rightTopGrow : 1,
                flexBasis: 0,
                minHeight: 0
              })}
              onHeaderPointerDown={startPanelDrag(rightDockedIds[0])}
              collapsed={layout.panels[rightDockedIds[0]]?.collapsed}
              onToggleCollapse={() => togglePanelCollapse(rightDockedIds[0])}
            >
              {renderPanelContents(rightDockedIds[0])}
            </DockPanel>
          ) : null}

          {rightDockedIds[0] && rightDockedIds[1] ? (
            <div
              className="internalSplitter"
              aria-hidden="true"
              onPointerDown={startResizeDrag('split-right')}
            />
          ) : null}

          {rightDockedIds[1] ? (
            <DockPanel
              title={layout.panels[rightDockedIds[1]]?.title ?? rightDockedIds[1]}
              className={
                [
                  'dockPanelInspector',
                  drag?.panelId === rightDockedIds[1] ? 'isDragSource' : ''
                ]
                  .filter(Boolean)
                  .join(' ')
              }
              style={getDockedPanelStyle(rightDockedIds[1], {
                flexGrow: rightDockedIds.length >= 2 ? rightBottomGrow : 1,
                flexBasis: 0,
                minHeight: 0
              })}
              onHeaderPointerDown={startPanelDrag(rightDockedIds[1])}
              collapsed={layout.panels[rightDockedIds[1]]?.collapsed}
              onToggleCollapse={() => togglePanelCollapse(rightDockedIds[1])}
            >
              {renderPanelContents(rightDockedIds[1])}
            </DockPanel>
          ) : null}
        </div>
      </aside>

      <section
        ref={bottomDockRef}
        className="editorBottomDock"
      >
        {bottomDockedIds.length > 0 ? (() => {
          // Определяем активную вкладку: если сохранённая не в списке — берём первую.
          const activeId = (activeBottomTabId && bottomDockedIds.includes(activeBottomTabId))
            ? activeBottomTabId
            : bottomDockedIds[0]

          return (
            <>
              {/* Таб-бар показываем только если панелей > 1. */}
              {bottomDockedIds.length > 1 && (
                <div style={{
                  display: 'flex',
                  gap: 0,
                  borderBottom: '1px solid var(--ev-c-gray-3)',
                  background: 'var(--color-background-soft)',
                  flexShrink: 0
                }}>
                  {bottomDockedIds.map((panelId) => (
                    <button
                      key={panelId}
                      type="button"
                      onClick={() => setActiveBottomTabId(panelId)}
                      onPointerDown={(e) => {
                        // ПКМ — начинаем drag панели из таба.
                        if (e.button === 0 && e.detail >= 2) return
                      }}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        fontSize: 11,
                        fontWeight: panelId === activeId ? 700 : 400,
                        color: panelId === activeId ? 'var(--ev-c-text-1)' : 'var(--ev-c-text-2)',
                        background: panelId === activeId ? 'rgba(255,255,255,0.04)' : 'transparent',
                        border: 'none',
                        borderBottom: panelId === activeId ? '2px solid var(--ev-c-accent)' : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'color 0.12s, background 0.12s'
                      }}
                    >
                      {layout.panels[panelId]?.title ?? panelId}
                    </button>
                  ))}
                </div>
              )}

              {/* Контент активной вкладки. */}
              <DockPanel
                title={layout.panels[activeId]?.title ?? activeId}
                className={['dockPanelLogs', drag?.panelId === activeId ? 'isDragSource' : '']
                  .filter(Boolean)
                  .join(' ')}
                style={getDockedPanelStyle(activeId)}
                onHeaderPointerDown={startPanelDrag(activeId)}
                collapsed={layout.panels[activeId]?.collapsed}
                onToggleCollapse={() => togglePanelCollapse(activeId)}
              >
                {renderPanelContents(activeId)}
              </DockPanel>
            </>
          )
        })() : null}
      </section>

      {/*
        Отдельный слой для плавающих панелей.
        Он лежит поверх grid, но не ломает layout.
      */}
      <div className="floatingLayer" aria-hidden={drag ? 'true' : 'false'}>
        {floatingPanelIds.map((panelId) => {
          const p = layout.panels[panelId]
          if (!p || p.mode !== 'floating' || !p.position || !p.size) return null

          // Если панель сейчас тащим, мы показываем только "призрак".
          if (drag?.panelId === panelId) return null

          return (
            <div
              key={panelId}
              className="floatingPanel"
              style={{
                left: `${p.position.x}px`,
                top: `${p.position.y}px`,
                width: `${p.size.width}px`,
                height: `${p.size.height}px`,
                zIndex: p.zIndex
              }}
            >
              <DockPanel
                title={p.title}
                className="isFloating"
                onHeaderPointerDown={startPanelDrag(panelId)}
                collapsed={p.collapsed}
                onToggleCollapse={() => togglePanelCollapse(panelId)}
              >
                {renderPanelContents(panelId)}
              </DockPanel>
              {/* Невидимые зоны для ресайза по краям и углам (как в Windows). */}
              <div className="floatingResizeZone resize-n" onPointerDown={startResizeDrag('float-n', panelId)} />
              <div className="floatingResizeZone resize-s" onPointerDown={startResizeDrag('float-s', panelId)} />
              <div className="floatingResizeZone resize-e" onPointerDown={startResizeDrag('float-e', panelId)} />
              <div className="floatingResizeZone resize-w" onPointerDown={startResizeDrag('float-w', panelId)} />
              <div className="floatingResizeZone resize-ne" onPointerDown={startResizeDrag('float-ne', panelId)} />
              <div className="floatingResizeZone resize-nw" onPointerDown={startResizeDrag('float-nw', panelId)} />
              <div className="floatingResizeZone resize-se" onPointerDown={startResizeDrag('float-se', panelId)} />
              <div className="floatingResizeZone resize-sw" onPointerDown={startResizeDrag('float-sw', panelId)} />
            </div>
          )
        })}

        {/* Призрак панели всегда в DOM, но скрыт когда не тащим.
            Позиция и видимость управляются через ref напрямую, минуя React. */}
        <div
          ref={ghostRef}
          className="dragGhost"
          style={{
            display: 'none',
            width: drag ? `${drag.size.width}px` : undefined,
            height: drag ? `${drag.size.height}px` : undefined
          }}
        >
          <div className="dragGhostHeader">
            {drag ? (layout.panels[drag.panelId]?.title ?? drag.panelId) : ''}
          </div>
        </div>
      </div>

      {/* Сплиттеры для изменения размеров доков. */}
      <div className="dockSplitter dockSplitterVertical dockSplitterLeft" onPointerDown={startResizeDrag('dock-left')} />
      <div className="dockSplitter dockSplitterVertical dockSplitterRight" onPointerDown={startResizeDrag('dock-right')} />
      <div
        className="dockSplitter dockSplitterHorizontal dockSplitterBottom"
        onPointerDown={startResizeDrag('dock-bottom')}
      />

      {/* Модалка настроек. */}
      <PreferencesModal open={preferencesOpen} onClose={() => setPreferencesOpen(false)} />

      {/*
        Модалка предупреждения о конфликте имени ноды.
        Дубликаты разрешены, но по умолчанию мы предлагаем уникальный вариант.
      */}
      {nameConflictModal ? (
        <div
          className="prefsOverlay"
          onClick={() => {
            setPendingNodeName(nameConflictModal.previousName)
            setNameConflictModal(null)
          }}
        >
          <div className="prefsModal" onClick={(e) => e.stopPropagation()}>
            <div className="prefsHeader">
              <span className="prefsTitle">Duplicate node name</span>
              <button
                className="prefsCloseBtn"
                onClick={() => {
                  setPendingNodeName(nameConflictModal.previousName)
                  setNameConflictModal(null)
                }}
              >
                ✕
              </button>
            </div>

            <div className="prefsBody">
              <div className="prefsHint">
                This name is already used by another node{nameConflictModal.conflictingWithNodeId ? ` (${nameConflictModal.conflictingWithNodeId})` : ''}.
                Duplicates are allowed, but it can be confusing.
              </div>

              <label className="prefsField">
                <span>Name</span>
                <input
                  className="prefsInput"
                  value={nameConflictModal.value}
                  onChange={(e) =>
                    setNameConflictModal({
                      ...nameConflictModal,
                      value: e.target.value
                    })
                  }
                />
              </label>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  className="runtimeButton"
                  type="button"
                  onClick={() => {
                    setPendingNodeName(nameConflictModal.previousName)
                    setNameConflictModal(null)
                  }}
                >
                  Cancel
                </button>
                <button
                  ref={nameConflictOkRef}
                  className="runtimeButton"
                  type="button"
                  onClick={() => {
                    const v = nameConflictModal.value
                    setPendingNodeName(v)
                    setRuntime({
                      ...runtime,
                      nodes: runtime.nodes.map((n) =>
                        n.id === nameConflictModal.nodeId ? { ...n, name: v.trim() } : n
                      )
                    })
                    setNameConflictModal(null)
                  }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
