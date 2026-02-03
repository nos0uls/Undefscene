import { useMemo, useState } from 'react'

type MenuItem = {
  id: string
  label: string
  entries: { id: string; label: string; shortcut?: string }[]
}

// Верхняя панель меню, как в классических desktop IDE.
// Меню раскрывается по наведению мыши (hover).
export function TopMenuBar(): React.JSX.Element {
  const menus = useMemo<MenuItem[]>(
    () => [
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
      {
        id: 'help',
        label: 'Help',
        entries: [{ id: 'about', label: 'About' }]
      }
    ],
    []
  )

  // Какая вкладка сейчас “раскрыта”.
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)

  return (
    <div className="topMenuBar" onMouseLeave={() => setActiveMenuId(null)}>
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
                  <div key={e.id} className="topMenuDropdownItem" role="menuitem">
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
