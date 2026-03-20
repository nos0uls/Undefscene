import { Undo2, Redo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createTranslator, type SupportedLanguage } from '../i18n'
import type { EditorKeybindings } from './usePreferences'
import { formatComboForDisplay } from './useHotkeys'

export type PanelMenuItem = {
  // ID панели, например "panel.actions".
  id: string

  // Название, которое мы показываем пользователю.
  label: string
}

type MenuItem = {
  id: string
  label: string
  entries: Array<{
    id: string
    label: string
    shortcut?: string
    onSelect?: () => void
    children?: Array<{ id: string; label: string; shortcut?: string; onSelect?: () => void }>
  }>
}

export type TopMenuBarProps = {
  // Список панелей для меню "Panels".
  panels: PanelMenuItem[]

  // Проверка, показана ли панель сейчас.
  isPanelVisible: (panelId: string) => boolean

  // Переключение видимости панели.
  togglePanel: (panelId: string) => void

  // Открытие GameMaker проекта (.yyp).
  onOpenProject: () => void

  // Экспорт катсцены в JSON для движка.
  onExport: () => void

  // Операции с файлом сцены.
  onNew: () => void
  onCreateExample: () => void
  onOpenScene: () => void
  onSave: () => void
  onSaveAs: () => void

  // Edit.
  onUndo: () => void
  onRedo: () => void

  // View.
  onResetLayout: () => void
  onOpenVisualEditing: () => void

  // Help.
  onAbout: () => void
  onCheckUpdates?: () => void
  onToggleRuntimeJson?: () => void
  runtimeJsonVisible?: boolean
  onCopyLogToClipboard?: () => void
  onOpenDevTools?: () => void
  onToggleHardwareAcceleration?: () => void
  onChooseScreenshotOutputDir?: () => void
  onToggleVisualEditorTechMode?: () => void
  visualEditorTechModeEnabled?: boolean
  hardwareAccelerationDisabled?: boolean

  // Выход.
  onExit: () => void

  // Настройки.
  onPreferences: () => void

  // Текущий язык интерфейса.
  language: SupportedLanguage

  // Актуальные сочетания клавиш из preferences.
  keybindings: EditorKeybindings
}

