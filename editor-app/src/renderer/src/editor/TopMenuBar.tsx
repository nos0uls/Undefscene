import { Undo2, Redo2 } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  canUndo?: boolean
  canRedo?: boolean

  // View.
  onResetLayout: () => void
  onOpenVisualEditing: () => void

  // Help.
  onAbout: () => void
  onTutorial?: () => void
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
  onCleanupDevData?: () => void
  onResetSeverityOverrides?: () => void

  // Настройки.
  onPreferences: () => void

  // Текущий язык интерфейса.
  language: SupportedLanguage

  // Актуальные сочетания клавиш из preferences.
  keybindings: EditorKeybindings

  // Показать индикатор успешного сохранения.
  showSavedIndicator?: boolean
}

// Верхняя панель меню, как в классических desktop IDE.
function TopMenuBarInner(props: TopMenuBarProps): React.JSX.Element {
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
    canUndo,
    canRedo,
    onResetLayout,
    onOpenVisualEditing,
    onAbout,
    onTutorial,
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
    onCleanupDevData,
    onResetSeverityOverrides,
    onExit,
    onPreferences,
    language,
    keybindings,
    showSavedIndicator
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
        : []),
      ...(onCleanupDevData
        ? [
            {
              id: 'cleanupDevData',
              label: t('menu.cleanupDevData', 'Cleanup Dev Data (Reset Editor)'),
              onSelect: onCleanupDevData
            }
          ]
        : []),
      ...(onResetSeverityOverrides
        ? [
            {
              id: 'resetSeverityOverrides',
              label: t('menu.resetSeverityOverrides', 'Reset Severity Overrides'),
              onSelect: onResetSeverityOverrides
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
          { id: 'about', label: t('menu.aboutAction', 'About'), onSelect: onAbout },
          { id: 'tutorial', label: t('menu.tutorial', 'Tutorial'), onSelect: onTutorial }
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
    onAbout,
    onTutorial
  ])

  // Какая вкладка сейчас “раскрыта”.
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  // Открытый submenu (id item внутри activeMenuId).
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null)
  // Текущий focused item внутри открытого меню / submenu.
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
  // Ref для измерения позиции trigger'а меню — нужен для portal с position:fixed.
  const menuItemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  // Ref для измерения позиции dropdown item (submenu trigger).
  const dropdownItemRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Закрываем submenu при смене active top-level меню.
  useEffect(() => {
    setOpenSubmenuId(null)
    if (activeMenuId) {
      const menu = menus.find((m) => m.id === activeMenuId)
      setFocusedItemId(menu?.entries[0]?.id ?? null)
    } else {
      setFocusedItemId(null)
    }
  }, [activeMenuId, menus])

  // При открытии submenu фокусируем первый child.
  useEffect(() => {
    if (!activeMenuId || !openSubmenuId) return
    const menu = menus.find((m) => m.id === activeMenuId)
    const parent = menu?.entries.find((e) => e.id === openSubmenuId)
    setFocusedItemId(parent?.children?.[0]?.id ?? null)
  }, [openSubmenuId, activeMenuId, menus])

  // Закрытие по клику снаружи.
  useEffect(() => {
    if (!activeMenuId) return

    const onPointerDown = (ev: PointerEvent): void => {
      const barEl = barRef.current
      const target = ev.target as Node
      if (barEl && barEl.contains(target)) return
      setActiveMenuId(null)
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [activeMenuId])

  // Keyboard navigation.
  const menuStateRef = useRef({ activeMenuId, openSubmenuId, focusedItemId, menus })
  menuStateRef.current = { activeMenuId, openSubmenuId, focusedItemId, menus }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { activeMenuId, openSubmenuId, focusedItemId, menus } = menuStateRef.current
      if (!activeMenuId) return

      const menu = menus.find((m) => m.id === activeMenuId)
      if (!menu) return

      if (e.key === 'Escape') {
        e.preventDefault()
        setActiveMenuId(null)
        return
      }

      if (e.key === 'Tab') {
        e.preventDefault()
        const currentIndex = menus.findIndex((m) => m.id === activeMenuId)
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + menus.length) % menus.length
          : (currentIndex + 1) % menus.length
        setActiveMenuId(menus[nextIndex].id)
        return
      }

      const currentList = openSubmenuId
        ? (menu.entries.find((entry) => entry.id === openSubmenuId)?.children ?? [])
        : menu.entries

      if (currentList.length === 0) return

      const currentIndex = currentList.findIndex((item) => item.id === focusedItemId)

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % currentList.length : 0
        setFocusedItemId(currentList[nextIndex].id)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const nextIndex =
          currentIndex >= 0
            ? (currentIndex - 1 + currentList.length) % currentList.length
            : currentList.length - 1
        setFocusedItemId(currentList[nextIndex].id)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const focusedItem = currentList[currentIndex]
        if (!focusedItem) return

        if (!openSubmenuId) {
          const entry = menu.entries.find((en) => en.id === focusedItemId)
          if (entry?.children?.length) {
            setOpenSubmenuId(entry.id)
            return
          }
        }

        focusedItem.onSelect?.()
        setActiveMenuId(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="topMenuBar" ref={barRef}>
      <div className="topMenuBarLeft">
        {menus.map((m) => {
          const triggerEl = menuItemRefs.current.get(m.id)
          const rect = triggerEl?.getBoundingClientRect()
          return (
            <div
              key={m.id}
              ref={(el) => {
                if (el) menuItemRefs.current.set(m.id, el)
                else menuItemRefs.current.delete(m.id)
              }}
              className={['topMenuBarItem', activeMenuId === m.id ? 'isActive' : ''].join(' ')}
              onMouseEnter={() => setActiveMenuId(m.id)}
              onClick={() => setActiveMenuId((prev) => (prev === m.id ? null : m.id))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setActiveMenuId((prev) => (prev === m.id ? null : m.id))
                }
              }}
              aria-expanded={activeMenuId === m.id}
              role="button"
              tabIndex={0}
            >
              <span className="topMenuBarItemLabel">{m.label}</span>
              {activeMenuId === m.id && rect &&
                createPortal(
                  <div
                    className="topMenuDropdown"
                    role="menu"
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{ position: 'fixed', top: rect.bottom, left: rect.left }}
                  >
                    {m.entries.map((e) => {
                      const itemEl = dropdownItemRefs.current.get(e.id)
                      const itemRect = itemEl?.getBoundingClientRect()
                      const SUBMENU_WIDTH = 200
                      const submenuStyle: React.CSSProperties | undefined = itemRect
                        ? {
                            position: 'fixed',
                            top: itemRect.top - 4,
                            left: Math.min(itemRect.right, window.innerWidth - SUBMENU_WIDTH)
                          }
                        : undefined

                      return (
                        <div
                          key={e.id}
                          ref={(el) => {
                            if (el) dropdownItemRefs.current.set(e.id, el)
                            else dropdownItemRefs.current.delete(e.id)
                          }}
                          className={[
                            'topMenuDropdownItem',
                            e.children?.length ? 'hasSubmenu' : '',
                            focusedItemId === e.id || openSubmenuId === e.id ? 'isFocused' : ''
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          role="menuitem"
                          onMouseEnter={() => {
                            setFocusedItemId(e.id)
                            if (e.children?.length) {
                              setOpenSubmenuId(e.id)
                            } else {
                              setOpenSubmenuId(null)
                            }
                          }}
                          onClick={() => {
                            if (e.children?.length) {
                              setOpenSubmenuId((prev) => (prev === e.id ? null : e.id))
                              return
                            }
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

                          {openSubmenuId === e.id && e.children?.length ? (
                            <div
                              className="topMenuDropdown topMenuDropdownSubmenu"
                              role="menu"
                              style={submenuStyle}
                            >
                              {e.children.map((child) => (
                                <div
                                  key={child.id}
                                  className={[
                                    'topMenuDropdownItem',
                                    focusedItemId === child.id ? 'isFocused' : ''
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                  role="menuitem"
                                  onMouseEnter={() => setFocusedItemId(child.id)}
                                  onClick={(event) => {
                                    event.stopPropagation()
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
                      )
                    })}
                  </div>,
                  document.body
                )}
            </div>
          )
        })}
      </div>

      <div className="topMenuBarRight">
        {showSavedIndicator && (
          <div
            className="topMenuBarSavedIndicator"
            style={{
              fontSize: 10,
              color: 'var(--ev-c-green)',
              marginRight: 12,
              fontWeight: 600,
              opacity: 0.8,
              pointerEvents: 'none',
              userSelect: 'none',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
          >
            {t('app.saved', 'Saved')}
          </div>
        )}
        <button
          className="topMenuBarIconButton"
          type="button"
          onClick={onUndo}
          disabled={canUndo === false}
          title={withOptionalShortcut(t('menu.undo', 'Undo'), shortcutLabels.undo)}
        >
          <Undo2 size={14} />
        </button>
        <button
          className="topMenuBarIconButton"
          type="button"
          onClick={onRedo}
          disabled={canRedo === false}
          title={withOptionalShortcut(t('menu.redo', 'Redo'), shortcutLabels.redo)}
        >
          <Redo2 size={14} />
        </button>
      </div>
    </div>
  )
}

export const TopMenuBar = memo(TopMenuBarInner)
