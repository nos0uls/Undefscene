import type { CSSProperties } from 'react'
import { DockPanel } from './DockPanel'
import { TopMenuBar } from './TopMenuBar'
import { useLayoutState } from './useLayoutState'

// Основной “каркас” редактора.
// Здесь мы собираем все зоны: верхнее меню, левые/правые доки,
// центральный холст и нижний лог.
export function EditorShell(): React.JSX.Element {
  // Храним текущую раскладку и автосохраняем её.
  // В Milestone 1 мы пока не даём пользователю двигать сплиттеры,
  // но размеры уже пробрасываем в CSS.
  const { layout, setLayout } = useLayoutState()

  // Список всех панелей, которые можно показать через меню.
  // Это замена старых кнопок "Open Any" над доками.
  const allPanels = [
    { id: 'panel.actions', label: 'Actions' },
    { id: 'panel.bookmarks', label: 'Bookmarks' },
    { id: 'panel.text', label: 'Text' },
    { id: 'panel.inspector', label: 'Inspector' },
    { id: 'panel.logs', label: 'Logs / Warnings' }
  ]

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

    removeFromAllSlots(nextDocked, panelId)
    insertIntoSlot(nextDocked, defaultSlot, panelId, defaultIndex)

    setLayout({
      ...layout,
      docked: nextDocked,
      panels: {
        ...layout.panels,
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

  return (
    <div
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

      <aside className="editorLeftDock">
        <div className="dockSlotSplit dockSlotSplitLeft">
          {isPanelVisible('panel.actions') ? (
            <DockPanel
              title="Actions"
              className="dockPanelActions"
              style={{ flexGrow: leftTopGrow, flexBasis: 0, minHeight: 0 }}
            >
              <div className="placeholderText">
                Здесь будет список действий катсцены (группы, параллельные блоки, и т.д.)
              </div>
            </DockPanel>
          ) : null}

          {isPanelVisible('panel.actions') && isPanelVisible('panel.bookmarks') ? (
            <div className="internalSplitter" aria-hidden="true" />
          ) : null}

          {isPanelVisible('panel.bookmarks') ? (
            <DockPanel
              title="Bookmarks"
              className="dockPanelBookmarks"
              style={{ flexGrow: leftBottomGrow, flexBasis: 0, minHeight: 0 }}
            >
              <div className="placeholderText">Здесь будут заголовки/закладки для быстрого перехода.</div>
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

      <aside className="editorRightDock">
        <div className="dockSlotSplit dockSlotSplitRight">
          {isPanelVisible('panel.text') ? (
            <DockPanel
              title="Text"
              className="dockPanelText"
              style={{ flexGrow: rightTopGrow, flexBasis: 0, minHeight: 0 }}
            >
              <div className="placeholderText">Здесь будет текст/реплики катсцены.</div>
            </DockPanel>
          ) : null}

          {isPanelVisible('panel.text') && isPanelVisible('panel.inspector') ? (
            <div className="internalSplitter" aria-hidden="true" />
          ) : null}

          {isPanelVisible('panel.inspector') ? (
            <DockPanel
              title="Inspector"
              className="dockPanelInspector"
              style={{ flexGrow: rightBottomGrow, flexBasis: 0, minHeight: 0 }}
            >
              <div className="placeholderText">Здесь будет инспектор выбранного узла.</div>
            </DockPanel>
          ) : null}
        </div>
      </aside>

      <section className="editorBottomDock">
        {isPanelVisible('panel.logs') ? (
          <DockPanel title="Logs / Warnings" className="dockPanelLogs">
            <div className="placeholderText">Здесь будут логи редактора и статус превью.</div>
          </DockPanel>
        ) : null}
      </section>
    </div>
  )
}
