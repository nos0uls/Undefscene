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
  const { layout } = useLayoutState()

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
        <TopMenuBar />
      </header>

      <aside className="editorLeftDock">
        <div className="dockSlotHeader">
          <div className="dockSlotTitle">Dock 1</div>
          <button className="dockSlotMenuButton" type="button">
            Open Any ▾
          </button>
        </div>

        <div className="dockSlotSplit dockSlotSplitLeft">
          <DockPanel
            title="Actions"
            className="dockPanelActions"
            style={{ flexGrow: leftTopGrow, flexBasis: 0, minHeight: 0 }}
          >
            <div className="placeholderText">
              Здесь будет список действий катсцены (группы, параллельные блоки, и т.д.)
            </div>
          </DockPanel>

          <div className="internalSplitter" aria-hidden="true" />

          <DockPanel
            title="Bookmarks"
            className="dockPanelBookmarks"
            style={{ flexGrow: leftBottomGrow, flexBasis: 0, minHeight: 0 }}
          >
            <div className="placeholderText">Здесь будут заголовки/закладки для быстрого перехода.</div>
          </DockPanel>
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
        <div className="dockSlotHeader">
          <div className="dockSlotTitle">Dock 2 / Dock 3</div>
          <button className="dockSlotMenuButton" type="button">
            Open Any ▾
          </button>
        </div>

        <div className="dockSlotSplit dockSlotSplitRight">
          <DockPanel title="Text" className="dockPanelText" style={{ flexGrow: rightTopGrow, flexBasis: 0, minHeight: 0 }}>
            <div className="placeholderText">Здесь будет текст/реплики катсцены.</div>
          </DockPanel>

          <div className="internalSplitter" aria-hidden="true" />

          <DockPanel
            title="Inspector"
            className="dockPanelInspector"
            style={{ flexGrow: rightBottomGrow, flexBasis: 0, minHeight: 0 }}
          >
            <div className="placeholderText">Здесь будет инспектор выбранного узла.</div>
          </DockPanel>
        </div>
      </aside>

      <section className="editorBottomDock">
        <DockPanel title="Logs / Warnings" className="dockPanelLogs">
          <div className="placeholderText">Здесь будут логи редактора и статус превью.</div>
        </DockPanel>
      </section>
    </div>
  )
}
