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

  // Подписи для header buttons.
  // Они нужны, чтобы aria-label/title шли через i18n.
  collapseLabel?: string
  closeLabel?: string

  // Коллбек для полного скрытия панели.
  // По смыслу это то же самое, что клик по пункту меню Panels.
  onClose?: () => void
}>

// Простая базовая панель для доков.
// Позже мы добавим сюда drag-start на шапке и контекстное меню.
export function DockPanel(props: DockPanelProps): React.JSX.Element {
  const {
    title,
    className,
    style,
    onHeaderPointerDown,
    collapsed,
    onToggleCollapse,
    collapseLabel,
    closeLabel,
    onClose,
    children
  } = props

  return (
    <section
      className={['dockPanel', collapsed ? 'isCollapsed' : '', className].filter(Boolean).join(' ')}
      style={style}
    >
      <header className="dockPanelHeader" onPointerDown={onHeaderPointerDown}>
        <div className="dockPanelTitle">{title}</div>
        <div className="dockPanelHeaderActions">
          <button
            className="dockPanelHeaderButton"
            type="button"
            aria-label={collapseLabel ?? 'Collapse panel'}
            title={collapseLabel ?? 'Collapse panel'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onToggleCollapse?.()
            }}
          >
            {collapsed ? '▸' : '▾'}
          </button>
          <button
            className="dockPanelHeaderButton"
            type="button"
            aria-label={closeLabel ?? 'Close panel'}
            title={closeLabel ?? 'Close panel'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onClose?.()
            }}
          >
            ✕
          </button>
        </div>
      </header>
      {/* Тело панели скрываем, когда она свёрнута. */}
      {!collapsed ? <div className="dockPanelBody">{children}</div> : null}
    </section>
  )
}
