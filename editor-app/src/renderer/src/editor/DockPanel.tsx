import type { CSSProperties, PropsWithChildren } from 'react'

export type DockPanelProps = PropsWithChildren<{
  // Заголовок, который показывается в шапке панели.
  title: string

  // Доп. CSS-класс, если нужно.
  className?: string

  // Инлайновые стили. Нужно, например, чтобы задавать размер в сплите.
  style?: CSSProperties
}>

// Простая базовая панель для доков.
// Позже мы добавим сюда drag-start на шапке и контекстное меню.
export function DockPanel(props: DockPanelProps): React.JSX.Element {
  const { title, className, style, children } = props

  return (
    <section className={['dockPanel', className].filter(Boolean).join(' ')} style={style}>
      <header className="dockPanelHeader">
        <div className="dockPanelTitle">{title}</div>
        <button className="dockPanelMenuButton" type="button" aria-label="panel menu">
          ▾
        </button>
      </header>
      <div className="dockPanelBody">{children}</div>
    </section>
  )
}
