import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { DockPanel } from './DockPanel'
import { TopMenuBar } from './TopMenuBar'
import type { DockSlotId, Size, Vec2 } from './layoutTypes'
import { useLayoutState } from './useLayoutState'

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

// Основной “каркас” редактора.
// Здесь мы собираем все зоны: верхнее меню, левые/правые доки,
// центральный холст и нижний лог.
export function EditorShell(): React.JSX.Element {
  // Храним текущую раскладку и автосохраняем её.
  // В Milestone 1 мы пока не даём пользователю двигать сплиттеры,
  // но размеры уже пробрасываем в CSS.
  const { layout, setLayout } = useLayoutState()

  // Ссылки на DOM, чтобы делать hit-test док-зон.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const leftDockRef = useRef<HTMLElement | null>(null)
  const rightDockRef = useRef<HTMLElement | null>(null)
  const bottomDockRef = useRef<HTMLElement | null>(null)

  // Храним состояние перетаскивания отдельно от layout.
  // Так мы не пишем layout.json 60 раз в секунду.
  const [drag, setDrag] = useState<DragState | null>(null)

  // Сохраняем актуальный layout в ref, чтобы pointer handlers не ловили старое значение.
  const layoutRef = useRef(layout)
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

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

  // Дефолтные слоты для панелей.
  // Нужно, чтобы мы могли "вернуть" панель обратно, когда пользователь её открывает.
  const getDefaultSlot = (panelId: string): 'left' | 'right' | 'bottom' => {
    if (panelId === 'panel.actions' || panelId === 'panel.bookmarks') return 'left'
    if (panelId === 'panel.text' || panelId === 'panel.inspector') return 'right'
    return 'bottom'
  }

  // Позиция внутри слота по умолчанию.
  // Например: Actions всегда сверху слева, Bookmarks снизу слева.
  const getDefaultDockIndex = (panelId: string): number => {
    if (panelId === 'panel.actions') return 0
    if (panelId === 'panel.bookmarks') return 1
    if (panelId === 'panel.text') return 0
    if (panelId === 'panel.inspector') return 1
    return 0
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
    if (panelId === 'panel.actions') {
      return (
        <div className="placeholderText">Здесь будет список действий катсцены (группы, параллельные блоки, и т.д.)</div>
      )
    }

    if (panelId === 'panel.bookmarks') {
      return <div className="placeholderText">Здесь будут заголовки/закладки для быстрого перехода.</div>
    }

    if (panelId === 'panel.text') {
      return <div className="placeholderText">Здесь будет текст/реплики катсцены.</div>
    }

    if (panelId === 'panel.inspector') {
      return <div className="placeholderText">Здесь будет инспектор выбранного узла.</div>
    }

    if (panelId === 'panel.logs') {
      return <div className="placeholderText">Здесь будут логи редактора и статус превью.</div>
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

      setLayout({
        ...layout,
        docked: nextDocked,
        panels: {
          ...layout.panels,
          [panelId]: {
            ...current,
            mode: 'hidden',
            lastDockedSlot: current.slot ?? current.lastDockedSlot ?? null,
            slot: null
          }
        }
      })
      return
    }

    // Открываем панель.
    const defaultSlot = current.lastDockedSlot ?? getDefaultSlot(panelId)
    const defaultIndex = getDefaultDockIndex(panelId)

    const nextDocked = {
      left: [...layout.docked.left],
      right: [...layout.docked.right],
      bottom: [...layout.docked.bottom]
    }

    const nextPanels = { ...layout.panels }

    removeFromAllSlots(nextDocked, panelId)
    insertIntoSlot(nextDocked, defaultSlot, panelId, defaultIndex)
    enforceSlotCapacity(nextDocked, nextPanels, defaultSlot, panelId)

    setLayout({
      ...layout,
      docked: nextDocked,
      panels: {
        ...nextPanels,
        [panelId]: {
          ...current,
          mode: 'docked',
          slot: defaultSlot
        }
      }
    })
  }

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

          {leftDockedIds[0] && leftDockedIds[1] ? <div className="internalSplitter" aria-hidden="true" /> : null}

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
          <div className="placeholderText">
            Центральный холст. Позже здесь будет React Flow (или другой node editor).
          </div>
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

          {rightDockedIds[0] && rightDockedIds[1] ? <div className="internalSplitter" aria-hidden="true" /> : null}

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
    </div>
  )
}
