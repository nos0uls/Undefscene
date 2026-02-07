import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { DockPanel } from './DockPanel'
import { FlowCanvas } from './FlowCanvas'
import { TopMenuBar } from './TopMenuBar'
import type { DockSlotId, LayoutState, Size, Vec2 } from './layoutTypes'
import type { RuntimeNode } from './runtimeTypes'
import { useLayoutState } from './useLayoutState'
import { useRuntimeState } from './useRuntimeState'

type DragState = {
  // Какая панель сейчас перетаскивается.
  panelId: string

  // Какой pointerId мы захватили (нужно, чтобы не ловить чужие события).
  pointerId: number

  // Смещение курсора относительно левого верхнего угла панели.
  // Нужно, чтобы панель "прилипала" к курсору одинаково.
  grabOffset: Vec2

  // Размер панели во время перетаскивания.
  // Мы берём его из DOM в момент старта.
  size: Size

  // Текущая позиция "призрака" панели в координатах editorRoot.
  ghostPosition: Vec2

  // Куда пользователь сейчас "целится" (подсветка дока).
  hoverSlot: DockSlotId | null
}

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

  // Сохраняем актуальный layout в ref, чтобы pointer handlers не ловили старое значение.
  const layoutRef = useRef(layout)
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

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
  // Слева/справа — 2, внизу — 1.
  const getSlotCapacity = (slot: DockSlotId): number => (slot === 'bottom' ? 1 : 2)

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

    // Создаём новый узел и сразу выбираем его.
    const addNode = () => {
      const newId = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      const newNode: RuntimeNode = { id: newId, type: 'dialogue', text: '' }

      setRuntime({
        ...runtime,
        nodes: [...runtime.nodes, newNode],
        selectedNodeId: newId
      })
    }

    // Меняем выделение узла.
    const selectNode = (nodeId: string) => {
      setRuntime({
        ...runtime,
        selectedNodeId: nodeId
      })
    }

    if (panelId === 'panel.actions') {
      return (
        <div className="runtimeSection">
          <div className="runtimeSectionTitle">Actions</div>
          <div className="runtimeRow">
            <button className="runtimeButton" type="button" onClick={addNode}>
              Add Node
            </button>
            <button className="runtimeButton" type="button" onClick={undo} disabled={!canUndo}>
              Undo
            </button>
            <button className="runtimeButton" type="button" onClick={redo} disabled={!canRedo}>
              Redo
            </button>
          </div>
          <div className="runtimeHint">
            Узлы будут добавляться в список слева. Это базовый прототип редактора.
          </div>
        </div>
      )
    }

    if (panelId === 'panel.bookmarks') {
      return (
        <div className="runtimeSection">
          <div className="runtimeSectionTitle">Nodes</div>
          {runtime.nodes.length === 0 ? (
            <div className="runtimeHint">Пока нет узлов. Нажми “Add Node”.</div>
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
                    {node.type} · {node.id}
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
              placeholder="Текст реплики..."
              onChange={(event) => updateNode(selectedNode.id, { text: event.target.value })}
            />
          ) : (
            <div className="runtimeHint">Выбери узел слева, чтобы редактировать текст.</div>
          )}
        </div>
      )
    }

    if (panelId === 'panel.inspector') {
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
              <label className="runtimeField">
                <span>Node type</span>
                <input
                  className="runtimeInput"
                  value={selectedNode.type}
                  onChange={(event) => updateNode(selectedNode.id, { type: event.target.value })}
                />
              </label>
              <div className="runtimeHint">ID: {selectedNode.id}</div>
            </>
          ) : (
            <div className="runtimeHint">Нет выбранного узла.</div>
          )}
        </div>
      )
    }

    if (panelId === 'panel.logs') {
      return (
        <div className="runtimeSection">
          <div className="runtimeSectionTitle">Runtime JSON</div>
          <div className="runtimeHint">runtime.json — основной файл катсцены (источник правды).</div>
          <pre className="runtimeCode">{JSON.stringify(runtime, null, 2)}</pre>
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
      size,
      ghostPosition,
      hoverSlot
    })
  }

  // Пока пользователь тащит панель, мы обновляем "призрак" и подсветку дока.
  useEffect(() => {
    if (!drag) return

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return

      const ghostPosition = getFloatingPositionAtPoint(event.clientX, event.clientY, drag.grabOffset)
      const hoverSlot = getHoverSlotAtPoint(event.clientX, event.clientY)

      setDrag((prev) => {
        if (!prev) return prev
        if (prev.pointerId !== event.pointerId) return prev
        return { ...prev, ghostPosition, hoverSlot }
      })
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return

      const currentLayout = layoutRef.current
      const currentPanel = currentLayout.panels[drag.panelId]
      if (!currentPanel) {
        setDrag(null)
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
      <header className="editorTopBar">
        <TopMenuBar panels={allPanels} isPanelVisible={isPanelVisible} togglePanel={togglePanel} />
      </header>

      <aside
        ref={leftDockRef}
        className={['editorLeftDock', drag?.hoverSlot === 'left' ? 'isDockDropTarget' : ''].filter(Boolean).join(' ')}
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
              style={{
                flexGrow: leftDockedIds.length >= 2 ? leftTopGrow : 1,
                flexBasis: 0,
                minHeight: 0
              }}
              onHeaderPointerDown={startPanelDrag(leftDockedIds[0])}
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
              style={{
                flexGrow: leftDockedIds.length >= 2 ? leftBottomGrow : 1,
                flexBasis: 0,
                minHeight: 0
              }}
              onHeaderPointerDown={startPanelDrag(leftDockedIds[1])}
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
            selectedNodeId={runtime.selectedNodeId}
            onSelectNode={(nodeId) => {
              setRuntime({
                ...runtime,
                selectedNodeId: nodeId
              })
            }}
          />
        </div>
      </main>

      <aside
        ref={rightDockRef}
        className={['editorRightDock', drag?.hoverSlot === 'right' ? 'isDockDropTarget' : ''].filter(Boolean).join(' ')}
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
              style={{
                flexGrow: rightDockedIds.length >= 2 ? rightTopGrow : 1,
                flexBasis: 0,
                minHeight: 0
              }}
              onHeaderPointerDown={startPanelDrag(rightDockedIds[0])}
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
              style={{
                flexGrow: rightDockedIds.length >= 2 ? rightBottomGrow : 1,
                flexBasis: 0,
                minHeight: 0
              }}
              onHeaderPointerDown={startPanelDrag(rightDockedIds[1])}
            >
              {renderPanelContents(rightDockedIds[1])}
            </DockPanel>
          ) : null}
        </div>
      </aside>

      <section
        ref={bottomDockRef}
        className={
          ['editorBottomDock', drag?.hoverSlot === 'bottom' ? 'isDockDropTarget' : ''].filter(Boolean).join(' ')
        }
      >
        {bottomDockedIds[0] ? (
          <DockPanel
            title={layout.panels[bottomDockedIds[0]]?.title ?? bottomDockedIds[0]}
            className={['dockPanelLogs', drag?.panelId === bottomDockedIds[0] ? 'isDragSource' : '']
              .filter(Boolean)
              .join(' ')}
            onHeaderPointerDown={startPanelDrag(bottomDockedIds[0])}
          >
            {renderPanelContents(bottomDockedIds[0])}
          </DockPanel>
        ) : null}
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
              <DockPanel title={p.title} className="isFloating" onHeaderPointerDown={startPanelDrag(panelId)}>
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

        {drag ? (
          <div
            className="dragGhost"
            style={{
              left: `${drag.ghostPosition.x}px`,
              top: `${drag.ghostPosition.y}px`,
              width: `${drag.size.width}px`,
              height: `${drag.size.height}px`
            }}
          >
            <div className="dragGhostHeader">{layout.panels[drag.panelId]?.title ?? drag.panelId}</div>
          </div>
        ) : null}
      </div>

      {/* Сплиттеры для изменения размеров доков. */}
      <div className="dockSplitter dockSplitterVertical dockSplitterLeft" onPointerDown={startResizeDrag('dock-left')} />
      <div className="dockSplitter dockSplitterVertical dockSplitterRight" onPointerDown={startResizeDrag('dock-right')} />
      <div
        className="dockSplitter dockSplitterHorizontal dockSplitterBottom"
        onPointerDown={startResizeDrag('dock-bottom')}
      />
    </div>
  )
}
