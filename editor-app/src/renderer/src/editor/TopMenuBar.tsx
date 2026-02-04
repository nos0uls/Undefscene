import { useEffect, useMemo, useRef, useState } from 'react'

export type PanelMenuItem = {
  // ID панели, например "panel.actions".
  id: string

  // Название, которое мы показываем пользователю.
  label: string
}

type MenuItem = {
  id: string
  label: string
  entries: { id: string; label: string; shortcut?: string; onSelect?: () => void }[]
}

export type TopMenuBarProps = {
  // Список панелей для меню "Panels".
  panels: PanelMenuItem[]

  // Проверка, показана ли панель сейчас.
  isPanelVisible: (panelId: string) => boolean

  // Переключение видимости панели.
  togglePanel: (panelId: string) => void
}

// Верхняя панель меню, как в классических desktop IDE.
// Меню раскрывается по наведению мыши (hover).
export function TopMenuBar(props: TopMenuBarProps): React.JSX.Element {
  const { panels, isPanelVisible, togglePanel } = props

  // Ссылка на весь top bar.
  // Нужна, чтобы мы могли определить "кликнули снаружи" или нет.
  const barRef = useRef<HTMLDivElement | null>(null)

  const menus = useMemo<MenuItem[]>(() => {
    const panelsMenu: MenuItem = {
      id: 'panels',
      label: 'Panels',
      entries: panels.map((p) => {
        const visible = isPanelVisible(p.id)
        return {
          id: p.id,
          label: `${visible ? '✓ ' : ''}${p.label}`,
          onSelect: () => togglePanel(p.id)
        }
      })
    }

    return [
      {
        id: 'file',
        label: 'File',
        entries: [
          { id: 'openProject', label: 'Open Project...', shortcut: 'Ctrl+O' },
          { id: 'save', label: 'Save', shortcut: 'Ctrl+S' },
          { id: 'saveAs', label: 'Save As...' },
          { id: 'exit', label: 'Exit' }
        ]
      },
      {
        id: 'edit',
        label: 'Edit',
        entries: [
          { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z' },
          { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Y' }
        ]
      },
      {
        id: 'view',
        label: 'View',
        entries: [
          { id: 'resetLayout', label: 'Reset Layout' },
          { id: 'toggleLogs', label: 'Toggle Logs' }
        ]
      },
      panelsMenu,
      {
        id: 'help',
        label: 'Help',
        entries: [{ id: 'about', label: 'About' }]
      }
    ]
  }, [isPanelVisible, panels, togglePanel])

  // Какая вкладка сейчас “раскрыта”.
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)

  useEffect(() => {
    if (!activeMenuId) return

    // Закрываем меню только когда пользователь кликнул снаружи.
    // Уход курсора (mouseleave) меню не закрывает.
    const onPointerDownCapture = (ev: PointerEvent) => {
      const el = barRef.current
      if (!el) return
      if (el.contains(ev.target as Node)) return
      setActiveMenuId(null)
    }

    document.addEventListener('pointerdown', onPointerDownCapture, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDownCapture, true)
    }
  }, [activeMenuId])

  return (
    <div className="topMenuBar" ref={barRef}>
      <div className="topMenuBarLeft">
        {menus.map((m) => (
          <div
            key={m.id}
            className={['topMenuBarItem', activeMenuId === m.id ? 'isActive' : ''].join(' ')}
            onMouseEnter={() => setActiveMenuId(m.id)}
          >
            <span className="topMenuBarItemLabel">{m.label}</span>
            {activeMenuId === m.id && (
              <div className="topMenuDropdown" role="menu">
                {m.entries.map((e) => (
                  <div
                    key={e.id}
                    className="topMenuDropdownItem"
                    role="menuitem"
                    onClick={() => e.onSelect?.()}
                  >
                    <span className="topMenuDropdownLabel">{e.label}</span>
                    {e.shortcut ? <span className="topMenuDropdownShortcut">{e.shortcut}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="topMenuBarRight">
        <div className="topMenuHint">Ctrl+S Save</div>
        <div className="topMenuHint">Ctrl+Z Undo</div>
      </div>
    </div>
  )
}