// Верхняя панель меню, как в классических desktop IDE.
// Меню раскрывается по наведению мыши (hover).
export function TopMenuBar(props: TopMenuBarProps): React.JSX.Element {
  const {
    panels,
    isPanelVisible,
    togglePanel,
    onOpenProject,
    onExport,
    onNew,
    onCreateExample,
    onOpenScene,
    onSave,
    onSaveAs,
    onUndo,
    onRedo,
    onResetLayout,
    onOpenVisualEditing,
    onAbout,
    onCheckUpdates,
    onToggleRuntimeJson,
    runtimeJsonVisible,
    onCopyLogToClipboard,
    onOpenDevTools,
    onToggleHardwareAcceleration,
    onChooseScreenshotOutputDir,
    onToggleVisualEditorTechMode,
    visualEditorTechModeEnabled,
    hardwareAccelerationDisabled,
    onExit,
    onPreferences,
    language,
    keybindings
  } = props

  // Лёгкий translator для подписей меню.
  const t = useMemo(() => createTranslator(language), [language])

  // Shortcut-строки берём из реальных настроек,
  // чтобы меню сразу отражало rebinding из Preferences.
  const shortcutLabels = useMemo(
    () => ({
      new_scene: keybindings.new_scene ? formatComboForDisplay(keybindings.new_scene, '') : '',
      save: keybindings.save ? formatComboForDisplay(keybindings.save, '') : '',
      export_scene: keybindings.export_scene ? formatComboForDisplay(keybindings.export_scene, '') : '',
      undo: keybindings.undo ? formatComboForDisplay(keybindings.undo, '') : '',
      redo: keybindings.redo ? formatComboForDisplay(keybindings.redo, '') : ''
    }),
    [keybindings]
  )

  // Удобно собирать title без лишнего "(Unassigned)".
  const withOptionalShortcut = (label: string, shortcut: string): string =>
    shortcut ? `${label} (${shortcut})` : label

  // Ссылка на весь top bar.
  // Нужна, чтобы мы могли определить "кликнули снаружи" или нет.
  const barRef = useRef<HTMLDivElement | null>(null)

  const menus = useMemo<MenuItem[]>(() => {
    // В Help выносим технические вещи в отдельный Advanced,
    // чтобы базовое меню не разрасталось и было чище для обычного пользователя.
    const advancedEntries = [
      ...(onToggleRuntimeJson
        ? [
            {
              id: 'toggleRuntimeJson',
              label: `${runtimeJsonVisible ? '✓ ' : ''}${t('menu.showRuntimeJson', 'Show Runtime JSON')}`,
              onSelect: onToggleRuntimeJson
            }
          ]
        : []),
      ...(onOpenDevTools
        ? [{ id: 'openDevTools', label: t('menu.openDevTools', 'Open DevTools'), onSelect: onOpenDevTools }]
        : []),
      ...(onToggleHardwareAcceleration
        ? [
            {
              id: 'toggleHardwareAcceleration',
              label: `${hardwareAccelerationDisabled ? '✓ ' : ''}${t('menu.disableHardwareAcceleration', 'Disable Hardware Acceleration')}`,
              onSelect: onToggleHardwareAcceleration
            }
          ]
        : []),
      ...(onChooseScreenshotOutputDir
        ? [
            {
              id: 'chooseScreenshotOutputDir',
              label: t('menu.chooseScreenshotOutputDir', 'Choose Screenshot Output Folder...'),
              onSelect: onChooseScreenshotOutputDir
            }
          ]
        : []),
      ...(onToggleVisualEditorTechMode
        ? [
            {
              id: 'toggleVisualEditorTechMode',
              label: `${visualEditorTechModeEnabled ? '✓ ' : ''}${t('menu.visualEditorTechMode', 'Visual Editing Tech Mode')}`,
              onSelect: onToggleVisualEditorTechMode
            }
          ]
        : [])
    ]

    const panelsMenu: MenuItem = {
      id: 'panels',
      label: t('menu.panels', 'Panels'),
      entries: panels
        .filter((p) => p.id !== 'panel.runtime_json')
        .map((p) => {
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
        label: t('menu.file', 'File'),
        entries: [
          { id: 'new', label: t('menu.newScene', 'New Scene'), shortcut: shortcutLabels.new_scene, onSelect: onNew },
          {
            id: 'createExample',
            label: t('menu.createExample', 'Create Example'),
            onSelect: onCreateExample
          },
          { id: 'openScene', label: t('menu.openScene', 'Open Scene...'), onSelect: onOpenScene },
          // Открываем .yyp и подгружаем ресурсы.
          {
            id: 'openProject',
            label: t('menu.openProject', 'Open Project (.yyp)...'),
            shortcut: 'Ctrl+O',
            onSelect: onOpenProject
          },
          { id: 'save', label: t('menu.save', 'Save'), shortcut: shortcutLabels.save, onSelect: onSave },
          { id: 'saveAs', label: t('menu.saveAs', 'Save As...'), onSelect: onSaveAs },
          // Экспорт графа в JSON для движка.
          { id: 'export', label: t('menu.export', 'Export to Game...'), shortcut: shortcutLabels.export_scene, onSelect: onExport },
          { id: 'preferences', label: `${t('app.preferences', 'Preferences')}...`, onSelect: onPreferences },
          { id: 'exit', label: t('menu.exit', 'Exit'), onSelect: onExit }
        ]
      },
      {
        id: 'edit',
        label: t('menu.edit', 'Edit'),
        entries: [
          { id: 'undo', label: t('menu.undo', 'Undo'), shortcut: shortcutLabels.undo, onSelect: onUndo },
          { id: 'redo', label: t('menu.redo', 'Redo'), shortcut: shortcutLabels.redo, onSelect: onRedo }
        ]
      },
      {
        id: 'view',
        label: t('menu.view', 'View'),
        entries: [
          { id: 'resetLayout', label: t('menu.resetLayout', 'Reset Layout'), onSelect: onResetLayout },
          {
            id: 'visualEditing',
            label: t('menu.visualEditing', 'Visual Editing'),
            onSelect: onOpenVisualEditing
          }
        ]
      },
      panelsMenu,
      {
        id: 'help',
        label: t('menu.help', 'Help'),
        entries: [
          ...(onCopyLogToClipboard
            ? [{ id: 'copyLogToClipboard', label: t('menu.copyLogToClipboard', 'Copy Log to Clipboard'), onSelect: onCopyLogToClipboard }]
            : []),
          ...(advancedEntries.length > 0
            ? [{ id: 'advanced', label: t('menu.advanced', 'Advanced'), children: advancedEntries }]
            : []),
          ...(onCheckUpdates
            ? [{ id: 'checkUpdates', label: t('menu.checkForUpdates', 'Check for Updates...'), onSelect: onCheckUpdates }]
            : []),
          { id: 'about', label: t('menu.aboutAction', 'About'), onSelect: onAbout }
        ]
      }
    ]
  }, [
    t,
    shortcutLabels,
    isPanelVisible,
    panels,
    togglePanel,
    onNew,
    onCreateExample,
    onOpenScene,
    onOpenProject,
    onSave,
    onSaveAs,
    onExport,
    onPreferences,
    onExit,
    onUndo,
    onRedo,
    onResetLayout,
    onOpenVisualEditing,
    onCheckUpdates,
    onToggleRuntimeJson,
    runtimeJsonVisible,
    onCopyLogToClipboard,
    onOpenDevTools,
    onToggleHardwareAcceleration,
    onChooseScreenshotOutputDir,
    onToggleVisualEditorTechMode,
    visualEditorTechModeEnabled,
    hardwareAccelerationDisabled,
    onAbout
  ])

  // Какая вкладка сейчас “раскрыта”.
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)

  useEffect(() => {
    if (!activeMenuId) return

    // Закрываем меню только когда пользователь кликнул снаружи.
    // Уход курсора (mouseleave) меню не закрывает.
    const onPointerDownCapture = (ev: PointerEvent): void => {
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
                    className={['topMenuDropdownItem', e.children?.length ? 'hasSubmenu' : '']
                      .filter(Boolean)
                      .join(' ')}
                    role="menuitem"
                    onClick={() => {
                      if (e.children?.length) return
                      e.onSelect?.()
                      setActiveMenuId(null)
                    }}
                  >
                    <span className="topMenuDropdownLabel">{e.label}</span>
                    {e.children?.length ? (
                      <span className="topMenuDropdownShortcut">›</span>
                    ) : e.shortcut ? (
                      <span className="topMenuDropdownShortcut">{e.shortcut}</span>
                    ) : null}

                    {e.children?.length ? (
                      <div className="topMenuDropdown topMenuDropdownSubmenu" role="menu">
                        {e.children.map((child) => (
                          <div
                            key={child.id}
                            className="topMenuDropdownItem"
                            role="menuitem"
                            onClick={() => {
                              child.onSelect?.()
                              setActiveMenuId(null)
                            }}
                          >
                            <span className="topMenuDropdownLabel">{child.label}</span>
                            {child.shortcut ? (
                              <span className="topMenuDropdownShortcut">{child.shortcut}</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="topMenuBarRight">
        <button
          className="topMenuBarIconButton"
          type="button"
          onClick={onUndo}
          title={withOptionalShortcut(t('menu.undo', 'Undo'), shortcutLabels.undo)}
        >
          <Undo2 size={14} />
        </button>
        <button
          className="topMenuBarIconButton"
          type="button"
          onClick={onRedo}
          title={withOptionalShortcut(t('menu.redo', 'Redo'), shortcutLabels.redo)}
        >
          <Redo2 size={14} />
        </button>
      </div>
    </div>
  )
}
