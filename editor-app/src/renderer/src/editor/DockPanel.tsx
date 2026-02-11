import type { CSSProperties, PropsWithChildren } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

export type DockPanelProps = PropsWithChildren<{
  // Заголовок, который показывается в шапке панели.
  title: string

  // Доп. CSS-класс, если нужно.
  className?: string

  // Инлайновые стили. Нужно, например, чтобы задавать размер в сплите.
  style?: CSSProperties

  // Сюда мы пробрасываем начало перетаскивания панели.
  // Событие приходит только при нажатии на шапку панели.
  onHeaderPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void

  // Свёрнута ли панель (показываем только шапку).
  collapsed?: boolean

  // Коллбек для сворачивания/разворачивания панели.
  onToggleCollapse?: () => void
}>

// Простая базовая панель для доков.
// Позже мы добавим сюда drag-start на шапке и контекстное меню.
export function DockPanel(props: DockPanelProps): React.JSX.Element {
  const { title, className, style, onHeaderPointerDown, collapsed, onToggleCollapse, children } = props

  return (
    <section
      className={['dockPanel', collapsed ? 'isCollapsed' : '', className].filter(Boolean).join(' ')}
      style={style}
    >
      <header className="dockPanelHeader" onPointerDown={onHeaderPointerDown}>
        <div className="dockPanelTitle">{title}</div>
        <button
          className="dockPanelMenuButton"
          type="button"
          aria-label="panel menu"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onToggleCollapse?.()
          }}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </header>
      {/* Тело панели скрываем, когда она свёрнута. */}
      {!collapsed ? <div className="dockPanelBody">{children}</div> : null}
    </section>
  )
}
